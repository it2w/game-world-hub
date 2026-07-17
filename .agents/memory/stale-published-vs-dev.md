---
name: Stale published app vs dev
description: When this user says a UI change "didn't work" / "still old", first check whether they're viewing the published (deployed) app rather than dev.
---

When this user reports a UI change "didn't work" or "still shows the old design," check WHICH surface they are viewing **before** touching code. They frequently view the **published (deployed) app**, which runs the last-published build — not the current dev code.

**Why:** On at least one occasion the DM/chat redesign was fully in the code, served fresh by the dev server, with `tsc` + web tests green — but the user was looking at the deployed site (old build). The correct fix was to republish, not to change code. Same viewing-surface theme as canvas-visibility-fallback.md (this user also often can't see canvas iframes).

**How to apply:**
- Confirm the surface: Replit dev preview vs published app vs Windows desktop app. The fix differs — dev = hard refresh (Ctrl+Shift+R); published = republish; desktop = rebuild/redistribute.
- Prove the dev server serves the change: `curl -s "https://$REPLIT_DEV_DOMAIN/src/<path>.tsx" | grep <marker>`. Vite serves transformed source modules, so markers from your edit should appear in the response.
- To verify a *production* build locally: the web artifact's `vite.config.ts` throws at config-load unless `PORT` **and** `BASE_PATH` are set. Use `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/game-world-hub run build`. A bare `pnpm ... build` fails with "PORT environment variable is required" even though the code is correct — this is NOT a code bug, and the deploy environment injects both vars itself.
