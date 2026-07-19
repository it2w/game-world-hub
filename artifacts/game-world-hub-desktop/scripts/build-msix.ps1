# Game World Hub — MSIX Build Script for Windows
# Run from the monorepo root: powershell -ExecutionPolicy Bypass -File artifacts/game-world-hub-desktop/scripts/build-msix.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "=== Game World Hub — MSIX Build ===" -ForegroundColor Cyan

# ── 1. Check prerequisites ────────────────────────────────────────────────────
Write-Host "`n[1/5] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install from https://nodejs.org"
    exit 1
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm not found. Run: npm install -g pnpm"
    exit 1
}

# ── 2. Install dependencies ───────────────────────────────────────────────────
Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ── 3. Build API server ───────────────────────────────────────────────────────
Write-Host "`n[3/5] Building API server..." -ForegroundColor Yellow
pnpm --filter "@workspace/api-server" run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ── 4. Build web frontend ─────────────────────────────────────────────────────
Write-Host "`n[4/5] Building web frontend..." -ForegroundColor Yellow
$env:VITE_API_BASE = "https://gmes.app"
pnpm --filter "@workspace/game-world-hub" run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Copy renderer into desktop dist
$src = "artifacts\game-world-hub\dist"
$dst = "artifacts\game-world-hub-desktop\dist\renderer"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*" $dst -Recurse -Force

# ── 5. Build MSIX ─────────────────────────────────────────────────────────────
Write-Host "`n[5/5] Building MSIX..." -ForegroundColor Yellow
Push-Location "artifacts\game-world-hub-desktop"
pnpm run build:win:msix
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

# ── Done ──────────────────────────────────────────────────────────────────────
$msix = Get-ChildItem "artifacts\game-world-hub-desktop\dist-electron\*.msix" | Select-Object -First 1
if ($msix) {
    Write-Host "`n✅ MSIX built successfully:" -ForegroundColor Green
    Write-Host "   $($msix.FullName)" -ForegroundColor White
    Write-Host "   Size: $([math]::Round($msix.Length / 1MB, 1)) MB" -ForegroundColor Gray
    Write-Host "`nNext step: Upload this file to Microsoft Partner Center → Submissions → Packages" -ForegroundColor Cyan
} else {
    Write-Error "MSIX file not found after build."
    exit 1
}
