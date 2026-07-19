import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import "./battle-pass.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BpTier {
  level: number;
  track: "free" | "pro";
  rewardType: "xp_boost" | "frame_color" | "title";
  rewardValue: string;
  rewardLabel: string;
  rewardIcon: string;
  unlocked: boolean;
  applied: boolean;
  accessible: boolean;
}

interface BpData {
  season: { id: number; name: string; startDate: string; endDate: string; endsInMs: number };
  currentLevel: number;
  seasonXp: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  xpToNext: number;
  maxLevel: number;
  freeMaxLevel: number;
  isPro: boolean;
  earnedTitles: string[];
  tiers: BpTier[];
  justUnlocked: Array<{ level: number; rewardType: string; rewardValue: string; rewardLabel: string; rewardIcon: string }>;
}

// ── Countdown hook ─────────────────────────────────────────────────────────────

function useCountdown(endsInMs: number) {
  const [remaining, setRemaining] = useState(endsInMs);
  const endRef = useRef(Date.now() + endsInMs);

  useEffect(() => {
    endRef.current = Date.now() + endsInMs;
    const id = setInterval(() => {
      const ms = Math.max(0, endRef.current - Date.now());
      setRemaining(ms);
      if (ms === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsInMs]);

  const totalSec = Math.floor(remaining / 1000);
  const d  = Math.floor(totalSec / 86400);
  const h  = Math.floor((totalSec % 86400) / 3600);
  const m  = Math.floor((totalSec % 3600)  / 60);
  const s  = totalSec % 60;
  return { d, h, m, s, over: remaining === 0 };
}

// ── Countdown display ──────────────────────────────────────────────────────────

function Countdown({ endsInMs }: { endsInMs: number }) {
  const { t } = useTranslation("battle-pass");
  const { d, h, m, s, over } = useCountdown(endsInMs);

  if (over) {
    return (
      <div className="bp-countdown">
        <span className="bp-countdown-label">{t("seasonOver")}</span>
      </div>
    );
  }

  return (
    <div className="bp-countdown">
      <span className="bp-countdown-label">{t("seasonEnds")}</span>
      <div className="bp-countdown-units">
        <div className="bp-cd-unit">
          <span className="bp-cd-num">{String(d).padStart(2, "0")}</span>
          <span className="bp-cd-label">{t("days")}</span>
        </div>
        <span className="bp-cd-sep">:</span>
        <div className="bp-cd-unit">
          <span className="bp-cd-num">{String(h).padStart(2, "0")}</span>
          <span className="bp-cd-label">{t("hours")}</span>
        </div>
        <span className="bp-cd-sep">:</span>
        <div className="bp-cd-unit">
          <span className="bp-cd-num">{String(m).padStart(2, "0")}</span>
          <span className="bp-cd-label">{t("minutes")}</span>
        </div>
        <span className="bp-cd-sep">:</span>
        <div className="bp-cd-unit">
          <span className="bp-cd-num">{String(s).padStart(2, "0")}</span>
          <span className="bp-cd-label">{t("seconds")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Tier card ──────────────────────────────────────────────────────────────────

function TierCard({ tier, currentLevel, isPro }: { tier: BpTier; currentLevel: number; isPro: boolean }) {
  const { t } = useTranslation("battle-pass");
  const isCurrent  = tier.level === currentLevel;
  const isLocked   = !tier.unlocked;
  const isProLocked = tier.track === "pro" && !isPro;

  let cardClass = "bp-tier";
  if (isCurrent)                      cardClass += " bp-tier--current";
  else if (tier.unlocked)             cardClass += " bp-tier--unlocked";
  else if (isProLocked)               cardClass += " bp-tier--pro-locked";
  else                                cardClass += " bp-tier--locked";

  let statusClass = "bp-tier-status ";
  let statusLabel = "";
  if (isCurrent)           { statusClass += "bp-tier-status--current";  statusLabel = t("currentLevel"); }
  else if (tier.unlocked)  { statusClass += "bp-tier-status--unlocked"; statusLabel = "✓"; }
  else if (isProLocked)    { statusClass += "bp-tier-status--pro";      statusLabel = "PRO"; }
  else                     { statusClass += "bp-tier-status--locked";   statusLabel = t("locked"); }

  return (
    <div className={cardClass} title={tier.rewardLabel}>
      <span className="bp-tier-level-num">LV {tier.level}</span>
      <span className="bp-tier-icon">{tier.rewardIcon}</span>
      <span className="bp-tier-label">{tier.rewardLabel}</span>
      <span className={statusClass}>{statusLabel}</span>
      {isProLocked && !isLocked && (
        <div className="bp-pro-overlay">
          <span className="bp-pro-overlay-icon">🔒</span>
        </div>
      )}
    </div>
  );
}

// ── Track section (free or pro) ───────────────────────────────────────────────

function TrackSection({
  tiers, currentLevel, isPro, label, accent,
}: {
  tiers: BpTier[];
  currentLevel: number;
  isPro: boolean;
  label: string;
  accent: string;
}) {
  return (
    <div className="bp-track-section">
      <div className="bp-track-label-row">
        <span className="bp-track-label" style={{ color: accent }}>{label}</span>
        <div className="bp-track-divider" style={{ background: `${accent}22` }} />
      </div>
      <div className="bp-tiers-scroll">
        <div className="bp-tiers-row">
          {tiers.map(tier => (
            <TierCard key={tier.level} tier={tier} currentLevel={currentLevel} isPro={isPro} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── New-reward toast banner ────────────────────────────────────────────────────

function UnlockBanner({ rewards, onDismiss }: {
  rewards: BpData["justUnlocked"];
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  if (!rewards.length) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 24, insetInlineEnd: 24, zIndex: 50,
        background: "#0d0d0d", border: "1px solid hsl(var(--primary)/0.4)",
        padding: "12px 16px", maxWidth: 300,
        boxShadow: "0 0 24px hsl(var(--primary)/0.15)",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "hsl(var(--primary))" }}>
        🎉 New Rewards Unlocked!
      </div>
      {rewards.map(r => (
        <div key={r.level} style={{ fontFamily: "monospace", fontSize: 10, color: "#ccc", display: "flex", gap: 6, alignItems: "center" }}>
          <span>{r.rewardIcon}</span>
          <span>LV {r.level} — {r.rewardLabel}</span>
        </div>
      ))}
      <button onClick={onDismiss} style={{ fontFamily: "monospace", fontSize: 8, color: "#555", background: "none", border: "none", cursor: "pointer", textAlign: "start", letterSpacing: "0.06em", marginTop: 2 }}>
        DISMISS
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BattlePassPage() {
  const { t } = useTranslation("battle-pass");
  const [showUnlock, setShowUnlock] = useState(true);

  const { data, isLoading } = useQuery<BpData>({
    queryKey: ["battle-pass-current"],
    queryFn: () => customFetch("/api/battle-pass/current"),
    staleTime: 30_000,
  });

  const freeTiers = data?.tiers.filter(t => t.track === "free") ?? [];
  const proTiers  = data?.tiers.filter(t => t.track === "pro")  ?? [];
  const pct = data
    ? data.currentLevel >= data.maxLevel
      ? 100
      : Math.round((data.xpIntoLevel / data.xpPerLevel) * 100)
    : 0;

  return (
    <div className="bp-page">
      {/* Header */}
      <div className="bp-header">
        <div className="bp-title-row">
          <h1 className="bp-title">{t("title")}</h1>
          {data && <span className="bp-season-badge">{data.season.name}</span>}
        </div>
        <p className="bp-subtitle">{t("subtitle")}</p>
      </div>

      {/* Countdown */}
      {data && <Countdown endsInMs={data.season.endsInMs} />}

      {/* User progress */}
      {isLoading ? (
        <div style={{ height: 72, background: "#0d0d0d", border: "1px solid #1a1a1a", animation: "pulse 1.5s ease-in-out infinite" }} />
      ) : data ? (
        <div className="bp-progress-card">
          <div className="bp-progress-header">
            <span className="bp-level-badge">
              {data.currentLevel >= data.maxLevel ? t("maxLevel") : `${t("level")} ${data.currentLevel} / ${data.maxLevel}`}
            </span>
            <span className="bp-xp-nums">
              {t("xpProgress", { current: data.xpIntoLevel.toLocaleString(), total: data.xpPerLevel.toLocaleString() })}
            </span>
          </div>
          <div className="bp-track">
            <div className="bp-fill" style={{ width: `${pct}%` }} />
          </div>
          {data.currentLevel < data.maxLevel && (
            <span className="bp-xp-to-next">
              {t("xpToNext", { xp: data.xpToNext.toLocaleString() })}
            </span>
          )}
        </div>
      ) : null}

      {/* Free Track */}
      {freeTiers.length > 0 && (
        <TrackSection
          tiers={freeTiers}
          currentLevel={data?.currentLevel ?? 0}
          isPro={data?.isPro ?? false}
          label={t("freeTrack")}
          accent="#22C55E"
        />
      )}

      {/* Pro Track */}
      {proTiers.length > 0 && (
        <TrackSection
          tiers={proTiers}
          currentLevel={data?.currentLevel ?? 0}
          isPro={data?.isPro ?? false}
          label={t("proTrack")}
          accent="#FFD700"
        />
      )}

      {/* Pro CTA for free users */}
      {data && !data.isPro && (
        <div className="bp-pro-cta">
          <span className="bp-pro-cta-icon">👑</span>
          <div className="bp-pro-cta-text">
            <div className="bp-pro-cta-title">{t("proOnly")}</div>
            <div className="bp-pro-cta-desc">{t("proRequired")}</div>
          </div>
          <Link href="/pro" className="bp-pro-cta-btn">Upgrade →</Link>
        </div>
      )}

      {/* New unlocks banner */}
      {data && showUnlock && data.justUnlocked.length > 0 && (
        <UnlockBanner rewards={data.justUnlocked} onDismiss={() => setShowUnlock(false)} />
      )}
    </div>
  );
}

// ── Dashboard widget (exported separately) ────────────────────────────────────

export function BattlePassWidget() {
  const { t } = useTranslation("battle-pass");

  const { data } = useQuery<BpData>({
    queryKey: ["battle-pass-current"],
    queryFn: () => customFetch("/api/battle-pass/current"),
    staleTime: 60_000,
  });

  const pct = data
    ? data.currentLevel >= data.maxLevel
      ? 100
      : Math.round((data.xpIntoLevel / data.xpPerLevel) * 100)
    : 0;

  // countdown string (compact)
  const msLeft = data?.season.endsInMs ?? 0;
  const totalSec = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const countdownStr = d > 0 ? `${d}${t("days")} ${h}${t("hours")}` : `${h}${t("hours")}`;

  return (
    <div className="bp-widget">
      <div className="bp-widget-header">
        <span className="bp-widget-title">{t("dashboard.title")}</span>
        {data && (
          <span className="bp-widget-level">
            {t("dashboard.level", { level: data.currentLevel })}
          </span>
        )}
      </div>

      <div className="bp-widget-track">
        <div className="bp-widget-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="bp-widget-footer">
        {data ? (
          <span className="bp-widget-xp">
            {t("dashboard.xpProgress", { current: data.xpIntoLevel, total: data.xpPerLevel })}
          </span>
        ) : (
          <span className="bp-widget-xp">{t("dashboard.notStarted")}</span>
        )}
        <Link href="/battle-pass" className="bp-widget-btn">
          {t("dashboard.viewTrack")}
        </Link>
      </div>

      {data && msLeft > 0 && (
        <span className="bp-widget-season">
          {t("dashboard.seasonEnds", { time: countdownStr })}
        </span>
      )}
    </div>
  );
}
