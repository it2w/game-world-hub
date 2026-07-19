/**
 * Integration tests for sweepWeeklyWarNotifications
 *
 * Verifies that the weekly war notification sweep:
 *  1. Picks the faction that led in the PRIOR ISO-week window
 *     [prevMonday, thisMonday), not the faction leading the current week.
 *  2. Writes a faction_war_notif_log entry so duplicate notifications are suppressed.
 *  3. A second call for the same week key is a strict no-op (idempotency).
 *
 * All sweep calls use NOW_OVERRIDE = 2026-01-14T12:00:00Z (Wednesday) so the
 * ISO-week boundaries are fixed and the results don't vary by day-of-week:
 *   prior week  = [2026-01-05, 2026-01-12)
 *   current week = [2026-01-12, 2026-01-19)
 *
 * Setup:
 *  - Faction A gets a large volume of LFG-post activity planted on 2026-01-08
 *    (Thursday, firmly inside the prior ISO week [2026-01-05, 2026-01-12)).
 *  - Faction B gets the same volume of LFG-post activity planted on 2026-01-13
 *    (Tuesday, firmly inside the current ISO week — excluded by the sweep).
 *  - Because Faction A's prior-week points vastly exceed any realistic production
 *    traffic, Faction A wins the week regardless of other factions.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  notificationsTable,
  conversationsTable,
  conversationParticipantsTable,
  lfgPostsTable,
  lfgResponsesTable,
} from "@workspace/db";
import { sweepWeeklyWarNotifications, prevWeekKey } from "./factions";

// ─── Fixture state ────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

/**
 * Fixed reference "now" used as nowOverride for every sweep call in this file.
 *
 * Chosen to be a Wednesday so the ISO-week boundaries are unambiguous:
 *   thisMonday  = date_trunc('week', NOW_OVERRIDE) = 2026-01-12 (Mon)
 *   prevMonday  = thisMonday - 7d                  = 2026-01-05 (Mon)
 *   prior week  = [2026-01-05, 2026-01-12)
 *
 * priorTs (2026-01-08, Thursday) is firmly inside [2026-01-05, 2026-01-12).
 * currentTs (2026-01-13, Tuesday) is firmly inside [2026-01-12, 2026-01-19).
 *
 * Using a fixed value means the test results don't depend on the current
 * day-of-week when the suite runs.
 */
const NOW_OVERRIDE = new Date("2026-01-14T12:00:00Z"); // Wednesday Jan 14 2026

let factionAId = 0; // prior-week dominant faction
let factionBId = 0; // current-week dominant faction (should NOT win the prior-week sweep)

let userAId = 0; // member of faction A
let userBId = 0; // member of faction B

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdResponseIds: number[] = [];
const createdConvIds: number[] = [];

/** Week key that will be written to faction_war_notif_log during the test */
let testWeekKey = "";

function mkUser(label: string) {
  return {
    username:    `fwnotif_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FWNotif ${label}`,
    status:      "online" as const,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  // Ensure all faction-related tables exist (idempotent DDL)
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

  // Create two isolated test factions
  const { rows: fRows } = await pool.query<{ id: number }>(`
    INSERT INTO factions (name, slug, color, icon_emoji, description) VALUES
      ($1, $2, '#aa0000', '🔴', 'War notif test — prior-week dominant'),
      ($3, $4, '#0000aa', '🔵', 'War notif test — current-week dominant')
    RETURNING id
  `, [
    `FWNotifFactionA_${SUFFIX}`, `fwnotif_a_${SUFFIX}`,
    `FWNotifFactionB_${SUFFIX}`, `fwnotif_b_${SUFFIX}`,
  ]);
  factionAId = fRows[0].id;
  factionBId = fRows[1].id;

  // Create one member per faction
  const inserted = await db
    .insert(usersTable)
    .values([mkUser("userA"), mkUser("userB")])
    .returning({ id: usersTable.id });

  userAId = inserted[0].id;
  userBId = inserted[1].id;
  createdUserIds.push(userAId, userBId);

  // Enrol each user in their faction
  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id) VALUES ($1,$2), ($3,$4)`,
    [userAId, factionAId, userBId, factionBId],
  );

  // Create a shared conversation so conversation_participants FKs are satisfied
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "group" })
    .returning({ id: conversationsTable.id });
  createdConvIds.push(conv.id);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: conv.id, userId: userAId },
    { conversationId: conv.id, userId: userBId },
  ]);

  // ── Faction A — seed activity in the PRIOR-WEEK window ───────────────────
  // Timestamp is 2026-01-08 (Thursday), firmly inside the prior ISO week
  // [2026-01-05, 2026-01-12) relative to NOW_OVERRIDE (2026-01-14, Wednesday).
  // 20 posts × 5 pts = 100 pts — enough to beat any realistic production traffic.
  const priorTs = new Date("2026-01-08T12:00:00Z");

  const { rows: aPostRows } = await pool.query<{ id: number }>(
    `INSERT INTO lfg_posts
       (author_id, game, description, needed_players, mic_required, status, created_at)
     VALUES
       ($1,'GameA','Prior post 1', 1,false,'open',$2),
       ($1,'GameA','Prior post 2', 1,false,'open',$2),
       ($1,'GameA','Prior post 3', 1,false,'open',$2),
       ($1,'GameA','Prior post 4', 1,false,'open',$2),
       ($1,'GameA','Prior post 5', 1,false,'open',$2),
       ($1,'GameA','Prior post 6', 1,false,'open',$2),
       ($1,'GameA','Prior post 7', 1,false,'open',$2),
       ($1,'GameA','Prior post 8', 1,false,'open',$2),
       ($1,'GameA','Prior post 9', 1,false,'open',$2),
       ($1,'GameA','Prior post 10',1,false,'open',$2),
       ($1,'GameA','Prior post 11',1,false,'open',$2),
       ($1,'GameA','Prior post 12',1,false,'open',$2),
       ($1,'GameA','Prior post 13',1,false,'open',$2),
       ($1,'GameA','Prior post 14',1,false,'open',$2),
       ($1,'GameA','Prior post 15',1,false,'open',$2),
       ($1,'GameA','Prior post 16',1,false,'open',$2),
       ($1,'GameA','Prior post 17',1,false,'open',$2),
       ($1,'GameA','Prior post 18',1,false,'open',$2),
       ($1,'GameA','Prior post 19',1,false,'open',$2),
       ($1,'GameA','Prior post 20',1,false,'open',$2)
     RETURNING id`,
    [userAId, priorTs],
  );
  createdPostIds.push(...aPostRows.map(r => r.id));
  // Faction A prior-week pts: 20 × 5 = 100

  // ── Faction B — seed activity in the CURRENT-WEEK window ─────────────────
  // Timestamp is 2026-01-13 (Tuesday), firmly inside the current ISO week
  // [2026-01-12, 2026-01-19) relative to NOW_OVERRIDE — excluded by the sweep.
  const currentTs = new Date("2026-01-13T12:00:00Z");

  const { rows: bPostRows } = await pool.query<{ id: number }>(
    `INSERT INTO lfg_posts
       (author_id, game, description, needed_players, mic_required, status, created_at)
     VALUES
       ($1,'GameB','Current post 1', 1,false,'open',$2),
       ($1,'GameB','Current post 2', 1,false,'open',$2),
       ($1,'GameB','Current post 3', 1,false,'open',$2),
       ($1,'GameB','Current post 4', 1,false,'open',$2),
       ($1,'GameB','Current post 5', 1,false,'open',$2),
       ($1,'GameB','Current post 6', 1,false,'open',$2),
       ($1,'GameB','Current post 7', 1,false,'open',$2),
       ($1,'GameB','Current post 8', 1,false,'open',$2),
       ($1,'GameB','Current post 9', 1,false,'open',$2),
       ($1,'GameB','Current post 10',1,false,'open',$2),
       ($1,'GameB','Current post 11',1,false,'open',$2),
       ($1,'GameB','Current post 12',1,false,'open',$2),
       ($1,'GameB','Current post 13',1,false,'open',$2),
       ($1,'GameB','Current post 14',1,false,'open',$2),
       ($1,'GameB','Current post 15',1,false,'open',$2),
       ($1,'GameB','Current post 16',1,false,'open',$2),
       ($1,'GameB','Current post 17',1,false,'open',$2),
       ($1,'GameB','Current post 18',1,false,'open',$2),
       ($1,'GameB','Current post 19',1,false,'open',$2),
       ($1,'GameB','Current post 20',1,false,'open',$2)
     RETURNING id`,
    [userBId, currentTs],
  );
  createdPostIds.push(...bPostRows.map(r => r.id));
  // Faction B prior-week pts: 0 (all posts are in the current window)

  // Determine and clear the prior-week notif log entry so the sweep runs fresh.
  // Use NOW_OVERRIDE so the week key matches what the sweep will compute.
  testWeekKey = prevWeekKey(NOW_OVERRIDE);
  await pool.query(
    `DELETE FROM faction_war_notif_log WHERE week_key = $1`,
    [testWeekKey],
  );
});

// ─── Teardown ─────────────────────────────────────────────────────────────────

after(async () => {
  // Notifications created for test users by the sweep
  await pool.query(
    `DELETE FROM notifications WHERE user_id = ANY($1::int[])`,
    [[userAId, userBId]],
  );

  // Notif log entry written during the test
  await pool.query(
    `DELETE FROM faction_war_notif_log WHERE week_key = $1`,
    [testWeekKey],
  );

  // LFG data
  if (createdResponseIds.length) {
    await db.delete(lfgResponsesTable).where(inArray(lfgResponsesTable.id, createdResponseIds));
  }
  if (createdPostIds.length) {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, createdPostIds));
  }

  // Conversations
  for (const convId of createdConvIds) {
    await pool.query(`DELETE FROM conversation_participants WHERE conversation_id = $1`, [convId]);
    await pool.query(`DELETE FROM conversations WHERE id = $1`, [convId]);
  }

  // Faction memberships and users
  await pool.query(
    `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
    [[userAId, userBId]],
  );
  await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));

  // Test factions
  await pool.query(
    `DELETE FROM factions WHERE id = ANY($1::int[])`,
    [[factionAId, factionBId]],
  );

  await pool.end();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sweepWeeklyWarNotifications — prior-week window and idempotency", () => {
  test("sweep writes a faction_war_notif_log entry for the previous ISO week", async () => {
    // Pre-condition: no log entry exists (cleared in before())
    const { rows: before } = await pool.query(
      `SELECT 1 FROM faction_war_notif_log WHERE week_key = $1`,
      [testWeekKey],
    );
    assert.equal(before.length, 0, `notif log entry should not exist before sweep`);

    await sweepWeeklyWarNotifications(NOW_OVERRIDE);

    const { rows: after } = await pool.query(
      `SELECT week_key FROM faction_war_notif_log WHERE week_key = $1`,
      [testWeekKey],
    );
    assert.equal(
      after.length,
      1,
      `faction_war_notif_log must contain an entry for week ${testWeekKey} after the sweep`,
    );
    assert.equal(
      after[0].week_key,
      testWeekKey,
      `log entry week_key must equal ${testWeekKey}`,
    );
  });

  test("faction A member (prior-week dominant) receives a faction_war_result notification", async () => {
    // sweep() was already called by the previous test; log entry exists → it won't run again.
    // Read the notifications seeded for userA.
    const { rows } = await pool.query<{ type: string; title: string; body: string }>(
      `SELECT type, title, body FROM notifications WHERE user_id = $1 AND type = 'faction_war_result' ORDER BY id DESC LIMIT 1`,
      [userAId],
    );
    assert.equal(
      rows.length,
      1,
      `userA (faction A member) should have received a faction_war_result notification`,
    );
    assert.equal(rows[0].type, "faction_war_result");
  });

  test("faction A member notification has the winning title (faction A won the prior week)", async () => {
    const { rows } = await pool.query<{ title: string; body: string }>(
      `SELECT title, body FROM notifications WHERE user_id = $1 AND type = 'faction_war_result' ORDER BY id DESC LIMIT 1`,
      [userAId],
    );
    assert.equal(rows.length, 1, `userA should have a faction_war_result notification`);

    // The winner gets a title containing "wins" and the faction name
    const factionAName = `FWNotifFactionA_${SUFFIX}`;
    assert.ok(
      rows[0].title.includes(factionAName) && rows[0].title.includes("wins"),
      `faction A member notification title should indicate A wins; got: "${rows[0].title}"`,
    );
  });

  test("faction B member (current-week activity only) receives a generic results notification, not a winning one", async () => {
    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND type = 'faction_war_result' ORDER BY id DESC LIMIT 1`,
      [userBId],
    );
    assert.equal(
      rows.length,
      1,
      `userB (faction B member) should also receive a faction_war_result notification (all members notified)`,
    );

    // Faction B lost — their notification title should NOT contain "wins"
    const factionBName = `FWNotifFactionB_${SUFFIX}`;
    const isWinnerTitle =
      rows[0].title.includes(factionBName) && rows[0].title.includes("wins");
    assert.equal(
      isWinnerTitle,
      false,
      `faction B member should NOT get a winning-faction title; their faction only has current-week activity (excluded from the prior-week sweep). Got: "${rows[0].title}"`,
    );
  });

  test("second sweep call for the same week is a strict no-op — no duplicate notifications", async () => {
    // Count notifications for test users before the second call
    const { rows: before } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM notifications WHERE user_id = ANY($1::int[]) AND type = 'faction_war_result'`,
      [[userAId, userBId]],
    );
    const countBefore = parseInt(before[0].cnt, 10);
    assert.ok(countBefore >= 2, `at least 2 notifications expected from the first sweep`);

    // Second call — log entry already exists, sweep must exit immediately
    await sweepWeeklyWarNotifications(NOW_OVERRIDE);

    const { rows: after } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM notifications WHERE user_id = ANY($1::int[]) AND type = 'faction_war_result'`,
      [[userAId, userBId]],
    );
    const countAfter = parseInt(after[0].cnt, 10);

    assert.equal(
      countAfter,
      countBefore,
      `second sweep must not add new notifications (got ${countAfter}, expected ${countBefore})`,
    );
  });

  test("prior-week window correctly excludes activity from the current ISO week (2026-01-13)", async () => {
    // Faction B has 20 posts on 2026-01-13 (Tuesday of the current ISO week
    // [2026-01-12, 2026-01-19) relative to NOW_OVERRIDE). The sweep window is
    // [prevMonday, thisMonday) = [2026-01-05, 2026-01-12). A faction with ONLY
    // current-week activity must score 0 in the prior-week standings. Verify
    // faction B scored 0 by checking that its member did NOT get a "wins" notification.
    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND type = 'faction_war_result'`,
      [userBId],
    );
    assert.ok(rows.length > 0, `userB must have received at least one faction_war_result notification`);
    for (const row of rows) {
      const factionBName = `FWNotifFactionB_${SUFFIX}`;
      assert.equal(
        row.title.includes(factionBName) && row.title.includes("wins"),
        false,
        `faction B (current-week-only activity) must NOT be declared prior-week winner; title: "${row.title}"`,
      );
    }
  });

  test("prior-week window correctly includes activity from the prior ISO week (2026-01-08)", async () => {
    // Faction A has 20 posts on 2026-01-08 (Thursday of the prior ISO week
    // [2026-01-05, 2026-01-12) relative to NOW_OVERRIDE), worth 100 pts.
    // Verify faction A is the winner by checking its member got the winning title.
    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND type = 'faction_war_result'`,
      [userAId],
    );
    assert.ok(rows.length > 0, `userA must have received at least one faction_war_result notification`);

    const factionAName = `FWNotifFactionA_${SUFFIX}`;
    const winnerRow = rows.find(r => r.title.includes(factionAName) && r.title.includes("wins"));
    assert.ok(
      winnerRow !== undefined,
      `faction A (prior-week activity at NOW()-10d, 100 pts) must be declared winner; notifications: ${JSON.stringify(rows)}`,
    );
  });

  test("notification body contains an entry for every faction including the three default factions", async () => {
    // The standings query does a LEFT JOIN over ALL factions, so every faction
    // (including the three production factions — Shadows, Titans, Ghosts — and
    // the two isolated test factions) must appear in the summary string.
    const { rows } = await pool.query<{ body: string }>(
      `SELECT body FROM notifications WHERE user_id = $1 AND type = 'faction_war_result' ORDER BY id DESC LIMIT 1`,
      [userAId],
    );
    assert.equal(rows.length, 1, `userA should have a faction_war_result notification`);
    const body = rows[0].body;

    const requiredNames = [
      "Shadows",
      "Titans",
      "Ghosts",
      `FWNotifFactionA_${SUFFIX}`,
      `FWNotifFactionB_${SUFFIX}`,
    ];
    for (const name of requiredNames) {
      assert.ok(
        body.includes(name),
        `notification body must include faction "${name}"; got body: "${body}"`,
      );
    }
  });

  test("notification body lists factions in medal emoji order (🥇 🥈 🥉)", async () => {
    // The summary is built with standings.map((f, i) => `${medals[i]} ${f.name}: …`).join(" | ")
    // so the three medal emojis must appear in order within the body string.
    const { rows } = await pool.query<{ body: string }>(
      `SELECT body FROM notifications WHERE user_id = $1 AND type = 'faction_war_result' ORDER BY id DESC LIMIT 1`,
      [userAId],
    );
    assert.equal(rows.length, 1, `userA should have a faction_war_result notification`);
    const body = rows[0].body;

    const goldIdx   = body.indexOf("🥇");
    const silverIdx = body.indexOf("🥈");
    const bronzeIdx = body.indexOf("🥉");

    assert.ok(goldIdx   !== -1, `body must contain 🥇 gold medal; got: "${body}"`);
    assert.ok(silverIdx !== -1, `body must contain 🥈 silver medal; got: "${body}"`);
    assert.ok(bronzeIdx !== -1, `body must contain 🥉 bronze medal; got: "${body}"`);

    assert.ok(
      goldIdx < silverIdx,
      `🥇 must appear before 🥈 in the body; got: "${body}"`,
    );
    assert.ok(
      silverIdx < bronzeIdx,
      `🥈 must appear before 🥉 in the body; got: "${body}"`,
    );
  });
});
