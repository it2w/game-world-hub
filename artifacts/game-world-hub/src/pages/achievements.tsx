import {
  useGetPlayerProgress,
  getGetPlayerProgressQueryKey,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  Trophy,
  UserPlus,
  Users,
  Crown,
  Swords,
  MessageSquare,
  Radar,
  Handshake,
  Gamepad2,
  Link2,
  Shield,
  Zap,
  Lock,
  Check,
  type LucideIcon,
} from "lucide-react";
import { TierBadge, DivisionBadge, getDivision, TIER_CONFIG, type TierName } from "@/components/tier-badge";

const ICONS: Record<string, LucideIcon> = {
  UserPlus, Users, Crown, Swords, MessageSquare,
  Radar, Handshake, Gamepad2, Link2, Shield, Trophy,
};

const STAT_KEYS = new Set([
  "friends", "partiesCreated", "partiesJoined",
  "messagesSent", "lfgPosts", "lfgResponses", "games", "platforms",
]);

/* ── corner bracket helper ──────────────────────────────────────── */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br"; }) {
  const color = "rgba(255,255,255,0.55)";
  const size = 14;
  const style: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: color,
    borderStyle: "solid",
    borderTopWidth:    pos.startsWith("t") ? 2 : 0,
    borderBottomWidth: pos.startsWith("b") ? 2 : 0,
    borderLeftWidth:   pos.endsWith("l")   ? 2 : 0,
    borderRightWidth:  pos.endsWith("r")   ? 2 : 0,
    top:    pos.startsWith("t") ? 8 : undefined,
    bottom: pos.startsWith("b") ? 8 : undefined,
    left:   pos.endsWith("l")   ? 8 : undefined,
    right:  pos.endsWith("r")   ? 8 : undefined,
  };
  return <div style={style} />;
}

export default function Achievements() {
  const { t } = useTranslation("achievements");
  const { data, isLoading } = useGetPlayerProgress({
    query: { refetchInterval: 15000, queryKey: getGetPlayerProgressQueryKey() },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="py-16 text-center font-mono text-sm text-muted-foreground tracking-widest">
          {t("computing")}
        </div>
      </div>
    );
  }

  const pct = data.xpForNext > 0 ? Math.min(100, Math.round((data.xpIntoLevel / data.xpForNext) * 100)) : 0;
  const tier = data.rank as TierName;
  const cfg  = TIER_CONFIG[tier] ?? TIER_CONFIG["INITIATE"];
  const div  = getDivision(tier, data.level);
  const isTopDiv = div === "I";

  const C1 = cfg.color1;
  const C2 = cfg.color2;
  const BORDER_C = cfg.border;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── page header ─────────────────────────────────────── */}
      <div className="border-b border-border pb-4 flex items-center gap-3">
        <Trophy className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-black font-mono tracking-tighter uppercase text-foreground">
          {t("title")}
        </h1>
        <span className="font-mono text-xs text-muted-foreground ms-auto">
          {t("progression", { unlocked: data.unlockedCount, total: data.totalCount })}
        </span>
      </div>

      {/* ── Design-4 rank hero ──────────────────────────────── */}
      <div style={{ position: "relative" }}>
        {/* outer glow frame */}
        <div style={{
          position: "absolute", inset: -1, borderRadius: 2,
          background: `linear-gradient(135deg,${C1}44,${C2}22,transparent,${C1}22)`,
        }} />

        <div style={{
          position: "relative",
          background: "hsl(var(--card))",
          border: "1px solid transparent",
          overflow: "hidden",
        }}>
          {/* scanlines */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
            opacity: 0.018,
            backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.6) 2px,rgba(255,255,255,0.6) 3px)",
          }} />

          {/* corner brackets */}
          <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

          {/* top header bar */}
          <div style={{
            borderBottom: `1px solid ${C1}66`,
            padding: "7px 20px",
            display: "flex",
            justifyContent: "space-between",
            background: "rgba(0,0,0,0.2)",
          }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: `${C1}88`, letterSpacing: "0.3em" }}>
              // RANK SYSTEM v2.0 //
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: `${C1}88`, letterSpacing: "0.2em" }}>
              SEASON_01
            </span>
          </div>

          {/* main body: badge | divider | info */}
          <div style={{ display: "flex", alignItems: "stretch" }}>

            {/* ── badge panel ── */}
            <div style={{
              width: 180,
              flexShrink: 0,
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              borderInlineEnd: `1px solid ${C1}66`,
              background: "rgba(0,0,0,0.12)",
              position: "relative",
            }}>
              {/* holo rings */}
              <div style={{ position: "absolute", width: 170, height: 170, borderRadius: "50%", border: `1px solid ${C1}44`, pointerEvents: "none" }} />
              <div style={{ position: "absolute", width: 145, height: 145, borderRadius: "50%", border: `1px solid ${C1}66`, pointerEvents: "none" }} />

              <TierBadge
                tier={tier}
                level={data.level}
                xpIntoLevel={data.xpIntoLevel}
                xpForNext={data.xpForNext}
                size="md"
                showXpBar={false}
              />

              {/* DIV chip */}
              <div style={{
                border: `1px solid ${C1}99`,
                padding: "3px 16px",
                fontFamily: "monospace",
                fontSize: 10,
                color: C1,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                textAlign: "center",
                width: "100%",
                boxSizing: "border-box",
                boxShadow: `0 0 10px ${C1}22 inset, 0 0 6px ${C1}22`,
              }}>
                {isTopDiv ? "★ " : ""}DIV {div}
              </div>
            </div>

            {/* ── info panel ── */}
            <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>

              {/* rank label + name */}
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: `${C1}cc`, letterSpacing: "0.35em", marginBottom: 4 }}>
                  [ {t("rank")} ]
                </div>
                {/* SVG gradient name — works in all iframe/browser contexts */}
                <svg height="52" style={{ display: "block", overflow: "visible", marginBottom: 2, filter: `drop-shadow(0 0 14px ${C1}77)` }}>
                  <defs>
                    <linearGradient id={`nameGrad-${tier}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#ffffff" />
                      <stop offset="55%"  stopColor={BORDER_C} />
                      <stop offset="100%" stopColor={C1} />
                    </linearGradient>
                  </defs>
                  <text
                    x="0" y="46"
                    fill={`url(#nameGrad-${tier})`}
                    fontSize="46"
                    fontWeight="900"
                    fontFamily="Arial Black, sans-serif"
                  >
                    {t(`rankTitles.${tier}`, { defaultValue: cfg.label })}
                  </text>
                </svg>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: `${C1}88`, letterSpacing: "0.3em" }}>
                  {cfg.label} // LVL {data.level}
                </div>
              </div>

              {/* decorative divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${C1}cc)` }} />
                <Swords style={{ width: 12, height: 12, color: C1, opacity: 1 }} />
                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C1}cc,transparent)` }} />
              </div>

              {/* XP bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 9, marginBottom: 5 }}>
                  <span style={{ color: BORDER_C }}>█ {data.xpIntoLevel.toLocaleString()} XP</span>
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>{data.xpForNext.toLocaleString()} XP ▓</span>
                </div>
                <div style={{
                  height: 8,
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${C1}88`,
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: `linear-gradient(90deg,${C2},${C1},${BORDER_C})`,
                    boxShadow: `0 0 14px ${C1}99, 0 0 6px ${C1}`,
                    transition: "width 0.7s ease",
                  }} />
                  {/* scanlines on bar */}
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: "repeating-linear-gradient(90deg,transparent,transparent 4px,rgba(0,0,0,0.25) 4px,rgba(0,0,0,0.25) 5px)",
                  }} />
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: `${C1}aa`, marginTop: 4 }}>
                  {(data.xpForNext - data.xpIntoLevel).toLocaleString()} XP_REMAINING → LEVEL_{data.level + 1}
                </div>
              </div>

              {/* stats mini-grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                {Object.entries(data.stats).slice(0, 4).map(([key, value]) => (
                  <div key={key} style={{
                    display: "flex", flexDirection: "column",
                    padding: "7px 10px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: C1, lineHeight: 1 }}>
                      {String(value).padStart(2, "0")}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em", marginTop: 3, textTransform: "uppercase" }}>
                      {STAT_KEYS.has(key) ? t(`stats.${key}`) : key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── full stats grid ──────────────────────────────────── */}
      <div style={{ position: "relative" }}>
        {/* outer glow frame */}
        <div style={{ position:"absolute", inset:-1, background:`linear-gradient(135deg,${C1}66,transparent,${C1}44)` }} />
        <div style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 1,
          background: `${C1}55`,
          border: `1px solid ${C1}66`,
        }} className="sm:grid-cols-4">
          {Object.entries(data.stats).map(([key, value]) => (
            <div key={key} style={{
              background: "hsl(var(--card))",
              padding: "16px 20px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* subtle corner bracket */}
              <div style={{ position:"absolute", top:6, insetInlineStart:6, width:8, height:8, borderTop:`2px solid ${C1}cc`, borderInlineStart:`2px solid ${C1}cc` }} />
              {/* scanline */}
              <div style={{ position:"absolute", inset:0, opacity:0.015, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.6) 2px,rgba(255,255,255,0.6) 3px)", pointerEvents:"none" }} />

              <div style={{
                fontFamily: "monospace",
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1,
                color: C1,
                textShadow: `0 0 12px ${C1}66`,
                marginBottom: 6,
              }}>
                {String(value).padStart(2, "0")}
              </div>
              <div style={{
                fontFamily: "monospace",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.65)",
              }}>
                {STAT_KEYS.has(key) ? t(`stats.${key}`) : key}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── achievements ────────────────────────────────────── */}
      <div>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Trophy className="w-3 h-3" /> {t("achievements")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.achievements.map((a) => {
            const Icon = ICONS[a.icon] ?? Trophy;
            const progress = a.target > 0 ? Math.min(100, Math.round((a.current / a.target) * 100)) : 0;
            return (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${a.unlocked ? C1 + "99" : "rgba(255,255,255,0.15)"}`,
                  background: a.unlocked ? `${C1}08` : "hsl(var(--card))",
                  padding: 14,
                  display: "flex",
                  gap: 12,
                  position: "relative",
                  overflow: "hidden",
                  transition: "border-color 0.2s",
                }}
              >
                {/* top-left mini bracket on unlocked */}
                {a.unlocked && (
                  <>
                    <div style={{ position: "absolute", top: 4, left: 4, width: 8, height: 8, borderTop: `1px solid ${C1}`, borderLeft: `1px solid ${C1}` }} />
                    <div style={{ position: "absolute", bottom: 4, right: 4, width: 8, height: 8, borderBottom: `1px solid ${C1}`, borderRight: `1px solid ${C1}` }} />
                  </>
                )}

                <div style={{
                  width: 44, height: 44, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${a.unlocked ? C1 + "bb" : "rgba(255,255,255,0.18)"}`,
                  background: a.unlocked ? `${C1}15` : "rgba(0,0,0,0.25)",
                  color: a.unlocked ? C1 : "rgba(255,255,255,0.2)",
                }}>
                  {a.unlocked ? <Icon style={{ width: 20, height: 20 }} /> : <Lock style={{ width: 16, height: 16 }} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      color: a.unlocked ? "white" : "rgba(255,255,255,0.3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {t(`defs.${a.id}.name`, { defaultValue: a.name })}
                    </span>
                    {a.unlocked && <Check style={{ width: 12, height: 12, color: C1, flexShrink: 0 }} />}
                  </div>
                  <p style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
                    {t(`defs.${a.id}.description`, { defaultValue: a.description })}
                  </p>
                  {!a.unlocked && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 3, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: `${C1}88` }} />
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>
                        {a.current} / {a.target}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
