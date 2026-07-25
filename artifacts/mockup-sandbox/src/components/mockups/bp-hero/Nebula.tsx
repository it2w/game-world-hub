import "./bp-hero.css";

export function Nebula() {
  return (
    <div className="bp-preview-wrap">
      <div className="bp-hero bp-hero--nebula">
        <svg className="bp-bg-svg" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="nebula-core" cx="50%" cy="50%" r="45%">
              <stop offset="0%"   stopColor="#7C3AED" stopOpacity="0.35"/>
              <stop offset="50%"  stopColor="#06B6D4" stopOpacity="0.12"/>
              <stop offset="100%" stopColor="#000"    stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="nebula-left" cx="20%" cy="50%" r="30%">
              <stop offset="0%"   stopColor="#EC4899" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#000"    stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="nebula-right" cx="80%" cy="50%" r="30%">
              <stop offset="0%"   stopColor="#06B6D4" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#000"    stopOpacity="0"/>
            </radialGradient>
            <filter id="star-glow">
              <feGaussianBlur stdDeviation="1.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="soft-glow">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Nebula clouds */}
          <rect width="1000" height="260" fill="#050508"/>
          <ellipse cx="500" cy="130" rx="400" ry="160" fill="url(#nebula-core)"/>
          <ellipse cx="200" cy="130" rx="300" ry="140" fill="url(#nebula-left)"/>
          <ellipse cx="800" cy="130" rx="300" ry="140" fill="url(#nebula-right)"/>

          {/* Stars */}
          {[
            [50,30],[120,80],[180,20],[240,110],[300,45],[380,90],[420,15],[480,70],
            [540,25],[600,100],[650,40],[720,80],[780,20],[840,70],[900,35],[960,90],
            [70,170],[150,200],[230,160],[310,220],[400,180],[460,240],[520,190],
            [580,220],[640,170],[700,240],[760,200],[820,150],[880,210],[940,170],
            [100,130],[200,50],[300,200],[450,130],[550,55],[700,130],[850,100],
          ].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r={i%5===0?1.5:i%3===0?1:0.7}
              fill="white" opacity={0.3+Math.random()*0.5} filter="url(#star-glow)"/>
          ))}

          {/* Energy beams from center */}
          <g opacity="0.4" filter="url(#soft-glow)">
            <line x1="500" y1="130" x2="150" y2="40"  stroke="#7C3AED" strokeWidth="0.8"/>
            <line x1="500" y1="130" x2="850" y2="40"  stroke="#06B6D4" strokeWidth="0.8"/>
            <line x1="500" y1="130" x2="150" y2="220" stroke="#EC4899" strokeWidth="0.8"/>
            <line x1="500" y1="130" x2="850" y2="220" stroke="#06B6D4" strokeWidth="0.8"/>
          </g>

          {/* Central planet/orb */}
          <g transform="translate(500,130)" filter="url(#soft-glow)">
            <circle cx="0" cy="0" r="55" fill="none" stroke="#7C3AED" strokeWidth="1" opacity="0.6"/>
            <circle cx="0" cy="0" r="38" fill="#7C3AED" opacity="0.08"/>
            <circle cx="0" cy="0" r="22" fill="#7C3AED" opacity="0.15"/>
            {/* Orbit ring */}
            <ellipse cx="0" cy="0" rx="70" ry="20" fill="none" stroke="#06B6D4" strokeWidth="0.8" opacity="0.5" strokeDasharray="4 6"/>
            {/* Crown */}
            <path d="M-20,-22 L-20,-38 L-10,-28 L0,-42 L10,-28 L20,-38 L20,-22"
              fill="none" stroke="#FFD700" strokeWidth="1.2" opacity="0.7"/>
            <circle cx="-20" cy="-38" r="2.5" fill="#FFD700" opacity="0.9"/>
            <circle cx="0"   cy="-42" r="3"   fill="#FFD700" opacity="0.9"/>
            <circle cx="20"  cy="-38" r="2.5" fill="#FFD700" opacity="0.9"/>
          </g>

          {/* Corner brackets */}
          <g stroke="#7C3AED" strokeWidth="1" opacity="0.4" fill="none">
            <path d="M20,20 L20,8 L32,8"/>
            <path d="M980,20 L980,8 L968,8"/>
            <path d="M20,240 L20,252 L32,252"/>
            <path d="M980,240 L980,252 L968,252"/>
          </g>

          {/* Dots pattern */}
          <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="0.6" fill="#7C3AED" opacity="0.25"/>
          </pattern>
          <rect width="1000" height="260" fill="url(#dots)"/>
        </svg>

        <div className="bp-hero-content">
          <div className="bp-hero-eyebrow bp-hero-eyebrow--nebula">✦ COSMIC SEASON ✦</div>
          <h1 className="bp-hero-title bp-hero-title--nebula">NEBULA<br/>ASCENDANT</h1>
          <div className="bp-hero-sub bp-hero-sub--nebula">30 Tiers · Galaxy Rewards · Prestige Crown</div>
        </div>

        <div className="bp-hero-bar bp-hero-bar--nebula">
          <div className="bp-hero-bar-fill bp-hero-bar-fill--nebula" style={{width:"42%"}}/>
        </div>
      </div>
    </div>
  );
}
