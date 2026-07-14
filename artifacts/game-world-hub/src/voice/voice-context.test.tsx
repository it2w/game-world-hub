import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";

/**
 * Coverage for the one-tap "Rejoin" recovery path.
 *
 * Rejoin is the escape hatch from the terminal "couldn't reconnect" failure:
 * tapping it must tear down the broken peers, re-run leave→join against the same
 * room so both sides rebuild the mesh, and clear the fatal message. A rejoin
 * that fails at the first step (mic unavailable) must surface a fresh error and
 * keep the Rejoin action available. The fatal message must also be held open
 * (never auto-dismissed) for as long as Rejoin is offered.
 *
 * The WebRTC/media layer is faked so these assertions are about the voice
 * context's own lifecycle logic, not a real browser stack: `Peer`, the speaking
 * detector, the audio sink, `WebSocket`, and `getUserMedia` are all stubbed. We
 * drive the peer connection state directly to reach the terminal failure the
 * same way the real ICE-restart-exhaustion path does.
 */

// ─── Hoisted fakes (shared between vi.mock factories and the tests) ──────────

const h = vi.hoisted(() => {
  const peers: FakePeer[] = [];
  const sockets: FakeWebSocket[] = [];

  // Swappable media implementations, reset per test.
  let getUserMediaImpl: () => Promise<unknown> = () => Promise.resolve(makeStream());
  let getDisplayMediaImpl: () => Promise<unknown> = () => Promise.resolve(makeStream());

  function makeStream() {
    return {
      getAudioTracks: () => [{ enabled: true, kind: "audio", stop() {} }],
      getVideoTracks: () => [] as unknown[],
      getTracks: () => [{ stop() {} }],
    };
  }

  class FakePeer {
    cb: any;
    polite: boolean;
    pc: { connectionState: string };
    closed = false;
    constructor(cb: any, polite: boolean) {
      this.cb = cb;
      this.polite = polite;
      this.pc = { connectionState: "new" };
      peers.push(this);
    }
    get isPolite() {
      return this.polite;
    }
    setMicTrack() {}
    applyAudioBitrate() {}
    setScreenTrack() {}
    applyScreenParams() {}
    restartIce() {}
    async handleSignal() {}
    close() {
      this.closed = true;
      this.pc.connectionState = "closed";
    }
  }

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    url: string;
    readyState = 1;
    sent: any[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(data: string) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.());
    }
    /** Test helper: deliver a server frame to the client. */
    emit(msg: unknown) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }

  return {
    peers,
    sockets,
    FakePeer,
    FakeWebSocket,
    makeStream,
    getUserMedia: (...args: unknown[]) => getUserMediaImpl(...(args as [])),
    getDisplayMedia: (...args: unknown[]) => getDisplayMediaImpl(...(args as [])),
    setGetUserMedia: (fn: () => Promise<unknown>) => {
      getUserMediaImpl = fn;
    },
    setGetDisplayMedia: (fn: () => Promise<unknown>) => {
      getDisplayMediaImpl = fn;
    },
    reset: () => {
      peers.length = 0;
      sockets.length = 0;
      getUserMediaImpl = () => Promise.resolve(makeStream());
      getDisplayMediaImpl = () => Promise.resolve(makeStream());
    },
  };
});

vi.mock("./webrtc", () => ({
  Peer: h.FakePeer,
  getSignalingUrl: () => "ws://test/api/ws",
  fetchIceServers: async () => [],
  ICE_SERVERS: [],
}));

vi.mock("./audio", () => ({
  SpeakingDetector: class {
    add() {}
    remove() {}
    close() {}
  },
}));

vi.mock("./components/remote-audio-sink", () => ({
  RemoteAudioSink: () => null,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

// Imported after the mocks are registered.
import { VoiceProvider, useVoice } from "./voice-context";

// ─── Test harness ────────────────────────────────────────────────────────

const MY_ID = 1;
const PEER_ID = 2; // MY_ID < PEER_ID ⇒ we are the impolite peer, which drives ICE restarts.

function peerSummary(id: number) {
  return {
    userId: id,
    username: `u${id}`,
    displayName: `User ${id}`,
    avatarUrl: null,
    muted: false,
    sharing: false,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(VoiceProvider, null, children);
}

/** Render the provider, flush the socket open, and consume the `ready` frame. */
async function mountVoice() {
  const view = renderHook(() => useVoice(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  const ws = h.sockets.at(-1)!;
  act(() => ws.emit({ type: "ready", userId: MY_ID }));
  return { result: view.result, ws, unmount: view.unmount };
}

/**
 * Drive a peer to the terminal "couldn't reconnect" failure the same way the
 * ICE-restart budget being exhausted does: repeated `failed` connection states
 * until the attempt ceiling is crossed.
 */
async function exhaustReconnect(peer: InstanceType<typeof h.FakePeer>) {
  await act(async () => {
    for (let i = 0; i < 4; i++) {
      peer.pc.connectionState = "failed";
      peer.cb.onConnectionStateChange("failed");
    }
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  h.reset();
  localStorage.setItem("gwh_token", "test-token");
  (globalThis as any).WebSocket = h.FakeWebSocket;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: h.getUserMedia, getDisplayMedia: h.getDisplayMedia },
  });
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe("voice rejoin", () => {
  test("destroys stale peers, re-issues leave→join for the same room, and clears the failure", async () => {
    const { result, ws } = await mountVoice();

    await act(async () => {
      await result.current.joinPartyVoice(10, "Squad");
    });
    expect(result.current.activeRoom?.room).toBe("party:10");

    act(() => ws.emit({ type: "joined", room: "party:10", peers: [peerSummary(PEER_ID)] }));
    expect(result.current.peers).toHaveLength(1);
    const peer = h.peers.at(-1)!;

    await exhaustReconnect(peer);
    expect(result.current.error).toBe("Couldn't reconnect — try rejoining");
    expect(result.current.canRejoin).toBe(true);

    const sentBefore = ws.sent.length;

    await act(async () => {
      await result.current.rejoin();
    });

    // Stale peer torn down.
    expect(peer.closed).toBe(true);
    expect(result.current.peers).toHaveLength(0);

    // leave → join re-issued for the SAME room, in that order.
    const after = ws.sent.slice(sentBefore);
    const leaveIdx = after.findIndex((m) => m.type === "leave" && m.room === "party:10");
    const joinIdx = after.findIndex((m) => m.type === "join" && m.room === "party:10");
    expect(leaveIdx).toBeGreaterThanOrEqual(0);
    expect(joinIdx).toBeGreaterThan(leaveIdx);

    // Fatal message cleared.
    expect(result.current.error).toBeNull();
    expect(result.current.canRejoin).toBe(false);
  });

  test("a rejoin that fails immediately (mic unavailable) surfaces a fresh error and keeps Rejoin available", async () => {
    // Microphone is denied for the whole session — the caller enters the call
    // room anyway (documented behaviour), so mic is never cached and rejoin's
    // ensureMic will fail.
    h.setGetUserMedia(() => Promise.reject(new Error("denied")));

    const { result, ws } = await mountVoice();

    // Caller flow: invite → ringing → accepted (mic fails but still joins).
    act(() => {
      result.current.callUser({
        userId: PEER_ID,
        username: "u2",
        displayName: "User 2",
        avatarUrl: null,
      });
    });
    act(() => ws.emit({ type: "call-ringing", callId: "c1", room: "call:c1", to: PEER_ID }));
    await act(async () => {
      ws.emit({ type: "call-accepted", callId: "c1", room: "call:c1" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.activeRoom?.room).toBe("call:c1");

    act(() => ws.emit({ type: "joined", room: "call:c1", peers: [peerSummary(PEER_ID)] }));
    expect(result.current.peers).toHaveLength(1);
    const peer = h.peers.at(-1)!;

    // Reach the terminal failure so Rejoin is genuinely on offer.
    await exhaustReconnect(peer);
    expect(result.current.canRejoin).toBe(true);

    const sentBefore = ws.sent.length;

    await act(async () => {
      await result.current.rejoin();
    });

    // Stale peer still torn down before the failed mic acquisition.
    expect(peer.closed).toBe(true);
    expect(result.current.peers).toHaveLength(0);

    // Fresh error, and Rejoin stays available.
    expect(result.current.error).toBe("Microphone access denied");
    expect(result.current.canRejoin).toBe(true);

    // Aborted before rejoining, so no fresh join frame went out.
    const after = ws.sent.slice(sentBefore);
    expect(after.some((m) => m.type === "join")).toBe(false);
  });

  test("holds the fatal failure message open (never auto-dismissed) while Rejoin is offered", async () => {
    vi.useFakeTimers();

    const { result, ws } = await mountVoice();

    await act(async () => {
      await result.current.joinPartyVoice(10, "Squad");
    });
    act(() => ws.emit({ type: "joined", room: "party:10", peers: [peerSummary(PEER_ID)] }));
    const peer = h.peers.at(-1)!;

    await exhaustReconnect(peer);
    expect(result.current.error).toBe("Couldn't reconnect — try rejoining");
    expect(result.current.canRejoin).toBe(true);

    // Well past the 5s transient-error auto-clear window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    // Still held open with Rejoin offered.
    expect(result.current.error).toBe("Couldn't reconnect — try rejoining");
    expect(result.current.canRejoin).toBe(true);
  });

  test("by contrast, a transient (non-fatal) error auto-dismisses and offers no Rejoin", async () => {
    vi.useFakeTimers();
    h.setGetDisplayMedia(() => Promise.reject(new Error("cancelled")));

    const { result, ws } = await mountVoice();

    await act(async () => {
      await result.current.joinPartyVoice(10, "Squad");
    });
    expect(result.current.activeRoom?.room).toBe("party:10");
    void ws; // room is joined; screen share below produces the transient error

    await act(async () => {
      await result.current.startScreenShare();
    });
    expect(result.current.error).toBe("Screen share was cancelled");
    expect(result.current.canRejoin).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    // Transient errors clear themselves; no Rejoin was ever offered.
    expect(result.current.error).toBeNull();
    expect(result.current.canRejoin).toBe(false);
  });
});
