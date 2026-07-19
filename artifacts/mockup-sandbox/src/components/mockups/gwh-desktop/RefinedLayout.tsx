/**
 * GWH Desktop — Refined Layout Mockup
 * Fixes: everything too large, small text unclear, unprofessional feel.
 * Improvements:
 *   - Tighter base font scale (12px → 13px root, consistent hierarchy)
 *   - Sidebar: narrower (220px), smaller icons, finer group labels, better active state
 *   - Topbar: slimmer (44px), refined status indicator, right-rail info
 *   - Muted text contrast bumped from 60% → 65% lightness for readability
 *   - Content area: demonstrates chat + dashboard panels with better spacing
 *   - Overall: more premium "cockpit" feel — dense but breathable
 */
export function RefinedLayout() {
  const NAV = [
    { icon: "⊞", label: "الرئيسية", active: false },
    { icon: "👤", label: "الأصدقاء", active: false },
    { icon: "💬", label: "المحادثات", active: true, badge: 3 },
    { icon: "⚔️", label: "الفرق", active: false },
    { icon: "📡", label: "LFG", active: false },
    { icon: "🏆", label: "التصنيفات", active: false },
    { icon: "👑", label: "Pro Hunt", active: false },
    { icon: "📅", label: "الأحداث", active: false },
    { icon: "⚡", label: "التحديات", active: false },
    { icon: "🎖", label: "الموسم", active: false },
  ];
  const DATA_NAV = [
    { icon: "📚", label: "المكتبة", active: false },
    { icon: "⚙️", label: "الإعدادات", active: false },
  ];

  const MESSAGES = [
    { user: "Wolf_99",    color: "#4ade80", time: "09:41", text: "جاهز للماتش؟ Valorant Ranked", pro: true  },
    { user: "ShadowKing", color: "#60a5fa", time: "09:42", text: "انا حاضر، ننتظر اللاعب الخامس", pro: false },
    { user: "GWH_05",     color: "#f97316", time: "09:43", text: "جاهز، روم فاضي عندي", pro: true  },
    { user: "NightRaven", color: "#a78bfa", time: "09:44", text: "كمان دقيقتين وانا معاكم", pro: false },
    { user: "Wolf_99",    color: "#4ade80", time: "09:44", text: "تمام، 5 دقائق", pro: true  },
    { user: "System",     color: "#00ff41", time: "09:45", text: "🏆 Wolf_99 دخل Top 10 لهذا الأسبوع!", pro: false, system: true },
  ];

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "'Tajawal', 'Inter', sans-serif",
        fontSize: "13px",
        background: "#080808",
        color: "#e6e6e6",
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        lineHeight: 1.5,
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        minWidth: 220,
        background: "#0d0d0d",
        borderLeft: "1px solid #1f1f1f",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{
          height: 44,
          borderBottom: "1px solid #1f1f1f",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
        }}>
          <span style={{ color: "#00ff41", fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>◈</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 11, letterSpacing: 3, color: "#00ff41", textTransform: "uppercase" }}>
            Game World Hub
          </span>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {/* Group: Comms */}
          <div style={{
            padding: "12px 14px 4px",
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#4a4a4a",
            fontWeight: 600,
          }}>
            التواصل
          </div>
          {NAV.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "0 10px",
              height: 34,
              margin: "1px 4px",
              borderRadius: 2,
              background: item.active ? "rgba(0,255,65,0.08)" : "transparent",
              borderRight: item.active ? "2px solid #00ff41" : "2px solid transparent",
              color: item.active ? "#e6e6e6" : "#8a8a8a",
              cursor: "pointer",
              fontSize: 12.5,
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  background: "#00ff41",
                  color: "#000",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 9.5,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  minWidth: 18,
                  textAlign: "center",
                }}>
                  {item.badge}
                </span>
              )}
            </div>
          ))}

          {/* Group: Data */}
          <div style={{
            padding: "16px 14px 4px",
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#4a4a4a",
            fontWeight: 600,
          }}>
            البيانات
          </div>
          {DATA_NAV.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "0 10px",
              height: 34,
              margin: "1px 4px",
              borderRadius: 2,
              color: "#8a8a8a",
              cursor: "pointer",
              fontSize: 12.5,
            }}>
              <span style={{ fontSize: 13 }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* User footer */}
        <div style={{
          borderTop: "1px solid #1f1f1f",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#00ff41,#004a13)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#000",
            flexShrink: 0,
          }}>G</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e6e6e6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>GWH_05</div>
            <div style={{ fontSize: 10.5, color: "#00ff41", fontFamily: "monospace" }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#00ff41", marginLeft: 4, verticalAlign: "middle" }} />
              متصل
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#4a4a4a", cursor: "pointer" }}>⎋</span>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Topbar */}
        <header style={{
          height: 44,
          borderBottom: "1px solid #1f1f1f",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "rgba(8,8,8,0.95)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "monospace", fontSize: 11 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#00ff41", boxShadow: "0 0 8px #00ff41", animation: "pulse 2s infinite" }} />
            <span style={{ color: "#4a4a4a", letterSpacing: 1 }}>SYSTEM ONLINE</span>
            <span style={{ color: "#2a2a2a", margin: "0 8px" }}>|</span>
            <span style={{ color: "#4a4a4a" }}>Valorant — الموسم 12</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6a6a6a",
              cursor: "pointer",
              borderRadius: 2,
              fontSize: 14,
              position: "relative",
            }}>
              🔔
              <span style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#00ff41",
              }} />
            </div>
          </div>
        </header>

        {/* Content: two-column */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Main panel — Chat */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderLeft: "1px solid #1f1f1f" }}>

            {/* Channel tabs */}
            <div style={{
              borderBottom: "1px solid #1f1f1f",
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: "0 16px",
              height: 38,
              flexShrink: 0,
            }}>
              {["عام", "LFG", "تداول"].map((ch, i) => (
                <div key={i} style={{
                  padding: "0 14px",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: i === 0 ? "#e6e6e6" : "#5a5a5a",
                  borderBottom: i === 0 ? "2px solid #00ff41" : "2px solid transparent",
                  cursor: "pointer",
                  fontWeight: i === 0 ? 600 : 400,
                  letterSpacing: 0.3,
                }}>
                  {ch}
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: "#3a3a3a", fontFamily: "monospace" }}>87 / متصل</div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
              {MESSAGES.map((msg, i) => (
                <div key={i} style={{
                  display: "flex",
                  gap: 10,
                  padding: "4px 16px",
                  background: msg.system ? "rgba(0,255,65,0.04)" : "transparent",
                  borderRight: msg.system ? "2px solid rgba(0,255,65,0.3)" : "none",
                  marginBottom: 2,
                }}>
                  {!msg.system && (
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: `${msg.color}20`,
                      border: `1px solid ${msg.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: msg.color,
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      {msg.user[0]}
                    </div>
                  )}
                  {msg.system && <div style={{ width: 28, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!msg.system && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5, color: msg.color }}>{msg.user}</span>
                        {msg.pro && (
                          <span style={{
                            fontSize: 9,
                            fontFamily: "monospace",
                            background: "rgba(0,255,65,0.12)",
                            color: "#00ff41",
                            border: "1px solid rgba(0,255,65,0.25)",
                            padding: "0 4px",
                            borderRadius: 2,
                            letterSpacing: 0.5,
                          }}>PRO</span>
                        )}
                        <span style={{ fontSize: 10.5, color: "#3d3d3d", fontFamily: "monospace", marginRight: "auto" }}>{msg.time}</span>
                      </div>
                    )}
                    <div style={{
                      fontSize: msg.system ? 12 : 13,
                      color: msg.system ? "#6aef6a" : "#c8c8c8",
                      lineHeight: 1.45,
                    }}>{msg.text}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input bar */}
            <div style={{
              borderTop: "1px solid #1f1f1f",
              padding: "10px 16px",
              flexShrink: 0,
            }}>
              <div style={{
                background: "#111",
                border: "1px solid #2a2a2a",
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                height: 38,
              }}>
                <span style={{ color: "#3a3a3a", fontSize: 11.5 }}>📎</span>
                <span style={{ color: "#3a3a3a", fontSize: 11.5 }}>😀</span>
                <span style={{ color: "#3a3a3a", fontSize: 11.5 }}>🎬</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "#3a3a3a" }}>اكتب رسالة في العام…</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a2a" }}>↵</span>
              </div>
            </div>
          </div>

          {/* Right panel — Dashboard widgets */}
          <div style={{
            width: 280,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid #1f1f1f",
            gap: 0,
            overflowY: "auto",
            flexShrink: 0,
          }}>
            {/* Active game widget */}
            <div style={{
              borderBottom: "1px solid #1f1f1f",
              padding: "12px 14px",
            }}>
              <div style={{ fontSize: 9.5, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", color: "#3d3d3d", marginBottom: 10 }}>لعبة نشطة</div>
              <div style={{
                background: "linear-gradient(135deg, rgba(0,255,65,0.07) 0%, transparent 60%)",
                border: "1px solid #1f1f1f",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <div style={{ width: 36, height: 36, background: "#1a1a1a", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎮</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Valorant</div>
                  <div style={{ fontSize: 10.5, color: "#00ff41", fontFamily: "monospace" }}>● Ranked — 00:34</div>
                </div>
              </div>
            </div>

            {/* Party widget */}
            <div style={{ borderBottom: "1px solid #1f1f1f", padding: "12px 14px" }}>
              <div style={{ fontSize: 9.5, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", color: "#3d3d3d", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>الفريق الحالي</span>
                <span style={{ color: "#00ff41", cursor: "pointer" }}>+</span>
              </div>
              {["Wolf_99", "GWH_05", "ShadowKing"].map((name, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <div style={{
                    width: 24, height: 24,
                    borderRadius: "50%",
                    background: i === 0 ? "rgba(0,255,65,0.2)" : "#151515",
                    border: "1px solid " + (i === 0 ? "rgba(0,255,65,0.4)" : "#2a2a2a"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                    color: i === 0 ? "#00ff41" : "#7a7a7a",
                  }}>{name[0]}</div>
                  <span style={{ fontSize: 12, color: i === 0 ? "#e6e6e6" : "#9a9a9a" }}>{name}</span>
                  <span style={{ marginRight: "auto", fontSize: 10, fontFamily: "monospace", color: i === 0 ? "#00ff41" : "#3a3a3a" }}>
                    {i === 0 ? "قائد" : "عضو"}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={{
                  flex: 1,
                  height: 30,
                  background: "#00ff41",
                  color: "#000",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  letterSpacing: 1,
                }}>انضم</button>
                <button style={{
                  flex: 1,
                  height: 30,
                  background: "transparent",
                  color: "#6a6a6a",
                  border: "1px solid #2a2a2a",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}>شارك</button>
              </div>
            </div>

            {/* Leaderboard mini */}
            <div style={{ borderBottom: "1px solid #1f1f1f", padding: "12px 14px" }}>
              <div style={{ fontSize: 9.5, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", color: "#3d3d3d", marginBottom: 10 }}>أفضل 5 هذا الأسبوع</div>
              {[
                { name: "Wolf_99",    xp: "3,520", pos: 1 },
                { name: "NightRaven", xp: "2,890", pos: 2 },
                { name: "GWH_05",     xp: "2,340", pos: 3 },
                { name: "ShadowKing", xp: "1,980", pos: 4 },
                { name: "Apex_Pred",  xp: "1,770", pos: 5 },
              ].map((p) => (
                <div key={p.pos} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <span style={{
                    width: 18,
                    fontSize: 10.5,
                    fontFamily: "monospace",
                    color: p.pos === 1 ? "#eab308" : p.pos === 2 ? "#9ca3af" : p.pos === 3 ? "#d97706" : "#3d3d3d",
                    fontWeight: 700,
                  }}>{p.pos}</span>
                  <span style={{ flex: 1, fontSize: 12, color: p.name === "GWH_05" ? "#e6e6e6" : "#9a9a9a", fontWeight: p.name === "GWH_05" ? 600 : 400 }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#4a4a4a" }}>{p.xp}</span>
                </div>
              ))}
            </div>

            {/* Pro status */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(0,255,65,0.06) 0%, transparent 100%)",
                border: "1px solid rgba(0,255,65,0.18)",
                padding: "10px 12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#00ff41", fontWeight: 700, letterSpacing: 1 }}>PRO MEMBER</span>
                  <span style={{ fontSize: 13 }}>⭐</span>
                </div>
                <div style={{ fontSize: 11.5, color: "#7a7a7a", marginBottom: 8 }}>يتجدد في 15 أغسطس</div>
                <div style={{ background: "#1a1a1a", height: 3, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ background: "#00ff41", width: "72%", height: "100%" }} />
                </div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#4a4a4a", marginTop: 4 }}>XP 7,240 / 10,000</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 8px #00ff41} 50%{opacity:0.6;box-shadow:0 0 4px #00ff41} }
      `}</style>
    </div>
  );
}
