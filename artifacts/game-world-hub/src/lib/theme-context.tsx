/**
 * Theme System — Accent Color + Design Theme
 *
 * Accent: 7 color options injected as CSS custom props on <html>
 * Design: "classic" (original neon cyber) | "emerald" (new luxury clean)
 *         injected as --dash-* CSS variables + data-design attribute on <html>
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ─── Accent Colors ────────────────────────────────────────────────────────────

export interface AccentOption {
  id: string;
  label: string;
  /** HSL values WITHOUT the hsl() wrapper — e.g. "135 100% 50%" */
  hsl: string;
  /** Hex preview for the swatch */
  hex: string;
  /** Foreground for text on top of this color */
  fg: string;
}

export const ACCENTS: AccentOption[] = [
  { id: "default", label: "الحالي",       hsl: "135 100% 50%", hex: "#00FF40", fg: "0 0% 0%"   },
  { id: "green",   label: "أخضر فاخر",    hsl: "142 71% 45%",  hex: "#22C55E", fg: "0 0% 0%"   },
  { id: "cyan",    label: "سيان ثلجي",    hsl: "189 94% 43%",  hex: "#06B6D4", fg: "0 0% 0%"   },
  { id: "violet",  label: "بنفسجي ملكي",  hsl: "271 91% 65%",  hex: "#A855F7", fg: "0 0% 100%" },
  { id: "gold",    label: "ذهبي فاخر",    hsl: "43 74% 49%",   hex: "#D4A017", fg: "0 0% 0%"   },
  { id: "red",     label: "احمر فاخر",    hsl: "0 72% 51%",    hex: "#DC2626", fg: "0 0% 100%" },
  { id: "white",   label: "ابيض فاخر",    hsl: "0 0% 92%",     hex: "#EBEBEB", fg: "0 0% 0%"   },
];

function applyAccent(accent: AccentOption) {
  const root = document.documentElement;
  root.style.setProperty("--primary",                    accent.hsl);
  root.style.setProperty("--accent",                     accent.hsl);
  root.style.setProperty("--ring",                       accent.hsl);
  root.style.setProperty("--sidebar-primary",            accent.hsl);
  root.style.setProperty("--primary-foreground",         accent.fg);
  root.style.setProperty("--accent-foreground",          accent.fg);
  root.style.setProperty("--sidebar-primary-foreground", accent.fg);
}

// ─── Design Themes ────────────────────────────────────────────────────────────

export type DesignThemeId = "classic" | "emerald";

export interface DesignThemeOption {
  id: DesignThemeId;
  label: string;
  labelEn: string;
  description: string;
}

export const DESIGN_THEMES: DesignThemeOption[] = [
  {
    id: "classic",
    label: "كلاسيك",
    labelEn: "Classic",
    description: "التصميم الأصلي — كثيف ونيون",
  },
  {
    id: "emerald",
    label: "إيمرالد",
    labelEn: "Emerald",
    description: "تصميم فاخر — أرقام كبيرة وهواء",
  },
];

/**
 * Immediately stamps data-design on <html> and persists to localStorage.
 * Called on mount (via useEffect) AND directly from the settings click handler
 * so the change is synchronous — no waiting on React state batching.
 */
export function applyDesign(id: DesignThemeId) {
  document.documentElement.setAttribute("data-design", id);
  try { localStorage.setItem("gwh_design", id); } catch {}
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  // Accent
  accentId:     string;
  setAccent:    (id: string) => void;
  accents:      AccentOption[];
  // Design
  designId:     DesignThemeId;
  setDesign:    (id: DesignThemeId) => void;
  designThemes: DesignThemeOption[];
}

const ACCENT_KEY = "gwh_accent";
const DESIGN_KEY = "gwh_design";

const ThemeContext = createContext<ThemeContextValue>({
  accentId:     "default",
  setAccent:    () => {},
  accents:      ACCENTS,
  designId:     "classic",
  setDesign:    () => {},
  designThemes: DESIGN_THEMES,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentId] = useState<string>(() => {
    try { return localStorage.getItem(ACCENT_KEY) ?? "default"; }
    catch { return "default"; }
  });

  const [designId, setDesignId] = useState<DesignThemeId>(() => {
    try {
      const saved = localStorage.getItem(DESIGN_KEY);
      return (saved === "classic" || saved === "emerald") ? saved : "classic";
    } catch { return "classic"; }
  });

  // Apply accent on mount + change
  useEffect(() => {
    const accent = ACCENTS.find(a => a.id === accentId) ?? ACCENTS[0];
    applyAccent(accent);
    try { localStorage.setItem(ACCENT_KEY, accentId); } catch {}
  }, [accentId]);

  // Apply design on mount + change (applyDesign also writes localStorage)
  useEffect(() => {
    applyDesign(designId);
  }, [designId]);

  const setAccent = (id: string) => {
    if (ACCENTS.some(a => a.id === id)) setAccentId(id);
  };

  const setDesign = (id: DesignThemeId) => {
    if (DESIGN_THEMES.some(d => d.id === id)) setDesignId(id);
  };

  return (
    <ThemeContext.Provider value={{
      accentId, setAccent, accents: ACCENTS,
      designId, setDesign, designThemes: DESIGN_THEMES,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAccentColor() {
  return useContext(ThemeContext);
}

export function useDesignTheme() {
  return useContext(ThemeContext);
}
