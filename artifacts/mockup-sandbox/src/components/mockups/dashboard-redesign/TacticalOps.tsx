import { useState, useEffect } from "react";
import "./tactical.css";

const FRIENDS = [
  { id:1, name:"Khalid", call:"ALPHA-1", game:"Valorant",     status:"active",   threat:"LOW"  },
  { id:2, name:"Sara",   call:"ALPHA-2", game:"Apex Legends", status:"active",   threat:"LOW"  },
  { id:3, name:"Nasser", call:"BRAVO-1", game:null,           status:"standby",  threat:"NONE" },
  { id:4, name:"Faisal", call:"ALPHA-3", game:"CS2",          status:"active",   threat:"MED"  },
  { id:5, name:"Reem",   call:"CHARLIE", game:"Overwatch 2",  status:"active",   threat:"LOW"  },
  { id:6, name:"Omar",   call:"DELTA-1", game:null,           status:"offline",  threat:"NONE" },
];

const OPS_LOG = [
  { time:"02:47:03", code:"INFO",  text:"Khalid joined OP: Rush Squad [Valorant]" },
  { time:"02:39:11", code:"ALERT", text:'Sara unlocked CLASSIFIED achievement' },
  { time:"02:28:22", code:"INFO",  text:"Faisal broadcast LFG beacon [CS2]" },
  { time:"02:15:35", code:"WARN",  text:"Nasser comms offline — standby mode" },
  { time:"02:03:47", code:"INFO",  text:"New voice room detected: استراحة" },
];

function GridOverlay() {
  return (
    <svg className="tac-grid" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="tgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(180,130,0,0.06)" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tgrid)" />
    </svg>
  );
}

function RadarPing({ x, y, color }: { x:number; y:number; color:string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="4" fill={color} />
      <circle cx={x} cy={y} r="4" fill="none" stroke={color} strokeWidth="1" className="radar-ring" />
    </g>
  );
}

function MiniRadar() {
  const pings = [
    { x:60,  y:50,  color:"#B4B400" },
    { x:100, y:80,  color:"#B4B400" },
    { x:80,  y:110, color:"#B4B400" },
    { x:40,  y:90,  color:"#884400" },
    { x:120, y:40,  color:"#B4B400" },
    { x:30,  y:60,  color:"#444" },
  ];
  const [sweep, setSweep] = useState(0);
  useEffect(() => { const id = setInterval(() => setSweep(s => (s+2)%360), 30); return () => clearInterval(id); }, []);

  const rad = sweep * Math.PI/180;
  const ex = 75 + 70*Math.cos(rad), ey = 75 + 70*Math.sin(rad);

  return (
    <div className="tac-radar-wrap">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="none" stroke="rgba(180,130,0,0.2)" strokeWidth="1"/>
        <circle cx="75" cy="75" r="50" fill="none" stroke="rgba(180,130,0,0.12)" strokeWidth="0.5"/>
        <circle cx="75" cy="75" r="30" fill="none" stroke="rgba(180,130,0,0.12)" strokeWidth="0.5"/>
        <line x1="75" y1="5" x2="75" y2="145" stroke="rgba(180,130,0,0.1)" strokeWidth="0.5"/>
        <line x1="5" y1="75" x2="145" y2="75" stroke="rgba(180,130,0,0.1)" strokeWidth="0.5"/>
        {/* sweep */}
        <defs>
          <radialGradient id="swpg" cx="75" cy="75" r="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(180,130,0,0.3)" />
            <stop offset="100%" stopColor="rgba(180,130,0,0)" />
          </radialGradient>
        </defs>
        <path d={`M 75 75 L ${ex} ${ey} A 70 70 0 0 0 ${75+70*Math.cos(rad-0.8)} ${75+70*Math.sin(rad-0.8)} Z`} fill="url(#swpg)" />
        <line x1="75" y1="75" x2={ex} y2={ey} stroke="rgba(180,130,0,0.8)" strokeWidth="1.5"/>
        {pings.map((p,i) => <RadarPing key={i} {...p} />)}
        <circle cx="75" cy="75" r="3" fill="#B4B400"/>
      </svg>
      <div className="tac-radar-label">TACTICAL MAP</div>
    </div>
  );
}

function StatusCode({ code }: { code:string }) {
  const map: Record<string,string> = { INFO:"#556b2f", ALERT:"#B4B400", WARN:"#884400", ERROR:"#8b0000" };
  return <span className="tac-code" style={{ color:map[code]||"#555", border:`1px solid ${map[code]||"#333"}` }}>{code}</span>;
}

export function TacticalOps() {
  const [sel, setSel] = useState<number|null>(null);
  const [time, setTime] = useState(new Date("2026-07-18T02:47:00"));
  useEffect(() => {
    const id = setInterval(() => setTime(t => new Date(t.getTime()+1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;

  return (
    <div className="tac-root">
      <GridOverlay />

      {/* top bar */}
      <div className="tac-topbar">
        <div className="tac-topbar-left">
          <div className="tac-classification">◈ CLASSIFIED · LEVEL 3 ◈</div>
          <div className="tac-op">OPERATION: GAME WORLD HUB</div>
        </div>
        <div className="tac-clock">{fmt(time)} UTC</div>
        <div className="tac-topbar-right">
          <div className="tac-id">AGENT: FAISAL</div>
          <div className="tac-clearance">CLEARANCE: PRO</div>
        </div>
      </div>

      {/* stats strip */}
      <div className="tac-stats">
        {[
          { k:"OPS HOURS",   v:"24H",  c:"#B4B400" },
          { k:"RANK",        v:"#003", c:"#884400" },
          { k:"ACTIVE UNITS",v:"4/6",  c:"#556b2f" },
          { k:"THREAT LVL",  v:"LOW",  c:"#556b2f" },
        ].map(s => (
          <div key={s.k} className="tac-stat">
            <div className="tac-stat-k">{s.k}</div>
            <div className="tac-stat-v" style={{ color:s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* main grid */}
      <div className="tac-body">

        {/* units roster */}
        <div className="tac-panel" style={{ gridArea:"roster" }}>
          <div className="tac-ph">
            <span className="tac-ph-tag">ALPHA SQUAD</span>
            <span className="tac-ph-count">4 ACTIVE · 2 OFFLINE</span>
          </div>
          <table className="tac-table">
            <thead>
              <tr>
                <th>CALLSIGN</th>
                <th>OPERATOR</th>
                <th>OBJECTIVE</th>
                <th>STATUS</th>
                <th>ACT</th>
              </tr>
            </thead>
            <tbody>
              {FRIENDS.map(f => (
                <tr key={f.id}
                  className={`tac-row ${sel===f.id?"tac-row--sel":""} ${f.status==="offline"?"tac-row--off":""}`}
                  onClick={() => setSel(s => s===f.id?null:f.id)}
                >
                  <td className="tac-callsign">{f.call}</td>
                  <td>{f.name}</td>
                  <td className="tac-obj">{f.game||"—"}</td>
                  <td>
                    <span className={`tac-badge tac-badge--${f.status}`}>{f.status.toUpperCase()}</span>
                  </td>
                  <td>
                    <div className="tac-acts">
                      <button className="tac-act-btn">COM</button>
                      <button className="tac-act-btn">MSG</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* radar */}
        <div className="tac-panel tac-panel--radar" style={{ gridArea:"radar" }}>
          <div className="tac-ph"><span className="tac-ph-tag">RADAR</span></div>
          <div className="tac-radar-center">
            <MiniRadar />
          </div>
        </div>

        {/* ops log */}
        <div className="tac-panel" style={{ gridArea:"log" }}>
          <div className="tac-ph"><span className="tac-ph-tag">OPS LOG</span></div>
          <div className="tac-log">
            {OPS_LOG.map((l,i) => (
              <div key={i} className="tac-log-row">
                <span className="tac-log-time">{l.time}</span>
                <StatusCode code={l.code} />
                <span className="tac-log-txt">{l.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* mission */}
        <div className="tac-panel" style={{ gridArea:"mission" }}>
          <div className="tac-ph"><span className="tac-ph-tag">ACTIVE MISSION</span></div>
          <div className="tac-mission">
            <div className="tac-m-name">فاتح البارتيات</div>
            <div className="tac-m-desc">انضم لـ 5 بارتيات مختلفة هذا الأسبوع</div>
            <div className="tac-m-progress">
              <div className="tac-m-bar">
                <div className="tac-m-fill" style={{ width:"60%" }} />
              </div>
              <span>3 / 5</span>
            </div>
            <div className="tac-m-reward">⬡ REWARD: 200 XP + CLASSIFIED BADGE</div>
            <div className="tac-m-time">TIME REMAINING: 48:00:00</div>
          </div>
        </div>

      </div>

      {/* quick actions */}
      <div className="tac-footer">
        {["DEPLOY PARTY","BROADCAST LFG","OPEN COMMS","JOIN INTEL","MISSION LOG"].map((a,i) => (
          <button key={i} className="tac-footer-btn">▸ {a}</button>
        ))}
      </div>
    </div>
  );
}
