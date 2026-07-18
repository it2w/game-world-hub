---
name: auth.ts safeUser is the useGetMe() shape
description: The safeUser() in auth.ts drives the /api/auth/me response — the sole source for useGetMe() on the frontend. Any new user field needed client-side (isPro, profileFrameColor, etc.) must be added here, not just in users.ts safeUser.
---

## Rule
`auth.ts safeUser()` and `users.ts safeUser()` are two separate functions. `useGetMe()` on the frontend calls `GET /api/auth/me`, which uses **auth.ts safeUser** only.

**Why:** isPro, profileFrameColor, profileBgUrl were added to users.ts safeUser but not auth.ts, so Pro-gated UI always saw isPro=undefined and stayed locked even for Pro users.

**How to apply:** Whenever adding a user field that the frontend reads from `useGetMe()`, add it to **both** `auth.ts safeUser` and `users.ts safeUser`. Keep them in sync. The canonical Pro check in both is:
```ts
const proActive = u.isPro && (!u.proExpiresAt || u.proExpiresAt > now);
```
