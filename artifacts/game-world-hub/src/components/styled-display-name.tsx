import type { CSSProperties } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface DisplayNameStyle {
  font?:   "default" | "mono" | "bold" | "italic" | "serif" | "cursive" | null;
  color?:  string | null; // "#rrggbb"  or  "gradient:<key>"
  effect?: "none" | "glow" | "shadow" | "shimmer" | null;
}

/* ─── Gradient presets ───────────────────────────────────────────────────── */

export const GRADIENT_PRESETS: Record<string, { label: string; css: string }> = {
  fire:    { label: "🔥 Fire",    css: "linear-gradient(90deg,#ff4500,#ff8c00,#ffd700)" },
  ocean:   { label: "🌊 Ocean",   css: "linear-gradient(90deg,#00c6ff,#0072ff)" },
  galaxy:  { label: "🌌 Galaxy",  css: "linear-gradient(90deg,#a855f7,#ec4899)" },
  gold:    { label: "⭐ Gold",    css: "linear-gradient(90deg,#ffd700,#ff8c00,#ffd700)" },
  neon:    { label: "💚 Neon",    css: "linear-gradient(90deg,#00ff88,#00b4d8)" },
  candy:   { label: "🍭 Candy",   css: "linear-gradient(90deg,#ff6b9d,#c44dff)" },
  sunrise: { label: "🌅 Sunrise", css: "linear-gradient(90deg,#f7971e,#ffd200)" },
  ice:     { label: "❄️ Ice",     css: "linear-gradient(90deg,#a8edea,#fed6e3)" },
};

/* ─── Font styles ────────────────────────────────────────────────────────── */

const FONT_STYLES: Record<string, CSSProperties> = {
  mono:    { fontFamily: "ui-monospace,monospace" },
  bold:    { fontWeight: "bold" },
  italic:  { fontStyle: "italic" },
  serif:   { fontFamily: "ui-serif,Georgia,serif" },
  cursive: { fontFamily: "cursive" },
};

/* ─── Helper: parse JSON string from API ─────────────────────────────────── */

export function parseDisplayNameStyle(raw: string | null | undefined): DisplayNameStyle | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as DisplayNameStyle; } catch { return null; }
}

/* ─── Helper: resolve gradient color for glow ───────────────────────────── */

function resolveGlowColor(color: string | null | undefined): string {
  if (!color) return "#a855f7";
  if (color.startsWith("gradient:")) {
    const key = color.slice(9);
    // extract first stop from CSS
    const css = GRADIENT_PRESETS[key]?.css ?? "";
    const m = css.match(/#[0-9a-fA-F]{6}/);
    return m ? m[0] : "#a855f7";
  }
  return color;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

interface Props {
  displayName: string;
  style?: DisplayNameStyle | null;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function StyledDisplayName({ displayName, style, className = "", onClick }: Props) {
  if (!style || (!style.font && !style.color && !style.effect)) {
    return <span className={className} onClick={onClick}>{displayName}</span>;
  }

  const { font, color, effect } = style;
  const css: CSSProperties = {};

  /* font */
  if (font && font !== "default") Object.assign(css, FONT_STYLES[font] ?? {});

  /* color / gradient */
  if (color) {
    if (color.startsWith("gradient:")) {
      const key  = color.slice(9);
      const grad = GRADIENT_PRESETS[key]?.css;
      if (grad) {
        css.background           = grad;
        css.WebkitBackgroundClip = "text";
        css.WebkitTextFillColor  = "transparent";
        css.backgroundClip       = "text";
      }
    } else {
      css.color = color;
    }
  }

  /* effects */
  if (effect === "glow") {
    css.filter = `drop-shadow(0 0 6px ${resolveGlowColor(color)}99)`;
  } else if (effect === "shadow") {
    css.textShadow = "2px 2px 4px rgba(0,0,0,0.75)";
  }

  const shimmer = effect === "shimmer";

  return (
    <span
      className={`${className}${shimmer ? " dns-shimmer" : ""}`.trim()}
      style={css}
      onClick={onClick}
    >
      {displayName}
    </span>
  );
}
