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
