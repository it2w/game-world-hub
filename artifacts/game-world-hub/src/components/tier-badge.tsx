import { Shield, Eye, Crosshair, Target, Swords, Flame, Zap, Crown, Gem, Sparkles, Moon, Mountain, Infinity, Sun, Atom } from "lucide-react";

// ─── Tier defs (mirrors server-side TIER_DEFS) — used for division calc ────
const TIER_FRONTEND_DEFS: { id: TierName; minLevel: number }[] = [
  { id: "INITIATE",     minLevel: 1  },
  { id: "SCOUT",        minLevel: 2  },
  { id: "OPERATIVE",    minLevel: 4  },
  { id: "HUNTER",       minLevel: 7  },
  { id: "WARRIOR",      minLevel: 11 },
  { id: "VETERAN",      minLevel: 16 },
  { id: "ELITE",        minLevel: 22 },
  { id: "CHAMPION",     minLevel: 29 },
  { id: "LEGEND",       minLevel: 37 },
  { id: "MYTHIC",       minLevel: 46 },
  { id: "CELESTIAL",    minLevel: 56 },
  { id: "TITAN",        minLevel: 67 },
  { id: "IMMORTAL",     minLevel: 79 },
  { id: "GODLIKE",      minLevel: 92 },
  { id: "TRANSCENDENT", minLevel: 106 },
];

/** Returns "I" (top), "II" (mid), or "III" (entry) based on position within the tier's level span. */
export function getDivision(tier: TierName, level: number): "I" | "II" | "III" {
  if (tier === "TRANSCENDENT") return "I";
  const idx = TIER_FRONTEND_DEFS.findIndex((t) => t.id === tier);
  const current = TIER_FRONTEND_DEFS[idx];
  const next = TIER_FRONTEND_DEFS[idx + 1];
  if (!current || !next) return "I";
  const span = next.minLevel - current.minLevel;
  const pos = level - current.minLevel;
  if (pos < Math.floor(span / 3)) return "III";
  if (pos < Math.floor((2 * span) / 3)) return "II";
  return "I";
}

// ─── Tier definitions (mirror of server-side TIER_DEFS) ────────────────────
export type TierName =
  | "INITIATE" | "SCOUT" | "OPERATIVE" | "HUNTER" | "WARRIOR"
  | "VETERAN"  | "ELITE" | "CHAMPION"  | "LEGEND" | "MYTHIC"
  | "CELESTIAL" | "TITAN" | "IMMORTAL" | "GODLIKE" | "TRANSCENDENT";

interface TierConfig {
  label: string;
  labelAr: string;
  color1: string;
  color2: string;
  border: string;
  textColor: string;
  icon: React.ElementType;
  iconSizeCls: string;
  glowColor: string;
  animClass: string;
  /** 0 = none, 1 = subtle, 2 = standard, 3 = intense, 4 = epic */
  glowLevel: 0 | 1 | 2 | 3 | 4;
}

export const TIER_CONFIG: Record<TierName, TierConfig> = {
  INITIATE:     { label: "INITIATE",     labelAr: "مبتدئ",     color1: "#64748B", color2: "#334155", border: "#94A3B8", textColor: "#94A3B8", icon: Shield,    iconSizeCls: "w-7 h-7", glowColor: "transparent",  animClass: "",                   glowLevel: 0 },
  SCOUT:        { label: "SCOUT",        labelAr: "كشاف",      color1: "#22C55E", color2: "#15803D", border: "#4ADE80", textColor: "#4ADE80", icon: Eye,       iconSizeCls: "w-7 h-7", glowColor: "#22C55E",       animClass: "tier-anim-pulse",    glowLevel: 1 },
  OPERATIVE:    { label: "OPERATIVE",    labelAr: "عميل",      color1: "#06B6D4", color2: "#0E7490", border: "#22D3EE", textColor: "#22D3EE", icon: Crosshair, iconSizeCls: "w-7 h-7", glowColor: "#06B6D4",       animClass: "tier-anim-glow",     glowLevel: 2 },
  HUNTER:       { label: "HUNTER",       labelAr: "صياد",      color1: "#3B82F6", color2: "#1D4ED8", border: "#60A5FA", textColor: "#60A5FA", icon: Target,    iconSizeCls: "w-7 h-7", glowColor: "#3B82F6",       animClass: "tier-anim-glow",     glowLevel: 2 },
  WARRIOR:      { label: "WARRIOR",      labelAr: "محارب",     color1: "#F97316", color2: "#C2410C", border: "#FB923C", textColor: "#FB923C", icon: Swords,    iconSizeCls: "w-8 h-8", glowColor: "#F97316",       animClass: "tier-anim-pulse",    glowLevel: 2 },
  VETERAN:      { label: "VETERAN",      labelAr: "مخضرم",     color1: "#EF4444", color2: "#B91C1C", border: "#F87171", textColor: "#F87171", icon: Flame,     iconSizeCls: "w-8 h-8", glowColor: "#EF4444",       animClass: "tier-anim-flicker",  glowLevel: 3 },
  ELITE:        { label: "ELITE",        labelAr: "نخبة",      color1: "#A855F7", color2: "#7E22CE", border: "#C084FC", textColor: "#C084FC", icon: Zap,       iconSizeCls: "w-8 h-8", glowColor: "#A855F7",       animClass: "tier-anim-spark",    glowLevel: 3 },
  CHAMPION:     { label: "CHAMPION",     labelAr: "بطل",       color1: "#EAB308", color2: "#A16207", border: "#FDE047", textColor: "#FDE047", icon: Crown,     iconSizeCls: "w-8 h-8", glowColor: "#EAB308",       animClass: "tier-anim-shine",    glowLevel: 3 },
  LEGEND:       { label: "LEGEND",       labelAr: "أسطورة",    color1: "#EC4899", color2: "#7C3AED", border: "#F0ABFC", textColor: "#F0ABFC", icon: Gem,       iconSizeCls: "w-9 h-9", glowColor: "#EC4899",       animClass: "tier-anim-rainbow",  glowLevel: 4 },
  MYTHIC:       { label: "MYTHIC",       labelAr: "أسطوري",    color1: "#F97316", color2: "#7C3AED", border: "#FCD34D", textColor: "#FCD34D", icon: Sparkles,  iconSizeCls: "w-9 h-9", glowColor: "#F97316",       animClass: "tier-anim-cosmic",   glowLevel: 4 },
  CELESTIAL:    { label: "CELESTIAL",    labelAr: "سماوي",     color1: "#0EA5E9", color2: "#0369A1", border: "#38BDF8", textColor: "#38BDF8", icon: Moon,      iconSizeCls: "w-9 h-9", glowColor: "#0EA5E9",       animClass: "tier-anim-cosmic",   glowLevel: 4 },
  TITAN:        { label: "TITAN",        labelAr: "جبار",      color1: "#78716C", color2: "#451A03", border: "#A8A29E", textColor: "#A8A29E", icon: Mountain,  iconSizeCls: "w-9 h-9", glowColor: "#78716C",       animClass: "tier-anim-pulse",    glowLevel: 3 },
  IMMORTAL:     { label: "IMMORTAL",     labelAr: "خالد",      color1: "#DC2626", color2: "#991B1B", border: "#F87171", textColor: "#F87171", icon: Infinity, iconSizeCls: "w-9 h-9", glowColor: "#DC2626",       animClass: "tier-anim-flicker",  glowLevel: 4 },
  GODLIKE:      { label: "GODLIKE",      labelAr: "إلهي",      color1: "#F59E0B", color2: "#B45309", border: "#FCD34D", textColor: "#FCD34D", icon: Sun,       iconSizeCls: "w-10 h-10", glowColor: "#F59E0B",      animClass: "tier-anim-shine",    glowLevel: 4 },
  TRANSCENDENT: { label: "TRANSCENDENT", labelAr: "متعالٍ",    color1: "#C026D3", color2: "#581C87", border: "#E879F9", textColor: "#E879F9", icon: Atom,      iconSizeCls: "w-10 h-10", glowColor: "#C026D3",      animClass: "tier-anim-nova",     glowLevel: 4 },
};

// Classic heraldic shield SVG path (viewBox 0 0 80 92)
const SHIELD_PATH = "M 40 4 L 76 18 L 76 46 C 76 68 58 82 40 88 C 22 82 4 68 4 46 L 4 18 Z";
const INNER_PATH  = "M 40 11 L 69 23 L 69 44 C 69 62 54 74 40 80 C 26 74 11 62 11 44 L 11 23 Z";

interface TierBadgeProps {
  tier: TierName;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  /** "sm" = compact sidebar; "md" = profile card; "lg" = hero spotlight */
  size?: "sm" | "md" | "lg";
  showXpBar?: boolean;
  className?: string;
}

export function TierBadge({
  tier,
  level,
  xpIntoLevel,
  xpForNext,
  size = "md",
  showXpBar = true,
  className = "",
}: TierBadgeProps) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG["INITIATE"];
  const Icon = cfg.icon;
  const progress = xpForNext > 0 ? Math.round((xpIntoLevel / xpForNext) * 100) : 100;

  const shieldSizes = { sm: "w-14 h-16", md: "w-24 h-28", lg: "w-36 h-40" };
  const iconSizes   = { sm: "w-5 h-5",   md: cfg.iconSizeCls, lg: "w-12 h-12" };
  const nameSize    = { sm: "text-[9px]", md: "text-[11px]",   lg: "text-sm" };
  const lvlSize     = { sm: "text-[8px]", md: "text-[10px]",   lg: "text-xs" };
  const barWidth    = { sm: "w-14",       md: "w-20",          lg: "w-28" };

  const glowStyle = cfg.glowLevel >= 2
    ? { filter: `drop-shadow(0 0 ${cfg.glowLevel * 5}px ${cfg.glowColor}88)` }
    : {};

  // Unique gradient IDs per tier to avoid SVG defs conflicts across multiple badges
  const gradId   = `tg-${tier}`;
  const shineId  = `ts-${tier}`;
  const glowFId  = `tf-${tier}`;

  return (
    <div className={`flex flex-col items-center gap-1.5 select-none ${cfg.animClass} ${className}`} style={glowStyle}>
      {/* Shield */}
      <div className="relative flex items-center justify-center">
        <svg
          viewBox="0 0 80 92"
          className={shieldSizes[size]}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={cfg.color1} />
              <stop offset="100%" stopColor={cfg.color2} />
            </linearGradient>
            <linearGradient id={shineId} x1="0%" y1="0%" x2="30%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {cfg.glowLevel >= 2 && (
              <filter id={glowFId} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation={cfg.glowLevel + 1} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>

          {/* Outer glow halo for high tiers */}
          {cfg.glowLevel >= 3 && (
            <path
              d={SHIELD_PATH}
              fill={cfg.color1}
              opacity="0.18"
              transform="scale(1.10) translate(-3.6,-4.2)"
            />
          )}

          {/* Main shield body */}
          <path
            d={SHIELD_PATH}
            fill={`url(#${gradId})`}
            filter={cfg.glowLevel >= 2 ? `url(#${glowFId})` : undefined}
          />

          {/* Inner recessed panel */}
          <path d={INNER_PATH} fill="rgba(0,0,0,0.20)" />

          {/* Shine highlight */}
          <path d={SHIELD_PATH} fill={`url(#${shineId})`} />

          {/* Border */}
          <path d={SHIELD_PATH} fill="none" stroke={cfg.border} strokeWidth="1.5" opacity="0.75" />

          {/* Inner border detail */}
          <path d={INNER_PATH} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />

          {/* Decorative bottom emblem line */}
          <line x1="28" y1="68" x2="52" y2="68" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <circle cx="40" cy="73" r="2" fill="rgba(255,255,255,0.30)" />

          {/* Level number in the lower shield area */}
          <text
            x="40"
            y="80"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {level}
          </text>
        </svg>

        {/* Icon overlay — centered in the upper shield */}
        <div className="absolute inset-0 flex items-start justify-center pt-[22%]">
          <Icon className={`${iconSizes[size]} text-white drop-shadow-md`} strokeWidth={1.5} />
        </div>
      </div>

      {/* Tier name */}
      <span
        className={`font-mono tracking-[0.18em] uppercase font-bold ${nameSize[size]}`}
        style={{ color: cfg.textColor, textShadow: cfg.glowLevel >= 2 ? `0 0 8px ${cfg.glowColor}99` : "none" }}
      >
        {cfg.label}
      </span>

      {/* XP progress bar */}
      {showXpBar && (
        <div className="flex flex-col items-center gap-0.5">
          <div className={`${barWidth[size]} h-1 bg-border rounded-full overflow-hidden`}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${cfg.color2}, ${cfg.color1})` }}
            />
          </div>
          <span className={`${lvlSize[size]} text-muted-foreground font-mono`}>
            {xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Division Badge (hexagonal) ───────────────────────────────────────────
// Pointy-top hexagon SVG paths (viewBox 0 0 80 90)
const HEX_PATH  = "M 40 3 L 77 22 L 77 67 L 40 87 L 3 67 L 3 22 Z";
const HEX_INNER = "M 40 11 L 69 27 L 69 61 L 40 79 L 11 61 L 11 27 Z";

interface DivisionBadgeProps {
  tier: TierName;
  level: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Hexagonal division badge showing I / II / III within the current tier.
 * Division I = top of tier (closest to next promotion), III = entry.
 */
export function DivisionBadge({ tier, level, size = "md", className = "" }: DivisionBadgeProps) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG["INITIATE"];
  const div = getDivision(tier, level);
  const isTop = div === "I";

  const svgSizes  = { sm: "w-10 h-11",      md: "w-16 h-[72px]",   lg: "w-24 h-[108px]" };
  const numSizes  = { sm: "text-xl",         md: "text-3xl",         lg: "text-5xl" };
  const lblSizes  = { sm: "text-[7px]",      md: "text-[9px]",       lg: "text-xs" };

  const glowStyle =
    cfg.glowLevel >= 2
      ? { filter: `drop-shadow(0 0 ${cfg.glowLevel * 4}px ${cfg.glowColor}99)` }
      : {};

  const hexGradId  = `hdg-${tier}`;
  const hexShineId = `hds-${tier}`;

  return (
    <div
      className={`flex flex-col items-center gap-1 select-none ${cfg.animClass} ${className}`}
      style={glowStyle}
    >
      <div className="relative flex items-center justify-center">
        <svg viewBox="0 0 80 90" className={svgSizes[size]} aria-hidden="true">
          <defs>
            <linearGradient id={hexGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={cfg.color1} />
              <stop offset="100%" stopColor={cfg.color2} />
            </linearGradient>
            <linearGradient id={hexShineId} x1="0%" y1="0%" x2="30%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* Outer glow halo for high tiers */}
          {cfg.glowLevel >= 3 && (
            <path
              d={HEX_PATH}
              fill={cfg.color1}
              opacity="0.15"
              transform="scale(1.10) translate(-3.6,-4.1)"
            />
          )}

          {/* Hex body */}
          <path d={HEX_PATH}  fill={`url(#${hexGradId})`} />
          {/* Inner recessed panel */}
          <path d={HEX_INNER} fill="rgba(0,0,0,0.22)" />
          {/* Shine */}
          <path d={HEX_PATH}  fill={`url(#${hexShineId})`} />
          {/* Borders */}
          <path d={HEX_PATH}  fill="none" stroke={cfg.border} strokeWidth="1.5" opacity="0.75" />
          <path d={HEX_INNER} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />

          {/* Division indicator dots at the top of the hex */}
          {isTop && (
            <>
              <circle cx="40" cy="15" r="2.8" fill="rgba(255,255,255,0.65)" />
              <circle cx="29" cy="21" r="1.8" fill="rgba(255,255,255,0.35)" />
              <circle cx="51" cy="21" r="1.8" fill="rgba(255,255,255,0.35)" />
            </>
          )}
          {div === "II" && (
            <>
              <circle cx="33" cy="17" r="2.2" fill="rgba(255,255,255,0.55)" />
              <circle cx="47" cy="17" r="2.2" fill="rgba(255,255,255,0.55)" />
            </>
          )}
          {div === "III" && (
            <circle cx="40" cy="16" r="2.2" fill="rgba(255,255,255,0.45)" />
          )}

          {/* Bottom emblem line */}
          <line x1="28" y1="74" x2="52" y2="74" stroke="rgba(255,255,255,0.20)" strokeWidth="1" />
        </svg>

        {/* Roman numeral overlay — centered in hex body */}
        <div className="absolute inset-0 flex items-center justify-center pb-1">
          <span
            className={`font-black font-mono leading-none ${numSizes[size]}`}
            style={{
              color: "white",
              textShadow: `0 1px 6px rgba(0,0,0,0.8), 0 0 14px ${cfg.glowColor}`,
            }}
          >
            {div}
          </span>
        </div>
      </div>

      {/* Label */}
      <span
        className={`font-mono uppercase tracking-[0.15em] font-bold ${lblSizes[size]}`}
        style={{
          color: cfg.textColor,
          textShadow: cfg.glowLevel >= 2 ? `0 0 6px ${cfg.glowColor}88` : "none",
        }}
      >
        {isTop ? "★ " : ""}DIV {div}
      </span>
    </div>
  );
}

/** Mini badge for use in lists, messages, etc. */
export function TierPip({ tier }: { tier: TierName }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG["INITIATE"];
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-widest font-bold border"
      style={{
        borderColor: cfg.border,
        color: cfg.textColor,
        background: `${cfg.color1}22`,
        boxShadow: cfg.glowLevel >= 2 ? `0 0 6px ${cfg.glowColor}44` : "none",
      }}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2} />
      {cfg.label}
    </span>
  );
}
