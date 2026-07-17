import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVoice } from "../voice-context";
import { VideoTile } from "./video-tile";
import { acquireInlineStage } from "../inline-stage-store";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  SCREEN_PRESETS,
  SCREEN_QUALITY_ORDER,
  type ScreenQuality,
} from "../quality";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Video,
  VideoOff,
  Headphones,
  PhoneOff,
  Maximize2,
  X,
  Gauge,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/* ── Avatar helpers ──────────────────────────────────────────────────────── */
const AVATAR_COLORS = ["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#f97316","#84cc16","#e11d48","#7c3aed"];
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/* ── keyframes (scoped to the stage) ─────────────────────────────────────── */
const STAGE_STYLE = `
@keyframes gwh-stage-blink { 0%,100%{opacity:1;} 50%{opacity:.3;} }
@keyframes gwh-stage-ring {
  0%,100%{ box-shadow:0 0 0 0 rgba(var(--primary-rgb,0,255,65),.45); }
  50%    { box-shadow:0 0 0 4px rgba(var(--primary-rgb,0,255,65),.28); }
}
@keyframes gwh-stage-eq { 0%,100%{ transform:scaleY(.3);} 50%{ transform:scaleY(1);} }
.gwh-stage-blink{ animation:gwh-stage-blink 1.4s ease-in-out infinite; }
.gwh-stage-ring{ animation:gwh-stage-ring 1.8s ease-in-out infinite; }
.gwh-stage-eq1{ animation:gwh-stage-eq .8s ease-in-out infinite 0s;   transform-origin:bottom; }
.gwh-stage-eq2{ animation:gwh-stage-eq .8s ease-in-out infinite .18s; transform-origin:bottom; }
.gwh-stage-eq3{ animation:gwh-stage-eq .8s ease-in-out infinite .36s; transform-origin:bottom; }
`;

/* ── Headphones-off (not in this lucide-react build) ─────────────────────── */
function HeadphonesOff({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

type Tile = {
  key: string;
  variant: "screen" | "camera" | "avatar";
  name: string;
  self?: boolean;
  stream?: MediaStream | null;
  speaking?: boolean;
  muted?: boolean;
  avatarUrl?: string | null;
  fps?: number;
  // Per-peer volume + screen-audio volume (remote peers only)
  userId?: number;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  hasScreenAudio?: boolean;
  screenAudioVolume?: number;
  onScreenAudioVolumeChange?: (v: number) => void;
};

/**
 * Premium inline call stage — rendered at the top of a conversation while a
 * voice/screen-share session for that conversation is active. Shows each
 * participant as a tile with their username underneath, plus a control bar.
 */
export function VoiceStage() {
  const { t } = useTranslation("common");
  const voice = useVoice();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [theater, setTheater] = useState<{ stream: MediaStream; name: string; avatarUrl?: string | null } | null>(null);
  const [theaterHoveredId, setTheaterHoveredId] = useState<number | null>(null);

  // Hide the floating panel while the inline stage is on screen.
  useEffect(() => acquireInlineStage(), []);

  const activeRoom        = voice.activeRoom;
  const peers             = voice.peers;
  const sharing           = voice.sharing;
  const cameraEnabled     = voice.cameraEnabled;
  const muted             = voice.muted;
  const deafened          = voice.deafened;
  const speaking          = voice.speaking;
  const localScreenStream = voice.localScreenStream;
  const localCameraStream = voice.localCameraStream;
  const screenQuality     = voice.screenQuality;
  const peerVolumes           = voice.peerVolumes;
  const screenAudioVolumes    = voice.screenAudioVolumes;
  const setPeerVolume         = voice.setPeerVolume;
  const setScreenAudioVolume  = voice.setScreenAudioVolume;

  if (!activeRoom) return null;

  const selfName = me?.displayName || t("voice.you");
  const selfAvatar = me?.avatarUrl ?? null;

  const mediaTiles: Tile[] = [];
  const avatarTiles: Tile[] = [];

  avatarTiles.push({
    key: "self", variant: "avatar", name: selfName, self: true,
    speaking: speaking && !muted, muted, avatarUrl: selfAvatar,
  });
  if (sharing)
    mediaTiles.push({
      key: "self-screen", variant: "screen", name: selfName, self: true,
      stream: localScreenStream, fps: SCREEN_PRESETS[screenQuality]?.frameRate,
      avatarUrl: selfAvatar,
    });
  if (cameraEnabled)
    mediaTiles.push({
      key: "self-cam", variant: "camera", name: selfName, self: true,
      stream: localCameraStream, avatarUrl: selfAvatar,
    });

  for (const p of peers) {
    avatarTiles.push({
      key: `a-${p.userId}`, variant: "avatar", name: p.displayName,
      speaking: p.speaking && !p.muted, muted: p.muted, avatarUrl: p.avatarUrl,
      userId: p.userId,
      volume: peerVolumes[p.userId] ?? 1,
      onVolumeChange: (v: number) => setPeerVolume(p.userId, v),
    });
    if (p.sharing)
      mediaTiles.push({
        key: `s-${p.userId}`, variant: "screen", name: p.displayName, stream: p.screenStream,
        avatarUrl: p.avatarUrl,
        hasScreenAudio: p.hasScreenAudio,
        screenAudioVolume: screenAudioVolumes[p.userId] ?? 1,
        onScreenAudioVolumeChange: (v: number) => setScreenAudioVolume(p.userId, v),
      });
    if (p.cameraEnabled)
      mediaTiles.push({ key: `c-${p.userId}`, variant: "camera", name: p.displayName, stream: p.cameraStream, avatarUrl: p.avatarUrl });
  }

  const tiles = [...mediaTiles, ...avatarTiles];
  const count = peers.length + 1;

  return (
    <div
      className="shrink-0 relative font-mono"
      style={{
        background: "linear-gradient(180deg,#0c0c18 0%, #08080f 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <style>{STAGE_STYLE}</style>
      <div
        className="h-[2px] w-full"
        style={{ background: "linear-gradient(90deg, hsl(var(--primary)) 0%, #00bfff 55%, transparent 100%)" }}
      />

      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex shrink-0 w-2 h-2">
            <span className="gwh-stage-blink absolute inset-0 rounded-full bg-primary" />
            <span className="rounded-full w-2 h-2 bg-primary/30" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
            {activeRoom.kind === "party" ? t("voice.voice") : t("voice.call")}
          </span>
          <span className="text-[12px] font-bold uppercase tracking-widest text-foreground truncate">
            {activeRoom.title}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 font-bold tabular-nums shrink-0"
            style={{
              background: "rgba(var(--primary-rgb,0,255,65),0.1)",
              color: "hsl(var(--primary))",
              border: "1px solid rgba(var(--primary-rgb,0,255,65),0.25)",
            }}
          >
            {count}
          </span>
        </div>

        {sharing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Gauge className="w-3 h-3 text-muted-foreground" />
            <Select value={screenQuality} onValueChange={(v) => voice.setScreenQuality(v as ScreenQuality)}>
              <SelectTrigger className="h-6 gap-1 text-[10px] font-mono rounded-none border-border bg-black/30 px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCREEN_QUALITY_ORDER.map((q) => (
                  <SelectItem key={q} value={q} className="text-[11px] font-mono">
                    {q} · {SCREEN_PRESETS[q].frameRate}fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* tiles */}
      <div className="flex items-start justify-center gap-3 px-4 py-4 overflow-x-auto flex-wrap">
        {tiles.map((tile) => (
          <StageTile
            key={tile.key}
            tile={tile}
            t={t}
            onOpen={tile.variant !== "avatar" && tile.stream ? () => setTheater({ stream: tile.stream!, name: tile.name, avatarUrl: tile.avatarUrl }) : undefined}
          />
        ))}
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-2.5 pb-4">
        <StageBtn active={muted} danger onClick={voice.toggleMute} title={muted ? t("voice.unmute") : t("voice.mute")}>
          {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </StageBtn>
        <StageBtn active={deafened} danger onClick={voice.toggleDeafen} title={deafened ? t("voice.undeafen") : t("voice.deafen")}>
          {deafened ? <HeadphonesOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </StageBtn>
        <StageBtn active={cameraEnabled} onClick={() => void voice.toggleCamera()} title={cameraEnabled ? t("voice.cameraOff") : t("voice.cameraOn")}>
          {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </StageBtn>
        <StageBtn active={sharing} onClick={() => (sharing ? voice.stopScreenShare() : void voice.startScreenShare())} title={sharing ? t("voice.stopSharing") : t("voice.shareScreen")}>
          {sharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
        </StageBtn>
        <button
          onClick={voice.leaveVoice}
          title={t("voice.leave")}
          className="flex items-center justify-center gap-2 h-11 px-5 rounded-full transition-all"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.25)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.15)"; }}
        >
          <PhoneOff className="w-4 h-4" />
          <span className="text-[11px] uppercase tracking-widest font-bold">{t("voice.leave")}</span>
        </button>
      </div>

      {/* theater */}
      {theater && (() => {
        const presenterPeer = peers.find(p => p.displayName === theater.name);
        const presenterUserId = presenterPeer?.userId ?? null;
        const presenterHasScreenAudio = presenterPeer?.hasScreenAudio ?? false;
        const presenterScreenVol = presenterUserId !== null ? (screenAudioVolumes[presenterUserId] ?? 1) : 1;

        const peerRows = peers.filter(p => p.displayName !== theater.name);

        return (
          <div
            className="fixed inset-0 z-[95] flex flex-col"
            style={{ background: "rgba(4,4,14,.97)", backdropFilter: "blur(20px)" }}
            onClick={() => setTheater(null)}
          >
            {/* close */}
            <button
              className="absolute top-4 end-4 z-10 w-8 h-8 flex items-center justify-center transition-colors rounded-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
              onClick={(e) => { e.stopPropagation(); setTheater(null); }}
              aria-label={t("voice.close")}
            >
              <X className="w-4 h-4" />
            </button>

            {/* video — takes all remaining space */}
            <div
              className="flex-1 flex items-center justify-center px-6 pt-6 pb-3 min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              <VideoTile
                stream={theater.stream}
                className="max-w-full max-h-full"
                style={{
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
                  borderRadius: "2px",
                }}
              />
            </div>

            {/* ── bottom control bar ─────────────────────────────────────────── */}
            <div
              className="shrink-0"
              style={{
                background: "rgba(6,6,18,0.98)",
                borderTop: "1px solid rgba(255,255,255,0.07)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* row 1: presenter info + screen-audio volume */}
              <div
                className="flex items-center gap-4 px-6 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                {/* presenter avatar */}
                <div
                  className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{
                    background: theater.avatarUrl ? undefined : nameColor(theater.name),
                    border: "2px solid hsl(var(--primary))",
                    boxShadow: "0 0 14px rgba(var(--primary-rgb,0,255,65),0.35)",
                  }}
                >
                  {theater.avatarUrl
                    ? <img src={theater.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : nameInitials(theater.name)
                  }
                  <span
                    className="absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                    style={{ background: "hsl(var(--primary))", border: "1.5px solid rgba(6,6,18,1)" }}
                  >
                    <Monitor className="w-2 h-2 text-black" />
                  </span>
                </div>

                {/* presenter name + badge */}
                <div className="shrink-0">
                  <p className="text-sm font-bold text-white leading-none mb-0.5">{theater.name}</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(var(--primary))" }} />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-primary">{t("voice.screenLabel")}</span>
                  </div>
                </div>

                {/* screen-audio volume — always visible when presenter is a peer */}
                <div className="flex items-center gap-3 ms-2">
                  <div
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Monitor className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
                    <span className="text-[9px] uppercase tracking-widest font-semibold shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {t("voice.screenAudio")}
                    </span>
                    {presenterUserId !== null ? (
                      <>
                        <button
                          className="shrink-0 transition-opacity hover:opacity-100"
                          style={{ opacity: 0.7 }}
                          onClick={() => setScreenAudioVolume(presenterUserId, presenterScreenVol < 0.01 ? 1 : 0)}
                        >
                          {presenterScreenVol < 0.01
                            ? <VolumeX className="w-3.5 h-3.5 text-red-400" />
                            : <Volume2 className="w-3.5 h-3.5 text-white" />
                          }
                        </button>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={presenterScreenVol}
                          onChange={e => setScreenAudioVolume(presenterUserId, parseFloat(e.target.value))}
                          className="w-24 cursor-pointer"
                          style={{ accentColor: "hsl(var(--primary))", height: "3px" }}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="text-[9px] tabular-nums w-7 text-end shrink-0" style={{ color: presenterScreenVol < 0.01 ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.4)" }}>
                          {Math.round(presenterScreenVol * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
                    )}
                  </div>
                </div>

                {/* spacer */}
                <div className="flex-1" />

                {/* self mic */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={voice.toggleMute}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-none transition-all duration-200"
                    style={{
                      background: muted ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                      border: muted ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.1)",
                    }}
                    title={muted ? t("voice.unmute") : t("voice.mute")}
                  >
                    {muted
                      ? <MicOff className="w-3.5 h-3.5 text-red-400" />
                      : <Mic className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.6)" }} />
                    }
                    <span
                      className="text-[9px] font-semibold uppercase tracking-widest"
                      style={{ color: muted ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.4)" }}
                    >
                      {muted ? t("voice.muted") : t("voice.mic")}
                    </span>
                  </button>
                </div>
              </div>

              {/* row 2: participants + their individual volumes */}
              {peerRows.length > 0 && (
                <div className="flex items-center gap-3 px-6 py-2.5 overflow-x-auto">
                  {peerRows.map(p => {
                    const vol = peerVolumes[p.userId] ?? 1;
                    return (
                      <div
                        key={p.userId}
                        className="flex items-center gap-2 shrink-0 px-2.5 py-1.5 rounded-none"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* avatar */}
                        <div
                          className="relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{
                            background: p.avatarUrl ? undefined : nameColor(p.displayName),
                            border: p.speaking ? "1.5px solid hsl(var(--primary))" : "1.5px solid rgba(255,255,255,0.12)",
                            boxShadow: p.speaking ? "0 0 8px rgba(var(--primary-rgb,0,255,65),0.4)" : "none",
                            transition: "border-color .15s, box-shadow .15s",
                          }}
                        >
                          {p.avatarUrl
                            ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                            : nameInitials(p.displayName)
                          }
                        </div>
                        {/* name */}
                        <span
                          className="text-[10px] font-medium truncate max-w-[64px] shrink-0"
                          style={{ color: p.speaking ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)" }}
                        >
                          {p.displayName}
                        </span>
                        {/* muted badge */}
                        {p.muted && (
                          <MicOff className="w-3 h-3 text-red-400 shrink-0" />
                        )}
                        {/* volume toggle + slider — always visible */}
                        <button
                          className="shrink-0 transition-opacity hover:opacity-100"
                          style={{ opacity: 0.65 }}
                          onClick={() => setPeerVolume(p.userId as number, vol < 0.01 ? 1 : 0)}
                        >
                          {vol < 0.01
                            ? <VolumeX className="w-3.5 h-3.5 text-red-400" />
                            : <Volume2 className="w-3.5 h-3.5 text-white" />
                          }
                        </button>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={vol}
                          onChange={e => setPeerVolume(p.userId as number, parseFloat(e.target.value))}
                          className="w-20 cursor-pointer shrink-0"
                          style={{ accentColor: "hsl(var(--primary))", height: "3px" }}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="text-[9px] tabular-nums w-6 text-end shrink-0" style={{ color: vol < 0.01 ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.35)" }}>
                          {Math.round(vol * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── One tile (screen / camera / avatar) with a username label below ─────── */
function StageTile({
  tile,
  t,
  onOpen,
}: {
  tile: Tile;
  t: (k: string, o?: Record<string, unknown>) => string;
  onOpen?: () => void;
}) {
  if (tile.variant === "avatar") {
    return (
      <div className="flex flex-col items-center gap-1.5 w-[128px] shrink-0">
        <div
          className="relative w-[128px] h-[128px] flex items-center justify-center rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg,#161628,#0c0c16)",
            border: tile.speaking
              ? "1px solid rgba(var(--primary-rgb,0,255,65),0.6)"
              : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center overflow-hidden ${tile.speaking ? "gwh-stage-ring" : ""}`}
            style={{
              background: "linear-gradient(135deg,#1e2a1e,#12121f)",
              border: "1px solid rgba(var(--primary-rgb,0,255,65),0.35)",
              color: "hsl(var(--primary))",
            }}
          >
            {tile.avatarUrl ? (
              <img src={tile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold">{tile.name.charAt(0).toUpperCase()}</span>
            )}
          </div>

          {tile.muted ? (
            <span
              className="absolute bottom-2 end-2 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.9)" }}
            >
              <MicOff className="w-3.5 h-3.5 text-white" />
            </span>
          ) : tile.speaking ? (
            <span className="absolute bottom-2 end-2 flex items-end gap-[2px] h-4">
              <span className="gwh-stage-eq1 w-[3px] h-4 bg-primary rounded-full" />
              <span className="gwh-stage-eq2 w-[3px] h-4 bg-primary rounded-full" />
              <span className="gwh-stage-eq3 w-[3px] h-4 bg-primary rounded-full" />
            </span>
          ) : null}

          {/* Volume popover — remote peers only, portal-rendered (no unmount on mouse-leave) */}
          {!tile.self && tile.userId !== undefined && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-2 start-2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity opacity-30 hover:opacity-100"
                  style={{ background: "rgba(0,0,0,0.65)" }}
                  title={`Volume: ${Math.round((tile.volume ?? 1) * 100)}%`}
                >
                  {(tile.volume ?? 1) === 0
                    ? <VolumeX className="w-3 h-3 text-red-400" />
                    : <Volume2 className="w-3 h-3 text-white" />}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                sideOffset={8}
                className="w-44 p-3 space-y-2"
                style={{ background: "#0e0e1a", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider truncate">
                  {tile.name}
                </p>
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <Slider
                    value={[Math.round((tile.volume ?? 1) * 100)]}
                    onValueChange={([v]) => tile.onVolumeChange?.(v / 100)}
                    min={0} max={100} step={1}
                    className="flex-1"
                  />
                  <span className="text-[9px] tabular-nums text-muted-foreground/70 shrink-0 w-7 text-right">
                    {Math.round((tile.volume ?? 1) * 100)}%
                  </span>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <TileLabel tile={tile} t={t} icon="mic" />
      </div>
    );
  }

  // screen / camera
  return (
    <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 236 }}>
      {/* Wrapper gives a relative context for the mute-button overlay without nesting buttons */}
      <div className="relative">
      <button
        onClick={onOpen}
        className="group relative rounded-2xl overflow-hidden aspect-video bg-black w-full"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        title={t("voice.openScreen", { label: tile.name })}
        aria-label={t("voice.openScreen", { label: tile.name })}
      >
        {tile.stream ? (
          <VideoTile stream={tile.stream} className="w-full h-full object-contain" />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{
              background:
                "radial-gradient(ellipse at 50% 40%, rgba(var(--primary-rgb,0,255,65),0.08), transparent 70%), linear-gradient(135deg,#141426,#0a0a14)",
            }}
          >
            {tile.variant === "camera" ? (
              <Video className="w-6 h-6 text-primary/60" />
            ) : (
              <Monitor className="w-6 h-6 text-primary/60" />
            )}
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              {tile.variant === "camera" ? t("voice.cameraLabel") : t("voice.screenLabel")}
            </span>
          </div>
        )}

        {tile.fps ? (
          <span
            className="absolute top-1.5 end-1.5 text-[8px] px-1 py-0.5 font-bold rounded"
            style={{
              background: "rgba(var(--primary-rgb,0,255,65),0.15)",
              color: "hsl(var(--primary))",
              border: "1px solid rgba(var(--primary-rgb,0,255,65),0.3)",
            }}
          >
            {tile.fps}fps
          </span>
        ) : null}

        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-5 h-5 text-white" />
        </span>
      </button>
      {/* Screen audio volume popover — on screen-share tiles from remote peers */}
      {tile.variant === "screen" && !tile.self && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2 start-2 w-7 h-7 rounded-lg flex items-center justify-center z-10 transition-all"
              style={{
                background: "rgba(0,0,0,0.7)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: !tile.hasScreenAudio
                  ? "rgba(255,255,255,0.2)"
                  : (tile.screenAudioVolume ?? 1) === 0
                    ? "#ef4444"
                    : "rgba(var(--primary-rgb,0,255,65),0.9)",
                cursor: !tile.hasScreenAudio ? "default" : "pointer",
              }}
              title={
                !tile.hasScreenAudio
                  ? "No screen audio"
                  : `Screen audio: ${Math.round((tile.screenAudioVolume ?? 1) * 100)}%`
              }
              disabled={!tile.hasScreenAudio}
            >
              {tile.hasScreenAudio && (tile.screenAudioVolume ?? 1) === 0
                ? <VolumeX className="w-3.5 h-3.5" />
                : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </PopoverTrigger>
          {tile.hasScreenAudio && (
            <PopoverContent
              side="right"
              sideOffset={8}
              className="w-44 p-3 space-y-2"
              style={{ background: "#0e0e1a", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider truncate">
                {tile.name} — screen audio
              </p>
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                <Slider
                  value={[Math.round((tile.screenAudioVolume ?? 1) * 100)]}
                  onValueChange={([v]) => tile.onScreenAudioVolumeChange?.(v / 100)}
                  min={0} max={100} step={1}
                  className="flex-1"
                />
                <span className="text-[9px] tabular-nums text-muted-foreground/70 shrink-0 w-7 text-right">
                  {Math.round((tile.screenAudioVolume ?? 1) * 100)}%
                </span>
              </div>
            </PopoverContent>
          )}
        </Popover>
      )}
      </div>{/* /relative wrapper */}
      <TileLabel tile={tile} t={t} icon={tile.variant === "camera" ? "camera" : "screen"} />
    </div>
  );
}

function TileLabel({
  tile,
  t,
  icon,
}: {
  tile: Tile;
  t: (k: string, o?: Record<string, unknown>) => string;
  icon: "mic" | "screen" | "camera";
}) {
  return (
    <span
      className="flex items-center gap-1.5 px-1 text-[11px] max-w-full"
      style={{ color: "rgba(255,255,255,0.78)" }}
    >
      {icon === "mic" &&
        (tile.muted ? (
          <MicOff className="w-3 h-3 text-destructive shrink-0" />
        ) : (
          <Mic className="w-3 h-3 text-primary shrink-0" />
        ))}
      {icon === "screen" && <Monitor className="w-3 h-3 text-primary shrink-0" />}
      {icon === "camera" && <Video className="w-3 h-3 text-primary shrink-0" />}
      <span className="truncate font-medium">
        {tile.name}
        {tile.self ? t("voice.youSuffix") : ""}
      </span>
    </span>
  );
}

function StageBtn({
  children,
  active,
  danger,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
}) {
  const color = danger && active ? "#ef4444" : active ? "hsl(var(--primary))" : "rgba(255,255,255,0.85)";
  const bg =
    danger && active
      ? "rgba(239,68,68,0.15)"
      : active
      ? "rgba(var(--primary-rgb,0,255,65),0.15)"
      : "rgba(255,255,255,0.05)";
  const border =
    danger && active
      ? "rgba(239,68,68,0.5)"
      : active
      ? "rgba(var(--primary-rgb,0,255,65),0.4)"
      : "rgba(255,255,255,0.1)";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-11 h-11 rounded-full flex items-center justify-center transition-all hover:brightness-125"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      {children}
    </button>
  );
}
