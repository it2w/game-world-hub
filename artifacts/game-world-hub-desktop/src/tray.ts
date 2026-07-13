import { Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import path from 'path';

type TrayManagerOptions = {
  onQuit: () => void;
  onNavigate: (path: string) => void;
};

/**
 * Manages the system tray icon and its context menu.
 *
 * Menu layout:
 *   ┌──────────────────────┐
 *   │ ● Game World Hub     │  (app title, non-clickable)
 *   │ Status: Online       │  (current status label)
 *   ├──────────────────────┤
 *   │   Show Window        │
 *   │   Hide Window        │
 *   ├──────────────────────┤
 *   │ Set Status ▶         │
 *   │   ○ Online           │
 *   │   ○ Away             │
 *   │   ○ Busy             │
 *   │   ○ Offline          │
 *   ├──────────────────────┤
 *   │   Open Friends       │
 *   │   Open Parties       │
 *   ├──────────────────────┤
 *   │   Quit               │
 *   └──────────────────────┘
 */
export class TrayManager {
  private tray: Tray;
  private mainWindow: BrowserWindow;
  private options: TrayManagerOptions;
  private currentStatus = 'online';

  constructor(mainWindow: BrowserWindow, options: TrayManagerOptions) {
    this.mainWindow = mainWindow;
    this.options = options;

    // Build tray icon — use built icon in production, fallback to nativeImage in dev
    const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = this.createFallbackIcon();
      }
    } catch {
      icon = this.createFallbackIcon();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Game World Hub');

    // Double-click tray icon → show window
    this.tray.on('double-click', () => {
      this.showWindow();
    });

    this.buildContextMenu();
  }

  /** Creates a minimal 16×16 nativeImage for use as a fallback tray icon */
  private createFallbackIcon(): Electron.NativeImage {
    // 16×16 RGBA green pixel block (simple colored square)
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const offset = i * 4;
      // RGBA: neon green #00FF41
      buffer[offset] = 0x00;     // R
      buffer[offset + 1] = 0xFF; // G
      buffer[offset + 2] = 0x41; // B
      buffer[offset + 3] = 0xFF; // A
    }
    return nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }

  private showWindow(): void {
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private hideWindow(): void {
    this.mainWindow.hide();
  }

  /** Rebuild and set the context menu (called whenever state changes) */
  private buildContextMenu(): void {
    const statusLabel = {
      online: '🟢 Online',
      away: '🟡 Away',
      busy: '🔴 Busy',
      offline: '⚫ Offline',
    }[this.currentStatus] ?? '⚫ Offline';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Game World Hub',
        enabled: false,
      },
      {
        label: `Status: ${statusLabel}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => this.showWindow(),
      },
      {
        label: 'Hide Window',
        click: () => this.hideWindow(),
      },
      { type: 'separator' },
      {
        label: 'Set Status',
        submenu: [
          {
            label: '🟢 Online',
            type: 'radio',
            checked: this.currentStatus === 'online',
            click: () => this.setStatus('online'),
          },
          {
            label: '🟡 Away',
            type: 'radio',
            checked: this.currentStatus === 'away',
            click: () => this.setStatus('away'),
          },
          {
            label: '🔴 Busy',
            type: 'radio',
            checked: this.currentStatus === 'busy',
            click: () => this.setStatus('busy'),
          },
          {
            label: '⚫ Offline',
            type: 'radio',
            checked: this.currentStatus === 'offline',
            click: () => this.setStatus('offline'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: '👥 Friends',
        click: () => this.options.onNavigate('/friends'),
      },
      {
        label: '🎮 Parties',
        click: () => this.options.onNavigate('/parties'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => this.options.onQuit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /** Called from IPC when the renderer reports its online status */
  updateStatusLabel(status: string): void {
    this.currentStatus = status;
    this.buildContextMenu();
  }

  /** Internal: apply status change and notify the renderer via IPC */
  private setStatus(status: string): void {
    this.currentStatus = status;
    this.buildContextMenu();
    // Tell the renderer to apply the status change
    this.mainWindow.webContents.send('set-status-from-tray', status);
  }

  destroy(): void {
    this.tray.destroy();
  }
}
