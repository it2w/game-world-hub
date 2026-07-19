/**
 * Integration tests for GET /factions/:id/members
 *
 * Covered scenarios:
 *  1. Unauthenticated request → 401
 *  2. Authenticated request → 200 with correct shape
 *     { total, members: [{ userId, displayName, username, avatarUrl, isPro, joinedAt }] }
 *  3. Pagination: offset=0 returns at most 20 rows
 *  4. Pagination: offset=20 returns the next batch
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let viewerUserId = 0;
let viewerUsername = "";
let testFactionId = 0;

const createdUserIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `fmtest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FMTest ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Ensure faction tables exist (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS factions (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      color       TEXT NOT NULL,
      icon_emoji  TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_factions (
      user_id    INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      faction_id INTEGER NOT NULL REFERENCES factions(id),
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create a dedicated test faction
  const { rows: fRows } = await pool.query<{ id: number }>(
    `INSERT INTO factions (name, slug, color, icon_emoji, description)
     VALUES ($1, $2, '#112233', '🧪', 'Roster test faction')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FMTestFaction_${SUFFIX}`, `fmtest_${SUFFIX}`],
  );
  testFactionId = fRows[0].id;

  // Create a viewer (authenticated caller) + 25 faction members (to test pagination)
  const userValues = [mkUser("viewer")];
  for (let i = 1; i <= 25; i++) {
    userValues.push(mkUser(`m${String(i).padStart(2, "0")}`));
  }

  const inserted = await db
    .insert(usersTable)
    .values(userValues)
    .returning({ id: usersTable.id, username: usersTable.username });

  viewerUserId = inserted[0].id;
  viewerUsername = inserted[0].username;
  createdUserIds.push(...inserted.map(u => u.id));

  // Enroll the 25 member users (indices 1–25) into the test faction
  const memberRows = inserted.slice(1).map(u => `(${u.id}, ${testFactionId})`).join(", ");
  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id) VALUES ${memberRows}
     ON CONFLICT (user_id) DO NOTHING`,
  );

  // Start the test HTTP server on an ephemeral port
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Remove faction memberships then users
  await pool.query(
    `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
    [createdUserIds],
  );
  await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  await pool.query(`DELETE FROM factions WHERE id = $1`, [testFactionId]);
  await pool.end();
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/** Authenticated GET request. */
async function authedGet(
  path: string,
  userId: number,
  username: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId, username });
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Unauthenticated GET request — no Authorization header. */
async function unauthGet(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /factions/:id/members", () => {
  test("returns 401 when no session is provided", async () => {
    const { status } = await unauthGet(`/factions/${testFactionId}/members`);
    assert.equal(status, 401, "unauthenticated caller must receive 401");
  });

  test("returns 200 with correct shape for an authenticated caller", async () => {
    const { status, body } = await authedGet(
      `/factions/${testFactionId}/members`,
      viewerUserId,
      viewerUsername,
    );
    assert.equal(status, 200, `expected 200 but got ${status}: ${JSON.stringify(body)}`);

    const resp = body as { total: number; members: unknown[] };
    // total may be a number or numeric string (pg bigint serializes as string)
    assert.ok(
      typeof resp.total === "number" || typeof resp.total === "string",
      "response must have a `total` field",
    );
    assert.ok(Array.isArray(resp.members), "response must have a `members` array");

    // First page must contain at most 20 rows (25 members exist)
    assert.ok(
      resp.members.length <= 20,
      `first page must contain at most 20 members, got ${resp.members.length}`,
    );
    assert.ok(resp.members.length > 0, "first page must contain at least one member");

    // total must reflect all 25 members
    assert.equal(
      Number(resp.total),
      25,
      `total should be 25 (all enrolled members), got ${resp.total}`,
    );

    // Verify shape of each member object
    for (const m of resp.members) {
      const member = m as Record<string, unknown>;
      assert.ok(typeof member.userId === "number",      "member.userId must be a number");
      assert.ok(typeof member.displayName === "string", "member.displayName must be a string");
      assert.ok(typeof member.username === "string",    "member.username must be a string");
      assert.ok(
        member.avatarUrl === null || typeof member.avatarUrl === "string",
        "member.avatarUrl must be null or a string",
      );
      assert.ok(typeof member.isPro === "boolean",      "member.isPro must be a boolean");
      assert.ok(typeof member.joinedAt === "string",    "member.joinedAt must be a string");
    }
  });

  test("offset=0 returns first 20 members (default page size)", async () => {
    const { status, body } = await authedGet(
      `/factions/${testFactionId}/members?offset=0`,
      viewerUserId,
      viewerUsername,
    );
    assert.equal(status, 200);

    const resp = body as { total: number; members: unknown[] };
    assert.equal(resp.members.length, 20, `page 1 should return exactly 20 rows, got ${resp.members.length}`);
    assert.equal(Number(resp.total), 25, `total should be 25, got ${resp.total}`);
  });

  test("offset=20 returns the remaining members (second page)", async () => {
    const { status, body } = await authedGet(
      `/factions/${testFactionId}/members?offset=20`,
      viewerUserId,
      viewerUsername,
    );
    assert.equal(status, 200);

    const resp = body as { total: number; members: unknown[] };
    assert.equal(resp.members.length, 5, `page 2 should return the remaining 5 rows, got ${resp.members.length}`);
    assert.equal(Number(resp.total), 25, `total should still be 25, got ${resp.total}`);
  });
});
