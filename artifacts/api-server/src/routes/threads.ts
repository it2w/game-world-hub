/**
 * Message thread routes
 *
 * GET  /conversations/:conversationId/messages/:messageId/thread
 *   → returns thread metadata + all thread messages
 *
 * POST /conversations/:conversationId/messages/:messageId/thread/messages
 *   → post a reply; creates the thread if it doesn't exist yet
 */
import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  conversationParticipantsTable,
  messagesTable,
  messageThreadsTable,
  threadMessagesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { checkAutomod } from "../lib/automod";

// ── Startup: ensure tables and indexes exist ─────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id              SERIAL PRIMARY KEY,
      root_message_id INTEGER NOT NULL,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      reply_count     INTEGER NOT NULL DEFAULT 0,
      last_reply_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS thread_messages (
      id         SERIAL PRIMARY KEY,
      thread_id  INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
      sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Unique index required for the ON CONFLICT upsert in POST thread/messages
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mt_root_unique_idx ON message_threads(root_message_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS mt_conv_idx ON message_threads(conversation_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS tm_thread_idx ON thread_messages(thread_id)`,
  );
  logger.info("threads: tables ensured");
}

ensureTables().catch((err) => logger.error({ err }, "threads: ensureTables failed"));

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null) ?? null,
  };
}

// ── GET thread ─────────────────────────────────────────────────────────────────

router.get(
  "/conversations/:conversationId/messages/:messageId/thread",
  requireAuth,
  async (req, res): Promise<void> => {
    const myId = req.auth!.userId;
    const conversationId = parseInt(req.params.conversationId as string, 10);
    const messageId = parseInt(req.params.messageId as string, 10);

    const [membership] = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, conversationId),
          eq(conversationParticipantsTable.userId, myId),
        ),
      );
    if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

    const [thread] = await db
      .select()
      .from(messageThreadsTable)
      .where(
        and(
          eq(messageThreadsTable.rootMessageId, messageId),
          eq(messageThreadsTable.conversationId, conversationId),
        ),
      );

    if (!thread) {
      res.json({ exists: false, threadId: null, replyCount: 0, messages: [] });
      return;
    }

    const rows = await db
      .select({ msg: threadMessagesTable, sender: usersTable })
      .from(threadMessagesTable)
      .innerJoin(usersTable, eq(threadMessagesTable.senderId, usersTable.id))
      .where(eq(threadMessagesTable.threadId, thread.id))
      .orderBy(asc(threadMessagesTable.createdAt));

    res.json({
      exists: true,
      threadId: thread.id,
      replyCount: thread.replyCount,
      lastReplyAt: thread.lastReplyAt?.toISOString() ?? null,
      messages: rows.map(({ msg, sender }) => ({
        id: msg.id,
        sender: safeUser(sender),
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
    });
  },
);

// ── POST reply ─────────────────────────────────────────────────────────────────

router.post(
  "/conversations/:conversationId/messages/:messageId/thread/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const myId = req.auth!.userId;
    const conversationId = parseInt(req.params.conversationId as string, 10);
    const messageId = parseInt(req.params.messageId as string, 10);

    const [membership] = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, conversationId),
          eq(conversationParticipantsTable.userId, myId),
        ),
      );
    if (!membership) { res.status(403).json({ error: "Forbidden" }); return; }

    // Verify root message belongs to this conversation
    const [rootMsg] = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.id, messageId),
          eq(messagesTable.conversationId, conversationId),
        ),
      );
    if (!rootMsg) { res.status(404).json({ error: "Message not found" }); return; }

    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Content required" }); return;
    }
    if (content.length > 2000) {
      res.status(400).json({ error: "Content too long (max 2000 characters)" }); return;
    }

    // AutoMod enforcement — same rules as main conversation messages
    const automodResult = await checkAutomod(myId, conversationId, content.trim());
    if (automodResult.blocked) {
      res.status(429).json({ error: automodResult.reason, automod: true }); return;
    }

    // Upsert thread — unique index on root_message_id prevents duplicate rows
    // even under concurrent first-reply requests.
    const { pool } = await import("@workspace/db");
    const { rows: threadRows } = await pool.query<{
      id: number; reply_count: number;
    }>(`
      INSERT INTO message_threads (root_message_id, conversation_id)
      VALUES ($1, $2)
      ON CONFLICT (root_message_id) DO UPDATE
        SET root_message_id = EXCLUDED.root_message_id  -- no-op, keeps the row
      RETURNING id, reply_count
    `, [messageId, conversationId]);

    const threadId = threadRows[0].id;

    const [msg] = await db
      .insert(threadMessagesTable)
      .values({ threadId, senderId: myId, content: content.trim() })
      .returning();

    // Atomic increment — safe under concurrent replies
    const { rows: updatedRows } = await pool.query<{ reply_count: number }>(
      `UPDATE message_threads
       SET reply_count = reply_count + 1, last_reply_at = NOW()
       WHERE id = $1
       RETURNING reply_count`,
      [threadId],
    );
    const newReplyCount = updatedRows[0]?.reply_count ?? 1;

    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, myId));

    res.status(201).json({
      id: msg.id,
      threadId,
      replyCount: newReplyCount,
      sender: safeUser(sender),
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    });
  },
);

export default router;
