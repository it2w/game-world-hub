---
name: Active-game presence invariants
description: Rules for how a user's currentGame ("Active Process") is set, kept alive, and auto-cleared.
---

# Active-game (currentGame) presence

The user's `currentGame` drives the profile "ACTIVE PROCESS" line. It is set/cleared only via `PATCH /auth/me/status`.

## Invariants (enforce on every path that touches currentGame)
- **Offline ⇒ no game.** A user whose status is `offline` must never have a non-null `currentGame`. Enforced server-side in the status handler for both cases: (a) request sets `status=offline` → force `currentGame=null`; (b) request sets a game but omits status while the *stored* status is already offline → force null (requires reading existing status).
- **Setting a game stamps `last_active_at=now`** in the same update, so a freshly-set game is never immediately swept.

## Auto-clear when a tab closes (browser can't detect native process exit)
- Open tab pings `POST /auth/me/heartbeat` (204) immediately then every 60s **while `currentGame` is truthy**; NOT gated on `document.hidden` (a backgrounded-but-open tab still counts as playing). Heartbeat query/fetch IS gated on authenticated state.
- A server sweep (60s interval) clears `currentGame` where it is non-null AND (`last_active_at` IS NULL **OR** older than the stale window, currently 4 min). **The NULL branch matters** — legacy/pre-rollout rows have no heartbeat and would otherwise stick forever.
- Logout fires a best-effort `PATCH .../status {currentGame:null}` with the token captured *before* clearing it, `keepalive:true`.

**Why:** real close-detection needs the Electron desktop app (deferred); heartbeat + sweep approximates it. Any new code that can write `currentGame` must respect the offline invariant and stamp `last_active_at`, or the sweep/offline behavior breaks.
