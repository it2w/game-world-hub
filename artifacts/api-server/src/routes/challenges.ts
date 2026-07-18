import { Router, type IRouter } from "express";
import { eq, and, or, desc } from "drizzle-orm";
import {
  db,
  challengesTable,
  usersTable,
  friendshipsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
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

async function buildChallenge(c: typeof challengesTable.$inferSelect) {
  const [challenger] = await db.select().from(usersTable).where(eq(usersTable.id, c.challengerId));
  const [challenged] = await db.select().from(usersTable).where(eq(usersTable.id, c.challengedId));
  return {
    id: c.id,
    challenger: safeUser(challenger),
    challenged: safeUser(challenged),
    type: c.type,
    detail: c.detail ?? null,
    status: c.status,
    winnerId: c.winnerId ?? null,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
  };
}

// GET /challenges
router.get("/challenges", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const rows = await db
    .select()
    .from(challengesTable)
    .where(or(eq(challengesTable.challengerId, myId), eq(challengesTable.challengedId, myId)))
    .orderBy(desc(challengesTable.createdAt));
  res.json(await Promise.all(rows.map(buildChallenge)));
});

// POST /challenges
router.post("/challenges", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { friendId, type, detail, endsAt } = req.body as {
    friendId?: number;
    type?: string;
    detail?: string;
    endsAt?: string;
  };

  if (!friendId || !type || !endsAt) {
    res.status(400).json({ error: "friendId, type, and endsAt are required" });
    return;
  }
  if (!["most_hours", "first_rank"].includes(type)) {
    res.status(400).json({ error: "type must be most_hours or first_rank" });
    return;
  }

  // Verify friendship
  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(and(eq(friendshipsTable.userId, myId), eq(friendshipsTable.friendId, friendId)));
  if (!friendship) {
    res.status(400).json({ error: "You can only challenge friends" });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, myId));

  const [challenge] = await db
    .insert(challengesTable)
    .values({
      challengerId: myId,
      challengedId: friendId,
      type,
      detail: detail ?? null,
      status: "pending",
      endsAt: new Date(endsAt),
    })
    .returning();

  // Notify challenged user
  await db.insert(notificationsTable).values({
    userId: friendId,
    type: "challenge_invite",
    title: "تحدي جديد!",
    body: `${me.displayName} تحداك`,
    relatedId: challenge.id,
  });

  res.status(201).json(await buildChallenge(challenge));
});

// PATCH /challenges/:id/accept
router.patch("/challenges/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const myId = req.auth!.userId;
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge || challenge.challengedId !== myId || challenge.status !== "pending") {
    res.status(403).json({ error: "Cannot accept this challenge" });
    return;
  }
  const [updated] = await db
    .update(challengesTable)
    .set({ status: "active" })
    .where(eq(challengesTable.id, id))
    .returning();
  res.json(await buildChallenge(updated));
});

// PATCH /challenges/:id/decline
router.patch("/challenges/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const myId = req.auth!.userId;
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge || challenge.challengedId !== myId || challenge.status !== "pending") {
    res.status(403).json({ error: "Cannot decline this challenge" });
    return;
  }
  const [updated] = await db
    .update(challengesTable)
    .set({ status: "declined" })
    .where(eq(challengesTable.id, id))
    .returning();
  res.json(await buildChallenge(updated));
});

// PATCH /challenges/:id/complete
router.patch("/challenges/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const myId = req.auth!.userId;
  const { winnerId } = req.body as { winnerId?: number };
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge || challenge.status !== "active") {
    res.status(403).json({ error: "Challenge is not active" });
    return;
  }
  if (challenge.challengerId !== myId && challenge.challengedId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (winnerId && winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
    res.status(400).json({ error: "winnerId must be a participant" });
    return;
  }
  const [updated] = await db
    .update(challengesTable)
    .set({ status: "completed", winnerId: winnerId ?? null })
    .where(eq(challengesTable.id, id))
    .returning();
  res.json(await buildChallenge(updated));
});

// DELETE /challenges/:id
router.delete("/challenges/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const myId = req.auth!.userId;
  const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, id));
  if (!challenge || challenge.challengerId !== myId || challenge.status !== "pending") {
    res.status(403).json({ error: "Cannot cancel this challenge" });
    return;
  }
  await db.delete(challengesTable).where(eq(challengesTable.id, id));
  res.json({ success: true });
});

export default router;
