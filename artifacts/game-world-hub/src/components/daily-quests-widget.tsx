import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface DailyQuest {
  key: string;
  titleEn: string;
  titleAr: string;
  icon: string;
  xpReward: number;
  targetCount: number;
  progress: number;
  completed: boolean;
  completedAt: string | null;
}

interface StreakMilestone {
  days: number;
  reachedAt: string;
}

interface DailyStreakInfo {
  current: number;
  longest: number;
  shieldCount: number;
  bonusXp: number;
  milestoneHit: number | null;
  milestones: StreakMilestone[];
}

interface DailyQuestsData {
  date: string;
  quests: DailyQuest[];
  streak: DailyStreakInfo;
}

// Milestone definitions — must match server
const MILESTONE_META: Record<number, { emoji: string; labelEn: string; labelAr: string; xp: number }> = {
  7:   { emoji: "🌟", labelEn: "Week Warrior",   labelAr: "محارب الأسبوع",    xp: 200  },
  30:  { emoji: "🏅", labelEn: "Month Master",   labelAr: "سيد الشهر",        xp: 500  },
  100: { emoji: "💎", labelEn: "Century Legend", labelAr: "أسطورة المئة يوم", xp: 2000 },
};
const MILESTONE_DAYS = [7, 30, 100];

// Tiny confetti burst rendered purely in CSS via inline keyframes
const CONFETTI_COLORS = ["#22C55E","#06B6D4","#FFD700","#EC4899","#A855F7","#F97316","#38BDF8","#EF4444"];

function ConfettiBurst({ xp, title }: { xp: number; title: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {CONFETTI_COLORS.map((c, i) => (
        <div key={i} style={{
          position: "absolute",
          width: 6, height: 6,
          borderRadius: i % 2 === 0 ? "50%" : 0,
          background: c,
          animation: `confettiFly${i % 4} 1.6s ease forwards`,
          animationDelay: `${i * 60}ms`,
          left: `${20 + i * 9}%`,
          top: "50%",
        }} />
      ))}
      <span style={{
        fontFamily: "monospace", fontWeight: 900, fontSize: 13, color: "#22C55E",
        textShadow: "0 0 12px #22C55E88",
        animation: "confettiLabel 1.8s ease forwards",
      }}>
        +{xp} XP! 🎉
      </span>
      <style>{`
        @keyframes confettiFly0 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-30px,-50px) scale(0);opacity:0} }
        @keyframes confettiFly1 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(20px,-60px) scale(0);opacity:0} }
        @keyframes confettiFly2 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-10px,-70px) scale(0);opacity:0} }
        @keyframes confettiFly3 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(40px,-45px) scale(0);opacity:0} }
        @keyframes confettiLabel { 0%{opacity:0;transform:scale(0.7)} 20%{opacity:1;transform:scale(1.15)} 80%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.9)} }
      `}</style>
    </div>
  );
}

/** Full-widget milestone celebration — larger, more dramatic than quest confetti */
function MilestoneCelebration({ milestone, onDone }: { milestone: number; onDone: () => void }) {
  const ms = MILESTONE_META[milestone];
  if (!ms) return null;
  const MANY_COLORS = [...CONFETTI_COLORS, ...CONFETTI_COLORS];
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 20,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
        overflow: "hidden", cursor: "pointer",
      }}
      onClick={onDone}
    >
      {MANY_COLORS.map((c, i) => (
        <div key={i} style={{
          position: "absolute",
          width: i % 3 === 0 ? 10 : 6,
          height: i % 3 === 0 ? 10 : 6,
          borderRadius: i % 2 === 0 ? "50%" : 2,
          background: c,
          animation: `msConfetti${i % 6} 2.4s ease forwards`,
          animationDelay: `${i * 40}ms`,
          left: `${4 + i * 5.8}%`,
          top: "45%",
        }} />
      ))}
      <div style={{ textAlign: "center", zIndex: 1, animation: "msPop 2.6s ease forwards" }}>
        <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>{ms.emoji}</div>
        <div style={{
          fontFamily: "monospace", fontWeight: 900, fontSize: 18,
          color: "#FFD700", textShadow: "0 0 20px #FFD70099",
          letterSpacing: "0.05em", marginBottom: 4,
        }}>
          {ms.labelEn}
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: "#A3E635",
          textShadow: "0 0 10px #A3E63577", marginBottom: 2,
        }}>
          🔥 {milestone}-DAY STREAK MILESTONE
        </div>
        <div style={{
          fontFamily: "monospace", fontWeight: 700, fontSize: 20,
          color: "#22C55E", textShadow: "0 0 16px #22C55E88",
        }}>
          +{ms.xp} BONUS XP
        </div>
        <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 10, color: "#6B7280" }}>
          tap to dismiss
        </div>
      </div>
      <style>{`
        @keyframes msConfetti0 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-60px,-120px) rotate(360deg);opacity:0} }
        @keyframes msConfetti1 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(40px,-140px) rotate(-270deg);opacity:0} }
        @keyframes msConfetti2 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-20px,-160px) rotate(180deg);opacity:0} }
        @keyframes msConfetti3 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(80px,-100px) rotate(720deg);opacity:0} }
        @keyframes msConfetti4 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-80px,-80px) rotate(-540deg);opacity:0} }
        @keyframes msConfetti5 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(20px,-180px) rotate(300deg);opacity:0} }
        @keyframes msPop {
          0%   { opacity: 0; transform: scale(0.5) translateY(20px); }
          15%  { opacity: 1; transform: scale(1.12) translateY(-4px); }
          30%  { transform: scale(0.97) translateY(0); }
          80%  { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.9) translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

export function DailyQuestsWidget({ me }: { me?: any }) {
  const { t, i18n } = useTranslation("quests");
  const rtl = i18n.language?.startsWith("ar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confettiKey, setConfettiKey] = useState<string | null>(null);
  const [activeMilestone, setActiveMilestone] = useState<number | null>(null);

  const { data, isLoading } = useQuery<DailyQuestsData>({
    queryKey: ["daily-quests"],
    queryFn: () => customFetch("/api/quests/daily"),
    refetchInterval: 30_000,
    enabled: !!me,
  });

  const completeMutation = useMutation<any, Error, string>({
    mutationFn: (key: string) =>
      customFetch(`/api/quests/daily/${key}/complete`, { method: "POST" }),
    onSuccess: (result: any, key: string) => {
      if (result.completed) {
        // Milestone takes priority over single-quest confetti
        if (result.streak?.milestoneHit) {
          setActiveMilestone(result.streak.milestoneHit);
        } else {
          setConfettiKey(key);
          setTimeout(() => setConfettiKey(null), 2000);
        }
        toast({ title: t("toasts.questDone", { xp: result.xpEarned }) });
      }
      queryClient.invalidateQueries({ queryKey: ["daily-quests"] });
      queryClient.invalidateQueries({ queryKey: ["stats-me-dashboard"] });
    },
    onError: () =>
      toast({ title: t("toasts.error"), variant: "destructive" }),
  });

  const buyShield = useMutation({
    mutationFn: () =>
      customFetch("/api/auth/me/streak-shield/buy", { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("streak.shieldBought") });
      queryClient.invalidateQueries({ queryKey: ["daily-quests"] });
      queryClient.invalidateQueries({ queryKey: ["stats-me-dashboard"] });
    },
    onError: () =>
      toast({ title: t("streak.notEnoughXp"), variant: "destructive" }),
  });

  if (!me || isLoading) return null;

  const quests = data?.quests ?? [];
  const streak = data?.streak;
  const allDone = quests.length > 0 && quests.every((q) => q.completed);
  const questTitle = (q: DailyQuest) => (rtl ? q.titleAr : q.titleEn);
  const canBuyShield = (streak?.bonusXp ?? 0) >= 50;

  const reachedMilestoneDays = new Set((streak?.milestones ?? []).map((m) => m.days));

  return (
    <div className="quest-widget" style={{ position: "relative" }}>
      {/* ── Milestone overlay (full widget) ── */}
      {activeMilestone !== null && (
        <MilestoneCelebration
          milestone={activeMilestone}
          onDone={() => setActiveMilestone(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="quest-widget__header">
        <span className="quest-widget__title">{t("widget.title")}</span>
        {streak && streak.current > 0 && (
          <div className="quest-streak-badge">
            <span>🔥</span>
            <span className="quest-streak-num">{streak.current}</span>
            <span className="quest-streak-lbl">{t("streak.days")}</span>
          </div>
        )}
      </div>

      {/* ── Quest list ── */}
      <div className="quest-widget__list">
        {allDone ? (
          <p className="quest-all-done">{t("widget.allDone")}</p>
        ) : (
          quests.map((q) => {
            const pct = Math.min(100, (q.progress / q.targetCount) * 100);
            const busy =
              completeMutation.isPending && completeMutation.variables === q.key;
            return (
              <div
                key={q.key}
                className={`quest-item${q.completed ? " quest-item--done" : ""}`}
                style={{ position: "relative" }}
              >
                {confettiKey === q.key && (
                  <ConfettiBurst xp={q.xpReward} title={questTitle(q)} />
                )}

                <span className="quest-item__icon">{q.icon}</span>

                <div className="quest-item__body">
                  <div className="quest-item__top">
                    <span className="quest-item__name">{questTitle(q)}</span>
                    <span className="quest-item__xp">
                      {t("widget.xpReward", { xp: q.xpReward })}
                    </span>
                  </div>
                  {q.targetCount > 1 && (
                    <div className="quest-progress-bar">
                      <div
                        className="quest-progress-fill"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="quest-progress-label">
                        {t("widget.progressOf", {
                          current: q.progress,
                          target: q.targetCount,
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {q.completed ? (
                  <span className="quest-item__check">✓</span>
                ) : (
                  <button
                    type="button"
                    className="quest-complete-btn"
                    disabled={busy}
                    onClick={() => completeMutation.mutate(q.key)}
                  >
                    {t("widget.completeBtn")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Streak footer ── */}
      {streak && (
        <div className="quest-widget__footer">
          {/* Row 1: stats + shield button */}
          <div className="quest-widget__footer-row">
            <div className="quest-streak-stats">
              <div className="quest-streak-stat">
                <span className="quest-streak-stat__val" style={{ color: "#F97316" }}>
                  {streak.current}
                </span>
                <span className="quest-streak-stat__lbl">{t("streak.current")}</span>
              </div>
              <div className="quest-streak-stat">
                <span className="quest-streak-stat__val">{streak.longest}</span>
                <span className="quest-streak-stat__lbl">{t("streak.longest")}</span>
              </div>
              <div className="quest-streak-stat">
                <span className="quest-streak-stat__val" style={{ color: "#A855F7" }}>
                  🛡️ {streak.shieldCount}
                </span>
                <span className="quest-streak-stat__lbl">{t("streak.shieldTitle")}</span>
              </div>
            </div>

            <div className="quest-shield-group">
              <span className="quest-xp-label">
                {t("streak.bonusXp", { xp: streak.bonusXp })}
              </span>
              <button
                type="button"
                className="quest-shield-btn"
                disabled={buyShield.isPending || !canBuyShield}
                title={t("streak.buyShield")}
                onClick={() => buyShield.mutate()}
              >
                🛡️ {t("streak.buyShield")}
              </button>
            </div>
          </div>

          {/* Row 2: milestone badges */}
          <div className="quest-milestones">
            {MILESTONE_DAYS.map((days) => {
              const ms = MILESTONE_META[days];
              const reached = reachedMilestoneDays.has(days);
              return (
                <div
                  key={days}
                  className={`quest-milestone-badge${reached ? " quest-milestone-badge--reached" : ""}`}
                  title={reached ? t("streak.milestoneReached", { days }) : t("streak.milestoneGoal", { days })}
                >
                  <span style={{ opacity: reached ? 1 : 0.3 }}>{ms.emoji}</span>
                  <span className="quest-milestone-badge__days">
                    {days}{t("streak.daysSuffix")}
                  </span>
                  {reached && (
                    <span className="quest-milestone-badge__check">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
