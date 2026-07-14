---
name: Drizzle push fallback
description: drizzle-kit push hangs on interactive prompts in this environment
---

`drizzle-kit push` prompts interactively (truncate/rename questions) and hangs in non-interactive shells here.

**How to apply:** for additive schema changes (new tables/columns), update `schema.ts` first, then apply the DDL directly with raw SQL (execute_sql / psql). Keep the SQL exactly in sync with the Drizzle schema. Never paper over a mismatch — verify with `\d table` afterwards.

**Why:** multiple sessions lost time waiting on hung push runs; raw SQL applied in seconds and matched the schema cleanly.
