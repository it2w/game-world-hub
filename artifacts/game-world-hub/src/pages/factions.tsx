import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Flame, Users, Star, Shield, Clock, ChevronRight, ChevronDown, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier-badge";

interface RosterMember {
  userId: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isPro: boolean;
  joinedAt: string;
}

interface RosterState {
  factionId: number;
  factionName: string;
  factionColor: string;
  factionEmoji: string;
}

function FactionRosterModal({ roster, onClose }: { roster: RosterState; onClose: () => void }) {
  const { t } = useTranslation("factions");
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const data = await customFetch(`/api/factions/${roster.factionId}/members?limit=20&offset=${off}`) as { total: number; members: RosterMember[] };
      setTotal(data.total);
      setMembers(prev => off === 0 ? data.members : [...prev, ...data.members]);
      setOffset(off + data.members.length);
    } finally {
      setLoading(false);
    }
  }, [roster.factionId]);

  useEffect(() => { void loadPage(0); }, [loadPage]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasMore = members.length < total;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-background border flex flex-col"
        style={{ borderColor: `${roster.factionColor}55`, maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: `${roster.factionColor}33` }}
        >
          <h2 className="font-mono font-bold text-sm uppercase tracking-widest" style={{ color: roster.factionColor }}>
            {roster.factionEmoji} {t("roster.title", { name: roster.factionName })}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Member list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/40">
          {members.map(m => (
            <a
              key={m.userId}
              href={`/profile/${m.username}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
              onClick={onClose}
            >
              <div
                className="w-8 h-8 shrink-0 overflow-hidden flex items-center justify-center text-xs font-mono bg-muted"
                style={{ color: roster.factionColor }}
              >
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                  : <span>{m.displayName[0]?.toUpperCase() ?? "?"}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm truncate">{m.displayName}</span>
                  {m.isPro && <TierBadge isPro size="sm" />}
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">@{m.username}</p>
              </div>
              <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                {new Date(m.joinedAt).toLocaleDateString()}
              </span>
            </a>
          ))}
          {loading && (
            <div className="p-4 text-center font-mono text-xs text-muted-foreground animate-pulse">…</div>
          )}
          {!loading && members.length === 0 && (
            <div className="p-8 text-center font-mono text-xs text-muted-foreground">{t("roster.empty")}</div>
          )}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div className="p-3 border-t shrink-0" style={{ borderColor: `${roster.factionColor}33` }}>
            <Button
              size="sm"
              variant="outline"
              className="w-full font-mono text-xs rounded-none"
              style={{ borderColor: `${roster.factionColor}55`, color: roster.factionColor }}
              onClick={() => void loadPage(offset)}
            >
              {t("roster.loadMore", { n: total - members.length })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

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

interface TopContributor {
  rank: number;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  weeklyPoints: number;
}

interface WeeklyTopResponse {
  faction: { id: number; name: string; slug: string; color: string; iconEmoji: string };
  contributors: TopContributor[];
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

function ContributorAvatar({ avatarUrl, username, color }: { avatarUrl: string | null; username: string; color: string }) {
  const initials = username.slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        className="w-7 h-7 object-cover shrink-0"
        style={{ border: `1px solid ${color}44` }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div
      className="w-7 h-7 shrink-0 flex items-center justify-center font-mono text-[10px] font-bold"
      style={{ backgroundColor: `${color}22`, border: `1px solid ${color}44`, color }}
    >
      {initials}
    </div>
  );
}

function FactionTopContributors({ factionId, color }: { factionId: number; color: string }) {
  const { data, isLoading } = useQuery<WeeklyTopResponse>({
    queryKey: ["faction-weekly-top", factionId],
    queryFn: () => customFetch(`/api/factions/${factionId}/weekly-top?limit=5`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const contributors = data?.contributors ?? [];

  if (contributors.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground py-2">
        No activity this week yet.
      </p>
    );
  }

  const rankMedals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-1 pt-1">
      {contributors.map((c) => (
        <Link key={c.userId} href={`/profile/${c.username}`}>
          <div
            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/60 transition-colors cursor-pointer group"
          >
            {/* Rank medal / number */}
            <span className="font-mono text-xs w-5 text-center shrink-0 text-muted-foreground">
              {rankMedals[c.rank - 1] ?? `#${c.rank}`}
            </span>

            <ContributorAvatar avatarUrl={c.avatarUrl} username={c.username} color={color} />

            <div className="min-w-0 flex-1">
              <span
                className="font-mono text-xs font-semibold group-hover:underline truncate block"
                style={{ color }}
              >
                {c.displayName || c.username}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">@{c.username}</span>
            </div>

            <div className="shrink-0 text-right">
              <span className="font-mono text-xs font-bold" style={{ color }}>
                {c.weeklyPoints.toLocaleString()}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground block">pts</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function FactionsPage() {
  const { t } = useTranslation("factions");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const [joining, setJoining] = useState<number | null>(null);
  const [rosterOpen, setRosterOpen] = useState<RosterState | null>(null);
  const [expandedFactions, setExpandedFactions] = useState<Set<number>>(new Set());

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

  function toggleExpanded(factionId: number) {
    setExpandedFactions(prev => {
      const next = new Set(prev);
      if (next.has(factionId)) next.delete(factionId);
      else next.add(factionId);
      return next;
    });
  }

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
            const isExpanded = expandedFactions.has(faction.id);

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
                      <button
                        className="font-mono text-[10px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => setRosterOpen({ factionId: faction.id, factionName: faction.name, factionColor: faction.color, factionEmoji: faction.icon_emoji })}
                      >
                        <Users className="w-3 h-3" /> {faction.member_count} {t("war.members")}
                      </button>
                      <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: faction.color }}>
                        <Star className="w-3 h-3" /> {faction.active_members} {t("war.activeMembers")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top contributors toggle */}
                <div className="border-t pt-3" style={{ borderColor: `${faction.color}22` }}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(faction.id)}
                    className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest hover:opacity-80 transition-opacity"
                    style={{ color: faction.color }}
                  >
                    <Trophy className="w-3 h-3" />
                    Top Contributors This Week
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 ml-0.5" />
                      : <ChevronRight className="w-3 h-3 ml-0.5" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="mt-2">
                      <FactionTopContributors factionId={faction.id} color={faction.color} />
                    </div>
                  )}
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

      {/* Member roster modal */}
      {rosterOpen && (
        <FactionRosterModal
          roster={rosterOpen}
          onClose={() => setRosterOpen(null)}
        />
      )}
    </div>
  );
}

export { FactionBadge };
