/**
 * Migration import: uploads all files from migration_storage/ to the new bucket
 * Run from api-server dir: pnpm exec tsx scripts/import-storage.ts
 */
import { Storage } from '@google-cloud/storage';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDECAR   = 'http://127.0.0.1:1106';
const BUCKET    = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const SRC_DIR   = resolve(__dirname, '../../../migration_storage');

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

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  const bucket = storage.bucket(BUCKET!);
  const localFiles = walkDir(SRC_DIR);
  console.log(`Uploading ${localFiles.length} files to bucket: ${BUCKET}`);

  let ok = 0, fail = 0;
  for (const localPath of localFiles) {
    const remoteName = relative(SRC_DIR, localPath);
    try {
      await bucket.upload(localPath, { destination: remoteName });
      console.log(`  ✔ ${remoteName}`);
      ok++;
    } catch (e: any) {
      console.error(`  ✘ ${remoteName}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} uploaded, ${fail} failed`);
}

await main();
