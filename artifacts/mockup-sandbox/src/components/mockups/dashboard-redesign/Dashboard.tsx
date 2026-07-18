import { useState, useEffect, useRef } from "react";
import "./dashboard.css";

// ── Mock Data ──────────────────────────────────────────────────────────────────

const FRIENDS = [
  { id: 1, name: "Khalid", username: "kx97", game: "Valorant", status: "online", color: "#EC4899", initial: "K" },
  { id: 2, name: "Sara", username: "saraXO", game: "Apex Legends", status: "online", color: "#06B6D4", initial: "S" },
  { id: 3, name: "Nasser", username: "n4sser", game: null, status: "away", color: "#A855F7", initial: "N" },
  { id: 4, name: "Faisal", username: "fz_pro", game: "CS2", status: "online", color: "#22C55E", initial: "F" },
  { id: 5, name: "Reem", username: "reemgx", game: "Overwatch 2", status: "online", color: "#F97316", initial: "R" },
  { id: 6, name: "Omar", username: "o_games", game: null, status: "busy", color: "#FFD700", initial: "O" },
];

const TICKER_EVENTS = [
  "⚡ Khalid انضم لبارتي Valorant",
  "🏆 Sara حققت إنجاز \"Apex Predator\"",
  "🎯 Faisal نشر LFG في CS2",
  "👑 Nasser أكمل تحدي الأسبوع",
  "🔴 غرفة صوتية جديدة — استراحة الجيمرز",
  "⚡ Omar انضم للمنصة",
  "🎮 Reem تلعب Overwatch 2 منذ ساعتين",
];

const STATS = [
  { label: "ساعات هذا الأسبوع", value: "24", unit: "h", color: "#22C55E" },
  { label: "رتبتك بين الأصدقاء", value: "#3", unit: "", color: "#FFD700" },
  { label: "أصدقاء Online", value: "4", unit: "", color: "#06B6D4" },
];

const CHALLENGE = {
  title: "فاتح البارتيات",
  desc: "انضم لـ 5 بارتيات مختلفة هذا الأسبوع",
  progress: 3,
  total: 5,
  reward: "200 XP + شارة حصرية",
  timeLeft: "2 يوم",
};

const MATCH_SUGGESTION = {
  game: "Valorant",
  count: 3,
  players: ["Khalid", "Sara", "Faisal"],
  partyName: "Rush Squad",
};

// ── Live Ticker ────────────────────────────────────────────────────────────────

function LiveTicker() {
  const [offset, setOffset] = useState(0);
  const text = TICKER_EVENTS.join("   •   ");

  useEffect(() => {
    const id = setInterval(() => {
      setOffset(o => (o + 1) % (text.length * 8));
    }, 40);
    return () => clearInterval(id);
  }, [text]);

  return (
    <div className="ticker-bar">
      <div className="ticker-label">LIVE</div>
      <div className="ticker-track">
        <span className="ticker-text" style={{ transform: `translateX(-${offset}px)` }}>
          {text}{"   •   "}{text}
        </span>
      </div>
    </div>
  );
}

// ── Stats Snapshot ─────────────────────────────────────────────────────────────

function StatsRow() {
  return (
    <div className="stats-row">
      {STATS.map((s) => (
        <div key={s.label} className="stat-card" style={{ "--accent": s.color } as any}>
          <div className="stat-value" style={{ color: s.color }}>{s.value}<span className="stat-unit">{s.unit}</span></div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-glow" style={{ background: s.color }} />
        </div>
      ))}
    </div>
  );
}

// ── Quick Actions Dock ─────────────────────────────────────────────────────────

const ACTIONS = [
  { icon: "⚔️", label: "بارتي جديد" },
  { icon: "📡", label: "نشر LFG" },
  { icon: "🎙️", label: "غرفة صوتية" },
  { icon: "💬", label: "المحادثات" },
  { icon: "🏆", label: "التحديات" },
];

function QuickDock() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="quick-dock">
      {ACTIONS.map((a, i) => (
        <button
          key={i}
          className={`dock-btn ${active === i ? "dock-btn--active" : ""}`}
          onMouseEnter={() => setActive(i)}
          onMouseLeave={() => setActive(null)}
        >
          <span className="dock-icon">{a.icon}</span>
          <span className="dock-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Friends Grid ───────────────────────────────────────────────────────────────

function FriendsGrid() {
  const [hoverId, setHoverId] = useState<number | null>(null);

  return (
    <div className="section-card" style={{ gridArea: "friends" }}>
      <div className="section-header">
        <span className="section-icon">🗺️</span>
        <h2>الأصدقاء Online</h2>
        <span className="badge-count">4 نشط</span>
      </div>
      <div className="friends-grid">
        {FRIENDS.map((f) => (
          <div
            key={f.id}
            className={`friend-card ${hoverId === f.id ? "friend-card--hovered" : ""}`}
            style={{ "--fc": f.color } as any}
            onMouseEnter={() => setHoverId(f.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            {/* banner */}
            <div className="friend-banner" style={{ background: `linear-gradient(135deg,${f.color}30,${f.color}08)` }} />
            {/* avatar */}
            <div className="friend-avatar" style={{ borderColor: f.color, boxShadow: hoverId === f.id ? `0 0 12px ${f.color}60` : "none" }}>
              {f.initial}
            </div>
            {/* status dot */}
            <div className={`status-dot status-dot--${f.status}`} />
            {/* info */}
            <div className="friend-info">
              <div className="friend-name">{f.name}</div>
              <div className="friend-user">@{f.username}</div>
              {f.game
                ? <div className="friend-game">▶ {f.game}</div>
                : <div className="friend-status">{f.status}</div>
              }
            </div>
            {/* hover actions */}
            <div className="friend-actions">
              <button className="fa-btn">📞</button>
              <button className="fa-btn">💬</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Challenge Spotlight ────────────────────────────────────────────────────────

function ChallengeSpotlight() {
  const pct = (CHALLENGE.progress / CHALLENGE.total) * 100;
  return (
    <div className="section-card" style={{ gridArea: "challenge" }}>
      <div className="section-header">
        <span className="section-icon">🏆</span>
        <h2>تحدي الأسبوع</h2>
        <span className="timer-badge">⏱ {CHALLENGE.timeLeft}</span>
      </div>
      <div className="challenge-body">
        <div className="challenge-title">{CHALLENGE.title}</div>
        <div className="challenge-desc">{CHALLENGE.desc}</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
          <span className="progress-text">{CHALLENGE.progress} / {CHALLENGE.total}</span>
        </div>
        <div className="challenge-reward">🎁 {CHALLENGE.reward}</div>
      </div>
    </div>
  );
}

// ── Smart Match ────────────────────────────────────────────────────────────────

function SmartMatch() {
  const [joined, setJoined] = useState(false);
  return (
    <div className="section-card match-card" style={{ gridArea: "match" }}>
      <div className="section-header">
        <span className="section-icon">🎯</span>
        <h2>انضم الآن</h2>
        <span className="pulse-dot" />
      </div>
      <div className="match-body">
        <div className="match-game">{MATCH_SUGGESTION.game}</div>
        <div className="match-party">"{MATCH_SUGGESTION.partyName}"</div>
        <div className="match-players">
          {MATCH_SUGGESTION.players.map(p => (
            <span key={p} className="match-player-chip">{p}</span>
          ))}
          <span className="match-player-chip match-player-chip--count">+{MATCH_SUGGESTION.count} يلعبون</span>
        </div>
        <button className={`join-btn ${joined ? "join-btn--joined" : ""}`} onClick={() => setJoined(j => !j)}>
          {joined ? "✓ انضممت!" : "⚡ انضم للبارتي"}
        </button>
      </div>
    </div>
  );
}

// ── Pro Status Card ────────────────────────────────────────────────────────────

function ProCard() {
  return (
    <div className="section-card pro-card" style={{ gridArea: "pro" }}>
      <div className="pro-glow-bg" />
      <div className="pro-header">
        <span className="pro-crown">👑</span>
        <div>
          <div className="pro-title">PRO</div>
          <div className="pro-exp">ينتهي ١٦ أغسطس ٢٠٢٦</div>
        </div>
        <div className="pro-badge-pill">ACTIVE</div>
      </div>
      <div className="pro-features">
        <div className="pro-feat">🎙️ غرفتي الصوتية <span>نشطة</span></div>
        <div className="pro-feat">🤖 بوت LFG <span>مفعّل</span></div>
        <div className="pro-feat">🎁 إهداء Pro <span>متاح</span></div>
      </div>
      <a href="/pro" className="pro-manage-btn">إدارة Pro ←</a>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function Dashboard() {
  return (
    <div className="dashboard-root">
      {/* Ticker */}
      <LiveTicker />

      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">مرحباً، <span className="dash-name">Faisal</span> 👋</h1>
          <p className="dash-sub">الآن • أونلاين</p>
        </div>
        <StatsRow />
      </div>

      {/* Quick Dock */}
      <QuickDock />

      {/* Main Grid */}
      <div className="dash-grid">
        <FriendsGrid />
        <div className="side-col">
          <ChallengeSpotlight />
          <SmartMatch />
          <ProCard />
        </div>
      </div>
    </div>
  );
}
