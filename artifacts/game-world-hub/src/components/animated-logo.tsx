/**
 * Animated Game World Hub logo — "terminal boot glyph".
 * Corner brackets frame a command prompt whose cursor blinks while a
 * scanline sweeps the frame. Pure SVG + CSS (keyframes in index.css),
 * inherits `currentColor` so it always matches the terminal green theme.
 */
export function AnimatedLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      data-testid="animated-logo"
    >
      {/* Corner brackets (terminal frame) */}
      <path d="M4 14V4h10" stroke="currentColor" strokeWidth="3" className="gwh-logo-corner" />
      <path
        d="M34 4h10v10"
        stroke="currentColor"
        strokeWidth="3"
        className="gwh-logo-corner"
        style={{ animationDelay: "0.3s" }}
      />
      <path
        d="M44 34v10H34"
        stroke="currentColor"
        strokeWidth="3"
        className="gwh-logo-corner"
        style={{ animationDelay: "0.6s" }}
      />
      <path
        d="M14 44H4V34"
        stroke="currentColor"
        strokeWidth="3"
        className="gwh-logo-corner"
        style={{ animationDelay: "0.9s" }}
      />

      {/* Scanline sweeping the frame */}
      <rect x="8" y="8" width="32" height="1.5" fill="currentColor" className="gwh-logo-scan" />

      {/* Prompt chevron */}
      <path
        d="M15 17l9 7-9 7"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="square"
        className="gwh-logo-chevron"
      />

      {/* Blinking cursor block */}
      <rect x="27" y="27.5" width="9" height="4" fill="currentColor" className="gwh-logo-cursor" />
    </svg>
  );
}
