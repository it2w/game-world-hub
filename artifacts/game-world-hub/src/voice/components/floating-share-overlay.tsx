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
  Play,
} from "lucide-react";
import {
  SCREEN_PRESETS,
  SCREEN_QUALITY_ORDER,
  type ScreenQuality,
} from "../quality";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/* ── constants ──────────────────────────────────────────────────────────── */
const W = 320;
const HANDLE_H = 32; // drag handle height in px

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
    screenQuality,
    setScreenQuality,
    activeRoom,
  } = useVoice();

  /* ── position ─────────────────────────────────────────────────────────── */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<ScreenQuality>(screenQuality);

  // Initialise position once (bottom-right corner, 24 px from edges)
  useEffect(() => {
    if (pos === null && sharing) {
      setPos({
        x: Math.max(0, window.innerWidth - W - 24),
        y: Math.max(0, window.innerHeight - 224),
      });
    }
  }, [sharing, pos]);

  // Reset when share stops so the next share starts fresh in the corner
  useEffect(() => {
    if (!sharing) setPos(null);
  }, [sharing]);

  /* ── dragging via pointer capture ─────────────────────────────────────── */
  const isDragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // only drag from handle, not from buttons inside it
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

  /* ── viewer count ─────────────────────────────────────────────────────── */
  // All peers currently connected to the room can see the screen share
  const viewerCount = peers.filter(
    (p) => p.connectionState === "connected",
  ).length;

  /* ── room label ───────────────────────────────────────────────────────── */
  const roomTitle = activeRoom?.title ?? "";

  /* ── quality save ─────────────────────────────────────────────────────── */
  const handleSaveQuality = useCallback(() => {
    setScreenQuality(pendingQuality);
    setSettingsOpen(false);
  }, [pendingQuality, setScreenQuality]);

  /* ── render guard ─────────────────────────────────────────────────────── */
  if (!sharing || !localScreenStream || pos === null) return null;

  return (
    <>
      <div
        className="fixed z-[85] select-none"
        style={{
          left: pos.x,
          top: pos.y,
          width: W,
          background: "linear-gradient(180deg,#0a0a18 0%,#06060f 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.03)",
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
          <GripVertical className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />

          {/* Live dot */}
          <span className="relative flex w-1.5 h-1.5 shrink-0">
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-75"
              style={{ background: "hsl(var(--primary))" }}
            />
            <span className="rounded-full w-1.5 h-1.5" style={{ background: "hsl(var(--primary))" }} />
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

        {/* ── Video preview ────────────────────────────────────────────── */}
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

        {/* ── Controls bar ─────────────────────────────────────────────── */}
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
            <Eye className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.4)" }} />
            <span
              className="text-[11px] font-bold tabular-nums font-mono"
              style={{ color: viewerCount > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}
            >
              {viewerCount}
            </span>
          </div>

          {/* Settings */}
          <button
            onClick={() => {
              setPendingQuality(screenQuality);
              setSettingsOpen(true);
            }}
            className="w-8 h-8 flex items-center justify-center transition-all rounded-none"
            title={t("share.settings", "Quality settings")}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
            }}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Stop sharing */}
          <button
            onClick={stopScreenShare}
            className="w-8 h-8 flex items-center justify-center transition-all rounded-none"
            title={t("voice.stopSharing", "Stop sharing")}
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#ef4444",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)";
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Quality settings dialog ────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="border-border bg-card rounded-none sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
              {t("voice.qualityPickerTitle", "Screen share quality")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {SCREEN_QUALITY_ORDER.map((q) => {
              const preset = SCREEN_PRESETS[q];
              return (
                <button
                  key={q}
                  onClick={() => setPendingQuality(q)}
                  className={`w-full p-3 border text-start transition-colors font-mono ${
                    pendingQuality === q
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{q}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      {preset.frameRate}fps · {Math.round(preset.maxBitrate / 1000)}kbps
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {preset.width}×{preset.height}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-none font-mono"
              onClick={() => setSettingsOpen(false)}
            >
              {t("voice.cancel", "Cancel")}
            </Button>
            <Button
              className="flex-1 rounded-none font-mono gap-2"
              onClick={handleSaveQuality}
            >
              <Play className="w-4 h-4" />
              {t("share.applyQuality", "Apply")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
