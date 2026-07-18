/**
 * Regression tests for admin permission enforcement on sensitive routes.
 *
 * Covered:
 *  - POST /admin/users/:userId/admin — restricted admin (no can_manage_admins) → 403
 *  - POST /admin/users/:userId/admin — ADMIN_USERNAMES env-admin → 200 (bypasses perm check)
 *  - Unauthenticated → 401
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// A DB-managed admin with NO permissions granted
let restrictedAdminId = 0;
let restrictedAdminToken = "";

// The target user whose admin status will be toggled
let targetUserId = 0;

const createdUserIds: number[] = [];

before(async () => {
  const [admin, target] = await db
    .insert(usersTable)
    .values([
      { username: `adm_restricted_${SUFFIX}`, passwordHash: "x", displayName: "RestrictedAdmin", status: "online" as const, isAdmin: true },
      { username: `adm_target_${SUFFIX}`, passwordHash: "x", displayName: "TargetUser", status: "online" as const },
    ])
    .returning({ id: usersTable.id });

  restrictedAdminId = admin.id;
  targetUserId = target.id;
  createdUserIds.push(restrictedAdminId, targetUserId);

  restrictedAdminToken = signToken({ userId: restrictedAdminId, username: `adm_restricted_${SUFFIX}` });

  // Ensure the restricted admin has an entry with all flags false
  await pool.query(`
    INSERT INTO admin_permissions (user_id) VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `, [restrictedAdminId]).catch(() => {/* table may not exist */});

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.query(`DELETE FROM admin_permissions WHERE user_id = ANY($1::int[])`, [createdUserIds]).catch(() => {});
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

async function post(path: string, auth?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("POST /admin/users/:userId/admin — can_manage_admins permission enforcement", () => {
  test("401 when unauthenticated", async () => {
    const r = await post(`/admin/users/${targetUserId}/admin`);
    assert.strictEqual(r.status, 401);
  });

  test("403 when admin has no can_manage_admins permission", async () => {
    const r = await post(`/admin/users/${targetUserId}/admin`, restrictedAdminToken);
    // Table may not exist (42P01 → 403) or table exists but flag is false (→ 403). Both are correct.
    assert.strictEqual(r.status, 403, `Restricted admin must be denied admin-grant; got ${r.status}`);
  });

  test("200 when ADMIN_USERNAMES env-admin promotes a user (bypass)", async () => {
    const envAdminUsername = `env_owner_${SUFFIX}`;
    const prev = process.env["ADMIN_USERNAMES"];
    process.env["ADMIN_USERNAMES"] = envAdminUsername;

    const [envAdmin] = await db
      .insert(usersTable)
      .values({ username: envAdminUsername, passwordHash: "x", displayName: "EnvOwner", status: "online" as const, isAdmin: true })
      .returning({ id: usersTable.id });
    createdUserIds.push(envAdmin.id);
    const envToken = signToken({ userId: envAdmin.id, username: envAdminUsername });

    try {
      const r = await post(`/admin/users/${targetUserId}/admin`, envToken);
      // env-admin bypasses requireAdminPermission — must succeed (200) or be accepted
      assert.ok(r.status === 200 || r.status === 204, `Env-admin must be allowed to promote; got ${r.status}`);
    } finally {
      process.env["ADMIN_USERNAMES"] = prev;
      // Clean up admin status
      await db.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, targetUserId)).catch(() => {});
    }
  });
});
