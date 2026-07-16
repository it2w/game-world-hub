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
  EarOff,
  Ear,
} from "lucide-react";

/* ── HALO keyframes injected once ───────────────────────────────────────── */
const STYLE = `
@keyframes gwh-ring-out {
  0%   { transform: scale(1);    opacity: 1; }
  100% { transform: scale(1.22); opacity: 0; }
}
@keyframes gwh-eq-bar {
  0%, 100% { transform: scaleY(0.25); }
  50%       { transform: scaleY(1); }
}
@keyframes gwh-sweep {
  0%   { left: -40%; }
  100% { left: 140%; }
}
@keyframes gwh-dot-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
@keyframes gwh-peer-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,65,0); }
  50%       { box-shadow: 0 0 0 3px rgba(0,255,65,0.18); }
}
.gwh-ring-1 { animation: gwh-ring-out 2.2s cubic-bezier(0.4,0,0.6,1) infinite; }
.gwh-ring-2 { animation: gwh-ring-out 2.2s cubic-bezier(0.4,0,0.6,1) 0.55s infinite; }
.gwh-ring-3 { animation: gwh-ring-out 2.2s cubic-bezier(0.4,0,0.6,1) 1.1s infinite; }
.gwh-eq1 { animation: gwh-eq-bar 0.9s ease-in-out infinite 0.00s; transform-origin: bottom; }
.gwh-eq2 { animation: gwh-eq-bar 0.9s ease-in-out infinite 0.15s; transform-origin: bottom; }
.gwh-eq3 { animation: gwh-eq-bar 0.9s ease-in-out infinite 0.30s; transform-origin: bottom; }
.gwh-eq4 { animation: gwh-eq-bar 0.9s ease-in-out infinite 0.45s; transform-origin: bottom; }
.gwh-eq5 { animation: gwh-eq-bar 0.9s ease-in-out infinite 0.60s; transform-origin: bottom; }
.gwh-eq-sm1 { animation: gwh-eq-bar 0.8s ease-in-out infinite 0.00s; transform-origin: bottom; }
.gwh-eq-sm2 { animation: gwh-eq-bar 0.8s ease-in-out infinite 0.18s; transform-origin: bottom; }
.gwh-eq-sm3 { animation: gwh-eq-bar 0.8s ease-in-out infinite 0.36s; transform-origin: bottom; }
.gwh-dot-blink { animation: gwh-dot-blink 1.4s ease-in-out infinite; }
.gwh-peer-glow { animation: gwh-peer-glow 2s ease-in-out infinite; }
`;

/* ── EQ bars (large for self, small for peers) ───────────────────────────── */
function EqBars({ size = "lg" }: { size?: "lg" | "sm" }) {
  if (size === "sm") {
    return (
      <span className="flex items-end gap-[2px] h-3 shrink-0">
        <span className="gwh-eq-sm1 w-[2px] h-3 bg-primary rounded-full" />
        <span className="gwh-eq-sm2 w-[2px] h-3 bg-primary rounded-full" />
        <span className="gwh-eq-sm3 w-[2px] h-3 bg-primary rounded-full" />
      </span>
    );
  }
  return (
    <span className="flex items-end gap-[3px] h-4 shrink-0">
      <span className="gwh-eq1 w-[3px] h-4 bg-primary rounded-full" />
      <span className="gwh-eq2 w-[3px] h-4 bg-primary rounded-full" />
      <span className="gwh-eq3 w-[3px] h-4 bg-primary rounded-full" />
      <span className="gwh-eq4 w-[3px] h-4 bg-primary rounded-full" />
      <span className="gwh-eq5 w-[3px] h-4 bg-primary rounded-full" />
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
    deafened,
    sharing,
    cameraEnabled,
    speaking,
    localScreenStream,
    localCameraStream,
    voiceQuality,
    screenQuality,
    toggleMute,
    toggleDeafen,
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
  const effectiveRoom     = demoRoom;
  const effectivePeers    = demoPeers;
  const effectiveMuted    = isPreview ? false : muted;
  const effectiveDeafened = isPreview ? false : deafened;
  const effectiveSpeaking = isPreview ? true : speaking;

  const screenSharers = effectivePeers.filter((p) => p.sharing && p.screenStream);
  const cameraViewers = effectivePeers.filter((p) => p.cameraEnabled && p.cameraStream);
  const anyScreens = screenSharers.length > 0 || (sharing && localScreenStream);
  const anyCameras = cameraViewers.length > 0 || (cameraEnabled && localCameraStream);

  /* active screen quality label */
  const screenPreset = SCREEN_PRESETS[screenQuality];

  return (
    <>
      <style>{STYLE}</style>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-4 start-4 z-[80] w-[300px] font-mono"
        style={{
          background: "linear-gradient(180deg, #0e0e1c 0%, #080812 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      >
        {/* Top gradient bar */}
        <div
          className="h-[2px] w-full shrink-0"
          style={{ background: "linear-gradient(90deg,hsl(var(--primary)) 0%,#00bfff 55%,transparent 100%)" }}
        />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex shrink-0 w-2 h-2">
              <span className="gwh-dot-blink absolute inset-0 rounded-full bg-primary" />
              <span className="rounded-full w-2 h-2 bg-primary/30" />
            </span>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground leading-none mb-[3px]">
                {effectiveRoom.kind === "party" ? t("voice.voice") : t("voice.call")}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest truncate text-foreground leading-none">
                {effectiveRoom.title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[9px] px-1.5 py-0.5 font-bold tabular-nums"
              style={{
                background: "rgba(var(--primary-rgb,0,255,65),0.1)",
                color: "hsl(var(--primary))",
                border: "1px solid rgba(var(--primary-rgb,0,255,65),0.25)",
              }}
            >
              {effectivePeers.length + 1}
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

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="px-4 py-2.5 space-y-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(239,68,68,.07)" }}
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
            {/* ── Self / HALO section ─────────────────────────────────────── */}
            <div
              className="flex flex-col items-center pt-7 pb-5 relative overflow-hidden"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              {/* Radial bg glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse 160px 100px at 50% 55%, rgba(var(--primary-rgb,0,255,65),0.07) 0%, transparent 70%)",
                }}
              />

              {/* Halo rings + avatar */}
              <div className="relative flex items-center justify-center w-[144px] h-[144px] mb-4">
                <div
                  className="gwh-ring-3 absolute w-[128px] h-[128px] pointer-events-none"
                  style={{ border: "1px solid rgba(var(--primary-rgb,0,255,65),0.12)" }}
                />
                <div
                  className="gwh-ring-2 absolute w-[108px] h-[108px] pointer-events-none"
                  style={{ border: "1px solid rgba(var(--primary-rgb,0,255,65),0.28)" }}
                />
                <div
                  className="gwh-ring-1 absolute w-[90px] h-[90px] pointer-events-none"
                  style={{ border: "1px solid rgba(var(--primary-rgb,0,255,65),0.55)" }}
                />
                {/* Avatar */}
                <div
                  className="relative w-[72px] h-[72px] flex items-center justify-center z-10"
                  style={{
                    background: "linear-gradient(135deg, #182818, #0f1220)",
                    border: "1px solid rgba(var(--primary-rgb,0,255,65),0.4)",
                    boxShadow: "0 0 28px rgba(var(--primary-rgb,0,255,65),0.22), inset 0 0 12px rgba(var(--primary-rgb,0,255,65),0.08)",
                    color: "hsl(var(--primary))",
                  }}
                >
                  {/* If we have a local camera stream, we could render it here in future */}
                  <span className="text-[26px] font-bold">Y</span>
                </div>
              </div>

              {/* Name + EQ */}
              <div className="flex items-center gap-3 mb-2.5 z-10">
                <span className="text-[13px] font-bold uppercase tracking-widest">{t("voice.you")}</span>
                {effectiveSpeaking && !effectiveMuted && <EqBars />}
                {effectiveMuted && <MicOff className="w-3.5 h-3.5 text-destructive" />}
                {effectiveDeafened && <EarOff className="w-3.5 h-3.5 text-destructive ml-1" />}
              </div>

              {/* Status badges row */}
              <div className="flex items-center gap-2 z-10 flex-wrap justify-center">
                {sharing && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1"
                    style={{
                      background: "rgba(var(--primary-rgb,0,255,65),0.08)",
                      border: "1px solid rgba(var(--primary-rgb,0,255,65),0.2)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 shrink-0 animate-pulse"
                      style={{ background: "hsl(var(--primary))", boxShadow: "0 0 6px hsl(var(--primary))" }}
                    />
                    <span className="text-[9px] text-primary tracking-[0.18em] uppercase font-semibold">
                      {t("voice.screenActive")}
                    </span>
                  </div>
                )}
                {cameraEnabled && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1"
                    style={{
                      background: "rgba(var(--primary-rgb,0,255,65),0.08)",
                      border: "1px solid rgba(var(--primary-rgb,0,255,65),0.2)",
                    }}
                  >
                    <Video className="w-2.5 h-2.5 text-primary shrink-0" />
                    <span className="text-[9px] text-primary tracking-[0.18em] uppercase font-semibold">
                      {t("voice.cameraOn")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Screen share thumbnails ─────────────────────────────────── */}
            {anyScreens && (
              <div
                className="p-2 grid grid-cols-2 gap-1.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                {sharing && localScreenStream && (
                  <ScreenThumb
                    stream={localScreenStream}
                    label={t("voice.you")}
                    self
                    onOpen={() => setTheater(localScreenStream)}
                    fps={screenPreset.frameRate}
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

            {/* ── Camera thumbnails ───────────────────────────────────────── */}
            {anyCameras && (
              <div
                className="p-2 grid grid-cols-2 gap-1.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
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

            {/* ── Peer list ────────────────────────────────────────────────── */}
            <div className="flex flex-col">
              {effectivePeers.length === 0 ? (
                <div
                  className="flex items-center gap-2 px-4 py-3 text-muted-foreground"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="text-[10px] uppercase tracking-[0.12em] animate-pulse">
                    {t("voice.waitingForOthers")}
                  </span>
                </div>
              ) : (
                effectivePeers.map((p) => (
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
                    onKick={() => kickMutation.mutate({ partyId: partyId!, userId: p.userId })}
                    onTransfer={() => transferMutation.mutate({ partyId: partyId!, userId: p.userId })}
                    onMutePeer={() => remoteMute(p.userId)}
                  />
                ))
              )}
            </div>

            {/* ── Quality footer (while sharing) ──────────────────────────── */}
            {sharing && (
              <div
                className="flex items-center justify-between px-4 py-1.5"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-[0.2em]">
                    {t("voice.screenLabel")}
                  </span>
                  <Select
                    value={screenQuality}
                    onValueChange={(v) => void setScreenQuality(v as ScreenQuality)}
                  >
                    <SelectTrigger
                      className="h-5 text-[9px] rounded-none font-mono border-0 bg-transparent p-0 ps-0 focus:ring-0 gap-1"
                      style={{ color: "hsl(var(--primary))", opacity: 0.7 }}
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
                </div>
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] h-[3px]"
                      style={{ background: "rgba(var(--primary-rgb,0,255,65),0.5)" }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Controls bar ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-1.5 px-3 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.25)" }}
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

          {/* Deafen */}
          <ControlBtn
            active={deafened}
            activeColor="destructive"
            onClick={toggleDeafen}
            title={deafened ? t("voice.undeafen") : t("voice.deafen")}
          >
            {deafened ? <EarOff className="w-4 h-4" /> : <Ear className="w-4 h-4" />}
          </ControlBtn>

          {/* Camera */}
          <ControlBtn
            active={cameraEnabled}
            activeColor="primary"
            onClick={() => void toggleCamera()}
            title={cameraEnabled ? t("voice.cameraOff") : t("voice.cameraOn")}
          >
            {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </ControlBtn>

          {/* Screen share */}
          <ControlBtn
            active={sharing}
            activeColor="primary"
            onClick={handleShareClick}
            title={sharing ? t("voice.stopSharing") : t("voice.shareScreen")}
          >
            {sharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </ControlBtn>

          {/* Leave */}
          <button
            onClick={leaveVoice}
            title={t("voice.leave")}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-none transition-all font-mono text-[10px] uppercase tracking-wider"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.5)",
              color: "#ef4444",
              boxShadow: "0 0 10px rgba(239,68,68,0.12)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)";
            }}
          >
            <PhoneOff className="w-4 h-4" />
            <span>{t("voice.leave")}</span>
          </button>
        </div>

        {/* Voice quality selector (collapsed) */}
        {expanded && (
          <div
            className="flex items-center gap-2 px-4 py-1.5"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <Volume2 className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
            <span className="text-[8px] text-muted-foreground uppercase tracking-[0.15em]">
              {t("voice.voiceLabel")}
            </span>
            <Select
              value={voiceQuality}
              onValueChange={(v) => setVoiceQuality(v as VoiceQuality)}
            >
              <SelectTrigger
                className="h-5 text-[9px] rounded-none font-mono border-0 bg-transparent p-0 ps-0 focus:ring-0 gap-1 flex-1"
                style={{ color: "rgba(155,155,170,0.7)" }}
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
          </div>
        )}
      </div>

      {/* ── Screen share quality picker dialog ─────────────────────────────── */}
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

      {/* ── Theater view ───────────────────────────────────────────────────── */}
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
          <VideoTile
            stream={theater}
            className="max-w-full max-h-full"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
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
      ? {
          background: "rgba(239,68,68,0.12)",
          color: "#ef4444",
          border: "1px solid rgba(239,68,68,0.5)",
          boxShadow: "0 0 10px rgba(239,68,68,0.12)",
        }
      : {
          background: "rgba(var(--primary-rgb,0,255,65),0.12)",
          color: "hsl(var(--primary))",
          border: "1px solid rgba(var(--primary-rgb,0,255,65),0.55)",
          boxShadow: "0 0 14px rgba(var(--primary-rgb,0,255,65),0.15)",
        };
  const idleBg = {
    background: "#111120",
    color: "#55556a",
    border: "1px solid #232338",
  };

  return (
    <button
      onClick={onClick}
      title={title}
      className="w-10 h-9 flex items-center justify-center rounded-none transition-all shrink-0"
      style={active ? activeBg : idleBg}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "#16162a";
          (e.currentTarget as HTMLElement).style.color = "#ffffff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "#111120";
          (e.currentTarget as HTMLElement).style.color = "#55556a";
        }
      }}
    >
      {children}
    </button>
  );
}

/* ── Reconnect grace ─────────────────────────────────────────────────────── */
const DISCONNECT_GRACE_MS = 6000;

/* ── Participant row (HALO style) ────────────────────────────────────────── */
function ParticipantRow({
  name,
  avatarUrl,
  speaking,
  muted,
  sharing,
  cameraEnabled,
  connectionState,
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
  isLeader?: boolean;
  onKick?: () => void;
  onTransfer?: () => void;
  onMutePeer?: () => void;
}) {
  const { t } = useTranslation("common");
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connectionState === "connected") setEverConnected(true);
  }, [connectionState]);

  const dropped =
    connectionState === "disconnected" || connectionState === "failed";
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    if (!dropped) { setGraceElapsed(false); return; }
    if (connectionState === "failed" && !everConnected) { setGraceElapsed(true); return; }
    const timer = setTimeout(() => setGraceElapsed(true), DISCONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [dropped, connectionState, everConnected]);

  const unreachable  = dropped && graceElapsed;
  const reconnecting = dropped && everConnected && !graceElapsed;
  const connecting   =
    !everConnected && !unreachable && !reconnecting &&
    connectionState !== "connected" && connectionState !== "failed";

  const [showActions, setShowActions] = useState(false);

  const isSpeaking = speaking && !muted;

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 relative transition-colors ${isSpeaking ? "gwh-peer-glow" : ""}`}
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        borderLeft: isSpeaking
          ? "2px solid hsl(var(--primary))"
          : unreachable
            ? "2px solid #ef4444"
            : reconnecting
              ? "2px solid #f59e0b"
              : "2px solid transparent",
        background: isSpeaking
          ? "rgba(var(--primary-rgb,0,255,65),0.05)"
          : unreachable
            ? "rgba(239,68,68,0.05)"
            : reconnecting
              ? "rgba(245,158,11,0.05)"
              : "transparent",
        transition: "background .2s",
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 shrink-0 flex items-center justify-center text-[11px] font-bold overflow-hidden"
        style={{
          background: "#111122",
          border: isSpeaking
            ? "1px solid rgba(var(--primary-rgb,0,255,65),0.4)"
            : unreachable
              ? "1px solid rgba(239,68,68,0.3)"
              : "1px solid rgba(255,255,255,0.08)",
          color: isSpeaking ? "hsl(var(--primary))" : "#888899",
          opacity: unreachable ? 0.5 : 1,
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>

      {/* Name */}
      <span
        className="flex-1 text-[11px] tracking-wide truncate"
        style={{
          color: unreachable
            ? "rgba(255,255,255,0.3)"
            : isSpeaking
              ? "rgba(255,255,255,0.95)"
              : "rgba(255,255,255,0.75)",
        }}
      >
        {name}
      </span>

      {/* Leader actions (hover) */}
      {isLeader && showActions && !unreachable && (
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

      {/* Status icons */}
      <div className="flex items-center gap-1 shrink-0">
        {unreachable ? (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        ) : reconnecting ? (
          <span className="flex items-center gap-1 text-[9px] text-amber-400">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        ) : (
          <>
            {connecting && <Loader2 className="w-3 h-3 text-muted-foreground/40 animate-spin" />}
            {cameraEnabled && <Video className="w-3 h-3 text-primary" />}
            {sharing && <Monitor className="w-3 h-3 text-primary" />}
            {isSpeaking ? (
              <EqBars size="sm" />
            ) : muted ? (
              <MicOff className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-muted-foreground/25" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Screen / camera thumbnail (HALO style) ──────────────────────────────── */
function ScreenThumb({
  stream,
  label,
  self,
  cameraLabel,
  onOpen,
  fps,
}: {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  cameraLabel?: boolean;
  onOpen: () => void;
  fps?: number;
}) {
  const { t } = useTranslation("common");
  return (
    <button
      className="relative group overflow-hidden aspect-video bg-black"
      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      onClick={onOpen}
      title={t("voice.openScreen", { label })}
    >
      <VideoTile stream={stream} className="w-full h-full object-contain" />
      {/* Label bar */}
      <span
        className="absolute bottom-0 start-0 end-0 text-[9px] px-1.5 py-0.5 truncate text-start flex items-center gap-1"
        style={{ background: "rgba(0,0,0,.8)", color: "rgba(255,255,255,0.55)" }}
      >
        {cameraLabel && <Video className="w-2.5 h-2.5 shrink-0 text-primary" />}
        {!cameraLabel && <Monitor className="w-2.5 h-2.5 shrink-0" />}
        {label}{self ? t("voice.youSuffix") : ""}
      </span>
      {/* FPS badge (top-right) */}
      {fps && (
        <span
          className="absolute top-1 end-1 text-[8px] px-1 font-bold"
          style={{
            background: "rgba(var(--primary-rgb,0,255,65),0.15)",
            color: "hsl(var(--primary))",
            border: "1px solid rgba(var(--primary-rgb,0,255,65),0.3)",
          }}
        >
          {fps}fps
        </span>
      )}
      {/* Expand overlay */}
      <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="w-4 h-4 text-white" />
      </span>
    </button>
  );
}
