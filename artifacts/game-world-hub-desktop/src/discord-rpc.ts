/**
 * Discord Rich Presence — shows current game & GWH status in Discord.
 * Gracefully no-ops when Discord is not running or discord-rpc unavailable.
 *
 * To enable: register a Discord application at https://discord.com/developers/applications
 * and set DISCORD_CLIENT_ID in your environment (or replace the default below).
 */
import type { DetectedGame } from './game-detector';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? '1334567890123456789'; // Replace with real ID

export class DiscordRPCManager {
  private rpc:         any = null;
  private connected    = false;
  private currentGame: DetectedGame | null = null;
  private username:    string | null = null;
  private startTime    = Date.now();
  private retryTimer:  ReturnType<typeof setTimeout> | null = null;
  private destroyed    = false;

  async connect(): Promise<void> {
    if (this.destroyed || this.connected) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Client } = require('discord-rpc') as any;
      this.rpc = new Client({ transport: 'ipc' });

      this.rpc.on('ready', () => {
        if (this.destroyed) { this.rpc?.destroy().catch(() => {}); return; }
        this.connected = true;
        console.log('[discord-rpc] Connected');
        this.updatePresence();
      });

      this.rpc.on('disconnected', () => {
        this.connected = false;
        console.log('[discord-rpc] Disconnected — will retry');
        if (!this.destroyed) this.scheduleRetry(30_000);
      });

      await this.rpc.login({ clientId: CLIENT_ID });
    } catch (err) {
      console.debug('[discord-rpc] Not available:', (err as Error).message);
      if (!this.destroyed) this.scheduleRetry(60_000);
    }
  }

  private scheduleRetry(ms: number): void {
    if (this.retryTimer || this.destroyed) return;
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (!this.destroyed) await this.connect();
    }, ms);
  }

  /** Called when the detected game changes. */
  setGame(game: DetectedGame | null): void {
    this.currentGame = game;
    if (this.connected) this.updatePresence();
  }

  /** Called after login — syncs username into the presence. */
  setUsername(username: string): void {
    this.username = username;
    if (this.connected) this.updatePresence();
  }

  clearUsername(): void {
    this.username = null;
    if (this.connected) this.updatePresence();
  }

  private updatePresence(): void {
    if (!this.rpc || !this.connected) return;
    try {
      const presence: Record<string, unknown> = {
        startTimestamp: this.startTime,
        largeImageKey:  'gwh_logo',
        largeImageText: 'Game World Hub',
        instance:       false,
        buttons: [
          { label: '🎮 Join Game World Hub', url: 'https://gmes.app' },
        ],
      };

      if (this.currentGame) {
        presence.details       = `🎮 ${this.currentGame.name}`;
        presence.state         = this.username ? `Playing as ${this.username}` : 'Playing on GWH';
        presence.smallImageKey = 'gwh_logo';
        presence.smallImageText= `Genre: ${this.currentGame.genre}`;
      } else {
        presence.details = '🌐 Browsing Game World Hub';
        presence.state   = this.username ? `as ${this.username}` : 'Ready to play';
      }

      this.rpc.setActivity(presence).catch(() => {});
    } catch { /* ignore */ }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.rpc) { try { await this.rpc.destroy(); } catch {} this.rpc = null; }
    this.connected = false;
  }
}
