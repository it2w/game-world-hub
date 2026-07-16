/**
 * Migration export: downloads all Object Storage files to migration_storage/ at repo root
 * Run from api-server dir: pnpm exec tsx scripts/export-storage.ts
 */
import { Storage } from '@google-cloud/storage';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDECAR   = 'http://127.0.0.1:1106';
const BUCKET    = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const OUT_DIR   = resolve(__dirname, '../../../migration_storage');

if (!BUCKET) { console.error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not set'); process.exit(1); }

const storage = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${SIDECAR}/token`,
    type: 'external_account',
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

async function main() {
  const bucket = storage.bucket(BUCKET!);
  const [files] = await bucket.getFiles();
  console.log(`Found ${files.length} files in bucket: ${BUCKET}`);
  console.log(`Saving to: ${OUT_DIR}`);

  let ok = 0, fail = 0;
  for (const file of files) {
    const localPath = join(OUT_DIR, file.name);
    mkdirSync(dirname(localPath), { recursive: true });
    try {
      await file.download({ destination: localPath });
      console.log(`  ✔ ${file.name}`);
      ok++;
    } catch (e: any) {
      console.error(`  ✘ ${file.name}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} downloaded, ${fail} failed`);
}

await main();
