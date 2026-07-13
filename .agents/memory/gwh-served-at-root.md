---
name: Game World Hub is served at the root path
description: The GWH web artifact's previewPath is "/", so deep-link URLs have no /game-world-hub prefix — matters when instructing test subagents.
---

Game World Hub (artifacts/game-world-hub) is registered as the **root** web
artifact: its `BASE_PATH` / vite `base` is `/` and `import.meta.env.BASE_URL`
is `/`. So the correct in-app URLs are root-relative: `/login`, `/lfg`,
`/ranks`, `/parties` — **not** `/game-world-hub/...`.

**Why:** Assuming the artifact dir name (`game-world-hub`) is also the URL
prefix caused two wasted testing rounds — a tester loading
`/game-world-hub/lfg` got the app's client-side "404 Page Not Found" (wouter
matched nothing because the base is `""`), which looked like a routing bug in a
newly added page but was just the wrong URL.

**How to apply:** Before telling a testing subagent to deep-link/full-page-load
a GWH route, use root-relative paths. To confirm an artifact's real base for any
app, check the served HTML asset paths (root-relative `src="/src/main.tsx"` ⇒
base `/`) or the artifact's registered previewPath — don't infer it from the
directory/slug name.
