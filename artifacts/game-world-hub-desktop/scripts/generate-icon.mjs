/**
 * Generates a placeholder app icon (icon.png + icon.ico) in build/.
 *
 * Uses ImageMagick (magick) if available, otherwise falls back to a
 * minimal PNG Buffer written directly. Replace build/icon.png and
 * build/icon.ico with your final branded assets before shipping.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, '..', 'build');

if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });

const pngOut = join(buildDir, 'icon.png');
const icoOut = join(buildDir, 'icon.ico');

let generated = false;

// Try ImageMagick first
for (const cmd of ['magick', 'convert']) {
  try {
    // 256×256 dark background with neon-green "GWH" text
    execSync(
      `${cmd} -size 256x256 ` +
      `xc:"#0a0a0a" ` +
      `-fill "#00ff41" ` +
      `-font "DejaVu-Sans-Bold" ` +
      `-pointsize 72 ` +
      `-gravity center ` +
      `-annotate 0 "GWH" ` +
      `"${pngOut}"`,
      { stdio: 'pipe' }
    );

    // Convert PNG → multi-size ICO (16, 32, 48, 256)
    execSync(
      `${cmd} "${pngOut}" ` +
      `-define icon:auto-resize=256,48,32,16 ` +
      `"${icoOut}"`,
      { stdio: 'pipe' }
    );

    console.log(`✅ Icon generated with ${cmd}: ${pngOut}`);
    console.log(`✅ Icon generated with ${cmd}: ${icoOut}`);
    generated = true;
    break;
  } catch {
    // try next command
  }
}

if (!generated) {
  // Fallback: write a minimal 1×1 PNG (placeholder)
  // PNG signature + IHDR + IDAT + IEND
  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415408d76360f8cf0000000200017e221bc00000000' +
    '49454e44ae426082',
    'hex'
  );
  writeFileSync(pngOut, minimalPng);
  // Copy as ICO placeholder (electron-builder will handle it)
  writeFileSync(icoOut, minimalPng);
  console.log('⚠️  ImageMagick not found. Created placeholder icons at build/icon.png and build/icon.ico');
  console.log('   Replace these with real 256×256 icons before building the installer.');
}
