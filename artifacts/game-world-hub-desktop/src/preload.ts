/**
 * Preload script — runs in the renderer context with Node.js access,
 * then exposes a safe bridge to the web page via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DetectedGame }          from './game-detector';
import type { ConnectivityStatus }    from './connectivity';
import type { OverlayNotification }   from './overlay';
import type { PerfSnapshot }          from './perf-monitor';
import type { UpdaterStatus }         from './auto-updater';
import type { SoundType }             from './sound-manager';

function getApiBaseUrl(): string {
  const prefix = '--gwh-api-base=';
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

export type ElectronAPI = {
  readonly platform:   'electron';
  readonly apiBaseUrl: string;

  // ── Auth ──────────────────────────────────────────────────────────────────
  setAuthToken(token: string):      void;
  clearAuthToken():                 void;
  /** Call after login to enable Discord RPC username & mini-player sync */
  setUsername(username: string):    void;

  // ── Status ────────────────────────────────────────────────────────────────
  setStatus(status: string):        void;

  // ── Navigation ────────────────────────────────────────────────────────────
  onNavigate(callback: (path: string) => void): () => void;

  // ── Window ────────────────────────────────────────────────────────────────
  showWindow():                     void;
  getAppVersion():                  Promise<string>;
  getLoginItemSettings():           Promise<{ openAtLogin: boolean }>;
  setLoginItem(on: boolean):        Promise<{ openAtLogin: boolean }>;

  // ── Connectivity ──────────────────────────────────────────────────────────
  getConnectivity():                Promise<ConnectivityStatus>;
  onConnectivityChange(cb: (s: ConnectivityStatus) => void): () => void;
  onConnectivityRestored(cb: () => void):                    () => void;
  reloadWindow():                   void;

  // ── Game Detection ────────────────────────────────────────────────────────
  getCurrentGame():                 Promise<DetectedGame | null>;
  onGameChange(cb: (g: DetectedGame | null) => void): () => void;

  // ── Overlay ───────────────────────────────────────────────────────────────
  showOverlay(notif: OverlayNotification): void;

  // ── Tray status sync ──────────────────────────────────────────────────────
  onStatusFromTray(cb: (s: string) => void): () => void;

  // ── Mini Player ───────────────────────────────────────────────────────────
  toggleMiniPlayer():               Promise<void>;
  showMiniPlayer():                 Promise<void>;
  hideMiniPlayer():                 Promise<void>;

  // ── Screenshot ────────────────────────────────────────────────────────────
  /** Auto-save to Pictures/GameWorldHub/ */
  takeScreenshot(saveDialog?: boolean): Promise<string | null>;
  openScreenshotsFolder():          Promise<void>;
  onScreenshotTaken(cb: (info: { path: string; fileName?: string }) => void): () => void;

  // ── Performance monitoring ────────────────────────────────────────────────
  getPerfSnapshot():                Promise<PerfSnapshot>;
  onPerfUpdate(cb: (snap: PerfSnapshot) => void): () => void;

  // ── Sounds ────────────────────────────────────────────────────────────────
  /** Play a synthesised notification sound via Web Audio API in this renderer */
  playSound(type: SoundType, volume?: number): void;
  setSoundEnabled(enabled: boolean): void;
  setSoundVolume(volume: number):    void;
  getSoundSettings():               Promise<{ enabled: boolean; volume: number }>;

  // ── Auto-updater ─────────────────────────────────────────────────────────
  checkForUpdates():                Promise<void>;
  installUpdate():                  Promise<void>;
  onUpdaterStatus(cb: (s: UpdaterStatus) => void): () => void;
};

// Helper: create an IPC listener that returns an unsubscribe fn
function makeListener<T>(channel: string) {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

// ── Sound synthesis via Web Audio ──────────────────────────────────────────
//    Called in renderer context so AudioContext is available.
const SOUND_FREQS: Record<string, [number, number, number, string]> = {
  'notification': [880, 1100, 0.08, 'sine'],
  'friend-join':  [523, 659,  0.10, 'sine'],
  'message':      [660, 660,  0.06, 'sine'],
  'achievement':  [523, 1046, 0.12, 'sine'],
  'game-start':   [440, 880,  0.10, 'square'],
  'screenshot':   [1200, 1200, 0.05, 'sine'],
} as any;

let audioCtx: { createOscillator(): any; createGain(): any; destination: any; currentTime: number } | null = null;

function synthesiseSound(type: string, volume: number): void {
  try {
    // AudioContext is available in the renderer (Chromium), not in Node types
    if (!audioCtx) audioCtx = new (globalThis as any).AudioContext() as typeof audioCtx;
    const [startFreq, endFreq, baseGain, waveType] = (SOUND_FREQS as any)[type] ?? (SOUND_FREQS as any)['notification'];
    const ctx = audioCtx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(baseGain * volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.28);
  } catch { /* ignore */ }
}

// ── Listen for play-sound messages from main ───────────────────────────────
ipcRenderer.on('play-sound', (_e, { type, volume }: { type: SoundType; volume: number }) => {
  synthesiseSound(type, volume ?? 0.6);
});

// ── contextBridge ──────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  platform:   'electron',
  apiBaseUrl: getApiBaseUrl(),

  // Auth
  setAuthToken(token: string)  { ipcRenderer.send('set-auth-token', token); },
  clearAuthToken()             { ipcRenderer.send('clear-auth-token'); },
  setUsername(username: string){ ipcRenderer.send('set-username', username); },

  // Status
  setStatus(status: string)    { ipcRenderer.send('set-status', status); },

  // Navigation
  onNavigate: makeListener<string>('navigate'),

  // Window
  showWindow()                                { ipcRenderer.send('show-window'); },
  getAppVersion():          Promise<string>   { return ipcRenderer.invoke('get-app-version'); },
  getLoginItemSettings():   Promise<{ openAtLogin: boolean }> { return ipcRenderer.invoke('get-login-item-settings'); },
  setLoginItem(o: boolean): Promise<{ openAtLogin: boolean }> { return ipcRenderer.invoke('set-login-item', o); },

  // Connectivity
  getConnectivity():        Promise<ConnectivityStatus> { return ipcRenderer.invoke('get-connectivity'); },
  onConnectivityChange:     makeListener<ConnectivityStatus>('connectivity-change'),
  onConnectivityRestored:   makeListener<void>('connectivity-restored'),
  reloadWindow()            { ipcRenderer.send('reload-window'); },

  // Game detection
  getCurrentGame():         Promise<DetectedGame | null> { return ipcRenderer.invoke('get-current-game'); },
  onGameChange:             makeListener<DetectedGame | null>('game-change'),

  // Overlay
  showOverlay(notif: OverlayNotification) { ipcRenderer.send('show-overlay', notif); },

  // Tray → renderer status sync
  onStatusFromTray:         makeListener<string>('set-status-from-tray'),

  // Mini player
  toggleMiniPlayer():       Promise<void> { return ipcRenderer.invoke('mini-player-toggle'); },
  showMiniPlayer():         Promise<void> { return ipcRenderer.invoke('mini-player-show'); },
  hideMiniPlayer():         Promise<void> { return ipcRenderer.invoke('mini-player-hide'); },

  // Screenshot
  takeScreenshot(saveDialog = false): Promise<string | null> { return ipcRenderer.invoke('take-screenshot', saveDialog); },
  openScreenshotsFolder():  Promise<void> { return ipcRenderer.invoke('open-screenshots-folder'); },
  onScreenshotTaken:        makeListener<{ path: string; fileName?: string }>('screenshot-taken'),

  // Performance
  getPerfSnapshot():        Promise<PerfSnapshot> { return ipcRenderer.invoke('get-perf-snapshot'); },
  onPerfUpdate:             makeListener<PerfSnapshot>('perf-update'),

  // Sounds
  playSound(type: SoundType, volume = 0.6) { synthesiseSound(type, volume); },
  setSoundEnabled(enabled: boolean)  { ipcRenderer.send('set-sound-enabled', enabled); },
  setSoundVolume(volume: number)     { ipcRenderer.send('set-sound-volume', volume); },
  getSoundSettings():       Promise<{ enabled: boolean; volume: number }> { return ipcRenderer.invoke('get-sound-settings'); },

  // Auto-updater
  checkForUpdates():        Promise<void>   { return ipcRenderer.invoke('check-for-updates'); },
  installUpdate():          Promise<void>   { return ipcRenderer.invoke('install-update'); },
  onUpdaterStatus:          makeListener<UpdaterStatus>('updater-status'),

} satisfies ElectronAPI);
