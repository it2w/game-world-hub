# Threat Model

## Project Overview

Game World Hub is a social gaming platform offering user presence, friends, parties, voice/screen-share rooms, LFG (Looking for Group), direct messages, and rich player profiles. It is deployed publicly at https://gmes.app on Replit reserved VM with TLS provided by the platform.

**Stack:** Node.js 24, Express 5, TypeScript, PostgreSQL + Drizzle ORM, Zod validation, LiveKit Cloud for WebRTC voice/video.  
**Auth:** Username/password + optional email. 2FA via TOTP or email OTP. Bearer JWT (30-day expiry), with revocation via DB denylist and force-logout via `sessionsInvalidatedBefore` timestamp.  
**Users:** Public internet; authenticated registered users; admin users (subset of registered users with `isAdmin=true`); site owner (separate `superAdmins` table with separate token).

## Assets

- **User credentials** — password hashes, JWT session tokens, TOTP secrets. Compromise allows account takeover.
- **User PII** — email addresses, display names, bios, profile photos, wall comments. Exported via `/owner/export/users`.
- **Private communications** — direct messages between users. Scoped by conversation membership.
- **Voice/video sessions** — LiveKit room tokens granting real-time audio/video access to rooms.
- **Pro subscriptions** — activation codes (bearer tokens for subscription activation), subscription status.
- **Application secrets** — `JWT_SECRET`, `OWNER_JWT_SECRET`, `LIVEKIT_API_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`.
- **Owner-panel access** — 7-day owner JWTs granting ability to suspend users, promote admins, export all user data.

## Trust Boundaries

- **Unauthenticated → Authenticated**: Bearer JWT required for most routes. A few endpoints are intentionally public (landing page, `/health`, `/users/match` spotlight).
- **Authenticated User → Admin**: `isAdmin` flag on `usersTable`, enforced via `requireAdmin` middleware. Admins can manage reports, content, and activations.
- **Admin → Owner (super-admin)**: Separate `superAdmins` table with its own JWT (`OWNER_JWT_SECRET`). Owners can suspend users, promote/demote admins, export user data, and manage the owner panel.
- **Client → Server**: All HTTP/WS messages cross this boundary. The client is untrusted; server must validate all input.
- **Server → LiveKit Cloud**: API key + secret used to mint room tokens. LiveKit JWT grants publish/subscribe capability; token minting must be access-controlled.
- **Server → PostgreSQL**: Drizzle ORM with parameterized queries. No SQL injection surface identified.
- **Server → Resend (email)**: API key used to send verification codes and password reset emails.

## Scan Anchors

**Production entry points:**
- `artifacts/api-server/src/app.ts` — Express app setup, CORS, body parsing
- `artifacts/api-server/src/routes/` — all `/api/*` routes
- `artifacts/api-server/src/ws/signaling.ts` — WebSocket at `/api/ws`
- `artifacts/api-server/src/routes/owner.ts` — owner panel at `/owner/*`

**Highest-risk areas:**
- `artifacts/api-server/src/routes/auth.ts` — login, register, password reset, 2FA (no rate limiting)
- `artifacts/api-server/src/routes/livekit.ts` — LiveKit token minting (password-protected room bypass)
- `artifacts/api-server/src/routes/conversations.ts` — DMs, message pin IDOR
- `artifacts/api-server/src/routes/users.ts` — profile updates, public `/users/match` DoS
- `artifacts/api-server/src/routes/owner.ts` — export endpoints with token-in-URL

**Public (no auth) surfaces:** `/health`, `/download/windows`, `/users/match`, `/auth/register`, `/auth/login`, `/auth/password-reset/*`, `/auth/login/2fa`, landing page  
**Authenticated:** all `/api/*` routes except above  
**Admin:** `/api/admin/*` via `requireAdmin`  
**Owner:** `/owner/*` via `verifyOwnerToken`  
**Dev-only:** `.agents/skills/brainstorming/` scripts — not production reachable

## Threat Categories

### Spoofing

**Login brute force:** No rate limiting on `POST /auth/login`. Attackers can systematically try passwords for any account.  
**Password-reset spam:** `POST /auth/password-reset/request` has no per-IP or per-account cooldown.  
**Mass registration:** `POST /auth/register` has no rate limiting or CAPTCHA.  
**2FA challenge replay (TOTP):** After a server restart, the in-memory JTI tracker for TOTP challenge tokens is wiped. An intercepted challenge token + TOTP code can be replayed on the new process within the 5-minute window.  
**Required guarantee:** All authentication endpoints MUST have per-IP rate limiting. 2FA JTI tracking MUST be persisted in the database.

### Tampering

**Message pin IDOR:** `PATCH /conversations/:conversationId/messages/:messageId/pin` checks membership in `conversationId` but applies the update to any `messageId` system-wide.  
**Password-protected room bypass:** `/api/livekit/token?room=proroom:<id>` mints a LiveKit token without verifying the caller proved knowledge of the room password.  
**Required guarantee:** All database writes MUST scope by the authenticated user's accessible resources. LiveKit token issuance for password-protected rooms MUST verify a server-side session flag.

### Repudiation

Owner activity log exists for admin actions. No finding here — considered adequate for the threat model.

### Information Disclosure

**CORS origin: true + credentials: true:** Any third-party website can initiate credentialed cross-origin requests to the API and read responses. If any cookie-based auth is ever added, this immediately becomes exploitable for CSRF/session hijacking.  
**Owner export token in URL:** Owner JWTs appear in Nginx/pino-http access logs, browser history, and Referer headers when `/owner/export/users?token=<jwt>` is used. The export contains all user emails and metadata.  
**Required guarantee:** CORS MUST restrict origins to known production domains. Authentication tokens MUST NOT appear in URL query parameters.

### Denial of Service

**Unauthenticated DB scan:** `GET /users/match` runs two `ORDER BY RANDOM()` full table scans with no auth or rate limiting.  
**Unbounded WS payloads:** The WebSocket server has no `maxPayload` limit (ws default = 100 MB). Large frames are fully buffered in memory.  
**Conversation message fetch:** `GET /conversations` loads all messages for every conversation to compute unread counts in JS rather than SQL.  
**Required guarantee:** All public endpoints MUST have rate limiting. WebSocket server MUST set a `maxPayload` limit. Unread counts MUST be computed in SQL.

### Elevation of Privilege

**Session persistence after password reset:** `POST /auth/password-reset/confirm` does not set `sessionsInvalidatedBefore`, leaving all prior JWTs valid for up to 30 days.  
**OTP attempt-limit bypass:** Re-requesting a new password-reset code resets the attempt counter, effectively removing brute-force protection on the 6-digit OTP.  
**Admin permission gap:** `GET /admin/activation-codes` requires any admin role but not the specific `can_manage_codes` permission required for write operations on activation codes.  
**Required guarantee:** Password reset MUST invalidate existing sessions. OTP re-issuance MUST be rate-limited. Admin read endpoints MUST enforce the same granular permissions as their write counterparts.
