/**
 * Upload the Windows release ZIP to Replit Object Storage (public bucket).
 *
 * Run from the repo root after building:
 *   node artifacts/game-world-hub-desktop/upload-release.mjs
 *
 * Requires the following env vars (set automatically by Replit Object Storage):
 *   DEFAULT_OBJECT_STORAGE_BUCKET_ID
 *   PUBLIC_OBJECT_SEARCH_PATHS
 *
 * The API sidecar at http://127.0.0.1:1106 is used for auth — this must be
 * run inside the Replit environment.
 */

import { Storage } from '@google-cloud/storage';
import { createReadStream, statSync } from 'fs';
import { resolve } from 'path';

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const RELEASE_FILENAME = 'GameWorldHub-1.0.0-win.zip';
const ZIP_PATH = resolve(
  import.meta.dirname,
  'dist-electron',
  RELEASE_FILENAME,
);

async function main() {
  // ── resolve target bucket / object path ──────────────────────────────────
  const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (publicPaths.length === 0) {
    console.error(
      'ERROR: PUBLIC_OBJECT_SEARCH_PATHS is not set.\n' +
        'Open the Object Storage pane in Replit and create a bucket first.',
    );
    process.exit(1);
  }

  const firstPath = publicPaths[0].replace(/^\//, '');
  const parts = firstPath.split('/');
  const bucketName = parts[0];
  const prefix = parts.slice(1).join('/');
  const objectName = prefix ? `${prefix}/${RELEASE_FILENAME}` : RELEASE_FILENAME;

  // ── auth ──────────────────────────────────────────────────────────────────
  const storage = new Storage({
    credentials: {
      audience: 'replit',
      subject_token_type: 'access_token',
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: 'external_account',
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: { type: 'json', subject_token_field_name: 'access_token' },
      },
      universe_domain: 'googleapis.com',
    },
    projectId: '',
  });

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  // ── check source file ─────────────────────────────────────────────────────
  let fileSize;
  try {
    fileSize = statSync(ZIP_PATH).size;
  } catch {
    console.error(`ERROR: ZIP not found at ${ZIP_PATH}`);
    console.error(
      'Build the app first:\n  cd artifacts/game-world-hub-desktop && pnpm run build',
    );
    process.exit(1);
  }

  console.log(`Uploading ${RELEASE_FILENAME} (${(fileSize / 1e6).toFixed(1)} MB)...`);
  console.log(`  → gs://${bucketName}/${objectName}`);

  // ── upload with progress ──────────────────────────────────────────────────
  const readStream = createReadStream(ZIP_PATH);
  const writeStream = file.createWriteStream({
    metadata: {
      contentType: 'application/zip',
      contentDisposition: `attachment; filename="${RELEASE_FILENAME}"`,
    },
    resumable: false,
    public: false, // served via signed URLs from the download endpoint
  });

  let uploaded = 0;
  readStream.on('data', (chunk) => {
    uploaded += chunk.length;
    const pct = Math.floor((uploaded / fileSize) * 100);
    process.stdout.write(`\r  ${pct}% (${(uploaded / 1e6).toFixed(1)} MB / ${(fileSize / 1e6).toFixed(1)} MB)`);
  });

  await new Promise((resolve, reject) => {
    readStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  console.log(`\n✓ Uploaded successfully`);
  console.log(`\nDownload endpoint: GET /api/download/windows`);
  console.log('Enable the landing page button by updating landing.tsx.');
}

main().catch((err) => {
  console.error('\nUpload failed:', err.message);
  process.exit(1);
});
