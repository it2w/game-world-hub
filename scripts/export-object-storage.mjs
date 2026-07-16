/**
 * Migration export: downloads all Object Storage files to ./migration_storage/
 * Run from repo root: node --import tsx scripts/export-object-storage.mjs
 */
import { Storage } from '@google-cloud/storage';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const SIDECAR = 'http://127.0.0.1:1106';
const BUCKET  = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const OUT_DIR = './migration_storage';

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

const bucket = storage.bucket(BUCKET);
const [files] = await bucket.getFiles();
console.log(`Found ${files.length} files in bucket: ${BUCKET}`);

let ok = 0, fail = 0;
for (const file of files) {
  const localPath = join(OUT_DIR, file.name);
  mkdirSync(dirname(localPath), { recursive: true });
  try {
    const [stream] = await file.createReadStream ? [file.createReadStream()] : [null];
    if (!stream) { await file.download({ destination: localPath }); }
    else { await pipeline(stream, createWriteStream(localPath)); }
    console.log(`  ✔ ${file.name}`);
    ok++;
  } catch (e) {
    console.error(`  ✘ ${file.name}: ${e.message}`);
    fail++;
  }
}
console.log(`\nDone: ${ok} downloaded, ${fail} failed`);
