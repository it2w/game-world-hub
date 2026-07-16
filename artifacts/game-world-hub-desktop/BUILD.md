# Game World Hub Desktop — Build Guide

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| pnpm | 8+ |
| Windows 10/11 | (for NSIS build) |

> **Note**: The EXE build must be run on Windows. On Linux/Mac you can cross-compile but the NSIS installer requires Wine or a Windows runner.

---

## Quick Start

```bash
# From the monorepo root:
pnpm install

# Build the desktop EXE (Windows installer + portable)
cd artifacts/game-world-hub-desktop
pnpm run build:win
```

The output will be in `artifacts/game-world-hub-desktop/dist-electron/`:

```
dist-electron/
  GameWorldHub-Setup-1.0.0.exe    ← NSIS installer (recommended)
  GameWorldHub-Portable-1.0.0.exe ← No-install portable
```

---

## Configuration

### Production URL

By default the app connects to `https://game-world-hub.replit.app`.
Override at build time:

```bash
GWH_HOSTED_URL=https://your-domain.com pnpm run build:win
```

Or configure at runtime via electron-store (for enterprise setups).

### App Version

Update `package.json` → `version` before each release.

---

## Build Scripts

| Script | Description |
|--------|-------------|
| `pnpm run build:win` | Full Windows build (NSIS + Portable) |
| `pnpm run build:win:portable` | Portable EXE only |
| `pnpm run build:main` | Compile TypeScript only |
| `pnpm run typecheck` | Type-check without emit |
| `pnpm run dev` | Dev mode (loads localhost:5173) |

---

## Features Built

| Feature | Status |
|---------|--------|
| Splash screen | ✅ Animated loading screen with progress bar |
| System tray | ✅ Status, quick nav, current game display |
| Game detection | ✅ 40+ games via PowerShell process scan |
| In-game overlay | ✅ Corner toast, always-on-top, auto-dismiss |
| Offline mode | ✅ DNS check every 10s, sync on reconnect |
| Native notifications | ✅ Click-to-navigate |
| Deep links | ✅ `gameworldhub://party/42` |
| NSIS installer | ✅ Desktop + Start Menu shortcuts |
| Close-to-tray | ✅ Minimize to tray on close |
| Single instance | ✅ Second launch focuses existing window |
| Window state | ✅ Remembers position and size |
| Screen sharing | ✅ Electron display media handler |
| F12 DevTools | ✅ Toggle DevTools |
| Launch at startup | ✅ Configurable via Account tab |

---

## Auto-Update Setup

Update the `publish` section in `package.json` with your real GitHub repo
and create a release on GitHub — `electron-updater` handles the rest.

```json
"publish": {
  "provider": "github",
  "owner": "your-org",
  "repo": "gwh-desktop-releases"
}
```

---

## Icon

Replace `build/icon.ico` (256×256 px minimum) and `build/icon.png` 
with your final branding before shipping.
