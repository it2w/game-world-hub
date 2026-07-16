import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Participant,
  type RemoteAudioTrack,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCodec,
} from "livekit-client";
import { useAuth } from "@/hooks/use-auth";
import { getApiBase, getSignalingUrl } from "./webrtc";
import { RemoteAudioSink } from "./components/remote-audio-sink";
import {
  DEFAULT_SCREEN_QUALITY,
  DEFAULT_VOICE_QUALITY,
  VOICE_PRESETS,
  SCREEN_PRESETS,
  type ScreenQuality,
  type VoiceQuality,
} from "./quality";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CallUser {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PeerUiState {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  muted: boolean;
  sharing: boolean;
  cameraEnabled: boolean;
  speaking: boolean;
  connectionState: RTCPeerConnectionState;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
}

export type ActiveRoom =
  | { kind: "party"; room: string; partyId: number; title: string }
  | { kind: "call"; room: string; peer: CallUser; title: string };

interface IncomingCall {
  callId: string;
  room: string;
  from: CallUser;
}

interface OutgoingCall {
  callId: string;
  room: string;
  to: CallUser;
}

interface VoiceContextValue {
  connected: boolean;
  activeRoom: ActiveRoom | null;
  peers: PeerUiState[];
  muted: boolean;
  deafened: boolean;
  sharing: boolean;
  cameraEnabled: boolean;
  speaking: boolean;
  localScreenStream: MediaStream | null;
  localCameraStream: MediaStream | null;
  voiceQuality: VoiceQuality;
  screenQuality: ScreenQuality;
  incomingCall: IncomingCall | null;
  outgoingCall: OutgoingCall | null;
  error: string | null;
  canRejoin: boolean;

  joinPartyVoice: (partyId: number, title: string) => Promise<void>;
  leaveVoice: () => void;
  rejoin: () => Promise<void>;
  callUser: (user: CallUser) => void;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  cancelCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  remoteMute: (userId: number) => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  setVoiceQuality: (q: VoiceQuality) => void;
  setScreenQuality: (q: ScreenQuality) => void;
  isInPartyVoice: (partyId: number) => boolean;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

// ─── Pure helpers (outside component — no hook deps) ──────────────────────────

function participantMeta(p: RemoteParticipant): { displayName: string; avatarUrl: string | null } {
  try {
    const m = JSON.parse(p.metadata ?? "{}");
    return {
      displayName: m.displayName || p.name || p.identity,
      avatarUrl: m.avatarUrl ?? null,
    };
  } catch {
    return { displayName: p.name || p.identity, avatarUrl: null };
  }
}

function qualityToConnState(q: ConnectionQuality): RTCPeerConnectionState {
  if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return "connected";
  if (q === ConnectionQuality.Poor) return "connecting";
  if (q === ConnectionQuality.Lost) return "disconnected";
  return "new";
}

function buildPeerState(p: RemoteParticipant): PeerUiState {
  const { displayName, avatarUrl } = participantMeta(p);
  let audioStream: MediaStream | null = null;
  let screenStream: MediaStream | null = null;
  let cameraStream: MediaStream | null = null;

  // audioStream is intentionally left null: livekit-client auto-plays remote
  // audio via its own internal HTMLAudioElement.  Deafen is applied via
  // RemoteAudioTrack.setVolume(0) in applyDeafenVolume(), not via srcObject.
  void audioStream;
  for (const pub of p.videoTrackPublications.values()) {
    if (!pub.track?.mediaStream) continue;
    if (pub.source === Track.Source.ScreenShare) screenStream = pub.track.mediaStream;
    else if (pub.source === Track.Source.Camera) cameraStream = pub.track.mediaStream;
  }

  return {
    userId: Number(p.identity),
    username: p.name ?? p.identity,
    displayName,
    avatarUrl,
    muted: !p.isMicrophoneEnabled,
    sharing: p.isScreenShareEnabled,
    cameraEnabled: p.isCameraEnabled,
    speaking: p.isSpeaking,
    connectionState: qualityToConnState(p.connectionQuality),
    audioStream,
    screenStream,
    cameraStream,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── React state ────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [peersState, setPeersState] = useState<Record<number, PeerUiState>>({});
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [voiceQuality, setVoiceQualityState] = useState<VoiceQuality>(DEFAULT_VOICE_QUALITY);
  const [screenQuality, setScreenQualityState] = useState<ScreenQuality>(DEFAULT_SCREEN_QUALITY);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRejoin, setCanRejoin] = useState(false);

  // ── Mutable refs ───────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const livekitRef = useRef<Room | null>(null);
  const activeRoomRef = useRef<ActiveRoom | null>(null);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const mutedBeforeDeafenRef = useRef(false);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnectRef = useRef(false);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const voiceQualityRef = useRef<VoiceQuality>(DEFAULT_VOICE_QUALITY);
  const screenQualityRef = useRef<ScreenQuality>(DEFAULT_SCREEN_QUALITY);
  // Holds the raw MediaStreamTrack we published — needed for unpublishTrack().
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { screenQualityRef.current = screenQuality; }, [screenQuality]);

  // ── Peer state helpers ─────────────────────────────────────────────────────

  /** Patch a single peer's state by participant identity string. */
  const patchPeer = useCallback((identity: string, patch: Partial<PeerUiState>) => {
    const uid = Number(identity);
    if (isNaN(uid)) return;
    setPeersState((prev) => {
      const existing = prev[uid];
      if (!existing) return prev;
      return { ...prev, [uid]: { ...existing, ...patch } };
    });
  }, []);

  /** Rebuild all peer states from the current LiveKit room participants. */
  const rebuildPeers = useCallback((room: Room) => {
    setPeersState(() => {
      const next: Record<number, PeerUiState> = {};
      for (const p of room.remoteParticipants.values()) {
        const uid = Number(p.identity);
        if (!isNaN(uid)) next[uid] = buildPeerState(p);
      }
      return next;
    });
  }, []);

  // ── Deafen volume helper ────────────────────────────────────────────────────

  /** Apply or lift deafen across all current remote audio tracks. */
  const applyDeafenVolume = useCallback((isDeafened: boolean) => {
    const room = livekitRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        // pub.audioTrack is RemoteAudioTrack here; TS union includes LocalAudioTrack, so cast.
        (pub.audioTrack as RemoteAudioTrack | undefined)?.setVolume(isDeafened ? 0 : 1);
      }
    }
  }, []);

  // ── LiveKit room teardown ───────────────────────────────────────────────────

  const teardownLiveKit = useCallback(() => {
    const room = livekitRef.current;
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
      livekitRef.current = null;
    }
    setPeersState({});
    setSharing(false);
    setCameraEnabled(false);
    setSpeaking(false);
    setLocalScreenStream(null);
    setLocalCameraStream(null);
  }, []);

  // ── LiveKit token fetch ─────────────────────────────────────────────────────

  async function fetchToken(roomName: string): Promise<{ token: string; url: string }> {
    const authToken = localStorage.getItem("gwh_token");
    const res = await fetch(
      `${getApiBase()}/api/livekit/token?room=${encodeURIComponent(roomName)}`,
      { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} },
    );
    if (!res.ok) throw new Error(`LiveKit token: ${res.status}`);
    return res.json() as Promise<{ token: string; url: string }>;
  }

  // ── LiveKit room connect ────────────────────────────────────────────────────

  const connectLiveKit = useCallback(
    async (roomName: string): Promise<void> => {
      teardownLiveKit();

      const { token, url } = await fetchToken(roomName);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Explicit 48 kHz — Opus's native sample rate; avoids a resample step.
          sampleRate: 48_000,
          channelCount: 1,         // mono is optimal for voice
        },
        publishDefaults: {
          // Honour the user's chosen quality tier from the moment of connection.
          audioPreset: { maxBitrate: VOICE_PRESETS[voiceQualityRef.current].maxBitrate },
          // DTX (Discontinuous Transmission) saves ~40 % bandwidth during silence
          // but introduces compression artefacts on resume — off for gaming comms.
          dtx: false,
          // RED (redundant audio packets) recovers from up to 1 lost packet
          // per frame with no extra latency — a net win on lossy connections.
          red: true,
          // Prefer VP9 for all published tracks — ~50 % better compression than VP8.
          // Screen share especially benefits: VP9 uses intra-prediction that preserves
          // text sharpness whereas VP8 smears pixels under QP pressure.
          videoCodec: "vp9" as VideoCodec,
        },
      });
      livekitRef.current = room;

      // ── Room event listeners ──────────────────────────────────────────────

      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        const uid = Number(p.identity);
        if (isNaN(uid)) return;
        const { displayName, avatarUrl } = participantMeta(p);
        setPeersState((prev) => ({
          ...prev,
          [uid]: {
            userId: uid,
            username: p.name ?? String(uid),
            displayName,
            avatarUrl,
            muted: !p.isMicrophoneEnabled,
            sharing: false,
            cameraEnabled: false,
            speaking: false,
            connectionState: "new" as RTCPeerConnectionState,
            audioStream: null,
            screenStream: null,
            cameraStream: null,
          },
        }));
      });

      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        const uid = Number(p.identity);
        setPeersState((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
          const ms = track.mediaStream ?? null;
          if (track.kind === Track.Kind.Audio) {
            // Apply current deafen setting to newly subscribed tracks.
            if (deafenedRef.current) (pub.audioTrack as RemoteAudioTrack | undefined)?.setVolume(0);
            patchPeer(p.identity, { audioStream: ms, muted: false });
          } else if (track.kind === Track.Kind.Video) {
            if (pub.source === Track.Source.ScreenShare) {
              patchPeer(p.identity, { screenStream: ms, sharing: true });
            } else if (pub.source === Track.Source.Camera) {
              patchPeer(p.identity, { cameraStream: ms, cameraEnabled: true });
            }
          }
        },
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (_track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
          if (pub.kind === Track.Kind.Audio) {
            patchPeer(p.identity, { audioStream: null });
          } else if (pub.source === Track.Source.ScreenShare) {
            patchPeer(p.identity, { screenStream: null, sharing: false });
          } else if (pub.source === Track.Source.Camera) {
            patchPeer(p.identity, { cameraStream: null, cameraEnabled: false });
          }
        },
      );

      room.on(
        RoomEvent.TrackMuted,
        (pub: RemoteTrackPublication, p: Participant) => {
          // Ignore local participant — we track our own mute state separately.
          if (p.identity === room.localParticipant?.identity) return;
          if (pub.kind === Track.Kind.Audio) {
            patchPeer(p.identity, { muted: true });
          } else if (pub.source === Track.Source.ScreenShare) {
            patchPeer(p.identity, { sharing: false, screenStream: null });
          } else if (pub.source === Track.Source.Camera) {
            patchPeer(p.identity, { cameraEnabled: false, cameraStream: null });
          }
        },
      );

      room.on(
        RoomEvent.TrackUnmuted,
        (pub: RemoteTrackPublication, p: Participant) => {
          if (p.identity === room.localParticipant?.identity) return;
          if (pub.kind === Track.Kind.Audio) {
            const ms = pub.track?.mediaStream ?? null;
            patchPeer(p.identity, { muted: false, audioStream: ms });
          }
        },
      );

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const ids = new Set(speakers.map((s) => s.identity));
        const localId = room.localParticipant?.identity;
        if (localId) setSpeaking(ids.has(localId));
        setPeersState((prev) => {
          const next = { ...prev };
          for (const uid of Object.keys(next)) {
            const n = Number(uid);
            const peer = next[n];
            if (peer) next[n] = { ...peer, speaking: ids.has(String(n)) };
          }
          return next;
        });
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, p: Participant) => {
        // Only patch remote participants; local quality isn't shown in peers list.
        if (p.identity !== room.localParticipant?.identity) {
          patchPeer(p.identity, { connectionState: qualityToConnState(quality) });
        }
      });

      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (!pub.track) return;
        if (pub.source === Track.Source.ScreenShare) {
          const ms = pub.track.mediaStream ?? null;
          setLocalScreenStream(ms);
          setSharing(true);
          // Handle browser "Stop sharing" button.
          pub.track.mediaStreamTrack?.addEventListener("ended", () => {
            void room.localParticipant.setScreenShareEnabled(false);
          });
        } else if (pub.source === Track.Source.Camera) {
          setLocalCameraStream(pub.track.mediaStream ?? null);
          setCameraEnabled(true);
        }
      });

      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) {
          setLocalScreenStream(null);
          setSharing(false);
        } else if (pub.source === Track.Source.Camera) {
          setLocalCameraStream(null);
          setCameraEnabled(false);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        // Only flag a problem if we didn't disconnect intentionally.
        if (activeRoomRef.current && livekitRef.current) {
          setError("Voice disconnected — try rejoining");
          setCanRejoin(true);
        }
      });

      // ── Connect & enable mic ──────────────────────────────────────────────
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(!mutedRef.current);
      rebuildPeers(room);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teardownLiveKit, patchPeer, rebuildPeers],
  );

  // ── WebSocket (call invite + typing) ───────────────────────────────────────

  const wsSend = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const handleServerMessage = useCallback(
    async (msg: any) => {
      switch (msg?.type) {
        case "incoming-call":
          if (!activeRoomRef.current && !incomingCallRef.current) {
            setIncomingCall({ callId: msg.callId, room: msg.room, from: msg.from });
          }
          break;

        case "call-ringing":
          setOutgoingCall((prev) =>
            prev && prev.to.userId === msg.to
              ? { callId: msg.callId, room: msg.room, to: prev.to }
              : prev,
          );
          break;

        case "call-accepted": {
          setOutgoingCall((prev) => {
            if (prev && prev.callId === msg.callId && !activeRoomRef.current) {
              void (async () => {
                const room: ActiveRoom = {
                  kind: "call",
                  room: msg.room,
                  peer: prev.to,
                  title: prev.to.displayName,
                };
                setActiveRoom(room);
                activeRoomRef.current = room;
                try {
                  await connectLiveKit(msg.room);
                } catch {
                  setError("Failed to connect to voice");
                  setActiveRoom(null);
                  activeRoomRef.current = null;
                }
              })();
            }
            return null;
          });
          break;
        }

        case "call-declined":
          setOutgoingCall((prev) => (prev && prev.callId === msg.callId ? null : prev));
          setError("Call declined");
          break;

        case "call-cancelled":
          setIncomingCall((prev) => (prev && prev.callId === msg.callId ? null : prev));
          break;

        case "call-failed":
          setOutgoingCall(null);
          setError(msg.reason === "offline" ? "User is offline" : "Call could not be completed");
          break;

        case "force-leave":
          if (activeRoomRef.current?.room === msg.room) {
            teardownLiveKit();
            setActiveRoom(null);
            activeRoomRef.current = null;
          }
          break;

        case "force-mute":
          if (!mutedRef.current) {
            mutedRef.current = true;
            setMuted(true);
            void livekitRef.current?.localParticipant.setMicrophoneEnabled(false);
          }
          break;

        case "typing":
          window.dispatchEvent(
            new CustomEvent("gwh:typing", {
              detail: {
                conversationId: msg.conversationId,
                userId: msg.userId,
                displayName: msg.displayName,
              },
            }),
          );
          break;

        default:
          break;
      }
    },
    [connectLiveKit, teardownLiveKit],
  );

  const handleServerMessageRef = useRef(handleServerMessage);
  useEffect(() => { handleServerMessageRef.current = handleServerMessage; }, [handleServerMessage]);

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const token = localStorage.getItem("gwh_token");
    if (!token) return;

    const sock = new WebSocket(getSignalingUrl(token));
    wsRef.current = sock;

    sock.onopen = () => setConnected(true);
    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        void handleServerMessageRef.current(msg);
      } catch { /* ignore malformed frames */ }
    };
    sock.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (shouldConnectRef.current) reconnectRef.current = setTimeout(connect, 2000);
    };
    sock.onerror = () => sock.close();
  }, []);

  // Forward outgoing chat typing events → WS.
  useEffect(() => {
    const handler = (e: Event) => wsSend((e as CustomEvent).detail);
    window.addEventListener("gwh:ws-send", handler);
    return () => window.removeEventListener("gwh:ws-send", handler);
  }, [wsSend]);

  useEffect(() => {
    if (!isAuthenticated) return;
    shouldConnectRef.current = true;
    connect();
    return () => {
      shouldConnectRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      teardownLiveKit();
      setActiveRoom(null);
      activeRoomRef.current = null;
      setIncomingCall(null);
      setOutgoingCall(null);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isAuthenticated, connect, teardownLiveKit]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const leaveVoice = useCallback(() => {
    teardownLiveKit();
    setActiveRoom(null);
    activeRoomRef.current = null;
    mutedRef.current = false;
    setMuted(false);
    setCanRejoin(false);
    setError(null);
  }, [teardownLiveKit]);

  const rejoin = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;
    setError(null);
    setCanRejoin(false);
    teardownLiveKit();
    try {
      await connectLiveKit(room.room);
    } catch {
      setError("Failed to reconnect");
      setCanRejoin(true);
    }
  }, [teardownLiveKit, connectLiveKit]);

  const joinPartyVoice = useCallback(
    async (partyId: number, title: string) => {
      setError(null);
      setCanRejoin(false);
      const roomName = `party:${partyId}`;
      if (activeRoomRef.current?.room === roomName) return;
      if (activeRoomRef.current) leaveVoice();
      const room: ActiveRoom = { kind: "party", room: roomName, partyId, title };
      setActiveRoom(room);
      activeRoomRef.current = room;
      try {
        await connectLiveKit(roomName);
      } catch {
        setError("Failed to join voice channel");
        setActiveRoom(null);
        activeRoomRef.current = null;
      }
    },
    [leaveVoice, connectLiveKit],
  );

  const callUser = useCallback(
    (user: CallUser) => {
      setError(null);
      if (activeRoomRef.current) {
        setError("Leave your current channel before starting a call");
        return;
      }
      setOutgoingCall({ callId: `pending-${user.userId}`, room: "", to: user });
      wsSend({ type: "call-invite", to: user.userId });
    },
    [wsSend],
  );

  const acceptCall = useCallback(async () => {
    const call = incomingCallRef.current;
    if (!call) return;
    setIncomingCall(null);
    const room: ActiveRoom = { kind: "call", room: call.room, peer: call.from, title: call.from.displayName };
    setActiveRoom(room);
    activeRoomRef.current = room;
    wsSend({ type: "call-accept", callId: call.callId });
    try {
      await connectLiveKit(call.room);
    } catch {
      setError("Failed to connect to call");
      setActiveRoom(null);
      activeRoomRef.current = null;
    }
  }, [wsSend, connectLiveKit]);

  const declineCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    setIncomingCall(null);
    wsSend({ type: "call-decline", callId: call.callId });
  }, [wsSend]);

  const cancelCall = useCallback(() => {
    setOutgoingCall((prev) => {
      if (prev && !prev.callId.startsWith("pending-")) {
        wsSend({ type: "call-cancel", callId: prev.callId });
      }
      return null;
    });
  }, [wsSend]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    void livekitRef.current?.localParticipant.setMicrophoneEnabled(!next);
  }, []);

  const toggleDeafen = useCallback(() => {
    const nextDeafened = !deafenedRef.current;
    deafenedRef.current = nextDeafened;
    setDeafened(nextDeafened);
    applyDeafenVolume(nextDeafened);

    if (nextDeafened) {
      mutedBeforeDeafenRef.current = mutedRef.current;
      if (!mutedRef.current) {
        mutedRef.current = true;
        setMuted(true);
        void livekitRef.current?.localParticipant.setMicrophoneEnabled(false);
      }
    } else {
      const wasMuted = mutedBeforeDeafenRef.current;
      mutedRef.current = wasMuted;
      setMuted(wasMuted);
      if (!wasMuted) {
        void livekitRef.current?.localParticipant.setMicrophoneEnabled(true);
      }
    }
  }, [applyDeafenVolume]);

  const toggleCamera = useCallback(async () => {
    const room = livekitRef.current;
    if (!room || !activeRoomRef.current) return;
    const next = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
    } catch {
      setError("Camera access denied");
    }
  }, []);

  const remoteMute = useCallback(
    (userId: number) => {
      const room = activeRoomRef.current;
      if (!room) return;
      wsSend({ type: "admin-mute", room: room.room, userId });
    },
    [wsSend],
  );

  const startScreenShare = useCallback(async () => {
    const room = livekitRef.current;
    if (!room || !activeRoomRef.current) return;
    setError(null);
    try {
      const preset = SCREEN_PRESETS[screenQualityRef.current];

      // ── Step 1: capture the screen ourselves ─────────────────────────────────
      // We bypass setScreenShareEnabled() because LiveKit v2 internally hardcodes
      // simulcast for screen share (q + h layers) regardless of simulcast:false.
      // Calling getDisplayMedia + publishTrack directly lets us publish a single
      // encoding with no rid, so the SFU sees only one stream and must forward it.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width:     { ideal: preset.width },
          height:    { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // 'detail' hint: encoder prioritises sharpness (intra prediction) over
      // motion smoothness — exactly right for UI/text screen content.
      videoTrack.contentHint = "detail";
      screenTrackRef.current = videoTrack;

      // Handle browser "Stop sharing" button — mirrors setScreenShareEnabled behaviour.
      videoTrack.addEventListener("ended", () => {
        const r = livekitRef.current;
        if (r && screenTrackRef.current) {
          void r.localParticipant.unpublishTrack(screenTrackRef.current, true);
          screenTrackRef.current = null;
        }
      });

      // ── Step 2: publish with a single encoding — no rid, no simulcast ────────
      // screenShareEncoding sets the RTCRtpEncodingParameters on the lone sender;
      // simulcast:false + empty screenShareSimulcastLayers are belt-and-suspenders.
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        videoCodec: "vp9" as VideoCodec,
        simulcast: false,
        screenShareSimulcastLayers: [],
        screenShareEncoding: {
          maxBitrate:   preset.maxBitrate,
          maxFramerate: preset.frameRate,
          priority:     "high",
        },
      } as TrackPublishOptions);
    } catch {
      setError("Screen share was cancelled");
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    const room = livekitRef.current;
    if (!room) return;
    const track = screenTrackRef.current;
    if (track) {
      void room.localParticipant.unpublishTrack(track, true);
      screenTrackRef.current = null;
    } else {
      // Fallback for any edge case where we lose the track ref.
      void room.localParticipant.setScreenShareEnabled(false);
    }
  }, []);

  const setVoiceQuality = useCallback((q: VoiceQuality) => {
    voiceQualityRef.current = q;
    setVoiceQualityState(q);

    // Apply the new bitrate cap to the live audio sender without re-connecting.
    const room = livekitRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    // Access the underlying RTCRtpSender via the internal LiveKit track object.
    const sender = (pub?.track as unknown as { sender?: RTCRtpSender } | undefined)?.sender;
    if (!sender) return;
    const params = sender.getParameters();
    if (params.encodings?.length) {
      for (const enc of params.encodings) {
        enc.maxBitrate = VOICE_PRESETS[q].maxBitrate;
      }
      void sender.setParameters(params);
    }
  }, []);

  const setScreenQuality = useCallback((q: ScreenQuality) => {
    screenQualityRef.current = q;
    setScreenQualityState(q);

    // Apply the new bitrate cap to the live screen-share sender without stopping.
    const room = livekitRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const sender = (pub?.track as unknown as { sender?: RTCRtpSender } | undefined)?.sender;
    if (!sender) return;
    const preset = SCREEN_PRESETS[q];
    const params = sender.getParameters();
    if (params.encodings?.length) {
      for (const enc of params.encodings) {
        enc.maxBitrate = preset.maxBitrate;
        enc.maxFramerate = preset.frameRate;
        enc.priority = "high";
      }
      void sender.setParameters(params);
    }
  }, []);

  const isInPartyVoice = useCallback(
    (partyId: number) => activeRoom?.kind === "party" && activeRoom.partyId === partyId,
    [activeRoom],
  );

  // Auto-clear transient errors (but hold canRejoin open until acted on).
  useEffect(() => {
    if (!error || canRejoin) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error, canRejoin]);

  const peers = useMemo(() => Object.values(peersState), [peersState]);

  const value: VoiceContextValue = {
    connected,
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
    incomingCall,
    outgoingCall,
    error,
    canRejoin,
    joinPartyVoice,
    leaveVoice,
    rejoin,
    callUser,
    acceptCall,
    declineCall,
    cancelCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    remoteMute,
    startScreenShare,
    stopScreenShare,
    setVoiceQuality,
    setScreenQuality,
    isInPartyVoice,
  };

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {/* LiveKit auto-plays audio; RemoteAudioSink handles deafen-while-absent edge cases */}
      <RemoteAudioSink peers={peers} deafened={deafened} />
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
}
