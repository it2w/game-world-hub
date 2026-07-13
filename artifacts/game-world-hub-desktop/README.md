# Game World Hub — Desktop App

Native Windows desktop wrapper for Game World Hub, built with [Electron](https://electronjs.org).

## Features

- 🪟 **Native window** with persistent position/size
- 📌 **System tray** — close to tray, quick status switching
- 🔔 **Native notifications** — friend requests, party invites, messages
- 🚀 **Launch on startup** — configurable in Settings
- 🔗 **Deep links** via `gameworldhub://` protocol
- 📦 **NSIS installer** + **portable .exe** for Windows 10/11
- 🔄 **Auto-updater scaffold** (electron-updater, no update server required for v1)

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- The API server running (`pnpm --filter @workspace/api-server dev`)
- The web app dev server running (`pnpm --filter @workspace/game-world-hub dev`)

### Run in dev mode

```bash
# From workspace root — start API + web servers first:
pnpm --filter @workspace/api-server run dev &
pnpm --filter @workspace/game-world-hub run dev &

# Then launch Electron in dev mode:
cd artifacts/game-world-hub-desktop
NODE_ENV=development npx electron .
```

The Electron window loads the Vite dev server at `http://localhost:5173` by default.
Set `VITE_PORT` to override.

## Building the Windows installer

Build cross-platform from **Windows** or a **Windows GitHub Actions runner**:

```bash
# From the desktop package:
pnpm run build:win          # NSIS installer + portable .exe
pnpm run build:win:portable # portable .exe only
```

Output files land in `dist-electron/`.

> **Note:** `build:win` compiles the API server and Electron main process, but it
> does **not** build the web renderer. Before running it, build the web app and
> copy its output into `renderer/`:
>
> ```bash
> pnpm --filter @workspace/game-world-hub run build
> cp -r ../game-world-hub/dist/public/. renderer/
> ```

### Automated builds (GitHub Actions)

The Windows installer cannot be produced in the Replit/Linux environment, so it
is built on CI. The workflow at `.github/workflows/desktop-build.yml` runs on a
`windows-latest` runner and:

1. Triggers on every `v*` tag push (and can be run manually via
   **workflow_dispatch**).
2. Installs pnpm + Node, builds the web app, and stages it into `renderer/`.
3. Prepares a code-signing certificate, then runs `pnpm run build:win`
   (compiles the API server + Electron main, then `electron-builder --win`).
4. Uploads the resulting `dist-electron/*.exe` files as both a workflow
   artifact and assets on the GitHub Release for the tag.

Cut a release by pushing a tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

#### Code signing

The build signs the installer so Windows SmartScreen is less aggressive. To sign
with a **trusted code-signing certificate**, add two repository secrets:

- `WINDOWS_CERT_BASE64` — your `.pfx` certificate, base64-encoded
  (`base64 -w0 cert.pfx` on Linux, or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))` in PowerShell).
- `WINDOWS_CERT_PASSWORD` — the certificate's password.

If those secrets are absent, the workflow falls back to an **ephemeral
self-signed certificate** so the installer is still signed — but Windows
SmartScreen may still warn users until a trusted certificate is provided.

### Replacing the placeholder icon

Generate or export your icon as a 256×256 PNG, then:

```bash
# Using ImageMagick:
magick icon-source.png -define icon:auto-resize=256,48,32,16 build/icon.ico
cp icon-source.png build/icon.png
```

Or generate the placeholder automatically:
```bash
pnpm run build:icon
```

## App architecture

```
src/
├── main.ts          — Electron main process (window, lifecycle, IPC, protocol)
├── preload.ts       — contextBridge — safe IPC bridge exposed as window.electronAPI
├── tray.ts          — System tray icon + context menu
└── notifications.ts — API polling → native Windows notifications
```

The renderer loads the existing Game World Hub web app. When `window.electronAPI`
is defined (i.e., running inside Electron), the web app:
- Sends the JWT to the main process after login for notification polling
- Handles `navigate` events for deep-link and tray-driven navigation
- Can read/write the launch-at-startup setting via `electronAPI.setLoginItem()`

## Deep links

Register the protocol (handled automatically by electron-builder on install):

```
gameworldhub://party/42       → opens /party/42
gameworldhub://friends        → opens /friends
gameworldhub://chat/7         → opens /chat/7
```

## Auto-updater

`electron-updater` is installed and configured in `package.json → build.publish`.
To enable live updates, deploy a static file server at the URL in `publish.url`
and run `electron-builder --publish always` in CI to push update metadata.
