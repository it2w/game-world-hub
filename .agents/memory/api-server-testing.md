---
name: api-server testing
description: How api-server integration tests are run and why the runner needs a force-exit flag
---

# api-server integration tests

Tests use node's built-in runner via **tsx** (`node --import tsx --test ...`), not vitest — tsx is the catalog-curated TS runner and no test framework was installed. The `test` script lives in `artifacts/api-server/package.json` and is also registered as the `test` validation command.

Tests run against the **real** Postgres (`DATABASE_URL`) and a real `JWT_SECRET`; they create uniquely-suffixed fixture rows and delete them in an `after` hook. There is no test double for `@workspace/db`.

**Rule:** the test script must pass `--test-force-exit`.
**Why:** importing signaling/db code opens a `pg` Pool and the signaling server starts a `setInterval` heartbeat; even after closing the http server and calling `pool.end()`, node's test runner can hang waiting on open handles. Force-exit is the reliable fix.
**How to apply:** when adding more api-server tests, keep `--test-force-exit` in the `test` script and clean up fixtures/servers in `after` hooks anyway.
