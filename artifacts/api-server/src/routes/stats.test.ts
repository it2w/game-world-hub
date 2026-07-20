/**
 * Integration tests for GET /stats/me/weekly
 *
 * The endpoint returns per-day activity counts broken down by source for the
 * current Sunday-based week (Sun 00:00 UTC through Sat 23:59:59 UTC).
 *
 * Response shape: { lfgPosts: number[7], lfgResponses: number[7], messages: number[7] }
 * Index 0 = Sunday … 6 = Saturday (UTC day-of-week).
 *
 * Covered scenarios:
 *  1. Response always contains all three source arrays, each with exactly 7 zeros
 *     when the user has no activity
 *  2. lfg_posts in the current week land in the correct day bucket of lfgPosts
 *  3. lfg_responses in the current week land in lfgResponses (not lfgPosts/messages)
 *  4. messages in the current week land in messages (not lfgPosts/lfgResponses)
 *  5. Prior-week activity is excluded from all three arrays
 *  6. A row at exactly the week boundary (Sunday 00:00 UTC) counts as current-week
 *  7. Activity on different days lands in the correct per-day buckets
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
} from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  lfgPostsTable,
  lfgResponsesTable,
  messagesTable,
  conversationsTable,
  conversationParticipantsTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let testUserId = 0;
let testToken = "";
let testConvId = 0;

// Track all seeded rows for cleanup
const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdResponseIds: number[] = [];
const createdMessageIds: number[] = [];
const createdConvIds: number[] = [];

// The SQL expression for the start of the current Sunday-based week (00:00 UTC)
const WEEK_START_SQL =
  `date_trunc('week', NOW() + INTERVAL '1 day') - INTERVAL '1 day'`;

before(async () => {
  // Create one test user
  const [user] = await db
    .insert(usersTable)
    .values({
      username: `sw_test_${SUFFIX}`,
      passwordHash: "x",
      displayName: "WeeklyTest",
      status: "online" as const,
    })
    .returning({ id: usersTable.id });

  testUserId = user.id;
  createdUserIds.push(testUserId);

  testToken = signToken({ userId: testUserId, username: `sw_test_${SUFFIX}` });

  // Create a conversation so messages have a valid conversation_id
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "direct" })
    .returning({ id: conversationsTable.id });
  testConvId = conv.id;
  createdConvIds.push(testConvId);

  await db.insert(conversationParticipantsTable).values({
    conversationId: testConvId,
    userId: testUserId,
  });

  // Start HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdResponseIds.length) {
    await db
      .delete(lfgResponsesTable)
      .where(inArray(lfgResponsesTable.id, createdResponseIds));
  }
  if (createdMessageIds.length) {
    await db
      .delete(messagesTable)
      .where(inArray(messagesTable.id, createdMessageIds));
  }
  if (createdPostIds.length) {
    await db
      .delete(lfgPostsTable)
      .where(inArray(lfgPostsTable.id, createdPostIds));
  }
  if (createdConvIds.length) {
    await db
      .delete(conversationParticipantsTable)
      .where(
        inArray(
          conversationParticipantsTable.conversationId,
          createdConvIds,
        ),
      );
    await db
      .delete(conversationsTable)
      .where(inArray(conversationsTable.id, createdConvIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, createdUserIds));
  }

  await pool.end();
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function authedGet(
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: { Authorization: `Bearer ${testToken}` },
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

// ─── DB seeding helpers ───────────────────────────────────────────────────────

async function insertPostAt(timestampSql: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO lfg_posts (author_id, game, description, needed_players, mic_required, status, created_at)
     VALUES ($1, 'WeeklyTestGame', 'weekly boundary test', 1, false, 'open', ${timestampSql})
     RETURNING id`,
    [testUserId],
  );
  return rows[0].id;
}

async function insertMessageAt(timestampSql: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO messages (conversation_id, sender_id, content, created_at)
     VALUES ($1, $2, 'weekly boundary msg', ${timestampSql})
     RETURNING id`,
    [testConvId, testUserId],
  );
  return rows[0].id;
}

async function insertResponseAt(
  postId: number,
  timestampSql: string,
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO lfg_responses (post_id, user_id, message, created_at)
     VALUES ($1, $2, 'weekly response', ${timestampSql})
     RETURNING id`,
    [postId, testUserId],
  );
  return rows[0].id;
}

// ─── Response-shape helpers ───────────────────────────────────────────────────

type WeeklyBody = { lfgPosts: number[]; lfgResponses: number[]; messages: number[] };

function assertWeeklyShape(body: unknown): asserts body is WeeklyBody {
  assert.ok(body !== null && typeof body === "object", "body must be an object");
  const b = body as Record<string, unknown>;
  for (const key of ["lfgPosts", "lfgResponses", "messages"] as const) {
    assert.ok(Array.isArray(b[key]), `response.${key} must be an array`);
    assert.equal((b[key] as number[]).length, 7, `response.${key} must have 7 elements`);
  }
}

function totalActivity(body: WeeklyBody): number {
  return [...body.lfgPosts, ...body.lfgResponses, ...body.messages].reduce(
    (s, n) => s + n,
    0,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /stats/me/weekly — week reset and response shape", () => {
  test("returns three 7-element zero arrays when the user has no activity", async () => {
    const { status, body } = await authedGet("/stats/me/weekly");
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    assertWeeklyShape(body);
    const wb = body as WeeklyBody;

    for (let i = 0; i < 7; i++) {
      assert.equal(wb.lfgPosts[i], 0, `lfgPosts[${i}] should be 0 with no activity`);
      assert.equal(wb.lfgResponses[i], 0, `lfgResponses[${i}] should be 0 with no activity`);
      assert.equal(wb.messages[i], 0, `messages[${i}] should be 0 with no activity`);
    }
  });

  test("current-week lfg_post appears in lfgPosts[0] (Sunday bucket)", async () => {
    const postId = await insertPostAt(`${WEEK_START_SQL} + INTERVAL '1 hour'`);
    createdPostIds.push(postId);

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      assert.equal(wb.lfgPosts[0], 1, `lfgPosts[0] (Sunday) should be 1; got ${wb.lfgPosts[0]}`);
      assert.equal(wb.lfgResponses[0], 0, "lfgResponses must not count an lfg_post");
      assert.equal(wb.messages[0], 0, "messages must not count an lfg_post");
      assert.equal(totalActivity(wb), 1, "total activity should be 1");
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      createdPostIds.splice(createdPostIds.indexOf(postId), 1);
    }
  });

  test("current-week lfg_response appears in lfgResponses, not lfgPosts or messages", async () => {
    // Need a post to respond to
    const postId = await insertPostAt(`${WEEK_START_SQL} + INTERVAL '1 hour'`);
    createdPostIds.push(postId);

    const responseId = await insertResponseAt(
      postId,
      `${WEEK_START_SQL} + INTERVAL '2 hours'`,
    );
    createdResponseIds.push(responseId);

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      assert.equal(
        wb.lfgResponses[0],
        1,
        `lfgResponses[0] (Sunday) should be 1; got ${wb.lfgResponses[0]}`,
      );
      // The post is also in lfgPosts[0]; verify the response doesn't bleed
      assert.equal(wb.messages[0], 0, "messages must not count an lfg_response");
    } finally {
      await db
        .delete(lfgResponsesTable)
        .where(inArray(lfgResponsesTable.id, [responseId]));
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      createdResponseIds.splice(createdResponseIds.indexOf(responseId), 1);
      createdPostIds.splice(createdPostIds.indexOf(postId), 1);
    }
  });

  test("current-week message appears in messages, not lfgPosts or lfgResponses", async () => {
    const msgId = await insertMessageAt(`${WEEK_START_SQL} + INTERVAL '1 hour'`);
    createdMessageIds.push(msgId);

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      assert.equal(wb.messages[0], 1, `messages[0] (Sunday) should be 1; got ${wb.messages[0]}`);
      assert.equal(wb.lfgPosts[0], 0, "lfgPosts must not count a message");
      assert.equal(wb.lfgResponses[0], 0, "lfgResponses must not count a message");
    } finally {
      await db.delete(messagesTable).where(inArray(messagesTable.id, [msgId]));
      createdMessageIds.splice(createdMessageIds.indexOf(msgId), 1);
    }
  });

  test("previous-week activity is excluded from all three arrays", async () => {
    // 1 second before the week start (last Saturday 23:59:59)
    const postId = await insertPostAt(`${WEEK_START_SQL} - INTERVAL '1 second'`);
    createdPostIds.push(postId);

    // Clearly last week (8 days ago)
    const msgId = await insertMessageAt(`NOW() - INTERVAL '8 days'`);
    createdMessageIds.push(msgId);

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      assert.equal(
        totalActivity(wb),
        0,
        `prior-week rows must not appear; got total=${totalActivity(wb)} (lfgPosts=${JSON.stringify(wb.lfgPosts)})`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      await db.delete(messagesTable).where(inArray(messagesTable.id, [msgId]));
      createdPostIds.splice(createdPostIds.indexOf(postId), 1);
      createdMessageIds.splice(createdMessageIds.indexOf(msgId), 1);
    }
  });

  test("row inserted exactly at week boundary (Sunday 00:00 UTC) counts as current-week", async () => {
    const postId = await insertPostAt(WEEK_START_SQL);
    createdPostIds.push(postId);

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      assert.equal(
        wb.lfgPosts[0],
        1,
        `boundary row (Sunday 00:00 UTC) must land in lfgPosts[0]; got ${wb.lfgPosts[0]}`,
      );
      assert.equal(
        totalActivity(wb),
        1,
        `total should be 1 for a single boundary row; got ${totalActivity(wb)}`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      createdPostIds.splice(createdPostIds.indexOf(postId), 1);
    }
  });

  test("activity on each day of the week lands in the correct per-day bucket", async () => {
    // Seed one post per day (DOW 0–6), each 1 hour into that day
    const insertedPostIds: number[] = [];

    for (let dow = 0; dow < 7; dow++) {
      const id = await insertPostAt(
        `${WEEK_START_SQL} + INTERVAL '${dow} days' + INTERVAL '1 hour'`,
      );
      insertedPostIds.push(id);
      createdPostIds.push(id);
    }

    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;

      for (let dow = 0; dow < 7; dow++) {
        assert.equal(
          wb.lfgPosts[dow],
          1,
          `lfgPosts[${dow}] should be 1 (one post seeded for DOW ${dow}); got ${wb.lfgPosts[dow]}`,
        );
        assert.equal(wb.lfgResponses[dow], 0, `lfgResponses[${dow}] must be 0`);
        assert.equal(wb.messages[dow], 0, `messages[${dow}] must be 0`);
      }
    } finally {
      await db
        .delete(lfgPostsTable)
        .where(inArray(lfgPostsTable.id, insertedPostIds));
      for (const id of insertedPostIds) {
        const idx = createdPostIds.indexOf(id);
        if (idx !== -1) createdPostIds.splice(idx, 1);
      }
    }
  });
});

// ─── Timezone boundary tests ───────────────────────────────────────────────────
//
// The endpoint always uses UTC-based day-of-week (EXTRACT(DOW FROM created_at AT
// TIME ZONE 'UTC')).  Users in UTC+N timezones experience the Sunday/Monday
// boundary at a different local clock time, but the bucket must still reflect UTC.
//
// Representative offsets tested:
//   UTC+14 (Kiribati) — the furthest-ahead timezone; their "Sunday" starts 14 h
//           before UTC Sunday, i.e. while it is still Saturday UTC.
//   UTC+12 (NZ/Fiji)  — common far-ahead zone.
//   UTC-12 (Baker Is) — the furthest-behind zone; their "Sunday" starts 12 h
//           after UTC Sunday, i.e. while it is already Monday UTC.
//   UTC-5  (US East)  — common behind zone.
//
// Each test inserts one lfg_post at a precise UTC timestamp, then verifies the
// endpoint returns that post in the expected UTC DOW bucket.

describe("GET /stats/me/weekly — timezone boundary bucket assignment", () => {
  // ── Helper: insert a post at an absolute offset from the week start and clean up ──
  async function withPostAt(
    offsetSql: string,
    fn: (postId: number) => Promise<void>,
  ): Promise<void> {
    const postId = await insertPostAt(`${WEEK_START_SQL} + ${offsetSql}`);
    createdPostIds.push(postId);
    try {
      await fn(postId);
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      const idx = createdPostIds.indexOf(postId);
      if (idx !== -1) createdPostIds.splice(idx, 1);
    }
  }

  // ── UTC+14 perspective ─────────────────────────────────────────────────────
  // In UTC+14, Sunday starts at Saturday 10:00 UTC.
  // A post at Saturday 10:30 UTC (Sunday 00:30 local) is still DOW=6 (Saturday UTC).
  test("UTC+14: post at Saturday 10:30 UTC (local Sunday morning) lands in DOW=6 (Saturday)", async () => {
    // Saturday 10:30 UTC = WEEK_START - 13 hours 30 minutes
    const postId = await insertPostAt(`${WEEK_START_SQL} - INTERVAL '13 hours 30 minutes'`);
    createdPostIds.push(postId);
    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      // This timestamp is before the week start so it is EXCLUDED from the current week.
      // That is the correct behaviour: a UTC Saturday is never in the UTC Sunday-based week.
      assert.equal(
        totalActivity(wb),
        0,
        `UTC+14 Saturday-UTC post must be excluded from the current week; got total=${totalActivity(wb)}`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      const idx = createdPostIds.indexOf(postId);
      if (idx !== -1) createdPostIds.splice(idx, 1);
    }
  });

  // A post at Saturday 23:30 UTC (UTC+14 = Sunday 13:30 local) is still DOW=6.
  // Since it is before the week start it must NOT appear in the current week.
  test("UTC+14: post at Saturday 23:30 UTC (local Sunday afternoon) is excluded from current week", async () => {
    const postId = await insertPostAt(`${WEEK_START_SQL} - INTERVAL '30 minutes'`);
    createdPostIds.push(postId);
    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        totalActivity(wb),
        0,
        `Saturday-UTC post (30 min before week start) must be excluded; got total=${totalActivity(wb)}`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      const idx = createdPostIds.indexOf(postId);
      if (idx !== -1) createdPostIds.splice(idx, 1);
    }
  });

  // ── UTC+12 perspective ─────────────────────────────────────────────────────
  // In UTC+12, Sunday ends at Sunday 12:00 UTC (= Monday 00:00 local).
  // A post at Sunday 23:00 UTC (= Monday 11:00 local in UTC+12) must still land
  // in DOW=0 (Sunday UTC), not DOW=1 (Monday).
  test("UTC+12: post at Sunday 23:00 UTC (local Monday morning) still lands in DOW=0 (Sunday)", async () => {
    await withPostAt("INTERVAL '23 hours'", async () => {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        wb.lfgPosts[0],
        1,
        `Sunday-23:00-UTC post must land in DOW=0 (Sunday); got lfgPosts[0]=${wb.lfgPosts[0]}`,
      );
      assert.equal(
        wb.lfgPosts[1],
        0,
        `DOW=1 (Monday) must be 0; got lfgPosts[1]=${wb.lfgPosts[1]}`,
      );
    });
  });

  // ── UTC-5 perspective ──────────────────────────────────────────────────────
  // In UTC-5, Sunday midnight local = Sunday 05:00 UTC.
  // A post at Monday 01:00 UTC (= Sunday 20:00 local in UTC-5) must land in
  // DOW=1 (Monday UTC), even though locally it feels like Sunday evening.
  test("UTC-5: post at Monday 01:00 UTC (local Sunday evening) lands in DOW=1 (Monday UTC), not Sunday", async () => {
    await withPostAt("INTERVAL '1 day 1 hour'", async () => {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        wb.lfgPosts[1],
        1,
        `Monday-01:00-UTC post must land in DOW=1 (Monday); got lfgPosts[1]=${wb.lfgPosts[1]}`,
      );
      assert.equal(
        wb.lfgPosts[0],
        0,
        `DOW=0 (Sunday) must be 0; got lfgPosts[0]=${wb.lfgPosts[0]}`,
      );
    });
  });

  // ── UTC-12 perspective ─────────────────────────────────────────────────────
  // In UTC-12, Sunday starts at Sunday 12:00 UTC.
  // A post at Sunday 00:01 UTC (= Saturday 12:01 local in UTC-12) must land in
  // DOW=0 (Sunday UTC), even though locally it feels like Saturday.
  test("UTC-12: post at Sunday 00:01 UTC (local Saturday noon) lands in DOW=0 (Sunday UTC)", async () => {
    await withPostAt("INTERVAL '1 minute'", async () => {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        wb.lfgPosts[0],
        1,
        `Sunday-00:01-UTC post must land in DOW=0 (Sunday); got lfgPosts[0]=${wb.lfgPosts[0]}`,
      );
      assert.equal(
        wb.lfgPosts[6],
        0,
        `DOW=6 (Saturday) must be 0; got lfgPosts[6]=${wb.lfgPosts[6]}`,
      );
    });
  });

  // ── Exact UTC midnight boundary — the Sunday/Saturday dividing line ────────
  // One second before Sunday 00:00 UTC must be excluded (Saturday = prior week).
  // One second after  Sunday 00:00 UTC must be included as DOW=0 (Sunday).
  test("1 second before UTC Sunday midnight is excluded from the current week", async () => {
    const postId = await insertPostAt(`${WEEK_START_SQL} - INTERVAL '1 second'`);
    createdPostIds.push(postId);
    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        totalActivity(wb),
        0,
        `post 1 s before UTC Sunday midnight must be excluded; got total=${totalActivity(wb)}`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      const idx = createdPostIds.indexOf(postId);
      if (idx !== -1) createdPostIds.splice(idx, 1);
    }
  });

  test("1 second after UTC Sunday midnight is included and lands in DOW=0 (Sunday)", async () => {
    await withPostAt("INTERVAL '1 second'", async () => {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        wb.lfgPosts[0],
        1,
        `post 1 s after UTC Sunday midnight must land in DOW=0 (Sunday); got lfgPosts[0]=${wb.lfgPosts[0]}`,
      );
      assert.equal(
        totalActivity(wb),
        1,
        `total must be 1; got ${totalActivity(wb)}`,
      );
    });
  });

  // ── Cross-day bucket correctness at timezone-sensitive hours ──────────────
  // Saturday 12:00 UTC is:
  //   • Sunday 00:00 in UTC+12  — locally the new week, but UTC says Saturday (DOW=6)
  //   • Friday 24:00 in UTC-12  — locally still Friday evening
  // Either way the endpoint must report DOW=6 (Saturday) for that moment.
  test("Saturday 12:00 UTC (local Sunday in UTC+12) is excluded from current week and would be DOW=6", async () => {
    // Saturday 12:00 UTC = WEEK_START - 12 hours (prior week)
    const postId = await insertPostAt(`${WEEK_START_SQL} - INTERVAL '12 hours'`);
    createdPostIds.push(postId);
    try {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      // Must be excluded (prior week)
      assert.equal(
        totalActivity(wb),
        0,
        `Saturday-12:00-UTC post (UTC+12 local Sunday) must be excluded from current week; got total=${totalActivity(wb)}`,
      );
    } finally {
      await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, [postId]));
      const idx = createdPostIds.indexOf(postId);
      if (idx !== -1) createdPostIds.splice(idx, 1);
    }
  });

  // Sunday 12:00 UTC is:
  //   • Sunday 00:00 in UTC-12  — locally just the start of Sunday for UTC-12 users
  //   • Monday 00:00 in UTC+12  — locally the start of Monday for UTC+12 users
  // The endpoint must report DOW=0 (Sunday) for that moment.
  test("Sunday 12:00 UTC (local Monday in UTC+12, local Sunday start in UTC-12) lands in DOW=0 (Sunday)", async () => {
    await withPostAt("INTERVAL '12 hours'", async () => {
      const { status, body } = await authedGet("/stats/me/weekly");
      assert.equal(status, 200, `expected 200, got ${status}`);
      assertWeeklyShape(body);
      const wb = body as WeeklyBody;
      assert.equal(
        wb.lfgPosts[0],
        1,
        `Sunday-12:00-UTC post must land in DOW=0 (Sunday); got lfgPosts[0]=${wb.lfgPosts[0]}`,
      );
      assert.equal(
        wb.lfgPosts[1],
        0,
        `DOW=1 (Monday) must be 0 for a Sunday-UTC post; got lfgPosts[1]=${wb.lfgPosts[1]}`,
      );
    });
  });
});
