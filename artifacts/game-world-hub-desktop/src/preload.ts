/**
 * Preload script — runs in the renderer context with Node.js access,
 * then exposes a safe bridge to the web page via contextBridge.
 *
 * The web app checks for `window.electronAPI` to detect desktop mode.
 */
import { contextBridge, ipcRenderer } from 'electron';

/** Read the bundled API server URL passed via webPreferences.additionalArguments */
function getApiBaseUrl(): string {
  const prefix = '--gwh-api-base=';
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

export type ElectronAPI = {
  /** 'electron' — lets the web app detect it is running in the desktop shell */
  readonly platform: 'electron';

  /** Base URL of the bundled API server (e.g. http://127.0.0.1:53412) */
  readonly apiBaseUrl: string;

  /** Call after successful login to give main process the JWT for notification polling */
  setAuthToken(token: string): void;

  /** Call on logout — stops notification polling in main */
  clearAuthToken(): void;

  /** Report current online status to main (updates tray label) */
  setStatus(status: string): void;

  /**
   * Register a callback for deep-link / tray-driven navigation.
   * The path is an app route like `/party/42` or `/friends`.
   */
  onNavigate(callback: (path: string) => void): () => void;

  /** Returns the Electron app version string */
  getAppVersion(): Promise<string>;

  /** Reads the current "launch at startup" setting */
  getLoginItemSettings(): Promise<{ openAtLogin: boolean }>;

  /** Writes the "launch at startup" setting */
  setLoginItem(openAtLogin: boolean): Promise<{ openAtLogin: boolean }>;
};

// Expose safe subset of Electron APIs to the renderer (web app)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: 'electron',

  apiBaseUrl: getApiBaseUrl(),

  setAuthToken(token: string) {
    ipcRenderer.send('set-auth-token', token);
  },

  clearAuthToken() {
    ipcRenderer.send('clear-auth-token');
  },

  setStatus(status: string) {
    ipcRenderer.send('set-status', status);
  },

  onNavigate(callback: (path: string) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, path: string) => callback(path);
    ipcRenderer.on('navigate', handler);
    // Return unsubscribe function for cleanup
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  getAppVersion(): Promise<string> {
    return ipcRenderer.invoke('get-app-version');
  },

  getLoginItemSettings(): Promise<{ openAtLogin: boolean }> {
    return ipcRenderer.invoke('get-login-item-settings');
  },

  setLoginItem(openAtLogin: boolean): Promise<{ openAtLogin: boolean }> {
    return ipcRenderer.invoke('set-login-item', openAtLogin);
  },
} satisfies ElectronAPI);
