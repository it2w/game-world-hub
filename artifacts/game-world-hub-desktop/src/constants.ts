/**
 * Build-time constants for the Game World Hub desktop app.
 *
 * GWH_HOSTED_URL can be overridden at build time via:
 *   GWH_HOSTED_URL=https://your-domain.com pnpm run build:win
 */
export const HOSTED_URL: string =
  process.env.GWH_HOSTED_URL ?? 'https://game-world-hub.replit.app';

export const HOSTED_API_BASE: string = `${HOSTED_URL}`;

/** Minimum window dimensions */
export const MIN_WIDTH  = 900;
export const MIN_HEIGHT = 600;

/** Default window dimensions */
export const DEFAULT_WIDTH  = 1280;
export const DEFAULT_HEIGHT = 800;

/** Splash window dimensions */
export const SPLASH_WIDTH  = 440;
export const SPLASH_HEIGHT = 280;

/** Overlay window dimensions (notification toast) */
export const OVERLAY_WIDTH  = 360;
export const OVERLAY_HEIGHT = 100;

/** Overlay screen margin from edge (px) */
export const OVERLAY_MARGIN = 20;

/** How long an overlay toast stays visible (ms) */
export const OVERLAY_DURATION_MS = 5_000;

/** How often to poll for notifications (ms) */
export const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

/** How often to scan for running games (ms) */
export const GAME_SCAN_INTERVAL_MS = 30_000;

/** How often to check internet connectivity (ms) */
export const CONNECTIVITY_CHECK_INTERVAL_MS = 10_000;
