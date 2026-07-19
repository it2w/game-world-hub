/**
 * Unit / integration tests for sweepWeeklyWarNotifications()
 *
 * Covered scenarios:
 *  1. prevWeekKey() returns the correct ISO year-week string for a known date
 *  2. First run: function sends exactly one notification per faction member
 *     and inserts a row in faction_war_notif_log
 *  3. Dedup guard: a second call for the same week key sends zero notifications
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray, and } from "drizzle-orm";
import { db, pool, usersTable, notificationsTable } from "@workspace/db";
import { sweepWeeklyWarNotifications, prevWeekKey } from "./factions";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

/**
 * 2026-07-20 is a Monday.
 * Going back 7 days lands in ISO week 29 of 2026:
 *   - back-7 date: 2026-07-13 (Monday)
 *   - Thursday of that week: 2026-07-16
 *   - Week number: 29  →  "2026-W29"
 */
const MOCK_NOW = new Date("2026-07-20T10:00:00.000Z");
const EXPECTED_WEEK_KEY = "2026-W29";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let user1Id = 0;
let user2Id = 0;
let testFactionId = 0;

const createdUserIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `fwtest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FWTest ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Ensure faction tables exist (all CREATE TABLE IF NOT EXISTS — fully idempotent)
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

    CREATE TABLE IF NOT EXISTS faction_war_notif_log (
      week_key TEXT NOT NULL PRIMARY KEY,
      sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed an isolated test faction so our members don't bleed into production factions
  const { rows: fRows } = await pool.query<{ id: number }>(
    `INSERT INTO factions (name, slug, color, icon_emoji, description)
     VALUES ($1, $2, '#000000', '⚔️', 'Test faction for war-notif tests')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FWTestFaction_${SUFFIX}`, `fwtest_${SUFFIX}`],
  );
  testFactionId = fRows[0].id;

  // Create two users that will be members of the test faction
  const [u1, u2] = await db
    .insert(usersTable)
    .values([mkUser("m1"), mkUser("m2")])
    .returning({ id: usersTable.id });
  user1Id = u1.id;
  user2Id = u2.id;
  createdUserIds.push(user1Id, user2Id);

  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id)
     VALUES ($1, $2), ($3, $4)`,
    [user1Id, testFactionId, user2Id, testFactionId],
  );

  // Clear any stale log entry from a previous interrupted test run
  await pool.query(`DELETE FROM faction_war_notif_log WHERE week_key = $1`, [EXPECTED_WEEK_KEY]);
});

after(async () => {
  // Tear down in dependency order
  await pool.query(
    `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
    [[user1Id, user2Id]],
  );
  await db
    .delete(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, createdUserIds),
        eq(notificationsTable.type, "faction_war_result"),
      ),
    );
  await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  await pool.query(`DELETE FROM faction_war_notif_log WHERE week_key = $1`, [EXPECTED_WEEK_KEY]);
  await pool.query(`DELETE FROM factions WHERE id = $1`, [testFactionId]);
  await pool.end();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("prevWeekKey()", () => {
  test("returns correct ISO year-week for a known Monday date", () => {
    // 2026-07-20 is Monday; previous ISO week is W29
    assert.equal(prevWeekKey(MOCK_NOW), EXPECTED_WEEK_KEY);
  });

  test("returns a different key when the week rolls over", () => {
    // One full week later should produce W30
    const nextWeek = new Date(MOCK_NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextKey = prevWeekKey(nextWeek);
    assert.notEqual(nextKey, EXPECTED_WEEK_KEY);
    assert.equal(nextKey, "2026-W30");
  });
});

describe("sweepWeeklyWarNotifications()", () => {
  test("first run: sends one notification per faction member and logs the week key", async () => {
    // Pre-condition: no log entry for this week
    const { rows: pre } = await pool.query(
      `SELECT 1 FROM faction_war_notif_log WHERE week_key = $1`,
      [EXPECTED_WEEK_KEY],
    );
    assert.equal(pre.length, 0, "log entry must not exist before first sweep");

    // Run the sweep with the controlled date
    await sweepWeeklyWarNotifications(MOCK_NOW);

    // Each of our two test-faction members should have received a notification
    const sent = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          inArray(notificationsTable.userId, createdUserIds),
          eq(notificationsTable.type, "faction_war_result"),
        ),
      );
    assert.equal(
      sent.length,
      createdUserIds.length,
      `expected ${createdUserIds.length} notifications, got ${sent.length}`,
    );

    // Verify every notification carries the expected week in its title or body
    for (const n of sent) {
      const combined = `${n.title} ${n.body ?? ""}`;
      assert.ok(
        combined.includes(EXPECTED_WEEK_KEY) || combined.includes("wins this week"),
        `notification text should reference the week or winner: "${combined}"`,
      );
    }

    // The dedup log must now contain the week key
    const { rows: logRows } = await pool.query<{ week_key: string }>(
      `SELECT week_key FROM faction_war_notif_log WHERE week_key = $1`,
      [EXPECTED_WEEK_KEY],
    );
    assert.equal(logRows.length, 1, "faction_war_notif_log must have exactly one entry for this week");
    assert.equal(logRows[0].week_key, EXPECTED_WEEK_KEY);
  });

  test("second run: dedup guard prevents duplicate notifications", async () => {
    // Pre-condition: log entry IS present (inserted by the previous test or seeded manually)
    const { rows: pre } = await pool.query(
      `SELECT 1 FROM faction_war_notif_log WHERE week_key = $1`,
      [EXPECTED_WEEK_KEY],
    );
    assert.equal(pre.length, 1, "log entry must exist to test the dedup guard");

    // Count existing notifications before the second sweep
    const before = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          inArray(notificationsTable.userId, createdUserIds),
          eq(notificationsTable.type, "faction_war_result"),
        ),
      );
    const countBefore = before.length;

    // Run the sweep again with the same week
    await sweepWeeklyWarNotifications(MOCK_NOW);

    // No new notifications should have been inserted
    const after = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          inArray(notificationsTable.userId, createdUserIds),
          eq(notificationsTable.type, "faction_war_result"),
        ),
      );
    assert.equal(
      after.length,
      countBefore,
      `dedup guard failed: notifications grew from ${countBefore} to ${after.length}`,
    );
  });

  test("manual seed: dedup guard works even when log is pre-seeded (no prior sweep)", async () => {
    const FUTURE_WEEK = "2099-W01";

    // Seed the log entry directly — simulates a week that was already processed
    await pool.query(
      `INSERT INTO faction_war_notif_log (week_key) VALUES ($1) ON CONFLICT DO NOTHING`,
      [FUTURE_WEEK],
    );

    try {
      // Craft a date that resolves prevWeekKey to FUTURE_WEEK.
      // 2099-W01 Thursday = Jan 3, 2099; go forward 7 days → 2099-01-10 as "now"
      const futureNow = new Date("2099-01-10T00:00:00.000Z");
      const resolvedKey = prevWeekKey(futureNow);
      assert.equal(resolvedKey, FUTURE_WEEK, `date math should yield ${FUTURE_WEEK}`);

      // Count notifications for our test users before the sweep
      const before = await db
        .select()
        .from(notificationsTable)
        .where(
          and(
            inArray(notificationsTable.userId, createdUserIds),
            eq(notificationsTable.type, "faction_war_result"),
          ),
        );
      const countBefore = before.length;

      await sweepWeeklyWarNotifications(futureNow);

      const after = await db
        .select()
        .from(notificationsTable)
        .where(
          and(
            inArray(notificationsTable.userId, createdUserIds),
            eq(notificationsTable.type, "faction_war_result"),
          ),
        );
      assert.equal(
        after.length,
        countBefore,
        "pre-seeded log entry should block all notifications",
      );
    } finally {
      await pool.query(`DELETE FROM faction_war_notif_log WHERE week_key = $1`, [FUTURE_WEEK]);
    }
  });
});
