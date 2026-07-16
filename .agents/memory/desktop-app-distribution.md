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

## NSIS installer

A ready-made NSIS script lives at `artifacts/game-world-hub-desktop/installer.nsi`. Run with `makensis installer.nsi` when makensis is available.

**makensis is NOT in the Replit/NixOS binary cache** — `nix-env -iA nixpkgs.nsis` triggers a source compile (very slow / times out). Install locally or accept ZIP distribution.

**Why electron-builder can't produce EXE on Linux**: it requires Wine for the ASAR integrity step (`signtool.exe`), even with `CSC_IDENTITY_AUTO_DISCOVERY=false`. The `win-unpacked/` dir is built fine; only the final packaging step fails.

## How to apply

- Any future Windows desktop release: build ZIP → upload via sidecar → endpoint auto-serves the new file.
- If an NSIS installer is needed, build it locally (Windows or Linux with apt makensis) and upload the EXE the same way (change filename in `download.ts` + `installer.nsi`).
