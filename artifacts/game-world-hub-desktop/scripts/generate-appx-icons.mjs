#!/usr/bin/env node
/**
 * Generate the AppX tile assets required by electron-builder / Microsoft Store.
 *
 * Requires:  ImageMagick 7 (magick CLI) — pre-installed on GitHub Actions
 *            windows-latest runners, and available via `winget install ImageMagick`
 *            on developer machines.
 *
 * Usage:
 *   node scripts/generate-appx-icons.mjs
 *
 * Reads:  build/icon.png  (any size; 256×256 minimum recommended)
 * Writes: build/appx/*.png  (all tiles expected by electron-builder)
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');          // artifacts/game-world-hub-desktop
const src       = join(root, 'build', 'icon.png');
const outDir    = join(root, 'build', 'appx');

if (!existsSync(src)) {
  console.error(`Source icon not found: ${src}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const BG = '#0a0a0a';

/**
 * Resize the logo so it fits inside (w × h) with ~20 % padding on each side,
 * then composite it centred on a solid background.
 */
function tile(name, w, h) {
  const pad = Math.round(Math.min(w, h) * 0.20);
  const fit = Math.min(w - pad * 2, h - pad * 2);
  const dst = join(outDir, name);

  // ImageMagick 7 command (magick); falls back to convert for IM 6
  const cmd = [
    'magick',
    `"${src}"`,
    `-resize ${fit}x${fit}`,
    `-background "${BG}"`,
    `-gravity center`,
    `-extent ${w}x${h}`,
    `"${dst}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'inherit' });
  console.log(`  ✓ ${name}  (${w}×${h})`);
}

console.log('Generating AppX tile assets…\n');

tile('StoreLogo.png',          50,  50);
tile('Square44x44Logo.png',    44,  44);
tile('Square150x150Logo.png', 150, 150);
tile('Square310x310Logo.png', 310, 310);
tile('Wide310x150Logo.png',   310, 150);
tile('LargeTile.png',         620, 300);
tile('SplashScreen.png',      620, 300);

console.log('\nDone — assets written to build/appx/');
