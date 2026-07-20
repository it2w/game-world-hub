/**
 * Integration tests for GET /api/battle-pass/current reward application.
 *
 * Covered scenarios:
 *  1. XP-boost reward at level 1 is NOT double-applied on a second visit
 *  2. Frame-color reward updates users.profile_frame_color to #22C55E when user reaches level 3
 *  3. Pro-only tier rewards (level 16+) are skipped for free users
 *  4. Pro-only tier rewards (level 16+) are applied for Pro users
 *  5. applied_rewards JSONB list grows monotonically (no removals, no duplicates)
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
import { db, usersTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `bp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// User at level 1 (0 seasonal XP) — used for double-apply + monotonic tests
let noXpUserId = 0;
let noXpUsername = "";

// User seeded with 600 bonus_xp → level 3 — used for frame_color test
let lvl3UserId = 0;
let lvl3Username = "";

// Free user seeded with 4500 bonus_xp → level 16, but NOT Pro
let freeLvl16UserId = 0;
let freeLvl16Username = "";

// Pro user seeded with 4500 bonus_xp → level 16, IS Pro
let proLvl16UserId = 0;
let proLvl16Username = "";

const createdUserIds: number[] = [];

function mkUser(label: string, isPro = false) {
  return {
    username: `${SUFFIX}_${label}`,
    passwordHash: "x",
    displayName: `BP Test ${label}`,
    status: "online" as const,
    isPro,
  };
}

before(async () => {
  // Insert all test users in one round-trip
  const inserted = await db
    .insert(usersTable)
    .values([
      mkUser("noxp"),
      mkUser("lvl3"),
      mkUser("free16"),
      mkUser("pro16", true),
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [noXpUserId,     noXpUsername]     = [inserted[0].id, inserted[0].username];
  [lvl3UserId,     lvl3Username]     = [inserted[1].id, inserted[1].username];
  [freeLvl16UserId, freeLvl16Username] = [inserted[2].id, inserted[2].username];
  [proLvl16UserId,  proLvl16Username]  = [inserted[3].id, inserted[3].username];
  createdUserIds.push(noXpUserId, lvl3UserId, freeLvl16UserId, proLvl16UserId);

  // Give lvl3User 600 bonus_xp  → floor(600/300)=2 earnedLevel → currentLevel=3
  // Give freeLvl16User / proLvl16User 4500 bonus_xp → floor(4500/300)=15 → currentLevel=16
  await pool.query(
    `INSERT INTO user_streaks
       (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES
       ($1, 0, 0, NULL, 0, 600,  NOW()),
       ($2, 0, 0, NULL, 0, 4500, NOW()),
       ($3, 0, 0, NULL, 0, 4500, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET bonus_xp = EXCLUDED.bonus_xp, updated_at = NOW()`,
    [lvl3UserId, freeLvl16UserId, proLvl16UserId],
  );

  // Start the HTTP server on an ephemeral port
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdUserIds.length) {
    // Remove battle-pass state in dependency order
    await pool.query(
      `DELETE FROM user_battle_pass_tier_grants WHERE user_id = ANY($1::int[])`,
      [createdUserIds],
    );
    await pool.query(
      `DELETE FROM user_battle_pass_progress WHERE user_id = ANY($1::int[])`,
      [createdUserIds],
    );
    await pool.query(
      `DELETE FROM user_streaks WHERE user_id = ANY($1::int[])`,
      [createdUserIds],
    );
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function getBattlePass(
  userId: number,
  username: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const token = signToken({ userId, username });
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/battle-pass/current`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: { raw: data } });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/battle-pass/current — reward application", () => {

  test("xp_boost at level 1 is not double-applied on a second visit", async () => {
    // noXpUser has no activity → seasonXp = 0 → level 1
    // Level-1 reward: xp_boost +50 → adds 50 to user_streaks.bonus_xp

    const first = await getBattlePass(noXpUserId, noXpUsername);
    assert.equal(first.status, 200, `first call: ${JSON.stringify(first.body)}`);

    // Verify the level-1 xp_boost was applied on the first call
    const firstTiers = first.body.tiers as Array<Record<string, unknown>>;
    const lvl1TierFirst = firstTiers.find((t) => t.level === 1);
    assert.ok(lvl1TierFirst, "level 1 tier should be present in response");
    assert.equal(lvl1TierFirst.applied, true, "level 1 tier should be marked applied after first call");

    // Read bonus_xp after first call
    const { rows: afterFirst } = await pool.query<{ bonus_xp: number }>(
      `SELECT bonus_xp FROM user_streaks WHERE user_id = $1`,
      [noXpUserId],
    );
    const bonusAfterFirst = afterFirst[0]?.bonus_xp ?? 0;
    assert.equal(bonusAfterFirst, 50, "bonus_xp should be 50 after first call (level-1 reward)");

    // Second call — must NOT re-apply the level-1 xp_boost
    const second = await getBattlePass(noXpUserId, noXpUsername);
    assert.equal(second.status, 200, `second call: ${JSON.stringify(second.body)}`);

    const { rows: afterSecond } = await pool.query<{ bonus_xp: number }>(
      `SELECT bonus_xp FROM user_streaks WHERE user_id = $1`,
      [noXpUserId],
    );
    const bonusAfterSecond = afterSecond[0]?.bonus_xp ?? 0;
    assert.equal(
      bonusAfterSecond,
      bonusAfterFirst,
      `bonus_xp must not increase on second call (was ${bonusAfterFirst}, got ${bonusAfterSecond})`,
    );

    // Confirm the idempotency ledger has exactly one grant for level 1
    const { rows: grants } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM user_battle_pass_tier_grants
       WHERE user_id = $1 AND tier_level = 1`,
      [noXpUserId],
    );
    assert.equal(
      parseInt(grants[0].cnt, 10),
      1,
      "idempotency ledger must have exactly one grant row for level 1",
    );
  });

  test("frame_color updated to #22C55E in users table when user reaches level 3", async () => {
    // lvl3User has bonus_xp=600 → seasonXp=600 → floor(600/300)=2 → currentLevel=3
    // Level-3 reward: frame_color #22C55E

    const { status, body } = await getBattlePass(lvl3UserId, lvl3Username);
    assert.equal(status, 200, JSON.stringify(body));

    // The level-3 tier must be marked applied
    const tiers = body.tiers as Array<Record<string, unknown>>;
    const lvl3Tier = tiers.find((t) => t.level === 3);
    assert.ok(lvl3Tier, "level 3 tier should be present");
    assert.equal(lvl3Tier.applied, true, "level 3 tier should be marked applied");

    // Confirm the users table was updated
    const { rows } = await pool.query<{ profile_frame_color: string | null }>(
      `SELECT profile_frame_color FROM users WHERE id = $1`,
      [lvl3UserId],
    );
    assert.equal(
      rows[0]?.profile_frame_color,
      "#22C55E",
      "users.profile_frame_color must be #22C55E after level-3 reward application",
    );
  });

  test("Pro-only tier (level 16) is skipped for free users", async () => {
    // freeLvl16User has bonus_xp=4500, isPro=false → currentLevel=16
    // Level-16 reward is track='pro' → must NOT be applied for a free user

    const { status, body } = await getBattlePass(freeLvl16UserId, freeLvl16Username);
    assert.equal(status, 200, JSON.stringify(body));

    const tiers = body.tiers as Array<Record<string, unknown>>;
    const lvl16Tier = tiers.find((t) => t.level === 16);
    assert.ok(lvl16Tier, "level 16 tier should be present in response");
    assert.equal(lvl16Tier.applied, false, "level 16 (pro-only) tier must NOT be applied for a free user");
    assert.equal(lvl16Tier.accessible, false, "level 16 must not be accessible for a free user");

    // Confirm the grant ledger has no row for level 16
    const { rows: grants } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM user_battle_pass_tier_grants
       WHERE user_id = $1 AND tier_level = 16`,
      [freeLvl16UserId],
    );
    assert.equal(
      parseInt(grants[0].cnt, 10),
      0,
      "no grant-ledger row should exist for level 16 on a free user",
    );
  });

  test("Pro-only tier (level 16) is applied for Pro users", async () => {
    // proLvl16User has bonus_xp=4500, isPro=true → currentLevel=16
    // Level-16 reward (xp_boost +200) must be applied

    const { status, body } = await getBattlePass(proLvl16UserId, proLvl16Username);
    assert.equal(status, 200, JSON.stringify(body));

    const tiers = body.tiers as Array<Record<string, unknown>>;
    const lvl16Tier = tiers.find((t) => t.level === 16);
    assert.ok(lvl16Tier, "level 16 tier should be present in response");
    assert.equal(lvl16Tier.applied, true, "level 16 (pro-only) tier must be applied for a Pro user");
    assert.equal(lvl16Tier.accessible, true, "level 16 must be accessible for a Pro user");

    // Confirm the grant ledger has the row for level 16
    const { rows: grants } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM user_battle_pass_tier_grants
       WHERE user_id = $1 AND tier_level = 16`,
      [proLvl16UserId],
    );
    assert.equal(
      parseInt(grants[0].cnt, 10),
      1,
      "grant-ledger must have exactly one row for level 16 on a Pro user",
    );
  });

  test("applied_rewards JSONB list grows monotonically — no removals, no duplicates", async () => {
    // We reuse noXpUser who already has the level-1 reward applied.
    // After calling the endpoint multiple times, the applied_rewards list must
    // only grow (or stay the same), never shrink or contain duplicates.

    // Fetch the season id (active season must exist by now)
    const { rows: seasonRows } = await pool.query<{ id: number }>(
      `SELECT id FROM battle_pass_seasons WHERE is_active = true LIMIT 1`,
    );
    assert.ok(seasonRows.length > 0, "an active season must exist");
    const seasonId = seasonRows[0].id;

    const getApplied = async (): Promise<number[]> => {
      const { rows } = await pool.query<{ applied_rewards: number[] }>(
        `SELECT applied_rewards FROM user_battle_pass_progress WHERE user_id = $1 AND season_id = $2`,
        [noXpUserId, seasonId],
      );
      return (rows[0]?.applied_rewards as number[]) ?? [];
    };

    // Snapshot after previous tests (noXpUser is at level 1, applied=[1])
    const before1 = await getApplied();
    assert.ok(before1.length > 0, "applied_rewards must already have at least one entry");

    // Call the endpoint again twice more
    await getBattlePass(noXpUserId, noXpUsername);
    const after2 = await getApplied();

    await getBattlePass(noXpUserId, noXpUsername);
    const after3 = await getApplied();

    // Monotonically non-decreasing: each snapshot must be a superset of the previous
    for (const level of before1) {
      assert.ok(after2.includes(level), `applied_rewards must still contain level ${level} after 2nd extra call`);
      assert.ok(after3.includes(level), `applied_rewards must still contain level ${level} after 3rd extra call`);
    }
    for (const level of after2) {
      assert.ok(after3.includes(level), `applied_rewards must still contain level ${level} after 3rd extra call`);
    }

    // No duplicates in the final snapshot
    const uniqueSet = new Set(after3);
    assert.equal(
      uniqueSet.size,
      after3.length,
      `applied_rewards must have no duplicate entries, got: ${JSON.stringify(after3)}`,
    );
  });
});
