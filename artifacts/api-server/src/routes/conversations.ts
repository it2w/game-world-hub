import { Router, type IRouter } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  messageReadsTable,
  messageReactionsTable,
  notificationsTable,
} from "@workspace/db";
import { SendMessageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { isBlockedBetween } from "./blocks";
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

/** Aggregate reactions for a list of messageIds, returning {emoji, count, mine} per message */
async function getReactionsForMessages(
  messageIds: number[],
  myId: number,
): Promise<Map<number, { emoji: string; count: number; mine: boolean }[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(messageReactionsTable)
    .where(inArray(messageReactionsTable.messageId, messageIds));

  const map = new Map<number, Map<string, { count: number; mine: boolean }>>();
  for (const r of rows) {
    if (!map.has(r.messageId)) map.set(r.messageId, new Map());
    const emojiMap = map.get(r.messageId)!;
    const existing = emojiMap.get(r.emoji) ?? { count: 0, mine: false };
    emojiMap.set(r.emoji, {
      count: existing.count + 1,
      mine: existing.mine || r.userId === myId,
    });
  }

  const result = new Map<number, { emoji: string; count: number; mine: boolean }[]>();
  for (const [msgId, emojiMap] of map) {
    result.set(msgId, Array.from(emojiMap.entries()).map(([emoji, v]) => ({ emoji, ...v })));
  }
  return result;
}

async function serializeMessage(
  msg: typeof messagesTable.$inferSelect,
  sender: typeof usersTable.$inferSelect,
  myId: number,
  replyToMsg?: { msg: typeof messagesTable.$inferSelect; sender: typeof usersTable.$inferSelect } | null,
) {
  const reactionsMap = await getReactionsForMessages([msg.id], myId);
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    sender: safeUser(sender),
    content: msg.content,
    isPinned: msg.isPinned,
    editedAt: msg.editedAt?.toISOString() ?? null,
    replyTo: replyToMsg
      ? {
          id: replyToMsg.msg.id,
          sender: safeUser(replyToMsg.sender),
          content: replyToMsg.msg.content,
          createdAt: replyToMsg.msg.createdAt.toISOString(),
        }
      : null,
    reactions: reactionsMap.get(msg.id) ?? [],
    createdAt: msg.createdAt.toISOString(),
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
          isPinned: lastMsg.msg.isPinned,
          editedAt: lastMsg.msg.editedAt?.toISOString() ?? null,
          replyTo: null,
          reactions: [],
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

  if (messages.length === 0) {
    res.json([]);
    return;
  }

  // Batch-load reactions and replyTo messages
  const messageIds = messages.map((m) => m.msg.id);
  const reactionsMap = await getReactionsForMessages(messageIds, myId);

  const replyToIds = messages.map((m) => m.msg.replyToId).filter(Boolean) as number[];
  const replyMessages = replyToIds.length > 0
    ? await db
        .select({ msg: messagesTable, sender: usersTable })
        .from(messagesTable)
        .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
        .where(inArray(messagesTable.id, replyToIds))
    : [];
  const replyMap = new Map(replyMessages.map((r) => [r.msg.id, r]));

  res.json(
    messages.map((m) => {
      const reply = m.msg.replyToId ? replyMap.get(m.msg.replyToId) : null;
      return {
        id: m.msg.id,
        conversationId: m.msg.conversationId,
        sender: safeUser(m.sender),
        content: m.msg.content,
        isPinned: m.msg.isPinned,
        editedAt: m.msg.editedAt?.toISOString() ?? null,
        replyTo: reply
          ? { id: reply.msg.id, sender: safeUser(reply.sender), content: reply.msg.content, createdAt: reply.msg.createdAt.toISOString() }
          : null,
        reactions: reactionsMap.get(m.msg.id) ?? [],
        createdAt: m.msg.createdAt.toISOString(),
      };
    })
  );
});

// PATCH /conversations/:conversationId/messages/:messageId — edit message
router.patch("/conversations/:conversationId/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const messageId = parseInt(req.params.messageId as string, 10);

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.senderId !== myId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { content } = req.body as { content: string };
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content required" });
    return;
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ content: content.trim(), editedAt: new Date() })
    .where(eq(messagesTable.id, messageId))
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
  res.json(await serializeMessage(updated, sender, myId));
});

// PATCH /conversations/:conversationId/messages/:messageId/pin
router.patch("/conversations/:conversationId/messages/:messageId/pin", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const messageId = parseInt(req.params.messageId as string, 10);

  // Must be a participant
  const [membership] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const { isPinned } = req.body as { isPinned: boolean };
  const [updated] = await db
    .update(messagesTable)
    .set({ isPinned: Boolean(isPinned) })
    .where(eq(messagesTable.id, messageId))
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, updated.senderId));
  res.json(await serializeMessage(updated, sender, myId));
});

// POST /conversations/:conversationId/messages/:messageId/reactions
router.post("/conversations/:conversationId/messages/:messageId/reactions", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const messageId = parseInt(req.params.messageId as string, 10);

  const [membership] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const { emoji } = req.body as { emoji: string };
  if (!emoji || typeof emoji !== "string" || emoji.trim().length === 0) {
    res.status(400).json({ error: "Emoji required" });
    return;
  }

  // Upsert (ignore if already exists)
  await db
    .insert(messageReactionsTable)
    .values({ messageId, userId: myId, emoji: emoji.trim() })
    .onConflictDoNothing();

  const reactionsMap = await getReactionsForMessages([messageId], myId);
  res.json(reactionsMap.get(messageId) ?? []);
});

// DELETE /conversations/:conversationId/messages/:messageId/reactions/:emoji
router.delete("/conversations/:conversationId/messages/:messageId/reactions/:emoji", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const messageId = parseInt(req.params.messageId as string, 10);
  const emoji = decodeURIComponent(req.params.emoji as string);

  const [membership] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  await db
    .delete(messageReactionsTable)
    .where(
      and(
        eq(messageReactionsTable.messageId, messageId),
        eq(messageReactionsTable.userId, myId),
        eq(messageReactionsTable.emoji, emoji),
      )
    );

  const reactionsMap = await getReactionsForMessages([messageId], myId);
  res.json(reactionsMap.get(messageId) ?? []);
});

// DELETE /conversations/:conversationId/full
router.delete("/conversations/:conversationId/full", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const [membership] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
  if (!conv || conv.type !== "direct") {
    res.status(400).json({ error: "Only direct conversations can be fully deleted" });
    return;
  }

  await db.delete(notificationsTable).where(and(eq(notificationsTable.type, "message"), eq(notificationsTable.relatedId, conversationId)));
  await db.delete(messagesTable).where(eq(messagesTable.conversationId, conversationId));
  await db.delete(messageReadsTable).where(eq(messageReadsTable.conversationId, conversationId));
  await db.delete(conversationParticipantsTable).where(eq(conversationParticipantsTable.conversationId, conversationId));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conversationId));

  res.json({ success: true });
});

// DELETE /conversations/:conversationId — hide
router.delete("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const [membership] = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

  await db
    .delete(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));

  res.json({ success: true });
});

// DELETE /conversations/:conversationId/messages/:messageId
router.delete("/conversations/:conversationId/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const rawConv = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const rawMsg = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const conversationId = parseInt(rawConv, 10);
  const messageId = parseInt(rawMsg, 10);

  const [msg] = await db.select().from(messagesTable).where(and(eq(messagesTable.id, messageId), eq(messagesTable.conversationId, conversationId)));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId !== myId) { res.status(403).json({ error: "Cannot delete another user's message" }); return; }

  await db.delete(messagesTable).where(eq(messagesTable.id, messageId));
  res.status(204).end();
});

// POST /conversations/:conversationId/messages
router.post("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const membership = await db
    .select()
    .from(conversationParticipantsTable)
    .where(and(eq(conversationParticipantsTable.conversationId, conversationId), eq(conversationParticipantsTable.userId, myId)));
  if (membership.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Block check
  const others = await db.select().from(conversationParticipantsTable).where(eq(conversationParticipantsTable.conversationId, conversationId));
  for (const p of others) {
    if (p.userId !== myId && (await isBlockedBetween(myId, p.userId))) {
      res.status(403).json({ error: "Unable to message this user" });
      return;
    }
  }

  // Validate replyToId if provided
  const replyToId = (req.body as any).replyToId ?? null;
  if (replyToId !== null) {
    const [replyMsg] = await db.select().from(messagesTable).where(and(eq(messagesTable.id, replyToId), eq(messagesTable.conversationId, conversationId)));
    if (!replyMsg) { res.status(400).json({ error: "Reply target not found" }); return; }
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId, senderId: myId, content: parsed.data.content, replyToId })
    .returning();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, myId));

  // Notify others
  const participants = await db.select().from(conversationParticipantsTable).where(eq(conversationParticipantsTable.conversationId, conversationId));
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

  // Fetch replyTo for response
  let replyTo = null;
  if (replyToId) {
    const replyRows = await db
      .select({ msg: messagesTable, sender: usersTable })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(eq(messagesTable.id, replyToId));
    if (replyRows[0]) {
      replyTo = {
        id: replyRows[0].msg.id,
        sender: safeUser(replyRows[0].sender),
        content: replyRows[0].msg.content,
        createdAt: replyRows[0].msg.createdAt.toISOString(),
      };
    }
  }

  res.status(201).json({
    id: msg.id,
    conversationId: msg.conversationId,
    sender: safeUser(sender),
    content: msg.content,
    isPinned: false,
    editedAt: null,
    replyTo,
    reactions: [],
    createdAt: msg.createdAt.toISOString(),
  });
});

export default router;
