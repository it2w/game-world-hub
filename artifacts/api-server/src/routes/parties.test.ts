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
