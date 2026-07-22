/**
 * Poll routes
 *
 * POST   /conversations/:cid/polls              — create poll (also creates a special message)
 * GET    /conversations/:cid/polls/:pid         — fetch poll with per-option counts + my vote
 * POST   /conversations/:cid/polls/:pid/votes   — cast or change vote
 * DELETE /conversations/:cid/polls/:pid/votes   — remove vote
 * POST   /conversations/:cid/polls/:pid/close   — creator closes poll early
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  pool,
  conversationParticipantsTable,
  pollsTable,
  pollOptionsTable,
  pollVotesTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { checkAutomod } from "../lib/automod";

// ── Startup: ensure tables and indexes exist ─────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS polls (
      id              SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      creator_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question        TEXT NOT NULL,
      closes_at       TIMESTAMPTZ,
      is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poll_options (
      id            SERIAL PRIMARY KEY,
      poll_id       INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label         TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id   INTEGER NOT NULL REFERENCES polls(id)         ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
      option_id INTEGER NOT NULL REFERENCES poll_options(id)  ON DELETE CASCADE,
      voted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (poll_id, user_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS po_poll_idx ON poll_options(poll_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS pv_poll_idx ON poll_votes(poll_id)`,
  );
  logger.info("polls: tables ensured");
}

ensureTables().catch((err) => logger.error({ err }, "polls: ensureTables failed"));

const router: IRouter = Router();

// ── Serializer ────────────────────────────────────────────────────────────────

async function serializePoll(pollId: number, myId: number) {
  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) return null;

  const options = await db
    .select()
    .from(pollOptionsTable)
    .where(eq(pollOptionsTable.pollId, pollId))
    .orderBy(pollOptionsTable.displayOrder);

  const votes = await db.select().from(pollVotesTable).where(eq(pollVotesTable.pollId, pollId));
  const totalVotes = votes.length;
  const myVote = votes.find((v) => v.userId === myId)?.optionId ?? null;

  const now = new Date();
  const isClosed = poll.isClosed || (poll.closesAt !== null && poll.closesAt <= now);

  return {
    id: poll.id,
    conversationId: poll.conversationId,
    creatorId: poll.creatorId,
    question: poll.question,
    options: options.map((opt) => {
      const count = votes.filter((v) => v.optionId === opt.id).length;
      return {
        id: opt.id,
        label: opt.label,
        count,
        percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      };
    }),
    totalVotes,
    myVote,
    isClosed,
    closesAt: poll.closesAt?.toISOString() ?? null,
    createdAt: poll.createdAt.toISOString(),
  };
}

// ── POST /conversations/:cid/polls ────────────────────────────────────────────

router.post("/conversations/:conversationId/polls", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);

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

  const { question, options, closesAt } = req.body as {
    question?: string;
    options?: unknown[];
    closesAt?: string;
  };

  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "Question required" }); return;
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 5) {
    res.status(400).json({ error: "Provide 2–5 options" }); return;
  }
  const trimmedOptions = options.map((o) => String(o).trim()).filter(Boolean);
  if (trimmedOptions.length < 2) {
    res.status(400).json({ error: "Options cannot be empty" }); return;
  }

  let parsedClosesAt: Date | null = null;
  if (closesAt) {
    parsedClosesAt = new Date(closesAt);
    if (isNaN(parsedClosesAt.getTime()) || parsedClosesAt <= new Date()) {
      res.status(400).json({ error: "closesAt must be a future date" }); return;
    }
  }

  // AutoMod enforcement — check question and all option labels
  const fullPollText = [question.trim(), ...trimmedOptions].join(" ");
  const automodResult = await checkAutomod(myId, conversationId, fullPollText);
  if (automodResult.blocked) {
    res.status(429).json({ error: automodResult.reason, automod: true }); return;
  }

  const [poll] = await db
    .insert(pollsTable)
    .values({ conversationId, creatorId: myId, question: question.trim(), closesAt: parsedClosesAt })
    .returning();

  await db.insert(pollOptionsTable).values(
    trimmedOptions.map((label, i) => ({ pollId: poll.id, label, displayOrder: i })),
  );

  // Insert a special message that embeds the poll ID so the chat client can render it
  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId, senderId: myId, content: `__poll:${poll.id}__` })
    .returning();

  const serialized = await serializePoll(poll.id, myId);
  res.status(201).json({ ...serialized, messageId: msg.id });
});

// ── GET /conversations/:cid/polls/:pid ────────────────────────────────────────

router.get("/conversations/:conversationId/polls/:pollId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const pollId = parseInt(req.params.pollId as string, 10);

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

  const poll = await serializePoll(pollId, myId);
  if (!poll || poll.conversationId !== conversationId) {
    res.status(404).json({ error: "Poll not found" }); return;
  }
  res.json(poll);
});

// ── POST /conversations/:cid/polls/:pid/votes ─────────────────────────────────

router.post("/conversations/:conversationId/polls/:pollId/votes", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const pollId = parseInt(req.params.pollId as string, 10);

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

  const [poll] = await db
    .select()
    .from(pollsTable)
    .where(and(eq(pollsTable.id, pollId), eq(pollsTable.conversationId, conversationId)));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const now = new Date();
  if (poll.isClosed || (poll.closesAt && poll.closesAt <= now)) {
    res.status(400).json({ error: "This poll is closed" }); return;
  }

  const { optionId } = req.body as { optionId?: unknown };
  if (typeof optionId !== "number") { res.status(400).json({ error: "optionId required" }); return; }

  const [option] = await db
    .select()
    .from(pollOptionsTable)
    .where(and(eq(pollOptionsTable.id, optionId), eq(pollOptionsTable.pollId, pollId)));
  if (!option) { res.status(400).json({ error: "Invalid option" }); return; }

  await db
    .insert(pollVotesTable)
    .values({ pollId, userId: myId, optionId })
    .onConflictDoUpdate({
      target: [pollVotesTable.pollId, pollVotesTable.userId],
      set: { optionId, votedAt: new Date() },
    });

  res.json(await serializePoll(pollId, myId));
});

// ── DELETE /conversations/:cid/polls/:pid/votes ───────────────────────────────

router.delete("/conversations/:conversationId/polls/:pollId/votes", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const pollId = parseInt(req.params.pollId as string, 10);

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

  const [poll] = await db
    .select()
    .from(pollsTable)
    .where(and(eq(pollsTable.id, pollId), eq(pollsTable.conversationId, conversationId)));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const now = new Date();
  if (poll.isClosed || (poll.closesAt && poll.closesAt <= now)) {
    res.status(400).json({ error: "This poll is closed" }); return;
  }

  await db
    .delete(pollVotesTable)
    .where(and(eq(pollVotesTable.pollId, pollId), eq(pollVotesTable.userId, myId)));

  res.json(await serializePoll(pollId, myId));
});

// ── POST /conversations/:cid/polls/:pid/close ─────────────────────────────────

router.post("/conversations/:conversationId/polls/:pollId/close", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const conversationId = parseInt(req.params.conversationId as string, 10);
  const pollId = parseInt(req.params.pollId as string, 10);

  const [poll] = await db
    .select()
    .from(pollsTable)
    .where(and(eq(pollsTable.id, pollId), eq(pollsTable.conversationId, conversationId)));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  if (poll.creatorId !== myId) { res.status(403).json({ error: "Only the creator can close this poll" }); return; }

  await db.update(pollsTable).set({ isClosed: true }).where(eq(pollsTable.id, pollId));

  res.json(await serializePoll(pollId, myId));
});

export default router;
