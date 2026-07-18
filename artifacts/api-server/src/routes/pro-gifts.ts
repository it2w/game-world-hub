import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, proGiftsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { activateProForUser } from "../lib/pro";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
  };
}

// GET /pro/gifts
router.get("/pro/gifts", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const allGifts = await db
    .select()
    .from(proGiftsTable)
    .where(eq(proGiftsTable.fromUserId, myId))
    .orderBy(desc(proGiftsTable.createdAt))
    .limit(20);

  const received = await db
    .select()
    .from(proGiftsTable)
    .where(eq(proGiftsTable.toUserId, myId))
    .orderBy(desc(proGiftsTable.createdAt))
    .limit(20);

  const userIds = new Set([
    ...allGifts.map((g) => g.toUserId),
    ...received.map((g) => g.fromUserId),
  ]);

  const users = userIds.size > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, Array.from(userIds)))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  res.json({
    sent: allGifts.map((g) => ({
      id: g.id,
      toUser: safeUser(userMap.get(g.toUserId)!),
      createdAt: g.createdAt.toISOString(),
    })),
    received: received.map((g) => ({
      id: g.id,
      fromUser: safeUser(userMap.get(g.fromUserId)!),
      createdAt: g.createdAt.toISOString(),
    })),
  });
});

// POST /pro/gift
router.post("/pro/gift", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { toUserId } = req.body as { toUserId?: number };

  if (!toUserId) {
    res.status(400).json({ error: "toUserId is required" });
    return;
  }
  if (toUserId === myId) {
    res.status(400).json({ error: "Cannot gift yourself" });
    return;
  }

  const now = new Date();

  // Check sender isPro
  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
  const isPro = sender.isPro && (!sender.proExpiresAt || sender.proExpiresAt > now);
  if (!isPro) {
    res.status(403).json({ error: "You need an active Pro subscription to gift" });
    return;
  }

  // Check 90-day cooldown
  const lastGifts = await db
    .select()
    .from(proGiftsTable)
    .where(eq(proGiftsTable.fromUserId, myId))
    .orderBy(desc(proGiftsTable.createdAt))
    .limit(1);

  if (lastGifts.length > 0) {
    const daysSince = (now.getTime() - lastGifts[0].createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 90) {
      const daysLeft = Math.ceil(90 - daysSince);
      res.status(400).json({ error: `You can gift once every 90 days. ${daysLeft} days remaining.` });
      return;
    }
  }

  // Check recipient exists
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId));
  if (!recipient) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await activateProForUser(toUserId, {
    orderId: `gift-${myId}-${now.getTime()}`,
    provider: "gift",
    durationDays: 30,
    metadata: { giftedBy: myId },
  });

  await db.insert(proGiftsTable).values({ fromUserId: myId, toUserId });

  res.json({ success: true, giftedTo: safeUser(recipient) });
});

export default router;
