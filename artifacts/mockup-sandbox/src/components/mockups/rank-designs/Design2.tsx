// Design 2 — Cinematic / Epic — app colors
const SHIELD = "M 40 4 L 76 18 L 76 46 C 76 68 58 82 40 88 C 22 82 4 68 4 46 L 4 18 Z";
const INNER  = "M 40 11 L 69 23 L 69 44 C 69 62 54 74 40 80 C 26 74 11 62 11 44 L 11 23 Z";
const C1="#22C55E", C2="#15803D", BORDER="#4ADE80";

export function Design2() {
  return (
    <div style={{ background:"#080808", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ width:660, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 30% 50%,${C1}20 0%,${C2}0a 40%,transparent 70%)` }} />

        <div style={{ position:"relative", border:`1px solid ${C1}22`, background:"rgba(10,10,10,0.95)" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"36px 36px 20px", gap:16 }}>

            <div style={{ fontFamily:"monospace", fontSize:10, color:`${C1}aa`, letterSpacing:"0.4em", textTransform:"uppercase" }}>// الرتبة //</div>

            <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ position:"absolute", width:180, height:180, borderRadius:"50%", border:`1px solid ${C1}22` }} />
              <div style={{ position:"absolute", width:155, height:155, borderRadius:"50%", border:`1px solid ${C1}33` }} />
              <svg viewBox="0 0 80 92" style={{ width:130, height:150, filter:`drop-shadow(0 0 20px ${C1}66) drop-shadow(0 0 40px ${C1}33)` }}>
                <defs>
                  <linearGradient id="d2g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={C1}/><stop offset="100%" stopColor={C2}/>
                  </linearGradient>
                  <linearGradient id="d2s" x1="0%" y1="0%" x2="30%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.35)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </linearGradient>
                </defs>
                <path d={SHIELD} fill={C1} opacity="0.15" transform="scale(1.15) translate(-5,-5.5)"/>
                <path d={SHIELD} fill="url(#d2g)"/>
                <path d={INNER}  fill="rgba(0,0,0,0.3)"/>
                <path d={SHIELD} fill="url(#d2s)"/>
                <path d={SHIELD} fill="none" stroke={BORDER} strokeWidth="2" opacity="0.9"/>
                <path d={INNER}  fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
                <line x1="22" y1="68" x2="58" y2="68" stroke="rgba(255,255,255,0.35)" strokeWidth="1"/>
                <circle cx="40" cy="75" r="3.5" fill="rgba(255,255,255,0.45)"/>
                <text x="40" y="84" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="9" fontFamily="monospace" fontWeight="bold">12</text>
                <text x="40" y="44" textAnchor="middle" fill="white" fontSize="26">⚔</text>
              </svg>
            </div>

            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:52, fontWeight:900, lineHeight:1, background:`linear-gradient(180deg,${BORDER} 0%,${C1} 50%,${C2} 100%)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", filter:`drop-shadow(0 0 20px ${C1}66)`, marginBottom:2 }}>محارب</div>
              <div style={{ fontFamily:"monospace", fontSize:11, color:`${C1}aa`, letterSpacing:"0.35em" }}>WARRIOR • DIV I • LVL 12</div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 36px", marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:`linear-gradient(90deg,transparent,${C1}55)` }} />
            <div style={{ color:C1, fontSize:14 }}>⚔</div>
            <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${C1}55,transparent)` }} />
          </div>

          <div style={{ padding:"0 36px 24px" }}>
            <div style={{ height:6, background:"#111", borderRadius:3, overflow:"hidden", border:`1px solid ${C1}22`, boxShadow:`0 0 10px ${C1}22` }}>
              <div style={{ width:"25%", height:"100%", background:`linear-gradient(90deg,${C2},${C1},${BORDER})`, borderRadius:3, boxShadow:`0 0 12px ${C1}99` }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:9, color:"#555", marginTop:6 }}>
              <span>101 / 400 XP</span>
              <span style={{ color:`${C1}88` }}>299 XP للمستوى التالي</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
