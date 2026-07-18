import { useState, useEffect } from "react";
import "./neon.css";

const FRIENDS = [
  { id:1, name:"Khalid", username:"kx97",    game:"Valorant",     status:"online", color:"#FF2D78" },
  { id:2, name:"Sara",   username:"saraXO",  game:"Apex Legends", status:"online", color:"#00F5FF" },
  { id:3, name:"Nasser", username:"n4sser",  game:null,           status:"away",   color:"#BF00FF" },
  { id:4, name:"Faisal", username:"fz_pro",  game:"CS2",          status:"online", color:"#39FF14" },
  { id:5, name:"Reem",   username:"reemgx",  game:"Overwatch 2",  status:"online", color:"#FF6B00" },
  { id:6, name:"Omar",   username:"o_games", game:null,           status:"busy",   color:"#FFE600" },
];

const ACTIONS = [
  { icon:"⚔️", label:"PARTY" },
  { icon:"📡", label:"LFG"   },
  { icon:"🎙️", label:"VOICE" },
  { icon:"💬", label:"CHAT"  },
  { icon:"🏆", label:"RANKS" },
];

const FEED = [
  { color:"#FF2D78", text:'Khalid انضم لـ Valorant',         time:"00:03" },
  { color:"#00F5FF", text:'Sara حققت "Apex Predator"',        time:"00:11" },
  { color:"#39FF14", text:'Faisal نشر LFG في CS2',           time:"00:22" },
  { color:"#BF00FF", text:'Nasser أكمل تحدي الأسبوع',        time:"00:35" },
  { color:"#FF6B00", text:'Reem تلعب Overwatch 2',           time:"00:47" },
];

function Scanlines() {
  return <div className="scanlines" aria-hidden />;
}

function GlitchTitle({ text }: { text: string }) {
  return (
    <div className="glitch-wrap">
      <span className="glitch-text" data-text={text}>{text}</span>
    </div>
  );
}

function NeonStat({ value, unit, label, color }: { value:string; unit:string; label:string; color:string }) {
  return (
    <div className="neon-stat" style={{ "--nc": color } as any}>
      <div className="neon-val" style={{ color, textShadow:`0 0 20px ${color},0 0 40px ${color}60` }}>
        {value}<span style={{ fontSize:14 }}>{unit}</span>
      </div>
      <div className="neon-lbl">{label}</div>
    </div>
  );
}

export function NeonArcade() {
  const [frame, setFrame] = useState(0);
  useEffect(() => { const id = setInterval(() => setFrame(f => f+1), 80); return () => clearInterval(id); }, []);

  const [hoverId, setHoverId] = useState<number|null>(null);
  const [dockActive, setDockActive] = useState<number|null>(null);

  // Ticker
  const [tickX, setTickX] = useState(0);
  useEffect(() => { const id = setInterval(() => setTickX(x => (x+1.2)%1400), 30); return () => clearInterval(id); }, []);
  const tickItems = FEED.map(f => `${f.text}   ◆   `).join("");

  return (
    <div className="neon-root">
      <Scanlines />

      {/* top bar */}
      <div className="neon-topbar">
        <div className="neon-logo">
          <span style={{ color:"#FF2D78", textShadow:"0 0 12px #FF2D78" }}>GAME</span>
          <span style={{ color:"#00F5FF", textShadow:"0 0 12px #00F5FF" }}>HUB</span>
        </div>
        <div className="neon-ticker-wrap">
          <span className="neon-ticker-live" style={{ background:"#FF2D78", boxShadow:"0 0 10px #FF2D78" }}>LIVE</span>
          <div className="neon-ticker-track">
            <span className="neon-ticker-text" style={{ transform:`translateX(-${tickX}px)` }}>
              {tickItems}{tickItems}
            </span>
          </div>
        </div>
        <div className="neon-clock">{String(Math.floor(frame/12)%24).padStart(2,"0")}:{String(frame%60).padStart(2,"0")}</div>
      </div>

      {/* hero */}
      <div className="neon-hero">
        <div>
          <GlitchTitle text="مرحباً FAISAL" />
          <div className="neon-status">
            <span className="status-blink" style={{ background:"#39FF14", boxShadow:"0 0 8px #39FF14" }} />
            ONLINE · READY
          </div>
        </div>
        <div className="neon-stats-row">
          <NeonStat value="24" unit="h"  label="هذا الأسبوع" color="#FF2D78" />
          <NeonStat value="#3" unit=""   label="الرتبة"       color="#FFE600" />
          <NeonStat value="4"  unit=""   label="Online"       color="#00F5FF" />
        </div>
      </div>

      {/* dock */}
      <div className="neon-dock">
        {ACTIONS.map((a,i) => (
          <button key={i}
            className={`neon-dock-btn ${dockActive===i?"neon-dock-btn--on":""}`}
            onMouseEnter={() => setDockActive(i)}
            onMouseLeave={() => setDockActive(null)}
          >
            <span className="nd-icon">{a.icon}</span>
            <span className="nd-label">{a.label}</span>
            {dockActive===i && <span className="nd-glow" style={{ background:"#FF2D78" }} />}
          </button>
        ))}
      </div>

      {/* main */}
      <div className="neon-main">
        {/* friends */}
        <div className="neon-panel neon-panel--friends">
          <div className="neon-panel-hd">
            <span style={{ color:"#00F5FF", textShadow:"0 0 8px #00F5FF" }}>◉</span>
            <span className="neon-panel-title">NETWORK</span>
            <span className="neon-count">4 ONLINE</span>
          </div>
          <div className="neon-friends">
            {FRIENDS.map(f => (
              <div key={f.id}
                className={`neon-fc ${hoverId===f.id?"neon-fc--hov":""}`}
                style={{ "--fc":f.color } as any}
                onMouseEnter={() => setHoverId(f.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <div className="neon-fc-border" style={{
                  border:`1px solid ${hoverId===f.id?f.color:"#1a1a1a"}`,
                  boxShadow: hoverId===f.id?`0 0 16px ${f.color}60,inset 0 0 8px ${f.color}20`:undefined,
                }} />
                <div className="neon-avatar" style={{ color:f.color, textShadow:`0 0 10px ${f.color}` }}>
                  {f.name.charAt(0)}
                </div>
                <div className={`neon-status-dot ${f.status==="online"?"neon-dot--on":f.status==="away"?"neon-dot--aw":"neon-dot--bz"}`} />
                <div className="neon-fc-info">
                  <div className="neon-fc-name" style={{ color:f.color }}>{f.name}</div>
                  <div className="neon-fc-user">@{f.username}</div>
                  {f.game
                    ? <div className="neon-fc-game">▶ {f.game}</div>
                    : <div className="neon-fc-idle">{f.status.toUpperCase()}</div>
                  }
                </div>
                {hoverId===f.id && (
                  <div className="neon-fc-actions">
                    <button className="nfc-btn" style={{ color:f.color, borderColor:f.color }}>📞</button>
                    <button className="nfc-btn" style={{ color:f.color, borderColor:f.color }}>💬</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* side */}
        <div className="neon-side">
          {/* feed */}
          <div className="neon-panel">
            <div className="neon-panel-hd">
              <span style={{ color:"#BF00FF", textShadow:"0 0 8px #BF00FF" }}>◈</span>
              <span className="neon-panel-title">ACTIVITY FEED</span>
            </div>
            <div className="neon-feed">
              {FEED.map((f,i) => (
                <div key={i} className="neon-feed-row">
                  <div className="neon-feed-dot" style={{ background:f.color, boxShadow:`0 0 6px ${f.color}` }} />
                  <div className="neon-feed-text">{f.text}</div>
                  <div className="neon-feed-time">{f.time}</div>
                </div>
              ))}
            </div>
          </div>

          {/* challenge */}
          <div className="neon-panel">
            <div className="neon-panel-hd">
              <span style={{ color:"#FFE600", textShadow:"0 0 8px #FFE600" }}>◆</span>
              <span className="neon-panel-title">WEEKLY CHALLENGE</span>
            </div>
            <div className="neon-challenge">
              <div className="neon-ch-title">فاتح البارتيات</div>
              <div className="neon-ch-bar">
                <div className="neon-ch-fill" style={{ width:"60%", background:"#FFE600", boxShadow:"0 0 12px #FFE600" }} />
              </div>
              <div className="neon-ch-meta">
                <span style={{ color:"#FFE600" }}>3/5</span>
                <span>⏱ يومان</span>
              </div>
            </div>
          </div>

          {/* pro */}
          <div className="neon-panel neon-panel--pro">
            <div className="neon-pro-crown">👑</div>
            <div className="neon-pro-text">
              <div style={{ color:"#FFE600", textShadow:"0 0 12px #FFE600", fontWeight:900, letterSpacing:4, fontSize:16 }}>PRO ACTIVE</div>
              <div style={{ color:"#555", fontSize:10 }}>ينتهي ١٦ أغسطس ٢٠٢٦</div>
            </div>
            <div className="neon-pro-pill">✓ ACTIVE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
