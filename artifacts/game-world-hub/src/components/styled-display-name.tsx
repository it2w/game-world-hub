import type { CSSProperties } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface DisplayNameStyle {
  font?:   "default" | "mono" | "bold" | "italic" | "serif" | "cursive" | null;
  color?:  string | null; // "#rrggbb"  or  "gradient:<key>"
  effect?: "none" | "glow" | "shadow" | "shimmer" | "outline" | "rainbow" | "pulse" | null;
}

/* ─── Gradient presets ───────────────────────────────────────────────────── */

export const GRADIENT_PRESETS: Record<string, { label: string; css: string; emoji: string }> = {
  fire:       { label: "Fire",        emoji: "🔥", css: "linear-gradient(90deg,#ff4500,#ff8c00,#ffd700)" },
  ocean:      { label: "Ocean",       emoji: "🌊", css: "linear-gradient(90deg,#00c6ff,#0072ff)" },
  galaxy:     { label: "Galaxy",      emoji: "🌌", css: "linear-gradient(90deg,#a855f7,#ec4899)" },
  gold:       { label: "Gold",        emoji: "⭐", css: "linear-gradient(90deg,#ffd700,#ff8c00,#ffd700)" },
  neon:       { label: "Neon",        emoji: "💚", css: "linear-gradient(90deg,#00ff88,#00b4d8)" },
  candy:      { label: "Candy",       emoji: "🍭", css: "linear-gradient(90deg,#ff6b9d,#c44dff)" },
  sunrise:    { label: "Sunrise",     emoji: "🌅", css: "linear-gradient(90deg,#f7971e,#ffd200)" },
  ice:        { label: "Ice",         emoji: "❄️", css: "linear-gradient(90deg,#a8edea,#fed6e3)" },
  aurora:     { label: "Aurora",      emoji: "🌿", css: "linear-gradient(90deg,#00ff88,#00b4d8,#a855f7)" },
  chrome:     { label: "Chrome",      emoji: "🪙", css: "linear-gradient(90deg,#b0b0b0,#ffffff,#b0b0b0)" },
  royal:      { label: "Royal",       emoji: "👑", css: "linear-gradient(90deg,#7c3aed,#a855f7,#ffd700)" },
  blood:      { label: "Blood",       emoji: "🩸", css: "linear-gradient(90deg,#8b0000,#dc143c,#ff4500)" },
  holographic:{ label: "Holo",        emoji: "💎", css: "linear-gradient(90deg,#ff6b6b,#ffd700,#00ff88,#00b4d8,#c44dff)" },
  midnight:   { label: "Midnight",    emoji: "🌙", css: "linear-gradient(90deg,#0f0c29,#302b63,#24243e)" },
  toxic:      { label: "Toxic",       emoji: "☢️", css: "linear-gradient(90deg,#39ff14,#7fff00,#adff2f)" },
};

/* ─── Font styles ────────────────────────────────────────────────────────── */

const FONT_STYLES: Record<string, CSSProperties> = {
  mono:    { fontFamily: "ui-monospace,monospace" },
  bold:    { fontWeight: "800" },
  italic:  { fontStyle: "italic", fontWeight: "600" },
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
  if (!style || (!style.font && !style.color && (!style.effect || style.effect === "none"))) {
    return <span className={className} onClick={onClick}>{displayName}</span>;
  }

  const { font, color, effect } = style;
  const css: CSSProperties = {};

  /* font */
  if (font && font !== "default") Object.assign(css, FONT_STYLES[font] ?? {});

  const isRainbow = effect === "rainbow";
  const isShimmer = effect === "shimmer";
  const isOutline = effect === "outline";
  const isPulse   = effect === "pulse";

  /* gradient inner style — kept separate from className to avoid Tailwind conflicts */
  const gradientCss: CSSProperties = {};
  let useGradientWrapper = false;

  /* color / gradient (skip if rainbow — rainbow class handles it) */
  if (!isRainbow && !isShimmer && color) {
    if (color.startsWith("gradient:")) {
      const key  = color.slice(9);
      const grad = GRADIENT_PRESETS[key]?.css;
      if (grad) {
        gradientCss.background           = grad;
        gradientCss.WebkitBackgroundClip = "text";
        gradientCss.WebkitTextFillColor  = "transparent";
        gradientCss.backgroundClip       = "text";
        gradientCss.color                = "transparent";
        gradientCss.display              = "inline-block";
        useGradientWrapper = true;
      }
    } else if (isOutline) {
      (css as any).WebkitTextStroke = `1.5px ${color}`;
      css.WebkitTextFillColor = "transparent";
    } else {
      css.color = color;
    }
  }

  /* outline without explicit color */
  if (isOutline && !color) {
    (css as any).WebkitTextStroke = "1.5px #a855f7";
    css.WebkitTextFillColor = "transparent";
  }

  /* effects */
  if (effect === "glow") {
    css.filter = `drop-shadow(0 0 8px ${resolveGlowColor(color)}) drop-shadow(0 0 16px ${resolveGlowColor(color)}66)`;
  } else if (effect === "shadow") {
    css.textShadow = "2px 3px 6px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)";
  } else if (isPulse) {
    css.filter = `drop-shadow(0 0 6px ${resolveGlowColor(color)})`;
  }

  const extraClass = [
    isShimmer ? "dns-shimmer"  : "",
    isRainbow ? "dns-rainbow"  : "",
    isPulse   ? "dns-pulse"    : "",
  ].filter(Boolean).join(" ");

  /* When a gradient is active, wrap the text in an inner span that carries the
     gradient clip style, keeping the outer span clean for Tailwind classes.
     This prevents -webkit-text-fill-color:transparent from conflicting with
     Tailwind's color utilities on the same element. */
  const inner = useGradientWrapper
    ? <span style={gradientCss}>{displayName}</span>
    : displayName;

  return (
    <span
      className={`${className}${extraClass ? " " + extraClass : ""}`.trim()}
      style={css}
      onClick={onClick}
    >
      {inner}
    </span>
  );
}
