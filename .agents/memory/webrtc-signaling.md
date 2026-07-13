---
name: WebRTC signaling server
description: How voice/screen-share signaling is wired in Game World Hub — routing, auth, and the room authorization boundary.
---

# WebRTC voice/screen-share signaling

Voice chat + screen sharing use a peer-to-peer WebRTC mesh (no SFU). The API
server only relays signaling over a WebSocket; all room/call state is in memory
(no DB tables, no OpenAPI/codegen changes).

## Routing & auth (non-obvious)
- The WS is attached to the raw HTTP server at path `/api/ws` via an `upgrade`
  handler (not an Express route). The Replit proxy forwards `/api/*` to the
  api-server, so the browser connects to `wss://<origin>/api/ws` and Electron
  swaps `http`→`ws` on its local api base URL.
- Browser WebSockets can't set headers, so the JWT is passed as `?token=`. The
  upgrade handler verifies it and rejects with a raw `401` before handshake.

## Authorization boundary (must preserve)
- **Never relay signaling to/for rooms the user isn't a participant in.** A join
  must be authorized server-side: `party:<id>` requires a current
  `party_members` row for that user; `call:<id>` requires the user to be the
  caller or target recorded when the invite was created.
- **Why:** without server-side authz, any authenticated user could `join` an
  arbitrary room id and eavesdrop on / inject signaling for calls they aren't
  part of. This was a real review finding, not hypothetical.
- **How to apply:** keep the `authorizeJoin` check on join, and keep
  `relaySignal`/`state` gated on the sender actually owning membership in that
  room. Call-room authorization lives in an in-memory map populated at invite
  time and cleared when the call resolves or the room empties — if you change
  the call lifecycle, keep that map's population/cleanup in lockstep or joins
  will silently start failing (or leak authorization).

## Connection recovery (ICE restart)
- A dropped path (`disconnected`/`failed`) is healed with `pc.restartIce()` over
  the **existing** peer connection — never tear down/recreate the Peer or rejoin
  the room, or you lose the tracks and UI state.
- **Only the impolite peer initiates** the restart (mirrors the perfect-negotiation
  polite/impolite split) so both sides don't emit competing restart offers.
- `disconnected` waits a short grace period before restarting (blips self-heal);
  `failed` restarts immediately. Refetch ICE servers before restart so relay can
  use fresh TURN credentials.
- **How to apply:** if you change the polite/impolite derivation, keep the
  "impolite initiates" rule in lockstep, and cancel the grace timer on
  `connected`/`closed` (and in destroyPeer) to avoid restarting a gone peer.

## Multi-tab & lifecycle
- One peer per user per room: a second connection joining the same room evicts
  the first (`force-leave`).
- Pending calls are per-user; only tear a call down on a user's **last**
  connection disconnecting, not any single tab.
- **A direct-call invite fans out to ALL of the callee's sessions, but a call is
  resolved per-user, not per-session.** A busy session must NOT auto-decline the
  invite — a decline deletes the shared pending call and cancels it for the
  user's other (possibly free) sessions. Busy sessions silently ignore; if every
  session is busy the caller falls back to the server no-answer timeout.
  **Why:** the old busy-tab auto-decline produced spurious "call declined" for
  users signed in on multiple devices.
  **How to apply:** first accept/decline wins (it deletes the pending call, so
  later actions are no-ops); the acting session's server handler must send
  `call-cancelled` to the callee's *other* sessions so their ringing UI clears.
- Client provider must fully tear down (WS, mic/screen tracks, peers, pending
  call state) when auth flips to logged-out — tie teardown to the auth effect's
  cleanup, not to a stale in-cleanup condition.
