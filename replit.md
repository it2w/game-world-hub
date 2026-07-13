# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

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

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

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
