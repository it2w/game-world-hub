---
name: 2FA challenge tokens
description: Rules for special-purpose JWTs (2FA login challenges) signed with the shared secret
---

Two-step login issues a short-lived (5m) "challenge" JWT after a correct password when 2FA is on; the client exchanges it plus a code for a real session token.

**Rule:** any special-purpose JWT signed with the shared `JWT_SECRET` MUST be rejected by the session-token verifier. `verifyToken` enforces the exact session shape (`userId` number + `username` string) and rejects any token carrying a `purpose` claim. Challenge tokens are `{ userId, purpose: "2fa", jti }`.

**Why:** `jwt.verify` alone accepts ANY token signed with the same secret — an architect review caught that challenge tokens worked as full session tokens on HTTP and WS (complete 2FA bypass) because `verifyToken` was just a cast.

**How to apply:** when adding a new token purpose (invite links, magic links, etc.), tag it with a `purpose` claim and keep the session shape check strict — never widen `verifyToken`. WS auth reuses `verifyToken`, so it inherits the protection.

Challenge single-use: each challenge carries a `jti`; an in-memory map in the auth routes caps attempts (5) and marks the jti consumed on success. Email codes are additionally burned in the DB; the jti map is what protects TOTP. In-memory is acceptable (single-instance deploy); tokens expire in 5m.
