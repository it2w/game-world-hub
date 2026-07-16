# Game World Hub Desktop — Build Guide

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| pnpm | 8+ |

---

## Quick Start

```bash
# From the monorepo root:
pnpm install

# Build the desktop app (creates win-unpacked/ + ZIP)
cd artifacts/game-world-hub-desktop
pnpm run build:win
```

The build creates `dist-electron/win-unpacked/` (the unpacked app).  
Then zip it for distribution:

```bash
cd dist-electron
zip -0 -r GameWorldHub-1.0.0-win.zip win-unpacked/
```

---

## Distribution

### Current method: ZIP archive

The `GameWorldHub-1.0.0-win.zip` (~350 MB) is hosted on Replit Object Storage and served at:

```
GET /api/download/windows  →  302 → signed GCS URL → browser downloads ZIP
```

**User instructions (include in release notes):**
1. Download `GameWorldHub-1.0.0-win.zip`
2. Extract to a folder of your choice (e.g. `C:\GWH\`)
3. Run `Game World Hub.exe`

### NSIS installer (optional — creates a proper Setup.exe)

If `makensis` is available (Linux or Windows), run:

```bash
cd artifacts/game-world-hub-desktop
makensis installer.nsi
```

Output: `dist-electron/GameWorldHub-Setup-1.0.0.exe`

To install `makensis` on Linux:

```bash
# Debian/Ubuntu:
sudo apt-get install nsis

# Nix:
nix-env -iA nixpkgs.nsis

# Windows:
# Install from https://nsis.sourceforge.io/Download
```

---

## Upload a new release to Object Storage

After building and zipping, upload the ZIP with the sidecar script:

```bash
# From repo root — the sidecar runs at http://127.0.0.1:1106 (Replit env only)
SIGNED=$(node -e "
  const res = await fetch('http://127.0.0.1:1106/object-storage/signed-object-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket_name: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
      object_name: 'public/GameWorldHub-1.0.0-win.zip',
      method: 'PUT',
      expires_at: new Date(Date.now() + 3600000).toISOString()
    })
  });
  const d = await res.json();
  console.log(d.signed_url);
")
curl -X PUT "$SIGNED" \
  -H "Content-Type: application/zip" \
  --data-binary "@artifacts/game-world-hub-desktop/dist-electron/GameWorldHub-1.0.0-win.zip" \
  --progress-bar \
  -w "HTTP %{http_code}\n"
```

---

## Configuration

### Production URL

By default the app connects to `https://gmes.app`.  
Override at build time:

```bash
GWH_HOSTED_URL=https://your-domain.com pnpm run build:win
```

### App Version

Update `package.json` → `version` before each release, and update the
filename in `BUILD.md` / `installer.nsi`.

---

## Build Scripts

| Script | Description |
|--------|-------------|
| `pnpm run build:win` | Full Windows build (creates win-unpacked) |
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
| Close-to-tray | ✅ Minimize to tray on close |
| Single instance | ✅ Second launch focuses existing window |
| Window state | ✅ Remembers position and size |
| Screen sharing | ✅ Electron display media handler |
| F12 DevTools | ✅ Toggle DevTools |
| Launch at startup | ✅ Configurable via Account tab |

---

## Icon

Replace `build/icon.ico` (256×256 px minimum) and `build/icon.png`
with your final branding before shipping.

---

## Limitations on Replit / Linux

- **NSIS installer**: `makensis` may not be available in the binary cache. If not, build the ZIP instead (see above) or run `makensis installer.nsi` locally/on Windows.
- **Code signing**: `electron-builder` requires Wine on Linux for the EXE code-signing step. The ZIP contains the unsigned app which runs fine — Windows SmartScreen may warn on first launch.
