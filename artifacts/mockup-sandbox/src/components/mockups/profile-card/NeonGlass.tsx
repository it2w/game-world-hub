/* ── ① PHANTOM — سينمائي داكن ────────────────────────────────────────────── */
import "./phantom.css";

export function NeonGlass() {
  return (
    <div className="phantom-wrap">
      <div className="phantom-card">

        {/* ── NOISE OVERLAY ── */}
        <div className="phantom-noise" />

        {/* ── BANNER ── */}
        <div className="phantom-banner">
          <div className="phantom-banner-bg" />
          <div className="phantom-banner-scan" />
          <div className="phantom-banner-vignette" />

          {/* Rank chip */}
          <div className="phantom-rank-chip">
            <span className="phantom-rank-gem">◆</span>
            <span className="phantom-rank-name">RADIANT</span>
            <span className="phantom-rank-mmr">2,841 RR</span>
          </div>

          {/* Action buttons */}
          <div className="phantom-actions">
            <button className="phantom-btn phantom-btn--ghost">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              دردشة
            </button>
            <button className="phantom-btn phantom-btn--primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              اتصال
            </button>
          </div>
        </div>

        {/* ── AVATAR ── */}
        <div className="phantom-avatar-row">
          <div className="phantom-avatar-wrap">
            <div className="phantom-avatar-ring" />
            <div className="phantom-avatar">
              <img src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Phantom&backgroundColor=ff4655" alt="" />
            </div>
            <div className="phantom-online-dot">
              <span />
            </div>
          </div>
          <div className="phantom-name-col">
            <div className="phantom-displayname">
              PhantomX
              <svg className="phantom-pro-star" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div className="phantom-username">@phantomx</div>
          </div>
        </div>

        {/* ── GAME STATUS ── */}
        <div className="phantom-status">
          <div className="phantom-status-dot" />
          <span className="phantom-status-game">Valorant</span>
          <span className="phantom-status-sep">·</span>
          <span className="phantom-status-mode">Competitive</span>
          <span className="phantom-status-time">3h 21m</span>
        </div>

        {/* ── STATS ── */}
        <div className="phantom-stats">
          {[
            { v: "847", l: "انتصار" },
            { v: "1.84", l: "K/D" },
            { v: "68%", l: "Win Rate" },
            { v: "4,291", l: "مباراة" },
          ].map(s => (
            <div key={s.l} className="phantom-stat">
              <span className="phantom-stat-v">{s.v}</span>
              <span className="phantom-stat-l">{s.l}</span>
            </div>
          ))}
        </div>

        {/* ── BIO ── */}
        <div className="phantom-bio">
          <span className="phantom-bio-q">"</span>
          بتلعب تنافسي؟ أنا بانتظارك. سنوات من التمرين، ثوانٍ للهزيمة.
          <span className="phantom-bio-q">"</span>
        </div>

        {/* ── BOTTOM LINE ── */}
        <div className="phantom-divider" />
        <div className="phantom-footer">
          <div className="phantom-footer-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span>٢٤٧ صديق</span>
          </div>
          <div className="phantom-footer-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span>يبث الآن</span>
          </div>
          <div className="phantom-footer-item">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Riyadh, SA</span>
          </div>
        </div>

      </div>
    </div>
  );
}
