---
name: User blocking semantics
description: What blocking does across friends, messaging, and status — the enforcement points a change must keep in sync.
---

# Blocking is enforced server-side at every interaction point, not just recorded

A `blocks` row (blocker_id, blocked_id, unique pair) is only half the feature. A block
must be *enforced* everywhere two users interact, or it leaks.

**Enforcement points (keep all in sync when adding new interactions):**
- On block: tear down existing friendship (both directions) and delete pending friend
  requests (both directions).
- Friend requests: refuse if a block exists in *either* direction.
- Direct messages: refuse sending if a block exists in *either* direction between
  conversation participants.
- Any future user-to-user interaction (party invites, etc.) should add the same check.

**Privacy:** don't reveal to the blocked user that they were blocked. The relationship
status endpoint returns `blocked` only to the blocker; to the blocked user it returns
`none`, and blocked actions fail with a generic error ("Unable to …"), never "you are
blocked".

**Why:** a block that still lets the other person DM you or re-send friend requests is
not a block; and revealing the block invites retaliation/harassment.

**How to apply:** reuse the shared helpers `hasBlocked(blocker, blocked)` and
`isBlockedBetween(a, b)` (exported from the blocks route) rather than re-querying, so
the directional logic stays consistent.
