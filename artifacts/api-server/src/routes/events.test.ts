import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { eq, and, inArray } from "drizzle-orm";
import { db, pool, usersTable, lfgPostsTable, notificationsTable } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

/**
 * Integration tests for flash event completion via POST /lfg (Task 98).
 *
 * Covered scenarios:
 *   1. POST /lfg awards XP and inserts a flash_complete notification
 *      when a matching active flash event is present.
 *   2. A second POST /lfg by the same user is a no-op — no double-award.
 *   3. POST /lfg does NOT award XP when the matching flash event has expired.
 */

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let userId = 0;
let activeFlashEventId = 0;
let expiredFlashEventId = 0;

// IDs of pre-existing active post_lfg events we temporarily suspend so they
// don't interfere with our fixtures. Restored in the global after().
let suspendedPreExistingIds: number[] = [];

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdEventIds: number[] = [];

function makeUser(tag: string) {
  return {
    username: `flashtest_${tag}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FlashTest ${tag}`,
    status: "online" as const,
  };
}

function authHeader(id: number, username: string): Record<string, string> {
  return { Authorization: `Bearer ${signToken({ userId: id, username })}` };
}

async function postLfg(uid: number, username: string): Promise<Response> {
  return fetch(`${baseUrl}/api/lfg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(uid, username),
    },
    body: JSON.stringify({
      game: "FlashGame",
      description: "Test post for flash event",
      neededPlayers: 1,
      micRequired: false,
    }),
  });
}

async function getBonusXp(uid: number): Promise<number> {
  const { rows } = await pool.query<{ bonus_xp: number }>(
    `SELECT bonus_xp FROM user_streaks WHERE user_id = $1`,
    [uid],
  );
  return rows[0]?.bonus_xp ?? 0;
}

before(async () => {
  // Suspend any pre-existing active post_lfg events so they don't interfere.
  // We restore them in the global after().
  const { rows: preExisting } = await pool.query<{ id: number }>(
    `UPDATE events SET status = 'cancelled'
     WHERE type = 'flash' AND status = 'active' AND quest_key = 'post_lfg'
     RETURNING id`,
  );
  suspendedPreExistingIds = preExisting.map((r) => r.id);

  // Create the test user
  const [user] = await db
    .insert(usersTable)
    .values(makeUser("player"))
    .returning({ id: usersTable.id, username: usersTable.username });
  userId = user.id;
  createdUserIds.push(userId);

  // Active flash event for post_lfg — expires 2 h from now
  const { rows: activeRows } = await pool.query<{ id: number }>(
    `INSERT INTO events (type, title, quest_key, icon, status, xp_reward, expires_at)
     VALUES ('flash', 'Post LFG Flash', 'post_lfg', '⚡', 'active', 250,
             NOW() + INTERVAL '2 hours')
     RETURNING id`,
  );
  activeFlashEventId = activeRows[0].id;
  createdEventIds.push(activeFlashEventId);

  // Expired flash event — status active but expires_at already passed
  const { rows: expiredRows } = await pool.query<{ id: number }>(
    `INSERT INTO events (type, title, quest_key, icon, status, xp_reward, expires_at)
     VALUES ('flash', 'Expired LFG Flash', 'post_lfg', '⚡', 'active', 100,
             NOW() - INTERVAL '1 minute')
     RETURNING id`,
  );
  expiredFlashEventId = expiredRows[0].id;
  createdEventIds.push(expiredFlashEventId);

  // Start the HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Remove flash_complete / flash_event notifications for test users
  if (createdUserIds.length) {
    await pool.query(
      `DELETE FROM notifications WHERE user_id = ANY($1::int[]) AND type IN ('flash_complete', 'flash_event')`,
      [createdUserIds],
    );
  }

  // Remove event_participants rows for our fixture events
  if (createdEventIds.length) {
    await pool.query(
      `DELETE FROM event_participants WHERE event_id = ANY($1::int[])`,
      [createdEventIds],
    );
  }

  // Remove bonus_xp rows created during tests
  if (createdUserIds.length) {
    await pool.query(
      `DELETE FROM user_streaks WHERE user_id = ANY($1::int[])`,
      [createdUserIds],
    );
  }

  // Remove LFG posts created by test users
  if (createdPostIds.length) {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, createdPostIds));
  }
  // Also delete any open lfg posts created by test users that weren't tracked
  if (createdUserIds.length) {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.authorId, createdUserIds));
  }

  // Remove fixture events
  if (createdEventIds.length) {
    await pool.query(`DELETE FROM events WHERE id = ANY($1::int[])`, [createdEventIds]);
  }

  // Restore pre-existing active events that were suspended during setup
  if (suspendedPreExistingIds.length) {
    await pool.query(
      `UPDATE events SET status = 'active' WHERE id = ANY($1::int[])`,
      [suspendedPreExistingIds],
    );
  }

  // Remove test users
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }

  await pool.end();
});

// ─── Helper — record post IDs for cleanup ─────────────────────────────────

async function trackPostedPost(res: Response): Promise<void> {
  if (res.ok) {
    const body = (await res.clone().json()) as { id?: number };
    if (body?.id) createdPostIds.push(body.id);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("POST /lfg → flash event: active event awards XP and fires notification", () => {
  test("XP is credited to user_streaks after posting LFG with an active flash event", async () => {
    // Only the active fixture is live (expired one has expires_at in the past)
    const xpBefore = await getBonusXp(userId);

    const res = await postLfg(userId, `flashtest_player_${SUFFIX}`);
    await trackPostedPost(res);
    assert.equal(res.status, 201, "POST /lfg must return 201");

    // checkFlashCompletion is fire-and-forget; allow async work to settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    const xpAfter = await getBonusXp(userId);
    assert.equal(
      xpAfter - xpBefore,
      250,
      `expected +250 XP for completing the flash event; got +${xpAfter - xpBefore}`,
    );
  });

  test("a flash_complete notification is inserted for the user", async () => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.type, "flash_complete"),
        ),
      );

    assert.ok(
      rows.length >= 1,
      "expected at least one flash_complete notification for the user",
    );
    const notif = rows[0];
    assert.ok(
      typeof notif.body === "string" && notif.body.includes("250"),
      `notification body should mention the XP amount; got: "${notif.body}"`,
    );
    assert.equal(
      notif.relatedId,
      activeFlashEventId,
      "notification relatedId must point to the active flash event",
    );
  });
});

describe("POST /lfg → flash event: second trigger by same user is a no-op", () => {
  let doubleUserId = 0;

  before(async () => {
    const [u] = await db
      .insert(usersTable)
      .values(makeUser("double"))
      .returning({ id: usersTable.id });
    doubleUserId = u.id;
    createdUserIds.push(doubleUserId);
  });

  test("first POST awards XP", async () => {
    const res = await fetch(`${baseUrl}/api/lfg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(doubleUserId, `flashtest_double_${SUFFIX}`),
      },
      body: JSON.stringify({
        game: "FlashGame",
        description: "First post",
        neededPlayers: 1,
        micRequired: false,
      }),
    });
    await trackPostedPost(res);
    assert.equal(res.status, 201, "first POST /lfg must return 201");

    await new Promise((resolve) => setTimeout(resolve, 150));

    const xp = await getBonusXp(doubleUserId);
    assert.equal(xp, 250, `expected 250 XP after first post; got ${xp}`);
  });

  test("second POST does not award additional XP", async () => {
    const xpAfterFirst = await getBonusXp(doubleUserId);

    const res = await fetch(`${baseUrl}/api/lfg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(doubleUserId, `flashtest_double_${SUFFIX}`),
      },
      body: JSON.stringify({
        game: "FlashGame",
        description: "Second post — must not double-award XP",
        neededPlayers: 1,
        micRequired: false,
      }),
    });
    await trackPostedPost(res);
    assert.equal(res.status, 201, "second POST /lfg must still return 201");

    await new Promise((resolve) => setTimeout(resolve, 150));

    const xpAfterSecond = await getBonusXp(doubleUserId);
    assert.equal(
      xpAfterSecond,
      xpAfterFirst,
      `XP must not increase on second trigger; before=${xpAfterFirst}, after=${xpAfterSecond}`,
    );
  });

  test("second POST does not insert a second flash_complete notification", async () => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, doubleUserId),
          eq(notificationsTable.type, "flash_complete"),
        ),
      );
    assert.equal(
      rows.length,
      1,
      `expected exactly 1 flash_complete notification after two posts; got ${rows.length}`,
    );
  });
});

describe("POST /lfg → flash event: expired event does not award XP", () => {
  let expiredUserId = 0;

  before(async () => {
    const [u] = await db
      .insert(usersTable)
      .values(makeUser("expired"))
      .returning({ id: usersTable.id });
    expiredUserId = u.id;
    createdUserIds.push(expiredUserId);

    // Suspend the active fixture so ONLY the expired one exists for post_lfg.
    // The expired event has expires_at in the past, so checkFlashCompletion
    // will find no qualifying event and must not award any XP.
    await pool.query(
      `UPDATE events SET status = 'cancelled' WHERE id = $1`,
      [activeFlashEventId],
    );
  });

  after(async () => {
    // Re-activate the fixture for any other suites / cleanup
    await pool.query(
      `UPDATE events SET status = 'active' WHERE id = $1`,
      [activeFlashEventId],
    );
  });

  test("no XP is credited when the only matching flash event has expired", async () => {
    const xpBefore = await getBonusXp(expiredUserId);

    const res = await fetch(`${baseUrl}/api/lfg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(expiredUserId, `flashtest_expired_${SUFFIX}`),
      },
      body: JSON.stringify({
        game: "FlashGame",
        description: "Post under expired flash event",
        neededPlayers: 1,
        micRequired: false,
      }),
    });
    await trackPostedPost(res);
    assert.equal(
      res.status,
      201,
      "POST /lfg must succeed even when no active flash event matches",
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const xpAfter = await getBonusXp(expiredUserId);
    assert.equal(
      xpAfter,
      xpBefore,
      `XP must not change when flash event is expired; before=${xpBefore}, after=${xpAfter}`,
    );
  });

  test("no flash_complete notification is inserted for an expired event", async () => {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, expiredUserId),
          eq(notificationsTable.type, "flash_complete"),
        ),
      );
    assert.equal(
      rows.length,
      0,
      `expected no flash_complete notification for expired event; got ${rows.length}`,
    );
  });
});
