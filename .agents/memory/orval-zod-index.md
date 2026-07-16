---
name: Orval zod index conflict
description: Naming conflicts between api-zod and api-client-react generated exports, and how to configure each index.ts correctly.
---

## The rule

`lib/api-zod/src/index.ts` must export **only** `./generated/api` (the zod schemas):

```ts
export * from "./generated/api";
```

Never add `export * from "./generated/types"` — orval generates identically-named TypeScript interfaces there (e.g. `AddReactionBody`) that conflict with the zod `const` exports and trigger TS2308.

`lib/api-client-react/src/index.ts` must explicitly re-export `customFetch`:

```ts
export * from "./generated/api";
export * from "./generated/api.schemas";
export { customFetch, setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
```

`customFetch` is NOT included in the orval-generated files, so omitting it from index.ts causes runtime `SyntaxError` when any route file imports it from the package.

**Why:** Orval's `zod` output client generates both zod schemas (`generated/api.ts`) and matching TS interfaces (`generated/types/`). Both sets share the same export names. The `api-client-react` output keeps TS types inside `generated/api.schemas.ts` separately — no conflict there.

**How to apply:** After every `pnpm --filter @workspace/api-spec run codegen` run, verify these two index files weren't accidentally reverted or duplicated by the clean step.
