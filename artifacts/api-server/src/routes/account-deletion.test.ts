/**
 * Integration test: account deletion clears the effective session.
 *
 * Covered scenarios:
 *  - DELETE /users/me returns 204
 *  - GET /auth/me with the same token immediately after deletion returns 401
 *    (proves that the deleted user cannot stay "logged in")
 *
 * This API uses JWT tokens — there are no server-side sessions. The
 * requireAuth middleware performs a live DB existence check on every
 * request, so deleting the user row is the effective session invalidation.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { db, usersTable, revokedTokensTable } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Clean up any test user that may not have been deleted by the test itself.
  await db
    .delete(usersTable)
    .where(eq(usersTable.username, `deltest_${SUFFIX}`));
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function makeRequest(
  method: string,
  path: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) {
            resolve({ status: res.statusCode ?? 0, body: null });
            return;
          }
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DELETE /users/me — session invalidation after account deletion", () => {
  test("deleted user cannot use their token to access authenticated endpoints", async () => {
    // 1. Create a fresh user directly in the DB.
    const [user] = await db
      .insert(usersTable)
      .values({
        username: `deltest_${SUFFIX}`,
        passwordHash: "x",
        displayName: "Delete Test",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });

    // 2. Issue a JWT token (simulates being "logged in").
    const token = signToken({ userId: user.id, username: user.username });

    // 3. Confirm the token works before deletion.
    const beforeDelete = await makeRequest("GET", "/auth/me", token);
    assert.equal(
      beforeDelete.status,
      200,
      "token should be valid before account deletion",
    );

    // 4. Delete the account.
    const deleteRes = await makeRequest("DELETE", "/users/me", token);
    assert.equal(deleteRes.status, 204, "DELETE /users/me should return 204");

    // 5. Immediately use the same token — must be rejected with 401.
    const afterDelete = await makeRequest("GET", "/auth/me", token);
    assert.equal(
      afterDelete.status,
      401,
      "token should be rejected with 401 after the account is deleted",
    );
  });

  test("denylist entry alone blocks the token even if the user row still exists", async () => {
    // This test specifically validates the defense-in-depth layer: the revoked_tokens
    // table must block a valid JWT even when the primary DB existence check would
    // otherwise pass (simulating a future caching layer that skips the existence check).

    // 1. Create a fresh user directly in the DB.
    const [user] = await db
      .insert(usersTable)
      .values({
        username: `denylist_${SUFFIX}`,
        passwordHash: "x",
        displayName: "Denylist Test",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });

    // 2. Issue a JWT token.
    const token = signToken({ userId: user.id, username: user.username });

    // 3. Confirm the token works before denylist insertion.
    const before = await makeRequest("GET", "/auth/me", token);
    assert.equal(before.status, 200, "token should be valid before denylist entry");

    // 4. Insert the user_id into the denylist WITHOUT deleting the user row.
    //    This simulates the denylist check operating independently of the existence check.
    await db.insert(revokedTokensTable).values({ userId: user.id });

    try {
      // 5. The token must now be rejected by the denylist — even though the user row
      //    still exists in the DB.
      const after = await makeRequest("GET", "/auth/me", token);
      assert.equal(
        after.status,
        401,
        "token should be rejected by denylist even when user row still exists",
      );
    } finally {
      // Clean up: remove denylist entry and user row.
      await db.delete(revokedTokensTable).where(eq(revokedTokensTable.userId, user.id));
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }
  });

  test("DELETE /users/me populates the token denylist", async () => {
    // Verifies that the DELETE handler inserts a revoked_tokens row so the
    // denylist check has data to work with.

    const [user] = await db
      .insert(usersTable)
      .values({
        username: `denylist_del_${SUFFIX}`,
        passwordHash: "x",
        displayName: "Denylist Del Test",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });

    const token = signToken({ userId: user.id, username: user.username });

    const deleteRes = await makeRequest("DELETE", "/users/me", token);
    assert.equal(deleteRes.status, 204, "DELETE /users/me should return 204");

    // The revoked_tokens entry must have been created.
    const [entry] = await db
      .select()
      .from(revokedTokensTable)
      .where(eq(revokedTokensTable.userId, user.id));
    assert.ok(entry, "revoked_tokens entry should exist after account deletion");
    assert.equal(entry.userId, user.id);

    // Clean up the denylist entry (user row was already deleted by the route).
    await db.delete(revokedTokensTable).where(eq(revokedTokensTable.userId, user.id));
  });

  test("DELETE /users/me requires authentication", async () => {
    return new Promise<void>((resolve, reject) => {
      const url = new URL(`${baseUrl}/users/me`);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "DELETE",
        },
        (res: IncomingMessage) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => {
            try {
              assert.equal(
                res.statusCode,
                401,
                "unauthenticated request to DELETE /users/me should return 401",
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
});
