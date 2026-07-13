import { BrowserWindow, Notification } from 'electron';
import https from 'https';
import http from 'http';

type ApiNotification = {
  id: number;
  type: string;
  title: string;
  body?: string;
  relatedId?: number;
  createdAt: string;
};

/** How often to poll for new notifications (ms) */
const POLL_INTERVAL_MS = 15_000;

/**
 * Polls the Game World Hub API for new notifications and fires
 * native Windows notifications via Electron's Notification API.
 *
 * Lifecycle:
 *  - Created after app is ready and main window exists
 *  - Starts polling only once an auth token is provided via setToken()
 *  - Stops and clears the token on logout (clearToken())
 *  - Permanently stopped on app quit (stop())
 */
export class NotificationPoller {
  private mainWindow: BrowserWindow;
  private apiBase: string;
  private token: string | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private seenIds = new Set<number>();
  private isFirstPoll = true;

  constructor(mainWindow: BrowserWindow, apiBase: string) {
    this.mainWindow = mainWindow;
    this.apiBase = apiBase;
  }

  /** Called by IPC handler after successful login */
  setToken(token: string): void {
    this.token = token;
    this.seenIds.clear();
    this.isFirstPoll = true;
    this.startPolling();
  }

  /** Called by IPC handler on logout */
  clearToken(): void {
    this.token = null;
    this.stopPolling();
    this.seenIds.clear();
    this.isFirstPoll = true;
  }

  /** Permanently stop polling (called on app quit) */
  stop(): void {
    this.stopPolling();
    this.token = null;
  }

  private startPolling(): void {
    if (this.intervalId) return; // already polling
    // Run immediately, then on interval
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.token) return;

    try {
      const notifications = await this.fetchNotifications();

      if (this.isFirstPoll) {
        // On first poll, mark all existing notifications as seen so we only
        // fire native notifications for genuinely new ones going forward
        notifications.forEach(n => this.seenIds.add(n.id));
        this.isFirstPoll = false;
        return;
      }

      // Fire notification for each unseen entry
      for (const notif of notifications) {
        if (!this.seenIds.has(notif.id)) {
          this.seenIds.add(notif.id);
          this.fireNativeNotification(notif);
        }
      }
    } catch (err) {
      // Silently suppress poll errors (network down, 401 after token expiry, etc.)
      if ((err as NodeJS.ErrnoException).message?.includes('401')) {
        this.clearToken(); // token expired — stop polling
      }
    }
  }

  private fetchNotifications(): Promise<ApiNotification[]> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.apiBase}/api/notifications`);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 401) {
              reject(new Error('401 Unauthorized'));
              return;
            }
            if (!res.statusCode || res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(data) as ApiNotification[]);
            } catch {
              reject(new Error('Failed to parse notifications response'));
            }
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy(new Error('Request timed out'));
      });
      req.end();
    });
  }

  private fireNativeNotification(notif: ApiNotification): void {
    if (!Notification.isSupported()) return;

    const { title, navPath } = this.formatNotification(notif);

    const n = new Notification({
      title,
      body: notif.body ?? '',
      silent: false,
    });

    n.on('click', () => {
      // Navigate the renderer to the relevant page
      this.mainWindow.webContents.send('navigate', navPath);
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    n.show();
  }

  private formatNotification(notif: ApiNotification): { title: string; navPath: string } {
    switch (notif.type) {
      case 'friend_request':
        return {
          title: notif.title || 'New Friend Request',
          navPath: '/friends',
        };
      case 'party_invite':
        return {
          title: notif.title || 'Party Invite',
          navPath: notif.relatedId ? `/party/${notif.relatedId}` : '/parties',
        };
      case 'message':
        return {
          title: notif.title || 'New Message',
          navPath: notif.relatedId ? `/chat/${notif.relatedId}` : '/chat',
        };
      default:
        return {
          title: notif.title || 'Game World Hub',
          navPath: '/',
        };
    }
  }
}
