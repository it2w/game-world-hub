import { Router, type IRouter } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, usersTable, friendRequestsTable, friendshipsTable, notificationsTable } from "@workspace/db";
import { SendFriendRequestBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? null,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

// GET /friends/online-summary — must come before /friends/:id
router.get("/friends/online-summary", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const myFriendships = await db.select().from(friendshipsTable).where(eq(friendshipsTable.userId, myId));
  const friendIds = myFriendships.map(f => f.friendId);

  if (friendIds.length === 0) {
    res.json({ onlineCount: 0, friends: [] });
    return;
  }

  const friends = await db.select().from(usersTable).where(inArray(usersTable.id, friendIds));
  const onlineFriends = friends.filter(f => f.status === "online" || f.status === "away" || f.status === "busy");

  res.json({
    onlineCount: onlineFriends.length,
    friends: myFriendships.map(fs => {
      const friend = friends.find(f => f.id === fs.friendId)!;
      return {
        id: fs.id,
        friend: safeUser(friend),
        since: fs.since.toISOString(),
      };
    }).filter(f => f.friend),
  });
});

// GET /friends/:friendId/status — relationship between me and another user
router.get("/friends/:friendId/status", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.friendId) ? req.params.friendId[0] : req.params.friendId;
  const friendId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  if (Number.isNaN(friendId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (friendId === myId) {
    res.json({ state: "self", requestId: null });
    return;
  }

  const [friendship] = await db.select().from(friendshipsTable)
    .where(and(eq(friendshipsTable.userId, myId), eq(friendshipsTable.friendId, friendId)));
  if (friendship) {
    res.json({ state: "friends", requestId: null });
    return;
  }

  const [sent] = await db.select().from(friendRequestsTable)
    .where(and(eq(friendRequestsTable.fromUserId, myId), eq(friendRequestsTable.toUserId, friendId), eq(friendRequestsTable.status, "pending")));
  if (sent) {
    res.json({ state: "request_sent", requestId: sent.id });
    return;
  }

  const [received] = await db.select().from(friendRequestsTable)
    .where(and(eq(friendRequestsTable.fromUserId, friendId), eq(friendRequestsTable.toUserId, myId), eq(friendRequestsTable.status, "pending")));
  if (received) {
    res.json({ state: "request_received", requestId: received.id });
    return;
  }

  res.json({ state: "none", requestId: null });
});

// GET /friends/requests
router.get("/friends/requests", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const requests = await db.select().from(friendRequestsTable)
    .where(and(eq(friendRequestsTable.toUserId, myId), eq(friendRequestsTable.status, "pending")));

  const userIds = requests.map(r => r.fromUserId);
  if (userIds.length === 0) {
    res.json([]);
    return;
  }

  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, myId));

  res.json(requests.map(r => ({
    id: r.id,
    from: safeUser(users.find(u => u.id === r.fromUserId)!),
    to: safeUser(me),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  })));
});

// POST /friends/request
router.post("/friends/request", requireAuth, async (req, res): Promise<void> => {
  const parsed = SendFriendRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const myId = req.auth!.userId;
  const { toUserId } = parsed.data;

  if (toUserId === myId) {
    res.status(400).json({ error: "Cannot send friend request to yourself" });
    return;
  }

  // Check already friends
  const alreadyFriends = await db.select().from(friendshipsTable)
    .where(and(eq(friendshipsTable.userId, myId), eq(friendshipsTable.friendId, toUserId)));
  if (alreadyFriends.length > 0) {
    res.status(400).json({ error: "Already friends" });
    return;
  }

  // Check existing pending request
  const existing = await db.select().from(friendRequestsTable).where(
    and(eq(friendRequestsTable.fromUserId, myId), eq(friendRequestsTable.toUserId, toUserId), eq(friendRequestsTable.status, "pending"))
  );
  if (existing.length > 0) {
    res.status(400).json({ error: "Friend request already sent" });
    return;
  }

  const [request] = await db.insert(friendRequestsTable).values({ fromUserId: myId, toUserId }).returning();

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
  const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId));

  // Create notification
  await db.insert(notificationsTable).values({
    userId: toUserId,
    type: "friend_request",
    title: `${fromUser.displayName} sent you a friend request`,
    relatedId: request.id,
  });

  res.status(201).json({
    id: request.id,
    from: safeUser(fromUser),
    to: safeUser(toUser),
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  });
});

// POST /friends/request/:requestId/accept
router.post("/friends/request/:requestId/accept", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId;
  const requestId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [request] = await db.select().from(friendRequestsTable).where(eq(friendRequestsTable.id, requestId));
  if (!request || request.toUserId !== myId) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  await db.update(friendRequestsTable).set({ status: "accepted" }).where(eq(friendRequestsTable.id, requestId));

  // Create bidirectional friendship
  await db.insert(friendshipsTable).values([
    { userId: myId, friendId: request.fromUserId },
    { userId: request.fromUserId, friendId: myId },
  ]);

  res.json({ success: true });
});

// POST /friends/request/:requestId/reject
router.post("/friends/request/:requestId/reject", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId;
  const requestId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [request] = await db.select().from(friendRequestsTable).where(eq(friendRequestsTable.id, requestId));
  if (!request || request.toUserId !== myId) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  await db.update(friendRequestsTable).set({ status: "rejected" }).where(eq(friendRequestsTable.id, requestId));
  res.json({ success: true });
});

// GET /friends
router.get("/friends", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const myFriendships = await db.select().from(friendshipsTable).where(eq(friendshipsTable.userId, myId));
  const friendIds = myFriendships.map(f => f.friendId);

  if (friendIds.length === 0) {
    res.json([]);
    return;
  }

  const friends = await db.select().from(usersTable).where(inArray(usersTable.id, friendIds));

  res.json(myFriendships.map(fs => ({
    id: fs.id,
    friend: safeUser(friends.find(f => f.id === fs.friendId)!),
    since: fs.since.toISOString(),
  })).filter(f => f.friend));
});

// DELETE /friends/:friendId
router.delete("/friends/:friendId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.friendId) ? req.params.friendId[0] : req.params.friendId;
  const friendId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  await db.delete(friendshipsTable).where(
    or(
      and(eq(friendshipsTable.userId, myId), eq(friendshipsTable.friendId, friendId)),
      and(eq(friendshipsTable.userId, friendId), eq(friendshipsTable.friendId, myId))
    )
  );
  res.json({ success: true });
});

// GET /friends/:friendId/common-games
router.get("/friends/:friendId/common-games", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.friendId) ? req.params.friendId[0] : req.params.friendId;
  const friendId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const { db: dbInstance, userGamesTable: ugt, gamesTable: gt } = await import("@workspace/db");

  const myGames = await dbInstance.select({ gameId: ugt.gameId }).from(ugt).where(eq(ugt.userId, myId));
  const friendGames = await dbInstance.select({ gameId: ugt.gameId }).from(ugt).where(eq(ugt.userId, friendId));

  const myGameIds = new Set(myGames.map(g => g.gameId));
  const commonIds = friendGames.map(g => g.gameId).filter(id => myGameIds.has(id));

  if (commonIds.length === 0) {
    res.json([]);
    return;
  }

  const games = await dbInstance.select().from(gt).where(inArray(gt.id, commonIds));
  res.json(games.map(g => ({
    id: g.id,
    name: g.name,
    coverUrl: g.coverUrl ?? null,
    genre: g.genre ?? null,
    platforms: g.platforms ?? [],
    createdAt: g.createdAt.toISOString(),
  })));
});

export default router;
