/**
 * Monitors internet connectivity by polling a lightweight DNS lookup.
 * Emits 'online' and 'offline' events to the renderer via IPC.
 *
 * When offline → the renderer shows an offline banner and queues writes.
 * When back online → the renderer reloads the page to re-sync.
 */
import { BrowserWindow } from 'electron';
import dns from 'dns';
import { CONNECTIVITY_CHECK_INTERVAL_MS } from './constants';

export type ConnectivityStatus = 'online' | 'offline';

export class ConnectivityMonitor {
  private mainWindow: BrowserWindow;
  private status: ConnectivityStatus = 'online';
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  start(): void {
    // Run immediately
    this.check();
    this.intervalId = setInterval(() => this.check(), CONNECTIVITY_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStatus(): ConnectivityStatus {
    return this.status;
  }

  private check(): void {
    dns.lookup('8.8.8.8', (err) => {
      const prev = this.status;
      this.status = err ? 'offline' : 'online';

      if (this.status !== prev) {
        console.log(`[connectivity] ${prev} → ${this.status}`);
        this.notify();
      }
    });
  }

  private notify(): void {
    if (this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('connectivity-change', this.status);

    // When coming back online after being offline, reload the page to re-sync
    if (this.status === 'online') {
      // Give the page 1s to handle the event before a hard reload fallback
      setTimeout(() => {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('connectivity-restored');
        }
      }, 1_000);
    }
  }
}
