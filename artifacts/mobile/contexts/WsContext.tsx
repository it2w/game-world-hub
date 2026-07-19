/**
 * Mobile WebSocket context.
 *
 * Maintains a single authenticated WS connection to /api/ws and exposes
 * a lightweight pub/sub API so any component can subscribe to specific
 * frame types without re-rendering the whole tree.
 *
 * Reconnection strategy:
 *   • onclose → timer fires after 3 s and calls connect() again
 *   • AppState 'active' → immediate reconnect when the app returns from
 *     background/sleep (iOS/Android often kill a backgrounded socket
 *     silently without firing onclose)
 *
 * Currently routed frames:
 *   global_chat        → subscribers notified (new message)
 *   global_chat_delete → subscribers notified (message removed)
 *   message_edit       → subscribers notified (message edited)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getToken } from '@/lib/auth-token';
import { useAuth } from '@/contexts/AuthContext';

type FrameType = 'global_chat' | 'global_chat_delete' | 'message_edit' | string;
type Listener = (msg: unknown) => void;

interface WsContextValue {
  /** Subscribe to a specific WS frame type. Returns an unsubscribe function. */
  subscribe: (type: FrameType, listener: Listener) => () => void;
}

const WsContext = createContext<WsContextValue>({
  subscribe: () => () => {},
});

export function useWs() {
  return useContext(WsContext);
}

/** Subscribe to a single frame type and call `onMessage` on each arrival. */
export function useWsFrame<T = unknown>(
  type: FrameType,
  onMessage: (msg: T) => void,
) {
  const { subscribe } = useWs();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    return subscribe(type, (msg) => onMessageRef.current(msg as T));
  }, [subscribe, type]);
}

export function WsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<FrameType, Set<Listener>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const emit = useCallback((type: FrameType, msg: unknown) => {
    const set = listenersRef.current.get(type);
    if (set) set.forEach((fn) => fn(msg));
  }, []);

  const subscribe = useCallback((type: FrameType, listener: Listener) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(listener);
    return () => {
      listenersRef.current.get(type)?.delete(listener);
    };
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const token = getToken();
    if (!token) return;

    // Close any existing socket so we never have two live connections
    const old = wsRef.current;
    if (old && old.readyState < WebSocket.CLOSING) {
      old.onclose = null; // prevent the onclose handler from scheduling a reconnect
      old.close();
    }

    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;
    const url = `wss://${domain}/api/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg?.type) emit(msg.type, msg);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // Reconnect after 3 s (fallback path — AppState listener handles foreground wakes)
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isAuthenticated) connect();
      }, 3_000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [emit, isAuthenticated]);

  useEffect(() => {
    // Reset mount flag on each effect invocation so Strict Mode's
    // double-fire (cleanup then re-run) doesn't permanently gate connect().
    mountedRef.current = true;

    if (isAuthenticated) {
      connect();
    } else {
      // Not authenticated — close and don't reconnect
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    }

    // Force reconnect when the app returns from background.
    // iOS and Android often silently kill a backgrounded socket without
    // firing onclose, so we can't rely on the error/close path alone.
    const appStateSub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next === 'active' && mountedRef.current && isAuthenticated) {
          connect();
        }
      },
    );

    return () => {
      appStateSub.remove();
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [isAuthenticated, connect]);

  return (
    <WsContext.Provider value={{ subscribe }}>
      {children}
    </WsContext.Provider>
  );
}
