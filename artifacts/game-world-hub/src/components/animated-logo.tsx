import type { CSSProperties } from "react";

/**
 * Animated Game World Hub logo — "arcade spirit" pixel invader.
 * A 16x15 pixel creature assembles piece by piece in a fountain wave from
 * the top-center, then lives: a floating bob with a soft glow, periodic
 * eye blinks and a luminance shimmer rippling through its pixels. Hovering
 * makes it do a tiny arcade hop. Pure SVG + CSS (keyframes in index.css);
 * the body inherits `currentColor` so it always matches the terminal theme.
 */
const INVADER = [
  ".....XXXXXX.....",
  "...XXXXXXXXXX...",
  "..XXXX....XXXX..",
  ".XXX........XXX.",
  ".XXX.EE..EE.XXX.",
  ".XXX.EE..EE.XXX.",
  ".XXXXXXXXXXXXXX.",
  ".XXXXXXXXXXXXXX.",
  "..XXXX....XXXX..",
  "...XX..XX..XX...",
  "....XX....XX....",
  "....XX....XX....",
  "...XXXX..XXXX...",
  "...XX......XX...",
  "...X........X...",
] as const;

export function AnimatedLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 15"
      fill="none"
      className={className ? `gwh-logo-arcade ${className}` : "gwh-logo-arcade"}
      aria-hidden="true"
      data-testid="animated-logo"
    >
      <g className="gwh-logo-body">
        {INVADER.map((row, y) =>
          row.split("").map((ch, x) => {
            if (ch === ".") return null;
            const isEye = ch === "E";
            // Fountain-like assembly wave radiating from the top-center.
            const delay = (Math.abs(x - 7.5) + y) * 0.045;
            return (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="1.05"
                height="1.05"
                className={isEye ? "gwh-logo-eye" : "gwh-logo-px"}
                style={
                  {
                    "--d": `${delay}s`,
                    transformOrigin: `${x + 0.5}px ${y + 0.5}px`,
                  } as CSSProperties
                }
              />
            );
          }),
        )}
      </g>
    </svg>
  );
}
