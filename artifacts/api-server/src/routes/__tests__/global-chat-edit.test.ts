/**
 * Integration tests — Task #230
 *
 * Confirms that PATCH /global-chat/messages/:id:
 *  1. Returns a payload with a non-null `editedAt` field and the updated content.
 *  2. Broadcasts a `message_edit` WS event to a second connected client
 *     that also carries a non-null `editedAt`.
 *
 * Messages are seeded directly via DB (bypassing the POST endpoint) so
 * the per-user send-rate-limit can never cause a 429 and make tests flaky.
 *
 * WS flow for the broadcast test:
 *   - Two users are created: a Pro editor and a plain observer.
 *   - The observer opens a WebSocket connection before the edit fires.
 *   - The Pro user edits an existing message via PATCH.
 *   - The observer's WS connection must receive a `message_edit` event
 *     whose `editedAt` is a non-null ISO string.
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
import { WebSocket } from "ws";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { attachSignaling } from "../../ws/signaling";
import app from "../../app";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;
let wsUrl: string;

let proUserId = 0;
let proUsername = "";
let observerUserId = 0;
let observerUsername = "";

const createdUserIds: number[] = [];
const createdMessageIds: number[] = [];

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Insert a message row directly — no rate-limit involvement. */
async function seedMessage(userId: number, content: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO global_chat_messages (user_id, content, channel)
     VALUES ($1, $2, 'general') RETURNING id`,
    [userId, content],
  );
  const id = rows[0]!.id;
  createdMessageIds.push(id);
  return id;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function httpCall(
  method: string,
  path: string,
  body: unknown,
  asUserId: number,
  asUsername: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: asUserId, username: asUsername });
  return new Promise((resolve, reject) => {
    const raw = body != null ? JSON.stringify(body) : undefined;
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port:     url.port,
        path:     url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(raw
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw) }
            : {}),
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) { resolve({ status: res.statusCode ?? 0, body: null }); return; }
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    req.on("error", reject);
    if (raw) req.write(raw);
    req.end();
  });
}

function patch(path: string, body: unknown, asUserId: number, asUsername: string) {
  return httpCall("PATCH", path, body, asUserId, asUsername);
}

// ── WS helper — opens a connection and collects messages ──────────────────────

function connectWs(
  userId: number,
  username: string,
): Promise<{ ws: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const token = signToken({ userId, username });
    const url = `${wsUrl}/api/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    const messages: unknown[] = [];

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("WS connect timeout"));
    }, 8_000);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve({ ws, messages });
    });
    ws.on("message", (data: Buffer) => {
      try { messages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });
    ws.on("error", reject);
  });
}

/** Poll until `predicate` returns truthy or the timeout elapses. */
async function waitFor(predicate: () => unknown, timeoutMs = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: timed out");
    await new Promise(r => setTimeout(r, 50));
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

before(async () => {
  // Wait for global-chat DDL (ensureTables runs on import).
  for (let i = 0; i < 40; i++) {
    try {
      await pool.query(`SELECT edited_at FROM global_chat_messages LIMIT 0`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Create a Pro user (editor) and a plain observer.
  const [u1, u2] = await db
    .insert(usersTable)
    .values([
      {
        username:     `gce_pro_${SUFFIX}`,
        passwordHash: "x",
        displayName:  "GceProUser",
        isPro:        true,
        status:       "online" as const,
      },
      {
        username:     `gce_obs_${SUFFIX}`,
        passwordHash: "x",
        displayName:  "GceObserver",
        isPro:        false,
        status:       "online" as const,
      },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  proUserId        = u1.id;
  proUsername      = u1.username;
  observerUserId   = u2.id;
  observerUsername = u2.username;
  createdUserIds.push(proUserId, observerUserId);

  // Start HTTP server and attach WS signaling.
  server = createServer(app);
  attachSignaling(server);
  await new Promise<void>(resolve => server.listen(0, resolve));

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
  wsUrl   = `ws://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));

  // Clean up messages first (FK → users), then users.
  if (createdMessageIds.length) {
    await pool.query(
      `DELETE FROM global_chat_messages WHERE id = ANY($1)`,
      [createdMessageIds],
    );
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /global-chat/messages/:id — HTTP response", () => {
  test("returns editedAt and updated content in the HTTP response", async () => {
    // Seed message directly in DB — no rate-limit exposure.
    const msgId = await seedMessage(proUserId, "hello from pro");

    const patchRes = await patch(
      `/global-chat/messages/${msgId}`,
      { content: "edited content" },
      proUserId,
      proUsername,
    );
    assert.equal(patchRes.status, 200, `PATCH failed: ${JSON.stringify(patchRes.body)}`);

    const edited = patchRes.body as { editedAt?: string; messageId: number; content?: string };
    assert.ok(
      edited.editedAt != null,
      "PATCH response must include a non-null editedAt",
    );
    assert.ok(
      !isNaN(Date.parse(edited.editedAt!)),
      `editedAt must be a valid ISO string; got: ${edited.editedAt}`,
    );
    assert.equal(edited.messageId, msgId, "messageId must match the edited message");
  });
});

describe("PATCH /global-chat/messages/:id — WS broadcast", () => {
  test("observer receives a message_edit WS event with non-null editedAt", async () => {
    // Seed the message in the DB so no POST / rate-limit is needed.
    const msgId = await seedMessage(proUserId, "original message for edit test");

    // Connect observer before the edit so they are already registered.
    const { ws: observerWs, messages: observerMessages } = await connectWs(
      observerUserId,
      observerUsername,
    );
    // Also connect the Pro user so broadcastAll finds two clients.
    const { ws: proWs } = await connectWs(proUserId, proUsername);

    try {
      const patchRes = await patch(
        `/global-chat/messages/${msgId}`,
        { content: "edited message content" },
        proUserId,
        proUsername,
      );
      assert.equal(patchRes.status, 200, `PATCH failed: ${JSON.stringify(patchRes.body)}`);

      // Wait for the observer's WS to receive the message_edit event.
      await waitFor(() =>
        observerMessages.some(
          (m: any) => m.type === "message_edit" && m.messageId === msgId,
        ),
      );

      const editEvent = observerMessages.find(
        (m: any) => m.type === "message_edit" && m.messageId === msgId,
      ) as any;

      assert.ok(editEvent != null, "observer must receive a message_edit WS event");
      assert.equal(editEvent.type, "message_edit");
      assert.equal(editEvent.messageId, msgId);
      assert.ok(
        editEvent.editedAt != null,
        "WS message_edit event must carry a non-null editedAt",
      );
      assert.ok(
        !isNaN(Date.parse(editEvent.editedAt)),
        `editedAt in WS event must be a valid ISO string; got: ${editEvent.editedAt}`,
      );
      assert.equal(
        editEvent.content,
        "edited message content",
        "WS event must carry the updated content",
      );
      assert.equal(editEvent.channel, "general", "WS event must carry the channel");
    } finally {
      observerWs.terminate();
      proWs.terminate();
    }
  });
});

describe("PATCH /global-chat/messages/:id — access control", () => {
  test("non-Pro user cannot edit (403)", async () => {
    const msgId = await seedMessage(proUserId, "message for non-pro edit attempt");

    const patchRes = await patch(
      `/global-chat/messages/${msgId}`,
      { content: "should not work" },
      observerUserId,
      observerUsername,
    );
    assert.equal(
      patchRes.status,
      403,
      `expected 403 for non-Pro edit, got ${patchRes.status}: ${JSON.stringify(patchRes.body)}`,
    );
  });

  test("Pro user cannot edit another user's message (403)", async () => {
    // Seed a message owned by the observer.
    const msgId = await seedMessage(observerUserId, "observer-owned message");

    const patchRes = await patch(
      `/global-chat/messages/${msgId}`,
      { content: "should not work" },
      proUserId,
      proUsername,
    );
    assert.equal(
      patchRes.status,
      403,
      `expected 403 when editing another user's message, got ${patchRes.status}`,
    );
  });
});
