/**
 * Tests for the real WsProvider + useWsFrame hook.
 *
 * The production WsContext code is imported directly; external dependencies
 * (getToken, useAuth, WebSocket, AppState) are mocked so the real React
 * lifecycle — effects, callbacks, refs, cleanup — can be exercised without a
 * live server or device.
 *
 * Covered scenarios:
 *   Initial connection
 *     1. Opens a WebSocket with the correct URL when authenticated
 *     2. Does not open a WebSocket when not authenticated
 *   Message delivery on initial connection
 *     3. global_chat frames reach useWsFrame subscribers
 *     4. global_chat_delete frames reach useWsFrame subscribers
 *   Reconnection via onclose timer
 *     5. Creates a new socket once the 3-s timer fires
 *     6. global_chat frames from the reconnected socket reach subscribers
 *     7. global_chat_delete frames from the reconnected socket reach subscribers
 *     8. Multiple sequential reconnects each deliver frames
 *   AppState-based reconnection (foreground wake)
 *     9.  Reconnects immediately when app returns from background
 *    10. Delivers frames from the socket opened after returning from background
 *    11. Does not reconnect on AppState 'active' after unmount
 *    12. AppState listener is removed when the provider unmounts
 *   Cleanup on unmount
 *    13. Does not reconnect after the provider unmounts
 */

import React from 'react';
import { renderHook, act, configure } from '@testing-library/react';
import { WsProvider, useWsFrame } from '../contexts/WsContext';

// Disable React Strict Mode — it double-invokes effects which is intentional
// by design but makes socket-count assertions non-deterministic in unit tests.
configure({ reactStrictMode: false });

// ── Module mocks — factories must NOT reference outer-scope variables ─────────
// (Jest hoists jest.mock() calls above all variable declarations)

jest.mock('@/lib/auth-token', () => ({
  getToken: jest.fn(() => 'test-jwt-token'),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: true })),
}));

// AppState mock — addEventListener returns a subscription object with remove().
// The factory is self-contained so hoisting doesn't cause reference errors.
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    currentState: 'active',
  },
}));

// ── Typed access to the mocked modules ───────────────────────────────────────

import { useAuth } from '@/contexts/AuthContext';
const mockUseAuth = useAuth as jest.Mock;

import { getToken } from '@/lib/auth-token';
const mockGetToken = getToken as jest.Mock;

import { AppState } from 'react-native';
const mockAddEventListener = AppState.addEventListener as jest.Mock;

// ── WebSocket mock ────────────────────────────────────────────────────────────

class MockWebSocket {
  // Standard WebSocket readyState constants
  static CONNECTING = 0;
  static OPEN       = 1;
  static CLOSING    = 2;
  static CLOSED     = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose:   (() => void) | null = null;
  onerror:   (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() { this.readyState = MockWebSocket.CLOSED; }
  deliver(payload: object) { this.onmessage?.({ data: JSON.stringify(payload) }); }
  drop()   { this.onclose?.(); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(WsProvider, null, children);

function latestWs(): MockWebSocket {
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  if (!ws) throw new Error('No MockWebSocket instances — did connect() run?');
  return ws;
}

/** Returns the AppState 'change' handler registered by the most recent mount. */
function getAppStateChangeHandler(): (state: string) => void {
  const calls = mockAddEventListener.mock.calls;
  const changeCall = [...calls].reverse().find(([event]) => event === 'change');
  if (!changeCall) throw new Error('AppState.addEventListener("change", ...) was never called');
  return changeCall[1] as (state: string) => void;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  MockWebSocket.instances = [];
  (global as any).WebSocket = MockWebSocket;
  process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';

  // Restore implementations that clearAllMocks wiped in the previous afterEach
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
  mockGetToken.mockReturnValue('test-jwt-token');
  mockAddEventListener.mockReturnValue({ remove: jest.fn() });

  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_DOMAIN;
  // clearAllMocks clears call history but preserves mock implementations.
  // resetAllMocks would wipe implementations and break subsequent tests.
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WsProvider — initial connection', () => {
  it('opens a WebSocket with the token-bearing URL when authenticated', () => {
    renderHook(() => useWsFrame('global_chat', jest.fn()), { wrapper });

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(latestWs().url).toContain('wss://test.example.com/api/ws');
    expect(latestWs().url).toContain('token=test-jwt-token');
  });

  it('does not open a WebSocket when the user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    renderHook(() => useWsFrame('global_chat', jest.fn()), { wrapper });

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe('WsProvider — message delivery on initial connection', () => {
  it('delivers global_chat frames to useWsFrame subscribers', () => {
    const received: unknown[] = [];
    renderHook(
      () => useWsFrame('global_chat', (msg) => received.push(msg)),
      { wrapper },
    );

    act(() => {
      latestWs().deliver({
        type: 'global_chat',
        message: { id: 1, content: 'hello', channel: 'general' },
      });
    });

    expect(received).toHaveLength(1);
    expect((received[0] as any).message.id).toBe(1);
  });

  it('delivers global_chat_delete frames to useWsFrame subscribers', () => {
    const deleted: number[] = [];
    renderHook(
      () => useWsFrame('global_chat_delete', (msg: any) => deleted.push(msg.messageId)),
      { wrapper },
    );

    act(() => {
      latestWs().deliver({ type: 'global_chat_delete', messageId: 55 });
    });

    expect(deleted).toEqual([55]);
  });
});

describe('WsProvider — reconnection via onclose timer', () => {
  it('creates a new WebSocket after the 3-s reconnect timer fires', () => {
    renderHook(() => useWsFrame('global_chat', jest.fn()), { wrapper });
    const countBefore = MockWebSocket.instances.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    act(() => { latestWs().drop(); });
    expect(MockWebSocket.instances.length).toBe(countBefore); // timer not yet elapsed

    act(() => { jest.advanceTimersByTime(3_100); });
    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
  });

  it('delivers global_chat frames from the reconnected socket', () => {
    const received: unknown[] = [];
    renderHook(
      () => useWsFrame('global_chat', (msg) => received.push(msg)),
      { wrapper },
    );

    act(() => { latestWs().drop(); });
    act(() => { jest.advanceTimersByTime(3_100); });

    act(() => {
      latestWs().deliver({
        type: 'global_chat',
        message: { id: 42, content: 'after reconnect', channel: 'general' },
      });
    });

    expect(received).toHaveLength(1);
    expect((received[0] as any).message.id).toBe(42);
    expect((received[0] as any).message.content).toBe('after reconnect');
  });

  it('delivers global_chat_delete frames from the reconnected socket', () => {
    const deleted: number[] = [];
    renderHook(
      () => useWsFrame('global_chat_delete', (msg: any) => deleted.push(msg.messageId)),
      { wrapper },
    );

    act(() => { latestWs().drop(); });
    act(() => { jest.advanceTimersByTime(3_100); });

    act(() => {
      latestWs().deliver({ type: 'global_chat_delete', messageId: 99 });
    });

    expect(deleted).toEqual([99]);
  });

  it('chains multiple sequential reconnects — each delivers frames', () => {
    const received: number[] = [];
    renderHook(
      () => useWsFrame('global_chat', (msg: any) => received.push(msg.message.id)),
      { wrapper },
    );

    const base = MockWebSocket.instances.length;

    act(() => { latestWs().drop(); });
    act(() => { jest.advanceTimersByTime(3_100); });
    expect(MockWebSocket.instances.length).toBe(base + 1);

    act(() => { latestWs().drop(); });
    act(() => { jest.advanceTimersByTime(3_100); });
    expect(MockWebSocket.instances.length).toBe(base + 2);

    act(() => {
      latestWs().deliver({ type: 'global_chat', message: { id: 7 } });
    });

    expect(received).toEqual([7]);
  });
});

describe('WsProvider — AppState-based reconnection (foreground wake)', () => {
  it('reconnects immediately when the app returns from background', () => {
    renderHook(() => useWsFrame('global_chat', jest.fn()), { wrapper });

    const countBefore = MockWebSocket.instances.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    const handleAppState = getAppStateChangeHandler();

    // Simulate: phone goes to background then comes back to foreground
    act(() => { handleAppState('background'); });
    expect(MockWebSocket.instances.length).toBe(countBefore); // no change on background

    act(() => { handleAppState('active'); });
    expect(MockWebSocket.instances.length).toBe(countBefore + 1); // immediate reconnect
  });

  it('delivers frames from the socket opened after returning from background', () => {
    const received: unknown[] = [];
    renderHook(
      () => useWsFrame('global_chat', (msg) => received.push(msg)),
      { wrapper },
    );

    const handleAppState = getAppStateChangeHandler();
    act(() => { handleAppState('active'); });

    act(() => {
      latestWs().deliver({
        type: 'global_chat',
        message: { id: 77, content: 'after wake', channel: 'general' },
      });
    });

    expect(received).toHaveLength(1);
    expect((received[0] as any).message.id).toBe(77);
  });

  it('does not reconnect on AppState "active" after the provider unmounts', () => {
    const { unmount } = renderHook(
      () => useWsFrame('global_chat', jest.fn()),
      { wrapper },
    );

    const handleAppState = getAppStateChangeHandler();
    const countAtUnmount = MockWebSocket.instances.length;

    unmount();

    act(() => { handleAppState('active'); });
    expect(MockWebSocket.instances.length).toBe(countAtUnmount);
  });

  it('removes the AppState listener when the provider unmounts', () => {
    // Capture the subscription object returned by addEventListener
    const mockSub = { remove: jest.fn() };
    mockAddEventListener.mockReturnValue(mockSub);

    const { unmount } = renderHook(
      () => useWsFrame('global_chat', jest.fn()),
      { wrapper },
    );

    unmount();

    expect(mockSub.remove).toHaveBeenCalledTimes(1);
  });
});

describe('WsProvider — cleanup on unmount', () => {
  it('does not reconnect via timer after the provider unmounts', () => {
    const { unmount } = renderHook(
      () => useWsFrame('global_chat', jest.fn()),
      { wrapper },
    );

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    const ws = latestWs();
    const countAtUnmount = MockWebSocket.instances.length;

    unmount();

    // onclose fires after unmount — must NOT create a new socket
    act(() => { ws.drop(); });
    act(() => { jest.advanceTimersByTime(3_100); });

    expect(MockWebSocket.instances.length).toBe(countAtUnmount);
  });
});
