/**
 * Tests for the real WsProvider + useWsFrame hook.
 *
 * The production WsContext code is imported directly; external dependencies
 * (getToken, useAuth, WebSocket) are mocked so the real React lifecycle —
 * effects, callbacks, refs, cleanup — can be exercised without a live server.
 *
 * Covered scenarios:
 *  1. Initial connect opens a WebSocket with the correct URL when authenticated
 *  2. No connection when the user is not authenticated
 *  3. global_chat frames on the initial socket reach useWsFrame subscribers
 *  4. global_chat_delete frames reach useWsFrame subscribers
 *  5. After onclose, a new socket is created once the 3-s timer fires
 *  6. global_chat frames from the reconnected socket reach subscribers
 *  7. global_chat_delete frames from the reconnected socket reach subscribers
 *  8. Multiple sequential reconnects each deliver frames
 *  9. No reconnect after the provider unmounts
 */

import React from 'react';
import { renderHook, act, configure } from '@testing-library/react';
import { WsProvider, useWsFrame } from '../contexts/WsContext';

// Disable React Strict Mode — it double-invokes effects which is intentional
// by design but makes socket-count assertions non-deterministic in unit tests.
configure({ reactStrictMode: false });

// ── Module mocks — factories must NOT reference outer-scope variables ─────────
// (Jest hoists jest.mock() before variable declarations)

jest.mock('@/lib/auth-token', () => ({
  getToken: jest.fn(() => 'test-jwt-token'),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: true })),
}));

// ── Typed access to the mocked modules ───────────────────────────────────────

import { useAuth } from '@/contexts/AuthContext';
const mockUseAuth = useAuth as jest.Mock;

import { getToken } from '@/lib/auth-token';
const mockGetToken = getToken as jest.Mock;

// ── WebSocket mock ────────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 1; // OPEN
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose:   (() => void) | null = null;
  onerror:   (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() { this.readyState = 3; }
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

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  MockWebSocket.instances = [];
  (global as any).WebSocket = MockWebSocket;
  process.env.EXPO_PUBLIC_DOMAIN = 'test.example.com';
  // Restore implementations cleared by clearAllMocks in afterEach
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
  mockGetToken.mockReturnValue('test-jwt-token');
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

describe('WsProvider — reconnection', () => {
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

  it('chains multiple sequential reconnects — each delivers frames to subscribers', () => {
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

describe('WsProvider — cleanup on unmount', () => {
  it('does not reconnect after the provider unmounts', () => {
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
