/**
 * Communities — Persistent Gaming Hubs
 *
 * GET    /api/communities               list public communities (search/filter)
 * GET    /api/communities/mine          communities the caller belongs to
 * POST   /api/communities               create a community
 * GET    /api/communities/:slug         get a community (by slug or numeric id)
 * PATCH  /api/communities/:id           update community (owner)
 * DELETE /api/communities/:id           delete community (owner)
 *
 * POST   /api/communities/:id/join      join
 * POST   /api/communities/:id/leave     leave
 * POST   /api/communities/:id/kick/:userId    kick (owner / mod)
 * POST   /api/communities/:id/ban/:userId     ban (owner / mod)
 * POST   /api/communities/:id/unban/:userId   unban (owner / mod)
 * GET    /api/communities/:id/members   list members (paginated)
 *
 * GET    /api/communities/:id/channels           list channels
 * POST   /api/communities/:id/channels           create channel
 * PATCH  /api/communities/:id/channels/:cid      update channel
 * DELETE /api/communities/:id/channels/:cid      delete channel
 *
 * GET    /api/communities/:id/channels/:cid/messages         get messages
 * POST   /api/communities/:id/channels/:cid/messages         send message
 * DELETE /api/communities/:id/channels/:cid/messages/:mid    delete message
 *
 * GET    /api/communities/:id/roles              list roles
 * POST   /api/communities/:id/roles              create role
 * PATCH  /api/communities/:id/roles/:rid         update role
 * DELETE /api/communities/:id/roles/:rid         delete role
 * POST   /api/communities/:id/members/:uid/roles/:rid   assign role
 * DELETE /api/communities/:id/members/:uid/roles/:rid   remove role
 *
 * GET    /api/communities/:id/mod-log            mod log (owner / mod)
 * POST   /api/communities/:id/boost              boost community
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, ilike, desc, asc, sql, ne, lt } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  communitiesTable,
  communityChannelsTable,
  communityMembersTable,
  communityMessagesTable,
  communityRolesTable,
  communityMemberRolesTable,
  communityBoostsTable,
  communityModLogTable,
  communityStickersTable,
  storedImagesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { pushToUser, broadcastAll, getOnlineUserIds } from "../ws/signaling";
import { logger } from "../lib/logger";
import { deliverWebhooks, triggerWelcomeBot } from "./bots";
import {
  addCommunityVoicePresence,
  removeCommunityVoicePresenceForChannel,
  getCommunityVoiceParticipants,
  getCommunityVoicePresenceSnapshot,
  updateCommunityVoiceCameraState,
  updateCommunityVoiceScreenShareState,
} from "../lib/community-voice-presence";

// ─── Premium DDL ──────────────────────────────────────────────────────────────

export async function ensureCommunityPremiumTables(): Promise<void> {
  await pool.query(`
    -- Extend community_roles with Discord-style columns
    ALTER TABLE community_roles ADD COLUMN IF NOT EXISTS display_separately BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE community_roles ADD COLUMN IF NOT EXISTS mentionable BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE community_roles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

    -- Seed @everyone for communities that lack a default role
    INSERT INTO community_roles (community_id, name, color, position, permissions, is_default, mentionable, display_separately)
    SELECT c.id, '@everyone', '#99aab5', -1, '{"can_post":true,"can_send_media":true}'::jsonb, true, false, false
    FROM communities c
    WHERE NOT EXISTS (
      SELECT 1 FROM community_roles cr WHERE cr.community_id = c.id AND cr.is_default = true
    );

    CREATE TABLE IF NOT EXISTS community_polls (
      id SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      channel_id INTEGER REFERENCES community_channels(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      ends_at TIMESTAMPTZ,
      is_closed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_poll_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_index INTEGER NOT NULL CHECK (option_index >= 0),
      voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(poll_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS community_invites (
      id SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE community_members ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;
    -- Advanced channel types
    ALTER TABLE community_channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
    -- Channel-level role permission overrides
    CREATE TABLE IF NOT EXISTS channel_role_permissions (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      role_id   INTEGER NOT NULL REFERENCES community_roles(id)    ON DELETE CASCADE,
      allow JSONB NOT NULL DEFAULT '{}',
      deny  JSONB NOT NULL DEFAULT '{}',
      UNIQUE(channel_id, role_id)
    );

    -- ── Welcome & Rules ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_welcome (
      community_id INTEGER PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
      welcome_message TEXT,
      rules_text TEXT,
      requires_agreement BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE community_members ADD COLUMN IF NOT EXISTS has_agreed_rules BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE community_members ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;

    -- ── AutoMod ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_automod (
      community_id INTEGER PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
      banned_words TEXT[] NOT NULL DEFAULT '{}',
      block_external_links BOOLEAN NOT NULL DEFAULT false,
      max_emoji_per_message INTEGER NOT NULL DEFAULT 0,
      block_caps BOOLEAN NOT NULL DEFAULT false,
      block_invites BOOLEAN NOT NULL DEFAULT false
    );

    -- ── Events ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_events (
      id SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ,
      channel_id INTEGER REFERENCES community_channels(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'attending',
      PRIMARY KEY(event_id, user_id)
    );

    -- ── Badges ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_badges (
      id SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      icon_emoji VARCHAR(10) NOT NULL DEFAULT '🏅',
      description TEXT,
      type VARCHAR(20) NOT NULL DEFAULT 'manual',
      auto_trigger VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS member_badges (
      id SERIAL PRIMARY KEY,
      badge_id INTEGER NOT NULL REFERENCES community_badges(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(badge_id, user_id)
    );

    -- ── Threads ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_message_threads (
      id SERIAL PRIMARY KEY,
      parent_message_id INTEGER NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      title VARCHAR(200),
      is_closed BOOLEAN NOT NULL DEFAULT false,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_thread_messages (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES community_message_threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Premium Channel Types ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS community_lfg_posts (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game VARCHAR(100) NOT NULL,
      roles_needed TEXT[] NOT NULL DEFAULT '{}',
      skill_level VARCHAR(50),
      note TEXT,
      slots INTEGER NOT NULL DEFAULT 1,
      filled_slots INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_clip_posts (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      upvotes INTEGER NOT NULL DEFAULT 0,
      weekly_winner BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_clip_votes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clip_id INTEGER NOT NULL REFERENCES community_clip_posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, clip_id)
    );
    CREATE TABLE IF NOT EXISTS community_forum_posts (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      is_resolved BOOLEAN NOT NULL DEFAULT false,
      upvotes INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_forum_replies (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES community_forum_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS community_forum_votes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES community_forum_posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS community_coaching_requests (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      game VARCHAR(100) NOT NULL,
      rank VARCHAR(80),
      availability TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Visual Customization ───────────────────────────────────────────────────
    ALTER TABLE communities ADD COLUMN IF NOT EXISTS theme_color    VARCHAR(7);
    ALTER TABLE communities ADD COLUMN IF NOT EXISTS badge_frame    VARCHAR(32);
    ALTER TABLE communities ADD COLUMN IF NOT EXISTS banner_is_animated BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE community_channels ADD COLUMN IF NOT EXISTS icon_emoji VARCHAR(8);

    CREATE TABLE IF NOT EXISTS community_stickers (
      id           SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      name         VARCHAR(32) NOT NULL,
      image_key    TEXT NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  logger.info("communities: premium tables ensured");
}

const router = Router();

// ─── In-memory stage tracking ─────────────────────────────────────────────────
/** channelId → Set of userIds who have raised their hand */
const stageHandsMap = new Map<number, Set<number>>();
/** channelId → Set of approved speaker userIds */
const stageSpeakersMap = new Map<number, Set<number>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function resolveCommunity(param: string) {
  const numericId = parseInt(param, 10);
  if (!isNaN(numericId)) {
    return db.select().from(communitiesTable).where(eq(communitiesTable.id, numericId)).then(r => r[0] ?? null);
  }
  return db.select().from(communitiesTable).where(eq(communitiesTable.slug, param)).then(r => r[0] ?? null);
}

async function getMembership(communityId: number, userId: number) {
  const [m] = await db
    .select()
    .from(communityMembersTable)
    .where(and(eq(communityMembersTable.communityId, communityId), eq(communityMembersTable.userId, userId)));
  return m ?? null;
}

/**
 * Checks whether a user may access a (potentially private) channel in a community.
 * Returns null on success, or an HTTP error shape {status, error} if access is denied.
 * Also returns the channel row so callers don't have to re-fetch it.
 */
async function assertChannelAccess(
  communityId: number,
  channelId: number,
  userId: number,
): Promise<{ denied: true; status: number; error: string } | { denied: false; channel: typeof communityChannelsTable.$inferSelect }> {
  const [channel] = await db
    .select()
    .from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.id, channelId), eq(communityChannelsTable.communityId, communityId)));
  if (!channel) return { denied: true, status: 404, error: "Channel not found" };
  if (channel.isPrivate && !await isOwnerOrMod(communityId, userId)) {
    const { rows } = await pool.query(
      `SELECT 1 FROM channel_role_permissions crp
       JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
       JOIN community_members cm ON cm.id = cmr.member_id
       WHERE cm.user_id = $1 AND cm.community_id = $2 AND crp.channel_id = $3
         AND cm.is_banned = false AND (crp.allow->>'can_view')::boolean IS TRUE
       LIMIT 1`,
      [userId, communityId, channelId]
    );
    if (rows.length === 0) return { denied: true, status: 403, error: "Forbidden" };
  }
  return { denied: false, channel };
}

/**
 * Returns the user IDs of all non-banned community members who are authorized
 * to view the given channel. For public channels this is every member; for
 * private channels this is owners/mods plus members with a role that grants can_view.
 */
async function getChannelAuthorizedRecipients(communityId: number, channelId: number): Promise<number[]> {
  // Fetch channel to check privacy
  const [ch] = await db
    .select({ isPrivate: communityChannelsTable.isPrivate })
    .from(communityChannelsTable)
    .where(and(eq(communityChannelsTable.id, channelId), eq(communityChannelsTable.communityId, communityId)));
  if (!ch) return [];

  if (!ch.isPrivate) {
    // Public — all non-banned members
    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, communityId), eq(communityMembersTable.isBanned, false)));
    return members.map(m => m.userId);
  }

  // Private — owners/mods OR members with role-based can_view on this channel
  const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, communityId));
  const ownerId = community?.ownerId ?? -1;

  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT DISTINCT cm.user_id
     FROM community_members cm
     WHERE cm.community_id = $1 AND cm.is_banned = false AND (
       -- owner always sees all
       cm.user_id = $2
       -- mod roles (is_admin, can_kick, can_ban, can_manage_channels)
       OR EXISTS (
         SELECT 1 FROM community_member_roles cmr
         JOIN community_roles cr ON cr.id = cmr.role_id
         WHERE cmr.member_id = cm.id
           AND ((cr.permissions->>'is_admin')::boolean IS TRUE
             OR (cr.permissions->>'can_kick')::boolean IS TRUE
             OR (cr.permissions->>'can_ban')::boolean IS TRUE
             OR (cr.permissions->>'can_manage_channels')::boolean IS TRUE)
       )
       -- role-based can_view on this channel
       OR EXISTS (
         SELECT 1 FROM channel_role_permissions crp
         JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
         WHERE cmr.member_id = cm.id AND crp.channel_id = $3
           AND (crp.allow->>'can_view')::boolean IS TRUE
       )
     )`,
    [communityId, ownerId, channelId]
  );
  return rows.map(r => r.user_id);
}

/**
 * Returns 403 if the community requires rules agreement and the calling user has not agreed.
 * Returns null if the check passes (posting is allowed).
 */
async function assertRulesAgreed(communityId: number, userId: number): Promise<{ status: number; error: string } | null> {
  const { rows: wcRows } = await pool.query<{ requires_agreement: boolean }>(
    `SELECT requires_agreement FROM community_welcome WHERE community_id = $1 LIMIT 1`, [communityId]
  );
  if (!wcRows[0]?.requires_agreement) return null; // No agreement required
  const { rows: agrRows } = await pool.query<{ has_agreed_rules: boolean }>(
    `SELECT has_agreed_rules FROM community_members WHERE community_id = $1 AND user_id = $2 LIMIT 1`,
    [communityId, userId]
  );
  if (agrRows[0]?.has_agreed_rules) return null;
  return { status: 403, error: "Must agree to community rules before posting" };
}

async function isOwnerOrMod(communityId: number, userId: number): Promise<boolean> {
  const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, communityId));
  if (!community) return false;
  if (community.ownerId === userId) return true;
  // Check if the user has a role with can_kick or can_ban permission (mod)
  const membership = await getMembership(communityId, userId);
  if (!membership || membership.isBanned) return false;
  const roles = await db
    .select({ permissions: communityRolesTable.permissions })
    .from(communityMemberRolesTable)
    .innerJoin(communityRolesTable, eq(communityMemberRolesTable.roleId, communityRolesTable.id))
    .where(eq(communityMemberRolesTable.memberId, membership.id));
  return roles.some((r) => {
    const p = r.permissions as Record<string, boolean> ?? {};
    return p.is_admin === true || p.can_kick === true || p.can_ban === true || p.can_manage_channels === true;
  });
}

/** Check if userId has a specific community permission (or is_admin / owner).
 *  Effective permissions = union of user's assigned roles + the @everyone (is_default) role. */
async function hasPermission(communityId: number, userId: number, permission: string): Promise<boolean> {
  const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, communityId));
  if (!community) return false;
  if (community.ownerId === userId) return true;
  const membership = await getMembership(communityId, userId);
  if (!membership || membership.isBanned) return false;

  // Explicitly assigned roles
  const assigned = await db
    .select({ permissions: communityRolesTable.permissions })
    .from(communityMemberRolesTable)
    .innerJoin(communityRolesTable, eq(communityMemberRolesTable.roleId, communityRolesTable.id))
    .where(eq(communityMemberRolesTable.memberId, membership.id));

  // @everyone (is_default=true) applies to every member automatically
  const defaultRoles = await db
    .select({ permissions: communityRolesTable.permissions })
    .from(communityRolesTable)
    .where(and(eq(communityRolesTable.communityId, communityId), eq(communityRolesTable.isDefault, true)));

  return [...assigned, ...defaultRoles].some((r) => {
    const p = r.permissions as Record<string, boolean> ?? {};
    return p.is_admin === true || p[permission] === true;
  });
}

function serializeUser(u: { id: number; displayName: string; username: string; avatarUrl: string | null }) {
  return { id: u.id, displayName: u.displayName, username: u.username, avatarUrl: toPublicImageUrl(u.avatarUrl) };
}

async function logMod(communityId: number, actorId: number, targetId: number | null, action: string, detail?: string) {
  await db.insert(communityModLogTable).values({ communityId, actorId, targetId: targetId ?? null, action, detail: detail ?? null });
}

// ─── List / Search ────────────────────────────────────────────────────────────

router.get("/communities", requireAuth, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const gameTag = typeof req.query.gameTag === "string" ? req.query.gameTag.trim() : "";
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  try {
    const conditions = [eq(communitiesTable.privacy, "public")];
    if (search) conditions.push(ilike(communitiesTable.name, `%${search}%`));
    if (gameTag) conditions.push(eq(communitiesTable.gameTag, gameTag));

    const communities = await db
      .select()
      .from(communitiesTable)
      .where(and(...conditions))
      .orderBy(desc(communitiesTable.memberCount), desc(communitiesTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(communities);
  } catch (err) {
    logger.error({ err }, "communities: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/communities/mine", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  try {
    const rows = await db
      .select({ community: communitiesTable })
      .from(communityMembersTable)
      .innerJoin(communitiesTable, eq(communityMembersTable.communityId, communitiesTable.id))
      .where(and(eq(communityMembersTable.userId, userId), eq(communityMembersTable.isBanned, false)))
      .orderBy(asc(communityMembersTable.joinedAt));

    res.json(rows.map(r => r.community));
  } catch (err) {
    logger.error({ err }, "communities: mine failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────

router.post("/communities", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { name, description, gameTag, privacy } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    res.status(400).json({ error: "name must be 2–100 characters" });
    return;
  }

  const slug = slugify(name.trim());
  if (!slug) {
    res.status(400).json({ error: "Community name produces an empty slug" });
    return;
  }

  const privacyVal = privacy === "invite_only" ? "invite_only" : "public";

  try {
    // Enforce 1 owned community per user (can be relaxed later)
    const [existing] = await db
      .select({ id: communitiesTable.id })
      .from(communitiesTable)
      .where(eq(communitiesTable.ownerId, userId));
    if (existing) {
      res.status(409).json({ error: "You already own a community" });
      return;
    }

    const [community] = await db
      .insert(communitiesTable)
      .values({
        ownerId: userId,
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        gameTag: gameTag?.trim() || null,
        privacy: privacyVal,
        memberCount: 1,
      })
      .returning();

    // Auto-create default channels
    await db.insert(communityChannelsTable).values([
      { communityId: community.id, name: "general",      type: "text",  position: 0 },
      { communityId: community.id, name: "announcements", type: "text",  position: 1 },
      { communityId: community.id, name: "voice-lounge", type: "voice", position: 2 },
    ]);

    // Auto-add owner as member
    await db.insert(communityMembersTable).values({ communityId: community.id, userId });

    // Auto-create @everyone default role
    await db.insert(communityRolesTable).values({
      communityId: community.id,
      name: "@everyone",
      color: "#99aab5",
      position: -1,
      permissions: { can_post: true, can_send_media: true } as any,
      isDefault: true,
    } as any);

    res.status(201).json(community);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A community with that name already exists" });
      return;
    }
    logger.error({ err }, "communities: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Invite lookup (must be before /:slug to avoid swallowing) ───────────────

router.get("/communities/invite/:code", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.params;
  try {
    const { rows } = await pool.query<{
      id: number; community_id: number; code: string; max_uses: number | null;
      uses: number; expires_at: string | null; created_at: string;
      community_name: string; community_slug: string; member_count: number; game_tag: string | null;
    }>(
      `SELECT ci.*, c.name AS community_name, c.slug AS community_slug,
              c.member_count, c.game_tag
       FROM community_invites ci
       JOIN communities c ON c.id = ci.community_id
       WHERE ci.code = $1`, [code]
    );
    if (!rows[0]) { res.status(404).json({ error: "Invite not found" }); return; }
    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      res.status(410).json({ error: "Invite expired" }); return;
    }
    if (inv.max_uses !== null && inv.uses >= inv.max_uses) {
      res.status(410).json({ error: "Invite full" }); return;
    }
    res.json({
      code: inv.code,
      communityId: inv.community_id,
      communityName: inv.community_name,
      communitySlug: inv.community_slug,
      memberCount: inv.member_count,
      gameTag: inv.game_tag,
      uses: inv.uses,
      maxUses: inv.max_uses,
      expiresAt: inv.expires_at,
    });
  } catch (err) {
    logger.error({ err }, "communities: invite lookup failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/invite/:code/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { code } = req.params;
  try {
    const { rows } = await pool.query<{ id: number; community_id: number; max_uses: number | null; uses: number; expires_at: string | null }>(
      `SELECT * FROM community_invites WHERE code = $1`, [code]
    );
    if (!rows[0]) { res.status(404).json({ error: "Invite not found" }); return; }
    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      res.status(410).json({ error: "Invite expired" }); return;
    }
    if (inv.max_uses !== null && inv.uses >= inv.max_uses) {
      res.status(410).json({ error: "Invite full" }); return;
    }
    const cid = inv.community_id;
    const existing = await getMembership(cid, userId);
    if (existing) {
      if (existing.isBanned) { res.status(403).json({ error: "You are banned from this community" }); return; }
      res.status(409).json({ error: "Already a member" }); return;
    }
    await db.insert(communityMembersTable).values({ communityId: cid, userId });
    await db.update(communitiesTable).set({ memberCount: sql`${communitiesTable.memberCount} + 1` }).where(eq(communitiesTable.id, cid));
    await pool.query(`UPDATE community_invites SET uses = uses + 1 WHERE code = $1`, [code]);
    await logMod(cid, userId, userId, "join_invite", String(code));
    res.status(201).json({ ok: true, communityId: cid });
  } catch (err) {
    logger.error({ err }, "communities: invite join failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Get by slug / id ─────────────────────────────────────────────────────────

router.get("/communities/:slug", requireAuth, async (req, res): Promise<void> => {
  try {
    const community = await resolveCommunity(String(req.params.slug));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }

    const userId = req.auth!.userId;
    const membership = await getMembership(community.id, userId);
    const isOwner = community.ownerId === userId;
    const isMod = isOwner || await isOwnerOrMod(community.id, userId);

    const channels = await db
      .select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.communityId, community.id), eq(communityChannelsTable.isArchived, false)))
      .orderBy(asc(communityChannelsTable.position));

    // Filter private channels: owner/mods see all; others see only channels they have explicit can_view access to
    let visibleChannels: typeof channels;
    if (isMod) {
      visibleChannels = channels;
    } else {
      const { rows: allowed } = await pool.query<{ channel_id: number }>(
        `SELECT DISTINCT crp.channel_id
         FROM channel_role_permissions crp
         JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
         JOIN community_members cm ON cm.id = cmr.member_id
         WHERE cm.user_id = $1 AND cm.community_id = $2 AND cm.is_banned = false
           AND (crp.allow->>'can_view')::boolean IS TRUE`, [userId, community.id]
      );
      const allowedIds = new Set(allowed.map((r) => r.channel_id));
      visibleChannels = channels.filter((ch: any) => !ch.isPrivate || allowedIds.has(ch.id));
    }

    res.json({
      ...community,
      channels: visibleChannels,
      isMember: !!membership && !membership.isBanned,
      isOwner,
      isMod,
    });
  } catch (err) {
    logger.error({ err }, "communities: get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Update ───────────────────────────────────────────────────────────────────

router.patch("/communities/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, description, gameTag, privacy, slug: rawSlug } = req.body ?? {};
    const updates: Partial<typeof communitiesTable.$inferInsert> = { updatedAt: new Date() };
    if (name && typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 100) {
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (gameTag !== undefined) updates.gameTag = gameTag?.trim() || null;
    if (privacy === "public" || privacy === "invite_only") updates.privacy = privacy;

    if (rawSlug !== undefined) {
      const candidateSlug = slugify(String(rawSlug ?? ""));
      if (candidateSlug.length < 2 || candidateSlug.length > 80) {
        res.status(400).json({ error: "Slug must be 2–80 characters after normalisation" });
        return;
      }
      if (candidateSlug !== community.slug) {
        const [conflict] = await db
          .select({ id: communitiesTable.id })
          .from(communitiesTable)
          .where(and(eq(communitiesTable.slug, candidateSlug), ne(communitiesTable.id, id)));
        if (conflict) {
          res.status(409).json({ error: "Slug is already taken" });
          return;
        }
        updates.slug = candidateSlug;
      }
    }

    const [updated] = await db.update(communitiesTable).set(updates).where(eq(communitiesTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "communities: update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/communities/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(communitiesTable).where(eq(communitiesTable.id, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Join / Leave ─────────────────────────────────────────────────────────────

router.post("/communities/:id/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }

    // Invite-only communities cannot be joined without an invite
    if (community.privacy === "invite_only") {
      res.status(403).json({ error: "This community is invite-only" });
      return;
    }

    const existing = await getMembership(id, userId);
    if (existing) {
      if (existing.isBanned) { res.status(403).json({ error: "You are banned from this community" }); return; }
      res.status(409).json({ error: "Already a member" });
      return;
    }

    await db.insert(communityMembersTable).values({ communityId: id, userId });
    await db.update(communitiesTable).set({ memberCount: sql`${communitiesTable.memberCount} + 1` }).where(eq(communitiesTable.id, id));
    await logMod(id, userId, userId, "join");

    // Trigger welcome bot (best-effort)
    const [joiner] = await db.select({ id: usersTable.id, displayName: usersTable.displayName, username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId));
    if (joiner) triggerWelcomeBot(id, joiner).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: join failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId === userId) { res.status(400).json({ error: "Owner cannot leave — transfer or delete the community" }); return; }

    // Only decrement if a real (non-banned) member row was removed
    const deleted = await db.delete(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.userId, userId), eq(communityMembersTable.isBanned, false)))
      .returning({ id: communityMembersTable.id });
    if (deleted.length > 0) {
      await db.update(communitiesTable).set({ memberCount: sql`GREATEST(${communitiesTable.memberCount} - 1, 0)` }).where(eq(communitiesTable.id, id));
    }
    await logMod(id, userId, userId, "leave");

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: leave failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Kick / Ban / Unban ───────────────────────────────────────────────────────

router.post("/communities/:id/kick/:userId", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const targetId = Number(String(req.params.userId));
  if (isNaN(id) || isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    if (!await hasPermission(id, actorId, "can_kick")) { res.status(403).json({ error: "Forbidden" }); return; }
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (community?.ownerId === targetId) { res.status(400).json({ error: "Cannot kick the owner" }); return; }

    // Only decrement if we actually removed a non-banned member row
    const kicked = await db.delete(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.userId, targetId), eq(communityMembersTable.isBanned, false)))
      .returning({ id: communityMembersTable.id });
    if (kicked.length > 0) {
      await db.update(communitiesTable).set({ memberCount: sql`GREATEST(${communitiesTable.memberCount} - 1, 0)` }).where(eq(communitiesTable.id, id));
    }
    await logMod(id, actorId, targetId, "kick");

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: kick failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/ban/:userId", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const targetId = Number(String(req.params.userId));
  if (isNaN(id) || isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    if (!await hasPermission(id, actorId, "can_ban")) { res.status(403).json({ error: "Forbidden" }); return; }
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (community?.ownerId === targetId) { res.status(400).json({ error: "Cannot ban the owner" }); return; }

    // Upsert membership with isBanned = true; only decrement count on real state transition
    const existing = await getMembership(id, targetId);
    if (existing) {
      await db.update(communityMembersTable)
        .set({ isBanned: true })
        .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.userId, targetId)));
      // Only decrement if the member was previously active (not already banned)
      if (!existing.isBanned) {
        await db.update(communitiesTable)
          .set({ memberCount: sql`GREATEST(${communitiesTable.memberCount} - 1, 0)` })
          .where(eq(communitiesTable.id, id));
      }
    } else {
      // Never counted as a member — just pre-emptively record the ban
      await db.insert(communityMembersTable).values({ communityId: id, userId: targetId, isBanned: true });
    }
    await logMod(id, actorId, targetId, "ban");
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: ban failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/unban/:userId", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const targetId = Number(String(req.params.userId));
  if (isNaN(id) || isNaN(targetId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    if (!await hasPermission(id, actorId, "can_ban")) { res.status(403).json({ error: "Forbidden" }); return; }
    // Only unban if a banned row actually exists
    const existing = await getMembership(id, targetId);
    if (!existing || !existing.isBanned) {
      res.status(404).json({ error: "User is not banned in this community" });
      return;
    }
    // Clear the ban flag — preserve the membership row so history is intact
    await db.update(communityMembersTable)
      .set({ isBanned: false })
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.userId, targetId)));
    // Restore memberCount (ban had decremented it)
    await db.update(communitiesTable)
      .set({ memberCount: sql`${communitiesTable.memberCount} + 1` })
      .where(eq(communitiesTable.id, id));
    await logMod(id, actorId, targetId, "unban");
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: unban failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Members ──────────────────────────────────────────────────────────────────

router.get("/communities/:id/members", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  try {
    const rows = await db
      .select({
        memberId: communityMembersTable.id,
        userId: communityMembersTable.userId,
        joinedAt: communityMembersTable.joinedAt,
        isBanned: communityMembersTable.isBanned,
        displayName: usersTable.displayName,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(communityMembersTable)
      .innerJoin(usersTable, eq(communityMembersTable.userId, usersTable.id))
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)))
      .orderBy(asc(communityMembersTable.joinedAt))
      .limit(limit)
      .offset(offset);

    res.json(rows.map(r => ({ ...r, avatarUrl: toPublicImageUrl(r.avatarUrl) })));
  } catch (err) {
    logger.error({ err }, "communities: members failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /communities/:id/online-members — which member userIds have an active WS connection
router.get("/communities/:id/online-members", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const rows = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));
    const allIds = rows.map(r => r.userId);
    res.json({ onlineIds: getOnlineUserIds(allIds) });
  } catch (err) {
    logger.error({ err }, "communities: online-members failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Channels ─────────────────────────────────────────────────────────────────

router.get("/communities/:id/channels", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const channels = await db
      .select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.isArchived, false)))
      .orderBy(asc(communityChannelsTable.position));

    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    if (community?.ownerId === userId) { res.json(channels); return; }

    // Check if user has is_admin
    const isAdmin = await hasPermission(id, userId, "is_admin");
    if (isAdmin) { res.json(channels); return; }

    // Filter private channels: only show if user has an allowed role in channel_role_permissions
    const { rows: allowed } = await pool.query<{ channel_id: number }>(
      `SELECT DISTINCT crp.channel_id
       FROM channel_role_permissions crp
       JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
       JOIN community_members cm ON cm.id = cmr.member_id
       WHERE cm.user_id = $1 AND cm.community_id = $2 AND cm.is_banned = false
         AND (crp.allow->>'can_view')::boolean IS TRUE`, [userId, id]
    );
    const allowedChannelIds = new Set(allowed.map(r => r.channel_id));

    const visible = channels.filter((ch: any) => !ch.isPrivate || allowedChannelIds.has(ch.id));
    res.json(visible);
  } catch (err) {
    logger.error({ err }, "communities: channels list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/channels", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Channel creation is owner-only — mods cannot add channels
    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, type, isPrivate } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) {
      res.status(400).json({ error: "name must be 1–100 characters" });
      return;
    }
    const validTypes = ["text", "voice", "announcement", "stage", "lfg", "clips", "coaching", "forum"] as const;
    const channelType = validTypes.includes(type as any) ? type as string : "text";
    const [maxPos] = await db
      .select({ pos: sql<number>`COALESCE(MAX(${communityChannelsTable.position}), -1)` })
      .from(communityChannelsTable)
      .where(eq(communityChannelsTable.communityId, id));

    const [channel] = await db
      .insert(communityChannelsTable)
      .values({ communityId: id, name: name.trim().toLowerCase().replace(/\s+/g, "-"), type: channelType, position: (maxPos?.pos ?? -1) + 1, isPrivate: !!isPrivate } as any)
      .returning();
    res.status(201).json(channel);
  } catch (err) {
    logger.error({ err }, "communities: channel create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/communities/:id/channels/:cid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Caller must have can_manage_channels (or be owner — owner short-circuits hasPermission)
    if (!await hasPermission(id, userId, "can_manage_channels")) { res.status(403).json({ error: "Forbidden" }); return; }

    // Determine if the caller is the community owner
    const [community] = await db
      .select({ ownerId: communitiesTable.ownerId })
      .from(communitiesTable)
      .where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    const isOwner = community.ownerId === userId;

    const { name, position, slowmodeSeconds, isPrivate, type, iconEmoji } = req.body ?? {};

    // Structural fields (rename, reorder, privacy toggle, type change) are owner-only.
    // Mods with can_manage_channels may only adjust slowmodeSeconds.
    if (!isOwner && (name !== undefined || position !== undefined || isPrivate !== undefined || type !== undefined || iconEmoji !== undefined)) {
      res.status(403).json({ error: "Only the community owner can rename, reorder, or change channel type/privacy" });
      return;
    }

    const updates: Partial<typeof communityChannelsTable.$inferInsert> = {};
    if (name && typeof name === "string") updates.name = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (typeof position === "number") updates.position = position;
    if (typeof slowmodeSeconds === "number") {
      if (slowmodeSeconds < 0 || slowmodeSeconds > 21600) {
        res.status(400).json({ error: "slowmodeSeconds must be between 0 and 21600" });
        return;
      }
      updates.slowmodeSeconds = slowmodeSeconds;
    }
    if (typeof isPrivate === "boolean") (updates as any).isPrivate = isPrivate;
    const validTypes = ["text", "voice", "announcement", "stage", "lfg", "clips", "coaching", "forum"];
    if (typeof type === "string" && validTypes.includes(type)) (updates as any).type = type;
    if (iconEmoji === null) (updates as any).iconEmoji = null;
    else if (typeof iconEmoji === "string" && iconEmoji.trim()) (updates as any).iconEmoji = iconEmoji.trim().slice(0, 8);

    const [updated] = await db.update(communityChannelsTable).set(updates).where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id))).returning();
    if (!updated) { res.status(404).json({ error: "Channel not found" }); return; }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "communities: channel update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/channels/:cid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Channel deletion is owner-only — mods cannot remove channels
    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.update(communityChannelsTable).set({ isArchived: true }).where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: channel delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

router.get("/communities/:id/channels/:cid/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }

    // Verify channel belongs to this community (prevents cross-community IDOR)
    const [channel] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

    // Private-channel message read protection — use raw query since is_private is added via DDL
    const { rows: [channelMeta] } = await pool.query<{ is_private: boolean }>(
      `SELECT COALESCE(is_private, false) AS is_private FROM community_channels WHERE id = $1`, [cid]
    );
    if (channelMeta?.is_private && !await isOwnerOrMod(id, userId)) {
      const { rows } = await pool.query(
        `SELECT 1 FROM channel_role_permissions crp
         JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
         JOIN community_members cm ON cm.id = cmr.member_id
         WHERE cm.user_id = $1 AND cm.community_id = $2 AND crp.channel_id = $3
           AND cm.is_banned = false AND (crp.allow->>'can_view')::boolean IS TRUE
         LIMIT 1`,
        [userId, id, cid]
      );
      if (rows.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    const before = req.query.before ? Number(req.query.before) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const conditions = [eq(communityMessagesTable.channelId, cid), eq(communityMessagesTable.isDeleted, false)];
    if (before !== null && !isNaN(before)) {
      conditions.push(lt(communityMessagesTable.id, before));
    }

    const rows = await db
      .select({
        id: communityMessagesTable.id,
        channelId: communityMessagesTable.channelId,
        content: communityMessagesTable.content,
        isPinned: communityMessagesTable.isPinned,
        createdAt: communityMessagesTable.createdAt,
        updatedAt: communityMessagesTable.updatedAt,
        userId: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(communityMessagesTable)
      .innerJoin(usersTable, eq(communityMessagesTable.userId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(communityMessagesTable.id))
      .limit(limit);

    res.json(rows.reverse().map(r => ({ ...r, avatarUrl: toPublicImageUrl(r.avatarUrl) })));
  } catch (err) {
    logger.error({ err }, "communities: messages list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/channels/:cid/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    if (!await hasPermission(id, userId, "can_post")) { res.status(403).json({ error: "You don't have permission to post messages" }); return; }

    // Verify channel belongs to this community (prevents cross-community IDOR)
    const [channel] = await db.select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

    // Private-channel write protection — must have can_view role permission (or be owner/mod)
    if (channel.isPrivate && !await isOwnerOrMod(id, userId)) {
      const { rows: accessRows } = await pool.query(
        `SELECT 1 FROM channel_role_permissions crp
         JOIN community_member_roles cmr ON cmr.role_id = crp.role_id
         JOIN community_members cm ON cm.id = cmr.member_id
         WHERE cm.user_id = $1 AND cm.community_id = $2 AND crp.channel_id = $3
           AND cm.is_banned = false AND (crp.allow->>'can_view')::boolean IS TRUE
         LIMIT 1`,
        [userId, id, cid]
      );
      if (accessRows.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    // Announcement channels: only owner / mods may post
    if ((channel as any).type === "announcement") {
      const canPost = await isOwnerOrMod(id, userId);
      if (!canPost) { res.status(403).json({ error: "Only moderators can post in announcement channels" }); return; }
    }

    // Slow-mode: check time since user's last message in this channel
    if ((channel.slowmodeSeconds ?? 0) > 0) {
      const isPrivileged = await isOwnerOrMod(id, userId);
      if (!isPrivileged) {
        const { rows: lastRows } = await pool.query<{ created_at: string }>(
          `SELECT created_at FROM community_messages
           WHERE channel_id = $1 AND user_id = $2 AND is_deleted = false
           ORDER BY created_at DESC LIMIT 1`, [cid, userId]
        );
        if (lastRows[0]) {
          const elapsed = (Date.now() - new Date(lastRows[0].created_at).getTime()) / 1000;
          const remaining = Math.ceil(channel.slowmodeSeconds - elapsed);
          if (remaining > 0) {
            res.status(429).json({ error: "Slow mode is active", retryAfter: remaining });
            return;
          }
        }
      }
    }

    const { content } = req.body ?? {};
    if (!content || typeof content !== "string" || content.trim().length === 0 || content.trim().length > 4000) {
      res.status(400).json({ error: "content must be 1–4000 characters" });
      return;
    }

    // Rules-agreement enforcement (non-owner/mod only — mods can always post)
    if (!await isOwnerOrMod(id, userId)) {
      const agreementErr = await assertRulesAgreed(id, userId);
      if (agreementErr) { res.status(agreementErr.status).json({ error: agreementErr.error }); return; }
    }

    // AutoMod enforcement (non-owner/mod only)
    const isPrivileged = await isOwnerOrMod(id, userId);
    if (!isPrivileged) {
      const { rows: automodRows } = await pool.query(
        `SELECT * FROM community_automod WHERE community_id = $1 LIMIT 1`, [id]
      );
      if (automodRows[0]) {
        const am = automodRows[0];
        const trimmed = content.trim();
        // Banned words (case-insensitive substring match)
        if (am.banned_words && am.banned_words.length > 0) {
          const lower = trimmed.toLowerCase();
          const hit = (am.banned_words as string[]).find(w => w && lower.includes(w.toLowerCase()));
          if (hit) { res.status(400).json({ error: "automod", reason: "banned_word" }); return; }
        }
        // Block external links
        if (am.block_external_links && /https?:\/\//i.test(trimmed)) {
          res.status(400).json({ error: "automod", reason: "external_link" }); return;
        }
        // Discord invite links
        if (am.block_invites && /discord\.gg\//i.test(trimmed)) {
          res.status(400).json({ error: "automod", reason: "invite_link" }); return;
        }
        // Excessive caps (>70% uppercase letters when message is >10 chars)
        if (am.block_caps && trimmed.length > 10) {
          const letters = trimmed.replace(/[^a-zA-Z]/g, "");
          if (letters.length > 5) {
            const capsRatio = (trimmed.replace(/[^A-Z]/g, "").length) / letters.length;
            if (capsRatio > 0.7) { res.status(400).json({ error: "automod", reason: "excessive_caps" }); return; }
          }
        }
        // Emoji count
        if (am.max_emoji_per_message && am.max_emoji_per_message > 0) {
          const emojiMatches = trimmed.match(/\p{Emoji}/gu) ?? [];
          if (emojiMatches.length > am.max_emoji_per_message) {
            res.status(400).json({ error: "automod", reason: "too_many_emoji" }); return;
          }
        }
      }
    }

    const [msg] = await db
      .insert(communityMessagesTable)
      .values({ channelId: cid, userId, content: content.trim() })
      .returning();

    // Increment member message count (best-effort)
    pool.query(`UPDATE community_members SET message_count = message_count + 1 WHERE community_id = $1 AND user_id = $2`, [id, userId]).catch(() => {});

    // Broadcast to community members (best-effort)
    try {
      const members = await db
        .select({ userId: communityMembersTable.userId })
        .from(communityMembersTable)
        .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false), ne(communityMembersTable.userId, userId)));

      const [author] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      const msgPayload = {
        ...msg,
        userId: author?.id,
        username: author?.username,
        displayName: author?.displayName,
        avatarUrl: toPublicImageUrl(author?.avatarUrl ?? null),
        isBot: (author as any)?.isBot ?? false,
      };
      const payload = { type: "community-message", communityId: id, channelId: cid, message: msgPayload };
      for (const m of members) pushToUser(m.userId, payload);
      // Fire webhooks (best-effort, non-blocking)
      deliverWebhooks(id, { event: "message.created", communityId: id, channelId: cid, message: msgPayload }).catch(() => {});
    } catch { /* non-fatal */ }

    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json({
      ...msg,
      userId: author?.id,
      username: author?.username,
      displayName: author?.displayName,
      avatarUrl: toPublicImageUrl(author?.avatarUrl ?? null),
      isBot: (author as any)?.isBot ?? false,
    });
  } catch (err) {
    logger.error({ err }, "communities: message send failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/channels/:cid/messages/:mid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const mid = Number(String(req.params.mid));
  if (isNaN(id) || isNaN(cid) || isNaN(mid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Verify channel belongs to this community (prevents cross-community IDOR via owner/mod path)
    const [channelCheck] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!channelCheck) { res.status(404).json({ error: "Channel not found" }); return; }

    const [msg] = await db.select().from(communityMessagesTable).where(and(eq(communityMessagesTable.id, mid), eq(communityMessagesTable.channelId, cid)));
    if (!msg) { res.status(404).json({ error: "Not found" }); return; }

    const canDelete = msg.userId === userId || await isOwnerOrMod(id, userId);
    if (!canDelete) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.update(communityMessagesTable).set({ isDeleted: true }).where(eq(communityMessagesTable.id, mid));
    if (msg.userId !== userId) await logMod(id, userId, msg.userId, "message_delete");
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: message delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Roles ────────────────────────────────────────────────────────────────────

/** PATCH /communities/:id/roles/reorder — bulk-update positions */
router.patch("/communities/:id/roles/reorder", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_roles")) { res.status(403).json({ error: "Forbidden" }); return; }
    const { order } = req.body ?? {};
    if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array" }); return; }
    await Promise.all(
      (order as { id: number; position: number }[]).map(({ id: roleId, position }) =>
        db.update(communityRolesTable).set({ position }).where(
          and(eq(communityRolesTable.id, roleId), eq(communityRolesTable.communityId, id))
        )
      )
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: role reorder failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/communities/:id/roles", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const roles = await db.select().from(communityRolesTable).where(eq(communityRolesTable.communityId, id)).orderBy(asc(communityRolesTable.position));
    res.json(roles);
  } catch (err) {
    logger.error({ err }, "communities: roles list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/roles", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_roles")) { res.status(403).json({ error: "Forbidden" }); return; }
    const { name, color, permissions } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      res.status(400).json({ error: "name must be 1–80 characters" });
      return;
    }
    const [maxPos] = await db
      .select({ pos: sql<number>`COALESCE(MAX(${communityRolesTable.position}), -1)` })
      .from(communityRolesTable)
      .where(eq(communityRolesTable.communityId, id));

    const [role] = await db.insert(communityRolesTable).values({
      communityId: id,
      name: name.trim(),
      color: color || "#6366f1",
      permissions: permissions ?? {},
      position: (maxPos?.pos ?? -1) + 1,
    }).returning();
    res.status(201).json(role);
  } catch (err) {
    logger.error({ err }, "communities: role create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/communities/:id/roles/:rid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_roles")) { res.status(403).json({ error: "Forbidden" }); return; }
    const { name, color, permissions, position, displaySeparately, mentionable } = req.body ?? {};
    const updates: Partial<typeof communityRolesTable.$inferInsert> = {};
    if (name && typeof name === "string") updates.name = name.trim();
    if (color) updates.color = color;
    if (permissions) updates.permissions = permissions;
    if (typeof position === "number") updates.position = position;
    if (typeof displaySeparately === "boolean") (updates as any).displaySeparately = displaySeparately;
    if (typeof mentionable === "boolean") (updates as any).mentionable = mentionable;
    const [updated] = await db.update(communityRolesTable).set(updates).where(and(eq(communityRolesTable.id, rid), eq(communityRolesTable.communityId, id))).returning();
    if (!updated) { res.status(404).json({ error: "Role not found" }); return; }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "communities: role update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/roles/:rid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_roles")) { res.status(403).json({ error: "Forbidden" }); return; }
    // Protect the @everyone (default) role from deletion
    const [role] = await db.select({ isDefault: communityRolesTable.isDefault }).from(communityRolesTable).where(and(eq(communityRolesTable.id, rid), eq(communityRolesTable.communityId, id)));
    if (!role) { res.status(404).json({ error: "Role not found" }); return; }
    if ((role as any).isDefault) { res.status(400).json({ error: "Cannot delete the @everyone role" }); return; }
    await db.delete(communityRolesTable).where(and(eq(communityRolesTable.id, rid), eq(communityRolesTable.communityId, id)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: role delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Member role assignment ───────────────────────────────────────────────────

router.post("/communities/:id/members/:uid/roles/:rid", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const targetUid = Number(String(req.params.uid));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(targetUid) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify role belongs to this community (prevents cross-community role IDOR)
    const [role] = await db.select({ id: communityRolesTable.id })
      .from(communityRolesTable)
      .where(and(eq(communityRolesTable.id, rid), eq(communityRolesTable.communityId, id)));
    if (!role) { res.status(404).json({ error: "Role not found in this community" }); return; }
    const membership = await getMembership(id, targetUid);
    if (!membership || membership.isBanned) { res.status(404).json({ error: "Member not found" }); return; }
    await db.insert(communityMemberRolesTable).values({ memberId: membership.id, roleId: rid }).onConflictDoNothing();
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: assign role failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/members/:uid/roles/:rid", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const targetUid = Number(String(req.params.uid));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(targetUid) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, actorId, "can_manage_roles")) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify role belongs to this community (prevents cross-community role IDOR)
    const [role] = await db.select({ id: communityRolesTable.id })
      .from(communityRolesTable)
      .where(and(eq(communityRolesTable.id, rid), eq(communityRolesTable.communityId, id)));
    if (!role) { res.status(404).json({ error: "Role not found in this community" }); return; }
    const membership = await getMembership(id, targetUid);
    if (!membership) { res.status(404).json({ error: "Member not found" }); return; }
    await db.delete(communityMemberRolesTable).where(and(eq(communityMemberRolesTable.memberId, membership.id), eq(communityMemberRolesTable.roleId, rid)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: remove role failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Member roles / role colour helpers ───────────────────────────────────────

/** GET /communities/:id/members/:uid/roles */
router.get("/communities/:id/members/:uid/roles", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  const targetUid = Number(String(req.params.uid));
  if (isNaN(id) || isNaN(targetUid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, targetUid);
    if (!membership) { res.status(404).json({ error: "Member not found" }); return; }
    const roles = await db
      .select({ role: communityRolesTable })
      .from(communityMemberRolesTable)
      .innerJoin(communityRolesTable, eq(communityMemberRolesTable.roleId, communityRolesTable.id))
      .where(eq(communityMemberRolesTable.memberId, membership.id))
      .orderBy(desc(communityRolesTable.position));
    res.json(roles.map(r => r.role));
  } catch (err) {
    logger.error({ err }, "communities: member roles failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/role-badges — { [userId]: { name, color } } top non-default role per member */
router.get("/communities/:id/role-badges", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number; name: string; color: string }>(`
      SELECT DISTINCT ON (cm.user_id) cm.user_id, cr.name, cr.color
      FROM community_members cm
      JOIN community_member_roles cmr ON cmr.member_id = cm.id
      JOIN community_roles cr ON cr.id = cmr.role_id
      WHERE cm.community_id = $1 AND cm.is_banned = false AND cr.is_default = false
      ORDER BY cm.user_id, cr.position DESC
    `, [id]);
    const map: Record<number, { name: string; color: string }> = {};
    for (const r of rows) map[r.user_id] = { name: r.name, color: r.color };
    res.json(map);
  } catch (err) {
    logger.error({ err }, "communities: role-badges failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/role-colors — { [userId]: topRoleColor } map for all members */
router.get("/communities/:id/role-colors", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number; color: string }>(`
      SELECT DISTINCT ON (cm.user_id) cm.user_id, cr.color
      FROM community_members cm
      JOIN community_member_roles cmr ON cmr.member_id = cm.id
      JOIN community_roles cr ON cr.id = cmr.role_id
      WHERE cm.community_id = $1
        AND cm.is_banned = false
        AND cr.is_default = false
      ORDER BY cm.user_id, cr.position DESC
    `, [id]);
    const map: Record<number, string> = {};
    for (const row of rows) map[row.user_id] = row.color;
    res.json(map);
  } catch (err) {
    logger.error({ err }, "communities: role-colors failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/all-member-roles — { [userId]: { id, name, color, position, displaySeparately }[] } */
router.get("/communities/:id/all-member-roles", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { rows } = await pool.query<{
      user_id: number; role_id: number; role_name: string;
      role_color: string; role_position: number; display_separately: boolean;
    }>(`
      SELECT cm.user_id, cr.id as role_id, cr.name as role_name,
             cr.color as role_color, cr.position as role_position,
             cr.display_separately
      FROM community_members cm
      JOIN community_member_roles cmr ON cmr.member_id = cm.id
      JOIN community_roles cr ON cr.id = cmr.role_id
      WHERE cm.community_id = $1 AND cm.is_banned = false
      ORDER BY cm.user_id, cr.position DESC
    `, [id]);
    const map: Record<number, Array<{ id: number; name: string; color: string; position: number; displaySeparately: boolean }>> = {};
    for (const row of rows) {
      if (!map[row.user_id]) map[row.user_id] = [];
      map[row.user_id].push({
        id: row.role_id, name: row.role_name, color: row.role_color,
        position: row.role_position, displaySeparately: row.display_separately,
      });
    }
    res.json(map);
  } catch (err) {
    logger.error({ err }, "communities: all-member-roles failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Mod log ──────────────────────────────────────────────────────────────────

router.get("/communities/:id/mod-log", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const rows = await db.select().from(communityModLogTable).where(eq(communityModLogTable.communityId, id)).orderBy(desc(communityModLogTable.createdAt)).limit(limit).offset(offset);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: mod-log failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Boost ────────────────────────────────────────────────────────────────────

router.post("/communities/:id/boost", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Must be a member to boost" }); return; }

    await db.insert(communityBoostsTable).values({ communityId: id, userId, pointsSpent: 0 });

    // Recount boosts and update boost_level
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(communityBoostsTable)
      .where(eq(communityBoostsTable.communityId, id));
    const boostCount = Number(countRow?.count ?? 0);
    const newLevel = boostCount >= 30 ? 3 : boostCount >= 15 ? 2 : boostCount >= 5 ? 1 : 0;
    await db.update(communitiesTable).set({ boostLevel: newLevel }).where(eq(communitiesTable.id, id));

    // Broadcast level-up if changed
    if (newLevel !== community.boostLevel) {
      broadcastAll({ type: "community-boost-level-up", communityId: id, boostLevel: newLevel });
    }

    res.status(201).json({ ok: true, boostLevel: newLevel });
  } catch (err) {
    logger.error({ err }, "communities: boost failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Voice presence (called from voice-context on join/leave) ─────────────────

router.post("/communities/:id/voice-join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const { channelId } = req.body ?? {};
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }

    // Broadcast to community members
    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));

    const [user] = await db.select({ username: usersTable.username, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, userId));
    const avatarUrl = toPublicImageUrl(user?.avatarUrl ?? null);

    // Track in-memory presence
    if (typeof channelId === "number") {
      addCommunityVoicePresence(id, channelId, {
        userId,
        username: user?.username ?? "",
        displayName: user?.displayName ?? "",
        avatarUrl,
      });
    }

    const payload = {
      type: "community-voice-update",
      communityId: id,
      channelId,
      userId,
      username: user?.username,
      displayName: user?.displayName,
      avatarUrl,
      action: "join",
    };
    for (const m of members) pushToUser(m.userId, payload);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: voice-join failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/voice-leave", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const { channelId } = req.body ?? {};
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Verify membership so an arbitrary user can't emit leave events to community members
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }

    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));

    // Remove from in-memory presence
    if (typeof channelId === "number") {
      removeCommunityVoicePresenceForChannel(channelId, userId);

      // If the channel is now empty, delete its voice-chat messages so the
      // next session starts fresh (Discord-style ephemeral voice text chat).
      const remaining = getCommunityVoiceParticipants(channelId);
      if (remaining.length === 0) {
        await db
          .delete(communityMessagesTable)
          .where(eq(communityMessagesTable.channelId, channelId));
      }
    }

    const payload = { type: "community-voice-update", communityId: id, channelId, userId, action: "leave" };
    for (const m of members) pushToUser(m.userId, payload);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: voice-leave failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /communities/:id/voice-camera — update camera-on/off state for a participant
router.post("/communities/:id/voice-camera", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const { channelId, cameraEnabled } = req.body ?? {};
  if (isNaN(id) || typeof channelId !== "number" || typeof cameraEnabled !== "boolean") {
    res.status(400).json({ error: "Invalid params" }); return;
  }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }

    // Update in-memory state
    updateCommunityVoiceCameraState(channelId, userId, cameraEnabled);

    // Broadcast to all community members
    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));

    const payload = {
      type: "community-voice-update",
      communityId: id,
      channelId,
      userId,
      action: "camera",
      cameraEnabled,
    };
    for (const m of members) pushToUser(m.userId, payload);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: voice-camera failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /communities/:id/voice-screenshare — update screen-share on/off for a participant
router.post("/communities/:id/voice-screenshare", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const { channelId, screenShareEnabled } = req.body ?? {};
  if (isNaN(id) || typeof channelId !== "number" || typeof screenShareEnabled !== "boolean") {
    res.status(400).json({ error: "Invalid params" }); return;
  }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }

    updateCommunityVoiceScreenShareState(channelId, userId, screenShareEnabled);

    const members = await db
      .select({ userId: communityMembersTable.userId })
      .from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));

    const payload = {
      type: "community-voice-update",
      communityId: id,
      channelId,
      userId,
      action: "screenshare",
      screenShareEnabled,
    };
    for (const m of members) pushToUser(m.userId, payload);

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: voice-screenshare failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /communities/:id/voice-presence — current voice participants per channel
router.get("/communities/:id/voice-presence", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Fetch all voice channel IDs for this community
    const voiceChannels = await db
      .select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(
        eq(communityChannelsTable.communityId, id),
        eq(communityChannelsTable.type, "voice"),
        eq(communityChannelsTable.isArchived, false),
      ));
    const channelIds = voiceChannels.map((c) => c.id);
    const snapshot = getCommunityVoicePresenceSnapshot(channelIds);
    res.json(snapshot);
  } catch (err) {
    logger.error({ err }, "communities: voice-presence failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Polls ────────────────────────────────────────────────────────────────────

router.post("/communities/:id/polls", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_polls")) { res.status(403).json({ error: "Only owner/mod can create polls" }); return; }
    const { question, options, endsAt, channelId } = req.body ?? {};
    if (!question || typeof question !== "string" || question.trim().length < 1 || question.trim().length > 500) {
      res.status(400).json({ error: "question must be 1–500 chars" }); return;
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      res.status(400).json({ error: "2–10 options required" }); return;
    }
    const sanitized = (options as unknown[]).map((o) => ({
      text: typeof o === "string" ? o.trim().slice(0, 100) : String(o).slice(0, 100),
    })).filter(o => o.text.length > 0);
    if (sanitized.length < 2) { res.status(400).json({ error: "Need at least 2 non-empty options" }); return; }
    const { rows } = await pool.query<{ id: number; question: string; options: unknown; ends_at: string | null; is_closed: boolean; created_at: string }>(
      `INSERT INTO community_polls (community_id, channel_id, created_by, question, options, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, channelId ?? null, userId, question.trim(), JSON.stringify(sanitized), endsAt ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "communities: poll create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/communities/:id/polls", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (!membership && community.ownerId !== userId) { res.status(403).json({ error: "Not a member" }); return; }

    const { rows: polls } = await pool.query<{
      id: number; question: string; options: Array<{ text: string }>;
      ends_at: string | null; is_closed: boolean; created_at: string; created_by: number;
    }>(
      `SELECT id, question, options, ends_at, is_closed, created_at, created_by
       FROM community_polls WHERE community_id = $1
       ORDER BY created_at DESC LIMIT 20`, [id]
    );
    const pollIds = polls.map(p => p.id);
    const voteMap: Record<number, number[]> = {};
    const myVoteMap: Record<number, number> = {};
    if (pollIds.length > 0) {
      const { rows: votes } = await pool.query<{ poll_id: number; option_index: number; user_id: number }>(
        `SELECT poll_id, option_index, user_id FROM community_poll_votes WHERE poll_id = ANY($1)`,
        [pollIds]
      );
      for (const v of votes) {
        if (!voteMap[v.poll_id]) voteMap[v.poll_id] = [];
        // tally per option
        if (v.user_id === userId) myVoteMap[v.poll_id] = v.option_index;
      }
      // Build counts per poll+option
      for (const v of votes) {
        const counts = voteMap[v.poll_id] as number[];
        counts[v.option_index] = (counts[v.option_index] ?? 0) + 1;
      }
    }
    const result = polls.map(p => ({
      ...p,
      voteCounts: (p.options as Array<{ text: string }>).map((_, i) => (voteMap[p.id] as number[])?.[i] ?? 0),
      myVote: myVoteMap[p.id] ?? null,
      totalVotes: Object.values(voteMap[p.id] ?? {}).reduce((a: number, b) => a + (b as number), 0),
    }));
    res.json(result);
  } catch (err) {
    logger.error({ err }, "communities: polls list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/polls/:pid/vote", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    const { optionIndex } = req.body ?? {};
    if (typeof optionIndex !== "number" || optionIndex < 0) { res.status(400).json({ error: "optionIndex required" }); return; }
    const { rows } = await pool.query<{ id: number; is_closed: boolean; options: unknown }>(
      `SELECT id, is_closed, options FROM community_polls WHERE id = $1 AND community_id = $2`, [pid, id]
    );
    if (!rows[0]) { res.status(404).json({ error: "Poll not found" }); return; }
    if (rows[0].is_closed) { res.status(409).json({ error: "Poll is closed" }); return; }
    const opts = rows[0].options as Array<{ text: string }>;
    if (optionIndex >= opts.length) { res.status(400).json({ error: "Invalid option" }); return; }
    // Upsert vote
    await pool.query(
      `INSERT INTO community_poll_votes (poll_id, user_id, option_index) VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index, voted_at = now()`,
      [pid, userId, optionIndex]
    );
    // Broadcast updated counts to community members
    const { rows: voteRows } = await pool.query<{ option_index: number }>(
      `SELECT option_index FROM community_poll_votes WHERE poll_id = $1`, [pid]
    );
    const counts = opts.map((_, i) => voteRows.filter(v => v.option_index === i).length);
    const members = await db.select({ userId: communityMembersTable.userId }).from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));
    for (const m of members) pushToUser(m.userId, { type: "community-poll-update", communityId: id, pollId: pid, voteCounts: counts, totalVotes: voteRows.length });
    res.json({ ok: true, voteCounts: counts, totalVotes: voteRows.length });
  } catch (err) {
    logger.error({ err }, "communities: poll vote failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/polls/:pid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_polls")) { res.status(403).json({ error: "Forbidden" }); return; }
    await pool.query(`UPDATE community_polls SET is_closed = true WHERE id = $1 AND community_id = $2`, [pid, id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: poll close failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Invite Management ────────────────────────────────────────────────────────

router.post("/communities/:id/invites", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (!await hasPermission(id, userId, "can_invite")) { res.status(403).json({ error: "Forbidden" }); return; }
    const { maxUses, expiresIn } = req.body ?? {};
    const code = randomBytes(5).toString("base64url").slice(0, 8);
    const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000) : null;
    const { rows } = await pool.query<{ id: number; code: string; max_uses: number | null; uses: number; expires_at: string | null; created_at: string }>(
      `INSERT INTO community_invites (community_id, code, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, code, userId, maxUses ?? null, expiresAt]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "communities: invite create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/communities/:id/invites", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_invite")) { res.status(403).json({ error: "Forbidden" }); return; }
    const { rows } = await pool.query(
      `SELECT ci.code, ci.max_uses, ci.uses, ci.expires_at, ci.created_at,
              u.username AS creator_username
       FROM community_invites ci
       JOIN users u ON u.id = ci.created_by
       WHERE ci.community_id = $1
       ORDER BY ci.created_at DESC LIMIT 20`, [id]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: invites list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/invites/:code", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const { code } = req.params;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_invite")) { res.status(403).json({ error: "Forbidden" }); return; }
    await pool.query(`DELETE FROM community_invites WHERE community_id = $1 AND code = $2`, [id, code]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: invite revoke failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /communities/:id/member-invite — any member (not just can_invite) gets or creates a permanent invite link
router.post("/communities/:id/member-invite", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Forbidden" }); return; }
    // Reuse an existing non-expired invite created by this member
    const { rows: existing } = await pool.query<{ code: string }>(
      `SELECT code FROM community_invites
       WHERE community_id = $1 AND created_by = $2
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC LIMIT 1`,
      [id, userId]
    );
    if (existing[0]) { res.json({ code: existing[0].code }); return; }
    // Create a new permanent invite (no expiry, no max uses)
    const code = randomBytes(5).toString("base64url").slice(0, 8);
    const { rows: created } = await pool.query<{ code: string }>(
      `INSERT INTO community_invites (community_id, code, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, NULL, NULL) RETURNING code`,
      [id, code, userId]
    );
    res.status(201).json({ code: created[0].code });
  } catch (err) {
    logger.error({ err }, "communities: member-invite failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

router.get("/communities/:id/leaderboard", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (!membership && community.ownerId !== userId) { res.status(403).json({ error: "Not a member" }); return; }
    const { rows } = await pool.query<{
      user_id: number; username: string; display_name: string; avatar_url: string | null; message_count: number; joined_at: string;
    }>(
      `SELECT cm.user_id, u.username, u.display_name, u.avatar_url, cm.message_count, cm.joined_at
       FROM community_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.community_id = $1 AND cm.is_banned = false
       ORDER BY cm.message_count DESC, cm.joined_at ASC
       LIMIT 50`, [id]
    );
    res.json(rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: toPublicImageUrl(r.avatar_url),
      messageCount: r.message_count,
      joinedAt: r.joined_at,
    })));
  } catch (err) {
    logger.error({ err }, "communities: leaderboard failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Theme & Badge Frame ──────────────────────────────────────────────────────

router.patch("/communities/:id/theme", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Owner only" }); return; }

    const { themeColor, badgeFrame } = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (themeColor !== undefined) {
      if (themeColor === null) {
        updates.themeColor = null;
      } else if (typeof themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(themeColor)) {
        updates.themeColor = themeColor;
      } else {
        res.status(400).json({ error: "themeColor must be a 7-char hex string like #6366f1 or null" }); return;
      }
    }
    if (badgeFrame !== undefined) {
      const VALID_FRAMES = ["none", "circle", "rounded", "hexagon", "star", "diamond", "shield", "ring", "glow"];
      if (badgeFrame === null || VALID_FRAMES.includes(badgeFrame)) {
        updates.badgeFrame = badgeFrame ?? null;
      } else {
        res.status(400).json({ error: "Invalid badgeFrame value" }); return;
      }
    }

    const [updated] = await db.update(communitiesTable).set(updates as any).where(eq(communitiesTable.id, id)).returning();
    res.json({ themeColor: updated.themeColor, badgeFrame: updated.badgeFrame });
  } catch (err) {
    logger.error({ err }, "communities: theme update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Channel Icon Emoji ───────────────────────────────────────────────────────

router.patch("/communities/:id/channels/:cid/icon", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [channel] = await db.select().from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

    const { iconEmoji } = req.body ?? {};
    const emoji = iconEmoji === null ? null : (typeof iconEmoji === "string" && iconEmoji.trim() ? iconEmoji.trim().slice(0, 8) : undefined);
    if (emoji === undefined) { res.status(400).json({ error: "iconEmoji required (string or null)" }); return; }

    await db.update(communityChannelsTable).set({ iconEmoji: emoji } as any).where(eq(communityChannelsTable.id, cid));
    res.json({ ok: true, iconEmoji: emoji });
  } catch (err) {
    logger.error({ err }, "communities: channel icon update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Community Stickers ───────────────────────────────────────────────────────

router.get("/communities/:id/stickers", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    // Verify the requesting user can see this community (member, or public community)
    const [community] = await db.select({ id: communitiesTable.id, privacy: communitiesTable.privacy })
      .from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.privacy !== "public") {
      const membership = await getMembership(id, userId);
      if (!membership || membership.isBanned) { res.status(403).json({ error: "Forbidden" }); return; }
    }
    const stickers = await db.select().from(communityStickersTable)
      .where(eq(communityStickersTable.communityId, id))
      .orderBy(asc(communityStickersTable.position), asc(communityStickersTable.createdAt));
    res.json(stickers);
  } catch (err) {
    logger.error({ err }, "communities: stickers list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/communities/:id/stickers", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Owner only" }); return; }

    // Enforce max 20 stickers
    const existing = await db.select({ id: communityStickersTable.id }).from(communityStickersTable)
      .where(eq(communityStickersTable.communityId, id));
    if (existing.length >= 20) { res.status(409).json({ error: "Max 20 stickers per community" }); return; }

    const { name, data, mimeType } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 32) {
      res.status(400).json({ error: "name must be 1–32 characters" }); return;
    }
    if (!data || typeof data !== "string") { res.status(400).json({ error: "data (base64) required" }); return; }
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const mime = allowedMimes.includes(mimeType) ? mimeType : "image/png";
    const buf = Buffer.from(data, "base64");
    if (buf.length > 2 * 1024 * 1024) { res.status(413).json({ error: "Sticker must be < 2 MB" }); return; }

    const [stored] = await db.insert(storedImagesTable).values({ data: buf, contentType: mime }).returning({ id: storedImagesTable.id });
    const imageKey = `/api/images/${stored.id}`;
    const position = existing.length;
    const [sticker] = await db.insert(communityStickersTable).values({
      communityId: id, name: name.trim(), imageKey, position,
    }).returning();
    res.status(201).json(sticker);
  } catch (err) {
    logger.error({ err }, "communities: sticker upload failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/stickers/:sid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const sid = Number(String(req.params.sid));
  if (isNaN(id) || isNaN(sid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Owner only" }); return; }
    await db.delete(communityStickersTable)
      .where(and(eq(communityStickersTable.id, sid), eq(communityStickersTable.communityId, id)));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: sticker delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Banner Image ─────────────────────────────────────────────────────────────

router.post("/communities/:id/banner", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (!await hasPermission(id, userId, "can_change_banner")) { res.status(403).json({ error: "Forbidden" }); return; }

    const { data, mimeType } = req.body ?? {};
    if (!data || typeof data !== "string") { res.status(400).json({ error: "data (base64) required" }); return; }
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const mime = allowedMimes.includes(mimeType) ? mimeType : "image/jpeg";
    const buf = Buffer.from(data, "base64");
    if (buf.length > 4 * 1024 * 1024) { res.status(413).json({ error: "Banner must be < 4 MB" }); return; }

    const [stored] = await db.insert(storedImagesTable).values({ data: buf, contentType: mime }).returning({ id: storedImagesTable.id });
    const imageKey = `/api/images/${stored.id}`;
    const isAnimated = mime === "image/gif";
    await db.update(communitiesTable).set({ bannerKey: imageKey, bannerIsAnimated: isAnimated } as any).where(eq(communitiesTable.id, id));
    res.json({ bannerUrl: imageKey, bannerIsAnimated: isAnimated });
  } catch (err) {
    logger.error({ err }, "communities: banner upload failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/communities/:id/banner", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (!await hasPermission(id, userId, "can_change_banner")) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.update(communitiesTable).set({ bannerKey: null }).where(eq(communitiesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: banner remove failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Pin / Unpin Message ──────────────────────────────────────────────────────

router.patch("/communities/:id/channels/:cid/messages/:mid/pin", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const mid = Number(String(req.params.mid));
  if (isNaN(id) || isNaN(cid) || isNaN(mid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_pin_messages")) { res.status(403).json({ error: "Only owner/mod can pin messages" }); return; }
    const [ch] = await db.select({ id: communityChannelsTable.id }).from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!ch) { res.status(404).json({ error: "Channel not found" }); return; }
    const [msg] = await db.select().from(communityMessagesTable)
      .where(and(eq(communityMessagesTable.id, mid), eq(communityMessagesTable.channelId, cid)));
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    const newPinned = !msg.isPinned;
    await db.update(communityMessagesTable).set({ isPinned: newPinned }).where(eq(communityMessagesTable.id, mid));
    // Broadcast pin update
    const members = await db.select({ userId: communityMembersTable.userId }).from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));
    for (const m of members) pushToUser(m.userId, { type: "community-pin-update", communityId: id, channelId: cid, messageId: mid, isPinned: newPinned });
    res.json({ ok: true, isPinned: newPinned });
  } catch (err) {
    logger.error({ err }, "communities: pin message failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Channel Role Permissions ─────────────────────────────────────────────────

/** GET /communities/:id/channels/:cid/permissions — allow/deny per role */
router.get("/communities/:id/channels/:cid/permissions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify channel belongs to this community (IDOR guard)
    const [ch] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!ch) { res.status(404).json({ error: "Channel not found" }); return; }
    const { rows } = await pool.query<{ id: number; channel_id: number; role_id: number; allow: object; deny: object }>(
      `SELECT * FROM channel_role_permissions WHERE channel_id = $1`, [cid]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: channel permissions get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PUT /communities/:id/channels/:cid/permissions — upsert allow/deny per role */
router.put("/communities/:id/channels/:cid/permissions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_channels")) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify channel belongs to this community (IDOR guard)
    const [chk] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!chk) { res.status(404).json({ error: "Channel not found" }); return; }
    const { roleId, allow, deny } = req.body ?? {};
    if (!roleId || typeof roleId !== "number") { res.status(400).json({ error: "roleId required" }); return; }
    // Verify role belongs to this community
    const [role] = await db.select({ id: communityRolesTable.id }).from(communityRolesTable)
      .where(and(eq(communityRolesTable.id, roleId), eq(communityRolesTable.communityId, id)));
    if (!role) { res.status(404).json({ error: "Role not found in this community" }); return; }

    await pool.query(
      `INSERT INTO channel_role_permissions (channel_id, role_id, allow, deny)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (channel_id, role_id) DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny`,
      [cid, roleId, JSON.stringify(allow ?? {}), JSON.stringify(deny ?? {})]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: channel permissions save failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /communities/:id/channels/:cid/permissions/:roleId — remove override */
router.delete("/communities/:id/channels/:cid/permissions/:roleId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const rid = Number(String(req.params.roleId));
  if (isNaN(id) || isNaN(cid) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await hasPermission(id, userId, "can_manage_channels")) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify channel belongs to this community (IDOR guard)
    const [chd] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!chd) { res.status(404).json({ error: "Channel not found" }); return; }
    await pool.query(`DELETE FROM channel_role_permissions WHERE channel_id = $1 AND role_id = $2`, [cid, rid]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: channel permission delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Stage Channel ─────────────────────────────────────────────────────────────

/** POST /communities/:id/channels/:cid/stage/raise-hand — audience requests to speak */
router.post("/communities/:id/channels/:cid/stage/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    // Verify channel belongs to this community and is a stage channel (IDOR guard + type enforcement)
    const [stCh] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.type, "stage")));
    if (!stCh) { res.status(404).json({ error: "Stage channel not found" }); return; }
    const hands = stageHandsMap.get(cid) ?? new Set<number>();
    hands.add(userId);
    stageHandsMap.set(cid, hands);

    // Notify community (so owner/mods can see hand raise)
    const [community] = await db.select({ ownerId: communitiesTable.ownerId }).from(communitiesTable).where(eq(communitiesTable.id, id));
    const [user] = await db.select({ username: usersTable.username, displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId));
    pushToUser(community.ownerId, { type: "stage-raise-hand", communityId: id, channelId: cid, userId, username: user?.username, displayName: user?.displayName });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: stage raise-hand failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/stage/lower-hand — cancel hand raise */
router.post("/communities/:id/channels/:cid/stage/lower-hand", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    const [stCh] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.type, "stage")));
    if (!stCh) { res.status(404).json({ error: "Stage channel not found" }); return; }
    stageHandsMap.get(cid)?.delete(userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/channels/:cid/stage/hands — list raised hands (owner/mod only) */
router.get("/communities/:id/channels/:cid/stage/hands", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [stCh] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.type, "stage")));
    if (!stCh) { res.status(404).json({ error: "Stage channel not found" }); return; }
    const handIds = Array.from(stageHandsMap.get(cid) ?? []);
    const speakers = Array.from(stageSpeakersMap.get(cid) ?? []);
    if (handIds.length === 0) { res.json({ hands: [], speakers }); return; }
    const { rows } = await pool.query<{ id: number; username: string; display_name: string; avatar_url: string | null }>(
      `SELECT id, username, display_name, avatar_url FROM users WHERE id = ANY($1)`, [handIds]
    );
    res.json({
      hands: rows.map(r => ({ userId: r.id, username: r.username, displayName: r.display_name, avatarUrl: toPublicImageUrl(r.avatar_url) })),
      speakers,
    });
  } catch (err) {
    logger.error({ err }, "communities: stage hands get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/stage/approve/:uid — approve speaker */
router.post("/communities/:id/channels/:cid/stage/approve/:uid", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const targetUid = Number(String(req.params.uid));
  if (isNaN(id) || isNaN(cid) || isNaN(targetUid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [stCh] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.type, "stage")));
    if (!stCh) { res.status(404).json({ error: "Stage channel not found" }); return; }
    stageHandsMap.get(cid)?.delete(targetUid);
    const speakers = stageSpeakersMap.get(cid) ?? new Set<number>();
    speakers.add(targetUid);
    stageSpeakersMap.set(cid, speakers);

    // Broadcast speaker approval to community
    const members = await db.select({ userId: communityMembersTable.userId }).from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));
    for (const m of members) pushToUser(m.userId, { type: "stage-speaker-approved", communityId: id, channelId: cid, userId: targetUid });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: stage approve failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /communities/:id/channels/:cid/stage/speakers/:uid — move speaker back to audience */
router.delete("/communities/:id/channels/:cid/stage/speakers/:uid", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const targetUid = Number(String(req.params.uid));
  if (isNaN(id) || isNaN(cid) || isNaN(targetUid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [stCh] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.type, "stage")));
    if (!stCh) { res.status(404).json({ error: "Stage channel not found" }); return; }
    stageSpeakersMap.get(cid)?.delete(targetUid);
    const members = await db.select({ userId: communityMembersTable.userId }).from(communityMembersTable)
      .where(and(eq(communityMembersTable.communityId, id), eq(communityMembersTable.isBanned, false)));
    for (const m of members) pushToUser(m.userId, { type: "stage-speaker-removed", communityId: id, channelId: cid, userId: targetUid });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: stage remove speaker failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Pinned Messages List ─────────────────────────────────────────────────────

router.get("/communities/:id/channels/:cid/pins", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    const rows = await db
      .select({
        id: communityMessagesTable.id,
        content: communityMessagesTable.content,
        createdAt: communityMessagesTable.createdAt,
        userId: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(communityMessagesTable)
      .innerJoin(usersTable, eq(communityMessagesTable.userId, usersTable.id))
      .where(and(
        eq(communityMessagesTable.channelId, cid),
        eq(communityMessagesTable.isPinned, true),
        eq(communityMessagesTable.isDeleted, false)
      ))
      .orderBy(desc(communityMessagesTable.id))
      .limit(20);
    res.json(rows.map(r => ({ ...r, avatarUrl: toPublicImageUrl(r.avatarUrl) })));
  } catch (err) {
    logger.error({ err }, "communities: pins list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Welcome & Rules ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/welcome */
router.get("/communities/:id/welcome", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    const { rows } = await pool.query<{
      community_id: number; welcome_message: string | null; rules_text: string | null;
      requires_agreement: boolean; updated_at: string;
    }>(`SELECT * FROM community_welcome WHERE community_id = $1`, [id]);
    const config = rows[0] ?? { community_id: id, welcome_message: null, rules_text: null, requires_agreement: false };
    // Fetch has_agreed_rules via raw SQL — Drizzle schema doesn't include this ALTER TABLE-added column
    const { rows: agreedRows } = await pool.query<{ has_agreed_rules: boolean }>(
      `SELECT has_agreed_rules FROM community_members WHERE community_id = $1 AND user_id = $2 LIMIT 1`, [id, userId]
    );
    res.json({ ...config, hasAgreed: !!(agreedRows[0]?.has_agreed_rules) });
  } catch (err) {
    logger.error({ err }, "communities: welcome get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PUT /communities/:id/welcome */
router.put("/communities/:id/welcome", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { welcomeMessage, rulesText, requiresAgreement } = req.body ?? {};
  try {
    await pool.query(
      `INSERT INTO community_welcome (community_id, welcome_message, rules_text, requires_agreement, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (community_id) DO UPDATE
         SET welcome_message = EXCLUDED.welcome_message,
             rules_text = EXCLUDED.rules_text,
             requires_agreement = EXCLUDED.requires_agreement,
             updated_at = now()`,
      [id, welcomeMessage ?? null, rulesText ?? null, !!requiresAgreement]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: welcome put failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/welcome/agree */
router.post("/communities/:id/welcome/agree", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const membership = await getMembership(id, userId);
    if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
    await pool.query(
      `UPDATE community_members SET has_agreed_rules = true, agreed_at = now()
       WHERE community_id = $1 AND user_id = $2`, [id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: welcome agree failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── AutoMod ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/automod */
router.get("/communities/:id/automod", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM community_automod WHERE community_id = $1`, [id]
    );
    res.json(rows[0] ?? { community_id: id, banned_words: [], block_external_links: false, max_emoji_per_message: 0, block_caps: false, block_invites: false });
  } catch (err) {
    logger.error({ err }, "communities: automod get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PUT /communities/:id/automod */
router.put("/communities/:id/automod", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { bannedWords, blockExternalLinks, maxEmojiPerMessage, blockCaps, blockInvites } = req.body ?? {};
  try {
    const words = Array.isArray(bannedWords) ? bannedWords.filter((w: any) => typeof w === "string" && w.trim()).map((w: any) => w.trim().toLowerCase()) : [];
    await pool.query(
      `INSERT INTO community_automod (community_id, banned_words, block_external_links, max_emoji_per_message, block_caps, block_invites)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (community_id) DO UPDATE
         SET banned_words = EXCLUDED.banned_words,
             block_external_links = EXCLUDED.block_external_links,
             max_emoji_per_message = EXCLUDED.max_emoji_per_message,
             block_caps = EXCLUDED.block_caps,
             block_invites = EXCLUDED.block_invites`,
      [id, words, !!blockExternalLinks, Math.max(0, Number(maxEmojiPerMessage) || 0), !!blockCaps, !!blockInvites]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: automod put failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Events ────────────────────────────────────────────════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

type CommunityEvent = {
  id: number; community_id: number; creator_id: number; title: string;
  description: string | null; start_at: string; end_at: string | null;
  channel_id: number | null; status: string; created_at: string;
  attending_count: number; interested_count: number; my_rsvp: string | null;
};

/** GET /communities/:id/events */
router.get("/communities/:id/events", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  try {
    const { rows } = await pool.query<CommunityEvent>(
      `SELECT e.*,
         COUNT(r.user_id) FILTER (WHERE r.status = 'attending') AS attending_count,
         COUNT(r.user_id) FILTER (WHERE r.status = 'interested') AS interested_count,
         MAX(r.status) FILTER (WHERE r.user_id = $2) AS my_rsvp
       FROM community_events e
       LEFT JOIN event_rsvps r ON r.event_id = e.id
       WHERE e.community_id = $1
       GROUP BY e.id
       ORDER BY e.start_at ASC`,
      [id, userId]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: events list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/events */
router.post("/communities/:id/events", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, startAt, endAt, channelId } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length < 1) {
    res.status(400).json({ error: "title required" }); return;
  }
  if (!startAt || isNaN(Date.parse(startAt))) {
    res.status(400).json({ error: "valid startAt required" }); return;
  }
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_events (community_id, creator_id, title, description, start_at, end_at, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [id, userId, title.trim(), description?.trim() ?? null, new Date(startAt), endAt ? new Date(endAt) : null, channelId ?? null]
    );
    // Schedule 1-hour notification (simple in-process timer)
    const msUntilNotif = new Date(startAt).getTime() - Date.now() - 60 * 60 * 1000;
    if (msUntilNotif > 0 && msUntilNotif < 24 * 60 * 60 * 1000) {
      setTimeout(async () => {
        try {
          const { rows: attendees } = await pool.query<{ user_id: number }>(
            `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND status = 'attending'`, [rows[0].id]
          );
          for (const a of attendees) {
            pushToUser(a.user_id, { type: "event-reminder", communityId: id, eventId: rows[0].id, title: title.trim() });
          }
        } catch {}
      }, msUntilNotif);
    }
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "communities: event create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PATCH /communities/:id/events/:eid */
router.patch("/communities/:id/events/:eid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const eid = Number(String(req.params.eid));
  if (isNaN(id) || isNaN(eid)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, startAt, endAt, channelId, status } = req.body ?? {};
  try {
    const sets: string[] = [];
    const vals: any[] = [eid, id];
    if (title && typeof title === "string") { sets.push(`title = $${vals.push(title.trim())}`); }
    if (description !== undefined) { sets.push(`description = $${vals.push(description?.trim() ?? null)}`); }
    if (startAt && !isNaN(Date.parse(startAt))) { sets.push(`start_at = $${vals.push(new Date(startAt))}`); }
    if (endAt !== undefined) { sets.push(`end_at = $${vals.push(endAt ? new Date(endAt) : null)}`); }
    if (channelId !== undefined) { sets.push(`channel_id = $${vals.push(channelId ?? null)}`); }
    if (["scheduled", "live", "ended"].includes(status)) {
      sets.push(`status = $${vals.push(status)}`);
      if (status === "live") {
        // Notify all members
        const { rows: mbs } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM community_members WHERE community_id = $1 AND is_banned = false`, [id]
        );
        for (const m of mbs) pushToUser(m.user_id, { type: "event-live", communityId: id, eventId: eid });
      }
    }
    if (sets.length === 0) { res.json({ ok: true }); return; }
    await pool.query(`UPDATE community_events SET ${sets.join(", ")} WHERE id = $1 AND community_id = $2`, vals);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: event update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /communities/:id/events/:eid */
router.delete("/communities/:id/events/:eid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const eid = Number(String(req.params.eid));
  if (isNaN(id) || isNaN(eid)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await pool.query(`DELETE FROM community_events WHERE id = $1 AND community_id = $2`, [eid, id]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: event delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/events/:eid/rsvp */
router.post("/communities/:id/events/:eid/rsvp", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const eid = Number(String(req.params.eid));
  if (isNaN(id) || isNaN(eid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const { status } = req.body ?? {};
  if (!["attending", "interested", "none"].includes(status)) {
    res.status(400).json({ error: "status must be attending|interested|none" }); return;
  }
  try {
    // Verify the event belongs to this community (prevents cross-community RSVP)
    const { rows: evCheck } = await pool.query<{ id: number }>(
      `SELECT id FROM community_events WHERE id = $1 AND community_id = $2 LIMIT 1`, [eid, id]
    );
    if (!evCheck[0]) { res.status(404).json({ error: "Event not found" }); return; }
    if (status === "none") {
      await pool.query(`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [eid, userId]);
    } else {
      await pool.query(
        `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
        [eid, userId, status]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: event rsvp failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Badges ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/badges */
router.get("/communities/:id/badges", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  try {
    const { rows } = await pool.query(`SELECT * FROM community_badges WHERE community_id = $1 ORDER BY created_at ASC`, [id]);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: badges list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/badges */
router.post("/communities/:id/badges", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, iconEmoji, description, type, autoTrigger } = req.body ?? {};
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name required" }); return; }
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_badges (community_id, name, icon_emoji, description, type, auto_trigger)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [id, name.trim(), iconEmoji ?? "🏅", description?.trim() ?? null, type === "auto" ? "auto" : "manual", autoTrigger ?? null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "communities: badge create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /communities/:id/badges/:bid */
router.delete("/communities/:id/badges/:bid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const bid = Number(String(req.params.bid));
  if (isNaN(id) || isNaN(bid)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await pool.query(`DELETE FROM community_badges WHERE id = $1 AND community_id = $2`, [bid, id]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: badge delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/badges/:bid/award/:uid — manual award */
router.post("/communities/:id/badges/:bid/award/:uid", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const bid = Number(String(req.params.bid));
  const uid = Number(String(req.params.uid));
  if (isNaN(id) || isNaN(bid) || isNaN(uid)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    // Verify badge belongs to this community (prevents cross-community award)
    const { rows: badgeCheck } = await pool.query<{ id: number }>(
      `SELECT id FROM community_badges WHERE id = $1 AND community_id = $2 LIMIT 1`, [bid, id]
    );
    if (!badgeCheck[0]) { res.status(404).json({ error: "Badge not found" }); return; }
    await pool.query(
      `INSERT INTO member_badges (badge_id, user_id, community_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [bid, uid, id]
    );
    pushToUser(uid, { type: "badge-awarded", communityId: id, badgeId: bid });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: badge award failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/members/:uid/badges */
router.get("/communities/:id/members/:uid/badges", requireAuth, async (req, res): Promise<void> => {
  const actorId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const uid = Number(String(req.params.uid));
  if (isNaN(id) || isNaN(uid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, actorId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT mb.*, cb.name, cb.icon_emoji, cb.description, cb.type
       FROM member_badges mb
       JOIN community_badges cb ON cb.id = mb.badge_id
       WHERE mb.user_id = $1 AND mb.community_id = $2
       ORDER BY mb.earned_at DESC`,
      [uid, id]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: member badges get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Threads ───────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** POST /communities/:id/messages/:mid/thread — create thread from message */
router.post("/communities/:id/messages/:mid/thread", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const mid = Number(String(req.params.mid));
  if (isNaN(id) || isNaN(mid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const { title } = req.body ?? {};
  try {
    // Verify message belongs to this community and get its channel
    const { rows: msgRows } = await pool.query<{ channel_id: number; community_id: number }>(
      `SELECT cm.channel_id, cc.community_id
       FROM community_messages cm
       JOIN community_channels cc ON cc.id = cm.channel_id
       WHERE cm.id = $1 AND cc.community_id = $2 AND cm.is_deleted = false`, [mid, id]
    );
    if (!msgRows[0]) { res.status(404).json({ error: "Message not found" }); return; }
    // Private-channel guard — same rule as posting messages
    const channelAccess = await assertChannelAccess(id, msgRows[0].channel_id, userId);
    if (channelAccess.denied) { res.status(channelAccess.status).json({ error: channelAccess.error }); return; }
    // Only one thread per message
    const { rows: existing } = await pool.query(
      `SELECT id FROM community_message_threads WHERE parent_message_id = $1`, [mid]
    );
    if (existing[0]) { res.json({ id: existing[0].id }); return; }
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_message_threads (parent_message_id, channel_id, community_id, title)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [mid, msgRows[0].channel_id, id, title?.trim() ?? null]
    );
    // Notify only channel-authorized recipients (private-channel-aware fanout)
    const recipients = await getChannelAuthorizedRecipients(id, msgRows[0].channel_id);
    for (const uid of recipients) pushToUser(uid, { type: "community-thread-created", communityId: id, channelId: msgRows[0].channel_id, threadId: rows[0].id });
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "communities: thread create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/channels/:cid/threads */
router.get("/communities/:id/channels/:cid/threads", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  // Private-channel guard
  const channelAccess = await assertChannelAccess(id, cid, userId);
  if (channelAccess.denied) { res.status(channelAccess.status).json({ error: channelAccess.error }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.username, u.display_name,
         (SELECT COUNT(*) FROM community_thread_messages tm WHERE tm.thread_id = t.id) AS reply_count
       FROM community_message_threads t
       JOIN community_messages pm ON pm.id = t.parent_message_id
       JOIN users u ON u.id = pm.user_id
       WHERE t.channel_id = $1 AND t.community_id = $2
       ORDER BY t.last_activity_at DESC LIMIT 30`,
      [cid, id]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "communities: threads list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/threads/:tid/messages */
router.get("/communities/:id/threads/:tid/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const tid = Number(String(req.params.tid));
  if (isNaN(id) || isNaN(tid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  try {
    // Verify thread belongs to community and get its channel for access check
    const { rows: tRows } = await pool.query<{ is_closed: boolean; title: string | null; channel_id: number }>(
      `SELECT is_closed, title, channel_id FROM community_message_threads WHERE id = $1 AND community_id = $2`, [tid, id]
    );
    if (!tRows[0]) { res.status(404).json({ error: "Thread not found" }); return; }
    // Private-channel guard
    const channelAccess = await assertChannelAccess(id, tRows[0].channel_id, userId);
    if (channelAccess.denied) { res.status(channelAccess.status).json({ error: channelAccess.error }); return; }
    const { rows } = await pool.query(
      `SELECT tm.id, tm.thread_id, tm.content, tm.created_at,
         u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM community_thread_messages tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.thread_id = $1
       ORDER BY tm.created_at ASC LIMIT 200`,
      [tid]
    );
    res.json({
      isClosed: tRows[0].is_closed,
      title: tRows[0].title,
      messages: rows.map(r => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })),
    });
  } catch (err) {
    logger.error({ err }, "communities: thread messages get failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/threads/:tid/messages */
router.post("/communities/:id/threads/:tid/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const tid = Number(String(req.params.tid));
  if (isNaN(id) || isNaN(tid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content required" }); return;
  }
  if (content.trim().length > 4000) { res.status(400).json({ error: "Message too long" }); return; }
  try {
    const { rows: tRows } = await pool.query<{ is_closed: boolean; channel_id: number }>(
      `SELECT is_closed, channel_id FROM community_message_threads WHERE id = $1 AND community_id = $2`, [tid, id]
    );
    if (!tRows[0]) { res.status(404).json({ error: "Thread not found" }); return; }
    // Private-channel guard
    const channelAccess = await assertChannelAccess(id, tRows[0].channel_id, userId);
    if (channelAccess.denied) { res.status(channelAccess.status).json({ error: channelAccess.error }); return; }
    // Rules-agreement enforcement
    const agreementErr = await assertRulesAgreed(id, userId);
    if (agreementErr) { res.status(agreementErr.status).json({ error: agreementErr.error }); return; }
    if (tRows[0].is_closed && !await isOwnerOrMod(id, userId)) {
      res.status(403).json({ error: "Thread is closed" }); return;
    }
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_thread_messages (thread_id, user_id, content) VALUES ($1, $2, $3) RETURNING id`,
      [tid, userId, content.trim()]
    );
    await pool.query(`UPDATE community_message_threads SET last_activity_at = now() WHERE id = $1`, [tid]);
    // Broadcast to channel-authorized recipients only (private-channel-aware fanout)
    const [user] = await db.select({ username: usersTable.username, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(eq(usersTable.id, userId));
    const payload = {
      type: "community-thread-message", communityId: id, threadId: tid,
      channelId: tRows[0].channel_id,
      message: { id: rows[0].id, threadId: tid, content: content.trim(), createdAt: new Date().toISOString(),
        userId, username: user?.username, displayName: user?.displayName, avatarUrl: toPublicImageUrl(user?.avatarUrl ?? null) }
    };
    const recipients = await getChannelAuthorizedRecipients(id, tRows[0].channel_id);
    for (const uid of recipients) pushToUser(uid, payload);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "communities: thread message post failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PATCH /communities/:id/threads/:tid — close/reopen */
router.patch("/communities/:id/threads/:tid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const tid = Number(String(req.params.tid));
  if (isNaN(id) || isNaN(tid)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { isClosed } = req.body ?? {};
  try {
    await pool.query(
      `UPDATE community_message_threads SET is_closed = $1 WHERE id = $2 AND community_id = $3`,
      [!!isClosed, tid, id]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "communities: thread patch failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Insights cache (10-min TTL per community) ─────────────────────────────────
const insightsCache = new Map<number, { data: unknown; expiresAt: number }>();

/** GET /communities/:id/insights — owner/mod only, cached 10 min */
router.get("/communities/:id/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const cached = insightsCache.get(id);
  if (cached && cached.expiresAt > Date.now()) { res.json(cached.data); return; }

  try {
    const [growthRes, msgRes, topRes, heatmapRes] = await Promise.all([
      pool.query<{ day: string; count: string }>(
        `SELECT date_trunc('day', joined_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::text AS count
         FROM community_members
         WHERE community_id = $1 AND joined_at >= NOW() - INTERVAL '30 days'
         GROUP BY day ORDER BY day ASC`, [id]
      ),
      pool.query<{ channel_name: string; day: string; count: string }>(
        `SELECT cc.name AS channel_name,
                date_trunc('day', cm.created_at AT TIME ZONE 'UTC')::date AS day,
                COUNT(*)::text AS count
         FROM community_messages cm
         JOIN community_channels cc ON cc.id = cm.channel_id
         WHERE cc.community_id = $1 AND cm.created_at >= NOW() - INTERVAL '30 days'
           AND cm.is_deleted = false
         GROUP BY cc.name, day ORDER BY day ASC, cc.name`, [id]
      ),
      pool.query<{ user_id: number; username: string; display_name: string; avatar_url: string | null; message_count: string }>(
        `SELECT u.id AS user_id, u.username, u.display_name, u.avatar_url, COUNT(*)::text AS message_count
         FROM community_messages cm
         JOIN community_channels cc ON cc.id = cm.channel_id
         JOIN users u ON u.id = cm.user_id
         WHERE cc.community_id = $1 AND cm.created_at >= date_trunc('month', NOW()) AND cm.is_deleted = false
         GROUP BY u.id, u.username, u.display_name, u.avatar_url
         ORDER BY message_count DESC LIMIT 5`, [id]
      ),
      pool.query<{ dow: string; hour: string; count: string }>(
        `SELECT EXTRACT(DOW FROM cm.created_at)::int::text AS dow,
                EXTRACT(HOUR FROM cm.created_at)::int::text AS hour,
                COUNT(*)::text AS count
         FROM community_messages cm
         JOIN community_channels cc ON cc.id = cm.channel_id
         WHERE cc.community_id = $1 AND cm.created_at >= NOW() - INTERVAL '90 days'
           AND cm.is_deleted = false
         GROUP BY dow, hour ORDER BY dow, hour`, [id]
      ),
    ]);

    const data = {
      memberGrowth: growthRes.rows.map(r => ({ day: r.day, count: Number(r.count) })),
      dailyMessages: msgRes.rows.map(r => ({ channelName: r.channel_name, day: r.day, count: Number(r.count) })),
      topMembers: topRes.rows.map(r => ({
        userId: r.user_id, username: r.username, displayName: r.display_name,
        avatarUrl: toPublicImageUrl(r.avatar_url), messageCount: Number(r.message_count),
      })),
      peakHours: heatmapRes.rows.map(r => ({ dow: Number(r.dow), hour: Number(r.hour), count: Number(r.count) })),
    };

    insightsCache.set(id, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json(data);
  } catch (err) {
    logger.error({ err }, "communities: insights failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Auto-close idle threads (runs every hour) ────────────────────────────────
setInterval(async () => {
  try {
    await pool.query(
      `UPDATE community_message_threads SET is_closed = true
       WHERE is_closed = false AND last_activity_at < now() - INTERVAL '24 hours'`
    );
  } catch {}
}, 60 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════════════════
// ── LFG Board ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/channels/:cid/lfg — list active LFG posts */
router.get("/communities/:id/channels/:cid/lfg", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT lp.*, u.username, u.display_name, u.avatar_url
       FROM community_lfg_posts lp
       JOIN users u ON u.id = lp.user_id
       WHERE lp.channel_id = $1 AND lp.expires_at > now()
       ORDER BY lp.created_at DESC LIMIT 50`,
      [cid]
    );
    res.json(rows.map((r: any) => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })));
  } catch (err) {
    logger.error({ err }, "lfg: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/lfg — create LFG post */
router.post("/communities/:id/channels/:cid/lfg", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const { game, rolesNeeded, skillLevel, note, slots } = req.body ?? {};
  if (!game || typeof game !== "string" || game.trim().length < 1 || game.trim().length > 100) {
    res.status(400).json({ error: "game must be 1–100 characters" }); return;
  }
  const slotsVal = Math.max(1, Math.min(Number(slots) || 1, 20));
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_lfg_posts (channel_id, user_id, game, roles_needed, skill_level, note, slots)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [cid, userId, game.trim(),
       Array.isArray(rolesNeeded) ? rolesNeeded.filter((r: any) => typeof r === "string") : [],
       typeof skillLevel === "string" ? skillLevel.trim().slice(0, 50) || null : null,
       typeof note === "string" ? note.trim().slice(0, 500) || null : null,
       slotsVal]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "lfg: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/lfg/:pid/join — fill a slot (atomic) */
router.post("/communities/:id/channels/:cid/lfg/:pid/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    // Single atomic UPDATE: only succeeds when not own post, not full, not expired
    const { rowCount, rows } = await pool.query<{ user_id: number }>(
      `UPDATE community_lfg_posts
       SET filled_slots = filled_slots + 1
       WHERE id = $1 AND channel_id = $2 AND user_id != $3 AND filled_slots < slots AND expires_at > now()
       RETURNING user_id`,
      [pid, cid, userId]
    );
    if (rowCount === 0) {
      // Determine precise error
      const { rows: check } = await pool.query<{ user_id: number; filled_slots: number; slots: number; expires_at: string }>(
        `SELECT user_id, filled_slots, slots, expires_at FROM community_lfg_posts WHERE id = $1 AND channel_id = $2`,
        [pid, cid]
      );
      if (!check[0] || new Date(check[0].expires_at) <= new Date()) {
        res.status(404).json({ error: "Post not found or expired" }); return;
      }
      if (check[0].user_id === userId) {
        res.status(400).json({ error: "Cannot join your own LFG post" }); return;
      }
      res.status(409).json({ error: "No slots available" }); return;
    }
    // Best-effort push notification to poster
    try {
      const [joiner] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId));
      pushToUser(rows[0].user_id, { type: "lfg-join", communityId: id, postId: pid, joinerName: joiner?.displayName ?? "Someone" });
    } catch {}
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "lfg: join failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /communities/:id/channels/:cid/lfg/:pid — delete own post or owner */
router.delete("/communities/:id/channels/:cid/lfg/:pid", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM community_lfg_posts WHERE id = $1 AND channel_id = $2`, [pid, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== userId && !await isOwnerOrMod(id, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await pool.query(`DELETE FROM community_lfg_posts WHERE id = $1`, [pid]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "lfg: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Clip Vault ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/channels/:cid/clips — list clip posts */
router.get("/communities/:id/channels/:cid/clips", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT cp.*, u.username, u.display_name, u.avatar_url,
         EXISTS(SELECT 1 FROM community_clip_votes cv WHERE cv.clip_id = cp.id AND cv.user_id = $2) AS my_vote
       FROM community_clip_posts cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.channel_id = $1
       ORDER BY cp.weekly_winner DESC, cp.upvotes DESC, cp.created_at DESC LIMIT 50`,
      [cid, userId]
    );
    res.json(rows.map((r: any) => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })));
  } catch (err) {
    logger.error({ err }, "clips: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/clips — submit a clip */
router.post("/communities/:id/channels/:cid/clips", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const { title, url, thumbnailUrl } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length < 1 || title.trim().length > 200) {
    res.status(400).json({ error: "title must be 1–200 characters" }); return;
  }
  if (!url || typeof url !== "string" || url.trim().length < 5) {
    res.status(400).json({ error: "url is required" }); return;
  }
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_clip_posts (channel_id, user_id, title, url, thumbnail_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cid, userId, title.trim(), url.trim(), typeof thumbnailUrl === "string" ? thumbnailUrl.trim() || null : null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "clips: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/clips/:clipId/vote — toggle upvote (atomic transaction) */
router.post("/communities/:id/channels/:cid/clips/:clipId/vote", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const clipId = Number(String(req.params.clipId));
  if (isNaN(id) || isNaN(cid) || isNaN(clipId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Delete returns 1 row if vote existed (toggle off), 0 if not (toggle on)
    const { rowCount: deleted } = await client.query(
      `DELETE FROM community_clip_votes WHERE user_id = $1 AND clip_id = $2`, [userId, clipId]
    );
    const voted = deleted === 0;
    if (voted) {
      await client.query(
        `INSERT INTO community_clip_votes (user_id, clip_id) VALUES ($1, $2)`, [userId, clipId]
      );
      await client.query(`UPDATE community_clip_posts SET upvotes = upvotes + 1 WHERE id = $1 AND channel_id = $2`, [clipId, cid]);
    } else {
      await client.query(`UPDATE community_clip_posts SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = $1 AND channel_id = $2`, [clipId, cid]);
    }
    await client.query("COMMIT");
    res.json({ voted });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "clips: vote failed");
    res.status(500).json({ error: "Internal error" });
  } finally {
    client.release();
  }
});

/** DELETE /communities/:id/channels/:cid/clips/:clipId — delete own clip (or owner/mod) */
router.delete("/communities/:id/channels/:cid/clips/:clipId", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const clipId = Number(String(req.params.clipId));
  if (isNaN(id) || isNaN(cid) || isNaN(clipId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number }>(
      `SELECT user_id FROM community_clip_posts WHERE id = $1 AND channel_id = $2`, [clipId, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== userId && !await isOwnerOrMod(id, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await pool.query(`DELETE FROM community_clip_posts WHERE id = $1`, [clipId]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "clips: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Forum Board ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/channels/:cid/forum — list forum posts */
router.get("/communities/:id/channels/:cid/forum", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const sort = (typeof req.query.sort === "string" && ["hot", "new", "top"].includes(req.query.sort)) ? req.query.sort : "new";
  const orderBy = sort === "top" ? "fp.upvotes DESC, fp.created_at DESC"
    : sort === "hot" ? "((fp.upvotes * 2 + fp.reply_count) / EXTRACT(EPOCH FROM (now() - fp.created_at + INTERVAL '1 hour')) * 3600) DESC"
    : "fp.created_at DESC";
  try {
    const { rows } = await pool.query(
      `SELECT fp.*, u.username, u.display_name, u.avatar_url,
         EXISTS(SELECT 1 FROM community_forum_votes fv WHERE fv.post_id = fp.id AND fv.user_id = $2) AS my_vote
       FROM community_forum_posts fp
       JOIN users u ON u.id = fp.user_id
       WHERE fp.channel_id = $1
       ORDER BY ${orderBy} LIMIT 50`,
      [cid, userId]
    );
    res.json(rows.map((r: any) => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })));
  } catch (err) {
    logger.error({ err }, "forum: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/forum — create a forum post */
router.post("/communities/:id/channels/:cid/forum", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const { title, body, tags } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length < 1 || title.trim().length > 200) {
    res.status(400).json({ error: "title must be 1–200 characters" }); return;
  }
  if (!body || typeof body !== "string" || body.trim().length < 1 || body.trim().length > 10000) {
    res.status(400).json({ error: "body must be 1–10000 characters" }); return;
  }
  const tagsVal = Array.isArray(tags) ? tags.filter((t: any) => typeof t === "string").slice(0, 5).map((t: string) => t.trim().slice(0, 30)) : [];
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_forum_posts (channel_id, user_id, title, body, tags)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cid, userId, title.trim(), body.trim(), tagsVal]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "forum: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /communities/:id/channels/:cid/forum/:pid/replies */
router.get("/communities/:id/channels/:cid/forum/:pid/replies", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT fr.*, u.username, u.display_name, u.avatar_url
       FROM community_forum_replies fr
       JOIN users u ON u.id = fr.user_id
       JOIN community_forum_posts fp ON fp.id = fr.post_id AND fp.channel_id = $2
       WHERE fr.post_id = $1
       ORDER BY fr.created_at ASC LIMIT 200`,
      [pid, cid]
    );
    res.json(rows.map((r: any) => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })));
  } catch (err) {
    logger.error({ err }, "forum: replies list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/forum/:pid/reply */
router.post("/communities/:id/channels/:cid/forum/:pid/reply", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const { body } = req.body ?? {};
  if (!body || typeof body !== "string" || body.trim().length < 1 || body.trim().length > 4000) {
    res.status(400).json({ error: "body must be 1–4000 characters" }); return;
  }
  try {
    const { rows: postRows } = await pool.query<{ id: number }>(
      `SELECT id FROM community_forum_posts WHERE id = $1 AND channel_id = $2`, [pid, cid]
    );
    if (!postRows[0]) { res.status(404).json({ error: "Post not found" }); return; }
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_forum_replies (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
      [pid, userId, body.trim()]
    );
    await pool.query(`UPDATE community_forum_posts SET reply_count = reply_count + 1 WHERE id = $1`, [pid]);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "forum: reply failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/forum/:pid/resolve — mark resolved (OP or mod) */
router.post("/communities/:id/channels/:cid/forum/:pid/resolve", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number; is_resolved: boolean }>(
      `SELECT user_id, is_resolved FROM community_forum_posts WHERE id = $1 AND channel_id = $2`, [pid, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id !== userId && !await isOwnerOrMod(id, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await pool.query(
      `UPDATE community_forum_posts SET is_resolved = NOT is_resolved WHERE id = $1`, [pid]
    );
    res.json({ isResolved: !rows[0].is_resolved });
  } catch (err) {
    logger.error({ err }, "forum: resolve failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/forum/:pid/vote — toggle upvote (atomic transaction) */
router.post("/communities/:id/channels/:cid/forum/:pid/vote", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const pid = Number(String(req.params.pid));
  if (isNaN(id) || isNaN(cid) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount: deleted } = await client.query(
      `DELETE FROM community_forum_votes WHERE user_id = $1 AND post_id = $2`, [userId, pid]
    );
    const voted = deleted === 0;
    if (voted) {
      await client.query(`INSERT INTO community_forum_votes (user_id, post_id) VALUES ($1, $2)`, [userId, pid]);
      await client.query(`UPDATE community_forum_posts SET upvotes = upvotes + 1 WHERE id = $1 AND channel_id = $2`, [pid, cid]);
    } else {
      await client.query(`UPDATE community_forum_posts SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = $1 AND channel_id = $2`, [pid, cid]);
    }
    await client.query("COMMIT");
    res.json({ voted });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "forum: vote failed");
    res.status(500).json({ error: "Internal error" });
  } finally {
    client.release();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Coaching Hub ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** GET /communities/:id/channels/:cid/coaching — list coaching requests */
router.get("/communities/:id/channels/:cid/coaching", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT cr.*,
         u.username, u.display_name, u.avatar_url,
         cu.username AS coach_username, cu.display_name AS coach_display_name
       FROM community_coaching_requests cr
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN users cu ON cu.id = cr.coach_id
       WHERE cr.channel_id = $1
       ORDER BY CASE cr.status WHEN 'open' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, cr.created_at DESC
       LIMIT 50`,
      [cid]
    );
    res.json(rows.map((r: any) => ({ ...r, avatar_url: toPublicImageUrl(r.avatar_url) })));
  } catch (err) {
    logger.error({ err }, "coaching: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/coaching — create coaching request */
router.post("/communities/:id/channels/:cid/coaching", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  if (isNaN(id) || isNaN(cid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  const { game, rank, availability } = req.body ?? {};
  if (!game || typeof game !== "string" || game.trim().length < 1 || game.trim().length > 100) {
    res.status(400).json({ error: "game must be 1–100 characters" }); return;
  }
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_coaching_requests (channel_id, user_id, game, rank, availability)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cid, userId, game.trim(),
       typeof rank === "string" ? rank.trim().slice(0, 80) || null : null,
       typeof availability === "string" ? availability.trim().slice(0, 500) || null : null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    logger.error({ err }, "coaching: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/coaching/:rid/accept — accept as coach */
router.post("/communities/:id/channels/:cid/coaching/:rid/accept", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(cid) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number; status: string }>(
      `SELECT user_id, status FROM community_coaching_requests WHERE id = $1 AND channel_id = $2`, [rid, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].user_id === userId) { res.status(400).json({ error: "Cannot coach yourself" }); return; }
    if (rows[0].status !== "open") { res.status(409).json({ error: "Request is not open" }); return; }
    await pool.query(
      `UPDATE community_coaching_requests SET status = 'accepted', coach_id = $1 WHERE id = $2`,
      [userId, rid]
    );
    pushToUser(rows[0].user_id, { type: "coaching-accepted", communityId: id, requestId: rid, coachId: userId });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "coaching: accept failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /communities/:id/channels/:cid/coaching/:rid/complete — mark session complete */
router.post("/communities/:id/channels/:cid/coaching/:rid/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  const cid = Number(String(req.params.cid));
  const rid = Number(String(req.params.rid));
  if (isNaN(id) || isNaN(cid) || isNaN(rid)) { res.status(400).json({ error: "Invalid id" }); return; }
  const membership = await getMembership(id, userId);
  if (!membership || membership.isBanned) { res.status(403).json({ error: "Not a member" }); return; }
  const access = await assertChannelAccess(id, cid, userId);
  if (access.denied) { res.status(access.status).json({ error: access.error }); return; }
  try {
    const { rows } = await pool.query<{ user_id: number; coach_id: number | null; status: string }>(
      `SELECT user_id, coach_id, status FROM community_coaching_requests WHERE id = $1 AND channel_id = $2`, [rid, cid]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (rows[0].status !== "accepted") { res.status(409).json({ error: "Session not in accepted state" }); return; }
    if (rows[0].coach_id !== userId && rows[0].user_id !== userId && !await isOwnerOrMod(id, userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await pool.query(
      `UPDATE community_coaching_requests SET status = 'completed' WHERE id = $1`, [rid]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "coaching: complete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Clip of the Week sweep (runs every Sunday at midnight UTC) ───────────────
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDay() !== 0 || now.getUTCHours() !== 0) return; // Only Sunday 00:xx UTC
  try {
    // Reset previous weekly winners
    await pool.query(`UPDATE community_clip_posts SET weekly_winner = false WHERE weekly_winner = true`);
    // Set new weekly winner per channel (top upvoted in last 7 days)
    await pool.query(
      `UPDATE community_clip_posts SET weekly_winner = true
       WHERE id IN (
         SELECT DISTINCT ON (channel_id) id
         FROM community_clip_posts
         WHERE created_at >= now() - INTERVAL '7 days' AND upvotes > 0
         ORDER BY channel_id, upvotes DESC
       )`
    );
    logger.info("clip: weekly winner sweep done");
  } catch (err) {
    logger.error({ err }, "clip: weekly winner sweep failed");
  }
}, 30 * 60 * 1000); // check every 30 min

export default router;
