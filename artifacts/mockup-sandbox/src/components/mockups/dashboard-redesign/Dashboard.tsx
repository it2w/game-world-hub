import { useState, useEffect, useRef } from "react";
import "./dashboard.css";

// ── Mock Data ──────────────────────────────────────────────────────────────────

const ME = { name: "Faisal", level: 42, xp: 7340, xpNext: 8000, streak: 12, rank: 3, totalFriends: 6 };

const FRIENDS = [
  { id:1, name:"Khalid", username:"kx97",    game:"Valorant",     rank:"DIAMOND", hours:312, status:"online", color:"#EC4899", initial:"K" },
  { id:2, name:"Sara",   username:"saraXO",  game:"Apex Legends", rank:"PLAT",    hours:218, status:"online", color:"#06B6D4", initial:"S" },
  { id:3, name:"Nasser", username:"n4sser",  game:null,           rank:"GOLD",    hours:145, status:"away",   color:"#A855F7", initial:"N" },
  { id:4, name:"Faisal2",username:"fz_pro",  game:"CS2",          rank:"MASTER",  hours:499, status:"online", color:"#22C55E", initial:"F" },
  { id:5, name:"Reem",   username:"reemgx",  game:"Overwatch 2",  rank:"PLAT",    hours:187, status:"online", color:"#F97316", initial:"R" },
  { id:6, name:"Omar",   username:"o_games", game:null,           rank:"SILVER",  hours:92,  status:"busy",   color:"#FFD700", initial:"O" },
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
  { color:"#FFD700", text:"🏆 Sara حققت إنجاز \"Apex Predator\" • 0.1% لاعب" },
  { color:"#22C55E", text:"📡 Faisal نشر LFG في CS2 Premier" },
  { color:"#A855F7", text:"👑 Nasser أكمل تحدي الأسبوع المميز" },
  { color:"#F97316", text:"🎙️ غرفة صوتية جديدة — \"استراحة الجيمرز\"" },
  { color:"#06B6D4", text:"🔥 تحدي نهائي الأسبوع • تبقى 2 ساعة فقط" },
];

const ACHIEVEMENTS = [
  { icon:"🏆", name:"Apex Predator", desc:"وصلت للرتبة الأعلى في Apex", rarity:"LEGENDARY", color:"#FFD700" },
  { icon:"⚡", name:"Rush Master", desc:"فزت بـ 10 مباريات متتالية", rarity:"EPIC",      color:"#A855F7" },
  { icon:"🎯", name:"Party Leader", desc:"قدت 50 بارتي للفوز",        rarity:"RARE",     color:"#06B6D4" },
];

const FEATURED_GAME = { name:"Valorant", mode:"RANKED • ACT III", players:"4.2M نشط", update:"تحديث Episode 9 متاح!", accent:"#FF4655" };

// ── Ticker ─────────────────────────────────────────────────────────────────────
function LiveTicker() {
  const [offset, setOffset] = useState(0);
  const total = TICKER_EVENTS.map(e => e.text).join("   ◆   ") + "   ◆   ";
  useEffect(() => {
    const id = setInterval(() => setOffset(o => (o + 0.8) % (total.length * 7.2)), 20);
    return () => clearInterval(id);
  }, [total]);

  return (
    <div className="ticker-bar">
      <div className="ticker-live-pill">
        <span className="ticker-dot" />LIVE
      </div>
      <div className="ticker-track">
        <div className="ticker-inner" style={{ transform:`translateX(-${offset}px)` }}>
          {[...TICKER_EVENTS, ...TICKER_EVENTS].map((e, i) => (
            <span key={i} className="ticker-item">
              <span style={{ color: e.color }}>{e.text}</span>
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
        <div className="xp-fill" style={{ width:`${pct}%` }}>
          <div className="xp-shimmer" />
        </div>
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
    let start = 0;
    const inc = target / 30;
    const id = setInterval(() => {
      start += inc;
      if (start >= target) { setCount(target); clearInterval(id); }
      else setCount(Math.floor(start));
    }, 30);
    return () => clearInterval(id);
  }, [target]);

  const display = value.replace(/\d+/, String(count));
  return (
    <div className="stat-card" style={{ "--sc": color } as any}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <div className="stat-corner" style={{ background:color }} />
      </div>
      <div className="stat-value" style={{ color }}>{display}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      <div className="stat-glow" style={{ background:color }} />
    </div>
  );
}

// ── Quick Dock ─────────────────────────────────────────────────────────────────
const DOCK_ITEMS = [
  { icon:"⚔️", label:"بارتي جديد", badge:null,  color:"#22C55E" },
  { icon:"📡", label:"نشر LFG",    badge:"3",   color:"#EC4899" },
  { icon:"🎙️", label:"غرفة صوتية", badge:null,  color:"#06B6D4" },
  { icon:"💬", label:"الرسائل",    badge:"7",   color:"#A855F7" },
  { icon:"🏆", label:"التحديات",   badge:"!",   color:"#FFD700" },
  { icon:"🎮", label:"المكتبة",    badge:null,  color:"#F97316" },
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
          {d.badge && (
            <span className="dock-badge" style={{ background: d.badge==="!" ? "#EF4444" : d.color }}>
              {d.badge}
            </span>
          )}
          {hov===i && <div className="dock-underline" style={{ background:d.color }} />}
        </button>
      ))}
      <div className="dock-streak">
        <span className="streak-fire">🔥</span>
        <span className="streak-num">{ME.streak}</span>
        <span className="streak-label">يوم</span>
      </div>
    </div>
  );
}

// ── Featured Game ──────────────────────────────────────────────────────────────
function FeaturedGame() {
  const [hov, setHov] = useState(false);
  return (
    <div className={`featured-card ${hov?"featured-card--hov":""}`}
      style={{ "--ga":FEATURED_GAME.accent } as any}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div className="featured-bg">
        <div className="featured-gradient" style={{ background:`linear-gradient(135deg, ${FEATURED_GAME.accent}22, transparent 60%)` }} />
        <div className="featured-grid" />
      </div>
      <div className="featured-tag">🔥 لعبة اليوم</div>
      <div className="featured-name" style={{ color:FEATURED_GAME.accent }}>{FEATURED_GAME.name}</div>
      <div className="featured-mode">{FEATURED_GAME.mode}</div>
      <div className="featured-players">👥 {FEATURED_GAME.players}</div>
      <div className="featured-update">⚡ {FEATURED_GAME.update}</div>
      <button className="featured-btn" style={{ background:FEATURED_GAME.accent }}>الانضمام الآن ↗</button>
    </div>
  );
}

// ── Friends Grid ───────────────────────────────────────────────────────────────
function FriendsGrid() {
  const [hov, setHov] = useState<number|null>(null);
  const online = FRIENDS.filter(f => f.status==="online").length;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🗺️ الأصدقاء</span>
        <div className="section-hd-right">
          <span className="online-pill"><span className="online-dot"/>{online} نشط</span>
          <span className="section-link">عرض الكل →</span>
        </div>
      </div>
      <div className="friends-grid">
        {FRIENDS.map(f => {
          const isHov = hov===f.id;
          return (
            <div key={f.id} className={`fc ${isHov?"fc--hov":""} fc--${f.status}`}
              style={{ "--fc":f.color } as any}
              onMouseEnter={() => setHov(f.id)} onMouseLeave={() => setHov(null)}>
              {/* top bar gradient */}
              <div className="fc-top" style={{ background:`linear-gradient(135deg,${f.color}30,${f.color}06)` }}>
                <span className="fc-rank-tag" style={{ color:f.color, borderColor:`${f.color}40` }}>{f.rank}</span>
              </div>
              {/* avatar */}
              <div className="fc-av-wrap">
                <div className="fc-av" style={{ borderColor:f.color, boxShadow:isHov?`0 0 14px ${f.color}80`:"none" }}>
                  {f.initial}
                </div>
                <div className={`fc-dot fc-dot--${f.status}`} />
              </div>
              {/* info */}
              <div className="fc-info">
                <div className="fc-name">{f.name}</div>
                <div className="fc-user">@{f.username}</div>
                {f.game
                  ? <div className="fc-game" style={{ color:f.color }}>▶ {f.game}</div>
                  : <div className="fc-idle">{f.status === "away" ? "بعيد" : "مشغول"}</div>
                }
                <div className="fc-hours">{f.hours}h played</div>
              </div>
              {/* hover actions */}
              <div className={`fc-actions ${isHov?"fc-actions--show":""}`}>
                <button className="fc-act" style={{ color:f.color, borderColor:`${f.color}60` }}>📞 اتصال</button>
                <button className="fc-act" style={{ color:f.color, borderColor:`${f.color}60` }}>💬 رسالة</button>
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
  const max = LEADERBOARD[0].pts;
  return (
    <div className="section-box">
      <div className="section-hd">
        <span className="section-title">🏆 الترتيب بين الأصدقاء</span>
        <span className="section-link">هذا الأسبوع</span>
      </div>
      <div className="lb-list">
        {LEADERBOARD.map((p,i) => (
          <div key={i} className={`lb-row ${p.isMe?"lb-row--me":""}`}>
            <span className="lb-pos" style={{ color: i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#555" }}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
            </span>
            <span className="lb-name" style={{ color:p.isMe?p.color:"#ccc" }}>{p.name}{p.isMe?" (أنت)":""}</span>
            <div className="lb-bar-wrap">
              <div className="lb-bar" style={{ width:`${(p.pts/max)*100}%`, background:p.color, boxShadow:`0 0 8px ${p.color}60` }} />
            </div>
            <span className="lb-pts" style={{ color:p.color }}>{p.pts.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Achievement Showcase ───────────────────────────────────────────────────────
function AchievementShowcase() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a+1)%ACHIEVEMENTS.length), 3000);
    return () => clearInterval(id);
  }, []);
  const ach = ACHIEVEMENTS[active];
  return (
    <div className="section-box ach-card" style={{ "--ac":ach.color } as any}>
      <div className="section-hd">
        <span className="section-title">🎖️ إنجازاتك</span>
        <div className="ach-dots">
          {ACHIEVEMENTS.map((_,i) => (
            <span key={i} className={`ach-dot ${i===active?"ach-dot--on":""}`} onClick={() => setActive(i)} />
          ))}
        </div>
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

// ── Smart Match ────────────────────────────────────────────────────────────────
function SmartMatch() {
  const [joined, setJoined] = useState(false);
  const [countdown, setCountdown] = useState(180);
  useEffect(() => {
    if (joined) return;
    const id = setInterval(() => setCountdown(c => c > 0 ? c-1 : 0), 1000);
    return () => clearInterval(id);
  }, [joined]);
  const mm = String(Math.floor(countdown/60)).padStart(2,"0");
  const ss = String(countdown%60).padStart(2,"0");
  const pct = (countdown/180)*100;

  return (
    <div className="section-box match-box">
      <div className="match-pulse-ring" />
      <div className="section-hd">
        <span className="section-title">🎯 فرصة انضمام</span>
        <div className="match-live-badge">
          <span className="match-live-dot" />LIVE
        </div>
      </div>
      <div className="match-game">Valorant</div>
      <div className="match-meta">"Rush Squad" • 3 لاعبين ينتظرون</div>
      <div className="match-avatars">
        {FRIENDS.slice(0,3).map(f => (
          <div key={f.id} className="match-av" style={{ background:`linear-gradient(135deg,${f.color}88,${f.color}33)`, borderColor:f.color }}>
            {f.initial}
          </div>
        ))}
      </div>
      {/* countdown */}
      {!joined && (
        <div className="match-countdown">
          <div className="match-cd-track">
            <div className="match-cd-fill" style={{ width:`${pct}%`, background: pct<30?"#EF4444":pct<60?"#FFD700":"#22C55E" }} />
          </div>
          <span className="match-cd-time" style={{ color:pct<30?"#EF4444":pct<60?"#FFD700":"#ccc" }}>⏱ {mm}:{ss}</span>
        </div>
      )}
      <button className={`match-btn ${joined?"match-btn--done":""}`} onClick={() => setJoined(j=>!j)}>
        {joined ? "✓ انضممت بنجاح!" : "⚡ انضم الآن"}
      </button>
    </div>
  );
}

// ── Challenge ──────────────────────────────────────────────────────────────────
function ChallengeCard() {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 400); }, []);
  return (
    <div className="section-box challenge-box">
      <div className="section-hd">
        <span className="section-title">⚡ تحدي الأسبوع</span>
        <span className="challenge-timer">🔥 يومان</span>
      </div>
      <div className="challenge-name">فاتح البارتيات</div>
      <div className="challenge-desc">انضم لـ 5 بارتيات مختلفة هذا الأسبوع</div>
      <div className="challenge-track">
        <div className="challenge-fill" style={{ width:animated?"60%":"0%", transition:"width 1.2s cubic-bezier(.4,0,.2,1)" }}>
          <div className="challenge-shimmer" />
        </div>
        <span className="challenge-num">3 / 5</span>
      </div>
      <div className="challenge-rewards">
        <span className="reward-chip">🎁 200 XP</span>
        <span className="reward-chip">🏅 شارة حصرية</span>
        <span className="reward-chip">👑 Pro لمدة أسبوع</span>
      </div>
    </div>
  );
}

// ── Pro Card ───────────────────────────────────────────────────────────────────
function ProCard() {
  return (
    <div className="pro-card">
      <div className="pro-bg" />
      <div className="pro-particles">
        {[...Array(6)].map((_,i) => <div key={i} className="pro-particle" style={{ animationDelay:`${i*0.4}s`, left:`${15+i*14}%` }} />)}
      </div>
      <div className="pro-header">
        <div className="pro-crown-wrap">
          <span className="pro-crown">👑</span>
          <div className="pro-crown-glow" />
        </div>
        <div>
          <div className="pro-title">PRO MEMBER</div>
          <div className="pro-exp">ينتهي ١٦ أغسطس ٢٠٢٦ • ٢٩ يوم</div>
        </div>
        <div className="pro-active-pill">ACTIVE ✓</div>
      </div>
      <div className="pro-perks">
        <div className="pro-perk"><span>🎙️</span><span>غرفتي الصوتية</span><span className="perk-on">نشطة</span></div>
        <div className="pro-perk"><span>🤖</span><span>بوت LFG</span><span className="perk-on">مفعّل</span></div>
        <div className="pro-perk"><span>🎨</span><span>إطار ملف مخصص</span><span className="perk-on">أخضر</span></div>
        <div className="pro-perk"><span>🎁</span><span>إهداء Pro</span><span className="perk-avail">متاح</span></div>
      </div>
      <a href="/pro" className="pro-manage">إدارة Pro ← </a>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "🌙 ليلة طيبة" : hour < 12 ? "🌅 صباح الخير" : hour < 17 ? "☀️ مساء النور" : "🌙 مساء الخير";

  return (
    <div className="dash-root">
      {/* scanlines */}
      <div className="dash-scanlines" />

      {/* ticker */}
      <LiveTicker />

      {/* header */}
      <div className="dash-header">
        <div className="dash-header-left">
          <div className="dash-greeting">{greeting}</div>
          <div className="dash-name">مرحباً، <span className="name-highlight">FAISAL</span> 👋</div>
          <XpBar />
        </div>
        <div className="dash-stats-row">
          <StatCard icon="⏱️" value="24h"  label="هذا الأسبوع"  color="#22C55E" sub="+3h من أمس" />
          <StatCard icon="🏆" value="#3"   label="الرتبة"        color="#FFD700" sub="بين الأصدقاء" />
          <StatCard icon="🌐" value="4"    label="Online الآن"   color="#06B6D4" sub={`من ${ME.totalFriends}`} />
          <StatCard icon="🔥" value={`${ME.streak}d`} label="Streak"  color="#F97316" sub="أيام متتالية" />
        </div>
      </div>

      {/* dock */}
      <QuickDock />

      {/* body */}
      <div className="dash-body">

        {/* main col */}
        <div className="dash-main">
          <FeaturedGame />
          <FriendsGrid />
        </div>

        {/* side col */}
        <div className="dash-side">
          <SmartMatch />
          <ChallengeCard />
          <Leaderboard />
          <AchievementShowcase />
          <ProCard />
        </div>

      </div>
    </div>
  );
}
