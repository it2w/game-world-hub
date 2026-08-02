/**
 * Screenshot Manager — captures the primary screen and saves to
 * Pictures/GameWorldHub/ with a timestamp filename.
 * Triggered by Ctrl+Shift+S global shortcut.
 */
import { desktopCapturer, shell, app, dialog } from 'electron';
import { BrowserWindow } from 'electron';
import fs   from 'fs';
import path from 'path';

export class ScreenshotManager {
  constructor(private mainWindow: BrowserWindow) {}

  /** Capture primary screen → auto-save → return path. */
  async capture(silent = false): Promise<string | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types:         ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });

      const src = sources[0];
      if (!src) return null;

      const dir = path.join(app.getPath('pictures'), 'GameWorldHub');
      fs.mkdirSync(dir, { recursive: true });

      const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `GWH-${ts}.png`;
      const filePath = path.join(dir, fileName);

      fs.writeFileSync(filePath, src.thumbnail.toPNG());
      console.log(`[screenshot] Saved: ${filePath}`);

      if (!silent) {
        shell.beep();
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('screenshot-taken', { path: filePath, fileName });
        }
      }

      return filePath;
    } catch (err) {
      console.error('[screenshot] Failed:', (err as Error).message);
      return null;
    }
  }

  /** Prompt user with a Save-As dialog then open the folder. */
  async captureToDialog(): Promise<string | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types:         ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      if (!sources[0]) return null;

      const defaultPath = path.join(
        app.getPath('pictures'),
        `GWH-${Date.now()}.png`,
      );

      const { canceled, filePath } = await dialog.showSaveDialog(this.mainWindow, {
        defaultPath,
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });

      if (canceled || !filePath) return null;

      fs.writeFileSync(filePath, sources[0].thumbnail.toPNG());
      shell.openPath(path.dirname(filePath));
      return filePath;
    } catch (err) {
      console.error('[screenshot] Dialog failed:', (err as Error).message);
      return null;
    }
  }
}
