import { Router, type IRouter } from "express";
import { pool, db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";

const router: IRouter = Router();

const XP_PER_LEVEL    = 300;
const MAX_LEVEL       = 30;
const FREE_MAX_LEVEL  = 15;

// Advisory lock key for transactional season creation (arbitrary stable integer)
const SEASON_LOCK_KEY = 1_648_320_001;

// ── Tier definitions ──────────────────────────────────────────────────────────
interface TierDef {
  level: number;
  track: "free" | "pro";
  rewardType: "xp_boost" | "frame_color" | "title";
  rewardValue: string;
  rewardLabel: { en: string; ar: string };
  rewardIcon: string;
}

const TIER_DEFS: TierDef[] = [
  // ── Free track (1-15) ────────────────────────────────────────────────────
  { level:  1, track: "free", rewardType: "xp_boost",   rewardValue: "50",           rewardIcon: "⚡", rewardLabel: { en: "+50 Bonus XP",           ar: "+50 XP إضافية"       } },
  { level:  2, track: "free", rewardType: "title",       rewardValue: "Recruit",      rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Recruit"',         ar: 'لقب: "مجند"'         } },
  { level:  3, track: "free", rewardType: "frame_color", rewardValue: "#22C55E",      rewardIcon: "🟢", rewardLabel: { en: "Green Frame",              ar: "إطار أخضر"           } },
  { level:  4, track: "free", rewardType: "xp_boost",   rewardValue: "75",           rewardIcon: "⚡", rewardLabel: { en: "+75 Bonus XP",            ar: "+75 XP إضافية"       } },
  { level:  5, track: "free", rewardType: "title",       rewardValue: "Veteran",      rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Veteran"',         ar: 'لقب: "محارب"'        } },
  { level:  6, track: "free", rewardType: "frame_color", rewardValue: "#06B6D4",      rewardIcon: "🔵", rewardLabel: { en: "Cyan Frame",               ar: "إطار سماوي"          } },
  { level:  7, track: "free", rewardType: "xp_boost",   rewardValue: "100",          rewardIcon: "⚡", rewardLabel: { en: "+100 Bonus XP",           ar: "+100 XP إضافية"      } },
  { level:  8, track: "free", rewardType: "title",       rewardValue: "Elite",        rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Elite"',           ar: 'لقب: "نخبة"'         } },
  { level:  9, track: "free", rewardType: "frame_color", rewardValue: "#F97316",      rewardIcon: "🟠", rewardLabel: { en: "Orange Frame",             ar: "إطار برتقالي"        } },
  { level: 10, track: "free", rewardType: "xp_boost",   rewardValue: "150",          rewardIcon: "💥", rewardLabel: { en: "+150 Bonus XP",           ar: "+150 XP إضافية"      } },
  { level: 11, track: "free", rewardType: "title",       rewardValue: "Commander",    rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Commander"',       ar: 'لقب: "قائد"'         } },
  { level: 12, track: "free", rewardType: "frame_color", rewardValue: "#A855F7",      rewardIcon: "🟣", rewardLabel: { en: "Purple Frame",             ar: "إطار بنفسجي"         } },
  { level: 13, track: "free", rewardType: "xp_boost",   rewardValue: "125",          rewardIcon: "⚡", rewardLabel: { en: "+125 Bonus XP",           ar: "+125 XP إضافية"      } },
  { level: 14, track: "free", rewardType: "title",       rewardValue: "Legend",       rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Legend"',          ar: 'لقب: "أسطورة"'       } },
  { level: 15, track: "free", rewardType: "frame_color", rewardValue: "#FFD700",      rewardIcon: "🥇", rewardLabel: { en: "Gold Frame",               ar: "إطار ذهبي"           } },
  // ── Pro track (16-30) ────────────────────────────────────────────────────
  { level: 16, track: "pro",  rewardType: "xp_boost",   rewardValue: "200",          rewardIcon: "⚡", rewardLabel: { en: "+200 Bonus XP",           ar: "+200 XP إضافية"      } },
  { level: 17, track: "pro",  rewardType: "frame_color", rewardValue: "#EC4899",      rewardIcon: "🩷", rewardLabel: { en: "Neon Pink Frame",          ar: "إطار وردي نيون"      } },
  { level: 18, track: "pro",  rewardType: "title",       rewardValue: "Shadow",       rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Shadow"',          ar: 'لقب: "الظل"'         } },
  { level: 19, track: "pro",  rewardType: "xp_boost",   rewardValue: "250",          rewardIcon: "⚡", rewardLabel: { en: "+250 Bonus XP",           ar: "+250 XP إضافية"      } },
  { level: 20, track: "pro",  rewardType: "frame_color", rewardValue: "#EF4444",      rewardIcon: "🔴", rewardLabel: { en: "Crimson Frame",            ar: "إطار قرمزي"          } },
  { level: 21, track: "pro",  rewardType: "title",       rewardValue: "Phantom",      rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Phantom"',         ar: 'لقب: "الشبح"'        } },
  { level: 22, track: "pro",  rewardType: "xp_boost",   rewardValue: "300",          rewardIcon: "💥", rewardLabel: { en: "+300 Bonus XP",           ar: "+300 XP إضافية"      } },
  { level: 23, track: "pro",  rewardType: "frame_color", rewardValue: "#38BDF8",      rewardIcon: "🩵", rewardLabel: { en: "Sky Blue Frame",           ar: "إطار أزرق سماوي"     } },
  { level: 24, track: "pro",  rewardType: "title",       rewardValue: "Warlord",      rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Warlord"',         ar: 'لقب: "أمير الحرب"'   } },
  { level: 25, track: "pro",  rewardType: "xp_boost",   rewardValue: "500",          rewardIcon: "🔥", rewardLabel: { en: "+500 Bonus XP",           ar: "+500 XP إضافية"      } },
  { level: 26, track: "pro",  rewardType: "frame_color", rewardValue: "#FF00FF",      rewardIcon: "🌈", rewardLabel: { en: "Magenta Frame",            ar: "إطار ماجنتا"         } },
  { level: 27, track: "pro",  rewardType: "title",       rewardValue: "Immortal",     rewardIcon: "🏷️", rewardLabel: { en: 'Title: "Immortal"',        ar: 'لقب: "الخالد"'       } },
  { level: 28, track: "pro",  rewardType: "xp_boost",   rewardValue: "750",          rewardIcon: "💥", rewardLabel: { en: "+750 Bonus XP",           ar: "+750 XP إضافية"      } },
  { level: 29, track: "pro",  rewardType: "frame_color", rewardValue: "#FF4655",      rewardIcon: "❤️‍🔥", rewardLabel: { en: "Valorant Red Frame",      ar: "إطار أحمر فالورانت"  } },
  { level: 30, track: "pro",  rewardType: "title",       rewardValue: "Transcendent", rewardIcon: "👑", rewardLabel: { en: 'Title: "Transcendent"',    ar: 'لقب: "المتسامي"'     } },
];

// ── Ensure tables + partial unique index ──────────────────────────────────────
async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_pass_seasons (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date   DATE NOT NULL,
      is_active  BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Enforce at most one active season at a time at the DB level
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bp_seasons_one_active
    ON battle_pass_seasons(is_active) WHERE is_active = true
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_battle_pass_progress (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season_id      INTEGER NOT NULL,
      current_level  INTEGER NOT NULL DEFAULT 0,
      applied_rewards JSONB  NOT NULL DEFAULT '[]',
      earned_titles   JSONB  NOT NULL DEFAULT '[]',
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, season_id)
    )
  `);
  // Idempotency ledger — a row here means the reward was fully committed
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_battle_pass_tier_grants (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season_id  INTEGER NOT NULL,
      tier_level INTEGER NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, season_id, tier_level)
    )
  `);
}

// ── Season: transactional creation with advisory lock ─────────────────────────
async function ensureActiveSeason(): Promise<{
  id: number; name: string; start_date: string; end_date: string;
}> {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Fast path: no lock needed if a valid season already exists
  const { rows: fast } = await pool.query<{
    id: number; name: string; start_date: string; end_date: string;
  }>(
    `SELECT id, name, start_date::text, end_date::text
     FROM battle_pass_seasons
     WHERE is_active = true AND end_date >= $1
     LIMIT 1`,
    [todayStr],
  );
  if (fast.length > 0) return fast[0];

  // Slow path: acquire an advisory lock so only one connection creates the season
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [SEASON_LOCK_KEY]);

    // Re-check inside the lock (another connection may have just created it)
    const { rows: rechecked } = await client.query<{
      id: number; name: string; start_date: string; end_date: string;
    }>(
      `SELECT id, name, start_date::text, end_date::text
       FROM battle_pass_seasons
       WHERE is_active = true AND end_date >= $1
       LIMIT 1`,
      [todayStr],
    );
    if (rechecked.length > 0) {
      await client.query("COMMIT");
      return rechecked[0];
    }

    // Deactivate any expired seasons, then create a fresh month-long season
    const year      = today.getUTCFullYear();
    const month     = today.getUTCMonth();
    const startDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const endDate   = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    const label     = today.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    await client.query(`UPDATE battle_pass_seasons SET is_active = false WHERE is_active = true`);
    const { rows: [season] } = await client.query<{
      id: number; name: string; start_date: string; end_date: string;
    }>(
      `INSERT INTO battle_pass_seasons (name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, start_date::text, end_date::text`,
      [`Season: ${label}`, startDate, endDate],
    );

    await client.query("COMMIT");
    return season;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Compute seasonal XP from activity since season start ─────────────────────
async function getSeasonXp(userId: number, seasonStartDate: string): Promise<number> {
  const start = new Date(seasonStartDate + "T00:00:00Z");

  const [msgRes, lfgRes, friendRes, streakRes] = await Promise.all([
    pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM messages WHERE sender_id = $1 AND created_at >= $2`,
      [userId, start],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM lfg_posts WHERE author_id = $1 AND created_at >= $2 AND status != 'deleted'`,
      [userId, start],
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM friendships WHERE user_id = $1 AND since >= $2`,
      [userId, start],
    ),
    pool.query<{ bonus_xp: number }>(
      `SELECT COALESCE(bonus_xp, 0) AS bonus_xp FROM user_streaks WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return (
    parseInt(msgRes.rows[0]?.c    ?? "0") * 4  +
    parseInt(lfgRes.rows[0]?.c    ?? "0") * 70 +
    parseInt(friendRes.rows[0]?.c ?? "0") * 50 +
    (streakRes.rows[0]?.bonus_xp  ?? 0)
  );
}

// ── Apply a single reward inside an open transaction ──────────────────────────
// Raw SQL only — no drizzle calls so the client stays on the same connection.
async function applyRewardTx(client: PoolClient, userId: number, tier: TierDef): Promise<void> {
  if (tier.rewardType === "xp_boost") {
    const xp = parseInt(tier.rewardValue, 10);
    await client.query(
      `INSERT INTO user_streaks
         (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
       VALUES ($1, 0, 0, NULL, 0, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET bonus_xp = user_streaks.bonus_xp + $2, updated_at = NOW()`,
      [userId, xp],
    );
  } else if (tier.rewardType === "frame_color") {
    await client.query(
      `UPDATE users SET profile_frame_color = $2 WHERE id = $1`,
      [userId, tier.rewardValue],
    );
  }
  // "title" rewards are tracked in earned_titles; profile display is a follow-up feature
}

// ── Atomically apply newly earned tier rewards ────────────────────────────────
// Returns the list of tiers whose rewards were newly applied in this call.
async function applyNewRewards(
  userId: number,
  seasonId: number,
  tiersEarned: TierDef[],
  newLevel: number,
): Promise<TierDef[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure progress row exists, then lock it for the duration of the transaction
    await client.query(
      `INSERT INTO user_battle_pass_progress (user_id, season_id, current_level, applied_rewards, earned_titles)
       VALUES ($1, $2, 0, '[]', '[]')
       ON CONFLICT (user_id, season_id) DO NOTHING`,
      [userId, seasonId],
    );
    const { rows: [progress] } = await client.query<{
      current_level: number;
      applied_rewards: number[];
      earned_titles: string[];
    }>(
      `SELECT current_level, applied_rewards, earned_titles
       FROM user_battle_pass_progress
       WHERE user_id = $1 AND season_id = $2
       FOR UPDATE`,
      [userId, seasonId],
    );

    const appliedSet  = new Set<number>((progress.applied_rewards as number[]) ?? []);
    const nowApplied: TierDef[] = [];

    for (const tier of tiersEarned) {
      if (appliedSet.has(tier.level)) continue;

      // Idempotency guard: insert into the grant ledger; skip if it already exists
      const { rowCount } = await client.query(
        `INSERT INTO user_battle_pass_tier_grants (user_id, season_id, tier_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, season_id, tier_level) DO NOTHING`,
        [userId, seasonId, tier.level],
      );
      if (!rowCount || rowCount === 0) continue; // already granted in a prior request

      await applyRewardTx(client, userId, tier);
      appliedSet.add(tier.level);
      nowApplied.push(tier);
    }

    // Persist the updated progress in the same transaction
    if (nowApplied.length > 0 || newLevel !== progress.current_level) {
      const newTitles = [
        ...((progress.earned_titles as string[]) ?? []),
        ...nowApplied.filter(t => t.rewardType === "title").map(t => t.rewardValue),
      ];
      await client.query(
        `UPDATE user_battle_pass_progress
         SET current_level   = $3,
             applied_rewards  = $4::jsonb,
             earned_titles    = $5::jsonb,
             updated_at       = NOW()
         WHERE user_id = $1 AND season_id = $2`,
        [userId, seasonId, newLevel, JSON.stringify([...appliedSet]), JSON.stringify(newTitles)],
      );
    }

    await client.query("COMMIT");
    return nowApplied;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Startup: create tables then prime the active season ───────────────────────
ensureTables()
  .then(() => ensureActiveSeason())
  .catch((err) => console.error("[battle-pass] Init failed:", err));

// ── GET /api/battle-pass/current ──────────────────────────────────────────────
router.get("/battle-pass/current", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  // Fetch season + user pro status in parallel (read-only, no transaction needed)
  const [season, [userRow]] = await Promise.all([
    ensureActiveSeason(),
    db.select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId)),
  ]);

  const now         = new Date();
  const isProActive = !!userRow?.isPro && (!userRow.proExpiresAt || userRow.proExpiresAt > now);
  const seasonXp    = await getSeasonXp(userId, season.start_date);

  // Derive current level (1-indexed, capped at MAX_LEVEL)
  const earnedLevel  = Math.min(Math.floor(seasonXp / XP_PER_LEVEL), MAX_LEVEL - 1);
  const currentLevel = earnedLevel + 1;
  const xpIntoLevel  = currentLevel < MAX_LEVEL ? seasonXp % XP_PER_LEVEL : XP_PER_LEVEL;

  // Determine which tiers the user has earned and is eligible for
  const tiersEarned = TIER_DEFS.filter(
    t => t.level <= currentLevel && (t.track === "free" || isProActive),
  );

  // Apply any new rewards atomically; get back what was newly granted this call
  const justUnlocked = await applyNewRewards(userId, season.id, tiersEarned, currentLevel);

  // Read the final committed progress to build the response
  const { rows: [progress] } = await pool.query<{
    applied_rewards: number[];
    earned_titles: string[];
  }>(
    `SELECT applied_rewards, earned_titles
     FROM user_battle_pass_progress
     WHERE user_id = $1 AND season_id = $2`,
    [userId, season.id],
  );

  const appliedSet  = new Set<number>((progress?.applied_rewards as number[]) ?? []);
  const endsInMs    = Math.max(0, new Date(season.end_date + "T23:59:59Z").getTime() - Date.now());
  const lang        = (req.headers["accept-language"] ?? "en").startsWith("ar") ? "ar" : "en";

  res.json({
    season: {
      id:        season.id,
      name:      season.name,
      startDate: season.start_date,
      endDate:   season.end_date,
      endsInMs,
    },
    currentLevel,
    seasonXp,
    xpIntoLevel,
    xpPerLevel:   XP_PER_LEVEL,
    xpToNext:     currentLevel < MAX_LEVEL ? XP_PER_LEVEL - xpIntoLevel : 0,
    maxLevel:     MAX_LEVEL,
    freeMaxLevel: FREE_MAX_LEVEL,
    isPro:        isProActive,
    earnedTitles: (progress?.earned_titles as string[]) ?? [],
    tiers: TIER_DEFS.map(tier => ({
      level:       tier.level,
      track:       tier.track,
      rewardType:  tier.rewardType,
      rewardValue: tier.rewardValue,
      rewardLabel: lang === "ar" ? tier.rewardLabel.ar : tier.rewardLabel.en,
      rewardIcon:  tier.rewardIcon,
      unlocked:    tier.level <= currentLevel,
      applied:     appliedSet.has(tier.level),
      accessible:  tier.track === "free" || isProActive,
    })),
    justUnlocked: justUnlocked.map(t => ({
      level:       t.level,
      rewardType:  t.rewardType,
      rewardValue: t.rewardValue,
      rewardLabel: lang === "ar" ? t.rewardLabel.ar : t.rewardLabel.en,
      rewardIcon:  t.rewardIcon,
    })),
  });
});

// ── GET /api/battle-pass/tiers — static tier list for previewing ──────────────
router.get("/battle-pass/tiers", requireAuth, async (req, res): Promise<void> => {
  const lang = (req.headers["accept-language"] ?? "en").startsWith("ar") ? "ar" : "en";
  res.json({
    tiers: TIER_DEFS.map(tier => ({
      level:       tier.level,
      track:       tier.track,
      rewardType:  tier.rewardType,
      rewardValue: tier.rewardValue,
      rewardLabel: lang === "ar" ? tier.rewardLabel.ar : tier.rewardLabel.en,
      rewardIcon:  tier.rewardIcon,
    })),
    xpPerLevel:   XP_PER_LEVEL,
    maxLevel:     MAX_LEVEL,
    freeMaxLevel: FREE_MAX_LEVEL,
  });
});

export default router;
