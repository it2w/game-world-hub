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
    // Check for test-time overrides set directly on the target (e.g. mock.method).
    if (Object.prototype.hasOwnProperty.call(_target, prop)) {
      return (_target as any)[prop as string];
    }
    const target = init().pool;
    const value = (target as any)[prop as string];
    return typeof value === "function" ? (value as Function).bind(target) : value;
  },
  set(_target, prop, value) {
    // Allow direct property assignment on the proxy target (used by mock.method
    // to store the mock function and later restore the original).
    (_target as any)[prop as string] = value;
    return true;
  },
  getOwnPropertyDescriptor(_target, prop) {
    // Return a descriptor so Node's mock.method (which uses
    // Object.getOwnPropertyDescriptor walking the prototype chain) can find the
    // real method and replace it.
    if (Object.prototype.hasOwnProperty.call(_target, prop)) {
      return Object.getOwnPropertyDescriptor(_target, prop);
    }
    const target = init().pool;
    let obj: object | null = target;
    while (obj) {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc) return { ...desc, configurable: true, writable: true };
      obj = Object.getPrototypeOf(obj);
    }
    return undefined;
  },
});

export const db = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop) {
      const target = init().db;
      const value = (target as any)[prop as string];
      return typeof value === "function" ? (value as Function).bind(target) : value;
    },
  },
);

export * from "./schema";
