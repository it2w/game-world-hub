/**
 * Integration tests for party kick, transfer, and leave endpoints.
 *
 * Covered scenarios:
 *  - leader can kick a member
 *  - non-leader cannot kick (403)
 *  - leader cannot kick themselves (400)
 *  - kicked member is removed from party members
 *  - leader can transfer leadership to a member
 *  - non-leader cannot transfer (403)
 *  - cannot transfer to self (400)
 *  - cannot transfer to a non-member (400)
 *  - transfer updates leaderId on the party
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  partiesTable,
  partyMembersTable,
  partyInvitesTable,
  conversationsTable,
  conversationParticipantsTable,
  partyActivityTable,
  messagesTable,
  notificationsTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let leaderId = 0;
let memberId = 0;
let outsiderId = 0;
let partyId = 0;
let convId = 0;

const createdUserIds: number[] = [];
const createdPartyIds: number[] = [];
const createdConvIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `ptest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `PTest ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  const [l, m, o] = await db
    .insert(usersTable)
    .values([mkUser("leader"), mkUser("member"), mkUser("outsider")])
    .returning({ id: usersTable.id });
  leaderId = l.id;
  memberId = m.id;
  outsiderId = o.id;
  createdUserIds.push(leaderId, memberId, outsiderId);

  // Create a party conversation so kick also tests participant removal
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "party", name: `PTest Conv ${SUFFIX}` })
    .returning({ id: conversationsTable.id });
  convId = conv.id;
  createdConvIds.push(convId);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: convId, userId: leaderId },
    { conversationId: convId, userId: memberId },
  ]);

  const [party] = await db
    .insert(partiesTable)
    .values({
      name: `PTest Party ${SUFFIX}`,
      leaderId,
      isPublic: false,
      conversationId: convId,
    })
    .returning({ id: partiesTable.id });
  partyId = party.id;
  createdPartyIds.push(partyId);

  await db.insert(partyMembersTable).values([
    { partyId, userId: leaderId },
    { partyId, userId: memberId },
  ]);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdPartyIds.length) {
    await db.delete(partyMembersTable).where(
      inArray(partyMembersTable.partyId, createdPartyIds)
    );
    await db.delete(partyActivityTable).where(
      inArray(partyActivityTable.partyId, createdPartyIds)
    );
    await db
      .delete(partiesTable)
      .where(inArray(partiesTable.id, createdPartyIds));
  }
  if (createdConvIds.length) {
    await db
      .delete(conversationParticipantsTable)
      .where(inArray(conversationParticipantsTable.conversationId, createdConvIds));
    await db
      .delete(conversationsTable)
      .where(inArray(conversationsTable.id, createdConvIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function request(
  method: string,
  path: string,
  userId: number,
  username: string,
  body?: object
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId, username });
  const bodyStr = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(bodyStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
              }
            : {}),
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Kick tests ──────────────────────────────────────────────────────────────

describe("POST /parties/:partyId/kick/:userId", () => {
  test("leader can kick a member", async () => {
    // Re-add member to party_members and conversation_participants in case a prior test removed them
    const existingMember = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, partyId),
          eq(partyMembersTable.userId, memberId)
        )
      );
    if (!existingMember.length) {
      await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    }

    const existingParticipant = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    if (!existingParticipant.length) {
      await db.insert(conversationParticipantsTable).values({ conversationId: convId, userId: memberId });
    }

    const res = await request(
      "POST",
      `/parties/${partyId}/kick/${memberId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 200, "leader kick should succeed");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    // Member should no longer be in party_members
    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, partyId),
          eq(partyMembersTable.userId, memberId)
        )
      );
    assert.equal(memberRows.length, 0, "kicked member should be removed from party");

    // Member should no longer be a participant in the party conversation
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 0, "kicked member should lose access to party conversation");
  });

  test("non-leader cannot kick a member", async () => {
    // outsider is not the leader — should get 403
    const res = await request(
      "POST",
      `/parties/${partyId}/kick/${leaderId}`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(res.status, 403, "non-leader should be forbidden from kicking");
  });

  test("leader cannot kick themselves", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/kick/${leaderId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 400, "kicking yourself should return 400");
    assert.match(
      (res.body as { error: string }).error,
      /kick yourself/i
    );
  });

  test("kicked member cannot send messages to the party conversation", async () => {
    // Ensure member is NOT in conversation_participants (they were kicked in the first test)
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 0, "member should not be a participant after being kicked");

    const res = await request(
      "POST",
      `/conversations/${convId}/messages`,
      memberId,
      `ptest_member_${SUFFIX}`,
      { content: "should be rejected" }
    );
    assert.equal(res.status, 403, "kicked member should not be able to send messages to party conversation");
  });
});

// ─── Transfer tests ───────────────────────────────────────────────────────────

describe("POST /parties/:partyId/transfer/:userId", () => {
  // Before transfer tests, ensure memberId is back in the party
  before(async () => {
    const existing = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, partyId),
          eq(partyMembersTable.userId, memberId)
        )
      );
    if (!existing.length) {
      await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    }
  });

  test("non-leader cannot transfer leadership", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/transfer/${leaderId}`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(res.status, 403, "non-leader should be forbidden from transferring");
  });

  test("leader cannot transfer to themselves", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/transfer/${leaderId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 400, "transferring to yourself should return 400");
    assert.match(
      (res.body as { error: string }).error,
      /already the leader/i
    );
  });

  test("leader cannot transfer to a non-member", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/transfer/${outsiderId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 400, "transferring to a non-member should return 400");
    assert.match(
      (res.body as { error: string }).error,
      /not a party member/i
    );
  });

  test("transfer changes the leaderId of the party", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/transfer/${memberId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 200, "valid transfer should succeed");

    const party = res.body as { leader: { id: number } };
    assert.equal(party.leader.id, memberId, "leader should now be the transferred member");

    // Verify in DB
    const [row] = await db
      .select()
      .from(partiesTable)
      .where(eq(partiesTable.id, partyId));
    assert.equal(row.leaderId, memberId, "DB should reflect new leaderId");

    // Restore original leader so teardown works cleanly
    await db
      .update(partiesTable)
      .set({ leaderId })
      .where(eq(partiesTable.id, partyId));
  });
});

// ─── Leave tests ──────────────────────────────────────────────────────────────

describe("POST /parties/:partyId/leave", () => {
  // Ensure member is in both party_members and conversation_participants before each leave test
  before(async () => {
    const existingMember = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, partyId),
          eq(partyMembersTable.userId, memberId)
        )
      );
    if (!existingMember.length) {
      await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    }

    const existingParticipant = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    if (!existingParticipant.length) {
      await db.insert(conversationParticipantsTable).values({ conversationId: convId, userId: memberId });
    }
  });

  test("leaving removes member from party conversation participants", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/leave`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(res.status, 200, "leave should succeed");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    // Member should no longer be in party_members
    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(
          eq(partyMembersTable.partyId, partyId),
          eq(partyMembersTable.userId, memberId)
        )
      );
    assert.equal(memberRows.length, 0, "member should be removed from party after leaving");

    // Member should no longer be a participant in the party conversation
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 0, "member should lose access to party conversation after leaving");
  });

  test("member who left cannot send messages to the party conversation", async () => {
    // Member already left in the previous test — confirm they're not a participant
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 0, "member should not be a participant after leaving");

    const res = await request(
      "POST",
      `/conversations/${convId}/messages`,
      memberId,
      `ptest_member_${SUFFIX}`,
      { content: "should be rejected" }
    );
    assert.equal(res.status, 403, "member who left should not be able to send messages to party conversation");
  });
});

// ─── Conversation-participant gap repair ───────────────────────────────────────

describe("POST /parties/:partyId/join — member in party_members but missing from conversation_participants", () => {
  // Set up: member is in party_members but NOT in conversation_participants
  before(async () => {
    // Ensure member is in party_members
    const existing = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    if (!existing.length) {
      await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    }
    // Remove from conversation_participants to simulate the gap
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
  });

  test("join restores conversation_participants when member row already exists", async () => {
    // Confirm the gap: member IS in party_members
    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    assert.equal(memberRows.length, 1, "member should already be in party_members");

    // Confirm the gap: member is NOT in conversation_participants
    const beforeParticipants = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(beforeParticipants.length, 0, "member should not be in conversation_participants before join");

    // No invite is inserted — existing members must be restored without needing a new invite,
    // even for private parties. The membership itself is the authorization proof.

    // Call join — this hits the idempotent path since member already exists in party_members
    const res = await request(
      "POST",
      `/parties/${partyId}/join`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(res.status, 200, "join should succeed even when already a member and no pending invite exists");

    // Confirm conversation access is now restored
    const afterParticipants = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(
      afterParticipants.length,
      1,
      "join should restore member to conversation_participants when the row was missing"
    );
  });
});

// ─── Re-join tests ────────────────────────────────────────────────────────────

describe("POST /parties/:partyId/join — re-join after leave", () => {
  // Ensure member is fully in the party and conversation before each test in this block
  before(async () => {
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    await db
      .insert(conversationParticipantsTable)
      .values({ conversationId: convId, userId: memberId });
  });

  test("re-joining restores member to conversation_participants", async () => {
    // Step 1: leave
    const leaveRes = await request(
      "POST",
      `/parties/${partyId}/leave`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(leaveRes.status, 200, "leave should succeed");

    // Confirm removed from conversation_participants
    const afterLeave = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(afterLeave.length, 0, "should not be a conversation participant after leaving");

    // Step 2: create a pending invite so re-join is allowed for this private party
    await db.insert(partyInvitesTable).values({
      partyId,
      invitedUserId: memberId,
      invitedByUserId: leaderId,
      status: "pending",
    });

    // Step 3: re-join
    const joinRes = await request(
      "POST",
      `/parties/${partyId}/join`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(joinRes.status, 200, "re-join should succeed");

    // Confirm restored to party_members
    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(
        and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId))
      );
    assert.equal(memberRows.length, 1, "re-joined member should be back in party_members");

    // Confirm restored to conversation_participants
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 1, "re-joined member should be back in conversation_participants");
  });

  test("re-joined member can send a message to the party conversation", async () => {
    // Ensure a clean starting state: member in party + conversation
    const existingMember = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    if (!existingMember.length) {
      await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    }
    const existingParticipant = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    if (!existingParticipant.length) {
      await db
        .insert(conversationParticipantsTable)
        .values({ conversationId: convId, userId: memberId });
    }

    // Leave
    const leaveRes = await request(
      "POST",
      `/parties/${partyId}/leave`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(leaveRes.status, 200, "leave should succeed");

    // Create invite and re-join
    await db.insert(partyInvitesTable).values({
      partyId,
      invitedUserId: memberId,
      invitedByUserId: leaderId,
      status: "pending",
    });
    const joinRes = await request(
      "POST",
      `/parties/${partyId}/join`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(joinRes.status, 200, "re-join should succeed");

    // Send a message — should succeed (201), not be blocked (403)
    const msgRes = await request(
      "POST",
      `/conversations/${convId}/messages`,
      memberId,
      `ptest_member_${SUFFIX}`,
      { content: "back in the party!" }
    );
    assert.equal(msgRes.status, 201, "re-joined member should be able to send messages to the party conversation");

    // Verify the message was persisted
    const [savedMsg] = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, convId),
          eq(messagesTable.senderId, memberId)
        )
      );
    assert.ok(savedMsg, "message should exist in the database");
    assert.equal(savedMsg.content, "back in the party!");
  });
});

// ─── Accept-invite re-join after kick tests ───────────────────────────────────

describe("POST /party-invites/:inviteId/accept — re-join after kick", () => {
  // Before each test: put member back in party + conversation so kick works cleanly
  before(async () => {
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    await db.insert(conversationParticipantsTable).values({ conversationId: convId, userId: memberId });
  });

  test("accepting a new invite after being kicked restores conversation_participants", async () => {
    // Step 1: kick the member
    const kickRes = await request(
      "POST",
      `/parties/${partyId}/kick/${memberId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(kickRes.status, 200, "kick should succeed");

    // Confirm removed from conversation_participants
    const afterKick = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(afterKick.length, 0, "kicked member should have no participant row");

    // Step 2: leader sends a fresh invite
    const [inv] = await db
      .insert(partyInvitesTable)
      .values({
        partyId,
        invitedUserId: memberId,
        invitedByUserId: leaderId,
        status: "pending",
      })
      .returning({ id: partyInvitesTable.id });

    // Step 3: member accepts the invite via the accept endpoint
    const acceptRes = await request(
      "POST",
      `/party-invites/${inv.id}/accept`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(acceptRes.status, 200, "invite accept should succeed");

    // Confirm restored to conversation_participants
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );
    assert.equal(participantRows.length, 1, "accepted invite should restore member to conversation_participants");
  });

  test("member accepted via invite can send a message to the party conversation", async () => {
    // Ensure clean state: member kicked and not in conversation
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, memberId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, memberId)
        )
      );

    // Re-add so kick endpoint can remove them
    await db.insert(partyMembersTable).values({ partyId, userId: memberId });
    await db.insert(conversationParticipantsTable).values({ conversationId: convId, userId: memberId });

    // Kick
    const kickRes = await request(
      "POST",
      `/parties/${partyId}/kick/${memberId}`,
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(kickRes.status, 200, "kick should succeed");

    // Create and accept a fresh invite
    const [inv] = await db
      .insert(partyInvitesTable)
      .values({
        partyId,
        invitedUserId: memberId,
        invitedByUserId: leaderId,
        status: "pending",
      })
      .returning({ id: partyInvitesTable.id });

    const acceptRes = await request(
      "POST",
      `/party-invites/${inv.id}/accept`,
      memberId,
      `ptest_member_${SUFFIX}`
    );
    assert.equal(acceptRes.status, 200, "invite accept should succeed");

    // Attempt to send a message — should succeed (201)
    const msgRes = await request(
      "POST",
      `/conversations/${convId}/messages`,
      memberId,
      `ptest_member_${SUFFIX}`,
      { content: "re-invited after kick!" }
    );
    assert.equal(msgRes.status, 201, "member re-invited after kick should be able to send messages");

    // Verify the message was persisted
    const [savedMsg] = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, convId),
          eq(messagesTable.senderId, memberId),
          eq(messagesTable.content, "re-invited after kick!")
        )
      );
    assert.ok(savedMsg, "message should exist in the database");
  });
});

// ─── Declined-invite re-accept tests ─────────────────────────────────────────

describe("POST /party-invites/:inviteId/accept — cannot accept a declined invite", () => {
  let declinedInviteId = 0;

  before(async () => {
    // Ensure outsider is not already a member or participant
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );

    // Create a pending invite and immediately decline it
    const [inv] = await db
      .insert(partyInvitesTable)
      .values({
        partyId,
        invitedUserId: outsiderId,
        invitedByUserId: leaderId,
        status: "pending",
      })
      .returning({ id: partyInvitesTable.id });
    declinedInviteId = inv.id;

    await db
      .update(partyInvitesTable)
      .set({ status: "declined" })
      .where(eq(partyInvitesTable.id, declinedInviteId));
  });

  test("accepting a declined invite returns 409", async () => {
    const res = await request(
      "POST",
      `/party-invites/${declinedInviteId}/accept`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(res.status, 409, "accepting a declined invite should return 409");
    assert.match(
      (res.body as { error: string }).error,
      /declined/i
    );
  });

  test("user is not added to party_members after attempting to accept a declined invite", async () => {
    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    assert.equal(memberRows.length, 0, "user must not be in party_members after a rejected re-accept");
  });

  test("user is not added to conversation_participants after attempting to accept a declined invite", async () => {
    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
    assert.equal(participantRows.length, 0, "user must not be in conversation_participants after a rejected re-accept");
  });
});

// ─── Idempotent-accept tests ───────────────────────────────────────────────────

describe("POST /party-invites/:inviteId/accept — idempotency", () => {
  // Use outsiderId as the invitee so state is fully controlled within this block.
  let idempInviteId = 0;

  before(async () => {
    // Ensure outsider is not already a member or participant before we start.
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );

    const [inv] = await db
      .insert(partyInvitesTable)
      .values({
        partyId,
        invitedUserId: outsiderId,
        invitedByUserId: leaderId,
        status: "pending",
      })
      .returning({ id: partyInvitesTable.id });
    idempInviteId = inv.id;
  });

  after(async () => {
    // Clean up outsider membership added by these tests.
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
  });

  test("first accept returns 200 and adds member + participant", async () => {
    const res = await request(
      "POST",
      `/party-invites/${idempInviteId}/accept`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(res.status, 200, "first accept should return 200");

    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    assert.equal(memberRows.length, 1, "exactly one party_members row after first accept");

    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
    assert.equal(participantRows.length, 1, "exactly one conversation_participants row after first accept");
  });

  test("second accept of the same invite returns 200 and does not duplicate rows", async () => {
    // Invite is already accepted from the previous test — call accept again.
    const res = await request(
      "POST",
      `/party-invites/${idempInviteId}/accept`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(res.status, 200, "second accept should still return 200 (idempotent)");

    const memberRows = await db
      .select()
      .from(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    assert.equal(memberRows.length, 1, "still exactly one party_members row after second accept");

    const participantRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
    assert.equal(participantRows.length, 1, "still exactly one conversation_participants row after second accept");
  });
});

// ─── Duplicate-invite deduplication tests ─────────────────────────────────────

describe("POST /parties/:partyId/invite — deduplication", () => {
  // Track the invite id created by the first invite so we can scope notification checks
  const inviteIds: number[] = [];

  before(async () => {
    // Ensure outsider is not a party member (they must not already be a member for invite to be meaningful)
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
    // Remove any pre-existing pending invites for outsider so the test starts clean
    await db
      .delete(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
  });

  after(async () => {
    // Clean up invites and their associated notifications created during this block
    if (inviteIds.length) {
      await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.relatedId, inviteIds));
      await db
        .delete(partyInvitesTable)
        .where(inArray(partyInvitesTable.id, inviteIds));
    }
  });

  test("first invite creates exactly one party_invites row and one notification", async () => {
    const res = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(res.status, 200, "first invite should succeed");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    const inviteRows = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(inviteRows.length, 1, "exactly one pending invite row after first invite");
    inviteIds.push(inviteRows[0].id);

    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsiderId),
          eq(notificationsTable.relatedId, inviteRows[0].id)
        )
      );
    assert.equal(notifRows.length, 1, "exactly one notification after first invite");
  });

  test("second invite to the same pending user returns success without adding a row or notification", async () => {
    // A pending invite already exists from the previous test — calling invite again must be a no-op
    const res = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(res.status, 200, "second invite should return success");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    // Still exactly one invite row
    const inviteRows = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(inviteRows.length, 1, "still exactly one pending invite row after second invite");

    // Still exactly one notification tied to the original invite
    assert.equal(inviteIds.length, 1, "inviteIds should contain the id from the first invite");
    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsiderId),
          eq(notificationsTable.relatedId, inviteIds[0])
        )
      );
    assert.equal(notifRows.length, 1, "still exactly one notification after second invite");
  });
});

// ─── Create-party-and-invite (LFG close dialog) tests ─────────────────────────

describe("POST /parties then POST /parties/:partyId/invite — LFG close-dialog create & invite flow", () => {
  // Simulate the sequence initiated when an author with no party clicks
  // "CREATE & INVITE" in the close-signal dialog.
  //
  // Covered assertions:
  //   1. POST /parties returns 201 with the new party; author is a member.
  //   2. GET /parties lists the new party for the author.
  //   3. POST /parties/:id/invite returns success and creates a party_invites row.
  //   4. A notification is delivered to the invitee.

  let newPartyId = 0;

  after(async () => {
    if (newPartyId) {
      // Find the conversation id before deleting anything.
      const [createdParty] = await db
        .select()
        .from(partiesTable)
        .where(eq(partiesTable.id, newPartyId));
      const convIdToDelete = createdParty?.conversationId ?? null;

      // Delete invite rows + their notifications first.
      const inviteRows = await db
        .select()
        .from(partyInvitesTable)
        .where(eq(partyInvitesTable.partyId, newPartyId));
      if (inviteRows.length) {
        await db
          .delete(notificationsTable)
          .where(inArray(notificationsTable.relatedId, inviteRows.map((r) => r.id)));
        await db.delete(partyInvitesTable).where(eq(partyInvitesTable.partyId, newPartyId));
      }
      await db.delete(partyMembersTable).where(eq(partyMembersTable.partyId, newPartyId));
      await db.delete(partyActivityTable).where(eq(partyActivityTable.partyId, newPartyId));

      // Delete the party row before the conversation (FK: parties → conversations).
      await db.delete(partiesTable).where(eq(partiesTable.id, newPartyId));

      if (convIdToDelete) {
        await db
          .delete(conversationParticipantsTable)
          .where(eq(conversationParticipantsTable.conversationId, convIdToDelete));
        await db
          .delete(conversationsTable)
          .where(eq(conversationsTable.id, convIdToDelete));
      }
    }
  });

  test("POST /parties returns 201 and the author appears as a member", async () => {
    const res = await request(
      "POST",
      "/parties",
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { name: `LFG Close Party ${SUFFIX}`, maxSize: 4 }
    );
    assert.equal(res.status, 201, "create party should return 201");

    const body = res.body as { id: number; name: string; members: { id: number }[] };
    assert.ok(body.id, "response must include a party id");
    assert.equal(body.name, `LFG Close Party ${SUFFIX}`, "party name must match");

    const isMember = body.members.some((m) => m.id === leaderId);
    assert.ok(isMember, "author must be a member of the newly created party");

    newPartyId = body.id;
    createdPartyIds.push(newPartyId);
  });

  test("GET /parties lists the new party for the author", async () => {
    assert.ok(newPartyId > 0, "newPartyId must be set by the previous test");

    const res = await request(
      "GET",
      "/parties",
      leaderId,
      `ptest_leader_${SUFFIX}`
    );
    assert.equal(res.status, 200, "GET /parties should return 200");

    const list = res.body as { id: number }[];
    const found = list.some((p) => p.id === newPartyId);
    assert.ok(found, "newly created party must appear in GET /parties for the author");
  });

  test("POST /parties/:partyId/invite returns success and creates a party_invites row", async () => {
    assert.ok(newPartyId > 0, "newPartyId must be set by an earlier test");

    const res = await request(
      "POST",
      `/parties/${newPartyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(res.status, 200, "invite should return 200");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    // Confirm the invite row exists in the DB.
    const inviteRows = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, newPartyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(inviteRows.length, 1, "exactly one pending invite row must be created");
  });

  test("a notification is delivered to the invited responder", async () => {
    assert.ok(newPartyId > 0, "newPartyId must be set by an earlier test");

    // Find the invite row to tie the notification check to the correct relatedId.
    const inviteRows = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, newPartyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(inviteRows.length, 1, "invite row must exist before checking notification");

    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsiderId),
          eq(notificationsTable.relatedId, inviteRows[0].id)
        )
      );
    assert.equal(notifRows.length, 1, "exactly one notification must be delivered to the invitee");
    assert.equal(notifRows[0].type, "party_invite", "notification type must be party_invite");
  });
});

// ─── Re-invite after decline / accept tests ────────────────────────────────────

describe("POST /parties/:partyId/invite — re-invite after declined or accepted invite", () => {
  // Use outsiderId so membership state is fully controlled.
  // Track all invite ids for cleanup.
  const createdInviteIds: number[] = [];

  before(async () => {
    // Ensure outsider has no membership, conversation access, or pending invites going in.
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
    await db
      .delete(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId)
        )
      );
  });

  after(async () => {
    // Clean up all invites and their notifications created during this block.
    if (createdInviteIds.length) {
      await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.relatedId, createdInviteIds));
      await db
        .delete(partyInvitesTable)
        .where(inArray(partyInvitesTable.id, createdInviteIds));
    }
    // Also remove any party membership outsider may have gained.
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );
  });

  test("re-inviting after a declined invite creates a new row and new notification", async () => {
    // Step 1: send the first invite via the HTTP endpoint.
    const firstRes = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(firstRes.status, 200, "first invite should succeed");

    // Grab the row that was created.
    const [firstInvite] = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.ok(firstInvite, "first invite row must exist");
    createdInviteIds.push(firstInvite.id);

    // Step 2: decline the first invite.
    const declineRes = await request(
      "POST",
      `/party-invites/${firstInvite.id}/decline`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(declineRes.status, 200, "decline should succeed");

    // Confirm no pending invite remains.
    const pendingAfterDecline = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(pendingAfterDecline.length, 0, "no pending invite should remain after decline");

    // Step 3: send the invite again — should create a fresh row and notification.
    const secondRes = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(secondRes.status, 200, "re-invite after decline should succeed");
    assert.deepEqual((secondRes.body as { success: boolean }).success, true);

    // There should now be exactly one new pending invite row.
    const pendingAfterReInvite = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(pendingAfterReInvite.length, 1, "exactly one new pending invite row after re-invite");

    const newInvite = pendingAfterReInvite[0];
    assert.notEqual(newInvite.id, firstInvite.id, "re-invite must create a distinct row, not reuse the old one");
    createdInviteIds.push(newInvite.id);

    // There should be exactly one notification for the new invite.
    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsiderId),
          eq(notificationsTable.relatedId, newInvite.id)
        )
      );
    assert.equal(notifRows.length, 1, "a new notification must be created for the re-invite");

    // Step 4: decline the new invite so the next test starts clean.
    await db
      .update(partyInvitesTable)
      .set({ status: "declined" })
      .where(eq(partyInvitesTable.id, newInvite.id));
  });

  test("re-inviting after an accepted invite creates a new row and new notification", async () => {
    // Precondition: outsider must not be a party member (they've never joined in this block).
    await db
      .delete(partyMembersTable)
      .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, outsiderId)));
    await db
      .delete(conversationParticipantsTable)
      .where(
        and(
          eq(conversationParticipantsTable.conversationId, convId),
          eq(conversationParticipantsTable.userId, outsiderId)
        )
      );

    // Step 1: send the first invite via the HTTP endpoint.
    const firstRes = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(firstRes.status, 200, "first invite should succeed");

    const [firstInvite] = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.ok(firstInvite, "first invite row must exist");
    createdInviteIds.push(firstInvite.id);

    // Step 2: accept the invite so status becomes 'accepted'.
    const acceptRes = await request(
      "POST",
      `/party-invites/${firstInvite.id}/accept`,
      outsiderId,
      `ptest_outsider_${SUFFIX}`
    );
    assert.equal(acceptRes.status, 200, "accept should succeed");

    // Confirm no pending invite remains.
    const pendingAfterAccept = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(pendingAfterAccept.length, 0, "no pending invite should remain after accept");

    // Step 3: send the invite again — should create a fresh row and notification.
    const secondRes = await request(
      "POST",
      `/parties/${partyId}/invite`,
      leaderId,
      `ptest_leader_${SUFFIX}`,
      { userId: outsiderId }
    );
    assert.equal(secondRes.status, 200, "re-invite after accept should succeed");
    assert.deepEqual((secondRes.body as { success: boolean }).success, true);

    // There should now be exactly one new pending invite row.
    const pendingAfterReInvite = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsiderId),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(pendingAfterReInvite.length, 1, "exactly one new pending invite row after re-invite");

    const newInvite = pendingAfterReInvite[0];
    assert.notEqual(newInvite.id, firstInvite.id, "re-invite must create a distinct row, not reuse the accepted one");
    createdInviteIds.push(newInvite.id);

    // There should be exactly one notification for the new invite.
    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsiderId),
          eq(notificationsTable.relatedId, newInvite.id)
        )
      );
    assert.equal(notifRows.length, 1, "a new notification must be created for the re-invite after accept");
  });
});

// ─── Concurrent-invite deduplication tests ────────────────────────────────────

describe("POST /parties/:partyId/invite — concurrent requests", () => {
  // A second outsider so this describe block is isolated from the sequential-dedup block above
  let outsider2Id = 0;
  const concurrentInviteIds: number[] = [];

  before(async () => {
    // Create a fresh user so no prior invite state exists
    const [u] = await db
      .insert(usersTable)
      .values({
        username: `ptest_outsider2_${SUFFIX}`,
        passwordHash: "x",
        displayName: `PTest Outsider2`,
        status: "online" as const,
      })
      .returning({ id: usersTable.id });
    outsider2Id = u.id;
    createdUserIds.push(outsider2Id);

    // Ensure no pending invite for this user exists
    await db
      .delete(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsider2Id),
          eq(partyInvitesTable.status, "pending")
        )
      );
  });

  after(async () => {
    if (concurrentInviteIds.length) {
      await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.relatedId, concurrentInviteIds));
      await db
        .delete(partyInvitesTable)
        .where(inArray(partyInvitesTable.id, concurrentInviteIds));
    }
  });

  test("two simultaneous invite requests produce exactly one invite row, one notification, and both return success", async () => {
    // Fire two concurrent POST /parties/:partyId/invite requests for the same user
    const [res1, res2] = await Promise.all([
      request(
        "POST",
        `/parties/${partyId}/invite`,
        leaderId,
        `ptest_leader_${SUFFIX}`,
        { userId: outsider2Id }
      ),
      request(
        "POST",
        `/parties/${partyId}/invite`,
        leaderId,
        `ptest_leader_${SUFFIX}`,
        { userId: outsider2Id }
      ),
    ]);

    // Both responses must be successful (idempotent)
    assert.equal(res1.status, 200, "first concurrent request should return 200");
    assert.deepEqual((res1.body as { success: boolean }).success, true, "first response body should be success");
    assert.equal(res2.status, 200, "second concurrent request should return 200");
    assert.deepEqual((res2.body as { success: boolean }).success, true, "second response body should be success");

    // Exactly one pending invite row must exist
    const inviteRows = await db
      .select()
      .from(partyInvitesTable)
      .where(
        and(
          eq(partyInvitesTable.partyId, partyId),
          eq(partyInvitesTable.invitedUserId, outsider2Id),
          eq(partyInvitesTable.status, "pending")
        )
      );
    assert.equal(inviteRows.length, 1, "exactly one pending invite row must exist after concurrent requests");
    concurrentInviteIds.push(inviteRows[0].id);

    // Exactly one notification must exist for that invite
    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, outsider2Id),
          eq(notificationsTable.relatedId, inviteRows[0].id)
        )
      );
    assert.equal(notifRows.length, 1, "exactly one notification must exist after concurrent requests");
  });
});
