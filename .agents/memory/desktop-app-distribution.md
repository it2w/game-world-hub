---
name: Desktop app distribution
description: How the GWH Windows Electron app is packaged and distributed via Replit Object Storage with a download endpoint.
---

## Pattern

1. **Build** — `pnpm run build:win` in `artifacts/game-world-hub-desktop/` → creates `dist-electron/win-unpacked/` (351 MB).
2. **Zip** — `zip -0 -r GameWorldHub-1.0.0-win.zip win-unpacked/` (synchronously; background `zip` commands get killed silently on Replit).
3. **Upload** — use the Replit sidecar presigned PUT URL (NOT `@google-cloud/storage.getSignedUrl` which requires SA key). Sidecar endpoint: `http://127.0.0.1:1106/object-storage/signed-object-url`. Target: `public/GameWorldHub-1.0.0-win.zip` in the DEFAULT_OBJECT_STORAGE_BUCKET_ID bucket.
4. **Download endpoint** — `GET /api/download/windows` in `artifacts/api-server/src/routes/download.ts` — calls sidecar for a signed GET URL, redirects 302. File never passes through the API server.
5. **Landing page** — button `asChild` + `<a href="/api/download/windows" download>` — enabled now, badge shows "Available now".

## Why sidecar for signing

`@google-cloud/storage`'s `file.getSignedUrl()` requires a service account key for HMAC signing. Replit's sidecar uses external_account credentials which can't sign URLs via the SDK. The sidecar at `/object-storage/signed-object-url` handles signing directly and returns a `signed_url` field.

## NSIS installer (working method)

Use the Linux makensis bundled by electron-builder itself — no Wine needed:

```bash
NSIS_DIR="/home/runner/workspace/.cache/electron-builder/nsis/nsis-3.0.4.1"
NSIS="$NSIS_DIR/linux/makensis"
chmod +x "$NSIS"
cd artifacts/game-world-hub-desktop
NSISDIR="$NSIS_DIR" "$NSIS" -NOCD installer.nsi
# Output: dist-electron/GameWorldHubSetup.exe (~92 MB, LZMA)
```

**Why electron-builder itself fails**: `app-builder-bin@5.0.0-alpha.10` always calls Wine for NSIS on Linux even though it downloads `linux/makensis`. Run makensis directly with `installer.nsi` to bypass this.

**`signAndEditExecutable: false`** in the win build config skips the Wine signApp step — needed for `--dir` builds. Already set in package.json.

**ASAR must contain all files**: when manually packing ASAR, include `dist/`, `assets/`, `package.json`, AND `node_modules/` (production). Packing only `dist/` causes silent launch failure (Electron can't find entry point). Let electron-builder's `--dir` fail → win-unpacked still has a correct ASAR.

## How to apply

- Any future Windows desktop release: build ZIP → upload via sidecar → endpoint auto-serves the new file.
- If an NSIS installer is needed, build it locally (Windows or Linux with apt makensis) and upload the EXE the same way (change filename in `download.ts` + `installer.nsi`).
