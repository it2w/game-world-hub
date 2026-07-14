---
name: Static screenshots vs mount animations
description: Why app screenshots can show the animated logo half-built, and how to verify/present anyway
---

**Rule:** The Screenshot tool captures ~1s after page load. Any animate-on-mount UI (the arcade-invader logo assembles over ~1.5s with staggered `both`-fill delays) will look partial/incomplete in static captures. This is expected, not a rendering bug.

**Why:** Both /login and /register captures caught the creature mid-assembly (head only); CSS guarantees the final assembled state (finite-duration animations with `animation-fill-mode: both`), and browser logs showed no errors.

**How to apply:** When verifying or presenting mount-animated UI via screenshots: (1) don't retry hoping for later timing — captures land at roughly the same moment; (2) treat a correct partial frame + clean console as verification; (3) when presenting to this user (who relies on chat images, see canvas-visibility-fallback), explicitly explain the still shows a mid-animation frame, or reuse a capture of a looping variant (e.g. the mockup sheets) for the "final look".
