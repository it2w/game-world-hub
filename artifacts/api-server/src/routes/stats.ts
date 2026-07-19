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
