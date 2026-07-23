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
  storedImagesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { pushToUser, broadcastAll } from "../ws/signaling";
import { logger } from "../lib/logger";
import {
  addCommunityVoicePresence,
  removeCommunityVoicePresenceForChannel,
  getCommunityVoicePresenceSnapshot,
  updateCommunityVoiceCameraState,
  updateCommunityVoiceScreenShareState,
} from "../lib/community-voice-presence";

// ─── Premium DDL ──────────────────────────────────────────────────────────────

export async function ensureCommunityPremiumTables(): Promise<void> {
  await pool.query(`
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
  `);
  logger.info("communities: premium tables ensured");
}

const router = Router();

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
    return p.can_kick === true || p.can_ban === true || p.can_manage_channels === true;
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

    const channels = await db
      .select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.communityId, community.id), eq(communityChannelsTable.isArchived, false)))
      .orderBy(asc(communityChannelsTable.position));

    const userId = req.auth!.userId;
    const membership = await getMembership(community.id, userId);

    res.json({ ...community, channels, isMember: !!membership && !membership.isBanned, isOwner: community.ownerId === userId });
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

    const { name, description, gameTag, privacy } = req.body ?? {};
    const updates: Partial<typeof communitiesTable.$inferInsert> = { updatedAt: new Date() };
    if (name && typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 100) {
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (gameTag !== undefined) updates.gameTag = gameTag?.trim() || null;
    if (privacy === "public" || privacy === "invite_only") updates.privacy = privacy;

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
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
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

// ─── Channels ─────────────────────────────────────────────────────────────────

router.get("/communities/:id/channels", requireAuth, async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const channels = await db
      .select()
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.communityId, id), eq(communityChannelsTable.isArchived, false)))
      .orderBy(asc(communityChannelsTable.position));
    res.json(channels);
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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, type } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) {
      res.status(400).json({ error: "name must be 1–100 characters" });
      return;
    }
    const channelType = type === "voice" ? "voice" : "text";
    const [maxPos] = await db
      .select({ pos: sql<number>`COALESCE(MAX(${communityChannelsTable.position}), -1)` })
      .from(communityChannelsTable)
      .where(eq(communityChannelsTable.communityId, id));

    const [channel] = await db
      .insert(communityChannelsTable)
      .values({ communityId: id, name: name.trim().toLowerCase().replace(/\s+/g, "-"), type: channelType, position: (maxPos?.pos ?? -1) + 1 })
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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const { name, position, slowmodeSeconds } = req.body ?? {};
    const updates: Partial<typeof communityChannelsTable.$inferInsert> = {};
    if (name && typeof name === "string") updates.name = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (typeof position === "number") updates.position = position;
    if (typeof slowmodeSeconds === "number") updates.slowmodeSeconds = Math.max(0, Math.min(slowmodeSeconds, 21600));

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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
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

    // Verify channel belongs to this community (prevents cross-community IDOR)
    const [channel] = await db.select({ id: communityChannelsTable.id })
      .from(communityChannelsTable)
      .where(and(eq(communityChannelsTable.id, cid), eq(communityChannelsTable.communityId, id)));
    if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

    const { content } = req.body ?? {};
    if (!content || typeof content !== "string" || content.trim().length === 0 || content.trim().length > 4000) {
      res.status(400).json({ error: "content must be 1–4000 characters" });
      return;
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
      const payload = {
        type: "community-message",
        communityId: id,
        channelId: cid,
        message: {
          ...msg,
          userId: author?.id,
          username: author?.username,
          displayName: author?.displayName,
          avatarUrl: toPublicImageUrl(author?.avatarUrl ?? null),
        },
      };
      for (const m of members) pushToUser(m.userId, payload);
    } catch { /* non-fatal */ }

    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json({
      ...msg,
      userId: author?.id,
      username: author?.username,
      displayName: author?.displayName,
      avatarUrl: toPublicImageUrl(author?.avatarUrl ?? null),
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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
    const { name, color, permissions, position } = req.body ?? {};
    const updates: Partial<typeof communityRolesTable.$inferInsert> = {};
    if (name && typeof name === "string") updates.name = name.trim();
    if (color) updates.color = color;
    if (permissions) updates.permissions = permissions;
    if (typeof position === "number") updates.position = position;
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
    if (!await isOwnerOrMod(id, userId)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    if (!await isOwnerOrMod(id, actorId)) { res.status(403).json({ error: "Forbidden" }); return; }
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
    const mod = await isOwnerOrMod(id, userId);
    if (!mod) { res.status(403).json({ error: "Only owner/mod can create polls" }); return; }
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
    const mod = await isOwnerOrMod(id, userId);
    if (!mod) { res.status(403).json({ error: "Forbidden" }); return; }
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
    if (community.ownerId !== userId) {
      const mod = await isOwnerOrMod(id, userId);
      if (!mod) { res.status(403).json({ error: "Only owner/mod can create invite links" }); return; }
    }
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
    const mod = await isOwnerOrMod(id, userId);
    if (!mod) { res.status(403).json({ error: "Forbidden" }); return; }
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
    const mod = await isOwnerOrMod(id, userId);
    if (!mod) { res.status(403).json({ error: "Forbidden" }); return; }
    await pool.query(`DELETE FROM community_invites WHERE community_id = $1 AND code = $2`, [id, code]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "communities: invite revoke failed");
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

// ─── Banner Image ─────────────────────────────────────────────────────────────

router.post("/communities/:id/banner", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const id = Number(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [community] = await db.select().from(communitiesTable).where(eq(communitiesTable.id, id));
    if (!community) { res.status(404).json({ error: "Not found" }); return; }
    if (community.ownerId !== userId) { res.status(403).json({ error: "Only owner can set banner" }); return; }

    const { data, mimeType } = req.body ?? {};
    if (!data || typeof data !== "string") { res.status(400).json({ error: "data (base64) required" }); return; }
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const mime = allowedMimes.includes(mimeType) ? mimeType : "image/jpeg";
    const buf = Buffer.from(data, "base64");
    if (buf.length > 4 * 1024 * 1024) { res.status(413).json({ error: "Banner must be < 4 MB" }); return; }

    const [stored] = await db.insert(storedImagesTable).values({ data: buf, contentType: mime }).returning({ id: storedImagesTable.id });
    const imageKey = `/api/images/${stored.id}`;
    await db.update(communitiesTable).set({ bannerKey: imageKey }).where(eq(communitiesTable.id, id));
    res.json({ bannerUrl: imageKey });
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
    if (community.ownerId !== userId) { res.status(403).json({ error: "Only owner can remove banner" }); return; }
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
    const mod = await isOwnerOrMod(id, userId);
    if (!mod) { res.status(403).json({ error: "Only owner/mod can pin messages" }); return; }
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

export default router;
