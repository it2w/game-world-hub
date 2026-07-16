import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";

/**
 * Coverage for the voice-context lifecycle under LiveKit.
 *
 * Scenarios:
 *  1. Rejoin after unexpected disconnect: old room is torn down, new room is
 *     connected, peers cleared, fatal error cleared.
 *  2. Rejoin that fails (LiveKit connect error): stale room torn down, fresh
 *     error shown, Rejoin kept available.
 *  3. Fatal error (canRejoin=true) is never auto-dismissed by the 5s timer.
 *  4. Transient error (canRejoin=false, e.g. screen-share cancelled) auto-
 *     dismisses after 5 s and never offers Rejoin.
 *
 * livekit-client, WebSocket, fetch, and useAuth are all stubbed.
 */

// ─── Hoisted fakes ────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const rooms: FakeRoom[] = [];
  const sockets: FakeWebSocket[] = [];

  // Per-test control flags (mutated via helpers below).
  let connectReject: Error | null = null;
  let screenShareReject: Error | null = null;

  class FakeLocalParticipant {
    identity = "42";
    isCameraEnabled = false;
    isMicrophoneEnabled = false;
    setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
    setCameraEnabled = vi.fn().mockResolvedValue(undefined);
    // Reads screenShareReject at call-time via closure.
    setScreenShareEnabled = vi.fn().mockImplementation(async (enabled: boolean) => {
      if (enabled && screenShareReject) throw screenShareReject;
    });
  }

  class FakeRoom {
    _listeners = new Map<string, Array<(...a: unknown[]) => void>>();
    remoteParticipants = new Map<string, unknown>();
    localParticipant = new FakeLocalParticipant();
    connectCalled = false;
    disconnectCalled = false;

    constructor() {
      rooms.push(this);
    }

    on(event: string, fn: (...a: unknown[]) => void) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event)!.push(fn);
      return this;
    }
    removeAllListeners() {
      this._listeners.clear();
      return this;
    }
    async connect(_url: string, _token: string) {
      this.connectCalled = true;
      if (connectReject) throw connectReject;
    }
    async disconnect() {
      this.disconnectCalled = true;
    }
    /** Test helper: fire a room event (e.g. "disconnected"). */
    fire(event: string, ...args: unknown[]) {
      const fns = this._listeners.get(event);
      if (fns) for (const fn of fns) fn(...args);
    }
  }

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    url: string;
    readyState = 1;
    sent: unknown[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(data: string) { this.sent.push(JSON.parse(data)); }
    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.());
    }
    emit(msg: unknown) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }

  return {
    rooms,
    sockets,
    FakeRoom,
    FakeWebSocket,
    setConnectReject: (err: Error | null) => { connectReject = err; },
    setScreenShareReject: (err: Error | null) => { screenShareReject = err; },
    reset() {
      rooms.length = 0;
      sockets.length = 0;
      connectReject = null;
      screenShareReject = null;
    },
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("livekit-client", () => {
  // Mirror the real enum string values that voice-context.tsx uses.
  const RoomEvent = {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    ConnectionQualityChanged: "connectionQualityChanged",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    Disconnected: "disconnected",
  };
  const Track = {
    Kind: { Audio: "audio", Video: "video" },
    Source: { Camera: "camera_capture", ScreenShare: "screen_share", Microphone: "microphone" },
  };
  const ConnectionQuality = {
    Excellent: "excellent", Good: "good", Poor: "poor", Lost: "lost", Unknown: "unknown",
  };
  return { Room: h.FakeRoom, RoomEvent, Track, ConnectionQuality };
});

vi.mock("./webrtc", () => ({
  getSignalingUrl: () => "ws://test/api/ws",
  getApiBase: () => "http://test",
}));

vi.mock("./components/remote-audio-sink", () => ({
  RemoteAudioSink: () => null,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

import { VoiceProvider, useVoice } from "./voice-context";

// ─── Test harness ─────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(VoiceProvider, null, children);
}

/** Render the provider, flush WS open + ready frame. */
async function mountVoice() {
  const view = renderHook(() => useVoice(), { wrapper });
  // Let React effects and the WS open microtask settle.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { result: view.result, unmount: view.unmount };
}

/**
 * Join a party voice channel and wait for the LiveKit connection to settle.
 * Returns the FakeRoom that was connected.
 */
async function joinParty(result: ReturnType<typeof renderHook>["result"], partyId = 10) {
  await act(async () => {
    await result.current.joinPartyVoice(partyId, "Squad");
  });
  return h.rooms.at(-1)!;
}

beforeEach(() => {
  h.reset();
  localStorage.setItem("gwh_token", "test-token");
  (globalThis as any).WebSocket = h.FakeWebSocket;
  // Stub fetch for the /api/livekit/token endpoint used inside connectLiveKit.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "fake-lk-token", url: "wss://fake.livekit.cloud" }),
    }),
  );
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("voice rejoin", () => {
  test("tears down the stale LiveKit room, reconnects to the same room, and clears the failure", async () => {
    const { result } = await mountVoice();

    // Join a party voice channel (LiveKit connect succeeds by default).
    const firstRoom = await joinParty(result);
    expect(result.current.activeRoom?.room).toBe("party:10");
    expect(firstRoom.connectCalled).toBe(true);

    // Simulate an unexpected disconnect (network drop etc.).
    act(() => firstRoom.fire("disconnected"));
    expect(result.current.error).toBe("Voice disconnected — try rejoining");
    expect(result.current.canRejoin).toBe(true);

    // Trigger rejoin.
    await act(async () => { await result.current.rejoin(); });

    // Stale room must be torn down.
    expect(firstRoom.disconnectCalled).toBe(true);
    expect(result.current.peers).toHaveLength(0);

    // A fresh room must be connected to the SAME room name.
    expect(h.rooms).toHaveLength(2);
    expect(h.rooms[1].connectCalled).toBe(true);

    // Fatal message cleared.
    expect(result.current.error).toBeNull();
    expect(result.current.canRejoin).toBe(false);
    expect(result.current.activeRoom?.room).toBe("party:10");
  });

  test("a rejoin that fails (LiveKit connect error) surfaces a fresh error and keeps Rejoin available", async () => {
    const { result } = await mountVoice();

    const firstRoom = await joinParty(result);
    expect(result.current.activeRoom?.room).toBe("party:10");

    // Reach the "Voice disconnected" state so Rejoin is on offer.
    act(() => firstRoom.fire("disconnected"));
    expect(result.current.canRejoin).toBe(true);

    // Make the next LiveKit connect() throw.
    h.setConnectReject(new Error("Connection refused"));

    await act(async () => { await result.current.rejoin(); });

    // Stale room was still torn down before the connect attempt failed.
    expect(firstRoom.disconnectCalled).toBe(true);
    expect(result.current.peers).toHaveLength(0);

    // Fresh error shown; Rejoin stays available.
    expect(result.current.error).toBe("Failed to reconnect");
    expect(result.current.canRejoin).toBe(true);

    // A second room was attempted (connect was called on it).
    expect(h.rooms).toHaveLength(2);
    expect(h.rooms[1].connectCalled).toBe(true);
  });

  test("holds the fatal failure message open (never auto-dismissed) while Rejoin is offered", async () => {
    vi.useFakeTimers();

    const { result } = await mountVoice();

    // Need to flush async effects that were deferred before fake timers.
    await act(async () => { await Promise.resolve(); });

    const firstRoom = await joinParty(result);
    act(() => firstRoom.fire("disconnected"));
    expect(result.current.error).toBe("Voice disconnected — try rejoining");
    expect(result.current.canRejoin).toBe(true);

    // Well past the 5 s transient-error auto-clear window.
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    // Still open — fatal errors pinned until the user acts.
    expect(result.current.error).toBe("Voice disconnected — try rejoining");
    expect(result.current.canRejoin).toBe(true);
  });

  test("by contrast, a transient (non-fatal) error auto-dismisses and offers no Rejoin", async () => {
    vi.useFakeTimers();

    // Make screen share throw (user cancels the browser picker).
    h.setScreenShareReject(new Error("Permission denied"));

    const { result } = await mountVoice();
    await act(async () => { await Promise.resolve(); });

    await joinParty(result);
    expect(result.current.activeRoom?.room).toBe("party:10");

    await act(async () => { await result.current.startScreenShare(); });
    expect(result.current.error).toBe("Screen share was cancelled");
    expect(result.current.canRejoin).toBe(false);

    // After 5 s the error auto-clears; Rejoin is never offered.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.error).toBeNull();
    expect(result.current.canRejoin).toBe(false);
  });
});
