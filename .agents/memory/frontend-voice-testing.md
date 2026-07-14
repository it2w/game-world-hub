---
name: Frontend voice-context testing
description: How the Game World Hub web artifact is unit-tested and the non-obvious constraints when testing the voice provider
---

# Testing the voice context (Game World Hub)

The web artifact uses **vitest + jsdom** (`pnpm --filter @workspace/game-world-hub run test`), separate from the api-server's `node --test` runner.

**Why:** the voice provider's recovery logic (rejoin, ICE-restart exhaustion, error auto-clear) lives inside a React context and is only reachable by rendering it; faking the whole media/signaling layer is cleaner than emulating real WebRTC.

**Non-obvious constraints worth knowing before writing more voice tests:**
- Only the **impolite** peer drives ICE restarts (`polite = myUserId > peerUserId`), so a test that needs the terminal "couldn't reconnect" failure must make the local user the lower id.
- `rejoin()` never tears down the cached mic, so a mic failure on rejoin is only reachable when the mic was never acquired — i.e. the caller path that joins the room even after `ensureMic` rejects.
- The fatal "couldn't reconnect" message is deliberately held open: the auto-clear effect early-returns while `canRejoin` is true. Transient errors (canRejoin false) self-clear after 5s.
