import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { Peer, getSignalingUrl, fetchIceServers, ICE_SERVERS } from "./webrtc";
import { SpeakingDetector } from "./audio";
import { RemoteAudioSink } from "./components/remote-audio-sink";
import {
  DEFAULT_SCREEN_QUALITY,
  DEFAULT_VOICE_QUALITY,
  SCREEN_PRESETS,
  VOICE_PRESETS,
  type ScreenQuality,
  type VoiceQuality,
} from "./quality";

// ─── Public types ──────────────────────────────────────────────────────────

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

// ─── Provider ────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  // React state (drives rendering)
  const [connected, setConnected] = useState(false);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [peersState, setPeersState] = useState<Record<number, PeerUiState>>({});
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [voiceQuality, setVoiceQualityState] = useState<VoiceQuality>(DEFAULT_VOICE_QUALITY);
  const [screenQuality, setScreenQualityState] = useState<ScreenQuality>(DEFAULT_SCREEN_QUALITY);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True only for the terminal "couldn't reconnect" failure, which offers a
  // one-tap Rejoin. Distinguishes that fatal state from transient errors
  // (e.g. a cancelled screen share) that should just auto-dismiss.
  const [canRejoin, setCanRejoin] = useState(false);

  // Mutable refs (peer plumbing)
  const wsRef = useRef<WebSocket | null>(null);
  const myUserIdRef = useRef<number | null>(null);
  const peersRef = useRef<Map<number, { peer: Peer; info: CallUser }>>(new Map());
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const activeRoomRef = useRef<ActiveRoom | null>(null);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  // Track whether the user was already muted before deafening so we can
  // restore the correct mic state when they un-deafen.
  const mutedBeforeDeafenRef = useRef(false);
  const voiceQualityRef = useRef<VoiceQuality>(DEFAULT_VOICE_QUALITY);
  const screenQualityRef = useRef<ScreenQuality>(DEFAULT_SCREEN_QUALITY);
  const detectorRef = useRef<SpeakingDetector | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnectRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>(ICE_SERVERS);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // ─── Peer UI state helpers ────────────────────────────────────────────────

  const patchPeer = useCallback((userId: number, patch: Partial<PeerUiState>) => {
    setPeersState((prev) => {
      const existing = prev[userId];
      if (!existing) return prev;
      return { ...prev, [userId]: { ...existing, ...patch } };
    });
  }, []);

  // ─── Signaling send ───────────────────────────────────────────────────────

  const wsSend = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const broadcastState = useCallback(() => {
    const room = activeRoomRef.current;
    if (!room) return;
    wsSend({
      type: "state",
      room: room.room,
      muted: mutedRef.current,
      sharing: !!screenStreamRef.current,
      cameraStreamId: cameraStreamRef.current?.id ?? null,
    });
  }, [wsSend]);

  // ─── Speaking detector ────────────────────────────────────────────────────

  const ensureDetector = useCallback(() => {
    if (!detectorRef.current) {
      detectorRef.current = new SpeakingDetector((id, isSpeaking) => {
        if (id === "self") {
          setSpeaking(isSpeaking);
        } else {
          patchPeer(Number(id), { speaking: isSpeaking });
        }
      });
    }
    return detectorRef.current;
  }, [patchPeer]);

  // ─── Local media ──────────────────────────────────────────────────────────

  const ensureMic = useCallback(async (): Promise<MediaStream> => {
    if (micStreamRef.current) return micStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    micStreamRef.current = stream;
    const [track] = stream.getAudioTracks();
    if (track) track.enabled = !mutedRef.current;
    ensureDetector().add("self", stream);
    return stream;
  }, [ensureDetector]);

  // ─── Connection recovery (ICE restart) ────────────────────────────────────

  // How long a peer may sit in `disconnected` before we attempt to heal the
  // path. Short networks blips often recover on their own within a second or
  // two, so we wait before spending an ICE restart.
  const ICE_RESTART_GRACE_MS = 2500;
  const iceRestartTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearIceRestartTimer = useCallback((userId: number) => {
    const t = iceRestartTimersRef.current.get(userId);
    if (t) {
      clearTimeout(t);
      iceRestartTimersRef.current.delete(userId);
    }
  }, []);

  // Bound ICE-restart attempts so a permanently broken path (e.g. no reachable
  // TURN) can't loop forever. We allow a few restarts within a rolling window;
  // exhausting them surfaces a clear failure instead of silently retrying.
  const MAX_ICE_RESTART_ATTEMPTS = 3;
  const ICE_RESTART_WINDOW_MS = 20000;
  const iceRestartAttemptsRef = useRef<Map<number, { count: number; windowStart: number }>>(new Map());

  const clearIceRestartAttempts = useCallback((userId: number) => {
    iceRestartAttemptsRef.current.delete(userId);
  }, []);

  const triggerIceRestart = useCallback(async (userId: number) => {
    const entry = peersRef.current.get(userId);
    if (!entry) return;
    const { peer } = entry;
    // Only the impolite peer initiates, so both sides don't emit competing
    // restart offers for the same broken path.
    if (peer.isPolite) return;
    // The connection may have healed on its own while the grace timer ran.
    const state = peer.pc.connectionState;
    if (state === "connected" || state === "closed") return;

    // Enforce the retry ceiling. The window resets once it has elapsed since the
    // first attempt, so occasional blips spread over time each get a fresh
    // budget rather than accumulating toward a permanent lockout.
    const now = Date.now();
    const record = iceRestartAttemptsRef.current.get(userId);
    if (!record || now - record.windowStart > ICE_RESTART_WINDOW_MS) {
      iceRestartAttemptsRef.current.set(userId, { count: 1, windowStart: now });
    } else if (record.count >= MAX_ICE_RESTART_ATTEMPTS) {
      // Out of attempts within the window — stop looping and tell the user so
      // they can rejoin rather than sitting in a silently-failing call.
      clearIceRestartTimer(userId);
      setError("Couldn't reconnect — try rejoining");
      setCanRejoin(true);
      return;
    } else {
      record.count += 1;
    }

    // Refresh ICE servers (fresh TURN credentials) for the restart, so a path
    // that requires relay can succeed even if the original credentials expired.
    // Best-effort: fall back to the cached list on failure.
    const token = localStorage.getItem("gwh_token");
    let servers = iceServersRef.current;
    if (token) {
      try {
        servers = await fetchIceServers(token);
        iceServersRef.current = servers;
      } catch {
        /* keep cached servers */
      }
      // Peer may have been torn down while we awaited the fetch.
      if (!peersRef.current.has(userId)) return;
    }
    peer.restartIce(servers);
  }, [clearIceRestartTimer]);

  const handlePeerConnectionState = useCallback(
    (userId: number, state: RTCPeerConnectionState) => {
      if (state === "disconnected") {
        // Give the path a chance to recover before restarting.
        if (!iceRestartTimersRef.current.has(userId)) {
          const timer = setTimeout(() => {
            iceRestartTimersRef.current.delete(userId);
            void triggerIceRestart(userId);
          }, ICE_RESTART_GRACE_MS);
          iceRestartTimersRef.current.set(userId, timer);
        }
      } else if (state === "failed") {
        // `failed` won't recover on its own — restart immediately.
        clearIceRestartTimer(userId);
        void triggerIceRestart(userId);
      } else if (state === "connected" || state === "closed") {
        // Recovered (or gone): drop any pending restart and reset the attempt
        // budget so a later blip starts fresh instead of inheriting old counts.
        clearIceRestartTimer(userId);
        clearIceRestartAttempts(userId);
      }
    },
    [triggerIceRestart, clearIceRestartTimer, clearIceRestartAttempts],
  );

  // ─── Peer lifecycle ───────────────────────────────────────────────────────

  const createPeer = useCallback(
    (info: CallUser & { muted?: boolean; sharing?: boolean }, room: string) => {
      if (peersRef.current.has(info.userId)) return;
      const myId = myUserIdRef.current ?? 0;
      const polite = myId > info.userId;

      const peer = new Peer(
        {
          sendSignal: (data) => wsSend({ type: "signal", room, to: info.userId, data }),
          onRemoteAudio: (stream) => {
            patchPeer(info.userId, { audioStream: stream });
            ensureDetector().add(String(info.userId), stream);
          },
          onRemoteScreen: (stream) => patchPeer(info.userId, { screenStream: stream }),
          onRemoteCamera: (stream) => patchPeer(info.userId, { cameraStream: stream }),
          onConnectionStateChange: (state) => {
            patchPeer(info.userId, { connectionState: state });
            handlePeerConnectionState(info.userId, state);
          },
        },
        polite,
        iceServersRef.current,
      );

      peersRef.current.set(info.userId, { peer, info });

      setPeersState((prev) => ({
        ...prev,
        [info.userId]: {
          userId: info.userId,
          username: info.username,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          muted: info.muted ?? false,
          sharing: info.sharing ?? false,
          cameraEnabled: false,
          speaking: false,
          connectionState: "new",
          audioStream: null,
          screenStream: null,
          cameraStream: null,
        },
      }));

      // Attach current local tracks (fires perfect-negotiation offer).
      const mic = micStreamRef.current;
      if (mic) {
        const [track] = mic.getAudioTracks();
        peer.setMicTrack(track ?? null, mic);
        peer.applyAudioBitrate(VOICE_PRESETS[voiceQualityRef.current].maxBitrate);
      }
      const screen = screenStreamRef.current;
      if (screen) {
        const [vtrack] = screen.getVideoTracks();
        if (vtrack) {
          peer.setScreenTrack(vtrack, screen);
          const preset = SCREEN_PRESETS[screenQualityRef.current];
          peer.applyScreenParams(preset.maxBitrate, preset.frameRate);
        }
      }
      const camera = cameraStreamRef.current;
      if (camera) {
        const [cvtrack] = camera.getVideoTracks();
        if (cvtrack) peer.setCameraTrack(cvtrack, camera);
      }
    },
    [wsSend, patchPeer, ensureDetector, handlePeerConnectionState],
  );

  const destroyPeer = useCallback((userId: number) => {
    clearIceRestartTimer(userId);
    clearIceRestartAttempts(userId);
    const entry = peersRef.current.get(userId);
    if (entry) {
      entry.peer.close();
      peersRef.current.delete(userId);
    }
    detectorRef.current?.remove(String(userId));
    setPeersState((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const teardownRoom = useCallback(() => {
    for (const userId of Array.from(peersRef.current.keys())) destroyPeer(userId);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setLocalScreenStream(null);
      setSharing(false);
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      setLocalCameraStream(null);
      setCameraEnabledState(false);
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      detectorRef.current?.remove("self");
      micStreamRef.current = null;
    }
    setSpeaking(false);
    setPeersState({});
  }, [destroyPeer]);

  // ─── Inbound signaling messages ───────────────────────────────────────────

  const handleServerMessage = useCallback(
    async (msg: any) => {
      switch (msg?.type) {
        case "ready":
          myUserIdRef.current = msg.userId;
          break;

        case "joined": {
          for (const peer of msg.peers ?? []) createPeer(peer, msg.room);
          break;
        }

        case "peer-joined":
          createPeer(msg.peer, msg.room);
          break;

        case "peer-left":
          destroyPeer(msg.userId);
          break;

        case "signal": {
          const entry = peersRef.current.get(msg.from);
          if (entry) await entry.peer.handleSignal(msg.data);
          break;
        }

        case "peer-state": {
          patchPeer(msg.userId, {
            muted: !!msg.muted,
            sharing: !!msg.sharing,
            cameraEnabled: !!msg.cameraStreamId,
          });
          // Update the peer's cameraStreamId so ontrack can route video correctly.
          const peerEntry = peersRef.current.get(msg.userId);
          if (peerEntry) peerEntry.peer.setCameraStreamId(msg.cameraStreamId ?? null);
          break;
        }

        case "force-leave":
          // We were evicted because we joined the same room elsewhere.
          if (activeRoomRef.current?.room === msg.room) {
            teardownRoom();
            setActiveRoom(null);
          }
          break;

        case "force-mute":
          // Leader force-muted us — apply mute if not already muted.
          if (!mutedRef.current) {
            mutedRef.current = true;
            setMuted(true);
            const mic = micStreamRef.current;
            if (mic) mic.getAudioTracks().forEach((t) => (t.enabled = false));
            broadcastState();
          }
          break;

        case "incoming-call":
          // Only present the invite if this session is free. A busy session
          // simply ignores it — it must NOT decline, since a decline cancels
          // the call for this user's *other* (possibly free) sessions too. If
          // every session is busy, the caller falls back to the server-side
          // no-answer timeout.
          if (!activeRoomRef.current && !incomingCall) {
            setIncomingCall({ callId: msg.callId, room: msg.room, from: msg.from });
          }
          break;

        case "call-ringing":
          // Server assigned the real callId; reconcile the optimistic state so
          // cancelling routes correctly.
          setOutgoingCall((prev) =>
            prev && prev.to.userId === msg.to
              ? { callId: msg.callId, room: msg.room, to: prev.to }
              : prev,
          );
          break;

        case "call-accepted": {
          setOutgoingCall((prev) => {
            if (prev && prev.callId === msg.callId && !activeRoomRef.current) {
              // Caller side: join the freshly-created call room.
              void (async () => {
                try {
                  await ensureMic();
                } catch {
                  setError("Microphone unavailable");
                }
                const room: ActiveRoom = {
                  kind: "call",
                  room: msg.room,
                  peer: prev.to,
                  title: prev.to.displayName,
                };
                setActiveRoom(room);
                activeRoomRef.current = room;
                wsSend({ type: "join", room: msg.room });
                broadcastState();
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

        case "typing":
          // Relay chat typing events to any listeners (e.g. chat.tsx)
          window.dispatchEvent(new CustomEvent("gwh:typing", {
            detail: { conversationId: msg.conversationId, userId: msg.userId, displayName: msg.displayName },
          }));
          break;

        default:
          break;
      }
    },
    [createPeer, destroyPeer, patchPeer, teardownRoom, ensureMic, wsSend, broadcastState, incomingCall],
  );

  const handleServerMessageRef = useRef(handleServerMessage);
  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // ─── WebSocket connection management ──────────────────────────────────────

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = localStorage.getItem("gwh_token");
    if (!token) return;

    // Refresh ICE servers (STUN + any TURN with fresh credentials) for the
    // peers created during this session. Best-effort: failure falls back to
    // STUN-only inside fetchIceServers.
    void fetchIceServers(token).then((servers) => {
      iceServersRef.current = servers;
    });

    const ws = new WebSocket(getSignalingUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Rejoin an in-progress room after a reconnect.
      const room = activeRoomRef.current;
      if (room) {
        wsSend({ type: "join", room: room.room });
        broadcastState();
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        void handleServerMessageRef.current(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (shouldConnectRef.current) {
        reconnectRef.current = setTimeout(connect, 2000);
      }
    };
    ws.onerror = () => {
      ws.close();
    };
  }, [wsSend, broadcastState]);

  // Forward outgoing chat typing events → WS
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      wsSend(msg);
    };
    window.addEventListener("gwh:ws-send", handler);
    return () => window.removeEventListener("gwh:ws-send", handler);
  }, [wsSend]);

  useEffect(() => {
    if (!isAuthenticated) return;
    shouldConnectRef.current = true;
    connect();
    // Cleanup runs on logout (isAuthenticated flips) or unmount — always fully
    // tear down the socket, media, and call state so nothing lingers.
    return () => {
      shouldConnectRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      teardownRoom();
      setActiveRoom(null);
      activeRoomRef.current = null;
      setIncomingCall(null);
      setOutgoingCall(null);
      wsRef.current?.close();
      wsRef.current = null;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [isAuthenticated, connect, teardownRoom]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const leaveVoice = useCallback(() => {
    const room = activeRoomRef.current;
    if (room) wsSend({ type: "leave", room: room.room });
    teardownRoom();
    setActiveRoom(null);
    activeRoomRef.current = null;
    setCanRejoin(false);
  }, [wsSend, teardownRoom]);

  // One-tap recovery from the terminal "couldn't reconnect" state. Tears down
  // the broken peer connections and re-runs the existing join flow against the
  // *same* room (party voice or 1:1 call), so both sides rebuild the mesh. The
  // leave→join pair resets server-side membership so peers on the other end
  // drop their stale peer objects (peer-left) and recreate them (peer-joined).
  const rejoin = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room) return;
    setError(null);
    setCanRejoin(false);
    for (const userId of Array.from(peersRef.current.keys())) destroyPeer(userId);
    setPeersState({});
    try {
      await ensureMic();
    } catch {
      // The rejoin itself failed before we could re-establish anything —
      // surface a fresh error so the user isn't left staring at a stale panel.
      setError("Microphone access denied");
      setCanRejoin(true);
      return;
    }
    wsSend({ type: "leave", room: room.room });
    wsSend({ type: "join", room: room.room });
    broadcastState();
  }, [destroyPeer, ensureMic, wsSend, broadcastState]);

  const joinPartyVoice = useCallback(
    async (partyId: number, title: string) => {
      setError(null);
      setCanRejoin(false);
      const roomId = `party:${partyId}`;
      if (activeRoomRef.current?.room === roomId) return;
      // Leave any current room first (one active voice session at a time).
      if (activeRoomRef.current) leaveVoice();
      try {
        await ensureMic();
      } catch {
        setError("Microphone access denied");
        return;
      }
      const room: ActiveRoom = { kind: "party", room: roomId, partyId, title };
      setActiveRoom(room);
      activeRoomRef.current = room;
      wsSend({ type: "join", room: roomId });
      broadcastState();
    },
    [ensureMic, leaveVoice, wsSend, broadcastState],
  );

  const callUser = useCallback(
    (user: CallUser) => {
      setError(null);
      if (activeRoomRef.current) {
        setError("Leave your current channel before starting a call");
        return;
      }
      // Optimistic outgoing state; callId is confirmed by `call-ringing`.
      const tempId = `pending-${user.userId}`;
      setOutgoingCall({ callId: tempId, room: "", to: user });
      wsSend({ type: "call-invite", to: user.userId });
    },
    [wsSend],
  );

  const acceptCall = useCallback(async () => {
    const call = incomingCall;
    if (!call) return;
    setIncomingCall(null);
    try {
      await ensureMic();
    } catch {
      setError("Microphone access denied");
      wsSend({ type: "call-decline", callId: call.callId });
      return;
    }
    const room: ActiveRoom = { kind: "call", room: call.room, peer: call.from, title: call.from.displayName };
    setActiveRoom(room);
    activeRoomRef.current = room;
    wsSend({ type: "call-accept", callId: call.callId });
    wsSend({ type: "join", room: call.room });
    broadcastState();
  }, [incomingCall, ensureMic, wsSend, broadcastState]);

  const declineCall = useCallback(() => {
    const call = incomingCall;
    if (!call) return;
    setIncomingCall(null);
    wsSend({ type: "call-decline", callId: call.callId });
  }, [incomingCall, wsSend]);

  const cancelCall = useCallback(() => {
    const call = outgoingCall;
    setOutgoingCall(null);
    if (call && !call.callId.startsWith("pending-")) {
      wsSend({ type: "call-cancel", callId: call.callId });
    }
  }, [outgoingCall, wsSend]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    const mic = micStreamRef.current;
    if (mic) mic.getAudioTracks().forEach((t) => (t.enabled = !next));
    broadcastState();
  }, [broadcastState]);

  /**
   * Deafen: silence ALL incoming audio and force-mute the mic.
   * Un-deafen: resume incoming audio; restore mic to the state it was in
   * before deafening (staying muted if the user was already muted before).
   */
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !deafenedRef.current;
    deafenedRef.current = nextDeafened;
    setDeafened(nextDeafened);

    if (nextDeafened) {
      // Remember current mic state, then force-mute.
      mutedBeforeDeafenRef.current = mutedRef.current;
      if (!mutedRef.current) {
        mutedRef.current = true;
        setMuted(true);
        const mic = micStreamRef.current;
        if (mic) mic.getAudioTracks().forEach((t) => (t.enabled = false));
        broadcastState();
      }
    } else {
      // Restore mic to pre-deafen state.
      const wasMuted = mutedBeforeDeafenRef.current;
      mutedRef.current = wasMuted;
      setMuted(wasMuted);
      const mic = micStreamRef.current;
      if (mic) mic.getAudioTracks().forEach((t) => (t.enabled = !wasMuted));
      broadcastState();
    }
    // RemoteAudioSink will react to the deafened state change automatically.
  }, [broadcastState]);

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setLocalCameraStream(null);
    setCameraEnabledState(false);
    for (const { peer } of peersRef.current.values()) peer.setCameraTrack(null);
    broadcastState();
  }, [broadcastState]);

  const toggleCamera = useCallback(async () => {
    if (!activeRoomRef.current) return;
    if (cameraStreamRef.current) {
      stopCamera();
      return;
    }
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      setError("Camera access denied");
      return;
    }
    cameraStreamRef.current = stream;
    setLocalCameraStream(stream);
    setCameraEnabledState(true);
    const [track] = stream.getVideoTracks();
    if (track) track.addEventListener("ended", stopCamera);
    for (const { peer } of peersRef.current.values()) {
      if (track) peer.setCameraTrack(track, stream);
    }
    broadcastState();
  }, [broadcastState, stopCamera]);

  const remoteMute = useCallback((userId: number) => {
    const room = activeRoomRef.current;
    if (!room) return;
    wsSend({ type: "admin-mute", room: room.room, userId });
  }, [wsSend]);

  const startScreenShare = useCallback(async () => {
    if (!activeRoomRef.current) return;
    setError(null);
    const preset = SCREEN_PRESETS[screenQualityRef.current];
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        },
        audio: false,
      });
    } catch {
      setError("Screen share was cancelled");
      return;
    }
    screenStreamRef.current = stream;
    setLocalScreenStream(stream);
    setSharing(true);

    const [track] = stream.getVideoTracks();
    // Browser "Stop sharing" button ends the track.
    if (track) track.addEventListener("ended", () => stopScreenShare());

    for (const { peer } of peersRef.current.values()) {
      if (track) {
        peer.setScreenTrack(track, stream);
        peer.applyScreenParams(preset.maxBitrate, preset.frameRate);
      }
    }
    broadcastState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastState]);

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setLocalScreenStream(null);
    setSharing(false);
    for (const { peer } of peersRef.current.values()) peer.setScreenTrack(null);
    broadcastState();
  }, [broadcastState]);

  const setVoiceQuality = useCallback((q: VoiceQuality) => {
    voiceQualityRef.current = q;
    setVoiceQualityState(q);
    const bitrate = VOICE_PRESETS[q].maxBitrate;
    for (const { peer } of peersRef.current.values()) peer.applyAudioBitrate(bitrate);
  }, []);

  const setScreenQuality = useCallback(async (q: ScreenQuality) => {
    screenQualityRef.current = q;
    setScreenQualityState(q);
    const preset = SCREEN_PRESETS[q];
    const stream = screenStreamRef.current;
    if (stream) {
      const [track] = stream.getVideoTracks();
      if (track) {
        try {
          await track.applyConstraints({
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: preset.frameRate },
          });
        } catch {
          /* constraints may be rejected; bitrate cap still applies */
        }
      }
      for (const { peer } of peersRef.current.values()) {
        peer.applyScreenParams(preset.maxBitrate, preset.frameRate);
      }
    }
  }, []);

  const isInPartyVoice = useCallback(
    (partyId: number) => activeRoom?.kind === "party" && activeRoom.partyId === partyId,
    [activeRoom],
  );

  // Auto-clear transient errors. The terminal "couldn't reconnect" failure is
  // held open (canRejoin) so its Rejoin action stays available until the user
  // acts or leaves.
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
      <RemoteAudioSink peers={peers} deafened={deafened} />
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
}
