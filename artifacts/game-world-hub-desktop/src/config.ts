/**
 * Persistent desktop-app configuration, backed by electron-store.
 * Stores user preferences that survive across launches.
 */
import Store from 'electron-store';
import crypto from 'crypto';

interface StoreSchema {
  /** JWT secret for any local usage (kept for backward compatibility) */
  jwtSecret?: string;
  /** Override URL for the hosted web app */
  hostedUrl?: string;
  /** Whether game detection is enabled (default: true) */
  gameDetectionEnabled?: boolean;
  /** Whether in-game overlay is enabled (default: true) */
  overlayEnabled?: boolean;
}

const store = new Store<StoreSchema>({ name: 'gwh-config' });

/** Returns (or generates) a persistent JWT secret */
export function getJwtSecret(): string {
  let secret = store.get('jwtSecret');
  if (!secret) {
    secret = crypto.randomBytes(48).toString('hex');
    store.set('jwtSecret', secret);
  }
  return secret;
}

/** Optional override for the hosted URL (for enterprise/self-hosted setups) */
export function getHostedUrlOverride(): string | undefined {
  return store.get('hostedUrl');
}

export function setHostedUrlOverride(url: string): void {
  store.set('hostedUrl', url);
}

export function isGameDetectionEnabled(): boolean {
  return store.get('gameDetectionEnabled') ?? true;
}

export function setGameDetectionEnabled(enabled: boolean): void {
  store.set('gameDetectionEnabled', enabled);
}

export function isOverlayEnabled(): boolean {
  return store.get('overlayEnabled') ?? true;
}

export function setOverlayEnabled(enabled: boolean): void {
  store.set('overlayEnabled', enabled);
}
