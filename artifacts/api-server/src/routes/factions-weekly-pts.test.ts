/**
 * Integration tests verifying that the per-member weeklyPts formula in
 * GET /factions/:id/members is correct and consistent with the faction-level
 * weekly_points returned by GET /factions.
 *
 * Formula: lfg_posts×5 + lfg_responses×3 + messages×1
 *          (all within the current ISO week, i.e. >= date_trunc('week', NOW() AT TIME ZONE 'UTC'))
 *
 * Covered scenarios:
 *  1. Seeding known activity for two members and asserting correct weeklyPts per member
 *  2. The sum of member weeklyPts for the test faction matches its weekly_points in GET /factions
 *  3. A member with zero activity this week reports weeklyPts = 0
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  lfgPostsTable,
  lfgResponsesTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// Users
let viewerId = 0;
let viewerUsername = "";
let activeUserId = 0;   // will have known this-week activity
let quietUserId = 0;    // will have no this-week activity
let zeroUserId = 0;     // faction member but zero activity

let testFactionId = 0;
let testConvId = 0;

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdResponseIds: number[] = [];
const createdMessageIds: number[] = [];
const createdConvIds: number[] = [];

/**
 * Activity seeded for activeUser this week:
 *   2 lfg_posts     → 2 × 5 = 10
 *   1 lfg_response  → 1 × 3 =  3
 *   4 messages      → 4 × 1 =  4
 *                          ──────
 *   weeklyPts             = 17
 *
 * Activity seeded for quietUser this week:
 *   1 lfg_post      → 1 × 5 =  5
 *   2 lfg_responses → 2 × 3 =  6
 *   1 message       → 1 × 1 =  1
 *                          ──────
 *   weeklyPts             = 12
 *
 * zeroUser: no activity → weeklyPts = 0
 *
 * Faction total: 17 + 12 + 0 = 29
 */
const ACTIVE_WEEKLY_PTS = 17;
const QUIET_WEEKLY_PTS = 12;
const ZERO_WEEKLY_PTS = 0;
const FACTION_WEEKLY_TOTAL = ACTIVE_WEEKLY_PTS + QUIET_WEEKLY_PTS + ZERO_WEEKLY_PTS;

function mkUser(label: string) {
  return {
    username: `fwpts_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FWPts ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Ensure faction tables exist (all CREATE TABLE IF NOT EXISTS — idempotent)
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
     VALUES ($1, $2, '#aabbcc', '🧪', 'Weekly-pts test faction')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FWPtsTestFaction_${SUFFIX}`, `fwpts_${SUFFIX}`],
  );
  testFactionId = fRows[0].id;

  // Create test users
  const inserted = await db
    .insert(usersTable)
    .values([mkUser("viewer"), mkUser("active"), mkUser("quiet"), mkUser("zero")])
    .returning({ id: usersTable.id, username: usersTable.username });

  viewerId = inserted[0].id;
  viewerUsername = inserted[0].username;
  activeUserId = inserted[1].id;
  quietUserId = inserted[2].id;
  zeroUserId = inserted[3].id;
  createdUserIds.push(viewerId, activeUserId, quietUserId, zeroUserId);

  // Enroll active, quiet, and zero users in the test faction (not the viewer)
  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id) VALUES ($1,$2), ($3,$2), ($4,$2)`,
    [activeUserId, testFactionId, quietUserId, zeroUserId],
  );

  // Create a conversation so messages have a valid conversation_id
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "group" })
    .returning({ id: conversationsTable.id });
  testConvId = conv.id;
  createdConvIds.push(testConvId);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: testConvId, userId: activeUserId },
    { conversationId: testConvId, userId: quietUserId },
  ]);

  // ── Seed activeUser activity (this week) ─────────────────────────────────

  // 2 lfg_posts
  const activePosts = await db
    .insert(lfgPostsTable)
    .values([
      { authorId: activeUserId, game: "TestGame", description: "Post A", neededPlayers: 1, micRequired: false, status: "open" as const },
      { authorId: activeUserId, game: "TestGame", description: "Post B", neededPlayers: 1, micRequired: false, status: "open" as const },
    ])
    .returning({ id: lfgPostsTable.id });
  createdPostIds.push(...activePosts.map(p => p.id));

  // 1 lfg_response (activeUser responds to the first post they own — reuse a different post)
  // We need a post to respond to; use quietUser's post created below — but quietUser's posts
  // don't exist yet. Create a dummy "anchor" post now owned by quietUser after we create it.
  // Simpler: create a stub post owned by the viewer (not a faction member) for responses.
  const [anchorPost] = await db
    .insert(lfgPostsTable)
    .values({ authorId: viewerId, game: "AnchorGame", description: "Anchor post", neededPlayers: 4, micRequired: false, status: "open" as const })
    .returning({ id: lfgPostsTable.id });
  createdPostIds.push(anchorPost.id);

  const [activeResp] = await db
    .insert(lfgResponsesTable)
    .values({ postId: anchorPost.id, userId: activeUserId, message: "I'm in" })
    .returning({ id: lfgResponsesTable.id });
  createdResponseIds.push(activeResp.id);

  // 4 messages
  const activeMsgs = await db
    .insert(messagesTable)
    .values([
      { conversationId: testConvId, senderId: activeUserId, content: "msg 1" },
      { conversationId: testConvId, senderId: activeUserId, content: "msg 2" },
      { conversationId: testConvId, senderId: activeUserId, content: "msg 3" },
      { conversationId: testConvId, senderId: activeUserId, content: "msg 4" },
    ])
    .returning({ id: messagesTable.id });
  createdMessageIds.push(...activeMsgs.map(m => m.id));

  // ── Seed quietUser activity (this week) ──────────────────────────────────

  // 1 lfg_post
  const [quietPost] = await db
    .insert(lfgPostsTable)
    .values({ authorId: quietUserId, game: "TestGame", description: "Quiet post", neededPlayers: 1, micRequired: false, status: "open" as const })
    .returning({ id: lfgPostsTable.id });
  createdPostIds.push(quietPost.id);

  // 2 lfg_responses
  const quietResps = await db
    .insert(lfgResponsesTable)
    .values([
      { postId: anchorPost.id, userId: quietUserId, message: "Me too" },
      { postId: quietPost.id,  userId: viewerId,     message: "Join" }, // viewerId responds to quiet's post — not counted for quiet
    ])
    .returning({ id: lfgResponsesTable.id });
  // Only the first response belongs to quietUser
  createdResponseIds.push(...quietResps.map(r => r.id));

  // Wait — I need 2 responses from quietUser, not one from quietUser and one from viewer.
  // viewerId responding doesn't count towards quietUser. Let me create a second anchor post
  // owned by viewer for quietUser to respond to.
  const [anchorPost2] = await db
    .insert(lfgPostsTable)
    .values({ authorId: viewerId, game: "AnchorGame2", description: "Anchor post 2", neededPlayers: 4, micRequired: false, status: "open" as const })
    .returning({ id: lfgPostsTable.id });
  createdPostIds.push(anchorPost2.id);

  const [quietResp2] = await db
    .insert(lfgResponsesTable)
    .values({ postId: anchorPost2.id, userId: quietUserId, message: "In!" })
    .returning({ id: lfgResponsesTable.id });
  createdResponseIds.push(quietResp2.id);

  // 1 message
  const [quietMsg] = await db
    .insert(messagesTable)
    .values({ conversationId: testConvId, senderId: quietUserId, content: "hey" })
    .returning({ id: messagesTable.id });
  createdMessageIds.push(quietMsg.id);

  // zeroUser: no activity seeded

  // Start HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Clean up in dependency order
  if (createdMessageIds.length) {
    await db.delete(messagesTable).where(inArray(messagesTable.id, createdMessageIds));
  }
  if (createdConvIds.length) {
    await db
      .delete(conversationParticipantsTable)
      .where(inArray(conversationParticipantsTable.conversationId, createdConvIds));
    await db
      .delete(conversationsTable)
      .where(inArray(conversationsTable.id, createdConvIds));
  }
  if (createdResponseIds.length) {
    await db.delete(lfgResponsesTable).where(inArray(lfgResponsesTable.id, createdResponseIds));
  }
  if (createdPostIds.length) {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, createdPostIds));
  }
  await pool.query(
    `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
    [[activeUserId, quietUserId, zeroUserId]],
  );
  await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  await pool.query(`DELETE FROM factions WHERE id = $1`, [testFactionId]);
  await pool.end();
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function authedGet(path: string): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: viewerId, username: viewerUsername });
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /factions/:id/members — weeklyPts formula", () => {
  test("returns weeklyPts field for every member", async () => {
    const { status, body } = await authedGet(`/factions/${testFactionId}/members?limit=50`);
    assert.equal(status, 200, `expected 200 but got ${status}: ${JSON.stringify(body)}`);

    const resp = body as { total: number; members: Array<Record<string, unknown>> };
    assert.ok(Array.isArray(resp.members), "members must be an array");

    for (const m of resp.members) {
      assert.ok(
        typeof m.weeklyPts === "number",
        `member ${m.userId} must have a numeric weeklyPts, got ${typeof m.weeklyPts}`,
      );
      assert.ok(m.weeklyPts >= 0, `weeklyPts must be non-negative, got ${m.weeklyPts}`);
    }
  });

  test("activeUser weeklyPts matches the seeded formula: posts×5 + responses×3 + messages×1", async () => {
    const { status, body } = await authedGet(`/factions/${testFactionId}/members?limit=50`);
    assert.equal(status, 200);

    const resp = body as { members: Array<Record<string, unknown>> };
    const active = resp.members.find(m => m.userId === activeUserId);
    assert.ok(active, `activeUser (id=${activeUserId}) not found in members list`);

    assert.equal(
      active.weeklyPts,
      ACTIVE_WEEKLY_PTS,
      `activeUser weeklyPts should be ${ACTIVE_WEEKLY_PTS} (2 posts×5 + 1 response×3 + 4 messages×1), got ${active.weeklyPts}`,
    );
  });

  test("quietUser weeklyPts matches the seeded formula: posts×5 + responses×3 + messages×1", async () => {
    const { status, body } = await authedGet(`/factions/${testFactionId}/members?limit=50`);
    assert.equal(status, 200);

    const resp = body as { members: Array<Record<string, unknown>> };
    const quiet = resp.members.find(m => m.userId === quietUserId);
    assert.ok(quiet, `quietUser (id=${quietUserId}) not found in members list`);

    assert.equal(
      quiet.weeklyPts,
      QUIET_WEEKLY_PTS,
      `quietUser weeklyPts should be ${QUIET_WEEKLY_PTS} (1 post×5 + 2 responses×3 + 1 message×1), got ${quiet.weeklyPts}`,
    );
  });

  test("zeroUser with no activity reports weeklyPts = 0", async () => {
    const { status, body } = await authedGet(`/factions/${testFactionId}/members?limit=50`);
    assert.equal(status, 200);

    const resp = body as { members: Array<Record<string, unknown>> };
    const zero = resp.members.find(m => m.userId === zeroUserId);
    assert.ok(zero, `zeroUser (id=${zeroUserId}) not found in members list`);

    assert.equal(
      zero.weeklyPts,
      ZERO_WEEKLY_PTS,
      `zeroUser weeklyPts should be 0 but got ${zero.weeklyPts}`,
    );
  });
});

describe("GET /factions — weekly_points consistency with member weeklyPts", () => {
  test("faction weekly_points equals the sum of all member weeklyPts", async () => {
    // Fetch per-member points
    const { status: mStatus, body: mBody } = await authedGet(
      `/factions/${testFactionId}/members?limit=50`,
    );
    assert.equal(mStatus, 200);
    const membersResp = mBody as { members: Array<Record<string, unknown>> };

    const memberSum = membersResp.members.reduce(
      (acc, m) => acc + (m.weeklyPts as number),
      0,
    );

    // Fetch faction-level leaderboard
    const { status: fStatus, body: fBody } = await authedGet("/factions");
    assert.equal(fStatus, 200);
    const factions = fBody as Array<Record<string, unknown>>;

    const testFaction = factions.find(f => f.id === testFactionId);
    assert.ok(
      testFaction,
      `test faction (id=${testFactionId}) not found in GET /factions response`,
    );

    assert.equal(
      testFaction.weekly_points,
      memberSum,
      `faction weekly_points (${testFaction.weekly_points}) must equal sum of member weeklyPts (${memberSum})`,
    );
  });

  test("faction weekly_points matches the expected total from seeded activity", async () => {
    const { status, body } = await authedGet("/factions");
    assert.equal(status, 200);
    const factions = body as Array<Record<string, unknown>>;

    const testFaction = factions.find(f => f.id === testFactionId);
    assert.ok(testFaction, `test faction (id=${testFactionId}) not found`);

    assert.equal(
      testFaction.weekly_points,
      FACTION_WEEKLY_TOTAL,
      `faction weekly_points should be ${FACTION_WEEKLY_TOTAL} (active=${ACTIVE_WEEKLY_PTS} + quiet=${QUIET_WEEKLY_PTS} + zero=${ZERO_WEEKLY_PTS}), got ${testFaction.weekly_points}`,
    );
  });
});

describe("GET /factions/:id/weekly-top — consistency with GET /factions/:id/members", () => {
  test("weekly-top weeklyPoints matches members weeklyPts for the top contributor (activeUser)", async () => {
    const [{ status: mStatus, body: mBody }, { status: wStatus, body: wBody }] = await Promise.all([
      authedGet(`/factions/${testFactionId}/members?limit=50`),
      authedGet(`/factions/${testFactionId}/weekly-top?limit=25`),
    ]);
    assert.equal(mStatus, 200, `members returned ${mStatus}: ${JSON.stringify(mBody)}`);
    assert.equal(wStatus, 200, `weekly-top returned ${wStatus}: ${JSON.stringify(wBody)}`);

    const membersResp = mBody as { members: Array<Record<string, unknown>> };
    const topResp = wBody as { contributors: Array<Record<string, unknown>> };

    const activeMember = membersResp.members.find(m => m.userId === activeUserId);
    assert.ok(activeMember, `activeUser (id=${activeUserId}) not found in members`);

    const activeContributor = topResp.contributors.find(c => c.userId === activeUserId);
    assert.ok(activeContributor, `activeUser (id=${activeUserId}) not found in weekly-top`);

    assert.equal(
      activeContributor.weeklyPoints,
      activeMember.weeklyPts,
      `weekly-top weeklyPoints (${activeContributor.weeklyPoints}) must match members weeklyPts (${activeMember.weeklyPts}) for activeUser`,
    );
  });

  test("weekly-top weeklyPoints matches members weeklyPts for quietUser", async () => {
    const [{ status: mStatus, body: mBody }, { status: wStatus, body: wBody }] = await Promise.all([
      authedGet(`/factions/${testFactionId}/members?limit=50`),
      authedGet(`/factions/${testFactionId}/weekly-top?limit=25`),
    ]);
    assert.equal(mStatus, 200);
    assert.equal(wStatus, 200);

    const membersResp = mBody as { members: Array<Record<string, unknown>> };
    const topResp = wBody as { contributors: Array<Record<string, unknown>> };

    const quietMember = membersResp.members.find(m => m.userId === quietUserId);
    assert.ok(quietMember, `quietUser (id=${quietUserId}) not found in members`);

    const quietContributor = topResp.contributors.find(c => c.userId === quietUserId);
    assert.ok(quietContributor, `quietUser (id=${quietUserId}) not found in weekly-top`);

    assert.equal(
      quietContributor.weeklyPoints,
      quietMember.weeklyPts,
      `weekly-top weeklyPoints (${quietContributor.weeklyPoints}) must match members weeklyPts (${quietMember.weeklyPts}) for quietUser`,
    );
  });

  test("zeroUser weeklyPoints is 0 in weekly-top and matches members weeklyPts", async () => {
    const [{ status: mStatus, body: mBody }, { status: wStatus, body: wBody }] = await Promise.all([
      authedGet(`/factions/${testFactionId}/members?limit=50`),
      authedGet(`/factions/${testFactionId}/weekly-top?limit=25`),
    ]);
    assert.equal(mStatus, 200);
    assert.equal(wStatus, 200);

    const membersResp = mBody as { members: Array<Record<string, unknown>> };
    const topResp = wBody as { contributors: Array<Record<string, unknown>> };

    const zeroMember = membersResp.members.find(m => m.userId === zeroUserId);
    assert.ok(zeroMember, `zeroUser (id=${zeroUserId}) not found in members`);
    assert.equal(zeroMember.weeklyPts, 0, `zeroUser weeklyPts in members should be 0`);

    // zeroUser may or may not appear in weekly-top (zero pts, still a member)
    const zeroContributor = topResp.contributors.find(c => c.userId === zeroUserId);
    if (zeroContributor) {
      assert.equal(
        zeroContributor.weeklyPoints,
        zeroMember.weeklyPts,
        `weekly-top weeklyPoints (${zeroContributor.weeklyPoints}) must match members weeklyPts (${zeroMember.weeklyPts}) for zeroUser`,
      );
    }
  });

  test("all weekly-top contributors have a matching weeklyPts in the members list", async () => {
    const [{ status: mStatus, body: mBody }, { status: wStatus, body: wBody }] = await Promise.all([
      authedGet(`/factions/${testFactionId}/members?limit=50`),
      authedGet(`/factions/${testFactionId}/weekly-top?limit=25`),
    ]);
    assert.equal(mStatus, 200);
    assert.equal(wStatus, 200);

    const membersResp = mBody as { members: Array<Record<string, unknown>> };
    const topResp = wBody as { contributors: Array<Record<string, unknown>> };

    // Build a lookup from userId → weeklyPts from the members endpoint
    const memberPtsById = new Map<number, number>();
    for (const m of membersResp.members) {
      memberPtsById.set(m.userId as number, m.weeklyPts as number);
    }

    for (const contributor of topResp.contributors) {
      const uid = contributor.userId as number;
      assert.ok(
        memberPtsById.has(uid),
        `contributor userId=${uid} from weekly-top not found in members list`,
      );
      assert.equal(
        contributor.weeklyPoints,
        memberPtsById.get(uid),
        `contributor userId=${uid}: weekly-top weeklyPoints (${contributor.weeklyPoints}) !== members weeklyPts (${memberPtsById.get(uid)})`,
      );
    }
  });

  test("weekly-top activeUser weeklyPoints equals the expected seeded value", async () => {
    const { status, body } = await authedGet(`/factions/${testFactionId}/weekly-top?limit=25`);
    assert.equal(status, 200);

    const topResp = body as { contributors: Array<Record<string, unknown>> };
    const activeContributor = topResp.contributors.find(c => c.userId === activeUserId);
    assert.ok(activeContributor, `activeUser (id=${activeUserId}) not found in weekly-top`);

    assert.equal(
      activeContributor.weeklyPoints,
      ACTIVE_WEEKLY_PTS,
      `weekly-top weeklyPoints should be ${ACTIVE_WEEKLY_PTS} for activeUser, got ${activeContributor.weeklyPoints}`,
    );
  });
});
