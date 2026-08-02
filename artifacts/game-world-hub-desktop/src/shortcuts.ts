/**
 * Global Keyboard Shortcuts — work even when the app window is hidden.
 *
 * Ctrl+Shift+G  — Show / hide main window
 * Ctrl+Shift+M  — Toggle mini-player
 * Ctrl+Shift+S  — Capture screenshot → Pictures/GameWorldHub/
 * Ctrl+Shift+N  — Open LFG page
 * Ctrl+Shift+F  — Open Friends page
 */
import { globalShortcut, BrowserWindow } from 'electron';
import type { MiniPlayerManager } from './mini-player';
import type { ScreenshotManager } from './screenshot';

interface ShortcutOptions {
  mainWindow: BrowserWindow;
  miniPlayer: MiniPlayerManager;
  screenshot:  ScreenshotManager;
}

export function registerGlobalShortcuts(opts: ShortcutOptions): void {
  const { mainWindow, miniPlayer, screenshot } = opts;

  const reg = (accel: string, fn: () => void) => {
    const ok = globalShortcut.register(accel, fn);
    if (!ok) console.warn(`[shortcuts] Could not register: ${accel}`);
    else      console.log(`[shortcuts] Registered: ${accel}`);
  };

  // ── Toggle main window ────────────────────────────────────────────────────
  reg('CommandOrControl+Shift+G', () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ── Toggle mini player ────────────────────────────────────────────────────
  reg('CommandOrControl+Shift+M', () => miniPlayer.toggle());

  // ── Screenshot ────────────────────────────────────────────────────────────
  reg('CommandOrControl+Shift+S', async () => {
    const filePath = await screenshot.capture();
    if (filePath) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('screenshot-taken', { path: filePath });
      }
    }
  });

  // ── Quick navigate to LFG ─────────────────────────────────────────────────
  reg('CommandOrControl+Shift+N', () => {
    mainWindow.webContents.send('navigate', '/lfg');
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // ── Quick navigate to Friends ─────────────────────────────────────────────
  reg('CommandOrControl+Shift+F', () => {
    mainWindow.webContents.send('navigate', '/friends');
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
  console.log('[shortcuts] All shortcuts unregistered');
}
