/**
 * Integration tests for GET /factions/:id/members
 *
 * Covered scenarios:
 *  1. Unauthenticated request → 401
 *  2. Authenticated request → 200 with correct shape
 *     { total, members: [{ userId, displayName, username, avatarUrl, isPro, joinedAt }] }
 *  3. Pagination: offset=0 returns at most 20 rows
 *  4. Pagination: offset=20 returns the next batch
 *  5. sort=weekly_pts with all-zero activity → tiebreaker joined_at DESC is applied
 *  6. sort=weekly_pts with mixed activity → non-zero pts members appear before zero-pts members
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable, lfgPostsTable } from "@workspace/db";
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

// ─── Sort tests ───────────────────────────────────────────────────────────────

describe("GET /factions/:id/members?sort=weekly_pts — tiebreaker and ordering", () => {
  /**
   * Fixtures for this suite:
   *  - sortFactionId: a dedicated faction
   *  - memberOldId:   joined 2025-01-01  (oldest)
   *  - memberMidId:   joined 2025-06-01  (middle)
   *  - memberNewId:   joined 2026-01-01  (newest)
   *  - memberActiveId: joined 2025-03-01, has one lfg_post this week → weekly_pts = 5
   *
   * memberOldId, memberMidId, memberNewId all have weekly_pts = 0.
   * Expected order with sort=weekly_pts:
   *   1. memberActiveId (5 pts)
   *   2. memberNewId    (0 pts, joined_at 2026-01-01 — most recent)
   *   3. memberMidId    (0 pts, joined_at 2025-06-01)
   *   4. memberOldId    (0 pts, joined_at 2025-01-01 — oldest)
   */

  const SORT_SUFFIX = `sort_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const sortCreatedUserIds: number[] = [];
  let sortFactionId = 0;
  let memberOldId = 0;
  let memberMidId = 0;
  let memberNewId = 0;
  let memberActiveId = 0;
  let lfgPostId = 0;

  before(async () => {
    // Create the dedicated sort-test faction
    const { rows: fRows } = await pool.query<{ id: number }>(
      `INSERT INTO factions (name, slug, color, icon_emoji, description)
       VALUES ($1, $2, '#aabbcc', '🔬', 'Sort-order test faction')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [`SortFaction_${SORT_SUFFIX}`, `sorttest_${SORT_SUFFIX}`],
    );
    sortFactionId = fRows[0].id;

    // Create four users for this suite
    const inserted = await db
      .insert(usersTable)
      .values([
        { username: `srt_old_${SORT_SUFFIX}`, passwordHash: "x", displayName: "Sort Old",    status: "online" as const },
        { username: `srt_mid_${SORT_SUFFIX}`, passwordHash: "x", displayName: "Sort Mid",    status: "online" as const },
        { username: `srt_new_${SORT_SUFFIX}`, passwordHash: "x", displayName: "Sort New",    status: "online" as const },
        { username: `srt_act_${SORT_SUFFIX}`, passwordHash: "x", displayName: "Sort Active", status: "online" as const },
      ])
      .returning({ id: usersTable.id });

    memberOldId    = inserted[0].id;
    memberMidId    = inserted[1].id;
    memberNewId    = inserted[2].id;
    memberActiveId = inserted[3].id;
    sortCreatedUserIds.push(memberOldId, memberMidId, memberNewId, memberActiveId);

    // Insert into user_factions with explicit joined_at timestamps
    await pool.query(
      `INSERT INTO user_factions (user_id, faction_id, joined_at) VALUES
         ($1, $5, '2025-01-01T00:00:00Z'),
         ($2, $5, '2025-06-01T00:00:00Z'),
         ($3, $5, '2026-01-01T00:00:00Z'),
         ($4, $5, '2025-03-01T00:00:00Z')`,
      [memberOldId, memberMidId, memberNewId, memberActiveId, sortFactionId],
    );

    // Give memberActive one lfg_post this week so their weekly_pts = 5
    const [post] = await db
      .insert(lfgPostsTable)
      .values({
        authorId:    memberActiveId,
        game:        "Test Game",
        description: "Sort test post",
        status:      "open",
      })
      .returning({ id: lfgPostsTable.id });
    lfgPostId = post.id;
  });

  after(async () => {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [lfgPostId]));
    await pool.query(
      `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
      [sortCreatedUserIds],
    );
    await db.delete(usersTable).where(inArray(usersTable.id, sortCreatedUserIds));
    await pool.query(`DELETE FROM factions WHERE id = $1`, [sortFactionId]);
  });

  test(
    "all-zero weekly_pts: tiebreaker joined_at DESC puts newest joiner first",
    async () => {
      // Only test the three zero-pts members by checking just those three users
      // in the response. We request all members (limit=50) and extract the
      // three known zero-pts members in the order they appear.
      const { status, body } = await authedGet(
        `/factions/${sortFactionId}/members?sort=weekly_pts&limit=50`,
        viewerUserId,
        viewerUsername,
      );
      assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

      const resp = body as { total: number; members: Array<{ userId: number; weeklyPts: number; joinedAt: string }> };
      assert.equal(Number(resp.total), 4, `expected 4 members total, got ${resp.total}`);

      // Extract only the zero-pts members (Old, Mid, New) in their response order
      const zeroPtsOrdered = resp.members
        .filter(m => [memberOldId, memberMidId, memberNewId].includes(m.userId));

      assert.equal(
        zeroPtsOrdered.length,
        3,
        `expected 3 zero-pts members in response, got ${zeroPtsOrdered.length}`,
      );

      // All three must have weekly_pts = 0
      for (const m of zeroPtsOrdered) {
        assert.equal(
          m.weeklyPts,
          0,
          `member ${m.userId} should have weeklyPts=0, got ${m.weeklyPts}`,
        );
      }

      // joined_at DESC → memberNew (2026-01-01) first, then Mid (2025-06-01), then Old (2025-01-01)
      assert.equal(
        zeroPtsOrdered[0].userId,
        memberNewId,
        `first zero-pts member should be the newest joiner (userId=${memberNewId}), got ${zeroPtsOrdered[0].userId}`,
      );
      assert.equal(
        zeroPtsOrdered[1].userId,
        memberMidId,
        `second zero-pts member should be the mid joiner (userId=${memberMidId}), got ${zeroPtsOrdered[1].userId}`,
      );
      assert.equal(
        zeroPtsOrdered[2].userId,
        memberOldId,
        `third zero-pts member should be the oldest joiner (userId=${memberOldId}), got ${zeroPtsOrdered[2].userId}`,
      );
    },
  );

  test(
    "non-zero weekly_pts members appear before zero-pts members",
    async () => {
      const { status, body } = await authedGet(
        `/factions/${sortFactionId}/members?sort=weekly_pts&limit=50`,
        viewerUserId,
        viewerUsername,
      );
      assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

      const resp = body as { total: number; members: Array<{ userId: number; weeklyPts: number }> };

      // memberActive has an LFG post this week → weekly_pts = 5; must be first
      const activeIndex = resp.members.findIndex(m => m.userId === memberActiveId);
      assert.ok(activeIndex !== -1, "memberActive must appear in the response");
      assert.ok(
        resp.members[activeIndex].weeklyPts > 0,
        `memberActive weeklyPts should be > 0, got ${resp.members[activeIndex].weeklyPts}`,
      );

      // All zero-pts members must appear after the active member
      const zeroIndices = resp.members
        .map((m, i) => ({ idx: i, userId: m.userId, pts: m.weeklyPts }))
        .filter(e => [memberOldId, memberMidId, memberNewId].includes(e.userId));

      for (const { idx, userId } of zeroIndices) {
        assert.ok(
          idx > activeIndex,
          `zero-pts member ${userId} (index ${idx}) must appear after active member (index ${activeIndex})`,
        );
      }
    },
  );
});
