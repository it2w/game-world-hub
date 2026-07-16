import { useEffect, useState, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VOICE_PRESETS,
  SCREEN_PRESETS,
  VOICE_QUALITY_ORDER,
  SCREEN_QUALITY_ORDER,
  type VoiceQuality,
  type ScreenQuality,
} from "../quality";
import {
  useGetParty,
  useGetMe,
  useKickPartyMember,
  useTransferPartyLeadership,
  getGetPartyQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  ChevronDown,
  ChevronUp,
  Volume2,
  Loader2,
  Maximize2,
  X,
  AlertTriangle,
  UserMinus,
  Crown,
  Play,
  Video,
  VideoOff,
  Radio,
} from "lucide-react";

/* ── Sound-bar keyframes injected once ──────────────────────────────────── */
const STYLE = `
@keyframes gwh-bar {
  0%,100% { height: 3px; opacity:.5 }
  50%      { height: 11px; opacity:1 }
}
.gwh-bar1 { animation: gwh-bar .75s ease-in-out infinite; }
.gwh-bar2 { animation: gwh-bar .75s ease-in-out .18s infinite; }
.gwh-bar3 { animation: gwh-bar .75s ease-in-out .36s infinite; }
@keyframes gwh-speak-ring {
  0%,100%{ box-shadow:0 0 0 0 rgba(34,197,94,.7) }
  60%    { box-shadow:0 0 0 4px rgba(34,197,94,0) }
}
.gwh-speak-ring { animation: gwh-speak-ring 1s ease-out infinite; }
`;

function SoundBars() {
  return (
    <span className="flex items-end gap-[2.5px] h-3.5 shrink-0 px-0.5">
      <span className="gwh-bar1 w-[3px] bg-primary rounded-full" style={{ height: 3 }} />
      <span className="gwh-bar2 w-[3px] bg-primary rounded-full" style={{ height: 3 }} />
      <span className="gwh-bar3 w-[3px] bg-primary rounded-full" style={{ height: 3 }} />
    </span>
  );
}

/**
 * Global persistent voice/screen-share control panel.
 * Docks to the bottom-left, survives page navigation (rendered in Shell).
 */
export function VoicePanel() {
  const { t } = useTranslation("common");
  const {
    activeRoom,
    peers,
    muted,
    sharing,
    cameraEnabled,
    speaking,
    localScreenStream,
    localCameraStream,
    voiceQuality,
    screenQuality,
    toggleMute,
    toggleCamera,
    remoteMute,
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
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<ScreenQuality>(screenQuality);

  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const partyId = activeRoom?.kind === "party" ? activeRoom.partyId : null;
  const { data: party } = useGetParty(partyId!, {
    query: { enabled: !!partyId, queryKey: getGetPartyQueryKey(partyId!) },
  });
  const isLeader = !!me && !!party && party.leader.id === me.id;

  const kickMutation = useKickPartyMember({
    mutation: {
      onSuccess: () => {
        if (partyId) queryClient.invalidateQueries({ queryKey: getGetPartyQueryKey(partyId) });
      },
    },
  });
  const transferMutation = useTransferPartyLeadership({
    mutation: {
      onSuccess: () => {
        if (partyId) queryClient.invalidateQueries({ queryKey: getGetPartyQueryKey(partyId) });
      },
    },
  });

  const handleShareClick = useCallback(() => {
    if (sharing) {
      stopScreenShare();
    } else {
      setPendingQuality(screenQuality);
      setQualityPickerOpen(true);
    }
  }, [sharing, stopScreenShare, screenQuality]);

  const handleStartShare = useCallback(() => {
    setQualityPickerOpen(false);
    setScreenQuality(pendingQuality);
    void startScreenShare();
  }, [pendingQuality, setScreenQuality, startScreenShare]);

  /* ── demo / preview mode ─────────────────────────────────────── */
  const isPreview = new URLSearchParams(window.location.search).get("voice") === "preview";
  const demoRoom: typeof activeRoom = isPreview
    ? { kind: "party", room: "demo", partyId: 0, title: "VALORANT RANKED RUN" }
    : activeRoom;
  const demoPeers = isPreview
    ? [
        { userId: 2, username: "player2", displayName: "Khalid", avatarUrl: null, muted: false, sharing: false, cameraEnabled: false, speaking: true, connectionState: "connected" as RTCPeerConnectionState, audioStream: null, screenStream: null, cameraStream: null },
        { userId: 3, username: "player3", displayName: "Sara",   avatarUrl: null, muted: true,  sharing: false, cameraEnabled: false, speaking: false, connectionState: "connected" as RTCPeerConnectionState, audioStream: null, screenStream: null, cameraStream: null },
      ]
    : peers;

  if (!demoRoom) return null;
  const effectiveRoom  = demoRoom;
  const effectivePeers = demoPeers;
  const effectiveMuted = isPreview ? false : muted;
  const effectiveSpeaking = isPreview ? true : speaking;

  const screenSharers = effectivePeers.filter((p) => p.sharing && p.screenStream);
  const cameraViewers = effectivePeers.filter((p) => p.cameraEnabled && p.cameraStream);
  const anyScreens = screenSharers.length > 0 || (sharing && localScreenStream);
  const anyCameras = cameraViewers.length > 0 || (cameraEnabled && localCameraStream);
  const totalInCall = effectivePeers.length + 1;

  return (
    <>
      <style>{STYLE}</style>

      <div
        className="fixed bottom-4 start-4 z-[80] w-[292px] font-mono shadow-2xl"
        style={{ background: "#0c0c11", border: "1px solid #1e1e2a" }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ borderBottom: "1px solid #1e1e2a", background: "#111118" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* animated speaking/idle dot */}
            <span className="relative shrink-0 flex items-center justify-center w-5 h-5">
              <span className="absolute w-full h-full rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
              <span className="relative w-2 h-2 rounded-full bg-primary" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground leading-none mb-0.5">
                {effectiveRoom.kind === "party" ? t("voice.voice") : t("voice.call")}
              </div>
              <div className="text-[12px] font-bold uppercase tracking-wide truncate text-foreground leading-none">
                {effectiveRoom.title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {totalInCall}
            </span>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={expanded ? t("voice.collapse") : t("voice.expand")}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* ── Error banner ───────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="px-3 py-2 space-y-2"
            style={{ borderBottom: "1px solid #1e1e2a", background: "rgba(239,68,68,.08)" }}
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
            {/* ── Participant list ────────────────────────── */}
            <div className="max-h-[200px] overflow-auto py-1.5 px-2 space-y-0.5">
              {/* Self row */}
              <ParticipantRow
                name={t("voice.you")}
                avatarUrl={null}
                speaking={effectiveSpeaking && !effectiveMuted}
                muted={effectiveMuted}
                sharing={sharing}
                cameraEnabled={cameraEnabled}
                connectionState="connected"
                self
              />
              {/* Peers */}
              {effectivePeers.map((p) => (
                <ParticipantRow
                  key={p.userId}
                  name={p.displayName}
                  avatarUrl={p.avatarUrl}
                  speaking={p.speaking && !p.muted}
                  muted={p.muted}
                  sharing={p.sharing}
                  cameraEnabled={p.cameraEnabled}
                  connectionState={p.connectionState}
                  isLeader={!isPreview && isLeader && !!partyId}
                  onKick={() =>
                    kickMutation.mutate({ partyId: partyId!, userId: p.userId })
                  }
                  onTransfer={() =>
                    transferMutation.mutate({ partyId: partyId!, userId: p.userId })
                  }
                  onMutePeer={() => remoteMute(p.userId)}
                />
              ))}

              {/* Empty state */}
              {effectivePeers.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
                  <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
                  <span className="text-[10px] uppercase tracking-[0.12em]">
                    {t("voice.waitingForOthers")}
                  </span>
                </div>
              )}
            </div>

            {/* ── Screen share thumbnails ─────────────────── */}
            {anyScreens && (
              <div
                className="p-2 grid grid-cols-2 gap-1.5"
                style={{ borderTop: "1px solid #1e1e2a" }}
              >
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

            {/* ── Camera thumbnails ───────────────────────── */}
            {anyCameras && (
              <div
                className="p-2 grid grid-cols-2 gap-1.5"
                style={{ borderTop: "1px solid #1e1e2a" }}
              >
                {cameraEnabled && localCameraStream && (
                  <ScreenThumb
                    stream={localCameraStream}
                    label={t("voice.you")}
                    self
                    cameraLabel
                    onOpen={() => setTheater(localCameraStream)}
                  />
                )}
                {cameraViewers.map((p) => (
                  <ScreenThumb
                    key={p.userId}
                    stream={p.cameraStream}
                    label={p.displayName}
                    cameraLabel
                    onOpen={() => setTheater(p.cameraStream)}
                  />
                ))}
              </div>
            )}

            {/* ── Quality controls ────────────────────────── */}
            <div className="px-3 py-2 space-y-1.5" style={{ borderTop: "1px solid #1e1e2a" }}>
              <QualityRow icon={<Volume2 className="w-3 h-3" />} label={t("voice.voiceLabel")}>
                <Select
                  value={voiceQuality}
                  onValueChange={(v) => setVoiceQuality(v as VoiceQuality)}
                >
                  <SelectTrigger
                    className="h-6 text-[11px] rounded-none font-mono border-0 bg-transparent p-0 ps-0 focus:ring-0 gap-1"
                    style={{ color: "#9b9baa" }}
                  >
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
              {sharing && (
                <QualityRow
                  icon={<Monitor className="w-3 h-3" />}
                  label={t("voice.screenLabel")}
                >
                  <Select
                    value={screenQuality}
                    onValueChange={(v) => void setScreenQuality(v as ScreenQuality)}
                  >
                    <SelectTrigger
                      className="h-6 text-[11px] rounded-none font-mono border-0 bg-transparent p-0 ps-0 focus:ring-0 gap-1"
                      style={{ color: "#9b9baa" }}
                    >
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
              )}
            </div>
          </>
        )}

        {/* ── Controls bar ────────────────────────────────── */}
        <div
          className="flex items-center gap-1 p-2"
          style={{ borderTop: "1px solid #1e1e2a", background: "#0e0e14" }}
        >
          {/* Mute */}
          <ControlBtn
            active={muted}
            activeColor="destructive"
            onClick={toggleMute}
            title={muted ? t("voice.unmute") : t("voice.mute")}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </ControlBtn>

          {/* Camera */}
          <ControlBtn
            active={cameraEnabled}
            activeColor="primary"
            onClick={() => void toggleCamera()}
            title={cameraEnabled ? t("voice.cameraOff") : t("voice.cameraOn")}
          >
            {cameraEnabled ? (
              <Video className="w-4 h-4" />
            ) : (
              <VideoOff className="w-4 h-4" />
            )}
          </ControlBtn>

          {/* Screen share */}
          <ControlBtn
            active={sharing}
            activeColor="primary"
            onClick={handleShareClick}
            title={sharing ? t("voice.stopSharing") : t("voice.shareScreen")}
          >
            {sharing ? (
              <MonitorOff className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </ControlBtn>

          {/* Leave — always destructive */}
          <button
            onClick={leaveVoice}
            title={t("voice.leave")}
            className="flex-1 flex items-center justify-center h-9 rounded-none transition-all font-mono text-white"
            style={{ background: "#dc2626" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#b91c1c";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#dc2626";
            }}
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Screen share quality picker dialog ─────────────── */}
      <Dialog open={qualityPickerOpen} onOpenChange={setQualityPickerOpen}>
        <DialogContent className="border-border bg-card rounded-none sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
              {t("voice.qualityPickerTitle")}
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
              onClick={() => setQualityPickerOpen(false)}
            >
              {t("voice.cancel")}
            </Button>
            <Button
              className="flex-1 rounded-none font-mono gap-2"
              onClick={handleStartShare}
            >
              <Play className="w-4 h-4" /> {t("voice.startSharing")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Theater view ────────────────────────────────────── */}
      {theater && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-8"
          style={{ background: "rgba(0,0,0,.88)", backdropFilter: "blur(6px)" }}
          onClick={() => setTheater(null)}
        >
          <button
            className="absolute top-5 end-5 text-muted-foreground hover:text-foreground bg-black/60 p-1.5"
            onClick={() => setTheater(null)}
            aria-label={t("voice.close")}
          >
            <X className="w-5 h-5" />
          </button>
          <VideoTile
            stream={theater}
            className="max-w-full max-h-full"
            style={{ border: "1px solid #1e1e2a" }}
          />
        </div>
      )}
    </>
  );
}

/* ── Control button helper ───────────────────────────────────────────────── */
function ControlBtn({
  children,
  active,
  activeColor,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  activeColor: "destructive" | "primary";
  onClick: () => void;
  title: string;
}) {
  const activeBg =
    activeColor === "destructive"
      ? { background: "rgba(239,68,68,.18)", color: "#f87171", border: "1px solid rgba(239,68,68,.35)" }
      : { background: "rgba(34,197,94,.14)", color: "#4ade80", border: "1px solid rgba(34,197,94,.3)" };
  const idleBg = { background: "#1a1a24", color: "#6b7280", border: "1px solid #2a2a38" };

  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 flex items-center justify-center h-9 rounded-none transition-all"
      style={active ? activeBg : idleBg}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "#22222e";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "#1a1a24";
      }}
    >
      {children}
    </button>
  );
}

/* ── Reconnect grace ─────────────────────────────────────────────────────── */
const DISCONNECT_GRACE_MS = 6000;

/* ── Participant row ─────────────────────────────────────────────────────── */
function ParticipantRow({
  name,
  avatarUrl,
  speaking,
  muted,
  sharing,
  cameraEnabled,
  connectionState,
  self,
  isLeader,
  onKick,
  onTransfer,
  onMutePeer,
}: {
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  sharing: boolean;
  cameraEnabled?: boolean;
  connectionState: RTCPeerConnectionState;
  self?: boolean;
  isLeader?: boolean;
  onKick?: () => void;
  onTransfer?: () => void;
  onMutePeer?: () => void;
}) {
  const { t } = useTranslation("common");
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (!self && connectionState === "connected") setEverConnected(true);
  }, [self, connectionState]);

  const dropped =
    !self && (connectionState === "disconnected" || connectionState === "failed");
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!dropped) { setGraceElapsed(false); return; }
    if (connectionState === "failed" && !everConnected) { setGraceElapsed(true); return; }
    const timer = setTimeout(() => setGraceElapsed(true), DISCONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [dropped, connectionState, everConnected]);

  const unreachable   = dropped && graceElapsed;
  const reconnecting  = dropped && everConnected && !graceElapsed;
  const connecting    =
    !self && !everConnected && !unreachable && !reconnecting &&
    connectionState !== "connected" && connectionState !== "failed";

  const [showActions, setShowActions] = useState(false);

  /* avatar ring color */
  const ringColor = unreachable
    ? "#ef4444"
    : reconnecting
      ? "#f59e0b"
      : speaking
        ? "#22c55e"
        : "transparent";

  return (
    <div
      className="rounded-none relative flex items-center gap-2.5 px-2 py-1.5 group"
      style={{
        background: speaking ? "rgba(34,197,94,.05)" : unreachable ? "rgba(239,68,68,.07)" : reconnecting ? "rgba(245,158,11,.07)" : "transparent",
        transition: "background .2s",
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Speaking accent bar */}
      {speaking && (
        <span
          className="absolute start-0 top-1 bottom-1 w-[2px] rounded-full"
          style={{ background: "#22c55e" }}
        />
      )}

      {/* Avatar */}
      <div
        className={`relative w-8 h-8 shrink-0 overflow-hidden ${speaking ? "gwh-speak-ring" : ""}`}
        style={{
          outline: `2px solid ${ringColor}`,
          outlineOffset: "1px",
          transition: "outline-color .2s",
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className={`w-full h-full object-cover ${unreachable ? "opacity-40" : ""}`}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-[12px] font-bold"
            style={{ background: "#1e1e2a", color: "#9b9baa" }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`flex-1 text-[12px] tracking-wide truncate ${unreachable ? "text-muted-foreground" : "text-foreground"}`}
      >
        {name}
      </span>

      {/* Leader actions (hover) */}
      {!self && isLeader && showActions && !unreachable && (
        <div className="flex items-center gap-0.5 shrink-0">
          {!muted && (
            <button
              onClick={onMutePeer}
              className="p-1 text-muted-foreground hover:text-amber-400 transition-colors"
              title={t("voice.mutePeer")}
            >
              <MicOff className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onTransfer}
            className="p-1 text-muted-foreground hover:text-primary transition-colors"
            title={t("voice.transferLeadership")}
          >
            <Crown className="w-3 h-3" />
          </button>
          <button
            onClick={onKick}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title={t("voice.kick")}
          >
            <UserMinus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Status icons / indicators */}
      <div className="flex items-center gap-1 shrink-0">
        {unreachable ? (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        ) : reconnecting ? (
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t("voice.reconnecting")}
          </span>
        ) : (
          <>
            {connecting && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
            {cameraEnabled && <Video className="w-3 h-3 text-primary" />}
            {sharing && <Monitor className="w-3 h-3 text-primary" />}
            {speaking && !muted ? (
              <SoundBars />
            ) : muted ? (
              <MicOff className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Screen / camera thumbnail ───────────────────────────────────────────── */
function ScreenThumb({
  stream,
  label,
  self,
  cameraLabel,
  onOpen,
}: {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  cameraLabel?: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <button
      className="relative group overflow-hidden aspect-video bg-black"
      style={{ border: "1px solid #1e1e2a" }}
      onClick={onOpen}
      title={t("voice.openScreen", { label })}
    >
      <VideoTile stream={stream} className="w-full h-full object-contain" />
      <span
        className="absolute bottom-0 start-0 end-0 text-[9px] px-1.5 py-0.5 truncate text-start flex items-center gap-1"
        style={{ background: "rgba(0,0,0,.75)", color: "#9b9baa" }}
      >
        {cameraLabel && <Video className="w-2.5 h-2.5 shrink-0" />}
        {label}{self ? t("voice.youSuffix") : ""}
      </span>
      <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="w-4 h-4 text-white" />
      </span>
    </button>
  );
}

/* ── Quality row helper ──────────────────────────────────────────────────── */
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
