/* ── ③ AURORA — أوكالبتوس فاخر ──────────────────────────────────────────── */
import "./aurora.css";

export function PremiumEdge() {
  return (
    <div className="aurora-wrap">
      <div className="aurora-card">

        {/* ── HEADER ── */}
        <div className="aurora-header">
          <div className="aurora-bg" />
          <div className="aurora-orb aurora-orb-1" />
          <div className="aurora-orb aurora-orb-2" />
          <div className="aurora-orb aurora-orb-3" />
          <div className="aurora-header-fade" />

          {/* Crown tag */}
          <div className="aurora-crown-tag">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            TRANSCENDENT
          </div>

          {/* Buttons */}
          <div className="aurora-btns">
            <button className="aurora-btn aurora-btn--ghost">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              دردشة
            </button>
            <button className="aurora-btn aurora-btn--call">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              اتصال
            </button>
          </div>

          {/* Prestige bar */}
          <div className="aurora-prestige">
            <div className="aurora-prestige-label">Prestige Level VI</div>
            <div className="aurora-prestige-track">
              <div className="aurora-prestige-fill" />
            </div>
          </div>
        </div>

        {/* ── AVATAR ── */}
        <div className="aurora-identity">
          <div className="aurora-ava-wrap">
            <div className="aurora-ava-halo" />
            <div className="aurora-ava">
              <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Aurora&backgroundColor=059669" alt="" />
            </div>
            <div className="aurora-status-ring" />
          </div>

          <div className="aurora-info">
            <h2 className="aurora-name">
              <span>Solar</span><span className="aurora-name-accent">Void</span>
            </h2>
            <div className="aurora-sub">
              <span className="aurora-handle">@solarvoid</span>
              <span className="aurora-badge">◈ PRO</span>
            </div>
          </div>
        </div>

        {/* ── BIO ── */}
        <div className="aurora-bio">
          <p className="aurora-bio-text">
            "الهدف مش الفوز فقط، الهدف إنك تلعب بطريقة ما ينساها أحد."
          </p>
        </div>

        {/* ── GAME TAGS ── */}
        <div className="aurora-tags">
          {["Apex Legends", "Valorant", "Overwatch 2", "The Finals", "+2"].map((tag, i) => (
            <span key={tag} className={`aurora-tag${i === 0 ? " aurora-tag--active" : ""}`}>{tag}</span>
          ))}
        </div>

        {/* ── ACTIVITY ── */}
        <div className="aurora-activity">
          <div className="aurora-activity-icon">🎮</div>
          <div className="aurora-activity-text">
            <span className="aurora-activity-game">Apex Legends</span>
            <span className="aurora-activity-meta">Ranked — Diamond Lobby · 2h 08m</span>
          </div>
          <div className="aurora-activity-kill">
            <span className="aurora-kill-num">18</span>
            <span className="aurora-kill-label">kills</span>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div className="aurora-stats">
          {[
            { num: "2,041", lbl: "انتصار", hi: true },
            { num: "3.2", lbl: "K/D" },
            { num: "74%", lbl: "Win" },
            { num: "#48", lbl: "Global" },
          ].map(s => (
            <div key={s.lbl} className={`aurora-stat ${s.hi ? "aurora-stat--hi" : ""}`}>
              <span className="aurora-stat-n">{s.num}</span>
              <span className="aurora-stat-l">{s.lbl}</span>
            </div>
          ))}
        </div>

        {/* ── ACHIEVEMENTS ── */}
        <div className="aurora-achievements">
          {[
            { icon: "🏆", label: "World Champ" },
            { icon: "💎", label: "Diamond x5" },
            { icon: "⚡", label: "Speed King" },
            { icon: "🎯", label: "Sharpshooter" },
          ].map(a => (
            <div key={a.label} className="aurora-ach">
              <span className="aurora-ach-icon">{a.icon}</span>
              <span className="aurora-ach-label">{a.label}</span>
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div className="aurora-footer">
          <div className="aurora-footer-left">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            ٥٨٤ صديق
          </div>
          <div className="aurora-footer-mid">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            عضو منذ ٢٠١٩
          </div>
          <div className="aurora-footer-right">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            نشط الآن
          </div>
        </div>

      </div>
    </div>
  );
}
