---
name: orval codegen request bodies
description: Why inline OpenAPI requestBody schemas break the zod codegen, and the fix.
---

# Orval request-body schemas must be named ($ref), not inline

When adding an endpoint to `lib/api-spec/openapi.yaml`, define the request body as a
**named component schema** referenced with `$ref`, e.g.:

```yaml
requestBody:
  content:
    application/json:
      schema:
        $ref: "#/components/schemas/LinkSteamInput"
```

**Why:** the project runs two orval generators over the same spec — the react-query
client (`lib/api-client-react`) and a zod client (`lib/api-zod`). For an **inline**
requestBody, orval derives the name `<operationId>Body` for BOTH a TypeScript type
(in api-zod's `generated/types/`) and a zod const (in api-zod's `generated/api.ts`).
The api-zod `index.ts` re-exports both, producing:
`TS2308: Module "./generated/api" has already exported a member named 'XxxBody'`,
which fails `pnpm --filter @workspace/api-spec codegen`.

Using a `$ref` to a named schema makes the TS type take the schema's name (e.g.
`LinkSteamInput`) while the zod validator stays `<operationId>Body` (e.g.
`LinkSteamBody`) — no collision. This matches the existing endpoints
(PartyInviteInput → InviteToPartyBody, etc.).

**How to apply:** any new POST/PATCH/PUT body → add a `components.schemas.<Name>Input`
and `$ref` it. Then `pnpm --filter @workspace/api-spec codegen` before typechecking
routes that import the generated `<operationId>Body` zod.

## format: email / uri breaks zod codegen

Declaring `format: email` or `format: uri` on OpenAPI string fields makes the orval zod codegen emit broken validators in this setup. Keep spec fields as plain strings and validate email/URL shape server-side with a regex (and client-side in the form schema).

## `format: email` breaks codegen (zod 3 vs orval 8)
Never use `format: email` in openapi.yaml. Orval 8 emits zod-v4 top-level `zod.email()`, which does not exist in zod 3.25 — `typecheck:libs` fails inside the generated file.
**Why:** hit when making registration email required; codegen produced `zod.email()` and the build broke.
**How to apply:** in the spec use `minLength`/`maxLength` (or a `pattern`) for email fields and enforce the real format check in the route handler (shared `EMAIL_RE` in auth routes) plus `.email()` in the client-side form schema.
