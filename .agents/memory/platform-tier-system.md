---
name: Platform tier system
description: Auto-computed XP tiers and where they are exposed.
---

The platform tier/level system is **auto-computed on read** from activity counts. It is never user-editable and has no dedicated DB columns.

**Why:** Users cannot fake their standing, and the feature ships without migrations. The previous self-reported `rank` field was removed from the UI/settings/update endpoint.

**How to apply:**
- The source of truth for tier thresholds and XP math is `artifacts/api-server/src/lib/xp.ts` (`TIER_DEFS`, `computeXp`, `computeLevel`, `getTier`, `getUserProgress`).
- Tier colors/icons/animations live in `artifacts/game-world-hub/src/components/tier-badge.tsx` and must stay in sync with the server-side `TIER_DEFS`.
- Tier data is returned on user profiles, achievements, friend lists, and LFG authors/responders via the shared `safeUser(u, progress?)` helper pattern.
- After changing the spec, regenerate `api-zod`/`api-client-react` with `pnpm --filter @workspace/api-spec run codegen`.
