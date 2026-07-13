---
name: Desktop bundled API server
description: How the Electron desktop app runs the API server, and why it still needs an external Postgres DATABASE_URL
---

# Desktop bundled API server

The Electron main process forks the API server bundle as a child process on a
free local port and hands the resulting `http://127.0.0.1:<port>` to the
renderer (via `webPreferences.additionalArguments` → preload → `setBaseUrl`).

## Non-obvious constraints

- **DB is PostgreSQL, not a file DB.** `lib/db` uses `drizzle-orm/node-postgres`
  + `pg` and requires `DATABASE_URL`. The desktop app is therefore **not** fully
  self-contained: the bundled server still needs an external Postgres connection
  string. Any plan that says "DB file in app-data" (e.g. SQLite) does not match
  reality without a real DB-engine migration (PGlite/SQLite).
  **Why:** shipping a true offline desktop app needs an embedded DB, which is a
  large separate change, not part of the bundling work.

- **Fork must run as Node, not Electron.** Set `ELECTRON_RUN_AS_NODE=1` in the
  child env and `execArgv: []` (so parent `--inspect`/`--require` flags aren't
  inherited). Packaged path is `process.resourcesPath/api-server/dist/index.mjs`.

- **Copy the whole `dist` dir, not just index.mjs.** The esbuild pino plugin
  emits sidecar workers (`pino-worker.mjs`, `pino-pretty.mjs`, `pino-file.mjs`,
  `thread-stream-worker.mjs`) next to `index.mjs`; they load at runtime, so
  electron-builder `extraResources` must ship the full directory.
  **Why:** logging silently breaks / the server crashes if only index.mjs ships.

- **JWT secret** is generated once on first launch and persisted via
  `electron-store` (CJS-compatible v8; the desktop tsconfig emits CommonJS).
