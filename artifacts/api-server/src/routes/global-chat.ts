/**
 * Global Public Chat
 * Features: text messages, LFG signals, reactions (toggle), threaded replies,
 * @mention push notifications, active-count, reports.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastAll, pushToUser } from "../ws/signaling";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Rate limit ────────────────────────────────────────────────────────────────
const lastSent = new Map<number, number>();

// ── Table setup ───────────────────────────────────────────────────────────────
async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_chat_messages (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content      TEXT    NOT NULL,
      message_type TEXT    NOT NULL DEFAULT 'text',
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS gcm_created_idx ON global_chat_messages(created_at DESC);

    ALTER TABLE global_chat_messages
      ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES global_chat_messages(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS global_chat_reactions (
      id         SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES global_chat_messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      emoji      TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id, user_id, emoji)
    );
    CREATE INDEX IF NOT EXISTS gcr_msg_idx ON global_chat_reactions(message_id);

    CREATE TABLE IF NOT EXISTS global_chat_reports (
      id          SERIAL PRIMARY KEY,
      message_id  INTEGER NOT NULL REFERENCES global_chat_messages(id) ON DELETE CASCADE,
      reporter_id INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id, reporter_id)
    );
  `);
}
ensureTables().catch(err => logger.error({ err }, "global-chat: ensureTables failed"));

// ── Helpers ───────────────────────────────────────────────────────────────────
const HEX_RE      = /^#[0-9a-fA-F]{6}$/;
const MENTION_RE  = /@([a-zA-Z0-9_]{3,30})/g;
const VALID_REACTIONS = new Set(["👍","❤️","😂","💀","🔥","👏"]);

function sanitizeMeta(
  raw: Record<string, unknown>,
  isPro: boolean,
  messageType: string,
): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (isPro) {
    if (raw.nameColor && typeof raw.nameColor === "string" && HEX_RE.test(raw.nameColor))
      m.nameColor = raw.nameColor;
    if (raw.textColor && typeof raw.textColor === "string" && HEX_RE.test(raw.textColor))
      m.textColor = raw.textColor;
  }
  if (messageType === "lfg_signal") {
    if (raw.game     && typeof raw.game     === "string") m.game     = String(raw.game).slice(0, 60);
    if (raw.platform && typeof raw.platform === "string") m.platform = String(raw.platform).slice(0, 30);
    if (raw.rank     && typeof raw.rank     === "string") m.rank     = String(raw.rank).slice(0, 30);
    if (typeof raw.slots === "number")    m.slots    = Math.min(Math.max(1, raw.slots), 10);
    if (typeof raw.lfgPostId === "number") m.lfgPostId = raw.lfgPostId;
  }
  return m;
}

async function fetchReactions(
  messageIds: number[],
  userId: number,
): Promise<Map<number, { emoji: string; count: number; hasMe: boolean }[]>> {
  if (messageIds.length === 0) return new Map();
  const { rows } = await pool.query<{
    message_id: number; emoji: string; cnt: string; has_me: boolean;
  }>(
    `SELECT message_id, emoji, COUNT(*) AS cnt,
            bool_or(user_id = $2) AS has_me
     FROM global_chat_reactions
     WHERE message_id = ANY($1)
     GROUP BY message_id, emoji
     ORDER BY MIN(created_at)`,
    [messageIds, userId],
  );
  const map = new Map<number, { emoji: string; count: number; hasMe: boolean }[]>();
  for (const r of rows) {
    if (!map.has(r.message_id)) map.set(r.message_id, []);
    map.get(r.message_id)!.push({ emoji: r.emoji, count: Number(r.cnt), hasMe: r.has_me });
  }
  return map;
}

// ── GET /global-chat/messages ─────────────────────────────────────────────────
router.get("/global-chat/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const limit  = Math.min(parseInt((req.query.limit as string) ?? "50", 10) || 50, 100);
  const before = req.query.before ? parseInt(req.query.before as string, 10) : null;

  const { rows } = await pool.query<{
    id: number; user_id: number; content: string; message_type: string;
    metadata: Record<string, unknown> | null; created_at: string;
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
    reply_to_id: number | null;
    reply_content: string | null; reply_author: string | null;
  }>(`
    SELECT g.id, g.user_id, g.content, g.message_type, g.metadata, g.created_at,
           u.display_name, u.username, u.avatar_url, u.is_pro,
           g.reply_to_id,
           rg.content       AS reply_content,
           ru.display_name  AS reply_author
    FROM global_chat_messages g
    JOIN  users u  ON u.id  = g.user_id
    LEFT JOIN global_chat_messages rg ON rg.id = g.reply_to_id
    LEFT JOIN users ru ON ru.id = rg.user_id
    ${before ? "WHERE g.id < $2" : ""}
    ORDER BY g.created_at DESC
    LIMIT $1
  `, before ? [limit, before] : [limit]);

  const reversed   = rows.reverse();
  const ids        = reversed.map(r => r.id);
  const reactionMap = await fetchReactions(ids, userId);

  res.json(
    reversed.map(r => ({
      id:          r.id,
      userId:      r.user_id,
      content:     r.content,
      messageType: r.message_type,
      metadata:    r.metadata ?? {},
      createdAt:   r.created_at,
      reactions:   reactionMap.get(r.id) ?? [],
      replyTo:     r.reply_to_id
        ? { id: r.reply_to_id, content: r.reply_content ?? "", authorName: r.reply_author ?? "" }
        : null,
      author: {
        id:          r.user_id,
        displayName: r.display_name,
        username:    r.username,
        avatarUrl:   toPublicImageUrl(r.avatar_url),
        isPro:       r.is_pro,
      },
    })),
  );
});

// ── POST /global-chat/messages ────────────────────────────────────────────────
router.post("/global-chat/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const now  = Date.now();
  const last = lastSent.get(userId) ?? 0;
  if (now - last < 1000) {
    res.status(429).json({ error: "Too fast — wait a moment" });
    return;
  }
  lastSent.set(userId, now);

  const { content, messageType = "text", metadata, replyToId } = req.body as {
    content?: string; messageType?: string;
    metadata?: Record<string, unknown>; replyToId?: number;
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content required" }); return;
  }
  if (content.length > 200) {
    res.status(400).json({ error: "Message too long (max 200 chars)" }); return;
  }
  if (!["text", "lfg_signal"].includes(messageType)) {
    res.status(400).json({ error: "Invalid message type" }); return;
  }

  // Validate replyToId
  let validReplyToId: number | null = null;
  if (typeof replyToId === "number") {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM global_chat_messages WHERE id = $1`, [replyToId],
    );
    if ((rowCount ?? 0) > 0) validReplyToId = replyToId;
  }

  const { rows: ur } = await pool.query<{
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
  }>(`SELECT display_name, username, avatar_url, is_pro FROM users WHERE id = $1`, [userId]);
  if (!ur[0]) { res.status(404).json({ error: "User not found" }); return; }
  const user = ur[0];

  const safeMeta = sanitizeMeta(metadata ?? {}, user.is_pro, messageType);
  const trimmed  = content.trim();

  const { rows } = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO global_chat_messages (user_id, content, message_type, metadata, reply_to_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [userId, trimmed, messageType, JSON.stringify(safeMeta), validReplyToId],
  );
  const row = rows[0];

  // Build replyTo preview
  let replyTo: { id: number; content: string; authorName: string } | null = null;
  if (validReplyToId) {
    const { rows: rr } = await pool.query<{ content: string; display_name: string }>(
      `SELECT g.content, u.display_name
       FROM global_chat_messages g JOIN users u ON u.id = g.user_id
       WHERE g.id = $1`, [validReplyToId],
    );
    if (rr[0]) replyTo = { id: validReplyToId, content: rr[0].content, authorName: rr[0].display_name };
  }

  const message = {
    id: row.id, userId, content: trimmed, messageType,
    metadata: safeMeta, createdAt: row.created_at,
    reactions: [], replyTo,
    author: {
      id: userId, displayName: user.display_name,
      username: user.username, avatarUrl: toPublicImageUrl(user.avatar_url),
      isPro: user.is_pro,
    },
  };

  broadcastAll({ type: "global_chat", message });

  // @mention push notifications
  const mentioned = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(trimmed)) !== null) mentioned.add(m[1].toLowerCase());
  if (mentioned.size > 0) {
    const { rows: mus } = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE LOWER(username) = ANY($1) AND id != $2`,
      [[...mentioned], userId],
    );
    for (const mu of mus) {
      pushToUser(mu.id, {
        type: "mention", fromDisplayName: user.display_name,
        fromUsername: user.username, messageId: row.id,
        content: trimmed.slice(0, 100),
      });
    }
  }

  res.status(201).json(message);
});

// ── POST /global-chat/messages/:id/reactions — toggle ─────────────────────────
router.post("/global-chat/messages/:id/reactions", requireAuth, async (req, res): Promise<void> => {
  const userId    = req.auth!.userId;
  const messageId = parseInt(req.params.id, 10);
  const { emoji } = req.body as { emoji?: string };

  if (!emoji || !VALID_REACTIONS.has(emoji)) {
    res.status(400).json({ error: "Invalid emoji" }); return;
  }

  const { rowCount: exists } = await pool.query(
    `SELECT 1 FROM global_chat_messages WHERE id = $1`, [messageId],
  );
  if (!exists) { res.status(404).json({ error: "Message not found" }); return; }

  const ins = await pool.query(
    `INSERT INTO global_chat_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
    [messageId, userId, emoji],
  );
  const delta = (ins.rowCount ?? 0) > 0 ? 1 : -1;
  if (delta === -1) {
    await pool.query(
      `DELETE FROM global_chat_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
      [messageId, userId, emoji],
    );
  }

  const { rows: updated } = await pool.query<{ emoji: string; cnt: string }>(
    `SELECT emoji, COUNT(*) AS cnt FROM global_chat_reactions
     WHERE message_id = $1 GROUP BY emoji ORDER BY MIN(created_at)`,
    [messageId],
  );

  const payload = {
    type: "reaction_update", messageId, emoji, delta, actorId: userId,
    reactions: updated.map(r => ({ emoji: r.emoji, count: Number(r.cnt) })),
  };
  broadcastAll(payload);
  res.json(payload);
});

// ── GET /global-chat/active-count ─────────────────────────────────────────────
router.get("/global-chat/active-count", requireAuth, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT user_id) AS cnt
     FROM global_chat_messages WHERE created_at > NOW() - INTERVAL '5 minutes'`,
  );
  res.json({ count: Number(rows[0]?.cnt ?? 0) });
});

// ── POST /global-chat/messages/:id/report ─────────────────────────────────────
router.post("/global-chat/messages/:id/report", requireAuth, async (req, res): Promise<void> => {
  const userId    = req.auth!.userId;
  const messageId = parseInt(req.params.id, 10);

  const { rowCount: exists } = await pool.query(
    `SELECT 1 FROM global_chat_messages WHERE id = $1`, [messageId],
  );
  if (!exists) { res.status(404).json({ error: "Message not found" }); return; }

  await pool.query(
    `INSERT INTO global_chat_reports (message_id, reporter_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [messageId, userId],
  );
  res.json({ reported: true });
});

export default router;
