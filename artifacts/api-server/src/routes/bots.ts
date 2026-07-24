/**
 * Community Bots — management CRUD + Bot API
 *
 * Management endpoints (owner only):
 *   GET    /communities/:id/bots
 *   POST   /communities/:id/bots
 *   PATCH  /communities/:id/bots/:botId
 *   DELETE /communities/:id/bots/:botId
 *   POST   /communities/:id/bots/:botId/regenerate-token
 *
 * Bot API (authenticated with "Authorization: Bot <token>"):
 *   POST   /bot/v1/messages   — send a message to a channel
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  db, pool,
  communityBotsTable, communityMembersTable, communityChannelsTable,
  communityMessagesTable, communitiesTable, usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();

// ─── DDL (applied once on startup) ────────────────────────────────────────────

export async function ensureBotsSchema(): Promise<void> {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_bots (
        id            SERIAL PRIMARY KEY,
        community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        bot_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        display_name  VARCHAR(64) NOT NULL,
        avatar_url    TEXT,
        bot_type      VARCHAR(20) NOT NULL DEFAULT 'webhook',
        builtin_kind  VARCHAR(32),
        webhook_url   TEXT,
        webhook_secret TEXT,
        bot_token     TEXT NOT NULL UNIQUE,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS community_bots_community_idx ON community_bots(community_id)`);
  } catch (err) {
    logger.error({ err }, "bots: ensureBotsSchema failed");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateBotToken(): string {
  return `bot_${randomBytes(24).toString("hex")}`;
}

async function isOwner(communityId: number, userId: number): Promise<boolean> {
  const [c] = await db
    .select({ ownerId: communitiesTable.ownerId })
    .from(communitiesTable)
    .where(eq(communitiesTable.id, communityId));
  return c?.ownerId === userId;
}

// ─── Management routes ────────────────────────────────────────────────────────

// GET /communities/:id/bots
router.get("/communities/:id/bots", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwner(id, userId)) { res.status(403).json({ error: "Owner only" }); return; }
    const bots = await db
      .select()
      .from(communityBotsTable)
      .where(eq(communityBotsTable.communityId, id));
    res.json(bots.map(b => ({ ...b, botToken: maskToken(b.botToken) })));
  } catch (err) {
    logger.error({ err }, "bots: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

function maskToken(token: string): string {
  // Show first 12 chars then stars: "bot_a1b2c3d4..." → "bot_a1b2c3d4****"
  return token.slice(0, 16) + "••••••••••••••••";
}

// POST /communities/:id/bots — create a bot
router.post("/communities/:id/bots", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwner(id, userId)) { res.status(403).json({ error: "Owner only" }); return; }

    // Max 10 bots per community
    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM community_bots WHERE community_id = $1`, [id]
    );
    if (Number(countRows[0]?.count ?? 0) >= 10) {
      res.status(400).json({ error: "Max 10 bots per community" }); return;
    }

    const { displayName, botType = "webhook", builtinKind, webhookUrl, webhookSecret } = req.body ?? {};
    if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
      res.status(400).json({ error: "displayName required" }); return;
    }
    if (!["webhook", "builtin"].includes(botType)) {
      res.status(400).json({ error: "Invalid botType" }); return;
    }
    if (botType === "builtin" && builtinKind && !["welcome"].includes(builtinKind)) {
      res.status(400).json({ error: "Invalid builtinKind" }); return;
    }

    const token = generateBotToken();
    const username = `bot_${id}_${randomBytes(6).toString("hex")}`;

    // Create a bot user account so it can author messages
    const [botUser] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash: "!",          // login disabled
        displayName: displayName.trim(),
        isBot: true,
      } as any)
      .returning({ id: usersTable.id });

    // Auto-join the bot as a community member (so its messages are valid)
    await db
      .insert(communityMembersTable)
      .values({ communityId: id, userId: botUser.id })
      .onConflictDoNothing();

    const [bot] = await db
      .insert(communityBotsTable)
      .values({
        communityId: id,
        botUserId: botUser.id,
        displayName: displayName.trim(),
        botType,
        builtinKind: builtinKind ?? null,
        webhookUrl: webhookUrl ?? null,
        webhookSecret: webhookSecret ?? null,
        botToken: token,
        isActive: true,
      })
      .returning();

    // Return full token only on creation
    res.status(201).json({ ...bot, botToken: token });
  } catch (err) {
    logger.error({ err }, "bots: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /communities/:id/bots/:botId — update name/webhook/active
router.patch("/communities/:id/bots/:botId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(req.params.id);
  const botId = Number(req.params.botId);
  if (isNaN(id) || isNaN(botId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwner(id, userId)) { res.status(403).json({ error: "Owner only" }); return; }
    const [bot] = await db.select().from(communityBotsTable)
      .where(and(eq(communityBotsTable.id, botId), eq(communityBotsTable.communityId, id)));
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const { displayName, webhookUrl, webhookSecret, isActive } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim().length === 0) {
        res.status(400).json({ error: "displayName cannot be empty" }); return;
      }
      updates.displayName = displayName.trim();
      // Sync bot user's displayName too
      if (bot.botUserId) {
        await db.update(usersTable).set({ displayName: displayName.trim() }).where(eq(usersTable.id, bot.botUserId));
      }
    }
    if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl || null;
    if (webhookSecret !== undefined) updates.webhookSecret = webhookSecret || null;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const [updated] = await db
      .update(communityBotsTable)
      .set(updates)
      .where(eq(communityBotsTable.id, botId))
      .returning();

    res.json({ ...updated, botToken: maskToken(updated.botToken) });
  } catch (err) {
    logger.error({ err }, "bots: update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /communities/:id/bots/:botId
router.delete("/communities/:id/bots/:botId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(req.params.id);
  const botId = Number(req.params.botId);
  if (isNaN(id) || isNaN(botId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwner(id, userId)) { res.status(403).json({ error: "Owner only" }); return; }
    const [bot] = await db.select().from(communityBotsTable)
      .where(and(eq(communityBotsTable.id, botId), eq(communityBotsTable.communityId, id)));
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    await db.delete(communityBotsTable).where(eq(communityBotsTable.id, botId));
    // Bot user and its messages stay; just the bot record is removed.
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "bots: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /communities/:id/bots/:botId/regenerate-token
router.post("/communities/:id/bots/:botId/regenerate-token", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(req.params.id);
  const botId = Number(req.params.botId);
  if (isNaN(id) || isNaN(botId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwner(id, userId)) { res.status(403).json({ error: "Owner only" }); return; }
    const [bot] = await db.select().from(communityBotsTable)
      .where(and(eq(communityBotsTable.id, botId), eq(communityBotsTable.communityId, id)));
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const newToken = generateBotToken();
    await db.update(communityBotsTable).set({ botToken: newToken }).where(eq(communityBotsTable.id, botId));
    // Return full token once
    res.json({ botToken: newToken });
  } catch (err) {
    logger.error({ err }, "bots: regenerate-token failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Bot API ──────────────────────────────────────────────────────────────────

async function resolveBotAuth(authHeader: string | undefined): Promise<{
  bot: typeof communityBotsTable.$inferSelect;
} | null> {
  if (!authHeader?.startsWith("Bot ")) return null;
  const token = authHeader.slice(4).trim();
  if (!token) return null;
  const [bot] = await db
    .select()
    .from(communityBotsTable)
    .where(and(eq(communityBotsTable.botToken, token), eq(communityBotsTable.isActive, true)));
  return bot ? { bot } : null;
}

// POST /bot/v1/messages — send a message as a bot
router.post("/bot/v1/messages", async (req, res): Promise<void> => {
  const auth = await resolveBotAuth(req.headers.authorization as string | undefined);
  if (!auth) { res.status(401).json({ error: "Invalid bot token" }); return; }

  const { bot } = auth;
  const { channelId, content } = req.body ?? {};
  if (!channelId || isNaN(Number(channelId))) { res.status(400).json({ error: "channelId required" }); return; }
  if (!content || typeof content !== "string" || content.trim().length === 0 || content.trim().length > 4000) {
    res.status(400).json({ error: "content must be 1–4000 chars" }); return;
  }
  if (!bot.botUserId) { res.status(400).json({ error: "Bot has no user account" }); return; }

  try {
    const cid = Number(channelId);
    const [channel] = await db
      .select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, bot.communityId)));
    if (!channel) { res.status(404).json({ error: "Channel not found in this community" }); return; }

    const [msg] = await db
      .insert(communityMessagesTable)
      .values({ channelId: cid, userId: bot.botUserId, content: content.trim() })
      .returning();

    // Broadcast to community members
    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, bot.communityId), eq(communityMembersTable.isBanned, false)));

    const payload = {
      type: "community-message",
      communityId: bot.communityId,
      channelId: cid,
      message: {
        ...msg,
        userId: bot.botUserId,
        username: bot.displayName,
        displayName: bot.displayName,
        avatarUrl: toPublicImageUrl(bot.avatarUrl),
        isBot: true,
      },
    };
    for (const m of members) pushToUser(m.userId, payload);

    res.status(201).json({ ...msg, isBot: true });
  } catch (err) {
    logger.error({ err }, "bots: bot/v1/messages failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Webhook delivery (exported for use in communities route) ─────────────────

export async function deliverWebhooks(
  communityId: number,
  event: Record<string, unknown>,
): Promise<void> {
  try {
    const { rows } = await pool.query<{ webhook_url: string; webhook_secret: string | null }>(
      `SELECT webhook_url, webhook_secret FROM community_bots
       WHERE community_id = $1 AND bot_type = 'webhook' AND is_active = true AND webhook_url IS NOT NULL`,
      [communityId]
    );
    const body = JSON.stringify(event);
    for (const row of rows) {
      fetch(row.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(row.webhook_secret ? { "X-Bot-Secret": row.webhook_secret } : {}),
        },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {}); // fire-and-forget
    }
  } catch { /* non-fatal */ }
}

// ─── Built-in welcome bot trigger (exported for use in communities route) ─────

export async function triggerWelcomeBot(
  communityId: number,
  joiningUser: { id: number; displayName: string; username: string },
): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: number; bot_user_id: number | null; display_name: string; avatar_url: string | null;
    }>(
      `SELECT id, bot_user_id, display_name, avatar_url FROM community_bots
       WHERE community_id = $1 AND bot_type = 'builtin' AND builtin_kind = 'welcome' AND is_active = true
       LIMIT 1`,
      [communityId]
    );
    const bot = rows[0];
    if (!bot?.bot_user_id) return;

    // Pick the first text channel
    const { rows: channels } = await pool.query<{ id: number }>(
      `SELECT id FROM community_channels
       WHERE community_id = $1 AND type = 'text' AND is_archived = false
       ORDER BY position ASC LIMIT 1`,
      [communityId]
    );
    const channel = channels[0];
    if (!channel) return;

    const content = `👋 مرحباً بـ **${joiningUser.displayName}** في المجتمع!`;
    const [msg] = await db
      .insert(communityMessagesTable)
      .values({ channelId: channel.id, userId: bot.bot_user_id, content })
      .returning();

    // Broadcast
    const { rows: members } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM community_members WHERE community_id = $1 AND is_banned = false`,
      [communityId]
    );
    const payload = {
      type: "community-message",
      communityId,
      channelId: channel.id,
      message: {
        ...msg,
        userId: bot.bot_user_id,
        username: bot.display_name,
        displayName: bot.display_name,
        avatarUrl: toPublicImageUrl(bot.avatar_url),
        isBot: true,
      },
    };
    for (const m of members) pushToUser(m.user_id, payload);
  } catch (err) {
    logger.error({ err }, "bots: welcome trigger failed");
  }
}

export default router;
