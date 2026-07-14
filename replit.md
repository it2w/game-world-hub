# Game World Hub

Social gaming platform: presence, friends, parties, voice rooms, LFG, DMs, and rich player profiles — terminal/hacker green-on-black aesthetic.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/game-world-hub` — React + Vite web app, served at `/` (deep links are root-relative)
- `artifacts/api-server` — Express API under `/api`, WS signaling at `/api/ws`
- `@workspace/db` — Drizzle schema (source of truth for tables)
- `@workspace/api-zod` + generated hooks — API contract, regenerated from the OpenAPI spec (never hand-edit)

## Architecture decisions

- JWT auth: `verifyToken` enforces the exact session shape and rejects any `purpose`-tagged token (2FA challenge tokens are purpose-tagged, jti-tracked, single-use, attempt-capped)
- Images: DB stores `/objects/...` paths; every serializer maps them to `/api/storage/objects/...` via `toPublicImageUrl`; the serve route only serves public-ACL objects
- Uploads: presigned-URL flow, auth-only, `image/*` ≤ 8 MB enforced server-side
- Emails (verification, reset, 2FA codes): production sends via the Resend connector; dev appends JSONL to `/tmp/gwh-dev-emails.jsonl` (set `EMAIL_DELIVERY=resend` to send real mail from dev). Sender defaults to Resend's sandbox address, which only reaches the Resend account owner — verify a domain in Resend and set `EMAIL_FROM` to email real users

## Product

- Accounts: username/password + optional email (verify via 6-digit code), password reset, 2FA via authenticator app (TOTP) or email code
- Profiles: avatar + banner, photo gallery (max 12), wall comments (owner can toggle/delete; blocking enforced both directions)
- Social: friends, blocking, DMs, parties with voice/screen share, LFG posts, game library (Steam sync)
- Presence: online status + current game, auto-cleared by heartbeat/sweep

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Voice/screen-share TURN**: WebRTC uses public STUN by default, which fails on symmetric-NAT / strict-firewall networks. The client fetches its ICE list from `GET /api/ice-servers`, which serves STUN always and adds TURN when configured via env. To enable relay in production, provision a TURN server (self-hosted coturn or a managed provider) and set on the API server:
  - `TURN_URLS` — comma-separated (e.g. `turn:host:3478?transport=udp,turns:host:5349`)
  - Ephemeral creds (recommended, coturn `use-auth-secret`): `TURN_STATIC_AUTH_SECRET` (a Replit Secret) + optional `TURN_CREDENTIAL_TTL` (seconds, default 86400)
  - Or static creds: `TURN_USERNAME` + `TURN_CREDENTIAL`
  Without `TURN_URLS`, calls fall back to STUN-only and still work on permissive networks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
