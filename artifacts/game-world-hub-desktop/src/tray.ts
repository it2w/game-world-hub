import { Tray, Menu, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import type { DetectedGame } from './game-detector';

type TrayManagerOptions = {
  onQuit:     () => void;
  onNavigate: (path: string) => void;
};

const STATUS_LABELS: Record<string, string> = {
  online:  '🟢 Online',
  away:    '🟡 Away',
  busy:    '🔴 Busy',
  offline: '⚫ Offline',
};

/**
 * Manages the system tray icon and its context menu.
 * Now also shows the currently detected game.
 */
export class TrayManager {
  private tray:          Tray;
  private mainWindow:    BrowserWindow;
  private options:       TrayManagerOptions;
  private currentStatus  = 'online';
  private currentGame:   DetectedGame | null = null;

  constructor(mainWindow: BrowserWindow, options: TrayManagerOptions) {
    this.mainWindow = mainWindow;
    this.options    = options;

    const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) icon = this.createFallbackIcon();
    } catch {
      icon = this.createFallbackIcon();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Game World Hub');

    this.tray.on('double-click', () => this.showWindow());
    this.tray.on('click',        () => this.showWindow());

    this.buildContextMenu();
  }

  private createFallbackIcon(): Electron.NativeImage {
    const size   = 16;
    const buffer = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const o = i * 4;
      buffer[o] = 0x00; buffer[o+1] = 0xFF; buffer[o+2] = 0x41; buffer[o+3] = 0xFF;
    }
    return nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }

  private showWindow(): void {
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private buildContextMenu(): void {
    const statusLabel = STATUS_LABELS[this.currentStatus] ?? '⚫ Offline';
    const gameLine    = this.currentGame
      ? `🎮 Playing: ${this.currentGame.name}`
      : '🎮 No game detected';

    // Update tooltip to show game
    this.tray.setToolTip(
      this.currentGame
        ? `Game World Hub — ${this.currentGame.name}`
        : 'Game World Hub',
    );

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Game World Hub',  enabled: false },
      { label: `Status: ${statusLabel}`, enabled: false },
      { label: gameLine,          enabled: false },
      { type:  'separator' },
      { label: 'Show Window',  click: () => this.showWindow() },
      { label: 'Hide Window',  click: () => this.mainWindow.hide() },
      { type:  'separator' },
      {
        label: 'Set Status',
        submenu: (
          ['online', 'away', 'busy', 'offline'] as const
        ).map(s => ({
          label:   STATUS_LABELS[s],
          type:    'radio' as const,
          checked: this.currentStatus === s,
          click:   () => this.setStatus(s),
        })),
      },
      { type: 'separator' },
      { label: '👥 Friends',  click: () => this.options.onNavigate('/friends') },
      { label: '🎮 Parties',  click: () => this.options.onNavigate('/parties') },
      { label: '🔍 Find LFG', click: () => this.options.onNavigate('/lfg') },
      { type: 'separator' },
      { label: 'Quit Game World Hub', accelerator: 'CmdOrCtrl+Q', click: () => this.options.onQuit() },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  updateStatusLabel(status: string): void {
    this.currentStatus = status;
    this.buildContextMenu();
  }

  updateCurrentGame(game: DetectedGame | null): void {
    this.currentGame = game;
    this.buildContextMenu();
  }

  private setStatus(status: string): void {
    this.currentStatus = status;
    this.buildContextMenu();
    this.mainWindow.webContents.send('set-status-from-tray', status);
  }

  destroy(): void {
    this.tray.destroy();
  }
}
