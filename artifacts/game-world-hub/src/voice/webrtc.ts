/**
 * Shared URL helpers for the voice layer.
 *
 * The Peer class and ICE-server logic have been removed — media is now handled
 * entirely by LiveKit Cloud.  Only the signaling WebSocket URL builder and the
 * API base resolver remain, both still needed by voice-context.tsx for the
 * lightweight WS connection used for call-invite signaling and typing events.
 */

/** Resolves the HTTP API base URL (browser proxy vs. Electron sidecar). */
export function getApiBase(): string {
  const electronBase = (window as any).electronAPI?.apiBaseUrl;
  if (electronBase) return (electronBase as string).replace(/\/+$/, "");
  return window.location.origin;
}

/**
 * Derives the WebSocket signaling URL for the call-invite / typing channel.
 * In the browser we proxy through the current origin; in Electron we talk to
 * the bundled API server directly.
 */
export function getSignalingUrl(token: string): string {
  const electronBase = (window as any).electronAPI?.apiBaseUrl;
  let base: string;
  if (electronBase) {
    base = (electronBase as string).replace(/^http/i, "ws");
  } else {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${window.location.host}`;
  }
  return `${base.replace(/\/+$/, "")}/api/ws?token=${encodeURIComponent(token)}`;
}
