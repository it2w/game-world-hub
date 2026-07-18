import { useState, useEffect } from "react";
import "./glass.css";

const FRIENDS = [
  { id:1, name:"Khalid", username:"kx97",    game:"Valorant",     avatar:"K", grad:"linear-gradient(135deg,#ec4899,#7c3aed)" },
  { id:2, name:"Sara",   username:"saraXO",  game:"Apex Legends", avatar:"S", grad:"linear-gradient(135deg,#06b6d4,#3b82f6)" },
  { id:3, name:"Nasser", username:"n4sser",  game:null,           avatar:"N", grad:"linear-gradient(135deg,#a855f7,#ec4899)" },
  { id:4, name:"Faisal", username:"fz_pro",  game:"CS2",          avatar:"F", grad:"linear-gradient(135deg,#10b981,#06b6d4)" },
  { id:5, name:"Reem",   username:"reemgx",  game:"Overwatch 2",  avatar:"R", grad:"linear-gradient(135deg,#f97316,#ef4444)" },
  { id:6, name:"Omar",   username:"o_games", game:null,           avatar:"O", grad:"linear-gradient(135deg,#fbbf24,#f97316)" },
];

const STATS = [
  { value:"24", unit:"h",  label:"ساعات اللعب",   grad:"linear-gradient(135deg,#ec4899,#7c3aed)", icon:"🎮" },
  { value:"#3", unit:"",   label:"رتبتك",           grad:"linear-gradient(135deg,#fbbf24,#f97316)", icon:"🏆" },
  { value:"4",  unit:"",   label:"أصدقاء Online",   grad:"linear-gradient(135deg,#06b6d4,#3b82f6)", icon:"🌐" },
  { value:"89", unit:"%",  label:"معدل الفوز",      grad:"linear-gradient(135deg,#10b981,#06b6d4)", icon:"⚡" },
];

const ACTIONS = [
  { label:"بارتي جديد", icon:"⚔️", grad:"linear-gradient(135deg,#ec4899,#7c3aed)" },
  { label:"نشر LFG",    icon:"📡", grad:"linear-gradient(135deg,#06b6d4,#3b82f6)" },
  { label:"غرفة صوت",   icon:"🎙️", grad:"linear-gradient(135deg,#a855f7,#ec4899)" },
  { label:"التحديات",   icon:"🏆", grad:"linear-gradient(135deg,#fbbf24,#f97316)" },
];

const ACTIVITY = [
  { name:"Khalid", action:"انضم لـ Valorant",        time:"3m",  avatar:"K", grad:"linear-gradient(135deg,#ec4899,#7c3aed)" },
  { name:"Sara",   action:'حققت "Apex Predator"',     time:"11m", avatar:"S", grad:"linear-gradient(135deg,#06b6d4,#3b82f6)" },
  { name:"Faisal", action:"نشر LFG في CS2",          time:"22m", avatar:"F", grad:"linear-gradient(135deg,#10b981,#06b6d4)" },
  { name:"Nasser", action:"أكمل تحدي الأسبوع",       time:"35m", avatar:"N", grad:"linear-gradient(135deg,#a855f7,#ec4899)" },
];

function FloatingOrbs() {
  return (
    <div className="gl-orbs" aria-hidden>
      <div className="gl-orb gl-orb--1" />
      <div className="gl-orb gl-orb--2" />
      <div className="gl-orb gl-orb--3" />
      <div className="gl-orb gl-orb--4" />
    </div>
  );
}

function GlassCard({ children, className="" }: { children: React.ReactNode; className?: string }) {
  return <div className={`gl-card ${className}`}>{children}</div>;
}

export function PremiumGlass() {
  const [joinedId, setJoinedId] = useState<number|null>(null);
  const [hoverId, setHoverId] = useState<number|null>(null);

  return (
    <div className="gl-root">
      <FloatingOrbs />

      {/* top nav */}
      <div className="gl-nav">
        <div className="gl-brand">
          <div className="gl-brand-icon">⬡</div>
          <span className="gl-brand-name">GameHub</span>
          <span className="gl-brand-badge">PRO</span>
        </div>
        <div className="gl-nav-center">
          {["الرئيسية","الأصدقاء","التحديات","الغرف"].map((t,i) => (
            <button key={i} className={`gl-nav-item ${i===0?"gl-nav-item--active":""}`}>{t}</button>
          ))}
        </div>
        <div className="gl-user-chip">
          <div className="gl-user-av" style={{ background:"linear-gradient(135deg,#10b981,#06b6d4)" }}>F</div>
          <div>
            <div className="gl-user-name">Faisal</div>
            <div className="gl-user-status"><span className="gl-online-dot" />Online</div>
          </div>
        </div>
      </div>

      {/* hero */}
      <div className="gl-hero">
        <div className="gl-hero-text">
          <div className="gl-hero-greeting">مرحباً مجدداً،</div>
          <div className="gl-hero-name">
            <span className="gl-grad-text">FAISAL</span>
          </div>
          <div className="gl-hero-sub">أنت في المرتبة #3 بين أصدقائك هذا الأسبوع 🔥</div>
        </div>

        {/* stats row */}
        <div className="gl-stats">
          {STATS.map((s,i) => (
            <GlassCard key={i} className="gl-stat-card">
              <div className="gl-stat-icon">{s.icon}</div>
              <div className="gl-stat-val">
                <span className="gl-grad-text" style={{ background:s.grad, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" } as any}>
                  {s.value}{s.unit}
                </span>
              </div>
              <div className="gl-stat-lbl">{s.label}</div>
              <div className="gl-stat-shimmer" style={{ background:s.grad }} />
            </GlassCard>
          ))}
        </div>
      </div>

      {/* quick actions */}
      <div className="gl-actions">
        {ACTIONS.map((a,i) => (
          <button key={i} className="gl-action-btn" style={{ "--ag": a.grad } as any}>
            <span className="gl-action-icon">{a.icon}</span>
            <span className="gl-action-label">{a.label}</span>
            <div className="gl-action-shine" />
          </button>
        ))}
      </div>

      {/* body */}
      <div className="gl-body">

        {/* friends */}
        <GlassCard className="gl-friends-panel">
          <div className="gl-panel-hd">
            <span className="gl-panel-title">الأصدقاء</span>
            <span className="gl-panel-count">4 نشط</span>
          </div>
          <div className="gl-friends-grid">
            {FRIENDS.map(f => (
              <div key={f.id}
                className={`gl-fc ${hoverId===f.id?"gl-fc--hov":""}`}
                onMouseEnter={() => setHoverId(f.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <div className="gl-fc-av" style={{ background:f.grad }}>{f.avatar}</div>
                {!f.game && <div className="gl-fc-away" />}
                <div className="gl-fc-info">
                  <div className="gl-fc-name">{f.name}</div>
                  <div className="gl-fc-game">{f.game||"غير متاح"}</div>
                </div>
                <div className="gl-fc-btns">
                  <button className="gl-fc-btn" style={{ background:f.grad }}>📞</button>
                  <button className="gl-fc-btn" style={{ background:f.grad }}>💬</button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* right column */}
        <div className="gl-right-col">

          {/* match suggestion */}
          <GlassCard className="gl-match-card">
            <div className="gl-match-pulse" />
            <div className="gl-panel-hd">
              <span className="gl-panel-title">🎯 انضم الآن</span>
              <span className="gl-live-chip">LIVE</span>
            </div>
            <div className="gl-match-game">Valorant</div>
            <div className="gl-match-party">"Rush Squad" · 3 لاعبين</div>
            <div className="gl-match-avatars">
              {[FRIENDS[0],FRIENDS[1],FRIENDS[3]].map(f => (
                <div key={f.id} className="gl-sm-av" style={{ background:f.grad }}>{f.avatar}</div>
              ))}
              <div className="gl-sm-av gl-sm-av--plus">+1</div>
            </div>
            <button
              className={`gl-join-btn ${joinedId?'gl-join-btn--done':''}`}
              onClick={() => setJoinedId(1)}
            >
              {joinedId ? "✓ انضممت!" : "⚡ انضم للبارتي"}
            </button>
          </GlassCard>

          {/* challenge */}
          <GlassCard>
            <div className="gl-panel-hd">
              <span className="gl-panel-title">🏆 تحدي الأسبوع</span>
              <span className="gl-timer">⏱ يومان</span>
            </div>
            <div className="gl-ch-name">فاتح البارتيات</div>
            <div className="gl-ch-track">
              <div className="gl-ch-fill" />
              <span className="gl-ch-num">3/5</span>
            </div>
            <div className="gl-ch-reward">🎁 200 XP + شارة حصرية</div>
          </GlassCard>

          {/* activity */}
          <GlassCard>
            <div className="gl-panel-hd">
              <span className="gl-panel-title">⚡ آخر الأحداث</span>
            </div>
            <div className="gl-activity">
              {ACTIVITY.map((a,i) => (
                <div key={i} className="gl-act-row">
                  <div className="gl-act-av" style={{ background:a.grad }}>{a.avatar}</div>
                  <div className="gl-act-info">
                    <span className="gl-act-name">{a.name}</span>
                    <span className="gl-act-txt"> {a.action}</span>
                  </div>
                  <span className="gl-act-time">{a.time}</span>
                </div>
              ))}
            </div>
          </GlassCard>

        </div>
      </div>
    </div>
  );
}
