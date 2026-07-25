/* ── ② OBSIDIAN — هوية فاخرة داكنة ──────────────────────────────────────── */
import "./obsidian.css";

export function DarkLuxe() {
  return (
    <div className="obs-wrap">
      <div className="obs-card">

        {/* Animated border glow */}
        <div className="obs-border-glow" />

        {/* ── HEADER ── */}
        <div className="obs-header">
          <div className="obs-header-grid" />
          <div className="obs-header-fade" />

          {/* Tier display */}
          <div className="obs-tier">
            <div className="obs-tier-icon">👑</div>
            <div>
              <div className="obs-tier-label">MASTER TIER</div>
              <div className="obs-tier-points">6,200 LP</div>
            </div>
          </div>

          {/* Live indicator */}
          <div className="obs-live-badge">
            <span className="obs-live-pulse" />
            LIVE
          </div>

          {/* Buttons */}
          <div className="obs-btns">
            <button className="obs-btn obs-btn--msg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              دردشة
            </button>
            <button className="obs-btn obs-btn--call">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              اتصال
            </button>
          </div>
        </div>

        {/* ── AVATAR SECTION ── */}
        <div className="obs-identity">
          <div className="obs-avatar-outer">
            <div className="obs-avatar-ring-animated" />
            <div className="obs-avatar">
              <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Obsidian&backgroundColor=6366f1" alt="" />
            </div>
          </div>

          <div className="obs-name-block">
            <h2 className="obs-name">NightRaven</h2>
            <div className="obs-handle-row">
              <span className="obs-handle">@nightraven</span>
              <span className="obs-verified">✦ PRO</span>
            </div>
          </div>
        </div>

        {/* ── STATUS BAR ── */}
        <div className="obs-status-bar">
          <div className="obs-status-dot-wrap">
            <div className="obs-status-dot" />
          </div>
          <span className="obs-status-text">League of Legends · Solo/Duo</span>
          <span className="obs-status-dur">4h 12m</span>
        </div>

        {/* ── STATS ── */}
        <div className="obs-stats-grid">
          {[
            { label: "انتصار", value: "1,204", accent: true },
            { label: "K/D", value: "2.31" },
            { label: "Win %", value: "71%" },
            { label: "ساعات", value: "3,847" },
          ].map(s => (
            <div key={s.label} className={`obs-stat-cell ${s.accent ? "obs-stat-cell--accent" : ""}`}>
              <span className="obs-stat-num">{s.value}</span>
              <span className="obs-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── GAMES PLAYED ── */}
        <div className="obs-games-row">
          <span className="obs-games-title">يلعب دائماً</span>
          {["LoL", "Valorant", "TFT", "+3"].map(g => (
            <span key={g} className="obs-game-tag">{g}</span>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div className="obs-footer">
          <div className="obs-footer-stat">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <span>٣٨٢ صديق</span>
          </div>
          <div className="obs-separator" />
          <div className="obs-footer-stat">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>٥ سنوات عضوية</span>
          </div>
          <div className="obs-separator" />
          <div className="obs-footer-stat">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>آخر نشاط: الآن</span>
          </div>
        </div>
      </div>
    </div>
  );
}
