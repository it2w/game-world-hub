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

interface ActiveXpEvent {
  id: number;
  label: string;
  multiplier: number;
  startsAt: string;
  endsAt: string;
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
  activeXpEvent: ActiveXpEvent | null;
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

// ── Active XP event banner ────────────────────────────────────────────────────

function XpEventBanner({ event }: { event: ActiveXpEvent }) {
  const { t } = useTranslation("battle-pass");
  const endsInMs = Math.max(0, new Date(event.endsAt).getTime() - Date.now());
  const { d, h, m, s, over } = useCountdown(endsInMs);

  if (over) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "linear-gradient(90deg, hsl(var(--primary)/0.15), hsl(var(--primary)/0.05))",
        border: "1px solid hsl(var(--primary)/0.5)",
        padding: "10px 16px",
        marginBottom: 4,
      }}
    >
      <span style={{ fontSize: 22 }}>⚡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "hsl(var(--primary))",
            marginBottom: 2,
          }}
        >
          {t("xpEvent.active")}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e5e5e5", fontWeight: 600 }}>
          {event.label} — {t("xpEvent.multiplier", { multiplier: event.multiplier })}
        </div>
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          color: "hsl(var(--muted-foreground))",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {t("xpEvent.endsIn", {
          d: String(d).padStart(2, "0"),
          h: String(h).padStart(2, "0"),
          m: String(m).padStart(2, "0"),
          s: String(s).padStart(2, "0"),
        })}
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

// ── Obsidian Hero Banner ───────────────────────────────────────────────────────

function BpHeroObsidian({ seasonName, maxLevel }: { seasonName?: string; maxLevel?: number }) {
  return (
    <div className="bp-hero-obsidian">
      <svg className="bp-hero-svg" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <pattern id="hex-obs" width="60" height="52" patternUnits="userSpaceOnUse">
            <polygon points="30,2 58,17 58,47 30,62 2,47 2,17"
              fill="none" stroke="#22C55E" strokeWidth="0.45" opacity="0.18"/>
          </pattern>
          <radialGradient id="obs-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.22"/>
            <stop offset="100%" stopColor="#000" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="obs-fade-l" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#080808" stopOpacity="1"/>
            <stop offset="28%"  stopColor="#080808" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="obs-fade-r" x1="0" x2="1" y1="0" y2="0">
            <stop offset="72%"  stopColor="#080808" stopOpacity="0"/>
            <stop offset="100%" stopColor="#080808" stopOpacity="1"/>
          </linearGradient>
          <filter id="obs-glow-f">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width="1000" height="220" fill="url(#hex-obs)"/>
        <ellipse cx="500" cy="110" rx="300" ry="140" fill="url(#obs-glow)"/>
        <rect width="220" height="220" fill="url(#obs-fade-l)"/>
        <rect x="780" width="220" height="220" fill="url(#obs-fade-r)"/>
        {[0,1,2,3,4].map(i => (
          <line key={i} x1={-100+i*250} y1="0" x2={100+i*250} y2="220"
            stroke="#22C55E" strokeWidth="0.5" opacity="0.1"/>
        ))}
        <g transform="translate(500,110)" filter="url(#obs-glow-f)">
          <path d="M0,-78 L48,-48 L48,18 Q48,64 0,86 Q-48,64 -48,18 L-48,-48 Z"
            fill="none" stroke="#22C55E" strokeWidth="1.4" opacity="0.65"/>
          <path d="M0,-56 L33,-34 L33,13 Q33,46 0,62 Q-33,46 -33,13 L-33,-34 Z"
            fill="#22C55E" opacity="0.05"/>
          <line x1="0" y1="-68" x2="0" y2="74"  stroke="#22C55E" strokeWidth="1" opacity="0.55"/>
          <line x1="-16" y1="-24" x2="16" y2="-24" stroke="#22C55E" strokeWidth="1" opacity="0.55"/>
          <rect x="-5" y="-84" width="10" height="10" fill="#22C55E" opacity="0.75" transform="rotate(45,0,-79)"/>
        </g>
        <g stroke="#22C55E" strokeWidth="1" opacity="0.45" fill="none">
          <path d="M18,18 L18,7 L29,7"/><path d="M982,18 L982,7 L971,7"/>
          <path d="M18,202 L18,213 L29,213"/><path d="M982,202 L982,213 L971,213"/>
        </g>
        <g transform="translate(80,110)">
          <text x="0" y="-24" fontFamily="monospace" fontSize="8" fill="#22C55E" opacity="0.5" textAnchor="middle" letterSpacing="2">SEASON</text>
          <text x="0" y="-6"  fontFamily="monospace" fontSize="20" fill="#22C55E" fontWeight="900" textAnchor="middle">{seasonName ?? "—"}</text>
          <rect x="-22" y="2" width="44" height="1" fill="#22C55E" opacity="0.28"/>
          <text x="0" y="17" fontFamily="monospace" fontSize="7" fill="#555" textAnchor="middle" letterSpacing="1.5">BATTLE PASS</text>
        </g>
        <g transform="translate(920,110)">
          <text x="0" y="-24" fontFamily="monospace" fontSize="8" fill="#22C55E" opacity="0.5" textAnchor="middle" letterSpacing="2">TIERS</text>
          <text x="0" y="-6"  fontFamily="monospace" fontSize="20" fill="#22C55E" fontWeight="900" textAnchor="middle">{maxLevel ?? "—"}</text>
          <rect x="-22" y="2" width="44" height="1" fill="#22C55E" opacity="0.28"/>
          <text x="0" y="17" fontFamily="monospace" fontSize="7" fill="#555" textAnchor="middle" letterSpacing="1.5">REWARDS</text>
        </g>
      </svg>
      <div className="bp-hero-overlay">
        <span className="bp-hero-eyebrow">⬡ SEASON 1 — BATTLE PASS ⬡</span>
        <h1 className="bp-hero-title">OBSIDIAN<br/>SEASON</h1>
        <span className="bp-hero-sub">30 Tiers · Exclusive Rewards · Season Prestige</span>
      </div>
      <div className="bp-hero-border-line"/>
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
      {/* Obsidian Hero Banner */}
      <BpHeroObsidian seasonName={data?.season.name} maxLevel={data?.maxLevel} />

      {/* Active XP event banner */}
      {data?.activeXpEvent && <XpEventBanner event={data.activeXpEvent} />}

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
