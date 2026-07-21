/**
 * Accent Color Theme System
 * Stores the chosen accent in localStorage and injects it into
 * the CSS custom properties on <html> so every component responds automatically.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

const STORAGE_KEY = "gwh_accent";
const DEFAULT_ID  = "default";

function applyAccent(accent: AccentOption) {
  const root = document.documentElement;
  root.style.setProperty("--primary",                   accent.hsl);
  root.style.setProperty("--accent",                    accent.hsl);
  root.style.setProperty("--ring",                      accent.hsl);
  root.style.setProperty("--sidebar-primary",           accent.hsl);
  root.style.setProperty("--primary-foreground",        accent.fg);
  root.style.setProperty("--accent-foreground",         accent.fg);
  root.style.setProperty("--sidebar-primary-foreground",accent.fg);
}

interface ThemeContextValue {
  accentId:  string;
  setAccent: (id: string) => void;
  accents:   AccentOption[];
}

const ThemeContext = createContext<ThemeContextValue>({
  accentId:  DEFAULT_ID,
  setAccent: () => {},
  accents:   ACCENTS,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ID; }
    catch { return DEFAULT_ID; }
  });

  // Apply on mount + whenever accentId changes
  useEffect(() => {
    const accent = ACCENTS.find(a => a.id === accentId) ?? ACCENTS[0];
    applyAccent(accent);
    try { localStorage.setItem(STORAGE_KEY, accentId); } catch {}
  }, [accentId]);

  const setAccent = (id: string) => {
    if (ACCENTS.some(a => a.id === id)) setAccentId(id);
  };

  return (
    <ThemeContext.Provider value={{ accentId, setAccent, accents: ACCENTS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAccentColor() {
  return useContext(ThemeContext);
}
