// Design 4 — Holographic / Cyberpunk style
const SHIELD = "M 40 4 L 76 18 L 76 46 C 76 68 58 82 40 88 C 22 82 4 68 4 46 L 4 18 Z";
const INNER  = "M 40 11 L 69 23 L 69 44 C 69 62 54 74 40 80 C 26 74 11 62 11 44 L 11 23 Z";

export function Design4() {
  return (
    <div style={{ background:"#080808", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ width:660, position:"relative" }}>

        {/* outer glow frame */}
        <div style={{ position:"absolute", inset:-1, background:"linear-gradient(135deg,#F9731644,#C2410C22,transparent,#F9731622)", borderRadius:2 }} />

        <div style={{ position:"relative", background:"#090909", border:"1px solid transparent", overflow:"hidden" }}>

          {/* scanline overlay */}
          <div style={{ position:"absolute", inset:0, opacity:0.025, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.5) 2px,rgba(255,255,255,0.5) 3px)", pointerEvents:"none", zIndex:10 }} />

          {/* corner brackets */}
          {[{top:8,left:8},{top:8,right:8},{bottom:8,left:8},{bottom:8,right:8}].map((pos,i)=>(
            <div key={i} style={{ position:"absolute", ...pos, width:16, height:16, border:"2px solid #F9731688", borderRight:i%2===0?"none":"2px solid #F9731688", borderLeft:i%2===0?"2px solid #F9731688":"none", borderBottom:i<2?"none":"2px solid #F9731688", borderTop:i>=2?"none":"2px solid #F9731688" }} />
          ))}

          {/* header bar */}
          <div style={{ background:"#0f0f0f", borderBottom:"1px solid #F9731622", padding:"8px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:"monospace", fontSize:9, color:"#F9731666", letterSpacing:"0.3em" }}>// RANK SYSTEM v2.0 //</span>
            <span style={{ fontFamily:"monospace", fontSize:9, color:"#F9731666", letterSpacing:"0.2em" }}>SEASON_01</span>
          </div>

          {/* main content */}
          <div style={{ display:"flex", alignItems:"center", gap:0 }}>

            {/* badge panel */}
            <div style={{ width:200, padding:"28px 24px", display:"flex", flexDirection:"column", alignItems:"center", gap:12, borderRight:"1px solid #F9731622", background:"linear-gradient(135deg,#0f0f0f,#0a0a0a)", flexShrink:0 }}>
              <div style={{ position:"relative" }}>
                {/* holo rings */}
                <div style={{ position:"absolute", inset:-20, borderRadius:"50%", border:"1px solid #F9731618" }} />
                <div style={{ position:"absolute", inset:-10, borderRadius:"50%", border:"1px solid #F9731630" }} />

                <svg viewBox="0 0 80 92" style={{ width:120, height:138, filter:"drop-shadow(0 0 12px #F9731688) drop-shadow(0 0 24px #F9731644)" }}>
                  <defs>
                    <linearGradient id="d4g" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#F97316" />
                      <stop offset="100%" stopColor="#7C2D12" />
                    </linearGradient>
                    <linearGradient id="d4s" x1="0%" y1="0%" x2="35%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                      <stop offset="60%" stopColor="rgba(255,255,255,0.1)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <path d={SHIELD} fill="#F97316" opacity="0.18" transform="scale(1.14) translate(-5,-5.5)" />
                  <path d={SHIELD} fill="url(#d4g)" />
                  <path d={INNER}  fill="rgba(0,0,0,0.3)" />
                  <path d={SHIELD} fill="url(#d4s)" />
                  <path d={SHIELD} fill="none" stroke="#FB923C" strokeWidth="2" opacity="0.95" />
                  <path d={SHIELD} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="4,4" />
                  <path d={INNER}  fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
                  <line x1="24" y1="68" x2="56" y2="68" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
                  <circle cx="40" cy="74" r="3" fill="rgba(255,255,255,0.45)" />
                  <text x="40" y="84" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="monospace" fontWeight="bold">12</text>
                  <text x="40" y="44" textAnchor="middle" fill="white" fontSize="24">⚔</text>
                </svg>
              </div>

              {/* tier label chip */}
              <div style={{ background:"transparent", border:"1px solid #F97316aa", padding:"4px 16px", fontFamily:"monospace", fontSize:10, color:"#F97316", letterSpacing:"0.2em", textAlign:"center", width:"100%", boxSizing:"border-box", textTransform:"uppercase", boxShadow:"0 0 12px #F9731633 inset, 0 0 8px #F9731633" }}>
                DIV I ★
              </div>
            </div>

            {/* info panel */}
            <div style={{ flex:1, padding:"24px 28px" }}>
              {/* Arabic + English name */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontFamily:"monospace", fontSize:9, color:"#F9731666", letterSpacing:"0.35em", marginBottom:6 }}>[ الرتبة الحالية ]</div>
                <div style={{ fontFamily:"'Arial Black',sans-serif", fontSize:44, fontWeight:900, lineHeight:1, background:"linear-gradient(180deg,#FFFFFF 0%,#FB923C 60%,#F97316 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:4 }}>
                  محارب
                </div>
                <div style={{ fontFamily:"monospace", fontSize:10, color:"#F9731688", letterSpacing:"0.3em" }}>WARRIOR // LVL 12</div>
              </div>

              {/* XP section */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:9, marginBottom:5 }}>
                  <span style={{ color:"#FB923C" }}>█ 101 XP</span>
                  <span style={{ color:"#444" }}>400 XP ▓</span>
                </div>
                <div style={{ height:8, background:"#0f0f0f", border:"1px solid #F9731633", position:"relative", overflow:"hidden" }}>
                  <div style={{ width:"25%", height:"100%", background:"linear-gradient(90deg,#7C2D12,#F97316,#FDBA74)", boxShadow:"0 0 16px #F9731699, 0 0 8px #F97316" }} />
                  {/* scanline on bar */}
                  <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(90deg,transparent,transparent 4px,rgba(0,0,0,0.3) 4px,rgba(0,0,0,0.3) 5px)" }} />
                </div>
                <div style={{ fontFamily:"monospace", fontSize:9, color:"#F9731655", marginTop:5 }}>299 XP_REMAINING → LEVEL_13</div>
              </div>

              {/* stats */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {[["04","ALLIES"],["01","REQUESTS"],["00","PARTIES"],["00","SIGNALS"]].map(([n,l])=>(
                  <div key={l} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#0d0d0d", border:"1px solid #1e1e1e" }}>
                    <span style={{ fontFamily:"monospace", fontSize:18, fontWeight:900, color:"#F97316", minWidth:30 }}>{n}</span>
                    <span style={{ fontFamily:"monospace", fontSize:8, color:"#444", letterSpacing:"0.15em" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
