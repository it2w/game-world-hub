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
import { db, usersTable, revokedTokensTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import { objectStorageClient } from "../lib/objectStorage";
import { ensureClipsTables } from "./clips";
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

  test("DELETE /users/me triggers GCS cleanup for all clip media objects", async () => {
    // Ensure clips tables exist before seeding test data.
    await ensureClipsTables();

    // 1. Create a test user.
    const [user] = await db
      .insert(usersTable)
      .values({
        username: `gcs_cleanup_${SUFFIX}`,
        passwordHash: "x",
        displayName: "GCS Cleanup Test",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });

    const token = signToken({ userId: user.id, username: user.username });

    // 2. Seed two clips with distinct media URLs for this user.
    const { rows: [clip1] } = await pool.query<{ id: number }>(
      `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, "Clip One", "video/mp4"],
    );
    const { rows: [clip2] } = await pool.query<{ id: number }>(
      `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, "Clip Two", "image/png"],
    );
    const fileUrl1 = "/objects/uploads/gcs-test-file-uuid-1";
    const thumbUrl1 = "/objects/uploads/gcs-test-thumb-uuid-1";
    const fileUrl2 = "/objects/uploads/gcs-test-file-uuid-2";
    await pool.query(
      `INSERT INTO clips_media (clip_id, file_url, thumbnail_url) VALUES ($1, $2, $3)`,
      [clip1.id, fileUrl1, thumbUrl1],
    );
    await pool.query(
      `INSERT INTO clips_media (clip_id, file_url, thumbnail_url) VALUES ($1, $2, $3)`,
      [clip2.id, fileUrl2, null],
    );

    // 3. Spy on objectStorageClient so we can capture delete calls without
    //    hitting real GCS. We intercept bucket().file().delete() by replacing
    //    the `bucket` method on the singleton.
    const deletedObjects: string[] = [];
    const origBucket = objectStorageClient.bucket.bind(objectStorageClient);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (objectStorageClient as any).bucket = (bucketName: string) => ({
      file: (objectName: string) => ({
        delete: (_opts?: unknown) => {
          deletedObjects.push(`${bucketName}/${objectName}`);
          return Promise.resolve([{}]);
        },
        getMetadata: () => Promise.resolve([{}]),
        createReadStream: () => { throw new Error("not used"); },
      }),
    });

    // 4. Also set PRIVATE_OBJECT_DIR so deleteObjectSafe doesn't early-exit.
    //    Use a gs:// path so the bucket/object parsing is exercised.
    const origPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = "gs://test-bucket";

    try {
      // 5. Delete the account.
      const deleteRes = await makeRequest("DELETE", "/users/me", token);
      assert.equal(deleteRes.status, 204, "DELETE /users/me should return 204");

      // 6. Allow the async GCS cleanup to run (it's fire-and-forget after 204).
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      // 7. Confirm the three GCS object paths were passed to delete.
      //    Order is non-deterministic, so we sort before asserting.
      const expected = [
        `test-bucket/uploads/gcs-test-file-uuid-1`,
        `test-bucket/uploads/gcs-test-thumb-uuid-1`,
        `test-bucket/uploads/gcs-test-file-uuid-2`,
      ].sort();
      assert.deepEqual(
        deletedObjects.sort(),
        expected,
        "deleteObjectSafe should have been called for every clip media object",
      );

      // 8. Confirm the DB rows are gone via cascade (belt-and-suspenders).
      const { rows: mediaRows } = await pool.query(
        `SELECT clip_id FROM clips_media WHERE clip_id = ANY($1::int[])`,
        [[clip1.id, clip2.id]],
      );
      assert.equal(mediaRows.length, 0, "clips_media rows should be gone after account deletion");
    } finally {
      // Restore spy and env var regardless of test outcome.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (objectStorageClient as any).bucket = origBucket;
      if (origPrivateDir === undefined) {
        delete process.env.PRIVATE_OBJECT_DIR;
      } else {
        process.env.PRIVATE_OBJECT_DIR = origPrivateDir;
      }
      // Clean up any leftover rows if the deletion somehow failed.
      await pool.query(`DELETE FROM clips WHERE owner_id = $1`, [user.id]).catch(() => {});
      await db.delete(usersTable).where(eq(usersTable.id, user.id)).catch(() => {});
      await db.delete(revokedTokensTable).where(eq(revokedTokensTable.userId, user.id)).catch(() => {});
    }
  });
});
