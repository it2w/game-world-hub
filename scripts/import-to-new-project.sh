#!/bin/bash
# ============================================================
#  MIGRATION IMPORT SCRIPT — Run this in the NEW project
#  after Remix, before first Publish
# ============================================================
set -e

echo "=== Game World Hub — Migration Import ==="
echo ""

# ── 1. Database import ──────────────────────────────────────
echo "[1/2] Importing database..."
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set. Make sure the database is provisioned."
  exit 1
fi

if [ ! -f "migration_db_export.sql" ]; then
  echo "ERROR: migration_db_export.sql not found. Extract migration_bundle.tar.gz first."
  exit 1
fi

psql "$DATABASE_URL" -f migration_db_export.sql
echo "  ✔ Database imported successfully"
echo ""

# ── 2. Object Storage import ────────────────────────────────
echo "[2/2] Uploading Object Storage files..."
if [ -z "$DEFAULT_OBJECT_STORAGE_BUCKET_ID" ]; then
  echo "ERROR: DEFAULT_OBJECT_STORAGE_BUCKET_ID not set."
  echo "       Open App Storage in the new project to provision the bucket first."
  exit 1
fi

if [ ! -d "migration_storage" ]; then
  echo "ERROR: migration_storage/ folder not found. Extract migration_bundle.tar.gz first."
  exit 1
fi

cd artifacts/api-server && pnpm exec tsx scripts/import-storage.ts
echo ""
echo "=== Migration complete! ==="
echo "Next steps:"
echo "  1. Add all Secrets (see MIGRATION_SECRETS.md)"
echo "  2. Publish to Europe + Reserved VM"
echo "  3. Move domain https://gmes.app/ to new project"
