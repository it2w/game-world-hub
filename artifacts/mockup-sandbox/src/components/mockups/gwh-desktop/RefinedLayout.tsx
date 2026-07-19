/**
 * GWH Desktop — Refined Dashboard Mockup
 * Same layout as the real dashboard (LiveTicker → Header → MoodBar → Dock → body grid).
 * Refinements applied:
 *   - dash-name / stat-value: 22px → 17px
 *   - Muted text: #333/#444 → #444/#555
 *   - Ticker: 32px → 26px
 *   - JetBrains Mono base size reduced (root 12.5px)
 *   - Friends cards: minmax(200px) → minmax(160px), height tighter
 *   - Side panel: 320px (was 330px)
 *   - Overall padding/gap slightly tighter for a denser, premium cockpit feel
 */

// ─── tiny colour helpers ─────────────────────────────────────────────────────
const G = "#22C55E";
const BORDER = "#1c1c1c";
const BG = "#080808";
const CARD = "#0d0d0d";
const MUTED = "#555";
const DIMMED = "#333";

function SBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, overflow: "hidden", position: "relative", ...style }}>
      {children}
    </div>
  );
}
function SHd({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 11px", borderBottom: `1px solid #181818`, background: "#0b0b0b" }}>
      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "1.5px", textTransform: "uppercase", color: "#ccc" }}>{title}</span>
      {right}
    </div>
  );
}
function Pill({ children, color = G }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "1px", color, background: `${color}15`, border: `1px solid ${color}40`, padding: "1px 6px" }}>
      {children}
    </span>
  );
}

// ─── TICKER ──────────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  { text: "🏆 LOUD wins VCT Americas 2026", color: "#FFD700" },
  { text: "⚡ Valorant EP9 — New map + agent", color: "#06B6D4" },
  { text: "🎯 GWH Cup Tonight 8PM — Prize: 5,000 SAR", color: G },
  { text: "🔥 Apex: Hunter Season starts July 22", color: "#F97316" },
  { text: "👑 Pro subscription now available", color: "#A855F7" },
  { text: "📡 2,400 players looking for a party now", color: "#EC4899" },
  { text: "🎮 CS2 weapon balance update — Premier S4", color: "#38BDF8" },
];

function LiveTicker() {
  const text = TICKER_ITEMS.map(e => e.text).join("   ◆   ");
  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, background: "#0c0c0c", borderBottom: `1px solid #181818`, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: G, color: "#000", fontSize: 8, fontWeight: 900, letterSpacing: "2px", padding: "0 10px", height: "100%" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#000", display: "inline-block" }} />
        LIVE
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "0 8px", fontSize: 10, color: "#aaa" }}>
        {TICKER_ITEMS.slice(0, 5).map((e, i) => (
          <span key={i}>
            <span style={{ color: e.color }}>{e.text}</span>
            {i < 4 && <span style={{ color: DIMMED, padding: "0 12px" }}>◆</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── HEADER ──────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, sub }: { icon: string; value: string; label: string; color: string; sub?: string }) {
  return (
    <div style={{ position: "relative", background: "#0e0e0e", border: `1px solid ${BORDER}`, padding: "9px 13px", minWidth: 82, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <div style={{ width: 5, height: 5, background: color }} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.5px", color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8.5, color: MUTED, letterSpacing: "1px", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 7.5, color: DIMMED, marginTop: 1 }}>{sub}</div>}
      <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", width: "70%", height: 18, filter: "blur(10px)", opacity: 0.22, borderRadius: "50%", background: color }} />
    </div>
  );
}

function DashHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, padding: "12px 18px 9px", borderBottom: `1px solid #141414`, background: "linear-gradient(180deg,#0e0e0e,#080808)", flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 9, color: MUTED, letterSpacing: "2px", textTransform: "uppercase" }}>مساء الخير،</div>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.5px", color: "#fff", margin: "2px 0 6px" }}>
          <span style={{ background: `linear-gradient(90deg,${G},#06B6D4)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>WOLF_99</span> 👋
        </div>
        {/* XP bar */}
        <div style={{ maxWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: G, letterSpacing: "2px" }}>GOLD · LVL 42</span>
            <span style={{ fontSize: 8, color: "#444" }}>7,240 / 10,000 XP</span>
          </div>
          <div style={{ position: "relative", height: 5, background: "#1a1a1a", border: `1px solid #222` }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "72%", background: `linear-gradient(90deg,${G},#4ADE80)` }} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <StatCard icon="⏱️" value="24h"  label="هذا الأسبوع" color={G}        sub="+3h اليوم" />
        <StatCard icon="🏆" value="#3"   label="التصنيف"     color="#FFD700"   sub="هذا الأسبوع" />
        <StatCard icon="🌐" value="8"    label="متصلون"      color="#06B6D4"   sub="من 24 صديق" />
        <StatCard icon="🔥" value="5d"   label="السلسلة"     color="#F97316"   sub="يومية نشطة" />
      </div>
    </div>
  );
}

// ─── MOOD BAR ─────────────────────────────────────────────────────────────────
const MOODS = ["🎮 جاهز للعب", "💬 للدردشة فقط", "🏆 للتنافس", "😴 مشغول", "🤝 أبحث عن فريق"];
function MoodBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 18px", background: "#0a0a0a", borderBottom: `1px solid #141414`, overflowX: "auto", flexShrink: 0 }}>
      <span style={{ fontSize: 8, color: "#444", letterSpacing: "1px", flexShrink: 0 }}>حالتك:</span>
      {MOODS.map((m, i) => (
        <button key={i} style={{ background: i === 0 ? `${G}15` : "transparent", border: `1px solid ${i === 0 ? `${G}60` : "#1e1e1e"}`, color: i === 0 ? G : MUTED, fontFamily: "inherit", fontSize: 9.5, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>{m}</button>
      ))}
    </div>
  );
}

// ─── QUICK DOCK ───────────────────────────────────────────────────────────────
const DOCK_ITEMS = [
  { icon: "🎮", label: "ألعابي",    color: G },
  { icon: "📡", label: "LFG",       color: "#06B6D4", badge: "2" },
  { icon: "⚔️", label: "الفرق",     color: "#A855F7" },
  { icon: "🏆", label: "البطولات",  color: "#FFD700" },
  { icon: "🎯", label: "التحديات",  color: "#EF4444" },
  { icon: "🛒", label: "المتجر",    color: "#F97316" },
];
function QuickDock() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "5px 18px", borderBottom: `1px solid #141414`, background: "#0a0a0a", overflowX: "auto", flexShrink: 0 }}>
      {DOCK_ITEMS.map((d, i) => (
        <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid #1a1a1a`, color: "#666", padding: "6px 11px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.5px", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 12 }}>{d.icon}</span>
          <span style={{ textTransform: "uppercase" }}>{d.label}</span>
          {d.badge && <span style={{ fontSize: 7.5, fontWeight: 900, color: "#000", background: d.color, padding: "0 4px", borderRadius: 999 }}>{d.badge}</span>}
        </div>
      ))}
      {/* Streak */}
      <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", border: "1px solid #F9731630", background: "#F9731610", flexShrink: 0 }}>
        <span style={{ fontSize: 12 }}>🔥</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: "#F97316" }}>5</span>
        <span style={{ fontSize: 8, color: "#F97316", opacity: 0.7 }}>يوم</span>
      </div>
    </div>
  );
}

// ─── DAILY SPIN ───────────────────────────────────────────────────────────────
const SPIN_SLICES = [
  { color: G,        icon: "⚡", label: "500 XP" },
  { color: "#333",   icon: "💨", label: "MISS" },
  { color: "#FFD700",icon: "👑", label: "PRO DAY" },
  { color: "#06B6D4",icon: "🎯", label: "200 XP" },
  { color: "#333",   icon: "💨", label: "MISS" },
  { color: "#A855F7",icon: "🏅", label: "BADGE" },
  { color: "#EF4444",icon: "🔥", label: "1000 XP" },
  { color: "#F97316",icon: "🎁", label: "100 XP" },
];
function DailySpin() {
  const N = SPIN_SLICES.length;
  const deg = 360 / N;
  return (
    <SBox style={{ minWidth: 0 }}>
      <SHd title="دوامة اليوم" right={<span style={{ fontSize: 8, color: "#FFD700", background: "#FFD70015", border: "1px solid #FFD70040", padding: "1px 6px" }}>FREE</span>} />
      <div style={{ padding: "10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Wheel */}
        <div style={{ position: "relative", width: 160, height: 160 }}>
          <div style={{ position: "absolute", top: -2, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #fff", zIndex: 20 }} />
          <div style={{ width: 160, height: 160, borderRadius: "50%", border: "2px solid #222", overflow: "hidden", position: "relative" }}>
            {SPIN_SLICES.map((s, i) => (
              <div key={i} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "50%", transformOrigin: "50% 100%", transform: `rotate(${i * deg + deg / 2}deg)`, background: `${s.color}22`, borderTop: `1px solid ${s.color}40`, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4 }}>
                <span style={{ fontSize: 9 }}>{s.icon}</span>
              </div>
            ))}
          </div>
          {/* Center button */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 40, height: 40, borderRadius: "50%", background: "#111", border: `2px solid ${G}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: G }}>GO</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${G}30`, width: "100%", background: `${G}08` }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "1px", color: G }}>500 XP</div>
            <div style={{ fontSize: 8, color: MUTED }}>آخر نتيجة</div>
          </div>
        </div>
      </div>
    </SBox>
  );
}

// ─── WEEKLY GRAPH ─────────────────────────────────────────────────────────────
const WG_VALS = [3, 7, 2, 9, 5, 11, 8];
const WG_DAYS = ["إث", "ث", "أر", "خ", "ج", "س", "أح"];
const WG_MAX = Math.max(...WG_VALS);
function WeeklyGraph() {
  return (
    <SBox>
      <SHd title="نشاط الأسبوع" right={<Pill color={G}>+18%</Pill>} />
      <div style={{ padding: "8px 11px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", background: "#111", border: `1px solid #1e1e1e`, marginBottom: 10 }}>
          {[{ val: "42h", lbl: "إجمالي" }, null, { val: "7", lbl: "مباريات" }, null, { val: "5d", lbl: "سلسلة" }].map((item, i) => item === null
            ? <div key={i} style={{ width: 1, height: 20, background: "#1e1e1e" }} />
            : (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "5px 0", gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>{item.val}</span>
                <span style={{ fontSize: 7, color: MUTED, letterSpacing: "1px", textTransform: "uppercase" }}>{item.lbl}</span>
              </div>
            )
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, position: "relative" }}>
          {WG_VALS.map((v, i) => {
            const pct = (v / WG_MAX) * 100;
            const isToday = i === 5;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative", height: "100%", cursor: "pointer" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{ width: "72%", height: `${pct}%`, minHeight: 3, borderRadius: "3px 3px 0 0", background: isToday ? G : "#1e4d2a", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg,rgba(255,255,255,0.15),transparent)", borderRadius: "2px 2px 0 0" }} />
                  </div>
                </div>
                <span style={{ fontSize: 7.5, color: isToday ? G : MUTED, textAlign: "center" }}>{WG_DAYS[i]}</span>
                {isToday && <span style={{ fontSize: 6, color: G, letterSpacing: "0.5px", marginTop: -4 }}>اليوم</span>}
              </div>
            );
          })}
        </div>
      </div>
    </SBox>
  );
}

// ─── HUB CARD ─────────────────────────────────────────────────────────────────
const LFG_ROWS = [
  { user: "Khalid_X",  color: "#EC4899", game: "Valorant", rank: "Diamond 2", need: "3 لاعبين" },
  { user: "ShadowG",   color: "#A855F7", game: "Apex",     rank: "Platinum",  need: "1 لاعب" },
  { user: "NightRvn",  color: "#06B6D4", game: "CS2",      rank: "MG2",       need: "2 لاعبين" },
];
function HubCard() {
  return (
    <SBox style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", borderBottom: `1px solid #181818`, background: "#0b0b0b" }}>
        {["LFG", "حفلات", "أخبار"].map((t, i) => (
          <button key={i} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderBottom: `2px solid ${i === 0 ? G : "transparent"}`, color: i === 0 ? G : MUTED, fontFamily: "inherit", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.5px", padding: "7px 4px", cursor: "pointer", textTransform: "uppercase" }}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 10px", gap: 5, overflow: "hidden" }}>
        {LFG_ROWS.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: i < 2 ? `1px solid #181818` : "none" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", border: `1px solid ${r.color}40`, background: `${r.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: r.color, flexShrink: 0 }}>{r.user[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#ccc" }}>{r.user}</div>
              <div style={{ fontSize: 8, marginTop: 1, color: r.color, fontWeight: 600 }}>{r.game} · {r.rank}</div>
            </div>
            <div style={{ fontSize: 8.5, color: "#aaa", fontWeight: 700 }}>{r.need}</div>
            <button style={{ background: "transparent", border: `1px solid ${r.color}60`, color: r.color, fontFamily: "inherit", fontSize: 7.5, fontWeight: 900, padding: "3px 7px", cursor: "pointer" }}>انضم</button>
          </div>
        ))}
        <a style={{ fontSize: 8.5, color: G, textAlign: "center", padding: "3px 0 0", cursor: "pointer", opacity: 0.7, letterSpacing: "1px", textDecoration: "none", marginTop: "auto" }}>عرض الكل ←</a>
      </div>
    </SBox>
  );
}

// ─── FRIENDS GRID ─────────────────────────────────────────────────────────────
const FRIENDS = [
  { name: "Khalid",    user: "k_pro",    color: "#EC4899", status: "online",  game: "Valorant",  rank: "D2"  },
  { name: "Sara",      user: "sara_fps", color: "#06B6D4", status: "online",  game: "Apex",      rank: "P1"  },
  { name: "Faisal",    user: "fx2",      color: G,         status: "online",  game: "CS2",       rank: "MG2" },
  { name: "Reem",      user: "reem_x",   color: "#F97316", status: "away",    game: null,        rank: "G3"  },
  { name: "Ziad",      user: "z_gg",     color: "#A855F7", status: "busy",    game: "Overwatch", rank: "P"   },
  { name: "NoName_7",  user: "nn7",      color: "#38BDF8", status: "offline", game: null,        rank: "B1"  },
];
const STATUS_COLORS: Record<string, string> = { online: G, away: "#F59E0B", busy: "#EF4444", offline: "#333" };
function FriendsGrid() {
  return (
    <SBox>
      <SHd title="الأصدقاء المتصلون" right={<Pill>5 / 24 متصل</Pill>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 9, padding: 11 }}>
        {FRIENDS.map((f, i) => (
          <div key={i} style={{ position: "relative", background: "#0f0f0f", border: `1px solid #1e1e1e`, display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", cursor: "pointer" }}>
            {/* Banner */}
            <div style={{ height: 52, width: "100%", background: `linear-gradient(135deg, ${f.color}20, transparent)`, flexShrink: 0 }} />
            {/* Avatar */}
            <div style={{ position: "relative", marginTop: -22, zIndex: 2 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1a1a1a", border: `2px solid ${f.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: "#fff" }}>{f.name[0]}</div>
              <div style={{ width: 10, height: 10, borderRadius: "50%", position: "absolute", bottom: 1, right: 1, border: "2px solid #0f0f0f", background: STATUS_COLORS[f.status] }} />
            </div>
            <div style={{ textAlign: "center", padding: "6px 8px 2px", width: "100%" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>@{f.user}</div>
              {f.game
                ? <div style={{ fontSize: 9, marginTop: 2, fontWeight: 600, color: f.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🎮 {f.game}</div>
                : <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "1px", marginTop: 2 }}>غير نشط</div>
              }
            </div>
            <div style={{ display: "flex", gap: 3, padding: "7px 7px 8px", width: "100%", borderTop: "1px solid #1a1a1a", marginTop: 6 }}>
              <button style={{ flex: 1, background: "transparent", border: `1px solid #2a2a2a`, fontFamily: "inherit", fontSize: 9, fontWeight: 700, padding: "5px 2px", cursor: "pointer", color: "#888", textAlign: "center" }}>DM</button>
              <button style={{ flex: 1, background: "transparent", border: `1px solid #2a2a2a`, fontFamily: "inherit", fontSize: 9, fontWeight: 700, padding: "5px 2px", cursor: "pointer", color: "#888", textAlign: "center" }}>دعوة</button>
            </div>
          </div>
        ))}
      </div>
    </SBox>
  );
}

// ─── COMMUNITY HIGHLIGHTS ────────────────────────────────────────────────────
const HIGHLIGHTS = [
  { user: "Khalid",  color: "#EC4899", clip: "Ace Round Valorant 🔥",          views: "12K", ago: "2m" },
  { user: "Sara",    color: "#06B6D4", clip: "Apex Predator Montage ⚡",        views: "8.4K", ago: "7m" },
  { user: "Faisal2", color: G,         clip: "5K AWP CS2 Premier 💥",          views: "21K", ago: "15m" },
  { user: "Reem",    color: "#F97316", clip: "Overwatch Triple Elimination 🎯", views: "5.1K", ago: "28m" },
];
function CommunityHighlights() {
  return (
    <SBox>
      <SHd title="أبرز المجتمع" right={<a style={{ fontSize: 8, color: G, cursor: "pointer", letterSpacing: "1px" }}>الكل</a>} />
      {HIGHLIGHTS.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px", borderBottom: i < 3 ? `1px solid #131313` : "none", cursor: "pointer" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid ${h.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff", background: `${h.color}20`, flexShrink: 0 }}>{h.user[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.clip}</div>
            <div style={{ fontSize: 7.5, color: "#444", marginTop: 2 }}>{h.user} · {h.ago}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span style={{ fontSize: 8.5, color: MUTED }}>{h.views} مشاهدة</span>
            <button style={{ background: "transparent", border: `1px solid ${h.color}50`, color: h.color, fontFamily: "inherit", fontSize: 7.5, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>شاهد</button>
          </div>
        </div>
      ))}
    </SBox>
  );
}

// ─── GLOBAL CHAT ──────────────────────────────────────────────────────────────
const CHAT_MSGS = [
  { user: "Wolf_99",    color: G,        time: "09:41", text: "جاهز للماتش؟ Valorant Ranked", pro: true  },
  { user: "ShadowKing", color: "#60a5fa",time: "09:42", text: "انا حاضر، ننتظر اللاعب الخامس", pro: false },
  { user: "GWH_05",     color: "#f97316",time: "09:43", text: "جاهز، روم فاضي عندي", pro: true  },
  { user: "NightRaven", color: "#a78bfa",time: "09:44", text: "كمان دقيقتين وانا معاكم", pro: false },
  { user: "System",     color: G,        time: "09:45", text: "🏆 Wolf_99 دخل Top 10 لهذا الأسبوع!", pro: false, system: true },
];
function GlobalChat() {
  return (
    <SBox style={{ marginTop: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px 7px", borderBottom: `1px solid #181818`, background: "linear-gradient(90deg,#0d0d0d,#0a0a0a)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: G, boxShadow: `0 0 5px ${G}`, display: "inline-block" }} />
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", flex: 1 }}>الدردشة العامة</span>
        <span style={{ fontFamily: "monospace", fontSize: 8, color: MUTED, background: "#1a1a1a", padding: "1px 6px" }}>87 متصل</span>
      </div>
      {CHAT_MSGS.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 9, padding: "4px 13px", background: m.system ? `${G}06` : "transparent", borderRight: m.system ? `2px solid ${G}30` : "none" }}>
          {!m.system && <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${m.color}20`, border: `1px solid ${m.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: m.color, flexShrink: 0, marginTop: 1 }}>{m.user[0]}</div>}
          {m.system  && <div style={{ width: 26, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!m.system && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 11.5, color: m.color }}>{m.user}</span>
                {m.pro && <span style={{ fontSize: 8, fontFamily: "monospace", background: `${G}12`, color: G, border: `1px solid ${G}25`, padding: "0 4px", borderRadius: 2 }}>PRO</span>}
                <span style={{ fontSize: 9.5, color: "#3d3d3d", fontFamily: "monospace", marginInlineStart: "auto" }}>{m.time}</span>
              </div>
            )}
            <div style={{ fontSize: m.system ? 11 : 12, color: m.system ? "#6aef6a" : "#c8c8c8", lineHeight: 1.4 }}>{m.text}</div>
          </div>
        </div>
      ))}
      <div style={{ borderTop: `1px solid #181818`, padding: "9px 13px" }}>
        <div style={{ background: "#111", border: `1px solid #2a2a2a`, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", height: 34 }}>
          <span style={{ color: "#3a3a3a", fontSize: 11 }}>📎</span>
          <span style={{ color: "#3a3a3a", fontSize: 11 }}>😀</span>
          <span style={{ flex: 1, fontSize: 11, color: "#3a3a3a" }}>اكتب رسالة في العام…</span>
          <span style={{ fontFamily: "monospace", fontSize: 9.5, color: "#2a2a2a" }}>↵</span>
        </div>
      </div>
    </SBox>
  );
}

// ─── SIDE: BATTLE PASS ────────────────────────────────────────────────────────
function BattlePassWidget() {
  return (
    <SBox>
      <SHd title="باس المعركة" right={<Pill color="#A855F7">S12</Pill>} />
      <div style={{ padding: "10px 11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, background: "linear-gradient(135deg,#A855F7,#6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎖️</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1px" }}>مستوى 32</div>
            <div style={{ fontSize: 8, color: MUTED, marginTop: 1 }}>من 100 مستوى</div>
          </div>
          <div style={{ marginInlineStart: "auto", fontSize: 17, fontWeight: 900, color: "#A855F7" }}>32%</div>
        </div>
        <div style={{ height: 5, background: "#1a1a1a", border: `1px solid #252525`, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "32%", background: "linear-gradient(90deg,#A855F7,#c084fc)" }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8, overflowX: "auto" }}>
          {["🎁", "⚡", "🏅", "👑"].map((icon, i) => (
            <div key={i} style={{ flexShrink: 0, width: 34, height: 34, background: i < 2 ? "#1a1a1a" : "#111", border: `1px solid ${i < 2 ? "#A855F730" : "#1e1e1e"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: i < 2 ? 1 : 0.4 }}>{icon}</div>
          ))}
        </div>
      </div>
    </SBox>
  );
}

// ─── SIDE: QUESTS ─────────────────────────────────────────────────────────────
const QUESTS = [
  { icon: "🎯", name: "العب 3 مباريات مصنفة", xp: "+200 XP", pct: 66, done: false },
  { icon: "🤝", name: "العب مع صديق", xp: "+100 XP", pct: 100, done: true  },
  { icon: "💬", name: "أرسل 10 رسائل", xp: "+50 XP",  pct: 40, done: false },
];
function QuestsWidget() {
  return (
    <SBox>
      <SHd title="مهام اليوم" right={<span style={{ fontSize: 13, fontWeight: 900, color: "#F97316" }}>5 🔥</span>} />
      <div style={{ padding: "9px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
        {QUESTS.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{q.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: q.done ? MUTED : "#e6e6e6", textDecoration: q.done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.name}</span>
                <span style={{ fontSize: 9, color: G, flexShrink: 0, fontWeight: 700 }}>{q.xp}</span>
              </div>
              <div style={{ height: 3, background: "#1a1a1a", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${q.pct}%`, background: q.done ? "#444" : G, transition: "width 0.4s" }} />
              </div>
            </div>
            {q.done && <span style={{ fontSize: 11, color: G, fontWeight: 900, flexShrink: 0 }}>✓</span>}
          </div>
        ))}
      </div>
    </SBox>
  );
}

// ─── SIDE: SMART MATCH ────────────────────────────────────────────────────────
function SmartMatch() {
  return (
    <SBox style={{ borderColor: `${G}30`, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -25, right: -25, width: 80, height: 80, borderRadius: "50%", background: `radial-gradient(circle,${G}08,transparent 70%)` }} />
      <SHd title="تطابق ذكي" right={<div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, fontWeight: 900, letterSpacing: "2px", color: G, background: `${G}15`, border: `1px solid ${G}40`, padding: "1px 6px" }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: G, display: "inline-block" }} />LIVE</div>} />
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px", padding: "3px 11px 0" }}>Valorant</div>
      <div style={{ fontSize: 8.5, color: MUTED, padding: "1px 11px 5px" }}>Ranked · Diamond+</div>
      <div style={{ display: "flex", gap: 3, padding: "0 11px 7px" }}>
        {["K", "S", "F"].map((l, i) => (
          <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${[G, "#06B6D4", "#EC4899"][i]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", background: `${[G, "#06B6D4", "#EC4899"][i]}15` }}>{l}</div>
        ))}
        <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px dashed #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: DIMMED }}>+</div>
      </div>
      <div style={{ padding: "0 11px 5px" }}>
        <div style={{ height: 4, background: "#1a1a1a", border: `1px solid #222`, overflow: "hidden", marginBottom: 3 }}>
          <div style={{ height: "100%", width: "72%", background: G, transition: "width 1s linear" }} />
        </div>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: G }}>يتم البحث...</div>
      </div>
      <button style={{ width: "calc(100% - 22px)", margin: "0 11px 11px", padding: "9px", background: G, border: "none", fontFamily: "inherit", fontSize: 10, fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase", color: "#000", cursor: "pointer" }}>انضم</button>
    </SBox>
  );
}

// ─── SIDE: CHALLENGE VS ───────────────────────────────────────────────────────
function ChallengeVs() {
  return (
    <SBox style={{ borderColor: "#EF444430" }}>
      <SHd title="تحدي 1v1" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", gap: 7 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 55 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", border: `2px solid ${G}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#fff", background: `${G}15` }}>A</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#ccc" }}>أنت</span>
          <span style={{ fontSize: 7.5, letterSpacing: "1px", color: G }}>DIAMOND</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#EF4444", textShadow: "0 0 14px #EF4444", letterSpacing: "2px" }}>VS</div>
          <span style={{ fontSize: 7.5, color: G, letterSpacing: "1px" }}>أرسلت</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 55 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid #EF444460", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#fff", background: "#EF444415" }}>W</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#ccc" }}>Wolf_99</span>
          <span style={{ fontSize: 7.5, letterSpacing: "1px", color: "#EF4444" }}>DIAMOND</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, padding: "0 11px 4px", flexWrap: "wrap" }}>
        {["Wolf_99", "Sara", "Khalid"].map((f, i) => (
          <button key={i} style={{ background: "transparent", border: `1px solid #2a2a2a`, fontFamily: "inherit", fontSize: 8.5, padding: "2px 7px", cursor: "pointer", color: i === 0 ? G : "#888" }}>{f}</button>
        ))}
      </div>
      <button style={{ width: "calc(100% - 22px)", margin: "5px 11px 11px", padding: "9px", background: "#EF4444", border: "none", fontFamily: "inherit", fontSize: 10, fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase", color: "#fff", cursor: "pointer" }}>أرسل تحدياً</button>
    </SBox>
  );
}

// ─── SIDE: TOURNAMENT ─────────────────────────────────────────────────────────
function TournamentCard() {
  return (
    <SBox>
      <SHd title="البطولات" right={<span style={{ fontSize: 8, fontWeight: 900, color: "#EF4444", letterSpacing: "1px" }}>🔥 ساخن</span>} />
      {[
        { name: "GWH Cup #12", game: "Valorant", prize: "5,000 SAR", hot: true  },
        { name: "CS2 Pro League", game: "CS2",      prize: "2,000 SAR", hot: false },
      ].map((t, i) => (
        <div key={i} style={{ position: "relative", borderBottom: i === 0 ? `1px solid #111` : "none", overflow: "hidden", background: t.hot ? "#ffffff03" : "transparent" }}>
          {t.hot && <div style={{ position: "absolute", top: 0, right: 0, width: 3, height: "100%", background: "#EF4444" }} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px 9px 14px", gap: 7 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>{t.game}</div>
            </div>
            <div style={{ textAlign: "end" }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, marginBottom: 3, color: "#FFD700" }}>{t.prize}</div>
              <button style={{ fontFamily: "inherit", fontSize: 7.5, fontWeight: 900, letterSpacing: "1px", padding: "3px 9px", cursor: "pointer", border: `1px solid ${G}`, color: G, background: "transparent" }}>سجّل</button>
            </div>
          </div>
        </div>
      ))}
    </SBox>
  );
}

// ─── SIDE: LEADERBOARD ────────────────────────────────────────────────────────
const LB = [
  { name: "Wolf_99",    pts: 3520, pos: 1 },
  { name: "NightRaven", pts: 2890, pos: 2 },
  { name: "GWH_05",     pts: 2340, pos: 3, me: true },
  { name: "ShadowKing", pts: 1980, pos: 4 },
  { name: "Apex_Pred",  pts: 1770, pos: 5 },
];
const LB_MAX = 3520;
function Leaderboard() {
  return (
    <SBox>
      <SHd title="أفضل 5 هذا الأسبوع" />
      <div style={{ padding: "7px 11px", display: "flex", flexDirection: "column", gap: 4 }}>
        {LB.map(p => (
          <div key={p.pos} style={{ display: "flex", alignItems: "center", gap: 6, padding: p.me ? "2px 4px" : "2px 0", background: p.me ? "rgba(6,182,212,0.05)" : "transparent", borderRadius: 2 }}>
            <span style={{ fontSize: 10.5, minWidth: 22, textAlign: "center", color: p.pos === 1 ? "#eab308" : p.pos === 2 ? "#9ca3af" : p.pos === 3 ? "#d97706" : "#3d3d3d", fontWeight: 700 }}>{p.pos === 1 ? "🥇" : p.pos === 2 ? "🥈" : p.pos === 3 ? "🥉" : p.pos}</span>
            <span style={{ fontSize: 8.5, fontWeight: 700, minWidth: 54, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: p.me ? "#e6e6e6" : "#9a9a9a", fontStyle: p.me ? "normal" : "normal" }}>{p.name}</span>
            <div style={{ flex: 1, background: "#141414", height: 4, border: `1px solid #1e1e1e`, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(p.pts / LB_MAX) * 100}%`, background: p.me ? "#06B6D4" : G }} />
            </div>
            <span style={{ fontSize: 8.5, fontWeight: 700, minWidth: 34, textAlign: "end", color: "#4a4a4a" }}>{p.pts.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </SBox>
  );
}

// ─── SIDE: ACHIEVEMENT ────────────────────────────────────────────────────────
function AchievementShowcase() {
  return (
    <SBox>
      <SHd title="الإنجازات" right={
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === 0 ? "#FFD700" : "#333", cursor: "pointer" }} />)}
        </div>
      } />
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px" }}>
        <span style={{ fontSize: 24 }}>🏆</span>
        <div>
          <div style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: "2px", color: "#FFD700" }}>LEGENDARY</div>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", margin: "1px 0" }}>قناص الساحة</div>
          <div style={{ fontSize: 8.5, color: MUTED }}>5 فلسات في ماتش واحد</div>
        </div>
        <div style={{ position: "absolute", bottom: -8, left: 18, width: 55, height: 25, filter: "blur(14px)", opacity: 0.35, borderRadius: "50%", background: "#FFD700" }} />
      </div>
    </SBox>
  );
}

// ─── SIDE: PRO CARD ───────────────────────────────────────────────────────────
function ProCard() {
  return (
    <div style={{ background: CARD, border: "1px solid #fbbf2440", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top right,rgba(251,191,36,.05),transparent 60%)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderBottom: `1px solid #1f1f1f`, position: "relative" }}>
        <span style={{ fontSize: 18 }}>👑</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#fbbf24", letterSpacing: "3px" }}>PRO MEMBER</div>
          <div style={{ fontSize: 7.5, color: "#666", marginTop: 1 }}>يتجدد 15 أغسطس</div>
        </div>
        <span style={{ marginInlineStart: "auto", fontSize: 7, fontWeight: 900, letterSpacing: "1px", color: "#000", background: "#fbbf24", padding: "2px 7px" }}>ACTIVE ✓</span>
      </div>
      <div style={{ padding: "5px 11px", display: "flex", flexDirection: "column", gap: 0 }}>
        {[["🎙️", "غرفتي الخاصة", true], ["🤖", "بوت LFG", true], ["🎨", "إطار مخصص", true], ["🎁", "هدية Pro", false]].map(([icon, label, on], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 8.5, color: "#666", padding: "4px 0", borderBottom: i < 3 ? "1px solid #111" : "none" }}>
            <span>{icon}</span><span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontSize: 7.5, fontWeight: 700, color: on ? G : "#fbbf24" }}>{on ? "فعال" : "متاح"}</span>
          </div>
        ))}
      </div>
      <a style={{ display: "block", margin: "5px 11px 11px", background: "transparent", border: "1px solid #fbbf2440", color: "#fbbf24", fontFamily: "inherit", fontSize: 8.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", padding: "7px", cursor: "pointer", textDecoration: "none", textAlign: "center" }}>إدارة الاشتراك</a>
    </div>
  );
}

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────
export function RefinedLayout() {
  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal','JetBrains Mono','Courier New',monospace", fontSize: "12.5px", background: BG, color: "#e0e0e0", width: "100%", minHeight: "100vh", lineHeight: 1.5, position: "relative" }}>
      {/* Scanlines overlay */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.03) 3px,rgba(0,0,0,0.03) 4px)" }} />

      {/* ── Ticker ── */}
      <LiveTicker />

      {/* ── Header ── */}
      <DashHeader />

      {/* ── Mood Bar ── */}
      <MoodBar />

      {/* ── Quick Dock ── */}
      <QuickDock />

      {/* ── Body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 9, padding: "9px 18px 0", position: "relative", zIndex: 2 }}>

        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {/* Top row: Spin | Graph | Hub */}
          <div style={{ display: "grid", gridTemplateColumns: "210px 290px 1fr", gap: 9 }}>
            <DailySpin />
            <WeeklyGraph />
            <HubCard />
          </div>
          <FriendsGrid />
          <CommunityHighlights />
          <GlobalChat />
        </div>

        {/* Side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <BattlePassWidget />
          <QuestsWidget />
          <SmartMatch />
          <ChallengeVs />
          <TournamentCard />
          <Leaderboard />
          <AchievementShowcase />
          <ProCard />
        </div>
      </div>

      {/* Spacing at bottom */}
      <div style={{ height: 40 }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        button { font-family: inherit; }
      `}</style>
    </div>
  );
}
