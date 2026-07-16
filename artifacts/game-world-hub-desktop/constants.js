"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONNECTIVITY_CHECK_INTERVAL_MS = exports.GAME_SCAN_INTERVAL_MS = exports.NOTIFICATION_POLL_INTERVAL_MS = exports.OVERLAY_DURATION_MS = exports.OVERLAY_MARGIN = exports.OVERLAY_HEIGHT = exports.OVERLAY_WIDTH = exports.SPLASH_HEIGHT = exports.SPLASH_WIDTH = exports.DEFAULT_HEIGHT = exports.DEFAULT_WIDTH = exports.MIN_HEIGHT = exports.MIN_WIDTH = exports.HOSTED_API_BASE = exports.HOSTED_URL = void 0;
/**
 * Build-time constants for the Game World Hub desktop app.
 *
 * GWH_HOSTED_URL can be overridden at build time via:
 *   GWH_HOSTED_URL=https://your-domain.com pnpm run build:win
 */
exports.HOSTED_URL = process.env.GWH_HOSTED_URL ?? 'https://gmes.app';
exports.HOSTED_API_BASE = `${exports.HOSTED_URL}`;
/** Minimum window dimensions */
exports.MIN_WIDTH = 900;
exports.MIN_HEIGHT = 600;
/** Default window dimensions */
exports.DEFAULT_WIDTH = 1280;
exports.DEFAULT_HEIGHT = 800;
/** Splash window dimensions */
exports.SPLASH_WIDTH = 440;
exports.SPLASH_HEIGHT = 280;
/** Overlay window dimensions (notification toast) */
exports.OVERLAY_WIDTH = 360;
exports.OVERLAY_HEIGHT = 100;
/** Overlay screen margin from edge (px) */
exports.OVERLAY_MARGIN = 20;
/** How long an overlay toast stays visible (ms) */
exports.OVERLAY_DURATION_MS = 5000;
/** How often to poll for notifications (ms) */
exports.NOTIFICATION_POLL_INTERVAL_MS = 15000;
/** How often to scan for running games (ms) */
exports.GAME_SCAN_INTERVAL_MS = 30000;
/** How often to check internet connectivity (ms) */
exports.CONNECTIVITY_CHECK_INTERVAL_MS = 10000;
//# sourceMappingURL=constants.js.map