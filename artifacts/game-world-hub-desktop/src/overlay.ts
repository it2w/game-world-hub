/**
 * In-game Notification Overlay
 *
 * A small frameless always-on-top window that renders gaming-style toast
 * notifications while the user is in a game. Appears in the bottom-right
 * corner, auto-dismisses after OVERLAY_DURATION_MS.
 */
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import {
  OVERLAY_WIDTH,
  OVERLAY_HEIGHT,
  OVERLAY_MARGIN,
  OVERLAY_DURATION_MS,
} from './constants';

export interface OverlayNotification {
  title: string;
  body?: string;
  icon?: 'friend' | 'party' | 'message' | 'info';
  navPath?: string;
}

let overlayWindow: BrowserWindow | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function getBottomRightPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width  - OVERLAY_WIDTH  - OVERLAY_MARGIN,
    y: workArea.y + workArea.height - OVERLAY_HEIGHT - OVERLAY_MARGIN,
  };
}

function getOrCreateOverlay(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const pos = getBottomRightPosition();

  overlayWindow = new BrowserWindow({
    width:  OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    type: process.platform === 'linux' ? 'splash' : 'toolbar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true);

  const overlayPath = path.join(__dirname, '..', 'assets', 'overlay.html');
  overlayWindow.loadFile(overlayPath).catch(err => {
    console.error('[overlay] failed to load overlay.html:', err);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

/**
 * Show a notification overlay toast. Safe to call multiple times — a new
 * call resets the auto-dismiss timer so the user sees the latest notification.
 */
export function showOverlay(notif: OverlayNotification): void {
  const win = getOrCreateOverlay();

  // Reset position in case screen resolution changed
  const pos = getBottomRightPosition();
  win.setPosition(pos.x, pos.y, false);

  // Reset dismiss timer
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  // Send content to the overlay renderer
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('overlay-notify', notif);
  });

  if (win.webContents.isLoading()) {
    // Content will be sent via did-finish-load above
  } else {
    win.webContents.send('overlay-notify', notif);
  }

  win.showInactive();

  dismissTimer = setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents
        .executeJavaScript(
          `document.body.style.transition='opacity 0.4s';` +
          `document.body.style.opacity='0';` +
          `setTimeout(()=>{window.dispatchEvent(new Event('dismiss'))},420);`,
        )
        .catch(() => overlayWindow?.hide());

      setTimeout(() => overlayWindow?.hide(), 900);
    }
    dismissTimer = null;
  }, OVERLAY_DURATION_MS);
}

export function hideOverlay(): void {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  overlayWindow?.hide();
}

export function destroyOverlay(): void {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  overlayWindow = null;
}
