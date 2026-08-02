/**
 * Auto-updater — checks GitHub Releases for new versions using electron-updater.
 * Runs silently in the background; shows a dialog when a download completes.
 */
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';

export interface UpdaterStatus {
  event:    'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Silent logging — avoid spawning log windows
  autoUpdater.logger = null;
  autoUpdater.autoDownload           = true;
  autoUpdater.autoInstallOnAppQuit   = true;
  autoUpdater.allowDowngrade         = false;
  autoUpdater.allowPrerelease        = false;

  const send = (status: UpdaterStatus) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('updater-status', status);
  };

  autoUpdater.on('checking-for-update',  ()    => send({ event: 'checking' }));
  autoUpdater.on('update-not-available', ()    => send({ event: 'not-available' }));

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({ event: 'available', version: info.version });
    console.log(`[updater] Update available: ${info.version}`);
  });

  autoUpdater.on('download-progress', (p) => {
    send({ event: 'progress', percent: Math.round(p.percent) });
    if (!mainWindow.isDestroyed()) mainWindow.setProgressBar(p.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    if (!mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
    send({ event: 'downloaded', version: info.version });

    dialog.showMessageBox(mainWindow, {
      type:      'info',
      title:     'Update Ready — Game World Hub',
      message:   `Version ${info.version} is ready to install.`,
      detail:    'Restart now to apply the update, or it will install automatically on next launch.',
      buttons:   ['Restart & Install', 'Later'],
      defaultId: 0,
      icon:      require('path').join(__dirname, '..', 'build', 'icon.png'),
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    }).catch(() => {});
  });

  autoUpdater.on('error', (err) => {
    if (!mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
    send({ event: 'error', message: err.message });
    console.error('[updater] Error:', err.message);
  });

  const check = () =>
    autoUpdater.checkForUpdatesAndNotify().catch(err =>
      console.debug('[updater] Check skipped (dev or no internet):', err.message),
    );

  // First check after 10 s (allow app to fully start)
  setTimeout(check, 10_000);
  // Then every 4 hours
  setInterval(check, 4 * 60 * 60 * 1_000);
}
