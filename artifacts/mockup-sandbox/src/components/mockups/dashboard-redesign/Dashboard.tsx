import { useState, useEffect, useRef } from "react";
import "./dashboard.css";

// ── Mock Data ──────────────────────────────────────────────────────────────────

const ME = { name:"Faisal", level:42, xp:7340, xpNext:8000, streak:12, rank:3, totalFriends:6, kd:2.4, winRate:67 };

const FRIENDS = [
  { id:1, name:"Khalid", username:"kx97",    game:"Valorant",     rank:"DIAMOND", hours:312, status:"online", color:"#EC4899", initial:"K", isStreaming:true  },
  { id:2, name:"Sara",   username:"saraXO",  game:"Apex Legends", rank:"PLAT",    hours:218, status:"online", color:"#06B6D4", initial:"S", isStreaming:false },
  { id:3, name:"Nasser", username:"n4sser",  game:null,           rank:"GOLD",    hours:145, status:"away",   color:"#A855F7", initial:"N", isStreaming:false },
  { id:4, name:"Faisal2",username:"fz_pro",  game:"CS2",          rank:"MASTER",  hours:499, status:"online", color:"#22C55E", initial:"F", isStreaming:false },
  { id:5, name:"Reem",   username:"reemgx",  game:"Overwatch 2",  rank:"PLAT",    hours:187, status:"online", color:"#F97316", initial:"R", isStreaming:false },
  { id:6, name:"Omar",   username:"o_games", game:null,           rank:"SILVER",  hours:92,  status:"busy",   color:"#FFD700", initial:"O", isStreaming:false },
];

const LEADERBOARD = [
  { name:"Faisal2", pts:4820, color:"#22C55E" },
  { name:"Khalid",  pts:4310, color:"#EC4899" },
  { name:"Faisal",  pts:3990, color:"#06B6D4", isMe:true },
  { name:"Sara",    pts:3720, color:"#A855F7" },
  { name:"Reem",    pts:2880, color:"#F97316" },
];

const TICKER_EVENTS = [
  { color:"#EC4899", text:"⚡ Khalid انضم لبارتي Valorant RANKED" },
  { color:"#FFD700", text:'🏆 Sara حققت "Apex Predator" • 0.1% لاعب' },
  { color:"#22C55E", text:"📡 Faisal نشر LFG في CS2 Premier" },
  { color:"#A855F7", text:"👑 Nasser أكمل تحدي الأسبوع المميز" },
  { color:"#F97316", text:"🎙️ غرفة صوتية — \"استراحة الجيمرز\" مفتوحة" },
  { color:"#06B6D4", text:"🔥 بطولة نهائي الأسبوع • تبقى 2 ساعة فقط" },
  { color:"#EC4899", text:"🎰 Khalid فاز بـ 500 XP من العجلة اليومية!" },
];

const ACHIEVEMENTS = [
  { icon:"🏆", name:"Apex Predator", desc:"وصلت للرتبة الأعلى في Apex", rarity:"LEGENDARY", color:"#FFD700" },
  { icon:"⚡", name:"Rush Master",   desc:"فزت بـ 10 مباريات متتالية",  rarity:"EPIC",      color:"#A855F7" },
  { icon:"🎯", name:"Party Leader",  desc:"قدت 50 بارتي للفوز",          rarity:"RARE",      color:"#06B6D4" },
];

const HIGHLIGHTS = [
  { user:"Khalid",  clip:"Ace Round Valorant 🔥",          views:"12K", ago:"2m", color:"#EC4899" },
  { user:"Sara",    clip:"Apex Predator Montage ⚡",        views:"8.4K",ago:"7m", color:"#06B6D4" },
  { user:"Faisal2", clip:"5K AWP في CS2 Premier 💥",       views:"21K", ago:"15m",color:"#22C55E" },
  { user:"Reem",    clip:"Overwatch Triple Elimination 🎯", views:"5.1K",ago:"28m",color:"#F97316" },
];

const SPIN_PRIZES = [
  { label:"500 XP",     color:"#22C55E", icon:"⚡" },
  { label:"MISS",       color:"#333",    icon:"💨" },
  { label:"Pro يوم",    color:"#FFD700", icon:"👑" },
  { label:"200 XP",     color:"#06B6D4", icon:"🎯" },
  { label:"MISS",       color:"#333",    icon:"💨" },
  { label:"شارة نادرة", color:"#A855F7", icon:"🏅" },
  { label:"1000 XP",    color:"#EF4444", icon:"🔥" },
  { label:"100 XP",     color:"#F97316", icon:"🎁" },
];

const WEEK_GRAPH = [3,7,2,9,5,11,8]; // wins per day
const WEEK_DAYS  = ["أح","إث","ث","أر","خ","ج","س"];
const MOODS = [
  { icon:"😤", label:"يلا نلعب" },
  { icon:"😎", label:"كاجوال" },
  { icon:"🎯", label:"تدريب" },
  { icon:"🏆", label:"Ranked" },
  { icon:"😴", label:"سأنام" },
];

const TOURNAMENTS = [
  { name:"GWH Cup — Final",    date:"غداً 8م",   prize:"5,000 ريال", game:"Valorant",    color:"#EF4444", hot:true  },
  { name:"CS2 Weekly Open",    date:"الجمعة 9م", prize:"1,000 ريال", game:"CS2",         color:"#F97316", hot:false },
  { name:"Apex Legends Solo",  date:"السبت 7م",  prize:"2,500 ريال", game:"Apex Legends",color:"#A855F7", hot:false },
];

// ── Ticker ─────────────────────────────────────────────────────────────────────
function LiveTicker() {
  const [offset, setOffset] = useState(0);
  const text = TICKER_EVENTS.map(e => e.text).join("   ◆   ");
  useEffect(() => {
    const id = setInterval(() => setOffset(o => (o + 0.9) % (text.length * 7.2)), 20);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div className="ticker-bar">
      <div className="ticker-live-pill"><span className="ticker-dot" />LIVE</div>
      <div className="ticker-track">
        <div className="ticker-inner" style={{ transform:`translateX(-${offset}px)` }}>
          {[...TICKER_EVENTS,...TICKER_EVENTS].map((e,i) => (
            <span key={i} className="ticker-item">
              <span style={{ color:e.color }}>{e.text}</span>
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── XP Bar ─────────────────────────────────────────────────────────────────────
function XpBar() {
  const pct = (ME.xp / ME.xpNext) * 100;
  return (
    <div className="xp-wrap">
      <div className="xp-header">
        <span className="xp-level">LVL {ME.level}</span>
        <span className="xp-nums">{ME.xp.toLocaleString()} / {ME.xpNext.toLocaleString()} XP</span>
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width:`${pct}%` }}><div className="xp-shimmer" /></div>
        <div className="xp-glow" style={{ left:`${pct}%` }} />
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: { icon:string; value:string; label:string; color:string; sub?:string }) {
  const [count, setCount] = useState(0);
  const target = parseInt(value.replace(/\D/g,"")) || 0;
  useEffect(() => {
    let s = 0; const inc = target/28;
    const id = setInterval(() => { s+=inc; if(s>=target){setCount(target);clearInterval(id);}else setCount(Math.floor(s)); },28);
    return () => clearInterval(id);
  }, [target]);
  const display = value.replace(/\d+/, String(count));
  return (
    <div className="stat-card" style={{ "--sc":color } as any}>
      <div className="stat-top"><span className="stat-icon">{icon}</span><div className="stat-corner" style={{ background:color }} /></div>
      <div className="stat-value" style={{ color }}>{display}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-glow" style={{ background:color }} />
    </div>
  );
}

// ── Mood Status ────────────────────────────────────────────────────────────────
function MoodStatus() {
  const [selected, setSelected] = useState(0);
  return (
    <div className="mood-bar">
      <span className="mood-title">حالتك:</span>
      {MOODS.map((m,i) => (
        <button key={i}
          className={`mood-btn ${selected===i?"mood-btn--on":""}`}
          onClick={() => setSelected(i)}>
          {m.icon} {m.label}
        </button>
      ))}
    </div>
  );
}

// ── Quick Dock ─────────────────────────────────────────────────────────────────
const DOCK_ITEMS = [
  { icon:"⚔️", label:"بارتي جديد",  badge:null,  color:"#22C55E" },
  { icon:"📡", label:"نشر LFG",     badge:"3",   color:"#EC4899" },
  { icon:"🎙️", label:"غرفة صوتية",  badge:null,  color:"#06B6D4" },
  { icon:"💬", label:"الرسائل",     badge:"7",   color:"#A855F7" },
  { icon:"🏆", label:"التحديات",    badge:"!",   color:"#FFD700" },
  { icon:"📺", label:"البث المباشر", badge:"1",  color:"#EF4444" },
];

function QuickDock() {
  const [hov, setHov] = useState<number|null>(null);
  return (
    <div className="dock-bar">
      {DOCK_ITEMS.map((d,i) => (
        <button key={i} className={`dock-item ${hov===i?"dock-item--active":""}`}
          style={{ "--dc":d.color } as any}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
          <span className="dock-icon">{d.icon}</span>
          <span className="dock-label">{d.label}</span>
          {d.badge && <span className="dock-badge" style={{ background:d.badge==="!"?"#EF4444":d.color }}>{d.badge}</span>}
          {hov===i && <div className="dock-underline" style={{ background:d.color }} />}
        </button>
      ))}
      <div className="dock-streak"><span className="streak-fire">🔥</span><span className="streak-num">{ME.streak}</span><span className="streak-label">يوم</span></div>
    </div>
  );
}

// ── Daily Spin ─────────────────────────────────────────────────────────────────
function DailySpin() {
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<typeof SPIN_PRIZES[0]|null>(null);
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!done) return;
    setSecondsLeft(10);
    const id = setInterval(() => setSecondsLeft(s => { if(s<=1){clearInterval(id);return 0;} return s-1; }), 1000);
    return () => clearInterval(id);
  }, [done]);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true); setResult(null);
    const idx = Math.floor(Math.random() * SPIN_PRIZES.length);
    const targetAngle = angle + 1440 + (360/SPIN_PRIZES.length)*idx + (360/SPIN_PRIZES.length/2);
    setAngle(targetAngle);
    setTimeout(() => {
      setResult(SPIN_PRIZES[idx]);
      setSpinning(false); setDone(true);
    }, 3200);
  };

  const sliceAngle = 360 / SPIN_PRIZES.length;

  return (
    <div className="spin-box section-box">
      <div className="section-hd">
        <span className="section-title">🎰 عجلة اليوم</span>
        {done && secondsLeft > 0
          ? <span className="spin-reset">تعود بعد 23:{String(59-secondsLeft).padStart(2,"0")}h</span>
          : !done && <span className="spin-free-badge">مجاناً!</span>
        }
      </div>
      <div className="spin-inner">
        <div className="spin-wrap">
          <div className="spin-pointer" />
          <div className="spin-wheel" style={{ transform:`rotate(${angle}deg)`, transition:spinning?"transform 3.2s cubic-bezier(.17,.67,.12,1)":"none" }}>
            {SPIN_PRIZES.map((p,i) => {
              const rot = i * sliceAngle;
              return (
                <div key={i} className="spin-slice" style={{
                  transform:`rotate(${rot}deg)`,
                  background:i%2===0?`${p.color}22`:`${p.color}14`,
                  borderTop:`1px solid ${p.color}40`,
                }}>
                  <div className="spin-slice-content" style={{ transform:`rotate(${sliceAngle/2}deg) translateY(-52px)` }}>
                    <div className="spin-slice-icon">{p.icon}</div>
                    <div className="spin-slice-label" style={{ color:p.color }}>{p.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="spin-center" onClick={spin}>
            {spinning ? <div className="spin-center-ring" /> : <span className="spin-center-text">{done?"✓":"GO"}</span>}
          </div>
        </div>

        {result && (
          <div className="spin-result" style={{ borderColor:result.color, background:`${result.color}12` }}>
            <div className="spin-result-icon">{result.icon}</div>
            <div style={{ color:result.color }} className="spin-result-label">
              {result.label === "MISS" ? "😅 حظاً أوفر غداً!" : `🎉 فزت بـ ${result.label}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Weekly Graph ───────────────────────────────────────────────────────────────
function WeeklyGraph() {
  const max = Math.max(...WEEK_GRAPH);
  const todayIdx = 6; // Saturday = today
  const total = WEEK_GRAPH.reduce((a,b)=>a+b,0);
  const bestIdx = WEEK_GRAPH.indexOf(max);
  const [hov, setHov] = useState<number|null>(null);

  return (
    <div className="section-box wg-box">
      <div className="section-hd">
        <span className="section-title">📈 انتصارات الأسبوع</span>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span className="wg-up-badge">▲ 31%</span>
          <span style={{ fontSize:9,color:"#555" }}>vs الأسبوع الماضي</span>
        </div>
      </div>

      <div className="wg-body">
        {/* summary row */}
        <div className="wg-summary">
          <div className="wg-sum-item">
            <span className="wg-sum-val" style={{ color:"#22C55E" }}>{total}</span>
            <span className="wg-sum-label">انتصار</span>
          </div>
          <div className="wg-divider"/>
          <div className="wg-sum-item">
            <span className="wg-sum-val" style={{ color:"#FFD700" }}>{ME.kd}</span>
            <span className="wg-sum-label">K/D</span>
          </div>
          <div className="wg-divider"/>
          <div className="wg-sum-item">
            <span className="wg-sum-val" style={{ color:"#06B6D4" }}>{ME.winRate}%</span>
            <span className="wg-sum-label">Win Rate</span>
          </div>
        </div>

        {/* bars */}
        <div className="wg-bars">
          {WEEK_GRAPH.map((v, i) => {
            const pct = (v / max) * 100;
            const isToday = i === todayIdx;
            const isBest  = i === bestIdx;
            const isHov   = hov === i;
            const color   = isToday ? "#22C55E" : isBest ? "#FFD700" : "#06B6D4";
            return (
              <div key={i} className="wg-bar-col"
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
                {/* tooltip */}
                {isHov && (
                  <div className="wg-tooltip" style={{ borderColor:color, color }}>
                    {v}W
                    {isBest && <span className="wg-best-tag">🏆 أفضل</span>}
                  </div>
                )}
                {/* bar track */}
                <div className="wg-track">
                  <div className="wg-fill"
                    style={{
                      height:`${pct}%`,
                      background:isToday
                        ? "linear-gradient(180deg,#4ADE80,#22C55E)"
                        : isBest
                        ? "linear-gradient(180deg,#FDE68A,#FFD700)"
                        : "linear-gradient(180deg,#38BDF8,#06B6D4)",
                      boxShadow:isHov?`0 0 12px ${color}80`:"none",
                      opacity:isHov?1:0.75,
                    }}>
                    <div className="wg-fill-shine"/>
                  </div>
                  {(isToday||isBest) && (
                    <div className="wg-marker" style={{ background:color, boxShadow:`0 0 8px ${color}` }}/>
                  )}
                </div>
                {/* day label */}
                <div className="wg-day" style={{ color:isToday?"#22C55E":isBest?"#FFD700":"#444", fontWeight:isToday||isBest?900:400 }}>
                  {WEEK_DAYS[i]}
                </div>
                {isToday && <div className="wg-today-tag">اليوم</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Live Streams ───────────────────────────────────────────────────────────────
function LiveStreams() {
  const streaming = FRIENDS.filter(f => f.isStreaming);
  const [pulse, setPulse] = useState(false);
  useEffect(() => { const id = setInterval(()=>setPulse(p=>!p),800); return ()=>clearInterval(id); },[]);

  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">📺 بث مباشر</span>
        <div className="live-stream-badge" style={{ opacity:pulse?1:0.5 }}>🔴 LIVE</div>
      </div>
      <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
        {streaming.map(f => (
          <div key={f.id} className="stream-row">
            <div className="stream-av" style={{ background:`linear-gradient(135deg,${f.color}80,${f.color}20)`, borderColor:f.color }}>
              {f.initial}
              <div className="stream-live-dot" />
            </div>
            <div className="stream-info">
              <div className="stream-name">{f.name}</div>
              <div className="stream-game" style={{ color:f.color }}>{f.game}</div>
            </div>
            <div style={{ display:"flex",gap:4 }}>
              <span className="stream-viewers">👁 2.1K</span>
              <button className="stream-watch-btn" style={{ borderColor:f.color, color:f.color }}>شاهد</button>
            </div>
          </div>
        ))}
        {streaming.length === 0 && <p style={{ fontSize:10,color:"#444",textAlign:"center",padding:"8px 0" }}>لا أحد يبث الآن</p>}
        <div className="stream-goto-btn">استعراض البثوث المباشرة ↗</div>
      </div>
    </div>
  );
}

// ── 1v1 Challenge ─────────────────────────────────────────────────────────────
function ChallengeVs() {
  const [sel, setSel] = useState<typeof FRIENDS[0]|null>(null);
  const [sent, setSent] = useState(false);
  const onlineFriends = FRIENDS.filter(f => f.status==="online");

  return (
    <div className="section-box vs-box">
      <div className="section-hd">
        <span className="section-title">⚔️ تحدي 1v1</span>
        <span style={{ fontSize:9, color:"#EF4444", letterSpacing:1 }}>مباشر</span>
      </div>
      <div className="vs-inner">
        <div className="vs-you">
          <div className="vs-av" style={{ background:"linear-gradient(135deg,#06B6D4,#06B6D430)", borderColor:"#06B6D4" }}>F</div>
          <div className="vs-name">أنت</div>
          <div className="vs-rank">LVL {ME.level}</div>
        </div>
        <div className="vs-middle">
          <div className="vs-text">VS</div>
          {sent && <div className="vs-sent">✓ تم الإرسال!</div>}
        </div>
        <div className="vs-enemy">
          {sel ? (
            <>
              <div className="vs-av" style={{ background:`linear-gradient(135deg,${sel.color},${sel.color}30)`, borderColor:sel.color }}>{sel.initial}</div>
              <div className="vs-name">{sel.name}</div>
              <div className="vs-rank" style={{ color:sel.color }}>{sel.rank}</div>
            </>
          ) : (
            <div className="vs-pick">اختر خصماً</div>
          )}
        </div>
      </div>
      <div className="vs-friends">
        {onlineFriends.map(f => (
          <button key={f.id}
            className={`vs-chip ${sel?.id===f.id?"vs-chip--on":""}`}
            style={{ borderColor:sel?.id===f.id?f.color:"#222", color:sel?.id===f.id?f.color:"#666" }}
            onClick={() => { setSel(f); setSent(false); }}>
            {f.initial} {f.name}
          </button>
        ))}
      </div>
      <button className={`vs-send-btn ${!sel||sent?"vs-send-btn--dis":""}`}
        onClick={() => sel && setSent(true)}>
        {sent ? "✓ تحدي مُرسل!" : "⚔️ أرسل التحدي"}
      </button>
    </div>
  );
}

// ── Community Highlights ───────────────────────────────────────────────────────
function CommunityHighlights() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a=>(a+1)%HIGHLIGHTS.length), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🔥 لحظات حماسية</span>
        <span style={{ fontSize:9,color:"#EF4444" }}>TRENDING</span>
      </div>
      <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
        {HIGHLIGHTS.map((h,i) => (
          <div key={i}
            className={`highlight-row ${i===active?"highlight-row--active":""}`}
            style={{ borderColor:i===active?h.color:"transparent" }}
            onClick={() => setActive(i)}>
            <div className="hl-av" style={{ background:`linear-gradient(135deg,${h.color}80,${h.color}20)`, borderColor:h.color }}>
              {h.user.charAt(0)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="hl-clip">{h.clip}</div>
              <div className="hl-meta"><span style={{ color:h.color }}>@{h.user}</span> • {h.ago}</div>
            </div>
            <div className="hl-right">
              <div className="hl-views">👁 {h.views}</div>
              {i===active && <button className="hl-watch-btn" style={{ color:h.color, borderColor:`${h.color}60` }}>▶ شاهد</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tournaments ────────────────────────────────────────────────────────────────
function TournamentCard() {
  const [joined, setJoined] = useState<number|null>(null);
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🏟️ البطولات القادمة</span>
        <span className="trn-hot-tag">🔥 HOT</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
        {TOURNAMENTS.map((t,i) => (
          <div key={i} className={`trn-row ${t.hot?"trn-row--hot":""}`} style={{ "--tc":t.color } as any}>
            {t.hot && <div className="trn-hot-bar" style={{ background:t.color }} />}
            <div className="trn-main">
              <div>
                <div className="trn-name" style={{ color:t.hot?t.color:"#ccc" }}>{t.name}</div>
                <div className="trn-game">{t.game} • {t.date}</div>
              </div>
              <div style={{ textAlign:"end" }}>
                <div className="trn-prize" style={{ color:t.color }}>{t.prize}</div>
                <button
                  className={`trn-join-btn ${joined===i?"trn-join-btn--done":""}`}
                  style={{ borderColor:t.color, color:joined===i?"#000":t.color, background:joined===i?t.color:"transparent" }}
                  onClick={() => setJoined(i)}>
                  {joined===i?"✓ مسجّل":"سجّل الآن"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Friends Grid ───────────────────────────────────────────────────────────────
function FriendsGrid() {
  const [hov, setHov] = useState<number|null>(null);
  const online = FRIENDS.filter(f=>f.status==="online").length;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🗺️ الأصدقاء</span>
        <div className="section-hd-right">
          <span className="online-pill"><span className="online-dot"/>{ online} نشط</span>
          <span className="section-link">عرض الكل →</span>
        </div>
      </div>
      <div className="friends-grid">
        {FRIENDS.map(f => {
          const isHov=hov===f.id;
          return (
            <div key={f.id} className={`fc ${isHov?"fc--hov":""}`}
              style={{ "--fc":f.color } as any}
              onMouseEnter={()=>setHov(f.id)} onMouseLeave={()=>setHov(null)}>
              <div className="fc-top" style={{ background:`linear-gradient(135deg,${f.color}30,${f.color}06)` }}>
                <span className="fc-rank-tag" style={{ color:f.color, borderColor:`${f.color}40` }}>{f.rank}</span>
                {f.isStreaming && <span className="fc-live-tag">🔴 LIVE</span>}
              </div>
              <div className="fc-av-wrap">
                <div className="fc-av" style={{ borderColor:f.color, boxShadow:isHov?`0 0 14px ${f.color}80`:"none" }}>{f.initial}</div>
                <div className={`fc-dot fc-dot--${f.status}`} />
              </div>
              <div className="fc-info">
                <div className="fc-name">{f.name}</div>
                <div className="fc-user">@{f.username}</div>
                {f.game ? <div className="fc-game" style={{ color:f.color }}>▶ {f.game}</div> : <div className="fc-idle">{f.status==="away"?"بعيد":"مشغول"}</div>}
                <div className="fc-hours">{f.hours}h played</div>
              </div>
              <div className={`fc-actions ${isHov?"fc-actions--show":""}`}>
                <button className="fc-act" style={{ color:f.color, borderColor:`${f.color}60` }}>📞</button>
                <button className="fc-act" style={{ color:f.color, borderColor:`${f.color}60` }}>💬</button>
                <button className="fc-act" style={{ color:f.color, borderColor:`${f.color}60` }}>⚔️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function Leaderboard() {
  const max=LEADERBOARD[0].pts;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🏆 الترتيب</span>
        <span className="section-link">هذا الأسبوع</span>
      </div>
      <div className="lb-list">
        {LEADERBOARD.map((p,i) => (
          <div key={i} className={`lb-row ${p.isMe?"lb-row--me":""}`}>
            <span className="lb-pos" style={{ color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#555" }}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
            </span>
            <span className="lb-name" style={{ color:p.isMe?p.color:"#ccc" }}>{p.name}{p.isMe?" ★":""}</span>
            <div className="lb-bar-wrap"><div className="lb-bar" style={{ width:`${(p.pts/max)*100}%`, background:p.color, boxShadow:`0 0 8px ${p.color}60` }} /></div>
            <span className="lb-pts" style={{ color:p.color }}>{p.pts.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Achievement ────────────────────────────────────────────────────────────────
function AchievementShowcase() {
  const [active, setActive] = useState(0);
  useEffect(() => { const id=setInterval(()=>setActive(a=>(a+1)%ACHIEVEMENTS.length),3000); return ()=>clearInterval(id); },[]);
  const ach=ACHIEVEMENTS[active];
  return (
    <div className="section-box ach-card" style={{ "--ac":ach.color } as any}>
      <div className="section-hd">
        <span className="section-title">🎖️ إنجازاتك</span>
        <div className="ach-dots">{ACHIEVEMENTS.map((_,i)=><span key={i} className={`ach-dot ${i===active?"ach-dot--on":""}`} onClick={()=>setActive(i)} />)}</div>
      </div>
      <div className="ach-body">
        <div className="ach-icon">{ach.icon}</div>
        <div className="ach-info">
          <div className="ach-rarity" style={{ color:ach.color }}>{ach.rarity}</div>
          <div className="ach-name">{ach.name}</div>
          <div className="ach-desc">{ach.desc}</div>
        </div>
        <div className="ach-glow" style={{ background:ach.color }} />
      </div>
    </div>
  );
}

// ── Challenge Card ─────────────────────────────────────────────────────────────
function ChallengeCard() {
  const [animated, setAnimated] = useState(false);
  useEffect(()=>{setTimeout(()=>setAnimated(true),400);},[]);
  return (
    <div className="section-box challenge-box">
      <div className="section-hd">
        <span className="section-title">⚡ تحدي الأسبوع</span>
        <span className="challenge-timer">🔥 يومان</span>
      </div>
      <div className="challenge-name">فاتح البارتيات</div>
      <div className="challenge-desc">انضم لـ 5 بارتيات مختلفة هذا الأسبوع</div>
      <div className="challenge-track">
        <div className="challenge-fill" style={{ width:animated?"60%":"0%", transition:"width 1.2s cubic-bezier(.4,0,.2,1)" }}><div className="challenge-shimmer" /></div>
        <span className="challenge-num">3 / 5</span>
      </div>
      <div className="challenge-rewards">
        <span className="reward-chip">🎁 200 XP</span>
        <span className="reward-chip">🏅 شارة حصرية</span>
        <span className="reward-chip">👑 Pro أسبوع</span>
      </div>
    </div>
  );
}

// ── Smart Match ────────────────────────────────────────────────────────────────
function SmartMatch() {
  const [joined, setJoined] = useState(false);
  const [cd, setCd] = useState(180);
  useEffect(()=>{ if(joined)return; const id=setInterval(()=>setCd(c=>c>0?c-1:0),1000); return ()=>clearInterval(id); },[joined]);
  const mm=String(Math.floor(cd/60)).padStart(2,"0"), ss=String(cd%60).padStart(2,"0");
  const pct=(cd/180)*100;
  return (
    <div className="section-box match-box">
      <div className="match-pulse-ring" />
      <div className="section-hd">
        <span className="section-title">🎯 فرصة انضمام</span>
        <div className="match-live-badge"><span className="match-live-dot"/>LIVE</div>
      </div>
      <div className="match-game">Valorant</div>
      <div className="match-meta">"Rush Squad" • 3 لاعبين ينتظرون</div>
      <div className="match-avatars">{FRIENDS.slice(0,3).map(f=><div key={f.id} className="match-av" style={{ background:`linear-gradient(135deg,${f.color}88,${f.color}33)`,borderColor:f.color }}>{f.initial}</div>)}</div>
      {!joined&&<div className="match-countdown"><div className="match-cd-track"><div className="match-cd-fill" style={{ width:`${pct}%`,background:pct<30?"#EF4444":pct<60?"#FFD700":"#22C55E" }}/></div><span className="match-cd-time" style={{ color:pct<30?"#EF4444":"#ccc" }}>⏱ {mm}:{ss}</span></div>}
      <button className={`match-btn ${joined?"match-btn--done":""}`} onClick={()=>setJoined(j=>!j)}>{joined?"✓ انضممت!":"⚡ انضم الآن"}</button>
    </div>
  );
}

// ── Pro Card ───────────────────────────────────────────────────────────────────
function ProCard() {
  return (
    <div className="pro-card">
      <div className="pro-bg"/>
      <div className="pro-particles">{[...Array(6)].map((_,i)=><div key={i} className="pro-particle" style={{ animationDelay:`${i*0.4}s`,left:`${15+i*14}%` }}/>)}</div>
      <div className="pro-header">
        <div className="pro-crown-wrap"><span className="pro-crown">👑</span><div className="pro-crown-glow"/></div>
        <div><div className="pro-title">PRO MEMBER</div><div className="pro-exp">ينتهي ١٦ أغسطس ٢٠٢٦ • ٢٩ يوم</div></div>
        <div className="pro-active-pill">ACTIVE ✓</div>
      </div>
      <div className="pro-perks">
        <div className="pro-perk"><span>🎙️</span><span>غرفتي الصوتية</span><span className="perk-on">نشطة</span></div>
        <div className="pro-perk"><span>🤖</span><span>بوت LFG</span><span className="perk-on">مفعّل</span></div>
        <div className="pro-perk"><span>🎨</span><span>إطار مخصص</span><span className="perk-on">أخضر</span></div>
        <div className="pro-perk"><span>🎁</span><span>إهداء Pro</span><span className="perk-avail">متاح</span></div>
      </div>
      <a href="/pro" className="pro-manage">إدارة Pro ←</a>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function Dashboard() {
  const hour=new Date().getHours();
  const greeting=hour<5?"🌙 ليلة طيبة":hour<12?"🌅 صباح الخير":hour<17?"☀️ مساء النور":"🌙 مساء الخير";

  return (
    <div className="dash-root">
      <div className="dash-scanlines"/>
      <LiveTicker />

      {/* header */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-greeting">{greeting}</div>
          <div className="dash-name">مرحباً، <span className="name-highlight">FAISAL</span> 👋</div>
          <XpBar />
        </div>
        <div className="dash-stats-row">
          <StatCard icon="⏱️" value="24h"  label="هذا الأسبوع"  color="#22C55E" sub="+3h من أمس"/>
          <StatCard icon="🏆" value="#3"   label="الرتبة"        color="#FFD700" sub="بين الأصدقاء"/>
          <StatCard icon="🌐" value="4"    label="Online الآن"   color="#06B6D4" sub={`من ${ME.totalFriends}`}/>
          <StatCard icon="🔥" value={`${ME.streak}d`} label="Streak" color="#F97316" sub="أيام متتالية"/>
        </div>
      </div>

      <MoodStatus />
      <QuickDock />

      {/* body */}
      <div className="dash-body">
        <div className="dash-main">
          {/* top row: spin + graph + streams */}
          <div className="dash-top-row">
            <DailySpin />
            <div style={{ display:"flex",flexDirection:"column",gap:12,flex:1 }}>
              <WeeklyGraph />
              <LiveStreams />
            </div>
          </div>
          <FriendsGrid />
          <CommunityHighlights />
        </div>

        <div className="dash-side">
          <SmartMatch />
          <ChallengeVs />
          <TournamentCard />
          <ChallengeCard />
          <Leaderboard />
          <AchievementShowcase />
          <ProCard />
        </div>
      </div>
    </div>
  );
}
