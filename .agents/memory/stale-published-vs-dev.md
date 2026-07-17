---
name: Stale view — client cache, not stale publish
description: When this user says a UI change "still shows old design," it's usually a client-side cache of index.html, not a stale deploy or a code bug. How to prove where the change actually is.
---

When this user reports a UI change "didn't work" / "still old design," do NOT jump to "it's a stale published build, republish." Prove where the code actually is first.

**Why:** The DM/chat redesign was fully in code, dev served it, tests green. I concluded it was a stale published build and told them to republish. They republished (HEAD became a "Published your App" commit) and STILL saw the old design. Proof then showed the redesign was already live: the deployed JS at gmes.app contained the redesign markers, and a fresh local build produced the *identical* Vite content hash (same hash = same bytes = same code). So the publish was fine — the stale view was a **client-side cache**, and my republish advice wasted the user's time.

**Root mechanism:** the web artifact serves `index.html` with **no `Cache-Control` header** (only `last-modified`). Clients fall back to heuristic caching and keep a stale `index.html` pointing at old hashed JS, so they never pick up a new build until the cache clears. This traps the **Windows desktop app** especially: it's an Electron shell that `loadURL("https://gmes.app")` with `autoHideMenuBar` and no devtools in prod, so the user cannot hard-refresh and Electron's Chromium disk cache persists across restarts. (All clients — browser and desktop — load the same gmes.app; the desktop app does NOT bundle its own frontend.)

**How to apply — prove it, don't guess:**
- Definitive test that the deploy is current: fetch the live entry + assets and grep for a marker UNIQUE to the change. Inline style strings (e.g. `rgba(20,20,32,0.6) 0%`) and i18n keys survive minification; local var names (`callBelongsHere`) do NOT. `curl -s https://gmes.app/ | grep -oE '/assets/[^"]+\.js'`, curl that asset, grep markers.
- Then run `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/game-world-hub run build` and compare the emitted `dist/public/assets/index-*.js` filename to the deployed one — identical Vite content hash ⇒ deployed code == current source.
- Production URL/status: `getDeploymentInfo()`. Prod is custom domain **gmes.app** (also game-world-hub-1.replit.app); deploymentType "vm" because api-server runs as a process while the web artifact is `serve="static"`.
- Once proven live, the fix is CLIENT-side: browser → hard refresh / incognito / another device confirms; desktop app → clear Electron cache (durable fix: `session.defaultSession.clearCache()` before `loadURL` in game-world-hub-desktop/src/main.ts, then rebuild) or reinstall.
- Static serve mode has no documented custom-header support, so you can't just add `Cache-Control: no-cache` to index.html via artifact.toml; a real server-side no-cache fix needs switching the web artifact off `serve="static"` to a small server.

**Build gotcha (still true):** the web `vite.config.ts` throws at config-load unless BOTH `PORT` and `BASE_PATH` are set; a bare `pnpm ... build` failing with "PORT environment variable is required" is expected, not a code bug — the deploy env injects both.
