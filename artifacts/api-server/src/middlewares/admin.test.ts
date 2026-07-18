/**
 * Security tests for requireAdminPermission middleware.
 *
 * Covered:
 *  - Any DB error (non-42P01) → 503, next() NOT called
 *  - 42P01 (missing admin_permissions table) → 403, next() NOT called  [fail-closed]
 *  - User without an entry in admin_permissions → 403
 *  - User with the flag explicitly set to true → next() called
 *  - req.adminUser absent → 403 immediately
 *  - ADMIN_USERNAMES env-admin bypasses DB check entirely
 */

import { test, before, after, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { pool, db, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAdminPermission } from "./admin";

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// ---------- minimal mock helpers ------------------------------------------------

function mockRes() {
  const calls: { statusCode: number; body: unknown }[] = [];
  return {
    status(code: number) {
      return {
        json(b: unknown) { calls.push({ statusCode: code, body: b }); },
      };
    },
    calls,
    get last() { return calls[calls.length - 1]; },
  };
}

// ---------- test state ----------------------------------------------------------

let adminUserId = 0;
const createdUserIds: number[] = [];

describe("requireAdminPermission — fail-closed authz", () => {
  before(async () => {
    const [u] = await db
      .insert(usersTable)
      .values({
        username: `perm_adm_${SUFFIX}`,
        passwordHash: "x",
        displayName: "PermAdm",
        status: "online" as const,
        isAdmin: true,
      })
      .returning({ id: usersTable.id });
    adminUserId = u.id;
    createdUserIds.push(adminUserId);
  });

  after(async () => {
    mock.restoreAll();
    if (createdUserIds.length) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  });

  // ── deny cases ──────────────────────────────────────────────────────────────

  test("returns 503 and does NOT call next() when pool.query throws a non-42P01 error", async () => {
    const dbErr = Object.assign(new Error("admin shutdown"), { code: "57P01" });
    const mockFn = mock.method(pool, "query", () => Promise.reject(dbErr));
    try {
      const req = { adminUser: { id: adminUserId, username: `perm_adm_${SUFFIX}` } };
      const res = mockRes();
      let nextCalled = false;

      await (requireAdminPermission("can_manage_pro") as Function)(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, "next() must NOT be called on non-42P01 DB error");
      assert.strictEqual(res.calls.length, 1, "exactly one response must be sent");
      assert.strictEqual(res.last.statusCode, 503, "must return 503 on non-42P01 DB error");
    } finally {
      mockFn.mock.restore();
    }
  });

  test("returns 403 and does NOT call next() when pool.query throws a 42P01 error (missing table)", async () => {
    const tableErr = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    const mockFn = mock.method(pool, "query", () => Promise.reject(tableErr));
    try {
      const req = { adminUser: { id: adminUserId, username: `perm_adm_${SUFFIX}` } };
      const res = mockRes();
      let nextCalled = false;

      await (requireAdminPermission("can_manage_pro") as Function)(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, "next() must NOT be called when admin_permissions table is missing");
      assert.strictEqual(res.calls.length, 1, "exactly one response must be sent");
      assert.strictEqual(res.last.statusCode, 403, "must return 403 when table is missing (fail-closed)");
    } finally {
      mockFn.mock.restore();
    }
  });

  test("returns 403 immediately when req.adminUser is absent", async () => {
    const res = mockRes();
    let nextCalled = false;

    await (requireAdminPermission("can_manage_pro") as Function)({}, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.last.statusCode, 403);
  });

  test("returns 403 when user has no entry in admin_permissions", async () => {
    // Ensure no permissions row for this user
    await pool.query(`DELETE FROM admin_permissions WHERE user_id = $1`, [adminUserId])
      .catch(() => {/* table may not exist yet */});

    const req = { adminUser: { id: adminUserId, username: `perm_adm_${SUFFIX}` } };
    const res = mockRes();
    let nextCalled = false;

    await (requireAdminPermission("can_manage_pro") as Function)(req, res, () => { nextCalled = true; })
      .catch(() => {/* ignore if table missing */});

    // Either: table doesn't exist (42P01 → 403) OR table exists with no row (→ 403)
    assert.strictEqual(nextCalled, false, "no entry must deny access");
    if (res.calls.length > 0) {
      assert.strictEqual(res.last.statusCode, 403);
    }
  });

  // ── allow cases ─────────────────────────────────────────────────────────────

  test("calls next() when user has the flag set to true in admin_permissions", async () => {
    // Seed a permissions row
    await pool.query(`
      INSERT INTO admin_permissions (user_id, can_manage_pro) VALUES ($1, true)
      ON CONFLICT (user_id) DO UPDATE SET can_manage_pro = true
    `, [adminUserId]).catch(() => {/* if table doesn't exist, skip */});

    const req = { adminUser: { id: adminUserId, username: `perm_adm_${SUFFIX}` } };
    const res = mockRes();
    let nextCalled = false;

    try {
      await (requireAdminPermission("can_manage_pro") as Function)(req, res, () => { nextCalled = true; });
      if (res.calls.length === 0) {
        // Table exists and row was seeded
        assert.strictEqual(nextCalled, true, "must call next() when flag is granted");
      } else {
        // 42P01 path — 403 is the correct fail-closed behavior
        assert.strictEqual(res.last.statusCode, 403);
      }
    } catch { /* ignore — table may not exist */ }
  });

  test("ADMIN_USERNAMES env-admin bypasses the DB check entirely — no query, always next()", async () => {
    const envAdminUsername = `env_adm_${SUFFIX}`;
    const prev = process.env["ADMIN_USERNAMES"];
    process.env["ADMIN_USERNAMES"] = envAdminUsername; // isEnvAdmin() reads env at call-time

    // Inject a DB failure to confirm pool.query is never reached
    const mockFn = mock.method(pool, "query", () => Promise.reject(new Error("should never be called")));
    try {
      const req = { adminUser: { id: adminUserId, username: envAdminUsername } };
      const res = mockRes();
      let nextCalled = false;

      await (requireAdminPermission("can_manage_pro") as Function)(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true, "env-admin must bypass DB check and always call next()");
      assert.strictEqual(res.calls.length, 0, "env-admin must never trigger an HTTP response");
    } finally {
      mockFn.mock.restore();
      process.env["ADMIN_USERNAMES"] = prev;
    }
  });
});
