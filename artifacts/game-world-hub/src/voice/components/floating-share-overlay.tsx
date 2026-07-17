import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useVoice } from "../voice-context";
import { VideoTile } from "./video-tile";
import {
  Eye,
  Settings,
  X,
  GripVertical,
  Monitor,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Check,
  SquareX,
} from "lucide-react";
import {
  SCREEN_PRESETS,
  SCREEN_QUALITY_ORDER,
  type ScreenQuality,
} from "../quality";

/* ── constants ──────────────────────────────────────────────────────────── */
const W = 320;
const HANDLE_H = 32; // drag handle height in px

type MenuView = "main" | "quality";

/**
 * Floating, draggable picture-in-picture overlay shown while the local user
 * is screen-sharing. Survives page navigation (rendered in Shell).
 */
export function FloatingShareOverlay() {
  const { t } = useTranslation("common");
  const {
    sharing,
    localScreenStream,
    peers,
    stopScreenShare,
    changeScreenShare,
    screenAudioEnabled,
    toggleScreenAudio,
    screenQuality,
    setScreenQuality,
    activeRoom,
  } = useVoice();

  /* ── position ─────────────────────────────────────────────────────────── */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("main");
  const menuRef = useRef<HTMLDivElement>(null);

  // Initialise position once (bottom-right corner, 24 px from edges)
  useEffect(() => {
    if (pos === null && sharing) {
      setPos({
        x: Math.max(0, window.innerWidth - W - 24),
        y: Math.max(0, window.innerHeight - 224),
      });
    }
  }, [sharing, pos]);

  // Reset when share stops
  useEffect(() => {
    if (!sharing) {
      setPos(null);
      setMenuOpen(false);
      setMenuView("main");
    }
  }, [sharing]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMenuView("main");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  /* ── dragging via pointer capture ─────────────────────────────────────── */
  const isDragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      origin.current = {
        mx: e.clientX,
        my: e.clientY,
        px: pos?.x ?? 0,
        py: pos?.y ?? 0,
      };
      e.preventDefault();
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - origin.current.mx;
    const dy = e.clientY - origin.current.my;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - W, origin.current.px + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 180, origin.current.py + dy)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* ── actions ──────────────────────────────────────────────────────────── */
  const handleChangeStream = useCallback(async () => {
    setMenuOpen(false);
    setMenuView("main");
    await changeScreenShare();
  }, [changeScreenShare]);

  const handleStopStreaming = useCallback(() => {
    setMenuOpen(false);
    setMenuView("main");
    stopScreenShare();
  }, [stopScreenShare]);

  const handleSelectQuality = useCallback(
    (q: ScreenQuality) => {
      setScreenQuality(q);
      setMenuOpen(false);
      setMenuView("main");
    },
    [setScreenQuality],
  );

  /* ── viewer count ─────────────────────────────────────────────────────── */
  const viewerCount = peers.filter(
    (p) => p.connectionState === "connected",
  ).length;

  /* ── room label ───────────────────────────────────────────────────────── */
  const roomTitle = activeRoom?.title ?? "";

  /* ── render guard ─────────────────────────────────────────────────────── */
  if (!sharing || !localScreenStream || pos === null) return null;

  /* ── menu items ───────────────────────────────────────────────────────── */
  const ITEM_BASE =
    "flex items-center gap-3 w-full px-4 py-[10px] text-[13px] transition-colors text-start";
  const ITEM_NORMAL = `${ITEM_BASE} text-white/90 hover:bg-white/[0.07]`;
  const ITEM_DANGER = `${ITEM_BASE} text-[#ff6b8a] hover:bg-[#ff6b8a]/10`;

  const menuContent =
    menuView === "quality" ? (
      /* ── Quality sub-panel ─────────────────────────────────────────── */
      <>
        {/* Back header */}
        <button
          className={`${ITEM_BASE} text-white/50 hover:bg-white/[0.07] border-b border-white/[0.08]`}
          onClick={() => setMenuView("main")}
        >
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{t("voice.qualityPickerTitle", "Stream Quality")}</span>
        </button>
        {SCREEN_QUALITY_ORDER.map((q) => {
          const preset = SCREEN_PRESETS[q];
          const active = screenQuality === q;
          return (
            <button
              key={q}
              onClick={() => handleSelectQuality(q)}
              className={`${ITEM_BASE} justify-between ${
                active ? "text-white" : "text-white/70 hover:bg-white/[0.07]"
              }`}
              style={active ? { background: "rgba(255,255,255,0.07)" } : undefined}
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-bold font-mono text-[12px]">{q.toUpperCase()}</span>
                <span className="text-[10px] text-white/40 font-mono">
                  {preset.width}×{preset.height} · {preset.frameRate}fps ·{" "}
                  {Math.round(preset.maxBitrate / 1000)}kbps
                </span>
              </div>
              {active && (
                <Check
                  className="w-4 h-4 shrink-0"
                  style={{ color: "hsl(var(--primary))" }}
                />
              )}
            </button>
          );
        })}
      </>
    ) : (
      /* ── Main menu ─────────────────────────────────────────────────── */
      <>
        {/* Stop Streaming */}
        <button className={ITEM_DANGER} onClick={handleStopStreaming}>
          <SquareX className="w-4 h-4 shrink-0" />
          <span>{t("voice.stopSharing", "Stop Streaming")}</span>
        </button>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />

        {/* Change Stream */}
        <button className={ITEM_NORMAL} onClick={handleChangeStream}>
          <RefreshCw className="w-4 h-4 shrink-0 text-white/50" />
          <span>{t("share.changeStream", "Change Stream")}</span>
        </button>

        {/* Stream Quality */}
        <button
          className={`${ITEM_NORMAL} justify-between`}
          onClick={() => setMenuView("quality")}
        >
          <div className="flex items-center gap-3">
            <Monitor className="w-4 h-4 shrink-0 text-white/50" />
            <span>{t("share.streamQuality", "Stream Quality")}</span>
          </div>
          <div className="flex items-center gap-2 text-white/40">
            <span className="text-[11px] font-mono">{screenQuality.toUpperCase()}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        {/* Share Stream Audio */}
        <button
          className={`${ITEM_NORMAL} justify-between`}
          onClick={() => void toggleScreenAudio()}
        >
          <div className="flex items-center gap-3">
            <svg
              className="w-4 h-4 shrink-0 text-white/50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
            <span>{t("share.shareStreamAudio", "Share Stream Audio")}</span>
          </div>
          {/* Checkbox — reflects real LiveKit mute state */}
          <span
            className="w-5 h-5 flex items-center justify-center shrink-0 transition-colors"
            style={{
              background: screenAudioEnabled ? "#5865f2" : "rgba(255,255,255,0.1)",
              border: screenAudioEnabled ? "none" : "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {screenAudioEnabled && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </span>
        </button>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />

        {/* Report Problem */}
        <button className={ITEM_DANGER}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t("share.reportProblem", "Report Problem")}</span>
        </button>
      </>
    );

  return (
    <div
      ref={menuRef}
      className="fixed z-[85] select-none"
      style={{ left: pos.x, top: pos.y, width: W }}
    >
      {/* ── Overlay card ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(180deg,#0a0a18 0%,#06060f 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      >
        {/* Top accent line */}
        <div
          className="h-[2px] w-full"
          style={{
            background:
              "linear-gradient(90deg,hsl(var(--primary)) 0%,#00bfff 55%,transparent 100%)",
          }}
        />

        {/* ── Drag handle / title bar ──────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3 cursor-grab active:cursor-grabbing"
          style={{
            height: HANDLE_H,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            userSelect: "none",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <GripVertical
            className="w-3 h-3 shrink-0"
            style={{ color: "rgba(255,255,255,0.2)" }}
          />

          {/* Live dot */}
          <span className="relative flex w-1.5 h-1.5 shrink-0">
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-75"
              style={{ background: "hsl(var(--primary))" }}
            />
            <span
              className="rounded-full w-1.5 h-1.5"
              style={{ background: "hsl(var(--primary))" }}
            />
          </span>

          <span
            className="text-[9px] font-bold uppercase tracking-[0.2em] flex-1 truncate"
            style={{ color: "hsl(var(--primary))" }}
          >
            {t("share.liveLabel", "LIVE") + (roomTitle ? ` · ${roomTitle}` : "")}
          </span>

          {/* Quality badge */}
          <span
            className="text-[8px] px-1.5 py-0.5 font-mono tracking-widest shrink-0"
            style={{
              background: "rgba(var(--primary-rgb,0,255,65),0.08)",
              border: "1px solid rgba(var(--primary-rgb,0,255,65),0.2)",
              color: "hsl(var(--primary))",
            }}
          >
            {screenQuality.toUpperCase()}
          </span>
        </div>

        {/* ── Video preview ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden"
          style={{ aspectRatio: "16/9", background: "#000" }}
        >
          <VideoTile
            stream={localScreenStream}
            className="w-full h-full object-contain"
          />

          {/* Overlay: monitor icon watermark */}
          <div
            className="absolute bottom-2 start-2 flex items-center gap-1 pointer-events-none"
            style={{ opacity: 0.35 }}
          >
            <Monitor className="w-3 h-3 text-white" />
            <span className="text-[8px] text-white font-mono uppercase tracking-widest">
              {t("share.screenLabel", "screen")}
            </span>
          </div>
        </div>

        {/* ── Controls bar ──────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          {/* Viewer count */}
          <div
            className="flex items-center gap-1.5 flex-1"
            title={t("share.viewerCount", "Viewers")}
          >
            <Eye
              className="w-3.5 h-3.5"
              style={{ color: "rgba(255,255,255,0.4)" }}
            />
            <span
              className="text-[11px] font-bold tabular-nums font-mono"
              style={{
                color:
                  viewerCount > 0
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(255,255,255,0.3)",
              }}
            >
              {viewerCount}
            </span>
          </div>

          {/* Settings — toggles dropdown */}
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setMenuView("main");
            }}
            className="w-8 h-8 flex items-center justify-center transition-all rounded-none"
            title={t("share.settings", "Settings")}
            style={{
              background: menuOpen
                ? "rgba(255,255,255,0.12)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${menuOpen ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)"}`,
              color: menuOpen ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
            }}
            onMouseEnter={(e) => {
              if (menuOpen) return;
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.09)";
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.9)";
            }}
            onMouseLeave={(e) => {
              if (menuOpen) return;
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.5)";
            }}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Stop sharing */}
          <button
            onClick={handleStopStreaming}
            className="w-8 h-8 flex items-center justify-center transition-all rounded-none"
            title={t("voice.stopSharing", "Stop sharing")}
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#ef4444",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.12)";
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Dropdown menu (appears ABOVE the card) ────────────────────────── */}
      {menuOpen && (
        <div
          className="absolute bottom-[calc(100%+6px)] end-0 py-1 overflow-hidden"
          style={{
            width: 220,
            background: "#1a1a2e",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
          {menuContent}
        </div>
      )}
    </div>
  );
}
