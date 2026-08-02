# Desktop release verification log

Auto-update source: GitHub Releases at `it2w/game-world-hub`
(`package.json → build.publish`, provider `github`). Installed apps read
`latest.yml` from the latest release via electron-updater.

## v1.0.1 — 2026-08-02 (auto-update flow verified end-to-end)

- Trigger: version bump to `1.0.1` + tag `v1.0.1` pushed to `it2w/game-world-hub`.
- CI: `desktop-build.yml` run 30771379202 — **success**
  (https://github.com/it2w/game-world-hub/actions/runs/30771379202).
- Release: https://github.com/it2w/game-world-hub/releases/tag/v1.0.1
  - `GameWorldHubSetup.exe` — 108,268,392 bytes
  - `latest.yml` — `version: 1.0.1`, sha512
    `4//qa1nKyOJKiR/O4UPz32FQdPjXMzpqnqwCKFYmz22K/ctWrBgCQ/G1/e0S39cJgQtdLKmru1rkVT8JMRYnAA==`
  - `GameWorldHub-Store.msix` (Store channel; not used by the auto-updater)
- Verified:
  - `https://github.com/it2w/game-world-hub/releases/latest/download/latest.yml`
    resolves to the v1.0.1 metadata (so updaters see the new version).
  - Installer sha512 recomputed from the downloaded `.exe` matches `latest.yml`
    byte-for-byte (electron-updater rejects the download otherwise).
  - Version comparison 1.0.0 → 1.0.1 triggers download with
    `autoDownload: true` and `autoInstallOnAppQuit: true`
    (`src/auto-updater.ts`).

## v1.0.0 — initial release

- Release tagged `main` (legacy tag name): `GameWorldHubSetup.exe` +
  `latest.yml` (`version: 1.0.0`).
