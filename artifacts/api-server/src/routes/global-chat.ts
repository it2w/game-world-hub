/**
 * Global Public Chat
 * Task #194 additions: channels (general/lfg/trading), cursor pagination,
 * Pro perks (badge, name-animation, 400-char limit, GIF, pin),
 * system_announcement on Top-10 leaderboard entry.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastAll, pushToUser } from "../ws/signaling";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Rate limit ─────────────────────────────────────────────────────────────────
const lastSent = new Map<number, number>();

// ── Constants ──────────────────────────────────────────────────────────────────
const HEX_RE          = /^#[0-9a-fA-F]{6}$/;
const MENTION_RE      = /@([a-zA-Z0-9_]{3,30})/g;
const VALID_REACTIONS = new Set([
  "👍","❤️","😂","💀","🔥","👏",
  "😮","😢","😡","🎉","💯","🤔",
  "👀","🙏","💪","✨","🤣","😍",
  "💎","👑","⚡","🏆","🎯","🤝",
]);
const VALID_CHANNELS  = new Set(["general", "lfg", "trading"]);
// Allow Giphy CDN and Tenor CDN gif URLs
const GIF_DOMAIN_RE   = /^https:\/\/media\d*\.(giphy|tenor)\.com\//;
// Giphy API key — set GIPHY_API_KEY in the environment for production use
const GIPHY_KEY       = process.env.GIPHY_API_KEY ?? "";
if (!GIPHY_KEY) {
  logger.warn("GIPHY_API_KEY is not set — gif-search will return empty results");
}

// ── Table setup ────────────────────────────────────────────────────────────────
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

    ALTER TABLE global_chat_messages
      ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'general';

    CREATE INDEX IF NOT EXISTS gcm_channel_idx ON global_chat_messages(channel, created_at DESC);

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

    CREATE TABLE IF NOT EXISTS global_chat_pins (
      id           SERIAL PRIMARY KEY,
      message_id   INTEGER NOT NULL REFERENCES global_chat_messages(id) ON DELETE CASCADE,
      pinner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel      TEXT NOT NULL DEFAULT 'general',
      pinned_until TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS gcp_channel_idx ON global_chat_pins(channel, pinned_until DESC);

    ALTER TABLE global_chat_messages
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS global_chat_top10_cache (
      user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// ── Top-10 sweep — broadcasts system_announcement on new entrants ──────────────

/**
 * Postgres session-level advisory lock key for sweepTop10.
 * Exported so tests can acquire it to drain any in-flight startup sweep.
 */
export const SWEEP_TOP10_LOCK_ID = 4_270_010_001;

const TOP10_SQL = `
  SELECT u.id, u.username, u.display_name
  FROM users u
  ORDER BY (
    (SELECT COUNT(*)::INT FROM friendships   WHERE user_id   = u.id) * 50  +
    (SELECT COUNT(*)::INT FROM parties       WHERE leader_id = u.id) * 120 +
    (SELECT COUNT(*)::INT FROM party_members WHERE user_id   = u.id) * 40  +
    (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = u.id) * 4   +
    (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = u.id) * 70  +
    (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = u.id) * 35  +
    COALESCE((SELECT bonus_xp FROM user_streaks WHERE user_id = u.id), 0)
  ) DESC
  LIMIT 10
`;

/**
 * Exported for testing — pass `top10Override` to bypass the ranking SQL
 * and inject a controlled user list instead (same pattern as sweepWeeklyWarNotifications).
 *
 * A Postgres advisory lock (SWEEP_TOP10_LOCK_ID) serialises concurrent runs so
 * that overlapping timers or a startup sweep racing with a test can never
 * produce duplicate announcements or unique-key conflicts on the cache table.
 * All cache reads, announcement inserts, and cache writes happen inside a
 * single transaction — either everything commits or nothing does.
 * Broadcasts are sent after commit so messages are visible to other connections.
 */
export async function sweepTop10(
  top10Override?: Array<{ id: number; username: string; display_name: string }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Advisory lock: concurrent sweeps queue here; the second one finds the
    // cache already refreshed and produces no duplicate announcements.
    await client.query("SELECT pg_advisory_xact_lock($1)", [SWEEP_TOP10_LOCK_ID]);

    const top10 = top10Override ?? (await client.query<{
      id: number; username: string; display_name: string;
    }>(TOP10_SQL)).rows;
    const newIds = new Set(top10.map(r => r.id));

    const { rows: cached } = await client.query<{ user_id: number }>(
      `SELECT user_id FROM global_chat_top10_cache`,
    );
    const cachedIds = new Set(cached.map(r => r.user_id));

    // Collect broadcasts to fire after commit
    const pending: unknown[] = [];

    // Only announce when cache is warm (skip the very first run)
    if (cachedIds.size > 0) {
      for (const user of top10) {
        if (!cachedIds.has(user.id)) {
          const rank = top10.findIndex(u => u.id === user.id) + 1;
          const meta = { rank_position: rank, username: user.username };
          const { rows } = await client.query<{ id: number; created_at: string }>(
            `INSERT INTO global_chat_messages (user_id, content, message_type, metadata, channel)
             VALUES ($1, $2, 'system_announcement', $3::jsonb, 'general')
             RETURNING id, created_at`,
            [user.id, user.display_name, JSON.stringify(meta)],
          );
          if (rows[0]) {
            pending.push({
              type: "global_chat",
              message: {
                id: rows[0].id, userId: user.id,
                content: user.display_name, channel: "general",
                messageType: "system_announcement",
                metadata: meta, createdAt: rows[0].created_at,
                reactions: [], replyTo: null,
                author: {
                  id: user.id, displayName: user.display_name,
                  username: user.username, avatarUrl: null, isPro: false,
                },
              },
            });
          }
        }
      }
    }

    // Refresh cache (atomic with announcements).
    // Inline integer IDs — safe because newIds contains DB-returned integers.
    // Avoids a pg prepared-statement confusion where an unnamed statement from
    // TRUNCATE (0 params) is re-used for the follow-up INSERT on the same client.
    await client.query(`TRUNCATE global_chat_top10_cache`);
    if (newIds.size > 0) {
      const vals = [...newIds].map(id => `(${id})`).join(",");
      await client.query(
        `INSERT INTO global_chat_top10_cache (user_id) VALUES ${vals}`,
      );
    }

    await client.query("COMMIT");

    // Broadcast after commit so inserted messages are visible
    for (const payload of pending) broadcastAll(payload);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err }, "global-chat: sweepTop10 failed");
  } finally {
    client.release();
  }
}

// Resolves once the startup warm-up sweep has finished.
// Tests await this before touching the cache so they don't race with it.
let _startupSweepResolve!: () => void;
export const startupSweepDone = new Promise<void>(res => { _startupSweepResolve = res; });

ensureTables()
  .then(async () => {
    await sweepTop10(); // warm up cache on startup — await so promise resolves after
    _startupSweepResolve();
    setInterval(() => void sweepTop10(), 2 * 60 * 1000).unref();
  })
  .catch(err => {
    logger.error({ err }, "global-chat: ensureTables failed");
    _startupSweepResolve(); // resolve anyway so tests don't hang
  });

// ── Helpers ────────────────────────────────────────────────────────────────────
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
    if (raw.badge && typeof raw.badge === "string" &&
        raw.badge.trim().length > 0 && raw.badge.length <= 8)
      m.badge = raw.badge.trim();
    if (typeof raw.nameAnimation === "boolean")
      m.nameAnimation = raw.nameAnimation;
    if (raw.msgBgColor && typeof raw.msgBgColor === "string" && HEX_RE.test(raw.msgBgColor))
      m.msgBgColor = raw.msgBgColor;
  }
  if (messageType === "lfg_signal") {
    if (raw.game     && typeof raw.game     === "string") m.game     = String(raw.game).slice(0, 60);
    if (raw.platform && typeof raw.platform === "string") m.platform = String(raw.platform).slice(0, 30);
    if (raw.rank     && typeof raw.rank     === "string") m.rank     = String(raw.rank).slice(0, 30);
    if (typeof raw.slots === "number")     m.slots     = Math.min(Math.max(1, raw.slots), 10);
    if (typeof raw.lfgPostId === "number") m.lfgPostId = raw.lfgPostId;
  }
  if (messageType === "gif") {
    if (raw.gifUrl && typeof raw.gifUrl === "string" && GIF_DOMAIN_RE.test(raw.gifUrl))
      m.gifUrl = raw.gifUrl;
  }
  if (messageType === "trade_offer") {
    if (raw.offering && typeof raw.offering === "string") m.offering = String(raw.offering).slice(0, 80);
    if (raw.seeking  && typeof raw.seeking  === "string") m.seeking  = String(raw.seeking).slice(0, 80);
    if (raw.price    && typeof raw.price    === "string") m.price    = String(raw.price).slice(0, 40);
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

// ── GET /global-chat/preview — public; cached 10 s ────────────────────────────
// Returns the last 12 non-system general-channel messages for the landing page.
// No auth required; strips no private fields (avatarUrl already public).
let _previewCache: { data: unknown; ts: number } | null = null;
const PREVIEW_TTL_MS = 10_000;

router.get("/global-chat/preview", async (_req, res): Promise<void> => {
  const now = Date.now();
  if (_previewCache && now - _previewCache.ts < PREVIEW_TTL_MS) {
    res.json(_previewCache.data);
    return;
  }
  try {
    const { rows } = await pool.query<{
      id: number; content: string; message_type: string;
      metadata: Record<string, unknown> | null; created_at: string;
      display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
    }>(`
      SELECT g.id, g.content, g.message_type, g.metadata, g.created_at,
             u.display_name, u.username, u.avatar_url, u.is_pro
      FROM global_chat_messages g
      JOIN users u ON u.id = g.user_id
      WHERE g.channel = 'general'
        AND g.message_type IN ('text', 'gif')
      ORDER BY g.created_at DESC
      LIMIT 12
    `);
    const data = rows.reverse().map(r => ({
      id:          r.id,
      content:     r.content,
      messageType: r.message_type,
      metadata:    r.metadata ?? {},
      createdAt:   r.created_at,
      author: {
        displayName: r.display_name,
        username:    r.username,
        avatarUrl:   toPublicImageUrl(r.avatar_url),
        isPro:       r.is_pro,
      },
    }));
    _previewCache = { data, ts: now };
    res.json(data);
  } catch {
    res.json([]);
  }
});

// ── GET /global-chat/messages ──────────────────────────────────────────────────
router.get("/global-chat/messages", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.auth!.userId;
  const limit   = Math.min(parseInt((req.query.limit as string) ?? "50", 10) || 50, 100);
  const before  = req.query.before ? parseInt(req.query.before as string, 10) : null;
  const channel = VALID_CHANNELS.has(req.query.channel as string)
    ? (req.query.channel as string)
    : "general";

  const params: unknown[] = [limit, channel];
  let beforeClause = "";
  if (before && !isNaN(before)) {
    params.push(before);
    beforeClause = `AND g.id < $${params.length}`;
  }

  const { rows } = await pool.query<{
    id: number; user_id: number; content: string; message_type: string;
    metadata: Record<string, unknown> | null; created_at: string; edited_at: string | null; channel: string;
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
    reply_to_id: number | null;
    reply_content: string | null; reply_author: string | null;
  }>(`
    SELECT g.id, g.user_id, g.content, g.message_type, g.metadata, g.created_at, g.edited_at, g.channel,
           u.display_name, u.username, u.avatar_url, u.is_pro,
           g.reply_to_id,
           rg.content       AS reply_content,
           ru.display_name  AS reply_author
    FROM global_chat_messages g
    JOIN  users u  ON u.id  = g.user_id
    LEFT JOIN global_chat_messages rg ON rg.id = g.reply_to_id
    LEFT JOIN users ru ON ru.id = rg.user_id
    WHERE g.channel = $2 ${beforeClause}
    ORDER BY g.created_at DESC
    LIMIT $1
  `, params);

  const reversed    = rows.reverse();
  const ids         = reversed.map(r => r.id);
  const reactionMap = await fetchReactions(ids, userId);

  res.json(
    reversed.map(r => ({
      id:          r.id,
      userId:      r.user_id,
      content:     r.content,
      channel:     r.channel,
      messageType: r.message_type,
      metadata:    r.metadata ?? {},
      createdAt:   r.created_at,
      editedAt:    r.edited_at ?? undefined,
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

// ── POST /global-chat/messages ─────────────────────────────────────────────────
router.post("/global-chat/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const {
    content, messageType = "text", metadata,
    replyToId, channel = "general",
  } = req.body as {
    content?: string; messageType?: string;
    metadata?: Record<string, unknown>;
    replyToId?: number;
    channel?: string;
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content required" }); return;
  }

  const safeChannel = VALID_CHANNELS.has(channel) ? channel : "general";

  if (!["text", "lfg_signal", "gif", "trade_offer"].includes(messageType)) {
    res.status(400).json({ error: "Invalid message type" }); return;
  }

  const { rows: ur } = await pool.query<{
    display_name: string; username: string; avatar_url: string | null; is_pro: boolean;
  }>(`SELECT display_name, username, avatar_url, is_pro FROM users WHERE id = $1`, [userId]);
  if (!ur[0]) { res.status(404).json({ error: "User not found" }); return; }
  const user = ur[0];

  // Pro gets faster cooldown (500 ms) — regular users wait 1 s
  const now      = Date.now();
  const last     = lastSent.get(userId) ?? 0;
  const cooldown = user.is_pro ? 500 : 1000;
  if (now - last < cooldown) {
    res.status(429).json({ error: "Too fast — wait a moment" });
    return;
  }
  lastSent.set(userId, now);

  const maxLen = user.is_pro ? 800 : 300;
  if (content.length > maxLen) {
    res.status(400).json({ error: `Message too long (max ${maxLen} chars)` }); return;
  }

  if (messageType === "gif" && !user.is_pro) {
    res.status(403).json({ error: "GIF messages require Pro" }); return;
  }

  // Validate replyToId
  let validReplyToId: number | null = null;
  if (typeof replyToId === "number") {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM global_chat_messages WHERE id = $1`, [replyToId],
    );
    if ((rowCount ?? 0) > 0) validReplyToId = replyToId;
  }

  const safeMeta = sanitizeMeta(metadata ?? {}, user.is_pro, messageType);
  const trimmed  = content.trim();

  const { rows } = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO global_chat_messages (user_id, content, message_type, metadata, reply_to_id, channel)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id, created_at`,
    [userId, trimmed, messageType, JSON.stringify(safeMeta), validReplyToId, safeChannel],
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
    id: row.id, userId, content: trimmed, channel: safeChannel, messageType,
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

// ── POST /global-chat/messages/:id/pin — Pro only, own messages ────────────────
router.post("/global-chat/messages/:id/pin", requireAuth, async (req, res): Promise<void> => {
  const userId    = req.auth!.userId;
  const messageId = parseInt(req.params.id, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows: ur } = await pool.query<{ is_pro: boolean }>(
    `SELECT is_pro FROM users WHERE id = $1`, [userId],
  );
  if (!ur[0]?.is_pro) { res.status(403).json({ error: "Pro required to pin messages" }); return; }

  const { rows: mr } = await pool.query<{
    user_id: number; content: string; channel: string; message_type: string;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT user_id, content, channel, message_type, metadata
     FROM global_chat_messages WHERE id = $1`, [messageId],
  );
  if (!mr[0]) { res.status(404).json({ error: "Message not found" }); return; }
  if (mr[0].user_id !== userId) {
    res.status(403).json({ error: "Can only pin your own messages" }); return;
  }

  const msg          = mr[0];
  const pinnedUntil  = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // One global pin per channel at a time
  await pool.query(`DELETE FROM global_chat_pins WHERE channel = $1`, [msg.channel]);

  await pool.query(
    `INSERT INTO global_chat_pins (message_id, pinner_id, channel, pinned_until)
     VALUES ($1, $2, $3, $4)`,
    [messageId, userId, msg.channel, pinnedUntil],
  );

  const { rows: uPro } = await pool.query<{
    display_name: string; username: string; avatar_url: string | null;
  }>(`SELECT display_name, username, avatar_url FROM users WHERE id = $1`, [userId]);

  const pinPayload = {
    type: "pin_update",
    channel: msg.channel,
    pin: {
      messageId,
      content: msg.content,
      messageType: msg.message_type,
      metadata: msg.metadata ?? {},
      pinnedUntil,
      author: {
        id: userId,
        displayName: uPro[0]?.display_name ?? "",
        username:    uPro[0]?.username ?? "",
        avatarUrl:   toPublicImageUrl(uPro[0]?.avatar_url ?? null),
        isPro: true,
      },
    },
  };
  broadcastAll(pinPayload);
  res.json(pinPayload.pin);
});

// ── PATCH /global-chat/messages/:id — edit own message (Pro, ≤5 min) ─────────
router.patch("/global-chat/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const userId    = req.auth!.userId;
  const messageId = parseInt(req.params.id, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body as { content?: string };
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content required" }); return;
  }

  const { rows: ur } = await pool.query<{ is_pro: boolean }>(
    `SELECT is_pro FROM users WHERE id = $1`, [userId],
  );
  if (!ur[0]?.is_pro) { res.status(403).json({ error: "Pro required to edit messages" }); return; }

  const { rows: mr } = await pool.query<{
    user_id: number; created_at: string; channel: string;
  }>(
    `SELECT user_id, created_at, channel FROM global_chat_messages WHERE id = $1`, [messageId],
  );
  if (!mr[0]) { res.status(404).json({ error: "Message not found" }); return; }
  if (mr[0].user_id !== userId) {
    res.status(403).json({ error: "Can only edit your own messages" }); return;
  }

  const ageMs = Date.now() - new Date(mr[0].created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    res.status(403).json({ error: "Can no longer edit (5 min limit)" }); return;
  }

  const trimmed = content.trim().slice(0, 800);
  const { rows } = await pool.query<{ edited_at: string }>(
    `UPDATE global_chat_messages SET content = $1, edited_at = NOW()
     WHERE id = $2 RETURNING edited_at`,
    [trimmed, messageId],
  );

  const payload = {
    type: "message_edit",
    messageId,
    content: trimmed,
    editedAt: rows[0]?.edited_at ?? new Date().toISOString(),
    channel: mr[0].channel,
  };
  broadcastAll(payload);
  res.json(payload);
});

// ── GET /global-chat/pinned — active pinned message for a channel ──────────────
router.get("/global-chat/pinned", requireAuth, async (req, res): Promise<void> => {
  const channel = VALID_CHANNELS.has(req.query.channel as string)
    ? (req.query.channel as string)
    : "general";

  const { rows } = await pool.query<{
    message_id: number; content: string; message_type: string;
    metadata: Record<string, unknown> | null; pinned_until: string;
    display_name: string; username: string; avatar_url: string | null;
    pinner_id: number;
  }>(`
    SELECT p.message_id, g.content, g.message_type, g.metadata, p.pinned_until,
           u.display_name, u.username, u.avatar_url, p.pinner_id
    FROM global_chat_pins p
    JOIN global_chat_messages g ON g.id = p.message_id
    JOIN users u ON u.id = p.pinner_id
    WHERE p.channel = $1 AND p.pinned_until > NOW()
    ORDER BY p.created_at DESC
    LIMIT 1
  `, [channel]);

  if (!rows[0]) { res.json(null); return; }
  const r = rows[0];
  res.json({
    messageId:   r.message_id,
    content:     r.content,
    messageType: r.message_type,
    metadata:    r.metadata ?? {},
    pinnedUntil: r.pinned_until,
    author: {
      id:          r.pinner_id,
      displayName: r.display_name,
      username:    r.username,
      avatarUrl:   toPublicImageUrl(r.avatar_url),
      isPro:       true,
    },
  });
});

// ── GET /global-chat/gif-search — Giphy proxy ─────────────────────────────────
router.get("/global-chat/gif-search", requireAuth, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (!q || !GIPHY_KEY) { res.json([]); return; }
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=15&rating=g`;
    const r = await fetch(url);
    const json = await r.json() as {
      data: Array<{
        id: string;
        images: {
          fixed_height:       { url: string; width: string; height: string };
          fixed_height_small: { url: string };
        };
      }>;
    };
    const gifs = (json.data ?? []).map(g => ({
      id:         g.id,
      url:        g.images.fixed_height?.url ?? "",
      previewUrl: g.images.fixed_height_small?.url || g.images.fixed_height?.url || "",
    })).filter(g => g.url);
    res.json(gifs);
  } catch (err) {
    logger.error({ err }, "global-chat: gif-search failed");
    res.json([]);
  }
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
