/**
 * Design tokens synced from the Game World Hub web artifact (index.css).
 *
 * The web app uses a "deep dark cockpit" theme with a neon-green primary.
 * Both light and dark keys are set to the same dark palette so the mobile
 * app always renders in dark mode regardless of the device's appearance setting.
 */

const dark = {
  // Legacy aliases
  text: '#e6e6e6',
  tint: '#00ff40',

  // Core surfaces
  background: '#080808', // hsl(0 0% 3%)
  foreground: '#e6e6e6', // hsl(0 0% 90%)

  // Cards / elevated surfaces
  card: '#0f0f0f',       // hsl(0 0% 6%)
  cardForeground: '#e6e6e6',

  // Primary action — neon green hsl(135 100% 50%)
  primary: '#00ff40',
  primaryForeground: '#000000',

  // Secondary
  secondary: '#1f1f1f',  // hsl(0 0% 12%)
  secondaryForeground: '#e6e6e6',

  // Muted / subdued
  muted: '#262626',       // hsl(0 0% 15%)
  mutedForeground: '#999999', // hsl(0 0% 60%)

  // Accent (same as primary in this theme)
  accent: '#00ff40',
  accentForeground: '#000000',

  // Destructive
  destructive: '#ff0000', // hsl(0 100% 50%)
  destructiveForeground: '#ffffff',

  // Borders and inputs
  border: '#1f1f1f',    // hsl(0 0% 12%)
  input: '#262626',
};

const colors = {
  // Both light and dark use the same cockpit dark palette — the app is always dark.
  light: dark,
  dark,
  // Hard edges matching the web app's --radius: 0rem
  radius: 0,
};

export default colors;
