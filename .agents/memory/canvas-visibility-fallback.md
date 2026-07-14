---
name: Canvas visibility fallback
description: This project's user repeatedly cannot see canvas iframe previews; how to make design reveals reach them reliably.
---

**Rule:** Whenever presenting design work on the canvas (iframe mockups), ALSO deliver full-page static screenshots in chat via `presentAsset` in the same turn.

**Why:** During the logo exploration (July 2026), the user twice reported "لا يظهر" (nothing shows) even though every preview URL returned 200 and rendered fine server-side, iframes were `state:"live"` with correct URLs, and the dev domain was current. Root cause on the user's side was never identified; static images in chat were the only guaranteed-visible surface. `focusCanvasShapes` reported delivered but did not resolve their complaint on its own.

**How to apply:**
- After each canvas design round: take a tall Screenshot (`viewportSize` ~1280×2800) with `saveTo: screenshots/<name>.jpg`, then `presentAsset` it alongside `presentArtifact`.
- Remind the user the chat image is static and animation lives on the canvas board.
- If frames appear stale after a mockup-server restart, force-remount by updating each iframe shape's `url` with a cache-buster query param (`?v=N`).
