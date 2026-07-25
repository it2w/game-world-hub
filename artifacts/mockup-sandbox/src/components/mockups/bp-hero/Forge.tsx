import "./bp-hero.css";

export function Forge() {
  return (
    <div className="bp-preview-wrap">
      <div className="bp-hero bp-hero--forge">
        <svg className="bp-bg-svg" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="forge-core" cx="50%" cy="80%" r="60%">
              <stop offset="0%"   stopColor="#F97316" stopOpacity="0.4"/>
              <stop offset="40%"  stopColor="#EF4444" stopOpacity="0.15"/>
              <stop offset="100%" stopColor="#000"    stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="forge-top" cx="50%" cy="10%" r="50%">
              <stop offset="0%"   stopColor="#EF4444" stopOpacity="0.1"/>
              <stop offset="100%" stopColor="#000"    stopOpacity="0"/>
            </radialGradient>
            <filter id="ember-glow">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fire-blur">
              <feGaussianBlur stdDeviation="5"/>
            </filter>
            <pattern id="circuit" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M10,40 L30,40 L30,10 L50,10 L50,40 L70,40"
                fill="none" stroke="#F97316" strokeWidth="0.5" opacity="0.12"/>
              <path d="M40,10 L40,30 L70,30"
                fill="none" stroke="#EF4444" strokeWidth="0.5" opacity="0.1"/>
              <circle cx="30" cy="40" r="2" fill="#F97316" opacity="0.15"/>
              <circle cx="50" cy="10" r="2" fill="#F97316" opacity="0.15"/>
            </pattern>
          </defs>

          <rect width="1000" height="260" fill="#060402"/>
          <rect width="1000" height="260" fill="url(#circuit)"/>
          <rect width="1000" height="260" fill="url(#forge-core)"/>
          <rect width="1000" height="260" fill="url(#forge-top)"/>

          {/* Fire glow at bottom */}
          <ellipse cx="500" cy="280" rx="350" ry="100" fill="#F97316" opacity="0.18" filter="url(#fire-blur)"/>

          {/* Ember particles */}
          {[
            [480,200],[510,180],[495,220],[470,190],[525,205],
            [460,170],[535,185],[490,240],[515,160],[475,215],
            [200,230],[300,210],[700,220],[800,240],[150,190],
            [850,200],[100,250],[900,230],[350,240],[650,250],
          ].map(([x,y], i) => (
            <g key={i} filter="url(#ember-glow)">
              <circle cx={x} cy={y} r={i%4===0?2:i%3===0?1.5:1}
                fill={i%2===0?"#F97316":"#EF4444"}
                opacity={0.4+i%3*0.2}/>
            </g>
          ))}

          {/* Central axe/weapon silhouette */}
          <g transform="translate(500, 130)" filter="url(#ember-glow)">
            {/* Handle */}
            <rect x="-3" y="-85" width="6" height="170" rx="2"
              fill="none" stroke="#F97316" strokeWidth="1.5" opacity="0.7"/>
            {/* Axe head */}
            <path d="M3,-60 Q50,-50 45,0 Q50,40 3,40 L3,-60Z"
              fill="#EF4444" opacity="0.15"/>
            <path d="M3,-60 Q50,-50 45,0 Q50,40 3,40"
              fill="none" stroke="#F97316" strokeWidth="1.5" opacity="0.75"/>
            {/* Opposite blade */}
            <path d="M-3,-50 Q-35,-42 -32,0 Q-35,30 -3,30 L-3,-50Z"
              fill="#EF4444" opacity="0.1"/>
            <path d="M-3,-50 Q-35,-42 -32,0 Q-35,30 -3,30"
              fill="none" stroke="#EF4444" strokeWidth="1" opacity="0.5"/>
            {/* Center gem */}
            <polygon points="0,-10 8,0 0,10 -8,0"
              fill="#FFD700" opacity="0.9"/>
            {/* Glow */}
            <circle cx="0" cy="0" r="25" fill="#F97316" opacity="0.05"/>
          </g>

          {/* Diagonal slashes */}
          <line x1="350" y1="0"   x2="500" y2="260" stroke="#F97316" strokeWidth="0.5" opacity="0.15"/>
          <line x1="500" y1="0"   x2="650" y2="260" stroke="#EF4444" strokeWidth="0.5" opacity="0.12"/>
          <line x1="450" y1="0"   x2="550" y2="260" stroke="#F97316" strokeWidth="0.3" opacity="0.08"/>

          {/* Corner brackets — orange */}
          <g stroke="#F97316" strokeWidth="1.2" opacity="0.5" fill="none">
            <path d="M20,20 L20,8 L32,8"/>
            <path d="M980,20 L980,8 L968,8"/>
            <path d="M20,240 L20,252 L32,252"/>
            <path d="M980,240 L980,252 L968,252"/>
          </g>

          {/* Horizontal lines */}
          <line x1="0" y1="4"   x2="1000" y2="4"   stroke="#F97316" strokeWidth="0.8" opacity="0.25"/>
          <line x1="0" y1="256" x2="1000" y2="256" stroke="#F97316" strokeWidth="0.8" opacity="0.25"/>

          {/* Left stats */}
          <g transform="translate(80,130)">
            <text x="0" y="-28" fontFamily="monospace" fontSize="8" fill="#F97316" opacity="0.6" textAnchor="middle" letterSpacing="2">SEASON</text>
            <text x="0" y="-8"  fontFamily="monospace" fontSize="22" fill="#F97316" fontWeight="900" textAnchor="middle">S1</text>
            <rect x="-28" y="2" width="56" height="1" fill="#F97316" opacity="0.3"/>
            <text x="0" y="18" fontFamily="monospace" fontSize="7" fill="#666" textAnchor="middle" letterSpacing="1.5">FORGE</text>
          </g>

          {/* Right stats */}
          <g transform="translate(920,130)">
            <text x="0" y="-28" fontFamily="monospace" fontSize="8" fill="#F97316" opacity="0.6" textAnchor="middle" letterSpacing="2">DAYS</text>
            <text x="0" y="-8"  fontFamily="monospace" fontSize="22" fill="#EF4444" fontWeight="900" textAnchor="middle">47</text>
            <rect x="-28" y="2" width="56" height="1" fill="#F97316" opacity="0.3"/>
            <text x="0" y="18" fontFamily="monospace" fontSize="7" fill="#666" textAnchor="middle" letterSpacing="1.5">REMAIN</text>
          </g>
        </svg>

        <div className="bp-hero-content">
          <div className="bp-hero-eyebrow bp-hero-eyebrow--forge">🔥 SEASON OF FIRE 🔥</div>
          <h1 className="bp-hero-title bp-hero-title--forge">FORGE<br/>SEASON</h1>
          <div className="bp-hero-sub bp-hero-sub--forge">30 Tiers · Legendary Weapons · Master the Forge</div>
        </div>

        <div className="bp-hero-bar bp-hero-bar--forge">
          <div className="bp-hero-bar-fill bp-hero-bar-fill--forge" style={{width:"42%"}}/>
        </div>
      </div>
    </div>
  );
}
