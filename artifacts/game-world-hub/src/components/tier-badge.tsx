import { Shield, Eye, Crosshair, Target, Swords, Flame, Zap, Crown, Gem, Sparkles } from "lucide-react";

// ─── Tier definitions (mirror of server-side TIER_DEFS) ────────────────────
export type TierName =
  | "INITIATE" | "SCOUT" | "OPERATIVE" | "HUNTER" | "WARRIOR"
  | "VETERAN"  | "ELITE" | "CHAMPION"  | "LEGEND" | "MYTHIC";

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
  INITIATE:  { label: "INITIATE",  labelAr: "مبتدئ",   color1: "#64748B", color2: "#334155", border: "#94A3B8", textColor: "#94A3B8", icon: Shield,    iconSizeCls: "w-7 h-7", glowColor: "transparent",  animClass: "",                   glowLevel: 0 },
  SCOUT:     { label: "SCOUT",     labelAr: "كشاف",    color1: "#22C55E", color2: "#15803D", border: "#4ADE80", textColor: "#4ADE80", icon: Eye,       iconSizeCls: "w-7 h-7", glowColor: "#22C55E",       animClass: "tier-anim-pulse",    glowLevel: 1 },
  OPERATIVE: { label: "OPERATIVE", labelAr: "عميل",    color1: "#06B6D4", color2: "#0E7490", border: "#22D3EE", textColor: "#22D3EE", icon: Crosshair, iconSizeCls: "w-7 h-7", glowColor: "#06B6D4",       animClass: "tier-anim-glow",     glowLevel: 2 },
  HUNTER:    { label: "HUNTER",    labelAr: "صياد",    color1: "#3B82F6", color2: "#1D4ED8", border: "#60A5FA", textColor: "#60A5FA", icon: Target,    iconSizeCls: "w-7 h-7", glowColor: "#3B82F6",       animClass: "tier-anim-glow",     glowLevel: 2 },
  WARRIOR:   { label: "WARRIOR",   labelAr: "محارب",   color1: "#F97316", color2: "#C2410C", border: "#FB923C", textColor: "#FB923C", icon: Swords,    iconSizeCls: "w-8 h-8", glowColor: "#F97316",       animClass: "tier-anim-pulse",    glowLevel: 2 },
  VETERAN:   { label: "VETERAN",   labelAr: "مخضرم",   color1: "#EF4444", color2: "#B91C1C", border: "#F87171", textColor: "#F87171", icon: Flame,     iconSizeCls: "w-8 h-8", glowColor: "#EF4444",       animClass: "tier-anim-flicker",  glowLevel: 3 },
  ELITE:     { label: "ELITE",     labelAr: "نخبة",    color1: "#A855F7", color2: "#7E22CE", border: "#C084FC", textColor: "#C084FC", icon: Zap,       iconSizeCls: "w-8 h-8", glowColor: "#A855F7",       animClass: "tier-anim-spark",    glowLevel: 3 },
  CHAMPION:  { label: "CHAMPION",  labelAr: "بطل",     color1: "#EAB308", color2: "#A16207", border: "#FDE047", textColor: "#FDE047", icon: Crown,     iconSizeCls: "w-8 h-8", glowColor: "#EAB308",       animClass: "tier-anim-shine",    glowLevel: 3 },
  LEGEND:    { label: "LEGEND",    labelAr: "أسطورة",  color1: "#EC4899", color2: "#7C3AED", border: "#F0ABFC", textColor: "#F0ABFC", icon: Gem,       iconSizeCls: "w-9 h-9", glowColor: "#EC4899",       animClass: "tier-anim-rainbow",  glowLevel: 4 },
  MYTHIC:    { label: "MYTHIC",    labelAr: "أسطوري",  color1: "#F97316", color2: "#7C3AED", border: "#FCD34D", textColor: "#FCD34D", icon: Sparkles,  iconSizeCls: "w-9 h-9", glowColor: "#F97316",       animClass: "tier-anim-cosmic",   glowLevel: 4 },
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
