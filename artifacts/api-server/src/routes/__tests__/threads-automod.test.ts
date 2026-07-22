/**
 * Targeted tests for:
 *   1. Concurrent first-reply thread creation — verifies the ON CONFLICT upsert on
 *      message_threads(root_message_id) prevents duplicate thread rows and counts
 *      replies atomically.
 *   2. Admin automod upsert — verifies that repeated PUT /admin/automod calls succeed
 *      (idempotent ON CONFLICT) and that only one global row exists in automod_rules.
 *
 * Conversation and message fixtures are created directly via Drizzle (same pattern
 * as conversations.test.ts) so no dependency on HTTP-level conversation creation.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
} from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
} from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import app from "../../app";

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string; // includes /api prefix, e.g. http://127.0.0.1:PORT/api

let userId1 = 0; let username1 = "";
let userId2 = 0; let username2 = "";
let adminId = 0; let adminUsername = "";

const createdUserIds: number[] = [];
const createdConvIds: number[] = [];

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function req(
  method: string,
  path: string,   // relative to baseUrl, e.g. "/conversations/1/messages"
  uid: number,
  uname: string,
  body?: object,
): Promise<{ status: number; body: unknown }> {
  const token   = signToken({ userId: uid, username: uname });
  const bodyStr = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const r = httpRequest(
      {
        hostname: url.hostname,
        port:     url.port,
        path:     url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(bodyStr ? {
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
          } : {}),
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          if (!data) { resolve({ status: res.statusCode ?? 0, body: null }); return; }
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch   { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    r.on("error", reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

/** Create a direct conversation between u1 and u2 and seed one root message. */
async function createConvWithMessage(): Promise<{ convId: number; msgId: number }> {
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "direct" })
    .returning({ id: conversationsTable.id });
  const convId = conv.id;
  createdConvIds.push(convId);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: convId, userId: userId1 },
    { conversationId: convId, userId: userId2 },
  ]);

  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId: convId, senderId: userId1, content: "root message" })
    .returning({ id: messagesTable.id });

  return { convId, msgId: msg.id };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  const users = await db
    .insert(usersTable)
    .values([
      { username: `ta_u1_${SUFFIX}`,  passwordHash: "x", displayName: "TUser1", status: "online" as const },
      { username: `ta_u2_${SUFFIX}`,  passwordHash: "x", displayName: "TUser2", status: "online" as const },
      { username: `ta_adm_${SUFFIX}`, passwordHash: "x", displayName: "TAdmin", isAdmin: true, status: "online" as const },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [[userId1, username1], [userId2, username2], [adminId, adminUsername]] =
    users.map(u => [u.id, u.username]) as [number, string][];
  createdUserIds.push(...users.map(u => u.id));

  // Grant admin can_delete_content (required for PUT /admin/automod)
  await pool.query(
    `INSERT INTO admin_permissions (user_id, can_delete_content)
     VALUES ($1, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET can_delete_content = TRUE`,
    [adminId],
  );

  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  await new Promise<void>((res, rej) => server.close(e => e ? rej(e) : res()));

  // Clean up conversations (cascades threads + messages)
  if (createdConvIds.length) {
    await pool.query(
      `DELETE FROM conversations WHERE id = ANY($1::int[])`,
      [createdConvIds],
    );
  }
  // Clean up users
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  // Clean up any automod global row this suite created
  await pool.query(`DELETE FROM automod_rules WHERE conversation_id IS NULL`);
});

// ── Thread tests ─────────────────────────────────────────────────────────────

describe("Thread concurrent upsert", () => {
  test("concurrent first replies produce exactly one thread row with correct reply_count", async () => {
    const { convId, msgId } = await createConvWithMessage();

    // Fire two first-reply requests simultaneously
    const [r1, r2] = await Promise.all([
      req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
          userId1, username1, { content: "first concurrent reply" }),
      req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
          userId2, username2, { content: "second concurrent reply" }),
    ]);

    assert.equal(r1.status, 201, `reply1: ${JSON.stringify(r1.body)}`);
    assert.equal(r2.status, 201, `reply2: ${JSON.stringify(r2.body)}`);

    // Exactly ONE thread row must exist for this root message
    const { rows: threadRows } = await pool.query<{ id: number; reply_count: number }>(
      `SELECT id, reply_count FROM message_threads WHERE root_message_id = $1`,
      [msgId],
    );
    assert.equal(threadRows.length, 1,
      `Expected 1 thread row, got ${threadRows.length} — duplicate row created under concurrency`);

    const { reply_count: replyCount, id: threadId } = threadRows[0];

    // Both thread messages must have been inserted
    const { rows: msgRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM thread_messages WHERE thread_id = $1`,
      [threadId],
    );
    assert.equal(parseInt(msgRows[0].count, 10), 2,
      `Expected 2 thread messages, got ${msgRows[0].count}`);

    // reply_count must reflect both replies (atomic increment)
    assert.equal(replyCount, 2,
      `Expected reply_count=2, got ${replyCount} — atomic increment failed`);
  });

  test("sequential replies increment reply_count correctly", async () => {
    const { convId, msgId } = await createConvWithMessage();

    for (let i = 0; i < 3; i++) {
      const r = await req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
        userId1, username1, { content: `reply ${i}` });
      assert.equal(r.status, 201, `reply ${i}: ${JSON.stringify(r.body)}`);
    }

    const { rows } = await pool.query<{ reply_count: number }>(
      `SELECT reply_count FROM message_threads WHERE root_message_id = $1`,
      [msgId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reply_count, 3);
  });

  test("GET thread returns posted replies", async () => {
    const { convId, msgId } = await createConvWithMessage();

    await req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
      userId1, username1, { content: "hello thread" });

    // Correct route: GET /conversations/:cid/messages/:mid/thread
    const r = await req("GET", `/conversations/${convId}/messages/${msgId}/thread`,
      userId1, username1);
    assert.equal(r.status, 200, `get thread: ${JSON.stringify(r.body)}`);
    const body = r.body as { exists: boolean; messages: { content: string }[] };
    assert.equal(body.exists, true);
    assert.ok(Array.isArray(body.messages));
    assert.ok(body.messages.some(m => m.content === "hello thread"));
  });

  test("non-participant cannot post thread reply", async () => {
    const { convId, msgId } = await createConvWithMessage();
    // adminId is NOT a participant in this conversation
    const r = await req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
      adminId, adminUsername, { content: "should be forbidden" });
    assert.ok(r.status === 403,
      `Expected 403 for non-participant, got ${r.status}`);
  });
});

// ── AutoMod upsert tests ───────────────────────────────────────────────────────

describe("AutoMod upsert idempotency", () => {
  test("first PUT /admin/automod creates global row", async () => {
    const r = await req("PUT", "/admin/automod", adminId, adminUsername, {
      enabled: true,
      slowmodeSeconds: 5,
      maxLength: 1000,
      denylist: ["badword"],
    });
    assert.equal(r.status, 200, `first PUT: ${JSON.stringify(r.body)}`);

    const { rows } = await pool.query<{ enabled: boolean; slowmode_seconds: number; max_length: number }>(
      `SELECT enabled, slowmode_seconds, max_length FROM automod_rules WHERE conversation_id IS NULL`,
    );
    assert.equal(rows.length, 1, "Expected exactly 1 global automod row");
    assert.equal(rows[0].enabled, true);
    assert.equal(rows[0].slowmode_seconds, 5);
    assert.equal(rows[0].max_length, 1000);
  });

  test("second PUT /admin/automod updates without creating duplicate", async () => {
    const r = await req("PUT", "/admin/automod", adminId, adminUsername, {
      enabled: false,
      slowmodeSeconds: 0,
      maxLength: 500,
      denylist: [],
    });
    assert.equal(r.status, 200, `second PUT: ${JSON.stringify(r.body)}`);

    const { rows } = await pool.query<{ enabled: boolean; slowmode_seconds: number; max_length: number }>(
      `SELECT enabled, slowmode_seconds, max_length FROM automod_rules WHERE conversation_id IS NULL`,
    );
    assert.equal(rows.length, 1,
      `Expected 1 global row after second PUT, got ${rows.length} — duplicate created`);
    assert.equal(rows[0].enabled, false);
    assert.equal(rows[0].slowmode_seconds, 0);
    assert.equal(rows[0].max_length, 500);
  });

  test("concurrent PUT /admin/automod calls both succeed without duplicate", async () => {
    const [r1, r2] = await Promise.all([
      req("PUT", "/admin/automod", adminId, adminUsername, {
        enabled: true, slowmodeSeconds: 10, maxLength: 800, denylist: ["a"],
      }),
      req("PUT", "/admin/automod", adminId, adminUsername, {
        enabled: true, slowmodeSeconds: 20, maxLength: 900, denylist: ["b"],
      }),
    ]);
    assert.equal(r1.status, 200, `concurrent PUT 1: ${JSON.stringify(r1.body)}`);
    assert.equal(r2.status, 200, `concurrent PUT 2: ${JSON.stringify(r2.body)}`);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM automod_rules WHERE conversation_id IS NULL`,
    );
    assert.equal(parseInt(rows[0].count, 10), 1,
      "Duplicate global automod row created by concurrent PUTs");
  });

  test("GET /admin/automod returns 200 with expected shape", async () => {
    const r = await req("GET", "/admin/automod", adminId, adminUsername);
    assert.equal(r.status, 200, `GET automod: ${JSON.stringify(r.body)}`);
    const body = r.body as Record<string, unknown>;
    assert.ok("enabled" in body, "missing 'enabled'");
    assert.ok("slowmodeSeconds" in body, "missing 'slowmodeSeconds'");
    assert.ok("maxLength" in body, "missing 'maxLength'");
    assert.ok(Array.isArray(body.denylist), "'denylist' should be an array");
  });

  test("non-admin cannot access automod endpoints", async () => {
    const r = await req("GET", "/admin/automod", userId1, username1);
    assert.ok(r.status === 401 || r.status === 403,
      `Expected 401/403, got ${r.status}`);
  });
});

// ── AutoMod enforcement in thread replies and poll creation ───────────────────

describe("AutoMod enforcement — thread replies and polls", () => {
  // Enable a denylist rule before this group and disable after
  before(async () => {
    await req("PUT", "/admin/automod", adminId, adminUsername, {
      enabled: true,
      slowmodeSeconds: 0,
      maxLength: 2000,
      denylist: ["badword"],
    });
    // Flush the in-process cache so the new rule is picked up immediately
    await pool.query(`SELECT 1`); // no-op; cache is per-process; the test server reads from DB
  });

  after(async () => {
    // Disable AutoMod so subsequent tests are unaffected
    await req("PUT", "/admin/automod", adminId, adminUsername, {
      enabled: false,
      slowmodeSeconds: 0,
      maxLength: 2000,
      denylist: [],
    });
  });

  test("thread reply with denylist term is blocked with 429 + automod:true", async () => {
    const { convId, msgId } = await createConvWithMessage();

    const r = await req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
      userId1, username1, { content: "this contains badword lol" });

    assert.equal(r.status, 429, `Expected 429 for denylist hit, got ${r.status}: ${JSON.stringify(r.body)}`);
    const body = r.body as Record<string, unknown>;
    assert.equal(body.automod, true, "Expected automod:true in response body");
    assert.ok(typeof body.error === "string", "Expected error string in response body");
  });

  test("clean thread reply is allowed when AutoMod is enabled", async () => {
    const { convId, msgId } = await createConvWithMessage();

    const r = await req("POST", `/conversations/${convId}/messages/${msgId}/thread/messages`,
      userId1, username1, { content: "totally clean reply here" });

    assert.equal(r.status, 201, `Expected 201 for clean reply, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("poll creation with denylist term in question is blocked with 429 + automod:true", async () => {
    const { convId } = await createConvWithMessage();

    const r = await req("POST", `/conversations/${convId}/polls`,
      userId1, username1, {
        question: "Is badword a real word?",
        options: ["Yes", "No"],
      });

    assert.equal(r.status, 429, `Expected 429 for poll with denylist question, got ${r.status}: ${JSON.stringify(r.body)}`);
    const body = r.body as Record<string, unknown>;
    assert.equal(body.automod, true, "Expected automod:true in poll rejection body");
  });

  test("poll creation with denylist term in an option is blocked with 429 + automod:true", async () => {
    const { convId } = await createConvWithMessage();

    const r = await req("POST", `/conversations/${convId}/polls`,
      userId1, username1, {
        question: "Pick one",
        options: ["good option", "badword option"],
      });

    assert.equal(r.status, 429, `Expected 429 for poll with denylist option, got ${r.status}: ${JSON.stringify(r.body)}`);
    const body = r.body as Record<string, unknown>;
    assert.equal(body.automod, true, "Expected automod:true in poll option rejection body");
  });

  test("clean poll creation is allowed when AutoMod is enabled", async () => {
    const { convId } = await createConvWithMessage();

    const r = await req("POST", `/conversations/${convId}/polls`,
      userId1, username1, {
        question: "Favorite game genre?",
        options: ["RPG", "FPS", "Strategy"],
      });

    assert.equal(r.status, 201, `Expected 201 for clean poll, got ${r.status}: ${JSON.stringify(r.body)}`);
  });
});
