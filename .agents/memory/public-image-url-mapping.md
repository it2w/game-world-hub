---
name: Public image URL mapping
description: How stored object paths become servable URLs, and the ACL rule on the serve route
---

DB stores canonical object paths (`/objects/uploads/<id>`) for avatars, banners, and gallery photos. API responses must return directly-servable URLs.

**Rule:** every serializer that emits a user (or photo/comment author) must wrap image fields in `toPublicImageUrl(...)` (lib/objectStorage), which maps `/objects/...` → `/api/storage/objects/...` and passes through http(s)/null. Incoming writes go through `normalizeStoredImagePath`, which strips an `/api/storage` prefix so round-trips don't double-prefix.

**Why:** an early version mapped only auth/users routes; friends, parties, conversations, LFG, blocks, and WS signaling still leaked raw `/objects/...` paths that the browser can't fetch. Frontend-side prefixing was rejected to keep one source of truth.

**How to apply:** adding any new endpoint or WS payload that includes user summaries → apply `toPublicImageUrl` at the serializer. Grep for `avatarUrl:` when in doubt.

Serve-side ACL: `GET /api/storage/objects/*` only serves objects whose ACL is public. Profile media gets its public ACL set when it is *saved* to a profile/gallery (normalize step) — a freshly uploaded but unattached object returns 403. Upload minting (`/storage/uploads/request-url`) is auth-only and restricted to `image/*` ≤ 8 MB server-side.
