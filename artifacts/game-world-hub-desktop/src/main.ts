import {
  app, BrowserWindow, desktopCapturer,
  dialog, ipcMain, shell,
} from 'electron';
import path from 'path';
import windowStateKeeper from 'electron-window-state';
import { TrayManager }         from './tray';
import { NotificationPoller }  from './notifications';
import { createSplash, closeSplash } from './splash';
import { GameDetector, type DetectedGame } from './game-detector';
import { ConnectivityMonitor } from './connectivity';
import { showOverlay, destroyOverlay } from './overlay';
import {
  HOSTED_URL, HOSTED_API_BASE,
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
} from './constants';

// ─── Config ────────────────────────────────────────────────────────────────

const isDev    = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEV_PORT = process.env.VITE_PORT ?? '5173';

/** URL the BrowserWindow loads */
const WEB_URL = isDev ? `http://localhost:${DEV_PORT}` : HOSTED_URL;
/** API base for notification polling */
const API_BASE = isDev ? `http://localhost:${DEV_PORT}` : HOSTED_API_BASE;

// ─── State ─────────────────────────────────────────────────────────────────

let mainWindow:          BrowserWindow           | null = null;
let trayManager:         TrayManager             | null = null;
let notificationPoller:  NotificationPoller      | null = null;
let gameDetector:        GameDetector            | null = null;
let connectivityMonitor: ConnectivityMonitor     | null = null;

/** Set to true before programmatic quit so close-to-tray is bypassed */
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
      // Pass the hosted API base to the preload bridge
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
    }, 450); // slight delay for splash fade-out
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
  // Auth token forwarding to notification poller
  ipcMain.on('set-auth-token', (_event, token: string) => {
    notificationPoller?.setToken(token);
  });
  ipcMain.on('clear-auth-token', () => {
    notificationPoller?.clearToken();
  });

  // Status → tray indicator
  ipcMain.on('set-status', (_event, status: string) => {
    trayManager?.updateStatusLabel(status);
  });

  // App metadata
  ipcMain.handle('get-app-version', () => app.getVersion());

  // Launch-at-startup
  ipcMain.handle('get-login-item-settings', () => {
    const settings = app.getLoginItemSettings();
    return { openAtLogin: settings.openAtLogin };
  });
  ipcMain.handle('set-login-item', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin });
    return { openAtLogin };
  });

  // Show window from tray click / notification click
  ipcMain.on('show-window', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  // Connectivity status query
  ipcMain.handle('get-connectivity', () => {
    return connectivityMonitor?.getStatus() ?? 'online';
  });

  // Renderer requests to reload after coming back online
  ipcMain.on('reload-window', () => {
    mainWindow?.webContents.reload();
  });

  // Game detection status query
  ipcMain.handle('get-current-game', () => {
    return gameDetector?.getCurrentGame() ?? null;
  });

  // Renderer triggers an overlay notification directly
  ipcMain.on('show-overlay', (_event, notif) => {
    showOverlay(notif as import('./overlay').OverlayNotification);
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

registerProtocol();

app.whenReady().then(async () => {
  registerIpcHandlers();

  // Show splash immediately
  createSplash();

  // Small pause so splash renders before we do heavier work
  await new Promise(r => setTimeout(r, 200));

  createWindow();

  if (!mainWindow) {
    dialog.showErrorBox('Game World Hub', 'Failed to create the main window.');
    isQuitting = true;
    app.quit();
    return;
  }

  // System tray
  trayManager = new TrayManager(mainWindow, {
    onQuit: () => { isQuitting = true; app.quit(); },
    onNavigate: (navPath: string) => {
      mainWindow?.webContents.send('navigate', navPath);
      mainWindow?.show();
      mainWindow?.focus();
    },
  });

  // Notification polling against the production API
  notificationPoller = new NotificationPoller(mainWindow, API_BASE, showOverlay);

  // Game detection (Windows only) — updates tray label on change
  gameDetector = new GameDetector(mainWindow, (game: DetectedGame | null) => {
    trayManager?.updateCurrentGame(game);
  });
  gameDetector.start();

  // Connectivity monitoring
  connectivityMonitor = new ConnectivityMonitor(mainWindow);
  connectivityMonitor.start();

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
  notificationPoller?.stop();
  gameDetector?.stop();
  connectivityMonitor?.stop();
  destroyOverlay();
});

process.on('exit', () => {
  gameDetector?.stop();
  connectivityMonitor?.stop();
  destroyOverlay();
});
