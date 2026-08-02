---
name: Windows CI desktop build
description: How the Windows .exe is built via GitHub Actions and the native-binary/electron-builder pitfalls
---
# Windows CI desktop build (GitHub Actions)

The desktop `.exe` cannot be built locally (Linux env, GCS sidecar broken). It is built by the `desktop-build.yml` workflow in the user's repo `it2w/game-world-hub` (workflow id 316301851), dispatched via the GitHub API with the `GITHUB_PAT` secret. Download page: https://github.com/it2w/game-world-hub/releases (assets: `GameWorldHubSetup.exe` + `latest.yml` for auto-update).

**Key lessons:**
- `pnpm-workspace.yaml` overrides map platform-native binaries (rollup, esbuild, lightningcss, @tailwindcss/oxide) to `'-'` (removed). This breaks any non-Linux CI build with "Cannot find module ...msvc.node". Fix by DELETING the win32-x64 exclusion overrides, not by adding `optionalDependencies: "*"` hacks — those install mismatched versions (lightningcss requires the exact same version of its native sibling).
- Root `package.json` has `pnpm.supportedArchitectures` including win32/x64 so the lockfile carries Windows binaries.
- Root preinstall script blocks `npm install`; only pnpm works, in CI too.
- electron-builder 26: `win.publisherName`/`signAndEditExecutable` are no longer valid keys (neither top-level nor in `signtoolOptions` for signAndEditExecutable). Build unsigned: just omit signing options, keep `verifyUpdateCodeSignature: false`.
- Pushes: the `gitPush` callback fails (BRANCH_ALREADY_EXISTS); use `git push https://$(printenv GITHUB_PAT)@github.com/it2w/game-world-hub.git main`.

**Auto-update release flow (verified):** bump `artifacts/game-world-hub-desktop/package.json` version, push a `v*` tag → workflow builds & publishes release with `GameWorldHubSetup.exe` + `latest.yml` (sha512 verified to match the exe). electron-updater (github provider, it2w/game-world-hub) picks up the latest release; installed older versions auto-download and prompt to restart.

**How to apply:** any time the desktop installer needs a rebuild — commit, push, POST `/actions/workflows/316301851/dispatches` with `{"ref":"main","inputs":{"publish":"true"}}`, poll runs (~3 min).
