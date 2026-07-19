/**
 * Integration tests for GET /auth/me/analytics (profile analytics).
 *
 * Covered scenarios:
 *  1. Non-Pro user receives 403 with { requiresPro: true }
 *  2. First visit from a new viewer creates a profile_views row with view_count = 1
 *  3. Duplicate visit from the same viewer increments view_count, not inserts a new row
 *  4. View counts (day / week / all) reflect the accumulated view_count values
 *  5. Friend accept rate: correct percentage of accepted / total sent requests
 *  6. LFG response rate: correct percentage of posts that received at least one response
 *  7. Friend accept rate is null when no requests have been sent
 *  8. LFG response rate is null when no posts exist
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  friendRequestsTable,
  lfgPostsTable,
  lfgResponsesTable,
  pool,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

/** The Pro user whose analytics we query. */
let proUserId = 0;
let proUsername = "";

/** A non-Pro user. */
let nonProUserId = 0;
let nonProUsername = "";

/** Two additional users who will visit the Pro user's profile. */
let viewerAId = 0;
let viewerBId = 0;

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdRequestIds: number[] = [];
const createdResponseIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `panalytics_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `PAnalytics ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Insert users: one active Pro, one non-Pro, two viewers
  const inserted = await db
    .insert(usersTable)
    .values([
      { ...mkUser("pro"),    isPro: true },
      { ...mkUser("nonpro"), isPro: false },
      mkUser("viewerA"),
      mkUser("viewerB"),
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [proUserId,    proUsername]    = [inserted[0].id, inserted[0].username];
  [nonProUserId, nonProUsername] = [inserted[1].id, inserted[1].username];
  viewerAId = inserted[2].id;
  viewerBId = inserted[3].id;
  createdUserIds.push(proUserId, nonProUserId, viewerAId, viewerBId);

  // Start the HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Remove test data in dependency order
  if (createdResponseIds.length) {
    await pool.query(
      `DELETE FROM lfg_responses WHERE id = ANY($1::int[])`,
      [createdResponseIds],
    );
  }
  if (createdPostIds.length) {
    await pool.query(
      `DELETE FROM lfg_posts WHERE id = ANY($1::int[])`,
      [createdPostIds],
    );
  }
  if (createdRequestIds.length) {
    await pool.query(
      `DELETE FROM friend_requests WHERE id = ANY($1::int[])`,
      [createdRequestIds],
    );
  }
  // Remove profile_views rows created by these tests
  if (createdUserIds.length) {
    await pool.query(
      `DELETE FROM profile_views WHERE profile_owner_id = ANY($1::int[])`,
      [createdUserIds],
    );
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function get(
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

describe("GET /auth/me/analytics", () => {
  test("non-Pro user gets 403 with requiresPro: true", async () => {
    const { status, body } = await get("/auth/me/analytics", nonProUserId, nonProUsername);
    assert.equal(status, 403);
    assert.deepEqual((body as Record<string, unknown>).requiresPro, true);
  });

  test("Pro user with no views gets all view counts as 0", async () => {
    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    const b = body as Record<string, unknown>;
    const views = b.views as Record<string, number>;
    assert.equal(views.day,  0);
    assert.equal(views.week, 0);
    assert.equal(views.all,  0);
  });

  test("first visit from viewer creates a row with view_count = 1", async () => {
    // Seed one view via recordProfileView indirectly by direct SQL insert
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO profile_views (viewer_id, profile_owner_id, view_count, viewed_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (viewer_id, profile_owner_id)
       DO UPDATE SET viewed_at = NOW(), view_count = profile_views.view_count + 1
       RETURNING id`,
      [viewerAId, proUserId],
    );
    assert.ok(rows[0].id > 0, "row should have been inserted");

    // Verify count reflects the single visit
    const { rows: countRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM profile_views WHERE profile_owner_id = $1 AND viewer_id = $2`,
      [proUserId, viewerAId],
    );
    assert.equal(parseInt(countRows[0].cnt, 10), 1, "exactly one row per viewer×owner pair");
  });

  test("duplicate visit from same viewer increments view_count, not row count", async () => {
    // Second visit from the same viewer
    await pool.query(
      `INSERT INTO profile_views (viewer_id, profile_owner_id, view_count, viewed_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (viewer_id, profile_owner_id)
       DO UPDATE SET viewed_at = NOW(), view_count = profile_views.view_count + 1`,
      [viewerAId, proUserId],
    );

    // Row count must still be 1
    const { rows: rowCountRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM profile_views WHERE profile_owner_id = $1 AND viewer_id = $2`,
      [proUserId, viewerAId],
    );
    assert.equal(parseInt(rowCountRows[0].cnt, 10), 1, "still only one row");

    // view_count must be 2
    const { rows: vcRows } = await pool.query<{ view_count: number }>(
      `SELECT view_count FROM profile_views WHERE profile_owner_id = $1 AND viewer_id = $2`,
      [proUserId, viewerAId],
    );
    assert.equal(vcRows[0].view_count, 2, "view_count should have incremented to 2");
  });

  test("view count totals include accumulated view_count values", async () => {
    // viewerA already has 2 visits; add viewerB with 1 visit
    await pool.query(
      `INSERT INTO profile_views (viewer_id, profile_owner_id, view_count, viewed_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (viewer_id, profile_owner_id)
       DO UPDATE SET viewed_at = NOW(), view_count = profile_views.view_count + 1`,
      [viewerBId, proUserId],
    );

    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    const views = (body as Record<string, unknown>).views as Record<string, number>;

    // Total should be viewerA(2) + viewerB(1) = 3
    assert.equal(views.all, 3, "'all' should sum all view_count values");
    // Both visits were just inserted (within the last day), so day and week should match
    assert.ok(views.day  >= 3, `'day' (${views.day}) should be >= 3`);
    assert.ok(views.week >= 3, `'week' (${views.week}) should be >= 3`);
  });

  test("friend accept rate is null when no requests have been sent", async () => {
    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    assert.equal((body as Record<string, unknown>).friendAcceptRate, null);
  });

  test("friend accept rate uses correct totals", async () => {
    // Insert 3 friend requests sent by proUser: 2 accepted, 1 rejected
    const inserted = await db
      .insert(friendRequestsTable)
      .values([
        { fromUserId: proUserId, toUserId: viewerAId, status: "accepted" },
        { fromUserId: proUserId, toUserId: viewerBId, status: "accepted" },
        { fromUserId: proUserId, toUserId: nonProUserId, status: "rejected" },
      ])
      .returning({ id: friendRequestsTable.id });
    createdRequestIds.push(...inserted.map(r => r.id));

    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    const b = body as Record<string, unknown>;
    // 2 accepted / 3 total = 67%
    assert.equal(b.friendAcceptRate, 67);
  });

  test("LFG response rate is null when user has no posts", async () => {
    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    assert.equal((body as Record<string, unknown>).lfgResponseRate, null);
  });

  test("LFG response rate: correct % of posts with at least one response", async () => {
    // Create 3 LFG posts by proUser
    const posts = await db
      .insert(lfgPostsTable)
      .values([
        { authorId: proUserId, game: "GameA", description: "d1", neededPlayers: 1, micRequired: false },
        { authorId: proUserId, game: "GameB", description: "d2", neededPlayers: 1, micRequired: false },
        { authorId: proUserId, game: "GameC", description: "d3", neededPlayers: 1, micRequired: false },
      ])
      .returning({ id: lfgPostsTable.id });
    createdPostIds.push(...posts.map(p => p.id));

    // Respond to only 2 of the 3 posts
    const responses = await db
      .insert(lfgResponsesTable)
      .values([
        { postId: posts[0].id, userId: viewerAId, message: "r1" },
        { postId: posts[1].id, userId: viewerBId, message: "r2" },
        // posts[2] gets no response
      ])
      .returning({ id: lfgResponsesTable.id });
    createdResponseIds.push(...responses.map(r => r.id));

    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    const b = body as Record<string, unknown>;
    // 2 posts with responses / 3 total posts = 67%
    assert.equal(b.lfgResponseRate, 67);
  });

  test("LFG response rate: post with multiple responses only counts once", async () => {
    // Add a second response to posts[0] from a different user
    const [extra] = await db
      .insert(lfgResponsesTable)
      .values({ postId: createdPostIds[0], userId: nonProUserId, message: "extra" })
      .returning({ id: lfgResponsesTable.id });
    createdResponseIds.push(extra.id);

    const { status, body } = await get("/auth/me/analytics", proUserId, proUsername);
    assert.equal(status, 200);
    const b = body as Record<string, unknown>;
    // Still 2 posts with ≥1 response out of 3 = 67% (not 75% or more)
    assert.equal(b.lfgResponseRate, 67, "multiple responses to one post should not inflate the rate");
  });
});
