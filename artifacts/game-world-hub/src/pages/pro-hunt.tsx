import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { Trophy, Zap, CheckCircle2, Clock, Crown, Mic, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useVoice } from "@/voice/voice-context";

// ── Countdown to end-of-month ──────────────────────────────────────────────────
function useMonthCountdown(endsAt: string | undefined) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining("00:00:00"); return; }
      const d  = Math.floor(ms / 86400000);
      const h  = Math.floor((ms % 86400000) / 3600000);
      const m  = Math.floor((ms % 3600000) / 60000);
      const s  = Math.floor((ms % 60000) / 1000);
      setRemaining(`${d}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

// ── Challenge icons by key ─────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  lfg_post_20:    "📡",
  lfg_respond_30: "✋",
  msg_send_100:   "💬",
  lfg_receive_20: "📥",
  lfg_close_5:    "✅",
};

interface Challenge {
  key: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  target: number;
  progress: number;
  completed: boolean;
}

interface ProHuntData {
  monthYear: string;
  endsAt: string;
  challenges: Challenge[];
  allCompleted: boolean;
  proGranted: boolean;
}

interface VipLoungeData {
  room: string;
  name: string;
  participantCount: number;
  canJoin: boolean;
}

export default function ProHunt() {
  const { t, i18n } = useTranslation("proHunt");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { joinVipLounge } = useVoice();

  const { data, isLoading } = useQuery<ProHuntData>({
    queryKey: ["pro-hunt"],
    queryFn: () => customFetch("/api/pro-hunt"),
    refetchInterval: 60_000,
  });

  const { data: vip, refetch: refetchVip } = useQuery<VipLoungeData>({
    queryKey: ["pro-hunt-vip"],
    queryFn: () => customFetch("/api/pro-hunt/vip-lounge"),
    refetchInterval: 30_000,
  });

  const countdown = useMonthCountdown(data?.endsAt);

  const claim = useMutation({
    mutationFn: () => customFetch("/api/pro-hunt/claim", { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("claim.success") });
      qc.invalidateQueries({ queryKey: ["pro-hunt"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => {
      toast({ title: t("claim.error"), description: e?.data?.error, variant: "destructive" });
    },
  });

  const handleJoinLounge = async () => {
    try {
      await joinVipLounge();
      await refetchVip();
    } catch {
      toast({ title: t("vip.joinError"), variant: "destructive" });
    }
  };

  const completedCount = data?.challenges.filter(c => c.completed).length ?? 0;
  const totalCount = data?.challenges.length ?? 5;
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-black font-mono tracking-tighter uppercase flex items-center gap-3">
          <Trophy className="w-7 h-7 text-yellow-400" />
          {t("header.title")}
        </h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.subtitle")}</p>
      </div>

      {/* ── Reward Banner ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border border-yellow-400/40 bg-card p-5">
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,215,0,0.03) 3px,rgba(255,215,0,0.03) 4px)" }} />
        <div className="flex items-center gap-4 relative">
          <div className="w-12 h-12 rounded-sm bg-yellow-400/10 border border-yellow-400/40 flex items-center justify-center shrink-0">
            <Crown className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="font-mono font-black text-sm uppercase tracking-widest text-yellow-400">{t("reward.title")}</p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">{t("reward.desc")}</p>
          </div>
          {countdown && (
            <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{countdown}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Overall Progress ──────────────────────────────────────────────── */}
      {data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span className="uppercase tracking-widest">{t("progress.overall", { done: completedCount, total: totalCount })}</span>
            <span>{overallPct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-none overflow-hidden">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${overallPct}%`,
                background: overallPct === 100
                  ? "linear-gradient(90deg,#FFD700,#F97316)"
                  : "linear-gradient(90deg,hsl(var(--primary)),hsl(var(--primary)/0.7))",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Challenge Cards ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-24 bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.challenges ?? []).map((c) => {
            const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
            const title = isAr ? c.titleAr : c.titleEn;
            const desc  = isAr ? c.descAr  : c.descEn;
            return (
              <div
                key={c.key}
                className={`border p-4 bg-card transition-colors ${
                  c.completed
                    ? "border-yellow-400/50 bg-yellow-400/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0 w-9 h-9 flex items-center justify-center bg-muted border border-border">
                    {c.completed
                      ? <CheckCircle2 className="w-5 h-5 text-yellow-400" />
                      : ICONS[c.key] ?? "🎯"}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono font-bold text-sm ${c.completed ? "text-yellow-400" : "text-foreground"}`}>
                        {title}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {c.progress} / {c.target}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{desc}</p>
                    <div className="h-1.5 bg-muted rounded-none overflow-hidden">
                      <div
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: c.completed
                            ? "linear-gradient(90deg,#FFD700,#F97316)"
                            : "hsl(var(--primary))",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Claim Button ──────────────────────────────────────────────────── */}
      {data?.allCompleted && !data.proGranted && (
        <Button
          className="w-full font-mono rounded-none h-12 text-sm uppercase tracking-widest border border-yellow-400/50 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20"
          onClick={() => claim.mutate()}
          disabled={claim.isPending}
        >
          <Crown className="w-4 h-4 me-2" />
          {claim.isPending ? t("claim.claiming") : t("claim.button")}
        </Button>
      )}
      {data?.proGranted && (
        <div className="border border-yellow-400/40 bg-yellow-400/5 p-4 text-center font-mono text-sm text-yellow-400">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-2" />
          {t("claim.granted")}
        </div>
      )}

      {/* ── VIP Lounge Card ───────────────────────────────────────────────── */}
      <div className={`border p-5 bg-card space-y-4 ${vip?.canJoin ? "border-yellow-400/40" : "border-border"}`}>
        <div className="flex items-center gap-2 mb-1">
          <Mic className="w-4 h-4 text-yellow-400" />
          <h2 className="font-mono font-bold text-sm uppercase tracking-widest text-yellow-400">{t("vip.title")}</h2>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{t("vip.desc")}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{t("vip.participants", { count: vip?.participantCount ?? 0 })}</span>
          </div>
          {vip?.canJoin ? (
            <Button
              size="sm"
              className="font-mono rounded-none text-xs border border-yellow-400/50 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20"
              onClick={handleJoinLounge}
            >
              <Mic className="w-3 h-3 me-1" /> {t("vip.join")}
            </Button>
          ) : (
            <Link href="/pro">
              <Button size="sm" variant="outline" className="font-mono rounded-none text-xs">
                <Crown className="w-3 h-3 me-1" /> {t("vip.upgrade")}
              </Button>
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}
