import { BrowserWindow, Notification } from 'electron';
import https from 'https';
import http  from 'http';
import type { OverlayNotification } from './overlay';
import { NOTIFICATION_POLL_INTERVAL_MS } from './constants';

type ApiNotification = {
  id:        number;
  type:      string;
  title:     string;
  body?:     string;
  relatedId?: number;
  createdAt: string;
};

/**
 * Polls the Game World Hub API for new notifications and fires:
 *   1. Native Windows notifications (always)
 *   2. Gaming overlay toasts (via showOverlay callback)
 */
export class NotificationPoller {
  private mainWindow:   BrowserWindow;
  private apiBase:      string;
  private showOverlay:  (n: OverlayNotification) => void;
  private token:        string | null = null;
  private intervalId:   ReturnType<typeof setInterval> | null = null;
  private seenIds       = new Set<number>();
  private isFirstPoll   = true;

  constructor(
    mainWindow:  BrowserWindow,
    apiBase:     string,
    showOverlay: (n: OverlayNotification) => void,
  ) {
    this.mainWindow  = mainWindow;
    this.apiBase     = apiBase;
    this.showOverlay = showOverlay;
  }

  setToken(token: string): void {
    this.token        = token;
    this.seenIds.clear();
    this.isFirstPoll  = true;
    this.startPolling();
  }

  clearToken(): void {
    this.token = null;
    this.stopPolling();
    this.seenIds.clear();
    this.isFirstPoll = true;
  }

  stop(): void {
    this.stopPolling();
    this.token = null;
  }

  private startPolling(): void {
    if (this.intervalId) return;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), NOTIFICATION_POLL_INTERVAL_MS);
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
        notifications.forEach(n => this.seenIds.add(n.id));
        this.isFirstPoll = false;
        return;
      }

      for (const notif of notifications) {
        if (!this.seenIds.has(notif.id)) {
          this.seenIds.add(notif.id);
          this.fire(notif);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).message?.includes('401')) {
        this.clearToken();
      }
    }
  }

  private fetchNotifications(): Promise<ApiNotification[]> {
    return new Promise((resolve, reject) => {
      const url      = new URL(`${this.apiBase}/api/notifications`);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request(
        {
          hostname: url.hostname,
          port:     url.port || (url.protocol === 'https:' ? 443 : 80),
          path:     url.pathname,
          method:   'GET',
          headers:  {
            Authorization:  `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 401) { reject(new Error('401 Unauthorized')); return; }
            if (!res.statusCode || res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
            try   { resolve(JSON.parse(data) as ApiNotification[]); }
            catch { reject(new Error('Failed to parse notifications')); }
          });
        },
      );

      req.on('error', reject);
      req.setTimeout(8_000, () => req.destroy(new Error('Request timed out')));
      req.end();
    });
  }

  private fire(notif: ApiNotification): void {
    const { title, body, navPath, icon } = this.formatNotification(notif);

    // 1) Native Windows notification
    if (Notification.isSupported()) {
      const n = new Notification({ title, body: body ?? '', silent: false });
      n.on('click', () => {
        this.mainWindow.webContents.send('navigate', navPath);
        this.mainWindow.show();
        this.mainWindow.focus();
      });
      n.show();
    }

    // 2) Gaming overlay toast
    this.showOverlay({ title, body, icon, navPath });

    // 3) Forward to renderer's in-app notification list
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('new-notification', notif);
    }
  }

  private formatNotification(notif: ApiNotification): {
    title: string; body: string | undefined;
    navPath: string; icon: OverlayNotification['icon'];
  } {
    switch (notif.type) {
      case 'friend_request':
        return { title: notif.title || 'New Friend Request', body: notif.body, navPath: '/friends',                                       icon: 'friend' };
      case 'party_invite':
        return { title: notif.title || 'Party Invite',       body: notif.body, navPath: notif.relatedId ? `/party/${notif.relatedId}` : '/parties', icon: 'party' };
      case 'message':
        return { title: notif.title || 'New Message',        body: notif.body, navPath: notif.relatedId ? `/chat/${notif.relatedId}` : '/chat',     icon: 'message' };
      default:
        return { title: notif.title || 'Game World Hub',     body: notif.body, navPath: '/',                                               icon: 'info' };
    }
  }
}
