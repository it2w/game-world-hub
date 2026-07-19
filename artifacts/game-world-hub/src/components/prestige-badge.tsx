import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";

// Mirror of PRESTIGE_TIERS in prestige.ts
const TIERS = [
  { level: 1, color: "#e5e7eb", labelEn: "Prestige I",   labelAr: "برستيج I"   },
  { level: 2, color: "#22c55e", labelEn: "Prestige II",  labelAr: "برستيج II"  },
  { level: 3, color: "#3b82f6", labelEn: "Prestige III", labelAr: "برستيج III" },
  { level: 4, color: "#a855f7", labelEn: "Prestige IV",  labelAr: "برستيج IV"  },
  { level: 5, color: "#eab308", labelEn: "Prestige V",   labelAr: "برستيج V"   },
  { level: 6, color: "#ef4444", labelEn: "Prestige VI",  labelAr: "برستيج VI"  },
] as const;

interface PrestigeBadgeProps {
  /** prestige_level from user object (0 = no prestige; badge is hidden) */
  level: number;
  /** Badge size — default "sm" */
  size?: "xs" | "sm" | "md";
  /** Whether to show the label text beside the star */
  showLabel?: boolean;
}

/**
 * Coloured star badge shown next to a user's name when prestigeLevel > 0.
 * Renders null when level === 0 so callers can unconditionally render it.
 */
export function PrestigeBadge({ level, size = "sm", showLabel = false }: PrestigeBadgeProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage?.startsWith("ar");

  if (level <= 0) return null;

  const capped = Math.min(level, TIERS.length) - 1;
  const tier   = TIERS[capped];
  const label  = isAr ? tier.labelAr : tier.labelEn;

  const iconSize =
    size === "xs" ? "w-3 h-3" :
    size === "md" ? "w-5 h-5" :
                    "w-4 h-4";

  const textSize =
    size === "xs" ? "text-[9px]"  :
    size === "md" ? "text-[11px]" :
                    "text-[10px]";

  return (
    <span
      title={label}
      className={`inline-flex items-center gap-0.5 shrink-0 ${showLabel ? "gap-1" : ""}`}
    >
      <Star
        className={`${iconSize} shrink-0`}
        style={{ color: tier.color, fill: tier.color }}
      />
      {showLabel && (
        <span
          className={`font-mono uppercase tracking-widest font-bold ${textSize}`}
          style={{ color: tier.color }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
