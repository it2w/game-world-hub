/**
 * Animated Game World Hub logo — "hex-split mark".
 * A segmented hexagonal ring spins in place while a small hex core rests
 * permanently beside it, linked by a dashed tether (no undock motion).
 * Pure SVG + CSS (keyframes in index.css), inherits `currentColor` so it
 * always matches the terminal green theme; cyan accents are fixed.
 */
const ACCENT = "hsl(180, 100%, 50%)";

export function AnimatedLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 145 100"
      fill="none"
      className={className}
      aria-hidden="true"
      data-testid="animated-logo"
    >
      {/* Faint outer boundary */}
      <polygon
        points="45,10 79.64,30 79.64,70 45,90 10.36,70 10.36,30"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.2"
        className="gwh-logo-breath"
      />

      {/* Main segmented ring */}
      <g className="gwh-logo-spin-hex">
        <polygon
          points="45,20 70.98,35 70.98,65 45,80 19.02,65 19.02,35"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="300"
          strokeDasharray="60 40"
        />
        <circle cx="70.98" cy="35" r="2.5" fill={ACCENT} />
        <circle cx="45" cy="80" r="2.5" fill={ACCENT} />
        <circle cx="19.02" cy="35" r="2.5" fill={ACCENT} />
      </g>

      {/* Inner track */}
      <g className="gwh-logo-spin-inner">
        <polygon
          points="45,28 64.05,39 64.05,61 45,72 25.95,61 25.95,39"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
          pathLength="100"
          strokeDasharray="2 4"
        />
        <polygon
          points="45,28 64.05,39 64.05,61 45,72 25.95,61 25.95,39"
          stroke={ACCENT}
          strokeWidth="2"
          pathLength="100"
          strokeDasharray="10 90"
          strokeLinecap="round"
        />
      </g>

      {/* Tether linking ring and core */}
      <line
        x1="75"
        y1="50"
        x2="100"
        y2="50"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeDasharray="2 4"
        opacity="0.4"
        className="gwh-logo-tether"
      />

      {/* Detached core, resting beside the ring */}
      <g transform="translate(115 50)">
        <g className="gwh-logo-core">
          <polygon
            points="0,-12 10.39,-6 10.39,6 0,12 -10.39,6 -10.39,-6"
            fill="currentColor"
          />
          <circle
            r="4.5"
            fill="currentColor"
            strokeWidth="2"
            style={{ stroke: "hsl(var(--background))" }}
          />
          <circle r="2.5" style={{ fill: "hsl(var(--background))" }} />
        </g>
      </g>
      <circle
        cx="115"
        cy="50"
        r="18"
        stroke={ACCENT}
        strokeWidth="0.5"
        strokeDasharray="2 6"
        className="gwh-logo-orbit"
      />
    </svg>
  );
}
