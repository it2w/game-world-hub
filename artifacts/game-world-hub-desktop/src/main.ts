import {
  app, BrowserWindow, desktopCapturer,
  dialog, ipcMain, shell,
} from 'electron';
import path from 'path';
import windowStateKeeper from 'electron-window-state';
import { TrayManager }            from './tray';
import { NotificationPoller }     from './notifications';
import { createSplash, closeSplash } from './splash';
import { GameDetector, type DetectedGame } from './game-detector';
import { ConnectivityMonitor }    from './connectivity';
import { showOverlay, destroyOverlay } from './overlay';
import { DiscordRPCManager }      from './discord-rpc';
import { setupAutoUpdater }       from './auto-updater';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { MiniPlayerManager }      from './mini-player';
import { PerfMonitor }            from './perf-monitor';
import { ScreenshotManager }      from './screenshot';
import { SoundManager }           from './sound-manager';
import {
  HOSTED_URL, HOSTED_API_BASE,
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
} from './constants';

// ─── Config ────────────────────────────────────────────────────────────────

const isDev    = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEV_PORT = process.env.VITE_PORT ?? '5173';

const WEB_URL  = isDev ? `http://localhost:${DEV_PORT}` : HOSTED_URL;
const API_BASE = isDev ? `http://localhost:${DEV_PORT}` : HOSTED_API_BASE;

// ─── State ─────────────────────────────────────────────────────────────────

let mainWindow:          BrowserWindow       | null = null;
let trayManager:         TrayManager         | null = null;
let notificationPoller:  NotificationPoller  | null = null;
let gameDetector:        GameDetector        | null = null;
let connectivityMonitor: ConnectivityMonitor | null = null;
let discordRPC:          DiscordRPCManager   | null = null;
let miniPlayer:          MiniPlayerManager   | null = null;
let perfMonitor:         PerfMonitor         | null = null;
let screenshotMgr:       ScreenshotManager   | null = null;
let soundMgr:            SoundManager        | null = null;

let isQuitting = false;

// ─── Single Instance Lock ──────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
    const deepLinkUrl = argv.find(arg => arg.startsWith('gameworldhub://'));
    if (deepLinkUrl) handleDeepLink(deepLinkUrl);
  });
}

// ─── Custom Protocol (gameworldhub://) ─────────────────────────────────────

function registerProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('gameworldhub', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('gameworldhub');
  }
}

function handleDeepLink(url: string): void {
  try {
    const withoutScheme = url.replace('gameworldhub://', '');
    const navPath = '/' + withoutScheme.replace(/^\/+/, '');
    mainWindow?.webContents.send('navigate', navPath);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('[deep-link] failed to handle:', url, err);
  }
}

// ─── Window Creation ────────────────────────────────────────────────────────

function createWindow(): void {
  const windowState = windowStateKeeper({
    defaultWidth:  DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
  });

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width:     windowState.width,
    height:    windowState.height,
    minWidth:  MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title:     'Game World Hub',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
      additionalArguments: [
        `--gwh-api-base=${API_BASE}`,
        `--gwh-platform=electron`,
      ],
    },
    show:            false,
    frame:           true,
    autoHideMenuBar: true,
  });

  windowState.manage(mainWindow);

  // Screen sharing handler
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then(sources => {
          const primary = sources.find(s => s.id.startsWith('screen:')) ?? sources[0];
          callback(primary ? { video: primary } : {});
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );

  mainWindow.loadURL(WEB_URL).catch(err => {
    console.error('[window] failed to load URL:', WEB_URL, err);
  });

  // Close splash and show main window once rendered
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    setTimeout(() => {
      mainWindow?.show();
      if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }, 450);
  });

  // Close-to-tray
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // F12 → DevTools toggle
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────

function registerIpcHandlers(): void {

  // ── Auth ───────────────────────────────────────────────────────────────────
  ipcMain.on('set-auth-token', (_event, token: string) => {
    notificationPoller?.setToken(token);
  });
  ipcMain.on('clear-auth-token', () => {
    notificationPoller?.clearToken();
    discordRPC?.clearUsername();
  });

  // ── Status ─────────────────────────────────────────────────────────────────
  ipcMain.on('set-status', (_event, status: string) => {
    trayManager?.updateStatusLabel(status);
    miniPlayer?.update({ status });
  });

  // ── Username (for Discord RPC & mini-player) ───────────────────────────────
  ipcMain.on('set-username', (_event, username: string) => {
    discordRPC?.setUsername(username);
    miniPlayer?.update({ username });
  });

  // ── App metadata ───────────────────────────────────────────────────────────
  ipcMain.handle('get-app-version', () => app.getVersion());

  // ── Launch at Windows startup ──────────────────────────────────────────────
  ipcMain.handle('get-login-item-settings', () => {
    const settings = app.getLoginItemSettings();
    return { openAtLogin: settings.openAtLogin };
  });
  ipcMain.handle('set-login-item', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin });
    return { openAtLogin };
  });

  // ── Window ─────────────────────────────────────────────────────────────────
  ipcMain.on('show-window', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
  ipcMain.on('reload-window', () => { mainWindow?.webContents.reload(); });

  // ── Connectivity ───────────────────────────────────────────────────────────
  ipcMain.handle('get-connectivity', () => connectivityMonitor?.getStatus() ?? 'online');

  // ── Game detection ─────────────────────────────────────────────────────────
  ipcMain.handle('get-current-game', () => gameDetector?.getCurrentGame() ?? null);

  // ── Overlay ────────────────────────────────────────────────────────────────
  ipcMain.on('show-overlay', (_event, notif) => {
    showOverlay(notif as import('./overlay').OverlayNotification);
  });

  // ── Mini player ────────────────────────────────────────────────────────────
  ipcMain.handle('mini-player-toggle', () => miniPlayer?.toggle());
  ipcMain.handle('mini-player-show',   () => miniPlayer?.show());
  ipcMain.handle('mini-player-hide',   () => miniPlayer?.hide());

  // ── Screenshot ─────────────────────────────────────────────────────────────
  ipcMain.handle('take-screenshot', async (_event, saveDialog: boolean) => {
    if (!screenshotMgr) return null;
    if (saveDialog) return screenshotMgr.captureToDialog();
    return screenshotMgr.capture();
  });
  ipcMain.handle('open-screenshots-folder', () => {
    const dir = require('path').join(app.getPath('pictures'), 'GameWorldHub');
    require('fs').mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  });

  // ── Perf stats ─────────────────────────────────────────────────────────────
  ipcMain.handle('get-perf-snapshot', () => perfMonitor?.getSnapshot() ?? { cpuPercent: 0, ramMb: 0, uptimeSec: 0 });

  // ── Sounds ─────────────────────────────────────────────────────────────────
  ipcMain.on('set-sound-enabled', (_event, enabled: boolean) => soundMgr?.setEnabled(enabled));
  ipcMain.on('set-sound-volume',  (_event, volume: number)   => soundMgr?.setVolume(volume));
  ipcMain.handle('get-sound-settings', () => ({
    enabled: soundMgr?.isEnabled() ?? true,
    volume:  soundMgr?.getVolume()  ?? 0.6,
  }));

  // ── Auto-updater ───────────────────────────────────────────────────────────
  ipcMain.handle('check-for-updates', () => {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch { /* dev mode */ }
  });
  ipcMain.handle('install-update', () => {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.quitAndInstall(false, true);
    } catch { /* dev mode */ }
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

registerProtocol();

app.whenReady().then(async () => {
  registerIpcHandlers();

  createSplash();
  await new Promise(r => setTimeout(r, 200));
  createWindow();

  if (!mainWindow) {
    dialog.showErrorBox('Game World Hub', 'Failed to create the main window.');
    isQuitting = true;
    app.quit();
    return;
  }

  // ── Tray ─────────────────────────────────────────────────────────────────
  trayManager = new TrayManager(mainWindow, {
    onQuit:     () => { isQuitting = true; app.quit(); },
    onNavigate: (navPath: string) => {
      mainWindow?.webContents.send('navigate', navPath);
      mainWindow?.show();
      mainWindow?.focus();
    },
    onMiniPlayer: () => miniPlayer?.toggle(),
    onScreenshot: async () => {
      const p = await screenshotMgr?.capture();
      if (p) soundMgr?.play('screenshot');
    },
  });

  // ── Notification poller ──────────────────────────────────────────────────
  notificationPoller = new NotificationPoller(mainWindow, API_BASE, (notif) => {
    showOverlay(notif);
    soundMgr?.play('notification');
  });

  // ── Game detection ────────────────────────────────────────────────────────
  gameDetector = new GameDetector(mainWindow, (game: DetectedGame | null) => {
    trayManager?.updateCurrentGame(game);
    discordRPC?.setGame(game);
    miniPlayer?.update({ game: game?.name ?? null });
    if (game) soundMgr?.play('game-start');
  });
  gameDetector.start();

  // ── Connectivity ──────────────────────────────────────────────────────────
  connectivityMonitor = new ConnectivityMonitor(mainWindow);
  connectivityMonitor.start();

  // ── Mini player ───────────────────────────────────────────────────────────
  miniPlayer = new MiniPlayerManager(mainWindow);

  // ── Performance monitor ───────────────────────────────────────────────────
  perfMonitor = new PerfMonitor(mainWindow);
  perfMonitor.start(5_000);

  // Forward perf data to mini player too
  mainWindow.webContents.on('ipc-message', (_e, ch, ...args) => {
    if (ch === 'perf-update') miniPlayer?.update({ cpuPct: args[0]?.cpuPercent, ramMb: args[0]?.ramMb });
  });

  // ── Screenshot manager ────────────────────────────────────────────────────
  screenshotMgr = new ScreenshotManager(mainWindow);

  // ── Sound manager ─────────────────────────────────────────────────────────
  soundMgr = new SoundManager(mainWindow);

  // ── Global shortcuts ──────────────────────────────────────────────────────
  registerGlobalShortcuts({ mainWindow, miniPlayer, screenshot: screenshotMgr });

  // ── Discord RPC ───────────────────────────────────────────────────────────
  discordRPC = new DiscordRPCManager();
  discordRPC.connect().catch(() => {}); // non-fatal

  // ── Auto-updater ──────────────────────────────────────────────────────────
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('open-url', (_event, url) => handleDeepLink(url));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterGlobalShortcuts();
  notificationPoller?.stop();
  gameDetector?.stop();
  connectivityMonitor?.stop();
  perfMonitor?.stop();
  miniPlayer?.destroy();
  discordRPC?.destroy().catch(() => {});
  destroyOverlay();
});

process.on('exit', () => {
  gameDetector?.stop();
  connectivityMonitor?.stop();
  perfMonitor?.stop();
  destroyOverlay();
});
