// Design 1 — Valorant / Military style — app colors
const SHIELD = "M 40 4 L 76 18 L 76 46 C 76 68 58 82 40 88 C 22 82 4 68 4 46 L 4 18 Z";
const INNER  = "M 40 11 L 69 23 L 69 44 C 69 62 54 74 40 80 C 26 74 11 62 11 44 L 11 23 Z";
const C1 = "#22C55E", C2 = "#15803D", BORDER = "#4ADE80", GLOW = "#22C55E";

export function Design1() {
  return (
    <div style={{ background:"#080808", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ width:660, background:"#0d0d0d", border:"1px solid #1f1f1f", position:"relative", overflow:"hidden" }}>

        {/* diagonal texture */}
        <div style={{ position:"absolute", inset:0, opacity:0.03, backgroundImage:"repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize:"20px 20px" }} />

        {/* top accent bar */}
        <div style={{ height:3, background:`linear-gradient(90deg,${C1},${BORDER},${C1})`, boxShadow:`0 0 20px ${C1}88` }} />

        <div style={{ display:"flex", alignItems:"center", gap:32, padding:"28px 36px" }}>

          {/* badge */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, flexShrink:0 }}>
            <svg viewBox="0 0 80 92" style={{ width:120, height:138, filter:`drop-shadow(0 0 12px ${C1}88)` }}>
              <defs>
                <linearGradient id="d1g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={C1}/><stop offset="100%" stopColor={C2}/>
                </linearGradient>
                <linearGradient id="d1s" x1="0%" y1="0%" x2="30%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                </linearGradient>
              </defs>
              <path d={SHIELD} fill={C1} opacity="0.18" transform="scale(1.12) translate(-4,-4.5)"/>
              <path d={SHIELD} fill="url(#d1g)"/>
              <path d={INNER}  fill="rgba(0,0,0,0.25)"/>
              <path d={SHIELD} fill="url(#d1s)"/>
              <path d={SHIELD} fill="none" stroke={BORDER} strokeWidth="2" opacity="0.9"/>
              <path d={INNER}  fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
              <line x1="22" y1="68" x2="58" y2="68" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <circle cx="40" cy="75" r="3" fill="rgba(255,255,255,0.4)"/>
              <text x="40" y="84" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="monospace" fontWeight="bold">12</text>
              <text x="40" y="42" textAnchor="middle" fill="white" fontSize="22">⚔</text>
            </svg>
            <div style={{ background:"#111", border:`1px solid ${C1}44`, padding:"3px 12px", fontFamily:"monospace", fontSize:10, color:BORDER, letterSpacing:"0.2em" }}>
              DIV I ★
            </div>
          </div>

          {/* info */}
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#555", letterSpacing:"0.25em", textTransform:"uppercase", marginBottom:6 }}>الرتبة الحالية</div>
            <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:42, fontWeight:900, color:C1, lineHeight:1, textShadow:`0 0 30px ${C1}88, 0 0 60px ${C1}44`, marginBottom:4 }}>محارب</div>
            <div style={{ fontFamily:"monospace", fontSize:13, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:20 }}>WARRIOR</div>

            <div style={{ marginBottom:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:10, color:"#555", marginBottom:5 }}>
                <span>المستوى 12</span>
                <span style={{ color:BORDER }}>101 / 400 XP</span>
              </div>
              <div style={{ height:4, background:"#1a1a1a", border:"1px solid #2a2a2a" }}>
                <div style={{ width:"25%", height:"100%", background:`linear-gradient(90deg,${C2},${C1})`, boxShadow:`0 0 10px ${C1}88` }} />
              </div>
              <div style={{ fontFamily:"monospace", fontSize:9, color:"#444", marginTop:4 }}>299 نقطة خبرة للمستوى التالي</div>
            </div>

            <div style={{ display:"flex", gap:16, marginTop:16 }}>
              {[["4","الحلفاء"],["1","الطلبات"],["0","البارتيات"]].map(([n,l])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:900, color:C1 }}>{n}</div>
                  <div style={{ fontFamily:"monospace", fontSize:9, color:"#444", textTransform:"uppercase", letterSpacing:"0.1em" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #1a1a1a", padding:"8px 36px", display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontFamily:"monospace", fontSize:9, color:"#333", letterSpacing:"0.2em" }}>GAME WORLD HUB // RANKS</span>
          <span style={{ fontFamily:"monospace", fontSize:9, color:`${C1}44`, letterSpacing:"0.2em" }}>SEASON 01</span>
        </div>
      </div>
    </div>
  );
}
