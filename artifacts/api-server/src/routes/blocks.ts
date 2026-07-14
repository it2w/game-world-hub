import { Router, type IRouter } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, blocksTable, usersTable, friendshipsTable, friendRequestsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
    bio: u.bio ?? null,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** True if `blocker` has blocked `blocked`. */
export async function hasBlocked(blocker: number, blocked: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(and(eq(blocksTable.blockerId, blocker), eq(blocksTable.blockedId, blocked)));
  return rows.length > 0;
}

/** True if either user has blocked the other. */
export async function isBlockedBetween(a: number, b: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(
      or(
        and(eq(blocksTable.blockerId, a), eq(blocksTable.blockedId, b)),
        and(eq(blocksTable.blockerId, b), eq(blocksTable.blockedId, a)),
      ),
    );
  return rows.length > 0;
}

// GET /blocks — list users the current user has blocked
router.get("/blocks", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const rows = await db.select().from(blocksTable).where(eq(blocksTable.blockerId, myId));
  const blockedIds = rows.map((r) => r.blockedId);
  if (blockedIds.length === 0) {
    res.json([]);
    return;
  }
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, blockedIds));
  res.json(
    rows
      .map((r) => {
        const u = users.find((x) => x.id === r.blockedId);
        return u ? { id: r.id, user: safeUser(u), createdAt: r.createdAt.toISOString() } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );
});

// POST /users/:userId/block — block another user
router.post("/users/:userId/block", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  if (Number.isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (targetId === myId) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Record the block (idempotent).
  await db
    .insert(blocksTable)
    .values({ blockerId: myId, blockedId: targetId })
    .onConflictDoNothing();

  // Tear down any existing relationship in both directions.
  await db
    .delete(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.userId, myId), eq(friendshipsTable.friendId, targetId)),
        and(eq(friendshipsTable.userId, targetId), eq(friendshipsTable.friendId, myId)),
      ),
    );
  await db
    .delete(friendRequestsTable)
    .where(
      and(
        eq(friendRequestsTable.status, "pending"),
        or(
          and(eq(friendRequestsTable.fromUserId, myId), eq(friendRequestsTable.toUserId, targetId)),
          and(eq(friendRequestsTable.fromUserId, targetId), eq(friendRequestsTable.toUserId, myId)),
        ),
      ),
    );

  res.status(201).json({ success: true });
});

// DELETE /users/:userId/block — unblock
router.delete("/users/:userId/block", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  if (Number.isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  await db
    .delete(blocksTable)
    .where(and(eq(blocksTable.blockerId, myId), eq(blocksTable.blockedId, targetId)));

  res.json({ success: true });
});

export default router;
