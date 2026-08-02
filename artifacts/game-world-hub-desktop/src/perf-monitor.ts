/**
 * Performance Monitor — samples CPU % and RAM usage every N seconds
 * and sends snapshots to the renderer. Used to show a gaming overlay HUD.
 */
import { BrowserWindow, app } from 'electron';

export interface PerfSnapshot {
  cpuPercent: number;   // total CPU % for all app processes
  ramMb:      number;   // RSS memory in MB
  uptimeSec:  number;   // seconds since app started
}

export class PerfMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private mainWindow: BrowserWindow) {}

  start(intervalMs = 5_000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  getSnapshot(): PerfSnapshot {
    const mem = process.memoryUsage();
    return {
      cpuPercent: 0,
      ramMb:      Math.round(mem.rss / 1024 / 1024),
      uptimeSec:  Math.round(process.uptime()),
    };
  }

  private poll(): void {
    if (this.mainWindow.isDestroyed()) return;
    try {
      const metrics = app.getAppMetrics();
      // Sum CPU across all Electron helper processes
      const cpuPercent = metrics.reduce((sum, m) => sum + (m.cpu?.percentCPUUsage ?? 0), 0);
      const mem = process.memoryUsage();
      const snapshot: PerfSnapshot = {
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        ramMb:      Math.round(mem.rss / 1024 / 1024),
        uptimeSec:  Math.round(process.uptime()),
      };

      this.mainWindow.webContents.send('perf-update', snapshot);
    } catch { /* ignore */ }
  }
}
