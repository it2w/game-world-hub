/**
 * Splash screen — shown immediately on launch while the app initializes.
 * A frameless centered window that loads assets/splash.html.
 * Call closeSplash() once the main window is ready to show.
 */
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { SPLASH_WIDTH, SPLASH_HEIGHT } from './constants';

let splashWindow: BrowserWindow | null = null;

export function createSplash(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  splashWindow = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x: Math.round((width - SPLASH_WIDTH) / 2),
    y: Math.round((height - SPLASH_HEIGHT) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const splashPath = path.join(__dirname, '..', 'assets', 'splash.html');
  splashWindow.loadFile(splashPath).catch(err => {
    console.error('[splash] failed to load splash.html:', err);
  });

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

export function closeSplash(): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  // Fade out via JS before closing
  splashWindow.webContents
    .executeJavaScript(
      `document.body.style.transition='opacity 0.4s';` +
      `document.body.style.opacity='0';` +
      `setTimeout(()=>window.close(),420);`,
    )
    .catch(() => {
      splashWindow?.close();
    });
}
