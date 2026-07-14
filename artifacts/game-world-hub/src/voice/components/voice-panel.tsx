import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVoice } from "../voice-context";
import { VideoTile } from "./video-tile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VOICE_PRESETS,
  SCREEN_PRESETS,
  VOICE_QUALITY_ORDER,
  SCREEN_QUALITY_ORDER,
  type VoiceQuality,
  type ScreenQuality,
} from "../quality";
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Users,
  ChevronDown,
  ChevronUp,
  Volume2,
  Loader2,
  Maximize2,
  X,
  AlertTriangle,
} from "lucide-react";

/**
 * Global, persistent voice/screen-share control panel. Docks to the bottom-left
 * whenever the user is in a party voice channel or a direct call, and survives
 * page navigation because it lives in the Shell.
 */
export function VoicePanel() {
  const { t } = useTranslation("common");
  const {
    activeRoom,
    peers,
    muted,
    sharing,
    speaking,
    localScreenStream,
    voiceQuality,
    screenQuality,
    toggleMute,
    startScreenShare,
    stopScreenShare,
    leaveVoice,
    setVoiceQuality,
    setScreenQuality,
    error,
    canRejoin,
    rejoin,
  } = useVoice();

  const [expanded, setExpanded] = useState(true);
  const [theater, setTheater] = useState<MediaStream | null>(null);

  if (!activeRoom) return null;

  const screenSharers = peers.filter((p) => p.sharing && p.screenStream);
  const anyScreens = screenSharers.length > 0 || (sharing && localScreenStream);

  return (
    <>
      <div className="fixed bottom-4 start-4 z-[80] w-[300px] bg-card border border-border shadow-2xl font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-xs uppercase tracking-widest truncate">
              {activeRoom.kind === "party" ? t("voice.voice") : t("voice.call")} · {activeRoom.title}
            </span>
          </div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={expanded ? t("voice.collapse") : t("voice.expand")}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Voice-level failure (e.g. a connection that couldn't be recovered). */}
        {error && (
          <div
            role="alert"
            className="px-3 py-2 border-b border-border bg-destructive/10 space-y-2"
          >
            <p className="text-[11px] leading-snug text-destructive">{error}</p>
            {canRejoin && (
              <Button
                size="sm"
                variant="destructive"
                className="w-full rounded-none h-7 text-[11px] uppercase tracking-widest"
                onClick={() => void rejoin()}
              >
                {t("voice.rejoin")}
              </Button>
            )}
          </div>
        )}

        {expanded && (
          <>
            {/* Participants */}
            <div className="max-h-[220px] overflow-auto p-2 space-y-1">
              <ParticipantRow
                name={t("voice.you")}
                avatarUrl={null}
                speaking={speaking && !muted}
                muted={muted}
                sharing={sharing}
                connectionState="connected"
                self
              />
              {peers.map((p) => (
                <ParticipantRow
                  key={p.userId}
                  name={p.displayName}
                  avatarUrl={p.avatarUrl}
                  speaking={p.speaking && !p.muted}
                  muted={p.muted}
                  sharing={p.sharing}
                  connectionState={p.connectionState}
                />
              ))}
              {peers.length === 0 && (
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest py-3 text-center">
                  <Users className="w-3 h-3 inline me-1" /> {t("voice.waitingForOthers")}
                </div>
              )}
            </div>

            {/* Screen share thumbnails */}
            {anyScreens && (
              <div className="border-t border-border p-2 grid grid-cols-2 gap-2">
                {sharing && localScreenStream && (
                  <ScreenThumb
                    stream={localScreenStream}
                    label={t("voice.you")}
                    self
                    onOpen={() => setTheater(localScreenStream)}
                  />
                )}
                {screenSharers.map((p) => (
                  <ScreenThumb
                    key={p.userId}
                    stream={p.screenStream}
                    label={p.displayName}
                    onOpen={() => setTheater(p.screenStream)}
                  />
                ))}
              </div>
            )}

            {/* Quality controls */}
            <div className="border-t border-border p-2 space-y-2">
              <QualityRow icon={<Volume2 className="w-3 h-3" />} label={t("voice.voiceLabel")}>
                <Select value={voiceQuality} onValueChange={(v) => setVoiceQuality(v as VoiceQuality)}>
                  <SelectTrigger className="h-7 text-[11px] rounded-none font-mono border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_QUALITY_ORDER.map((q) => (
                      <SelectItem key={q} value={q} className="text-[11px] font-mono">
                        {VOICE_PRESETS[q].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QualityRow>
              <QualityRow icon={<Monitor className="w-3 h-3" />} label={t("voice.screenLabel")}>
                <Select value={screenQuality} onValueChange={(v) => void setScreenQuality(v as ScreenQuality)}>
                  <SelectTrigger className="h-7 text-[11px] rounded-none font-mono border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCREEN_QUALITY_ORDER.map((q) => (
                      <SelectItem key={q} value={q} className="text-[11px] font-mono">
                        {SCREEN_PRESETS[q].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </QualityRow>
            </div>
          </>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1 p-2 border-t border-border">
          <Button
            size="sm"
            variant={muted ? "destructive" : "outline"}
            className="flex-1 rounded-none h-8 px-0"
            onClick={toggleMute}
            title={muted ? t("voice.unmute") : t("voice.mute")}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant={sharing ? "default" : "outline"}
            className="flex-1 rounded-none h-8 px-0"
            onClick={() => (sharing ? stopScreenShare() : void startScreenShare())}
            title={sharing ? t("voice.stopSharing") : t("voice.shareScreen")}
          >
            {sharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 rounded-none h-8 px-0"
            onClick={leaveVoice}
            title={t("voice.leave")}
          >
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Theater view for a single screen share */}
      {theater && (
        <div
          className="fixed inset-0 z-[95] bg-background/90 backdrop-blur flex items-center justify-center p-8"
          onClick={() => setTheater(null)}
        >
          <button
            className="absolute top-4 end-4 text-muted-foreground hover:text-foreground"
            onClick={() => setTheater(null)}
            aria-label={t("voice.close")}
          >
            <X className="w-6 h-6" />
          </button>
          <VideoTile stream={theater} className="max-w-full max-h-full border border-border" />
        </div>
      )}
    </>
  );
}

/**
 * When a peer that was already connected drops to `disconnected`/`failed`, the
 * voice layer auto-heals the path with an ICE restart. We surface a
 * "Reconnecting…" state while that heal is in flight, and only escalate to the
 * terminal "unreachable" warning if it hasn't recovered within this window.
 *
 * `disconnected` is frequently a transient blip that ICE recovers from on its
 * own, so we don't alarm the user the instant it appears. A `failed` peer that
 * never connected in the first place (initial-join failure) has nothing to
 * recover, so it surfaces as unreachable immediately.
 */
const DISCONNECT_GRACE_MS = 6000;

function ParticipantRow({
  name,
  avatarUrl,
  speaking,
  muted,
  sharing,
  connectionState,
  self,
}: {
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  sharing: boolean;
  connectionState: RTCPeerConnectionState;
  self?: boolean;
}) {
  const { t } = useTranslation("common");
  // Track whether this peer ever reached `connected`. This is what distinguishes
  // a mid-call drop (which the voice layer heals with an ICE restart → show
  // "Reconnecting…") from a peer that simply hasn't connected yet on initial
  // join (→ plain "connecting" spinner, no reconnecting indicator).
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (!self && connectionState === "connected") setEverConnected(true);
  }, [self, connectionState]);

  const dropped =
    !self && (connectionState === "disconnected" || connectionState === "failed");

  // A dropped peer is given a grace window to heal before we treat it as
  // unreachable. Exception: a `failed` peer that never connected has nothing to
  // recover (initial-join failure), so it surfaces as unreachable at once.
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!dropped) {
      setGraceElapsed(false);
      return;
    }
    if (connectionState === "failed" && !everConnected) {
      setGraceElapsed(true);
      return;
    }
    const timer = setTimeout(() => setGraceElapsed(true), DISCONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [dropped, connectionState, everConnected]);

  const unreachable = dropped && graceElapsed;
  // Mid-call self-heal in flight: a previously-connected peer dropped and the
  // ICE restart hasn't given up yet. Clears automatically on recovery.
  const reconnecting = dropped && everConnected && !graceElapsed;
  // Initial connection still in progress (never connected, not yet failed).
  const connecting =
    !self &&
    !everConnected &&
    !unreachable &&
    !reconnecting &&
    connectionState !== "connected" &&
    connectionState !== "failed";

  return (
    <div
      className={`rounded-none ${
        unreachable ? "bg-destructive/10" : reconnecting ? "bg-amber-500/10" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-1.5 py-1">
        <div
          className={`relative w-7 h-7 shrink-0 border ${
            unreachable
              ? "border-destructive"
              : reconnecting
                ? "border-amber-500"
                : speaking
                  ? "border-primary ring-2 ring-primary/60"
                  : "border-border"
          } transition-colors`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className={`w-full h-full object-cover ${unreachable ? "opacity-50" : ""}`}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center text-[11px]">
              {name.charAt(0)}
            </div>
          )}
        </div>
        <span className={`flex-1 text-xs truncate ${unreachable ? "text-muted-foreground" : ""}`}>
          {name}
        </span>
        {unreachable ? (
          <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
        ) : reconnecting ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t("voice.reconnecting")}
          </span>
        ) : (
          <>
            {connecting && (
              <Loader2 className="w-3 h-3 text-muted-foreground animate-spin shrink-0" />
            )}
            {sharing && <Monitor className="w-3 h-3 text-primary shrink-0" />}
            {muted ? (
              <MicOff className="w-3 h-3 text-destructive shrink-0" />
            ) : (
              <Mic
                className={`w-3 h-3 shrink-0 ${speaking ? "text-primary" : "text-muted-foreground"}`}
              />
            )}
          </>
        )}
      </div>
      {unreachable && (
        <p className="px-1.5 pb-1.5 text-[10px] leading-tight text-destructive">
          {t("voice.unreachable", { name })}
        </p>
      )}
    </div>
  );
}

function ScreenThumb({
  stream,
  label,
  self,
  onOpen,
}: {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <button
      className="relative group border border-border overflow-hidden aspect-video bg-black"
      onClick={onOpen}
      title={t("voice.openScreen", { label })}
    >
      <VideoTile stream={stream} className="w-full h-full object-contain" />
      <span className="absolute bottom-0 start-0 end-0 bg-background/80 text-[9px] px-1 py-0.5 truncate text-start">
        {label}
        {self ? t("voice.youSuffix") : ""}
      </span>
      <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="w-4 h-4" />
      </span>
    </button>
  );
}

function QualityRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground w-14 shrink-0">
        {icon} {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
