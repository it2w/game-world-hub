// Design 3 — Apex / FPS — app colors
const SHIELD = "M 40 4 L 76 18 L 76 46 C 76 68 58 82 40 88 C 22 82 4 68 4 46 L 4 18 Z";
const INNER  = "M 40 11 L 69 23 L 69 44 C 69 62 54 74 40 80 C 26 74 11 62 11 44 L 11 23 Z";
const C1="#22C55E", C2="#15803D", BORDER="#4ADE80";

export function Design3() {
  return (
    <div style={{ background:"#080808", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ width:660, background:"#0a0a0a", border:"1px solid #1c1c1c", overflow:"hidden", position:"relative" }}>

        <div style={{ position:"absolute", top:0, left:0, bottom:0, width:4, background:`linear-gradient(180deg,${C1},${C2})`, boxShadow:`0 0 20px ${C1}88` }} />
        <div style={{ position:"absolute", inset:0, opacity:0.04, background:`radial-gradient(circle at 70% 50%,${C1} 0%,transparent 60%)` }} />

        <div style={{ padding:"24px 28px 24px 36px", display:"flex", gap:28, alignItems:"stretch", position:"relative" }}>

          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, width:140, flexShrink:0 }}>
            <svg viewBox="0 0 80 92" style={{ width:110, height:127, filter:`drop-shadow(0 0 16px ${C1}66)` }}>
              <defs>
                <linearGradient id="d3g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={C1}/><stop offset="100%" stopColor="#052e16"/>
                </linearGradient>
                <linearGradient id="d3s" x1="0%" y1="0%" x2="40%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.28)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                </linearGradient>
              </defs>
              <path d={SHIELD} fill={C1} opacity="0.12" transform="scale(1.12) translate(-4,-4.5)"/>
              <path d={SHIELD} fill="url(#d3g)"/>
              <path d={INNER}  fill="rgba(0,0,0,0.28)"/>
              <path d={SHIELD} fill="url(#d3s)"/>
              <path d={SHIELD} fill="none" stroke={BORDER} strokeWidth="2.5" opacity="0.85"/>
              <path d={INNER}  fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8"/>
              <line x1="24" y1="67" x2="56" y2="67" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
              <circle cx="40" cy="73" r="3" fill="rgba(255,255,255,0.4)"/>
              <text x="40" y="84" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="monospace" fontWeight="bold">12</text>
              <text x="40" y="43" textAnchor="middle" fill="white" fontSize="24">⚔</text>
            </svg>
            <div style={{ background:C1, padding:"3px 14px", fontFamily:"monospace", fontSize:11, fontWeight:900, color:"black", letterSpacing:"0.15em", clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" }}>
              DIV I
            </div>
          </div>

          <div style={{ width:1, background:`linear-gradient(180deg,transparent,${C1}66,transparent)`, flexShrink:0 }} />

          <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", gap:12 }}>
            <div>
              <div style={{ fontFamily:"monospace", fontSize:9, color:`${C1}aa`, letterSpacing:"0.35em", textTransform:"uppercase", marginBottom:4 }}>الرتبة الحالية</div>
              <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:38, fontWeight:900, color:"white", lineHeight:1, marginBottom:2 }}>
                محارب <span style={{ fontSize:16, color:C1, fontFamily:"monospace", fontWeight:400 }}>WARRIOR</span>
              </div>
              <div style={{ fontFamily:"monospace", fontSize:10, color:"#555", letterSpacing:"0.2em" }}>المستوى 12 • الموسم 01</div>
            </div>

            <div>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:9, color:"#555", marginBottom:5 }}>
                <span style={{ color:BORDER }}>101 XP</span>
                <span>400 XP</span>
              </div>
              <div style={{ height:5, background:"#161616", border:"1px solid #2a2a2a", position:"relative" }}>
                <div style={{ width:"25%", height:"100%", background:`linear-gradient(90deg,${C2},${C1})`, boxShadow:`0 0 10px ${C1}66` }} />
                {[33,66].map(p=>(
                  <div key={p} style={{ position:"absolute", top:0, left:`${p}%`, width:1, height:"100%", background:"#0a0a0a" }} />
                ))}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:9, color:"#444", marginTop:4 }}>299 XP للمستوى التالي</div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[["4","الحلفاء"],["1","الطلبات"],["0","البارتيات"],["0","الرسائل"]].map(([n,l])=>(
                <div key={l} style={{ background:"#111", border:"1px solid #1e1e1e", padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:900, color:C1 }}>{n}</div>
                  <div style={{ fontFamily:"monospace", fontSize:8, color:"#444", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
