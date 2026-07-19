/**
 * Pro Hunt — monthly challenge gauntlet that awards 1 month of Pro on completion.
 * Also serves the VIP Lounge LiveKit participant count.
 *
 * Tables managed here (raw SQL — additive):
 *   pro_hunt_challenges   — static monthly challenge definitions (seeded on startup)
 *   user_pro_hunt_progress — per-user per-month progress rows
 *
 * Additionally, this module adds `boosted_until` to lfg_posts (LFG Priority Boost).
 */
import { Router, type IRouter } from "express";
import { pool, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── LiveKit for VIP Lounge participant count ───────────────────────────────────
const LIVEKIT_URL        = process.env.LIVEKIT_URL ?? "";
const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
export const VIP_LOUNGE_ROOM = "vip:lounge";

/** Fetch VIP Lounge participant count from LiveKit via REST (no SDK import needed). */
async function getVipParticipantCount(): Promise<number> {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return 0;
  try {
    // Import dynamically to avoid startup cost when env vars are missing
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const participants = await svc.listParticipants(VIP_LOUNGE_ROOM);
    return participants.length;
  } catch {
    return 0;
  }
}

// ── Monthly challenge definitions ──────────────────────────────────────────────
interface ChallengeDef {
  key: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  target: number;
}

const CHALLENGE_DEFS: ChallengeDef[] = [
  {
    key: "lfg_post_20",
    titleEn: "Signal Flood",
    titleAr: "فيضان الإشارات",
    descEn: "Post 20 LFG signals this month",
    descAr: "أطلق 20 إشارة LFG هذا الشهر",
    target: 20,
  },
  {
    key: "lfg_respond_30",
    titleEn: "First Responder",
    titleAr: "أول المستجيبين",
    descEn: "Respond to 30 LFG posts this month",
    descAr: "استجب لـ 30 منشور LFG هذا الشهر",
    target: 30,
  },
  {
    key: "msg_send_100",
    titleEn: "Voice of the Squad",
    titleAr: "صوت الفريق",
    descEn: "Send 100 chat messages this month",
    descAr: "أرسل 100 رسالة في الدردشة هذا الشهر",
    target: 100,
  },
  {
    key: "lfg_receive_20",
    titleEn: "Signal Magnet",
    titleAr: "مغناطيس الإشارات",
    descEn: "Receive 20 responses on your LFG posts this month",
    descAr: "احصل على 20 استجابة لمنشوراتك في LFG هذا الشهر",
    target: 20,
  },
  {
    key: "lfg_close_5",
    titleEn: "Squad Assembled",
    titleAr: "الفريق مكتمل",
    descEn: "Close 5 LFG signals after finding your squad",
    descAr: "أغلق 5 إشارات LFG بعد تأليف فريقك",
    target: 5,
  },
];

/** Returns current month string "YYYY-MM". */
function currentMonthYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Start-of-month UTC Date for a "YYYY-MM" string. */
function monthStart(monthYear: string): Date {
  const [y, m] = monthYear.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

// ── Startup: ensure tables + boost column ─────────────────────────────────────
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pro_hunt_challenges (
        id          SERIAL PRIMARY KEY,
        month_year  TEXT NOT NULL,
        key         TEXT NOT NULL,
        title_en    TEXT NOT NULL,
        title_ar    TEXT NOT NULL,
        desc_en     TEXT NOT NULL DEFAULT '',
        desc_ar     TEXT NOT NULL DEFAULT '',
        target      INTEGER NOT NULL,
        UNIQUE (month_year, key)
      );

      CREATE TABLE IF NOT EXISTS user_pro_hunt_progress (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month_year   TEXT NOT NULL,
        challenge_key TEXT NOT NULL,
        completed_at  TIMESTAMP WITH TIME ZONE,
        UNIQUE (user_id, month_year, challenge_key)
      );
    `);

    // Add boosted_until to lfg_posts for LFG Priority Boost feature
    await pool.query(`
      ALTER TABLE lfg_posts
        ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS last_boosted_at TIMESTAMP WITH TIME ZONE;
    `);

    // Seed this month's challenges
    const my = currentMonthYear();
    for (const c of CHALLENGE_DEFS) {
      await pool.query(
        `INSERT INTO pro_hunt_challenges (month_year, key, title_en, title_ar, desc_en, desc_ar, target)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (month_year, key) DO UPDATE SET
           title_en = EXCLUDED.title_en,
           title_ar = EXCLUDED.title_ar,
           desc_en  = EXCLUDED.desc_en,
           desc_ar  = EXCLUDED.desc_ar,
           target   = EXCLUDED.target`,
        [my, c.key, c.titleEn, c.titleAr, c.descEn, c.descAr, c.target],
      );
    }

    logger.info("pro-hunt: tables ensured");
  } catch (err) {
    logger.error({ err }, "pro-hunt: ensureTables failed");
  }
}

/** Compute live progress for a user for the given month — no stored counter needed. */
async function computeProgress(userId: number, monthYear: string): Promise<Record<string, number>> {
  const start = monthStart(monthYear);

  const [lfgPost, lfgRespond, msgSend, lfgReceive, lfgClose] = await Promise.all([
    // lfg_post_20: posts authored this month
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM lfg_posts WHERE author_id = $1 AND created_at >= $2`,
      [userId, start],
    ),
    // lfg_respond_30: responses made this month
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM lfg_responses WHERE user_id = $1 AND created_at >= $2`,
      [userId, start],
    ),
    // msg_send_100: chat messages sent this month
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM messages WHERE sender_id = $1 AND created_at >= $2`,
      [userId, start],
    ),
    // lfg_receive_20: responses received on my posts this month
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM lfg_responses r
       JOIN lfg_posts p ON r.post_id = p.id
       WHERE p.author_id = $1 AND r.created_at >= $2`,
      [userId, start],
    ),
    // lfg_close_5: closed signals authored this month
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM lfg_posts
       WHERE author_id = $1 AND status = 'closed' AND created_at >= $2`,
      [userId, start],
    ),
  ]);

  return {
    lfg_post_20:    Math.min(20,  parseInt(lfgPost.rows[0].count,    10) || 0),
    lfg_respond_30: Math.min(30,  parseInt(lfgRespond.rows[0].count, 10) || 0),
    msg_send_100:   Math.min(100, parseInt(msgSend.rows[0].count,    10) || 0),
    lfg_receive_20: Math.min(20,  parseInt(lfgReceive.rows[0].count, 10) || 0),
    lfg_close_5:    Math.min(5,   parseInt(lfgClose.rows[0].count,   10) || 0),
  };
}

/** Grant 1 month Pro if the user has completed all 5 challenges. */
async function maybeGrantPro(userId: number, monthYear: string): Promise<boolean> {
  const progress = await computeProgress(userId, monthYear);
  const allDone = CHALLENGE_DEFS.every((c) => (progress[c.key] ?? 0) >= c.target);
  if (!allDone) return false;

  // Check if this month's Pro Hunt grant was already applied
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_pro_hunt_progress
     WHERE user_id = $1 AND month_year = $2 AND challenge_key = '__pro_granted__'`,
    [userId, monthYear],
  );
  if (parseInt(rows[0].count, 10) > 0) return false; // already granted

  // Grant 1 month Pro
  const now = new Date();
  const [user] = await db.select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt })
    .from(usersTable).where(eq(usersTable.id, userId));

  const base = (user?.isPro && user.proExpiresAt && user.proExpiresAt > now)
    ? user.proExpiresAt
    : now;
  const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ isPro: true, proExpiresAt: newExpiry, proActivatedAt: now, proProvider: "pro_hunt" })
    .where(eq(usersTable.id, userId));

  // Mark grant so we don't double-apply
  await pool.query(
    `INSERT INTO user_pro_hunt_progress (user_id, month_year, challenge_key, completed_at)
     VALUES ($1, $2, '__pro_granted__', NOW())
     ON CONFLICT (user_id, month_year, challenge_key) DO NOTHING`,
    [userId, monthYear],
  );

  logger.info({ userId, monthYear }, "pro-hunt: Pro granted via Pro Hunt completion");
  return true;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /pro-hunt
 * Returns this month's 5 challenges with the viewer's live progress.
 */
router.get("/pro-hunt", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.auth!.userId;
  const monthYear = currentMonthYear();

  const progress = await computeProgress(userId, monthYear);

  // Check if Pro was already granted this month
  const { rows: grantRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_pro_hunt_progress
     WHERE user_id = $1 AND month_year = $2 AND challenge_key = '__pro_granted__'`,
    [userId, monthYear],
  );
  const proAlreadyGranted = parseInt(grantRows[0].count, 10) > 0;

  // Month-end countdown
  const d = new Date();
  const nextMonth = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1));

  const challenges = CHALLENGE_DEFS.map((c) => ({
    key:      c.key,
    titleEn:  c.titleEn,
    titleAr:  c.titleAr,
    descEn:   c.descEn,
    descAr:   c.descAr,
    target:   c.target,
    progress: progress[c.key] ?? 0,
    completed: (progress[c.key] ?? 0) >= c.target,
  }));

  const allCompleted = challenges.every((c) => c.completed);

  res.json({
    monthYear,
    endsAt:          nextMonth.toISOString(),
    challenges,
    allCompleted,
    proGranted:      proAlreadyGranted,
  });
});

/**
 * POST /pro-hunt/claim
 * Checks if all challenges are complete and grants Pro if so.
 * Idempotent — safe to call multiple times.
 */
router.post("/pro-hunt/claim", requireAuth, async (req, res): Promise<void> => {
  const userId    = req.auth!.userId;
  const monthYear = currentMonthYear();

  // Don't grant Pro to users who already have active Pro from a paid subscription
  const [user] = await db.select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt, proProvider: usersTable.proProvider })
    .from(usersTable).where(eq(usersTable.id, userId));
  const now = new Date();
  const hasActivePaidPro = user?.isPro && user.proExpiresAt && user.proExpiresAt > now && user.proProvider !== "pro_hunt";

  if (hasActivePaidPro) {
    res.status(400).json({ error: "You already have an active Pro subscription" });
    return;
  }

  const granted = await maybeGrantPro(userId, monthYear);
  if (!granted) {
    res.status(400).json({ error: "Not all challenges are completed yet" });
    return;
  }
  res.json({ granted: true });
});

/**
 * GET /pro-hunt/vip-lounge
 * Returns VIP Lounge room info: participant count, visible to all authenticated users.
 */
router.get("/pro-hunt/vip-lounge", requireAuth, async (req, res): Promise<void> => {
  const [viewer] = await db
    .select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.userId));

  const now = new Date();
  const viewerIsPro = viewer?.isPro && (!viewer.proExpiresAt || viewer.proExpiresAt > now);

  const participantCount = await getVipParticipantCount();

  res.json({
    room:             VIP_LOUNGE_ROOM,
    name:             "VIP Lounge",
    participantCount,
    canJoin:          viewerIsPro,
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
ensureTables().catch((err) => logger.error({ err }, "pro-hunt: startup error"));

export default router;
