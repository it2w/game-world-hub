import "./bp-hero.css";

export function Obsidian() {
  return (
    <div className="bp-preview-wrap">
      <div className="bp-hero bp-hero--obsidian">
        {/* Hex grid background */}
        <svg className="bp-bg-svg" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="hex-obs" width="60" height="52" patternUnits="userSpaceOnUse">
              <polygon points="30,2 58,17 58,47 30,62 2,47 2,17"
                fill="none" stroke="#22C55E" strokeWidth="0.4" opacity="0.18"/>
            </pattern>
            <radialGradient id="glow-obs" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#000" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="fade-left" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#080808" stopOpacity="1"/>
              <stop offset="30%" stopColor="#080808" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="fade-right" x1="0" x2="1" y1="0" y2="0">
              <stop offset="70%" stopColor="#080808" stopOpacity="0"/>
              <stop offset="100%" stopColor="#080808" stopOpacity="1"/>
            </linearGradient>
            <filter id="glow-f">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Hex grid */}
          <rect width="1000" height="260" fill="url(#hex-obs)"/>
          {/* Center glow */}
          <ellipse cx="500" cy="130" rx="300" ry="160" fill="url(#glow-obs)"/>
          {/* Fade edges */}
          <rect width="200" height="260" fill="url(#fade-left)"/>
          <rect x="800" width="200" height="260" fill="url(#fade-right)"/>

          {/* Diagonal scan lines */}
          {[0,1,2,3,4].map(i => (
            <line key={i} x1={-100 + i*250} y1="0" x2={100 + i*250} y2="260"
              stroke="#22C55E" strokeWidth="0.5" opacity="0.12"/>
          ))}

          {/* Central shield silhouette */}
          <g transform="translate(500, 130)" filter="url(#glow-f)">
            {/* Shield body */}
            <path d="M0,-90 L55,-55 L55,20 Q55,75 0,100 Q-55,75 -55,20 L-55,-55 Z"
              fill="none" stroke="#22C55E" strokeWidth="1.5" opacity="0.7"/>
            {/* Inner shield */}
            <path d="M0,-65 L38,-40 L38,16 Q38,54 0,72 Q-38,54 -38,16 L-38,-40 Z"
              fill="#22C55E" opacity="0.06"/>
            {/* Sword */}
            <line x1="0" y1="-78" x2="0" y2="85" stroke="#22C55E" strokeWidth="1.2" opacity="0.6"/>
            <line x1="-18" y1="-28" x2="18" y2="-28" stroke="#22C55E" strokeWidth="1.2" opacity="0.6"/>
            {/* Corner marks */}
            <rect x="-6" y="-96" width="12" height="12" fill="#22C55E" opacity="0.8" transform="rotate(45,0,-90)"/>
          </g>

          {/* Corner brackets */}
          <g stroke="#22C55E" strokeWidth="1" opacity="0.5" fill="none">
            <path d="M20,20 L20,8 L32,8"/>
            <path d="M980,20 L980,8 L968,8"/>
            <path d="M20,240 L20,252 L32,252"/>
            <path d="M980,240 L980,252 L968,252"/>
          </g>

          {/* Left stat panel */}
          <g transform="translate(80,130)">
            <text x="0" y="-28" fontFamily="monospace" fontSize="8" fill="#22C55E" opacity="0.5" textAnchor="middle" letterSpacing="2">SEASON</text>
            <text x="0" y="-10" fontFamily="monospace" fontSize="22" fill="#22C55E" fontWeight="900" textAnchor="middle">S1</text>
            <rect x="-25" y="0" width="50" height="1" fill="#22C55E" opacity="0.3"/>
            <text x="0" y="18" fontFamily="monospace" fontSize="7" fill="#666" textAnchor="middle" letterSpacing="1.5">BATTLE PASS</text>
          </g>

          {/* Right stat panel */}
          <g transform="translate(920,130)">
            <text x="0" y="-28" fontFamily="monospace" fontSize="8" fill="#22C55E" opacity="0.5" textAnchor="middle" letterSpacing="2">TIERS</text>
            <text x="0" y="-10" fontFamily="monospace" fontSize="22" fill="#22C55E" fontWeight="900" textAnchor="middle">30</text>
            <rect x="-25" y="0" width="50" height="1" fill="#22C55E" opacity="0.3"/>
            <text x="0" y="18" fontFamily="monospace" fontSize="7" fill="#666" textAnchor="middle" letterSpacing="1.5">REWARDS</text>
          </g>

          {/* Scan line animation */}
          <rect className="bp-scanline" x="0" y="0" width="1000" height="2" fill="#22C55E" opacity="0.06"/>
        </svg>

        {/* Overlay text */}
        <div className="bp-hero-content">
          <div className="bp-hero-eyebrow">⬡ SEASON 1 — BATTLE PASS ⬡</div>
          <h1 className="bp-hero-title bp-hero-title--obsidian">OBSIDIAN<br/>SEASON</h1>
          <div className="bp-hero-sub">30 Tiers · Exclusive Rewards · Season Prestige</div>
        </div>

        {/* Bottom bar */}
        <div className="bp-hero-bar bp-hero-bar--obsidian">
          <div className="bp-hero-bar-fill" style={{width:"42%"}}/>
        </div>
      </div>
    </div>
  );
}
