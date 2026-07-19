import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Flame, Users, Star, Shield, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier-badge";

interface Faction {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon_emoji: string;
  description: string;
  weekly_points: number;
  member_count: number;
  active_members: number;
}

interface MyFaction {
  id: number;
  name: string;
  slug: string;
  color: string;
  iconEmoji: string;
  description: string;
  joinedAt: string;
}

function FactionBadge({ slug, color, emoji, name, size = "sm" }: { slug: string; color: string; emoji: string; name: string; size?: "sm" | "lg" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono uppercase tracking-widest border ${size === "lg" ? "text-xs px-3 py-1" : "text-[10px] px-2 py-0.5"}`}
      style={{ backgroundColor: `${color}22`, borderColor: `${color}55`, color }}
    >
      {emoji} {name}
    </span>
  );
}

/** Milliseconds until next Monday 00:00 UTC */
function msUntilMonday(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun,1=Mon,...6=Sat
  const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil));
  return next.getTime() - now.getTime();
}

function WarCountdown() {
  const { t } = useTranslation("factions");
  const [ms, setMs] = useState(msUntilMonday());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilMonday()), 1000);
    return () => clearInterval(id);
  }, []);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <span className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
      <Clock className="w-3 h-3" />
      {t("war.warEnds")}: {d}{t("seasons.days")} {h}{t("seasons.hours")} {m}{t("seasons.minutes")} {s}s
    </span>
  );
}

export default function FactionsPage() {
  const { t } = useTranslation("factions");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const [joining, setJoining] = useState<number | null>(null);

  const { data: factions, isLoading } = useQuery<Faction[]>({
    queryKey: ["factions"],
    queryFn: () => customFetch("/api/factions"),
    staleTime: 30_000,
  });

  const { data: myFaction, isLoading: myFactionLoading } = useQuery<MyFaction | null>({
    queryKey: ["factions-me"],
    queryFn: () => customFetch("/api/factions/me"),
    staleTime: 60_000,
    enabled: !!me,
  });

  const joinMutation = useMutation({
    mutationFn: (factionId: number) =>
      customFetch(`/api/factions/${factionId}/join`, { method: "POST" }),
    onSuccess: (data: MyFaction) => {
      toast({ title: t("war.joinSuccess", { name: data.name }) });
      qc.invalidateQueries({ queryKey: ["factions"] });
      qc.invalidateQueries({ queryKey: ["factions-me"] });
      qc.invalidateQueries({ queryKey: ["user-faction"] });
      setJoining(null);
    },
    onError: (err: { message?: string }) => {
      toast({ title: err.message ?? t("war.joinFailed"), variant: "destructive" });
      setJoining(null);
    },
  });

  const maxPoints = Math.max(...(factions?.map(f => f.weekly_points) ?? [1]), 1);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="border-b border-border pb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Flame className="w-8 h-8 text-primary" />
            {t("war.title")}
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
            {t("war.pointsBreakdown")}
          </p>
        </div>
        <WarCountdown />
      </div>

      {/* My faction badge */}
      {myFaction && (
        <div
          className="border p-4 flex items-center gap-4"
          style={{ borderColor: `${myFaction.color}44`, backgroundColor: `${myFaction.color}0a` }}
        >
          <span className="text-4xl leading-none">{myFaction.iconEmoji}</span>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("war.joined")}</p>
            <p className="font-mono font-bold text-lg" style={{ color: myFaction.color }}>{myFaction.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{myFaction.description}</p>
          </div>
        </div>
      )}

      {/* Faction War Bars */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-card border border-border animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {factions?.map((faction, idx) => {
            const isLeader = idx === 0;
            const pct = maxPoints > 0 ? Math.round((faction.weekly_points / maxPoints) * 100) : 0;
            const isMyFaction = myFaction?.id === faction.id;

            return (
              <div
                key={faction.id}
                className={`border p-5 space-y-4 transition-all ${isLeader ? "border-opacity-60" : "border-border"}`}
                style={isLeader ? { borderColor: `${faction.color}66` } : undefined}
              >
                {/* Top row: faction info + rank */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-3xl leading-none shrink-0">{faction.icon_emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-mono font-bold text-xl uppercase tracking-tight" style={{ color: faction.color }}>
                          {faction.name}
                        </h2>
                        {isLeader && (
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.5" style={{ backgroundColor: `${faction.color}33`, color: faction.color }}>
                            Leading
                          </span>
                        )}
                        {isMyFaction && (
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30">
                            ★ {t("war.joined")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 line-clamp-1">{faction.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-2xl font-bold" style={{ color: faction.color }}>
                      {faction.weekly_points.toLocaleString()}
                    </span>
                    <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{t("war.weeklyPoints")}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: faction.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">{pct}% of leader</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> {faction.member_count} {t("war.members")}
                      </span>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: faction.color }}>
                        <Star className="w-3 h-3" /> {faction.active_members} {t("war.activeMembers")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Join button — only show if no faction yet */}
                {!myFaction && !myFactionLoading && (
                  <div className="pt-1">
                    {joining === faction.id ? (
                      <div className="border p-4 space-y-3" style={{ borderColor: `${faction.color}44` }}>
                        <p className="font-mono text-sm">
                          <span className="font-bold" style={{ color: faction.color }}>{faction.name}</span>
                          {" — "}{faction.description}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{t("war.chooseDesc")}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => joinMutation.mutate(faction.id)}
                            disabled={joinMutation.isPending}
                            className="font-mono rounded-none text-xs"
                            style={{ backgroundColor: faction.color, borderColor: faction.color, color: "#fff" }}
                          >
                            {t("war.confirmJoin", { name: faction.name })}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setJoining(null)}
                            className="font-mono rounded-none text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono rounded-none text-xs gap-1.5"
                        style={{ borderColor: `${faction.color}55`, color: faction.color }}
                        onClick={() => setJoining(faction.id)}
                      >
                        <ChevronRight className="w-3 h-3" />
                        {t("war.join")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No faction call-to-action */}
      {!isLoading && !myFaction && !myFactionLoading && (
        <div className="border border-dashed border-primary/30 p-6 text-center space-y-2">
          <Shield className="w-8 h-8 text-primary/60 mx-auto" />
          <p className="font-mono text-sm font-bold">{t("war.chooseTitle")}</p>
          <p className="font-mono text-xs text-muted-foreground">{t("war.chooseDesc")}</p>
        </div>
      )}
    </div>
  );
}

export { FactionBadge };
