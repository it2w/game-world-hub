/**
 * Global Public Chat
 *
 * A single channel visible to all authenticated users.
 * Messages are broadcast in real-time via broadcastAll().
 * Pro users may include nameColor / textColor in metadata.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastAll } from "../ws/signaling";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Rate limit: 1 message per 1 second per user (in-memory) ───────────────────
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
  `);
}
ensureTables().catch(err => logger.error({ err }, "global-chat: ensureTables failed"));

// ── Helpers ───────────────────────────────────────────────────────────────────
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
    if (raw.game && typeof raw.game === "string")   m.game  = String(raw.game).slice(0, 60);
    if (typeof raw.slots === "number")               m.slots = Math.min(Math.max(1, raw.slots), 10);
    if (typeof raw.lfgPostId === "number")           m.lfgPostId = raw.lfgPostId;
  }
  return m;
}

// ── GET /global-chat/messages ─────────────────────────────────────────────────
router.get("/global-chat/messages", requireAuth, async (req, res): Promise<void> => {
  const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50", 10) || 50, 100);
  const before = req.query.before ? parseInt(req.query.before as string, 10) : null;

  const { rows } = await pool.query<{
    id: number; user_id: number; content: string; message_type: string;
    metadata: Record<string, unknown> | null; created_at: string;
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
  }>(`
    SELECT g.id, g.user_id, g.content, g.message_type, g.metadata, g.created_at,
           u.display_name, u.username, u.avatar_url, u.is_pro
    FROM global_chat_messages g
    JOIN users u ON u.id = g.user_id
    ${before ? "WHERE g.id < $2" : ""}
    ORDER BY g.created_at DESC
    LIMIT $1
  `, before ? [limit, before] : [limit]);

  res.json(
    rows.reverse().map(r => ({
      id:          r.id,
      userId:      r.user_id,
      content:     r.content,
      messageType: r.message_type,
      metadata:    r.metadata ?? {},
      createdAt:   r.created_at,
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

  // Rate limit
  const now  = Date.now();
  const last = lastSent.get(userId) ?? 0;
  if (now - last < 1000) {
    res.status(429).json({ error: "Too fast — wait a moment" });
    return;
  }
  lastSent.set(userId, now);

  const { content, messageType = "text", metadata } = req.body as {
    content?: string;
    messageType?: string;
    metadata?: Record<string, unknown>;
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content required" });
    return;
  }
  if (content.length > 200) {
    res.status(400).json({ error: "Message too long (max 200 chars)" });
    return;
  }
  if (!["text", "lfg_signal"].includes(messageType)) {
    res.status(400).json({ error: "Invalid message type" });
    return;
  }

  // Fetch sender
  const { rows: ur } = await pool.query<{
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
  }>(`SELECT display_name, username, avatar_url, is_pro FROM users WHERE id = $1`, [userId]);
  if (!ur[0]) { res.status(404).json({ error: "User not found" }); return; }
  const user = ur[0];

  const safeMeta = sanitizeMeta(metadata ?? {}, user.is_pro, messageType);

  const { rows } = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO global_chat_messages (user_id, content, message_type, metadata)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [userId, content.trim(), messageType, JSON.stringify(safeMeta)],
  );
  const row = rows[0];

  const message = {
    id:          row.id,
    userId,
    content:     content.trim(),
    messageType,
    metadata:    safeMeta,
    createdAt:   row.created_at,
    author: {
      id:          userId,
      displayName: user.display_name,
      username:    user.username,
      avatarUrl:   toPublicImageUrl(user.avatar_url),
      isPro:       user.is_pro,
    },
  };

  broadcastAll({ type: "global_chat", message });
  res.status(201).json(message);
});

export default router;
