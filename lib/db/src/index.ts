import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Lazy initialisation — DATABASE_URL is a runtime-managed secret injected by
// Replit's secrets service. On VM deployments the channel occasionally isn't
// ready at module-load time ("Channel closed before secrets service was ready"),
// so we defer pool/db creation until the first actual database call.
let _pool: InstanceType<typeof Pool> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function init(): {
  pool: InstanceType<typeof Pool>;
  db: ReturnType<typeof drizzle<typeof schema>>;
} {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    _pool = new Pool({ connectionString: url });
    _db = drizzle(_pool, { schema });
  }
  return { pool: _pool, db: _db! };
}

export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, prop) {
    return (init().pool as any)[prop as string];
  },
});

export const db = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop) {
      return (init().db as any)[prop as string];
    },
  },
);

export * from "./schema";
