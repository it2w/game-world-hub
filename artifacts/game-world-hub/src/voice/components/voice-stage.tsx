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
} from "lucide-react";

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
  const [theater, setTheater] = useState<MediaStream | null>(null);

  // Hide the floating panel while the inline stage is on screen.
  useEffect(() => acquireInlineStage(), []);

  const activeRoom       = voice.activeRoom;
  const peers            = voice.peers;
  const sharing          = voice.sharing;
  const cameraEnabled    = voice.cameraEnabled;
  const muted            = voice.muted;
  const deafened         = voice.deafened;
  const speaking         = voice.speaking;
  const localScreenStream = voice.localScreenStream;
  const localCameraStream = voice.localCameraStream;
  const screenQuality    = voice.screenQuality;

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
    });
  if (cameraEnabled)
    mediaTiles.push({
      key: "self-cam", variant: "camera", name: selfName, self: true,
      stream: localCameraStream,
    });

  for (const p of peers) {
    avatarTiles.push({
      key: `a-${p.userId}`, variant: "avatar", name: p.displayName,
      speaking: p.speaking && !p.muted, muted: p.muted, avatarUrl: p.avatarUrl,
    });
    if (p.sharing)
      mediaTiles.push({ key: `s-${p.userId}`, variant: "screen", name: p.displayName, stream: p.screenStream });
    if (p.cameraEnabled)
      mediaTiles.push({ key: `c-${p.userId}`, variant: "camera", name: p.displayName, stream: p.cameraStream });
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
            onOpen={tile.variant !== "avatar" ? () => setTheater(tile.stream ?? null) : undefined}
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
      {theater && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-8"
          style={{ background: "rgba(0,0,0,.9)", backdropFilter: "blur(8px)" }}
          onClick={() => setTheater(null)}
        >
          <button
            className="absolute top-5 end-5 text-muted-foreground hover:text-foreground p-2 transition-colors"
            style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={() => setTheater(null)}
            aria-label={t("voice.close")}
          >
            <X className="w-5 h-5" />
          </button>
          <VideoTile stream={theater} className="max-w-full max-h-full" style={{ border: "1px solid rgba(255,255,255,0.08)" }} />
        </div>
      )}
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
        </div>
        <TileLabel tile={tile} t={t} icon="mic" />
      </div>
    );
  }

  // screen / camera
  return (
    <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 236 }}>
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
