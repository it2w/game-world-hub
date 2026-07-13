/**
 * Type declarations for the Electron preload bridge.
 *
 * When the web app runs inside the Game World Hub desktop shell,
 * `window.electronAPI` is injected by the preload script.
 * Check `window.electronAPI?.platform === 'electron'` to detect desktop mode.
 */

interface ElectronAPI {
  /** Always 'electron' when running in the desktop shell */
  readonly platform: 'electron';

  /** Send JWT to the main process so it can poll for notifications */
  setAuthToken(token: string): void;

  /** Tell the main process the user has logged out */
  clearAuthToken(): void;

  /** Report current online status (updates the tray menu label) */
  setStatus(status: string): void;

  /**
   * Register a callback that fires when the main process wants the renderer
   * to navigate (e.g. from a deep link or tray menu click).
   * Returns an unsubscribe function.
   */
  onNavigate(callback: (path: string) => void): () => void;

  /** Returns the Electron app version string */
  getAppVersion(): Promise<string>;

  /** Reads the current "launch at startup" setting */
  getLoginItemSettings(): Promise<{ openAtLogin: boolean }>;

  /** Writes the "launch at startup" setting and returns the new value */
  setLoginItem(openAtLogin: boolean): Promise<{ openAtLogin: boolean }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
