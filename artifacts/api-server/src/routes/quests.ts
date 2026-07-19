import { Router, type IRouter } from "express";
import { pool, db, lfgPostsTable, lfgResponsesTable, messagesTable, friendRequestsTable } from "@workspace/db";
import { count, eq, gte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ── Quest definitions (hardcoded — no DB seed needed) ──────────────────────────
const QUEST_DEFS = [
  {
    key: "post_lfg",
    xp: 80,
    targetCount: 1,
    titleEn: "Post an LFG",
    titleAr: "انشر طلب LFG",
    descriptionEn: "Post a Looking For Group request",
    descriptionAr: "انشر طلباً للعب مع الآخرين",
    icon: "📡",
  },
  {
    key: "send_messages",
    xp: 30,
    targetCount: 5,
    titleEn: "Send 5 Messages",
    titleAr: "أرسل 5 رسائل",
    descriptionEn: "Chat with your friends",
    descriptionAr: "تحدث مع أصدقائك",
    icon: "💬",
  },
  {
    key: "respond_lfg",
    xp: 50,
    targetCount: 1,
    titleEn: "Respond to an LFG",
    titleAr: "استجب لطلب LFG",
    descriptionEn: "Help someone find their squad",
    descriptionAr: "ساعد شخصاً في إيجاد فريقه",
    icon: "⚡",
  },
  {
    key: "join_room",
    xp: 60,
    targetCount: 1,
    titleEn: "Join a Voice Room",
    titleAr: "انضم لروم صوتي",
    descriptionEn: "Hang out in a voice room",
    descriptionAr: "تجمع مع الآخرين في روم صوتي",
    icon: "🎙️",
  },
  {
    key: "view_profiles",
    xp: 20,
    targetCount: 3,
    titleEn: "Visit 3 Profiles",
    titleAr: "زُر 3 بروفايلات",
    descriptionEn: "Check out other players",
    descriptionAr: "اطّلع على بروفايلات اللاعبين",
    icon: "👤",
  },
  {
    key: "add_friend",
    xp: 70,
    targetCount: 1,
    titleEn: "Add a Friend",
    titleAr: "أضف صديقاً جديداً",
    descriptionEn: "Grow your squad",
    descriptionAr: "وسّع دائرة أصدقائك",
    icon: "🤝",
  },
] as const;

type QuestKey = (typeof QUEST_DEFS)[number]["key"];

/** Today's 3 quests, rotated by day-of-year. */
function getTodayQuests(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - startOfYear) / 86_400_000);
  const n = QUEST_DEFS.length;
  return [
    QUEST_DEFS[dayOfYear % n],
    QUEST_DEFS[(dayOfYear + 2) % n],
    QUEST_DEFS[(dayOfYear + 4) % n],
  ];
}

/** UTC date string "YYYY-MM-DD". */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Ensure tables exist (idempotent, runs at module load) ─────────────────────
async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_daily_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      quest_key TEXT NOT NULL,
      date DATE NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ,
      UNIQUE (user_id, quest_key, date)
    );
    CREATE TABLE IF NOT EXISTS user_streaks (
      user_id INTEGER PRIMARY KEY,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date DATE,
      shield_count INTEGER NOT NULL DEFAULT 0,
      bonus_xp INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

ensureTables().catch((err) => console.error("[quests] Failed to create tables:", err));

// ── Streak helpers ─────────────────────────────────────────────────────────────
interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  shield_count: number;
  bonus_xp: number;
}

async function getOrInitStreak(userId: number): Promise<StreakRow> {
  const { rows } = await pool.query<StreakRow>(
    `SELECT current_streak, longest_streak, last_active_date, shield_count, bonus_xp
     FROM user_streaks WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? {
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    shield_count: 0,
    bonus_xp: 0,
  };
}

async function touchStreak(userId: number): Promise<void> {
  const today = todayUtc();
  const streak = await getOrInitStreak(userId);
  if (streak.last_active_date === today) return; // already recorded for today

  const yesterday = new Date(today + "T00:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let newStreak: number;
  let newShields = streak.shield_count;

  // Compute one-day-before-yesterday for shield protection
  const twoDaysAgo = new Date(today + "T00:00:00Z");
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

  if (!streak.last_active_date) {
    newStreak = 1; // first ever day
  } else if (streak.last_active_date === yesterdayStr) {
    newStreak = streak.current_streak + 1; // consecutive day
  } else if (streak.last_active_date === twoDaysAgoStr && streak.shield_count > 0) {
    // Exactly one missed day and a shield is available — protect the streak
    newStreak = streak.current_streak;
    newShields = streak.shield_count - 1;
  } else {
    // Gap is too large (> 1 day), or no shield available — reset streak
    newStreak = 1;
  }

  const newLongest = Math.max(newStreak, streak.longest_streak);

  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = $2,
           longest_streak = $3,
           last_active_date = $4,
           shield_count = $5,
           updated_at = NOW()`,
    [userId, newStreak, newLongest, today, newShields, streak.bonus_xp],
  );
}

async function addBonusXp(userId: number, xp: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, 0, 0, NULL, 0, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET bonus_xp = user_streaks.bonus_xp + $2, updated_at = NOW()`,
    [userId, xp],
  );
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /quests/daily — today's quests + completion status
router.get("/quests/daily", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const today = todayUtc();
  const todayQuests = getTodayQuests(today);

  const { rows } = await pool.query<{
    quest_key: string;
    progress: number;
    completed_at: string | null;
  }>(
    `SELECT quest_key, progress, completed_at
     FROM user_daily_progress
     WHERE user_id = $1 AND date = $2`,
    [userId, today],
  );

  const progressMap = new Map(rows.map((r) => [r.quest_key, r]));
  const streak = await getOrInitStreak(userId);

  res.json({
    date: today,
    quests: todayQuests.map((q) => {
      const p = progressMap.get(q.key);
      return {
        key: q.key,
        titleEn: q.titleEn,
        titleAr: q.titleAr,
        icon: q.icon,
        xpReward: q.xp,
        targetCount: q.targetCount,
        progress: p?.progress ?? 0,
        completed: !!p?.completed_at,
        completedAt: p?.completed_at ?? null,
      };
    }),
    streak: {
      current: streak.current_streak,
      longest: streak.longest_streak,
      shieldCount: streak.shield_count,
      bonusXp: streak.bonus_xp,
    },
  });
});

// POST /quests/daily/:key/complete
router.post("/quests/daily/:key/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const key = req.params.key as QuestKey;
  const today = todayUtc();
  const todayStart = today + "T00:00:00.000Z";

  const todayQuests = getTodayQuests(today);
  const quest = todayQuests.find((q) => q.key === key);
  if (!quest) {
    res.status(400).json({ error: "Quest not available today" });
    return;
  }

  // Fast-path check (non-locking) — avoids verification queries if already done
  const { rows: fastCheck } = await pool.query<{ completed_at: string | null }>(
    `SELECT completed_at FROM user_daily_progress WHERE user_id = $1 AND quest_key = $2 AND date = $3`,
    [userId, key, today],
  );
  if (fastCheck[0]?.completed_at) {
    res.status(400).json({ error: "Quest already completed today" });
    return;
  }

  // ── Verify real activity ──────────────────────────────────────────────────
  // Verifiable quests: start at 0; only trust the DB query result.
  // Honor-based quests (join_room, view_profiles): explicitly set to targetCount.
  // Never fall back to targetCount on error for verifiable quests.
  let realProgress = 0;
  const VERIFIABLE_QUESTS = new Set(["post_lfg", "send_messages", "respond_lfg", "add_friend"]);
  const HONOR_QUESTS = new Set(["join_room", "view_profiles"]);

  if (HONOR_QUESTS.has(key)) {
    realProgress = quest.targetCount;
  } else if (VERIFIABLE_QUESTS.has(key)) {
    // Verification throws → realProgress stays 0 (safe: no free credit)
    if (key === "post_lfg") {
      const [r] = await db.select({ c: count() }).from(lfgPostsTable).where(
        and(eq(lfgPostsTable.authorId, userId), gte(lfgPostsTable.createdAt, new Date(todayStart))),
      );
      realProgress = Math.min(Number(r?.c ?? 0), quest.targetCount);
    } else if (key === "send_messages") {
      const [r] = await db.select({ c: count() }).from(messagesTable).where(
        and(eq(messagesTable.senderId, userId), gte(messagesTable.createdAt, new Date(todayStart))),
      );
      realProgress = Math.min(Number(r?.c ?? 0), quest.targetCount);
    } else if (key === "respond_lfg") {
      const [r] = await db.select({ c: count() }).from(lfgResponsesTable).where(
        and(eq(lfgResponsesTable.userId, userId), gte(lfgResponsesTable.createdAt, new Date(todayStart))),
      );
      realProgress = Math.min(Number(r?.c ?? 0), quest.targetCount);
    } else if (key === "add_friend") {
      // Check friend requests SENT today (user controls sending, not acceptance)
      const [r] = await db.select({ c: count() }).from(friendRequestsTable).where(
        and(
          eq(friendRequestsTable.fromUserId, userId),
          gte(friendRequestsTable.createdAt, new Date(todayStart)),
        ),
      );
      realProgress = Math.min(Number(r?.c ?? 0), quest.targetCount);
    }
  }

  // ── Atomic completion: lock row, award only if not already complete ────────
  const client = await pool.connect();
  let newlyCompleted = false;
  let finalProgress = realProgress;
  let finalCompletedAt: string | null = null;

  try {
    await client.query("BEGIN");

    // Ensure row exists before locking
    await client.query(
      `INSERT INTO user_daily_progress (user_id, quest_key, date, progress, completed_at)
       VALUES ($1, $2, $3, 0, NULL)
       ON CONFLICT (user_id, quest_key, date) DO NOTHING`,
      [userId, key, today],
    );

    // Lock the row for this update — prevents concurrent completions
    const { rows: [locked] } = await client.query<{ completed_at: string | null; progress: number }>(
      `SELECT completed_at, progress FROM user_daily_progress
       WHERE user_id = $1 AND quest_key = $2 AND date = $3
       FOR UPDATE`,
      [userId, key, today],
    );

    if (locked.completed_at) {
      // Raced and lost — another request already completed it
      await client.query("COMMIT");
      res.status(400).json({ error: "Quest already completed today" });
      return;
    }

    const completed = realProgress >= quest.targetCount;
    finalCompletedAt = completed ? new Date().toISOString() : null;
    newlyCompleted = completed;
    finalProgress = Math.max(locked.progress, realProgress);

    await client.query(
      `UPDATE user_daily_progress
       SET progress = $4, completed_at = $5
       WHERE user_id = $1 AND quest_key = $2 AND date = $3`,
      [userId, key, today, finalProgress, finalCompletedAt],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Award XP + update streak only for a confirmed new completion
  if (newlyCompleted) {
    await touchStreak(userId);
    await addBonusXp(userId, quest.xp);
  }

  const streak = await getOrInitStreak(userId);

  res.json({
    key,
    progress: finalProgress,
    completed: newlyCompleted,
    completedAt: finalCompletedAt,
    xpEarned: newlyCompleted ? quest.xp : 0,
    streak: {
      current: streak.current_streak,
      longest: streak.longest_streak,
      shieldCount: streak.shield_count,
      bonusXp: streak.bonus_xp,
    },
  });
});

// POST /auth/me/streak-shield/buy  (costs 50 bonusXp)
// Atomic: single UPDATE with WHERE guard prevents overdraft and race conditions.
router.post("/auth/me/streak-shield/buy", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const SHIELD_COST = 50;

  // Ensure the user has a streak row before attempting the guarded update
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, 0, 0, NULL, 0, 0, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  // Atomic guarded update: only succeeds if the user has enough bonus_xp right now.
  // Concurrent duplicate requests will each race on this single statement; at most
  // floor(bonus_xp / SHIELD_COST) succeed — no overdraft is possible.
  const { rows } = await pool.query<{ shield_count: number; bonus_xp: number }>(
    `UPDATE user_streaks
     SET shield_count = shield_count + 1,
         bonus_xp     = bonus_xp - $2,
         updated_at   = NOW()
     WHERE user_id = $1 AND bonus_xp >= $2
     RETURNING shield_count, bonus_xp`,
    [userId, SHIELD_COST],
  );

  if (rows.length === 0) {
    res.status(400).json({ error: "Not enough XP — shields cost 50 quest XP" });
    return;
  }

  res.json({ shieldCount: rows[0].shield_count, bonusXp: rows[0].bonus_xp });
});

// GET /users/:userId/streak — public streak data
router.get("/users/:userId/streak", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetUserId = parseInt(raw, 10);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const streak = await getOrInitStreak(targetUserId);
  res.json({
    currentStreak: streak.current_streak,
    longestStreak: streak.longest_streak,
    ...(req.auth!.userId === targetUserId ? { shieldCount: streak.shield_count, bonusXp: streak.bonus_xp } : {}),
  });
});

export default router;
