/**
 * Preload script — runs in the renderer context with Node.js access,
 * then exposes a safe bridge to the web page via contextBridge.
 *
 * The web app checks for `window.electronAPI` to detect desktop mode.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DetectedGame }          from './game-detector';
import type { ConnectivityStatus }    from './connectivity';
import type { OverlayNotification }   from './overlay';

/** Read the bundled API server URL passed via webPreferences.additionalArguments */
function getApiBaseUrl(): string {
  const prefix = '--gwh-api-base=';
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

export type ElectronAPI = {
  /** 'electron' — lets the web app detect it is running in the desktop shell */
  readonly platform: 'electron';

  /** Production API base URL (e.g. https://game-world-hub.replit.app) */
  readonly apiBaseUrl: string;

  // ── Auth ──────────────────────────────────────────────────────────────────
  /** Call after successful login to give main process the JWT for notification polling */
  setAuthToken(token: string): void;
  /** Call on logout — stops notification polling in main */
  clearAuthToken(): void;

  // ── Status ────────────────────────────────────────────────────────────────
  /** Report current online status to main (updates tray label) */
  setStatus(status: string): void;

  // ── Navigation ────────────────────────────────────────────────────────────
  /**
   * Register a callback for deep-link / tray-driven navigation.
   * Returns an unsubscribe function.
   */
  onNavigate(callback: (path: string) => void): () => void;

  // ── Window ────────────────────────────────────────────────────────────────
  /** Show and focus the main window */
  showWindow(): void;

  // ── App metadata ──────────────────────────────────────────────────────────
  getAppVersion(): Promise<string>;
  getLoginItemSettings(): Promise<{ openAtLogin: boolean }>;
  setLoginItem(openAtLogin: boolean): Promise<{ openAtLogin: boolean }>;

  // ── Connectivity ──────────────────────────────────────────────────────────
  /** Returns the current connectivity status */
  getConnectivity(): Promise<ConnectivityStatus>;
  /**
   * Register a callback for connectivity changes.
   * Returns an unsubscribe function.
   */
  onConnectivityChange(callback: (status: ConnectivityStatus) => void): () => void;
  /** Register a callback called when connection is restored */
  onConnectivityRestored(callback: () => void): () => void;
  /** Tell the main process to reload the window */
  reloadWindow(): void;

  // ── Game Detection ────────────────────────────────────────────────────────
  /** Returns the currently detected game, or null */
  getCurrentGame(): Promise<DetectedGame | null>;
  /**
   * Register a callback for game changes.
   * Returns an unsubscribe function.
   */
  onGameChange(callback: (game: DetectedGame | null) => void): () => void;

  // ── Overlay ───────────────────────────────────────────────────────────────
  /**
   * Show a gaming-style overlay notification (visible on top of games).
   * The main process renders it in a separate always-on-top window.
   */
  showOverlay(notif: OverlayNotification): void;

  // ── Tray status from tray click ───────────────────────────────────────────
  /** Register a callback for when the user changes status via the tray menu */
  onStatusFromTray(callback: (status: string) => void): () => void;
};

// Helper to create a subscribable IPC listener that returns an unsubscribe fn
function makeListener<T>(channel: string) {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform:   'electron',
  apiBaseUrl: getApiBaseUrl(),

  // Auth
  setAuthToken(token: string)  { ipcRenderer.send('set-auth-token', token); },
  clearAuthToken()             { ipcRenderer.send('clear-auth-token'); },

  // Status
  setStatus(status: string)    { ipcRenderer.send('set-status', status); },

  // Navigation
  onNavigate: makeListener<string>('navigate'),

  // Window
  showWindow() { ipcRenderer.send('show-window'); },

  // App metadata
  getAppVersion():                              Promise<string>           { return ipcRenderer.invoke('get-app-version'); },
  getLoginItemSettings():                       Promise<{ openAtLogin: boolean }> { return ipcRenderer.invoke('get-login-item-settings'); },
  setLoginItem(o: boolean):                     Promise<{ openAtLogin: boolean }> { return ipcRenderer.invoke('set-login-item', o); },

  // Connectivity
  getConnectivity():                            Promise<ConnectivityStatus> { return ipcRenderer.invoke('get-connectivity'); },
  onConnectivityChange: makeListener<ConnectivityStatus>('connectivity-change'),
  onConnectivityRestored: makeListener<void>('connectivity-restored'),
  reloadWindow()                               { ipcRenderer.send('reload-window'); },

  // Game detection
  getCurrentGame():                             Promise<DetectedGame | null> { return ipcRenderer.invoke('get-current-game'); },
  onGameChange: makeListener<DetectedGame | null>('game-change'),

  // Overlay
  showOverlay(notif: OverlayNotification)      { ipcRenderer.send('show-overlay', notif); },

  // Tray → renderer status sync
  onStatusFromTray: makeListener<string>('set-status-from-tray'),

} satisfies ElectronAPI);
