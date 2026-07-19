/**
 * Integration tests for GET /users/spotlight — spotlight opt-out behaviour.
 *
 * Covered scenarios:
 *  - A Pro user with spotlightOptOut=false appears in the spotlight response
 *  - After PATCHing spotlightOptOut=true the same user no longer appears
 *  - The cache is invalidated immediately on PATCH so the change is visible
 *    on the very next request (not after 1 hour)
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray, eq } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let proUserId = 0;
let proUsername = "";

const createdUserIds: number[] = [];

before(async () => {
  // Ensure the spotlight_opt_out column exists (added by the API server on
  // first boot; tests run without the full server startup sequence).
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS spotlight_opt_out BOOLEAN NOT NULL DEFAULT false`,
  );

  // A Pro user who is online, not opted out, and whose Pro status is active
  // (no proExpiresAt means it never expires).
  proUsername = `spotlight_pro_${SUFFIX}`;
  const [proUser] = await db
    .insert(usersTable)
    .values({
      username: proUsername,
      passwordHash: "x",
      displayName: "Spotlight Pro",
      status: "online",
      isPro: true,
      spotlightOptOut: false,
    })
    .returning({ id: usersTable.id });

  proUserId = proUser.id;
  createdUserIds.push(proUserId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type JsonBody = Record<string, unknown> | unknown[];

async function getSpotlight(): Promise<{ status: number; body: JsonBody }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/users/spotlight`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data as unknown as JsonBody });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function patchProfile(
  userId: number,
  username: string,
  updates: Record<string, unknown>,
): Promise<{ status: number; body: JsonBody }> {
  const token = signToken({ userId, username });
  const payload = JSON.stringify(updates);

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/users/${userId}/profile`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data as unknown as JsonBody });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Return true if any item in the spotlight array has the given user id. */
function isInSpotlight(body: JsonBody, userId: number): boolean {
  if (!Array.isArray(body)) return false;
  return (body as Array<{ id: number }>).some((u) => u.id === userId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /users/spotlight — opt-out behaviour", () => {
  /**
   * Ensure the module-level spotlight cache doesn't contain stale data from a
   * previous test run. We PATCH spotlightOptOut=false on our own user, which
   * sets the value to its default AND nullifies the cache variable in users.ts.
   */
  before(async () => {
    const patch = await patchProfile(proUserId, proUsername, { spotlightOptOut: false });
    assert.equal(patch.status, 200, `Cache-bust PATCH failed: ${JSON.stringify(patch.body)}`);
  });

  test("Pro user with spotlightOptOut=false appears in GET /users/spotlight", async () => {
    const res = await getSpotlight();
    assert.equal(res.status, 200, "spotlight endpoint should return 200");
    assert.ok(
      Array.isArray(res.body),
      `response body should be an array, got ${JSON.stringify(res.body)}`,
    );
    assert.ok(
      isInSpotlight(res.body, proUserId),
      `Pro user ${proUserId} should appear in the spotlight when spotlightOptOut=false`,
    );
  });

  test("PATCHing spotlightOptOut=true removes the user from the next GET /users/spotlight", async () => {
    // Opt out — this should also null the spotlight cache immediately.
    const patch = await patchProfile(proUserId, proUsername, { spotlightOptOut: true });
    assert.equal(patch.status, 200, `Profile PATCH should succeed; got ${JSON.stringify(patch.body)}`);

    // Confirm the DB was updated.
    const [row] = await db
      .select({ spotlightOptOut: usersTable.spotlightOptOut })
      .from(usersTable)
      .where(eq(usersTable.id, proUserId));
    assert.equal(row.spotlightOptOut, true, "spotlightOptOut should be true in DB after PATCH");

    // The very next spotlight request must NOT include the opted-out user.
    // If the cache had NOT been invalidated the previous cached response (which
    // included the user) would still be served for up to 1 hour.
    const res = await getSpotlight();
    assert.equal(res.status, 200, "spotlight endpoint should still return 200 after opt-out");
    assert.ok(
      !isInSpotlight(res.body, proUserId),
      `Opted-out user ${proUserId} must NOT appear in spotlight immediately after PATCH`,
    );
  });

  test("cache is invalidated immediately — opted-out user absent without waiting 1 hour", async () => {
    // This test is explicit about the cache-invalidation contract.
    // We already PATCHed spotlightOptOut=true in the previous test.
    // Call the endpoint a second time in the same second — the cache will now
    // be populated with data that excludes the opted-out user; if it had NOT
    // been invalidated the old (opt-in) cache would have been served.
    const res = await getSpotlight();
    assert.equal(res.status, 200, "spotlight should return 200 on repeated call");
    assert.ok(
      !isInSpotlight(res.body, proUserId),
      `Opted-out user ${proUserId} must remain absent from spotlight on repeated request`,
    );
  });

  test("opting back in (spotlightOptOut=false) makes the user reappear on the next GET /users/spotlight", async () => {
    // At this point the user has spotlightOptOut=true from the previous test.
    // Reverse the opt-out — this must also invalidate the cache so the user
    // is visible again immediately, without waiting up to 1 hour for TTL expiry.
    const patch = await patchProfile(proUserId, proUsername, { spotlightOptOut: false });
    assert.equal(
      patch.status,
      200,
      `Opt-back-in PATCH should succeed; got ${JSON.stringify(patch.body)}`,
    );

    // Confirm the DB value was updated.
    const [row] = await db
      .select({ spotlightOptOut: usersTable.spotlightOptOut })
      .from(usersTable)
      .where(eq(usersTable.id, proUserId));
    assert.equal(row.spotlightOptOut, false, "spotlightOptOut should be false in DB after opting back in");

    // The very next request must include the user again.
    // A caching bug that only invalidated on opt-out (not on opt-back-in) would
    // still serve the old cache (which excludes the user) for up to 1 hour.
    const res = await getSpotlight();
    assert.equal(res.status, 200, "spotlight endpoint should return 200 after opting back in");
    assert.ok(
      isInSpotlight(res.body, proUserId),
      `User ${proUserId} must reappear in spotlight immediately after opting back in (spotlightOptOut=false)`,
    );
  });
});
