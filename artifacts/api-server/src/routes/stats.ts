import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  lfgPostsTable,
  lfgResponsesTable,
  friendshipsTable,
  messagesTable,
  profilePhotosTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getUserProgress } from "../lib/xp";

const router: IRouter = Router();

// ── GET /stats/live — public; cached 30 s ─────────────────────────────────────
// Returns platform-wide live stats for the marketing landing page.
// Never throws; falls back to zeros so the page never breaks.
let _liveCache: { data: unknown; ts: number } | null = null;
const LIVE_TTL_MS = 30_000;

router.get("/stats/live", async (_req, res): Promise<void> => {
  const now = Date.now();
  if (_liveCache && now - _liveCache.ts < LIVE_TTL_MS) {
    res.json(_liveCache.data);
    return;
  }
  try {
    const [onlineRes, regRes, factionsRes] = await Promise.all([
      pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM users WHERE status != 'offline'`,
      ),
      pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM users WHERE created_at >= CURRENT_DATE`,
      ),
      pool.query<{
        id: number; name: string; slug: string; color: string;
        icon_emoji: string; weekly_points: number; member_count: number;
      }>(`
        WITH user_activity AS (
          SELECT uf.user_id, uf.faction_id,
            (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = uf.user_id AND created_at >= NOW() - INTERVAL '7 days') * 5 +
            (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = uf.user_id AND created_at >= NOW() - INTERVAL '7 days') * 3 +
            (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = uf.user_id AND created_at >= NOW() - INTERVAL '7 days') * 1
            AS weekly_pts
          FROM user_factions uf
        )
        SELECT f.id, f.name, f.slug, f.color, f.icon_emoji,
          COALESCE(SUM(ua.weekly_pts), 0)::INT AS weekly_points,
          COUNT(DISTINCT uf.user_id)::INT       AS member_count
        FROM factions f
        LEFT JOIN user_factions uf ON uf.faction_id = f.id
        LEFT JOIN user_activity  ua ON ua.faction_id = f.id AND ua.user_id = uf.user_id
        GROUP BY f.id, f.name, f.slug, f.color, f.icon_emoji
        ORDER BY weekly_points DESC
      `),
    ]);
    const data = {
      onlineCount: parseInt(onlineRes.rows[0]?.cnt ?? "0", 10),
      todayRegistrations: parseInt(regRes.rows[0]?.cnt ?? "0", 10),
      factionScores: factionsRes.rows.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        color: f.color,
        iconEmoji: f.icon_emoji,
        weeklyPoints: f.weekly_points,
        memberCount: f.member_count,
      })),
    };
    _liveCache = { data, ts: now };
    res.json(data);
  } catch {
    res.json({ onlineCount: 0, todayRegistrations: 0, factionScores: [] });
  }
});

// GET /stats/me
router.get("/stats/me", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const [
    [user],
    [{ totalLfgPosts }],
    [{ totalLfgResponses }],
    [{ totalFriends }],
    [{ totalMessages }],
    [{ totalPhotos }],
    xpProgress,
  ] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, myId)),
    db.select({ totalLfgPosts: count() }).from(lfgPostsTable).where(eq(lfgPostsTable.authorId, myId)),
    db.select({ totalLfgResponses: count() }).from(lfgResponsesTable).where(eq(lfgResponsesTable.userId, myId)),
    db.select({ totalFriends: count() }).from(friendshipsTable).where(eq(friendshipsTable.userId, myId)),
    db.select({ totalMessages: count() }).from(messagesTable).where(eq(messagesTable.senderId, myId)),
    db.select({ totalPhotos: count() }).from(profilePhotosTable).where(eq(profilePhotosTable.userId, myId)),
    getUserProgress(myId),
  ]);

  const now = new Date();
  const proActive = user.isPro && (!user.proExpiresAt || user.proExpiresAt > now);

  // Streak data
  let streakData = { currentStreak: 0, longestStreak: 0, shieldCount: 0, bonusXp: 0 };
  try {
    const { rows } = await pool.query<{
      current_streak: number;
      longest_streak: number;
      shield_count: number;
      bonus_xp: number;
    }>(`SELECT current_streak, longest_streak, shield_count, bonus_xp FROM user_streaks WHERE user_id = $1`, [myId]);
    if (rows[0]) {
      streakData = {
        currentStreak: rows[0].current_streak,
        longestStreak: rows[0].longest_streak,
        shieldCount: rows[0].shield_count,
        bonusXp: rows[0].bonus_xp,
      };
    }
  } catch { /* table may not exist yet */ }

  res.json({
    totalLfgPosts,
    totalLfgResponses,
    totalFriends,
    totalMessages,
    totalPhotos,
    memberSince: user.createdAt.toISOString(),
    isPro: proActive,
    xpProgress,
    streak: streakData.currentStreak,
    longestStreak: streakData.longestStreak,
    shieldCount: streakData.shieldCount,
    questBonusXp: streakData.bonusXp,
  });
});

export default router;
