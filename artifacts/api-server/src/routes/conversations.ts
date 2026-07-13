import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  messageReadsTable,
  notificationsTable,
} from "@workspace/db";
import { SendMessageBody } from "@workspace/api-zod";
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

async function buildConversation(conv: typeof conversationsTable.$inferSelect, myId: number) {
  const participants = await db
    .select({ user: usersTable })
    .from(conversationParticipantsTable)
    .innerJoin(usersTable, eq(conversationParticipantsTable.userId, usersTable.id))
    .where(eq(conversationParticipantsTable.conversationId, conv.id));

  const lastMessages = await db
    .select({ msg: messagesTable, sender: usersTable })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  const [readRow] = await db
    .select()
    .from(messageReadsTable)
    .where(and(eq(messageReadsTable.conversationId, conv.id), eq(messageReadsTable.userId, myId)));

  const lastReadAt = readRow?.lastReadAt ?? new Date(0);

  const unreadMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id));

  const unreadCount = unreadMessages.filter(
    (m) => m.createdAt > lastReadAt && m.senderId !== myId
  ).length;

  const lastMsg = lastMessages[0];

  return {
    id: conv.id,
    type: conv.type,
    name: conv.name ?? null,
    participants: participants.map((p) => safeUser(p.user)),
    lastMessage: lastMsg
      ? {
          id: lastMsg.msg.id,
          conversationId: lastMsg.msg.conversationId,
          sender: safeUser(lastMsg.sender),
          content: lastMsg.msg.content,
          createdAt: lastMsg.msg.createdAt.toISOString(),
        }
      : undefined,
    unreadCount,
    createdAt: conv.createdAt.toISOString(),
  };
}

// GET /conversations
router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const myConvRows = await db
    .select()
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, myId));

  const convIds = myConvRows.map((r) => r.conversationId);
  if (convIds.length === 0) {
    res.json([]);
    return;
  }

  const convs = await db
    .select()
    .from(conversationsTable)
    .where(inArray(conversationsTable.id, convIds));

  const result = await Promise.all(convs.map((c) => buildConversation(c, myId)));
  res.json(result);
});

// GET /conversations/direct/:userId — must be before /:conversationId
router.get("/conversations/direct/:userId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);

  // Find existing direct conversation
  const myConvs = await db
    .select()
    .from(conversationParticipantsTable)
    .where(eq(conversationParticipantsTable.userId, myId));

  const myConvIds = myConvs.map((r) => r.conversationId);

  if (myConvIds.length > 0) {
    const targetConvs = await db
      .select()
      .from(conversationParticipantsTable)
      .where(and(eq(conversationParticipantsTable.userId, targetId), inArray(conversationParticipantsTable.conversationId, myConvIds)));

    for (const tc of targetConvs) {
      const [conv] = await db
        .select()
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, tc.conversationId), eq(conversationsTable.type, "direct")));
      if (conv) {
        res.json(await buildConversation(conv, myId));
        return;
      }
    }
  }

  // Create new direct conversation
  const [conv] = await db.insert(conversationsTable).values({ type: "direct" }).returning();
  await db.insert(conversationParticipantsTable).values([
    { conversationId: conv.id, userId: myId },
    { conversationId: conv.id, userId: targetId },
  ]);

  res.json(await buildConversation(conv, myId));
});

// GET /conversations/:conversationId/messages
router.get("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  // Verify user is a participant
  const membership = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (membership.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Mark as read
  const [existing] = await db
    .select()
    .from(messageReadsTable)
    .where(and(eq(messageReadsTable.conversationId, conversationId), eq(messageReadsTable.userId, myId)));

  if (existing) {
    await db
      .update(messageReadsTable)
      .set({ lastReadAt: new Date() })
      .where(and(eq(messageReadsTable.conversationId, conversationId), eq(messageReadsTable.userId, myId)));
  } else {
    await db.insert(messageReadsTable).values({ conversationId, userId: myId });
  }

  const messages = await db
    .select({ msg: messagesTable, sender: usersTable })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      id: m.msg.id,
      conversationId: m.msg.conversationId,
      sender: safeUser(m.sender),
      content: m.msg.content,
      createdAt: m.msg.createdAt.toISOString(),
    }))
  );
});

// POST /conversations/:conversationId/messages
router.post("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  // Verify user is a participant before allowing write
  const membership = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (membership.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId, senderId: myId, content: parsed.data.content })
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, myId));

  // Notify other participants
  const participants = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId)));

  await Promise.all(
    participants
      .filter((p) => p.userId !== myId)
      .map((p) =>
        db.insert(notificationsTable).values({
          userId: p.userId,
          type: "message",
          title: `New message from ${sender.displayName}`,
          relatedId: conversationId,
        })
      )
  );

  res.status(201).json({
    id: msg.id,
    conversationId: msg.conversationId,
    sender: safeUser(sender),
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
  });
});

export default router;
