/**
 * Integration tests for conversation message-delete and conversation-hide endpoints.
 *
 * Covered scenarios:
 *  - message owner can delete their own message (204)
 *  - non-owner cannot delete another user's message (403)
 *  - deleting a non-existent message returns 404
 *  - hiding a conversation removes only the requester's participant row
 *  - non-participant cannot hide a conversation (403)
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  messageDeletionsTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let senderUser = 0;
let otherUser = 0;
let thirdUser = 0; // not a participant in any conversation
let directConvId = 0;

const createdUserIds: number[] = [];
const createdConvIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `ctest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `CTest ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  const [s, o, t] = await db
    .insert(usersTable)
    .values([mkUser("sender"), mkUser("other"), mkUser("third")])
    .returning({ id: usersTable.id });
  senderUser = s.id;
  otherUser = o.id;
  thirdUser = t.id;
  createdUserIds.push(senderUser, otherUser, thirdUser);

  // Create a direct conversation between senderUser and otherUser
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "direct" })
    .returning({ id: conversationsTable.id });
  directConvId = conv.id;
  createdConvIds.push(directConvId);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: directConvId, userId: senderUser },
    { conversationId: directConvId, userId: otherUser },
  ]);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdConvIds.length) {
    await db
      .delete(messagesTable)
      .where(inArray(messagesTable.conversationId, createdConvIds));
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
          if (!data) {
            resolve({ status: res.statusCode ?? 0, body: null });
            return;
          }
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

// Helper: insert a message and return its id
async function insertMessage(convId: number, senderId: number, content: string): Promise<number> {
  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId: convId, senderId, content })
    .returning({ id: messagesTable.id });
  return msg.id;
}

// ─── Message-delete tests ─────────────────────────────────────────────────────

describe("DELETE /conversations/:conversationId/messages/:messageId", () => {
  test("sender can delete their own message", async () => {
    const msgId = await insertMessage(directConvId, senderUser, "hello from sender");

    const res = await request(
      "DELETE",
      `/conversations/${directConvId}/messages/${msgId}`,
      senderUser,
      `ctest_sender_${SUFFIX}`
    );
    assert.equal(res.status, 204, "owner should be able to delete their message");

    // The implementation is a per-user soft-delete: the message row stays in
    // messagesTable but a deletion record is created in messageDeletionsTable.
    const deletions = await db
      .select()
      .from(messageDeletionsTable)
      .where(and(eq(messageDeletionsTable.messageId, msgId), eq(messageDeletionsTable.userId, senderUser)));
    assert.equal(deletions.length, 1, "a deletion record should be created for the sender");

    // Clean up the deletion record and message
    await db.delete(messageDeletionsTable).where(and(eq(messageDeletionsTable.messageId, msgId), eq(messageDeletionsTable.userId, senderUser)));
    await db.delete(messagesTable).where(eq(messagesTable.id, msgId));
  });

  test("non-owner cannot delete another user's message", async () => {
    const msgId = await insertMessage(directConvId, senderUser, "do not delete me");

    const res = await request(
      "DELETE",
      `/conversations/${directConvId}/messages/${msgId}`,
      otherUser,
      `ctest_other_${SUFFIX}`
    );
    assert.equal(res.status, 403, "non-owner should be forbidden from deleting the message");

    // Message should still exist
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, msgId));
    assert.equal(rows.length, 1, "message should still exist after failed delete");

    // Clean up
    await db.delete(messagesTable).where(eq(messagesTable.id, msgId));
  });

  test("deleting a non-existent message returns 404", async () => {
    const res = await request(
      "DELETE",
      `/conversations/${directConvId}/messages/9999999`,
      senderUser,
      `ctest_sender_${SUFFIX}`
    );
    assert.equal(res.status, 404, "deleting a non-existent message should return 404");
  });
});

// ─── Hide-conversation tests ──────────────────────────────────────────────────

describe("DELETE /conversations/:conversationId (hide)", () => {
  test("hiding a conversation marks only the requester's row as hidden", async () => {
    // Ensure both users are participants (they were added in `before`)
    const beforeRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, directConvId));
    const senderPresent = beforeRows.some((r) => r.userId === senderUser);
    const otherPresent = beforeRows.some((r) => r.userId === otherUser);
    assert.ok(senderPresent, "senderUser should be a participant before hiding");
    assert.ok(otherPresent, "otherUser should be a participant before hiding");

    // senderUser hides the conversation (soft-hide: sets isHidden = true)
    const res = await request(
      "DELETE",
      `/conversations/${directConvId}`,
      senderUser,
      `ctest_sender_${SUFFIX}`
    );
    assert.equal(res.status, 200, "hiding should succeed");
    assert.deepEqual((res.body as { success: boolean }).success, true);

    // Both rows still exist; only senderUser's row should have isHidden = true
    const afterRows = await db
      .select()
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, directConvId));

    const senderRow = afterRows.find((r) => r.userId === senderUser);
    const otherRow  = afterRows.find((r) => r.userId === otherUser);

    assert.ok(senderRow,  "senderUser's participant row should still exist (soft-hide)");
    assert.ok(otherRow,   "otherUser's participant row should still exist");
    assert.equal(senderRow!.isHidden, true,  "senderUser's row should be marked hidden");
    assert.equal(otherRow!.isHidden,  false, "otherUser's row should NOT be hidden");

    // Restore: un-hide sender's row for subsequent tests
    await db
      .update(conversationParticipantsTable)
      .set({ isHidden: false })
      .where(and(
        eq(conversationParticipantsTable.conversationId, directConvId),
        eq(conversationParticipantsTable.userId, senderUser),
      ));
  });

  test("non-participant cannot hide a conversation", async () => {
    // thirdUser is not a participant in directConvId
    const res = await request(
      "DELETE",
      `/conversations/${directConvId}`,
      thirdUser,
      `ctest_third_${SUFFIX}`
    );
    assert.equal(res.status, 403, "non-participant should be forbidden from hiding");
  });
});
