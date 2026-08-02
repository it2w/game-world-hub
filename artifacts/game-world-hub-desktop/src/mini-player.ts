/**
 * Mini Player — a compact always-on-top HUD showing current game/status.
 * Toggle with Ctrl+Shift+M or via tray menu.
 * Clicking the expand button brings the main window to focus.
 */
import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';

export interface MiniPlayerData {
  username?: string | null;
  game?:     string | null;
  status?:   string;
  cpuPct?:   number;
  ramMb?:    number;
}

export class MiniPlayerManager {
  private win:         BrowserWindow | null = null;
  private mainWindow:  BrowserWindow;
  private lastData:    MiniPlayerData = {};

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.syncData();
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.win = new BrowserWindow({
      width:       320,
      height:      96,
      x:           width  - 336,
      y:           height - 116,
      frame:       false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable:   false,
      minimizable: false,
      maximizable: false,
      closable:    true,
      focusable:   false,  // doesn't steal focus from games
      show:        false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,  // needed for ipcRenderer in mini-preload
        preload: path.join(__dirname, 'mini-preload.js'),
      },
    });

    const miniPath = path.join(__dirname, '..', 'assets', 'mini-player.html');
    this.win.loadFile(miniPath).catch(console.error);

    this.win.once('ready-to-show', () => {
      this.win?.show();
      this.syncData();
    });

    this.win.on('closed', () => { this.win = null; });

    // Handle expand / close from mini player buttons
    ipcMain.on('mini-expand', () => {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    ipcMain.on('mini-close', () => this.win?.close());
  }

  hide(): void { this.win?.hide(); }

  toggle(): void {
    if (!this.win || this.win.isDestroyed()) this.show();
    else if (this.win.isVisible())           this.win.hide();
    else                                     this.win.show();
  }

  update(data: Partial<MiniPlayerData>): void {
    this.lastData = { ...this.lastData, ...data };
    this.syncData();
  }

  private syncData(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.win.webContents.send('mini-update', this.lastData);
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }
}
