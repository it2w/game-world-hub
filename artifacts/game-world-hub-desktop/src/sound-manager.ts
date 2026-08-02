/**
 * Sound Manager — plays short notification sounds through the main window's
 * Web Audio API (avoids spawning extra processes).
 *
 * Sound types:
 *   notification  — general alert
 *   friend-join   — a friend came online
 *   message       — new chat message
 *   achievement   — XP/achievement unlocked
 *   game-start    — game detected / party starting
 *   screenshot    — screenshot taken (camera shutter)
 */
import { BrowserWindow, shell } from 'electron';

export type SoundType =
  | 'notification'
  | 'friend-join'
  | 'message'
  | 'achievement'
  | 'game-start'
  | 'screenshot';

export class SoundManager {
  private enabled = true;
  private volume  = 0.6;

  constructor(private mainWindow: BrowserWindow) {}

  play(type: SoundType): void {
    if (!this.enabled) return;
    if (this.mainWindow.isDestroyed()) return;

    // Send to renderer — renderer uses Web Audio API to synthesise the sound
    this.mainWindow.webContents.send('play-sound', { type, volume: this.volume });
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  setVolume(volume: number):   void  { this.volume  = Math.max(0, Math.min(1, volume)); }
  isEnabled():                 boolean { return this.enabled; }
  getVolume():                 number  { return this.volume; }

  /** Fallback: OS beep (works without renderer) */
  beep(): void { try { shell.beep(); } catch {} }
}
