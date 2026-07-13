---
name: Friend relationship status for profile UI
description: How the client knows the friend relationship between the viewer and another user (for Add/Remove/Accept buttons).
---

# Friend relationship state comes from GET /friends/:friendId/status

To render the right friend action on another user's profile (Add / Request sent /
Accept / Friends-Remove), the client needs the relationship state. The existing
friends endpoints did NOT expose **outgoing** pending requests, so the client
could not tell "already sent" from "not friends".

**Rule:** use `GET /friends/:friendId/status` → `{ state, requestId }` where state is
one of `self | friends | request_sent | request_received | none`. `requestId` is the
pending request's id (used to accept a `request_received`), else null.

**Why:** the client can't derive `request_sent` from any list endpoint; only the
server sees both directions of `friend_requests`. Computing state server-side keeps
the button logic a single source of truth.

**How to apply:** friendships are stored directional (rows for both directions on
accept). The status route must sit as a distinct path segment so it doesn't collide
with `DELETE /friends/:friendId`. After add/accept/remove mutations, invalidate the
friend-status query so the button updates without reload.
