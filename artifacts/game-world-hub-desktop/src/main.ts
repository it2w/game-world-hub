import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import windowStateKeeper from 'electron-window-state';
import { TrayManager } from './tray';
import { NotificationPoller } from './notifications';

// ─── Config ────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEV_PORT = process.env.VITE_PORT || '5173';
const API_BASE = process.env.GWH_API_URL || 'http://localhost:8080';

/** URL the BrowserWindow loads */
const WEB_URL = isDev
  ? `http://localhost:${DEV_PORT}`
  : `file://${path.join(__dirname, '..', 'renderer', 'index.html')}`;

// ─── State ─────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;
let notificationPoller: NotificationPoller | null = null;
/** Set to true before programmatic quit so close-to-tray is bypassed */
let isQuitting = false;

// ─── Single Instance Lock ──────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Another instance is already running — hand off and exit
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // A second launch attempted — focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
    // Handle deep link passed via argv (Windows)
    const deepLinkUrl = argv.find(arg => arg.startsWith('gameworldhub://'));
    if (deepLinkUrl) handleDeepLink(deepLinkUrl);
  });
}

// ─── Custom Protocol (gameworldhub://) ─────────────────────────────────────

/** Register custom protocol for deep links. Must be called before app ready. */
function registerProtocol(): void {
  if (process.defaultApp) {
    // Dev mode: electron is the app, pass our script as the first arg
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('gameworldhub', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('gameworldhub');
  }
}

/** Parse a deep-link URL and navigate the renderer to the equivalent path */
function handleDeepLink(url: string): void {
  try {
    // gameworldhub://party/42   → /party/42
    // gameworldhub://friends    → /friends
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
    defaultWidth: 1280,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 600,
    title: 'Game World Hub',
    // Dark background to prevent white flash before page loads
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
    show: false, // shown once 'ready-to-show' fires
    frame: true,
    autoHideMenuBar: true,
  });

  // Persist window state (position + size + maximized)
  windowState.manage(mainWindow);

  mainWindow.loadURL(WEB_URL).catch(err => {
    console.error('[window] failed to load URL:', WEB_URL, err);
  });

  // Show once rendered — avoids white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // Close-to-tray: hide instead of quitting
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the system browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Navigate to devtools with F12
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
  // Renderer sends JWT after login so main process can use it for polling
  ipcMain.on('set-auth-token', (_event, token: string) => {
    notificationPoller?.setToken(token);
  });

  // Renderer clears token on logout
  ipcMain.on('clear-auth-token', () => {
    notificationPoller?.clearToken();
  });

  // Renderer reports current status for tray indicator
  ipcMain.on('set-status', (_event, status: string) => {
    trayManager?.updateStatusLabel(status);
  });

  // Renderer queries app version
  ipcMain.handle('get-app-version', () => app.getVersion());

  // Renderer reads / writes launch-at-startup setting
  ipcMain.handle('get-login-item-settings', () => {
    const settings = app.getLoginItemSettings();
    return { openAtLogin: settings.openAtLogin };
  });

  ipcMain.handle('set-login-item', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin });
    return { openAtLogin };
  });

  // Renderer requests to show/restore the main window
  ipcMain.on('show-window', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

registerProtocol();

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  if (mainWindow) {
    trayManager = new TrayManager(mainWindow, {
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
      onNavigate: (navPath: string) => {
        mainWindow?.webContents.send('navigate', navPath);
        mainWindow?.show();
        mainWindow?.focus();
      },
    });

    notificationPoller = new NotificationPoller(mainWindow, API_BASE);
  }

  // macOS: re-create window if activated with no windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // macOS: handle deep link via open-url event
  app.on('open-url', (_event, url) => handleDeepLink(url));
});

app.on('window-all-closed', () => {
  // On Windows/Linux, quit when all windows closed (unless user chose tray-only)
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  notificationPoller?.stop();
});
