import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import {
  db,
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

  res.json({
    totalLfgPosts,
    totalLfgResponses,
    totalFriends,
    totalMessages,
    totalPhotos,
    memberSince: user.createdAt.toISOString(),
    isPro: proActive,
    xpProgress,
  });
});

export default router;
