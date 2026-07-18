import { Router, type IRouter } from "express";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  partiesTable,
  partyMembersTable,
  partyInvitesTable,
  partyActivityTable,
  conversationsTable,
  conversationParticipantsTable,
  friendshipsTable,
  notificationsTable,
} from "@workspace/db";
import { CreatePartyBody, UpdatePartyBody, InviteToPartyBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { evictUserFromRoom } from "../ws/signaling";

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

async function buildParty(party: typeof partiesTable.$inferSelect) {
  const [leader] = await db.select().from(usersTable).where(eq(usersTable.id, party.leaderId));

  const memberRows = await db
    .select({ user: usersTable })
    .from(partyMembersTable)
    .innerJoin(usersTable, eq(partyMembersTable.userId, usersTable.id))
    .where(eq(partyMembersTable.partyId, party.id));

  return {
    id: party.id,
    name: party.name,
    game: party.game ?? null,
    platform: party.platform ?? null,
    description: party.description ?? null,
    leader: safeUser(leader),
    members: memberRows.map((m) => safeUser(m.user)),
    maxSize: party.maxSize,
    isPublic: party.isPublic,
    conversationId: party.conversationId ?? null,
    createdAt: party.createdAt.toISOString(),
  };
}

// GET /parties/activity-feed — before /:partyId
router.get("/parties/activity-feed", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const myFriends = await db.select().from(friendshipsTable).where(eq(friendshipsTable.userId, myId));
  const friendIds = myFriends.map((f) => f.friendId);

  if (friendIds.length === 0) {
    res.json([]);
    return;
  }

  const activities = await db
    .select()
    .from(partyActivityTable)
    .where(inArray(partyActivityTable.actorId, friendIds))
    .orderBy(desc(partyActivityTable.createdAt))
    .limit(20);

  const result = await Promise.all(
    activities.map(async (a) => {
      const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, a.partyId));
      const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, a.actorId));
      if (!party || !actor) return null;
      return {
        id: a.id,
        party: await buildParty(party),
        actor: safeUser(actor),
        action: a.action,
        createdAt: a.createdAt.toISOString(),
      };
    })
  );

  res.json(result.filter(Boolean));
});

// GET /party-invites
router.get("/party-invites", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const invites = await db
    .select()
    .from(partyInvitesTable)
    .where(and(eq(partyInvitesTable.invitedUserId, myId), eq(partyInvitesTable.status, "pending")));

  const result = await Promise.all(
    invites.map(async (inv) => {
      const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, inv.partyId));
      const [invitedBy] = await db.select().from(usersTable).where(eq(usersTable.id, inv.invitedByUserId));
      if (!party || !invitedBy) return null;
      return {
        id: inv.id,
        party: await buildParty(party),
        invitedBy: safeUser(invitedBy),
        createdAt: inv.createdAt.toISOString(),
      };
    })
  );

  res.json(result.filter(Boolean));
});

// POST /party-invites/:inviteId/accept
router.post("/party-invites/:inviteId/accept", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.inviteId) ? req.params.inviteId[0] : req.params.inviteId;
  const inviteId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [invite] = await db.select().from(partyInvitesTable).where(eq(partyInvitesTable.id, inviteId));
  if (!invite || invite.invitedUserId !== myId) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (invite.status === "accepted") {
    // Already accepted — idempotent success
    const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, invite.partyId));
    res.json(await buildParty(party));
    return;
  }
  if (invite.status !== "pending") {
    res.status(409).json({ error: "Invite has already been declined" });
    return;
  }

  await db.update(partyInvitesTable).set({ status: "accepted" }).where(eq(partyInvitesTable.id, inviteId));

  // Add as member (idempotent — skip if already a member)
  const [existingMember] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, invite.partyId), eq(partyMembersTable.userId, myId)));
  if (!existingMember) {
    await db.insert(partyMembersTable).values({ partyId: invite.partyId, userId: myId });
    await db.insert(partyActivityTable).values({ partyId: invite.partyId, actorId: myId, action: "joined" });
  }

  // Add to party conversation if exists (idempotent — skip if already a participant)
  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, invite.partyId));
  if (party?.conversationId) {
    const [existingParticipant] = await db
      .select()
      .from(conversationParticipantsTable)
      .where(and(eq(conversationParticipantsTable.conversationId, party.conversationId), eq(conversationParticipantsTable.userId, myId)));
    if (!existingParticipant) {
      await db.insert(conversationParticipantsTable).values({ conversationId: party.conversationId, userId: myId });
    }
  }

  res.json(await buildParty(party));
});

// POST /party-invites/:inviteId/decline
router.post("/party-invites/:inviteId/decline", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.inviteId) ? req.params.inviteId[0] : req.params.inviteId;
  const inviteId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [invite] = await db.select().from(partyInvitesTable).where(eq(partyInvitesTable.id, inviteId));
  if (!invite || invite.invitedUserId !== myId) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  await db.update(partyInvitesTable).set({ status: "declined" }).where(eq(partyInvitesTable.id, inviteId));
  res.json({ success: true });
});

// GET /parties
router.get("/parties", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const myMemberships = await db.select().from(partyMembersTable).where(eq(partyMembersTable.userId, myId));
  const myPartyIds = myMemberships.map((m) => m.partyId);

  const parties = myPartyIds.length > 0
    ? await db
        .select()
        .from(partiesTable)
        .where(or(eq(partiesTable.isPublic, true), inArray(partiesTable.id, myPartyIds)))
        .orderBy(desc(partiesTable.createdAt))
    : await db.select().from(partiesTable).where(eq(partiesTable.isPublic, true)).orderBy(desc(partiesTable.createdAt));

  res.json(await Promise.all(parties.map(buildParty)));
});

// POST /parties
router.post("/parties", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const parsed = CreatePartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Create party conversation
  const [conv] = await db.insert(conversationsTable).values({ type: "party", name: parsed.data.name }).returning();
  await db.insert(conversationParticipantsTable).values({ conversationId: conv.id, userId: myId });

  const [party] = await db
    .insert(partiesTable)
    .values({ ...parsed.data, leaderId: myId, conversationId: conv.id, isPublic: parsed.data.isPublic ?? true })
    .returning();

  await db.insert(partyMembersTable).values({ partyId: party.id, userId: myId });
  await db.insert(partyActivityTable).values({ partyId: party.id, actorId: myId, action: "created" });

  res.status(201).json(await buildParty(party));
});

// GET /parties/:partyId
router.get("/parties/:partyId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }

  // Private parties are only visible to members
  if (!party.isPublic) {
    const [membership] = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, myId)));
    if (!membership) {
      res.status(403).json({ error: "This party is private" });
      return;
    }
  }

  res.json(await buildParty(party));
});

// PATCH /parties/:partyId
router.patch("/parties/:partyId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party || party.leaderId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdatePartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db.update(partiesTable).set(parsed.data).where(eq(partiesTable.id, partyId)).returning();
  res.json(await buildParty(updated));
});

// DELETE /parties/:partyId
router.delete("/parties/:partyId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party || party.leaderId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Remove all conversation participants so the chat disappears from everyone's list
  if (party.conversationId) {
    await db
      .delete(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, party.conversationId));
  }

  // Cascade in DB removes partyMembers / invites / activity rows automatically
  await db.delete(partiesTable).where(eq(partiesTable.id, partyId));
  res.json({ success: true });
});

// POST /parties/:partyId/invite
router.post("/parties/:partyId/invite", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  // Only members can invite others
  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, myId)));
  if (!membership) {
    res.status(403).json({ error: "Must be a party member to invite others" });
    return;
  }

  const parsed = InviteToPartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // If the target user is already a party member, an invite is pointless —
  // return success without creating an invite row or notification.
  const [targetMembership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, parsed.data.userId)));
  if (targetMembership) {
    res.json({ success: true });
    return;
  }

  // Idempotency: if a pending invite already exists for this user+party, return success without duplicating
  const [existingInvite] = await db
    .select()
    .from(partyInvitesTable)
    .where(
      and(
        eq(partyInvitesTable.partyId, partyId),
        eq(partyInvitesTable.invitedUserId, parsed.data.userId),
        eq(partyInvitesTable.status, "pending")
      )
    );
  if (existingInvite) {
    res.json({ success: true });
    return;
  }

  // Clear any stale party_invite notifications for this party+user pair.
  // relatedId stores the partyId, so we can match directly without a join.
  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, parsed.data.userId),
        eq(notificationsTable.type, "party_invite"),
        eq(notificationsTable.relatedId, partyId)
      )
    );

  // Use ON CONFLICT DO NOTHING so concurrent requests that race past the
  // pending-invite check above are handled atomically — no error is thrown,
  // the insert is silently skipped, and `inserted` is undefined.
  const [inv] = await db
    .insert(partyInvitesTable)
    .values({ partyId, invitedUserId: parsed.data.userId, invitedByUserId: myId })
    .onConflictDoNothing()
    .returning();

  if (!inv) {
    // A concurrent request won the race — treat as idempotent success.
    res.json({ success: true });
    return;
  }

  const [invitedBy] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
  await db.insert(notificationsTable).values({
    userId: parsed.data.userId,
    type: "party_invite",
    title: `${invitedBy.displayName} invited you to a party`,
    relatedId: partyId,   // store partyId so the frontend can navigate directly to /party/:partyId
  });

  await db.insert(partyActivityTable).values({ partyId, actorId: myId, action: "invited" });

  res.json({ success: true });
});

// POST /parties/:partyId/join
router.post("/parties/:partyId/join", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party) {
    res.status(404).json({ error: "Party not found" });
    return;
  }

  // Check existing membership FIRST — a current member never needs a new invite, even for private parties.
  // This also handles the repair case: if a member is in party_members but missing from
  // conversation_participants (e.g. partial failure), we restore their chat access here.
  const [existing] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, myId)));
  if (existing) {
    // Restore conversation access if the participant row is somehow missing
    if (party.conversationId) {
      const [existingParticipant] = await db
        .select()
        .from(conversationParticipantsTable)
        .where(and(eq(conversationParticipantsTable.conversationId, party.conversationId), eq(conversationParticipantsTable.userId, myId)));
      if (!existingParticipant) {
        await db.insert(conversationParticipantsTable).values({ conversationId: party.conversationId, userId: myId });
      }
    }
    res.json(await buildParty(party));
    return;
  }

  // Private parties require a pending invite (only reached for non-members)
  if (!party.isPublic) {
    const [invite] = await db
      .select()
      .from(partyInvitesTable)
      .where(and(eq(partyInvitesTable.partyId, partyId), eq(partyInvitesTable.invitedUserId, myId), eq(partyInvitesTable.status, "pending")));
    if (!invite) {
      res.status(403).json({ error: "An invite is required to join this private party" });
      return;
    }
    // Accept the invite automatically on join
    await db.update(partyInvitesTable).set({ status: "accepted" }).where(eq(partyInvitesTable.id, invite.id));
  }

  await db.insert(partyMembersTable).values({ partyId, userId: myId });

  if (party.conversationId) {
    await db.insert(conversationParticipantsTable).values({ conversationId: party.conversationId, userId: myId });
  }

  await db.insert(partyActivityTable).values({ partyId, actorId: myId, action: "joined" });

  res.json(await buildParty(party));
});

// POST /parties/:partyId/kick/:userId — leader kicks a member
router.post("/parties/:partyId/kick/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawParty = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const partyId = parseInt(rawParty, 10);
  const targetId = parseInt(rawUser, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party || party.leaderId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (targetId === myId) {
    res.status(400).json({ error: "Cannot kick yourself" });
    return;
  }

  await db.delete(partyMembersTable).where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, targetId)));
  await db.insert(partyActivityTable).values({ partyId, actorId: targetId, action: "left" });

  // Revoke access to party conversation
  if (party.conversationId) {
    await db
      .delete(conversationParticipantsTable)
      .where(and(eq(conversationParticipantsTable.conversationId, party.conversationId), eq(conversationParticipantsTable.userId, targetId)));
  }

  // Immediately evict from live voice session so the kicked user can't
  // continue relaying signaling frames in the in-memory party room.
  evictUserFromRoom(targetId, `party:${partyId}`);

  res.json({ success: true });
});

// POST /parties/:partyId/transfer/:userId — leader transfers leadership
router.post("/parties/:partyId/transfer/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawParty = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const partyId = parseInt(rawParty, 10);
  const targetId = parseInt(rawUser, 10);
  const myId = req.auth!.userId;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (!party || party.leaderId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (targetId === myId) {
    res.status(400).json({ error: "Already the leader" });
    return;
  }

  // Target must be a member
  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, targetId)));
  if (!membership) {
    res.status(400).json({ error: "Target user is not a party member" });
    return;
  }

  const [updated] = await db.update(partiesTable).set({ leaderId: targetId }).where(eq(partiesTable.id, partyId)).returning();
  res.json(await buildParty(updated));
});

// POST /parties/:partyId/leave
router.post("/parties/:partyId/leave", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.partyId) ? req.params.partyId[0] : req.params.partyId;
  const partyId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  // Verify active membership before allowing leave
  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, myId)));
  if (!membership) {
    res.status(400).json({ error: "Not a member of this party" });
    return;
  }

  // Remove from party
  await db.delete(partyMembersTable).where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, myId)));
  await db.insert(partyActivityTable).values({ partyId, actorId: myId, action: "left" });

  // Revoke access to party conversation
  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));
  if (party?.conversationId) {
    await db
      .delete(conversationParticipantsTable)
      .where(and(eq(conversationParticipantsTable.conversationId, party.conversationId), eq(conversationParticipantsTable.userId, myId)));
  }

  res.json({ success: true });
});

export default router;
