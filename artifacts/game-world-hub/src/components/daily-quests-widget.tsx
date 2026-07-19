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

interface DailyStreakInfo {
  current: number;
  longest: number;
  shieldCount: number;
  bonusXp: number;
}

interface DailyQuestsData {
  date: string;
  quests: DailyQuest[];
  streak: DailyStreakInfo;
}

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

export function DailyQuestsWidget({ me }: { me?: any }) {
  const { t, i18n } = useTranslation("quests");
  const rtl = i18n.language?.startsWith("ar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confettiKey, setConfettiKey] = useState<string | null>(null);

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
        setConfettiKey(key);
        setTimeout(() => setConfettiKey(null), 2000);
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

  return (
    <div className="quest-widget">
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
              <span
                className="quest-streak-stat__val"
                style={{ color: "#A855F7" }}
              >
                🛡️ {streak.shieldCount}
              </span>
              <span className="quest-streak-stat__lbl">
                {t("streak.shieldTitle")}
              </span>
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
      )}
    </div>
  );
}
