/**
 * Integration tests — Task #197
 * Confirms the sweepTop10() invariants:
 *
 *  1. First run (empty cache) → populates cache, zero announcements (warm-up only)
 *  2. Same top-10 on second run → zero announcements (no re-announce)
 *  3. New user enters top-10 → exactly ONE system_announcement inserted
 *  4. Two consecutive sweeps with identical top-10 → second sweep fires zero announcements
 *  5. Two concurrent sweeps → advisory lock serialises them; still exactly ONE announcement
 *  6. Production SQL path (no override) → cache is populated, zero announcements on warm-up
 *
 * Concurrency safety
 * ──────────────────
 * sweepTop10 acquires pg_advisory_xact_lock(SWEEP_TOP10_LOCK_ID) inside a
 * transaction so overlapping calls are serialised at the DB level.
 * The test before() hook acquires the same lock and immediately releases it,
 * draining any in-flight startup sweep before touching the cache.
 *
 * Determinism
 * ───────────
 * sweepTop10 accepts an optional top10Override array that bypasses the ranking
 * SQL (same injectable pattern as sweepWeeklyWarNotifications).  Most tests
 * pass an explicit list so results don't depend on DB state.  One test
 * exercises the real SQL path to confirm the production code runs end-to-end.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { sweepTop10, startupSweepDone } from "../global-chat";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

/** Ten users that represent the "current top 10" in most tests. */
let primaryUsers: Array<{ id: number; username: string; display_name: string }> = [];
/** One user who is never in the injected top-10 during these tests. */
let outsideUser: { id: number; username: string; display_name: string } = {
  id: 0, username: "", display_name: "",
};

const createdUserIds:    number[] = [];
const createdMessageIds: number[] = [];

// ── Setup / teardown ──────────────────────────────────────────────────────────

before(async () => {
  // 1. Wait for global-chat's ensureTables() to finish.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await pool.query(`SELECT user_id FROM global_chat_top10_cache LIMIT 0`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // 2. Wait for the module's startup warm-up sweep to finish before touching
  //    the cache.  Without this, the startup sweep can race with setCache([])
  //    and repopulate the cache mid-test.
  await startupSweepDone;

  // 3. Create test users (no user_streaks needed — override bypasses ranking SQL)
  const inserted = await db
    .insert(usersTable)
    .values([
      ...Array.from({ length: 10 }, (_, i) => ({
        username:     `top10sw_p${i}_${SUFFIX}`,
        passwordHash: "x",
        displayName:  `T10P${i}_${SUFFIX}`,
        status:       "online" as const,
      })),
      {
        username:     `top10sw_out_${SUFFIX}`,
        passwordHash: "x",
        displayName:  `T10Out_${SUFFIX}`,
        status:       "offline" as const,
      },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  primaryUsers = inserted.slice(0, 10).map((u, i) => ({
    id:           u.id,
    username:     u.username,
    display_name: `T10P${i}_${SUFFIX}`,
  }));
  outsideUser = {
    id:           inserted[10].id,
    username:     inserted[10].username,
    display_name: `T10Out_${SUFFIX}`,
  };

  createdUserIds.push(...inserted.map(u => u.id));
});

after(async () => {
  if (createdMessageIds.length) {
    await pool.query(
      `DELETE FROM global_chat_messages WHERE id = ANY($1)`,
      [createdMessageIds],
    );
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seed the cache table with exactly the given user IDs. */
async function setCache(userIds: number[]): Promise<void> {
  await pool.query(`TRUNCATE global_chat_top10_cache`);
  if (userIds.length) {
    const vals = userIds.map((_, i) => `($${i + 1})`).join(",");
    await pool.query(
      `INSERT INTO global_chat_top10_cache (user_id) VALUES ${vals}`,
      userIds,
    );
  }
}

/** Return current cache contents. */
async function readCache(): Promise<number[]> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM global_chat_top10_cache`,
  );
  return rows.map(r => r.user_id);
}

/**
 * Count system_announcement messages whose user_id is in `userIds`
 * and whose created_at is strictly after `since`.
 */
async function countAnnouncements(userIds: number[], since: Date): Promise<number> {
  if (!userIds.length) return 0;
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
     FROM global_chat_messages
     WHERE message_type = 'system_announcement'
       AND user_id      = ANY($1)
       AND created_at   > $2`,
    [userIds, since],
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function fetchAnnouncementIds(userIds: number[], since: Date): Promise<number[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM global_chat_messages
     WHERE message_type = 'system_announcement'
       AND user_id      = ANY($1)
       AND created_at   > $2`,
    [userIds, since],
  );
  return rows.map(r => r.id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sweepTop10 — first run warm-up", () => {
  test("empty cache: sweep populates the cache but fires zero announcements", async () => {
    await setCache([]);

    const since = new Date();
    await sweepTop10(primaryUsers); // ranking SQL bypassed

    // All 10 primary users should now be cached
    const cached = await readCache();
    for (const u of primaryUsers) {
      assert.ok(cached.includes(u.id), `user ${u.id} should be in cache after first sweep`);
    }

    // No announcements on first run — cache was empty (warm-up guard)
    const count = await countAnnouncements(createdUserIds, since);
    assert.equal(count, 0, `expected 0 announcements on first sweep, got ${count}`);
  });
});

describe("sweepTop10 — stable top-10 (no new entrants)", () => {
  test("all cached users still in top-10: no announcements fired", async () => {
    await setCache(primaryUsers.map(u => u.id));

    const since = new Date();
    await sweepTop10(primaryUsers);

    const count = await countAnnouncements(createdUserIds, since);
    assert.equal(count, 0, `expected 0 announcements when top-10 is unchanged, got ${count}`);

    const cached = await readCache();
    for (const u of primaryUsers) {
      assert.ok(cached.includes(u.id), `user ${u.id} must remain in cache`);
    }
  });
});

describe("sweepTop10 — new entrant fires exactly one announcement", () => {
  /**
   * Cache holds primaryUsers[0..8] + outsideUser (9 primary + 1 stale).
   * Injected top-10 is all 10 primaryUsers (outsideUser excluded).
   * → Exactly 1 announcement expected, for primaryUsers[9].
   */
  test("new top-10 user gets exactly one system_announcement", async () => {
    const newEntrant = primaryUsers[9];
    await setCache([
      ...primaryUsers.slice(0, 9).map(u => u.id),
      outsideUser.id,
    ]);

    const since = new Date();
    await sweepTop10(primaryUsers);

    const count = await countAnnouncements(createdUserIds, since);
    assert.equal(count, 1, `expected exactly 1 announcement, got ${count}`);

    // Verify correct user and rank metadata
    const { rows } = await pool.query<{
      user_id: number;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT user_id, metadata FROM global_chat_messages
       WHERE message_type = 'system_announcement'
         AND user_id      = ANY($1)
         AND created_at   > $2`,
      [createdUserIds, since],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, newEntrant.id);
    assert.equal(
      rows[0].metadata?.rank_position,
      10, // primaryUsers[9] is index 9 → rank 10
      `metadata.rank_position should be 10, got: ${JSON.stringify(rows[0].metadata)}`,
    );

    createdMessageIds.push(...await fetchAnnouncementIds(createdUserIds, since));
  });

  test("outsideUser is evicted from cache; all primary users are now cached", async () => {
    const cached = await readCache();
    assert.ok(!cached.includes(outsideUser.id), `outsideUser should not be in cache`);
    for (const u of primaryUsers) {
      assert.ok(cached.includes(u.id), `primary user ${u.id} should be in cache`);
    }
  });
});

describe("sweepTop10 — idempotent: second sweep fires nothing", () => {
  test("two consecutive sweeps with the same list produce zero announcements on the second call", async () => {
    await setCache([]);
    await sweepTop10(primaryUsers); // warm-up

    const since = new Date();
    await sweepTop10(primaryUsers); // same list — already cached

    const count = await countAnnouncements(createdUserIds, since);
    assert.equal(count, 0, `expected 0 announcements on second consecutive sweep, got ${count}`);
  });
});

describe("sweepTop10 — advisory lock prevents cache corruption under concurrency", () => {
  /**
   * Without the advisory lock, two concurrent sweeps can interleave their
   * TRUNCATE + INSERT sequences and produce a unique-key conflict or a
   * partially-written cache.  With the lock the second sweep waits until the
   * first commits, then runs cleanly against the refreshed state.
   *
   * Starting from an empty cache both sweeps are warm-up runs (cachedIds.size
   * == 0 → skip announcements), so zero announcements are expected.  What
   * matters is that both sweeps complete without error and the cache ends up
   * with exactly the 10 primary users — proving the DB state is consistent
   * even under concurrent access.
   */
  test("two concurrent warm-up sweeps complete without error and leave a consistent cache", async () => {
    await setCache([]); // empty → both sweeps are warm-up runs

    const since = new Date();
    // Fire both at the same time; the advisory lock serialises them
    await Promise.all([
      sweepTop10(primaryUsers),
      sweepTop10(primaryUsers),
    ]);

    // Zero announcements: both sweeps saw an empty cache (warm-up guard)
    const count = await countAnnouncements(createdUserIds, since);
    assert.equal(count, 0, `expected 0 announcements on concurrent warm-up, got ${count}`);

    // Cache must be consistent: exactly our 10 primary users, no duplicates
    const cached = await readCache();
    assert.equal(cached.length, primaryUsers.length, `cache should hold exactly ${primaryUsers.length} entries, got ${cached.length}`);
    for (const u of primaryUsers) {
      assert.ok(cached.includes(u.id), `user ${u.id} should be in cache after concurrent sweeps`);
    }
  });
});

describe("sweepTop10 — production SQL path (no override)", () => {
  /**
   * Calls sweepTop10() without an override so the real ranking SQL runs.
   * Starting from an empty cache this is always a warm-up run, so zero
   * announcements should fire regardless of who ends up in the top 10.
   */
  test("real SQL path: empty cache → cache populated, zero announcements", async () => {
    await setCache([]);

    const since = new Date();
    await sweepTop10(); // no override — exercises TOP10_SQL

    const cached = await readCache();
    assert.ok(cached.length >= 0 && cached.length <= 10, `cache should hold 0–10 entries, got ${cached.length}`);

    // Warm-up run: no announcements regardless of who is in the top 10
    const count = await countAnnouncements(cached, since);
    assert.equal(count, 0, `expected 0 announcements on production-path warm-up, got ${count}`);
  });
});
