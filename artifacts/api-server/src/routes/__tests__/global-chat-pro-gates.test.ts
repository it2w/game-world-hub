/**
 * Integration tests — Task #195
 * Confirms that Pro-gated features (GIF messages, message-length cap,
 * pinning) and channel isolation are enforced on the global-chat routes.
 *
 * Covered scenarios:
 *  1. Non-Pro posting messageType:"gif" → 403
 *  2. Non-Pro posting message > 300 chars → 400
 *  3. Pro posting message > 800 chars → 400
 *  4. Pro posting message ≤ 800 chars → 201
 *  5. Non-Pro calling POST …/:id/pin → 403
 *  6. Pro pinning a message they don't own → 403
 *  7. GET /global-chat/pinned?channel=lfg never surfaces a pin recorded under "general"
 *  8. Expired pin is not returned by GET /global-chat/pinned
 *  9. GET /global-chat/messages?channel=lfg never returns messages posted to "general"
 * 10. gifUrl pointing to a non-Giphy/Tenor domain is stripped and not stored
 * 11. gifUrl pointing to a valid Giphy CDN URL is stored (smoke-check)
 *
 * Rate-limit note: the route applies a per-user cooldown (500 ms Pro / 1000 ms free).
 * Each test group that posts messages uses its own dedicated users so no
 * cross-group cooldown collisions can produce false 429s.
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

let server:    Server;
let baseUrl:   string;
let wsBaseUrl: string;

// GIF gate — each test gets its own user to avoid rate-limit cross-talk
let gifFreeId = 0; let gifFreeUsername = "";
let gifProId  = 0; let gifProUsername  = "";

// Message-length cap — dedicated users (one per POST so rate-limit never fires)
let lenFreeId  = 0; let lenFreeUsername  = "";
let lenFree2Id = 0; let lenFree2Username = "";
let lenPro1Id  = 0; let lenPro1Username  = "";
let lenPro2Id  = 0; let lenPro2Username  = "";

// Pin gate — owner + two Pro users + one lapse-simulation user
let pinFreeId  = 0; let pinFreeUsername  = "";
let pinProId   = 0; let pinProUsername   = "";
let pinPro2Id  = 0; let pinPro2Username  = "";
let lapPinId   = 0; let lapPinUsername   = "";

// Channel-isolation viewer (read-only, no cooldown concerns)
let isoUserId = 0; let isoUsername = "";

// gifUrl stripping — dedicated Pro users
let gifUrlPro1Id = 0; let gifUrlPro1Username = "";
let gifUrlPro2Id = 0; let gifUrlPro2Username = "";

// Pin-expiry
let expProId = 0; let expProUsername = "";

// Message-edit gate — Pro-expiry simulation
let editProId  = 0; let editProUsername  = "";
let editFreeId = 0; let editFreeUsername = "";

// GIF broadcast — WS payload stripping
let bcastPro1Id = 0; let bcastPro1Username = "";
let bcastPro2Id = 0; let bcastPro2Username = "";

// Pro-metadata stripping for free users
let metaFree1Id = 0; let metaFree1Username = "";
let metaFree2Id = 0; let metaFree2Username = "";
let metaProId   = 0; let metaProUsername   = "";

// Pro-metadata lapse: user was Pro, stored fields, then subscription expires mid-session
let lapsedProId = 0; let lapsedProUsername = "";

// Pro lapse — length cap and GIF gate: dedicated users, each makes exactly one POST while Pro
// and one POST after is_pro is flipped, so no cross-test rate-limit collisions.
let lapsedLenId = 0; let lapsedLenUsername = "";
let lapsedGifId = 0; let lapsedGifUsername = "";

// Type-gated metadata stripping — lfg_signal / trade_offer fields on a plain text message
let lfgTextId = 0; let lfgTextUsername = "";
let tradeTextId = 0; let tradeTextUsername = "";

// gifUrl stripping when messageType is not 'gif' — dedicated users (free; each makes one POST)
let gifTextId = 0; let gifTextUsername = "";
let gifLfgId  = 0; let gifLfgUsername  = "";

const createdUserIds:    number[] = [];
const createdMessageIds: number[] = [];
const createdPinIds:     number[] = [];

function free(label: string) {
  return {
    username:     `gcpg_f_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName:  `F${label}`,
    status:       "online" as const,
  };
}

function pro(label: string) {
  return {
    username:     `gcpg_p_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName:  `P${label}`,
    isPro:        true,
    status:       "online" as const,
  };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function req(
  method: string,
  path: string,
  userId: number,
  username: string,
  body?: object,
): Promise<{ status: number; body: unknown }> {
  const token   = signToken({ userId, username });
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
          ...(bodyStr
            ? {
                "Content-Type":   "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
              }
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
    r.on("error", reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

async function postMsg(
  userId: number,
  username: string,
  payload: {
    content: string;
    messageType?: string;
    metadata?: Record<string, unknown>;
    channel?: string;
  },
) {
  return req("POST", "/global-chat/messages", userId, username, payload);
}

/** Open a WS connection and collect every frame.  Resolves the next frame that
 *  satisfies `predicate` within `timeoutMs` (default 3 000 ms). */
function openWsObserver(userId: number, username: string): {
  waitFor: (predicate: (msg: unknown) => boolean, timeoutMs?: number) => Promise<unknown>;
  close: () => void;
} {
  const token = signToken({ userId, username });
  const ws    = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token)}`);
  const queue: unknown[] = [];
  const waiters: Array<{ predicate: (m: unknown) => boolean; resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];

  ws.on("message", (raw) => {
    let msg: unknown;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    queue.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(msg)) {
        waiters.splice(i, 1)[0].resolve(msg);
      }
    }
  });

  function waitFor(predicate: (m: unknown) => boolean, timeoutMs = 3_000): Promise<unknown> {
    // Check the backlog first
    const found = queue.find(predicate);
    if (found !== undefined) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = waiters.findIndex(w => w.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`WS: timed out after ${timeoutMs} ms waiting for matching frame`));
      }, timeoutMs);
      waiters.push({
        predicate,
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject,
      });
    });
  }

  return {
    waitFor,
    close: () => { ws.terminate(); },
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

before(async () => {
  // The global-chat route calls ensureTables() asynchronously on import.
  // Poll until all required columns exist so we don't race with its DDL.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await pool.query(`SELECT channel, edited_at FROM global_chat_messages LIMIT 0`);
      await pool.query(`SELECT pinned_until FROM global_chat_pins LIMIT 0`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Allocate all test users in one batch
  const users = await db
    .insert(usersTable)
    .values([
      free("gif"),
      pro("gif"),
      free("len1"),
      free("len2"),
      pro("len1"),
      pro("len2"),
      free("pin"),
      pro("pin1"),
      pro("pin2"),
      free("iso"),
      pro("gurl1"),
      pro("gurl2"),
      pro("exp"),
      pro("editpro"),
      free("editfree"),
      pro("bcast1"),
      pro("bcast2"),
      free("meta1"),
      free("meta2"),
      pro("meta"),
      pro("lapsedmeta"),
      pro("lapsedlen"),
      pro("lapsedgif"),
      free("lfgtxt"),
      free("tradetxt"),
      pro("lappin"),
      free("giftxt"),
      free("giflfg"),
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [
    [gifFreeId,    gifFreeUsername],
    [gifProId,     gifProUsername],
    [lenFreeId,    lenFreeUsername],
    [lenFree2Id,   lenFree2Username],
    [lenPro1Id,    lenPro1Username],
    [lenPro2Id,    lenPro2Username],
    [pinFreeId,    pinFreeUsername],
    [pinProId,     pinProUsername],
    [pinPro2Id,    pinPro2Username],
    [isoUserId,    isoUsername],
    [gifUrlPro1Id, gifUrlPro1Username],
    [gifUrlPro2Id, gifUrlPro2Username],
    [expProId,     expProUsername],
    [editProId,    editProUsername],
    [editFreeId,   editFreeUsername],
    [bcastPro1Id,  bcastPro1Username],
    [bcastPro2Id,  bcastPro2Username],
    [metaFree1Id,  metaFree1Username],
    [metaFree2Id,  metaFree2Username],
    [metaProId,    metaProUsername],
    [lapsedProId,  lapsedProUsername],
    [lapsedLenId,  lapsedLenUsername],
    [lapsedGifId,  lapsedGifUsername],
    [lfgTextId,    lfgTextUsername],
    [tradeTextId,  tradeTextUsername],
    [lapPinId,     lapPinUsername],
    [gifTextId,    gifTextUsername],
    [gifLfgId,     gifLfgUsername],
  ] = users.map(u => [u.id, u.username]) as [number, string][];

  createdUserIds.push(...users.map(u => u.id));

  server = createServer(app);
  attachSignaling(server);   // needed so broadcastAll() reaches WS test clients
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl   = `http://127.0.0.1:${port}/api`;
  wsBaseUrl = `ws://127.0.0.1:${port}/api/ws`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdPinIds.length) {
    await pool.query(`DELETE FROM global_chat_pins WHERE id = ANY($1)`, [createdPinIds]);
  }
  if (createdMessageIds.length) {
    await pool.query(`DELETE FROM global_chat_messages WHERE id = ANY($1)`, [createdMessageIds]);
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GIF gate", () => {
  test("non-Pro posting messageType:gif gets 403", async () => {
    const res = await postMsg(gifFreeId, gifFreeUsername, {
      content:     "check this out",
      messageType: "gif",
      metadata:    { gifUrl: "https://media.giphy.com/media/abc123/giphy.gif" },
    });
    assert.equal(res.status, 403, `expected 403 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("Pro user can post gif without being blocked", async () => {
    const res = await postMsg(gifProId, gifProUsername, {
      content:     "look at this",
      messageType: "gif",
      metadata:    { gifUrl: "https://media.giphy.com/media/abc123/giphy.gif" },
      channel:     "general",
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number };
    if (body.id) createdMessageIds.push(body.id);
  });
});

describe("Message length cap", () => {
  // lenFreeId, lenPro1Id, lenPro2Id are all fresh users with no prior activity.
  // Each test uses its own user to avoid any cooldown concern.

  test("non-Pro posting >300-char message gets 400", async () => {
    const res = await postMsg(lenFreeId, lenFreeUsername, {
      content: "a".repeat(301),
    });
    assert.equal(res.status, 400, `expected 400 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("non-Pro posting exactly 300-char message is accepted", async () => {
    // Uses lenFree2Id — a fresh user with no prior cooldown — because lenFreeId's
    // 301-char rejection above still triggers the rate-limit timestamp before the
    // length check returns 400, so reusing it would produce a 429 here.
    const res = await postMsg(lenFree2Id, lenFree2Username, {
      content: "a".repeat(300),
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number };
    if (body.id) createdMessageIds.push(body.id);
  });

  test("Pro posting >800-char message gets 400", async () => {
    const res = await postMsg(lenPro1Id, lenPro1Username, {
      content: "b".repeat(801),
    });
    assert.equal(res.status, 400, `expected 400 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("Pro posting exactly 800-char message is accepted", async () => {
    // lenPro1Id's prior 801-char attempt was rejected before rate-limit was set,
    // so no cooldown applies. Use lenPro2Id anyway for extra isolation.
    const res = await postMsg(lenPro2Id, lenPro2Username, {
      content: "b".repeat(800),
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number };
    if (body.id) createdMessageIds.push(body.id);
  });
});

describe("Pin gate", () => {
  test("non-Pro pinning any message gets 403", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'pin-test-msg', 'general') RETURNING id`,
      [pinFreeId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req("POST", `/global-chat/messages/${msgId}/pin`, pinFreeId, pinFreeUsername);
    assert.equal(res.status, 403, `expected 403 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("Pro user pinning another user's message gets 403", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'other-user-msg', 'general') RETURNING id`,
      [pinFreeId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req("POST", `/global-chat/messages/${msgId}/pin`, pinProId, pinProUsername);
    assert.equal(res.status, 403, `expected 403 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("Pro user can pin their own message", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'own-msg-pin', 'general') RETURNING id`,
      [pinPro2Id],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req("POST", `/global-chat/messages/${msgId}/pin`, pinPro2Id, pinPro2Username);
    assert.equal(res.status, 200, `expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { messageId: number };
    assert.equal(body.messageId, msgId);
  });

  test("lapsed Pro: pin access is revoked immediately when is_pro flips to false", async () => {
    // Use 'trading' channel so this pin doesn't interfere with the lfg channel-isolation tests.
    // Step 1 — while still Pro, pin own message → 200
    // Clear any existing trading pins first so we start with a clean slate.
    await pool.query(`DELETE FROM global_chat_pins WHERE channel = 'trading'`);

    const { rows: mr1 } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'lappin-pre-lapse', 'trading') RETURNING id`,
      [lapPinId],
    );
    const msgId1 = mr1[0].id;
    createdMessageIds.push(msgId1);

    const res1 = await req("POST", `/global-chat/messages/${msgId1}/pin`, lapPinId, lapPinUsername);
    assert.equal(res1.status, 200, `expected 200 (pre-lapse pin) got ${res1.status}: ${JSON.stringify(res1.body)}`);
    const pinBody = res1.body as { messageId: number };
    assert.equal(pinBody.messageId, msgId1);

    // Step 2 — simulate subscription expiry by flipping is_pro → false in the DB
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [lapPinId]);

    try {
      // Step 3 — insert another own message and attempt to pin it → must be 403
      const { rows: mr2 } = await pool.query<{ id: number }>(
        `INSERT INTO global_chat_messages (user_id, content, channel)
         VALUES ($1, 'lappin-post-lapse', 'trading') RETURNING id`,
        [lapPinId],
      );
      const msgId2 = mr2[0].id;
      createdMessageIds.push(msgId2);

      const res2 = await req("POST", `/global-chat/messages/${msgId2}/pin`, lapPinId, lapPinUsername);
      assert.equal(
        res2.status, 403,
        `expected 403 after Pro lapse, got ${res2.status}: ${JSON.stringify(res2.body)}`,
      );
      const body = res2.body as { error: string };
      assert.ok(
        body.error?.toLowerCase().includes("pro"),
        `error should mention Pro, got: ${body.error}`,
      );
    } finally {
      // Restore Pro status so teardown can proceed cleanly
      await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [lapPinId]);
      // Remove the pin we created so the 'trading' channel is clean for Pin expiry tests
      await pool.query(`DELETE FROM global_chat_pins WHERE channel = 'trading' AND pinner_id = $1`, [lapPinId]);
    }
  });
});

describe("Channel isolation — pinned messages", () => {
  test("GET /global-chat/pinned?channel=lfg does not return a pin from general", async () => {
    const { rows: mr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'iso-general-msg', 'general') RETURNING id`,
      [isoUserId],
    );
    const msgId = mr[0].id;
    const { rows: pr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_pins (message_id, pinner_id, channel, pinned_until)
       VALUES ($1, $2, 'general', NOW() + INTERVAL '10 minutes') RETURNING id`,
      [msgId, isoUserId],
    );
    createdMessageIds.push(msgId);
    createdPinIds.push(pr[0].id);

    const res = await req("GET", "/global-chat/pinned?channel=lfg", isoUserId, isoUsername);
    assert.equal(res.status, 200);
    assert.equal(res.body, null, `expected null for lfg, got: ${JSON.stringify(res.body)}`);
  });

  test("GET /global-chat/pinned?channel=lfg returns the pin when pinned to lfg", async () => {
    const { rows: mr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'iso-lfg-msg', 'lfg') RETURNING id`,
      [isoUserId],
    );
    const msgId = mr[0].id;
    // Clear any existing lfg pin before inserting ours
    await pool.query(`DELETE FROM global_chat_pins WHERE channel = 'lfg'`);
    const { rows: pr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_pins (message_id, pinner_id, channel, pinned_until)
       VALUES ($1, $2, 'lfg', NOW() + INTERVAL '10 minutes') RETURNING id`,
      [msgId, isoUserId],
    );
    createdMessageIds.push(msgId);
    createdPinIds.push(pr[0].id);

    const res = await req("GET", "/global-chat/pinned?channel=lfg", isoUserId, isoUsername);
    assert.equal(res.status, 200);
    assert.notEqual(res.body, null, "expected a pinned message in lfg channel");
    const body = res.body as { messageId: number };
    assert.equal(body.messageId, msgId);
  });
});

describe("Channel isolation — message listing", () => {
  test("GET /global-chat/messages?channel=lfg does not return a general-channel message", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, $2, 'general') RETURNING id`,
      [isoUserId, `iso-general-only-${SUFFIX}`],
    );
    const generalMsgId = rows[0].id;
    createdMessageIds.push(generalMsgId);

    const res = await req("GET", "/global-chat/messages?channel=lfg", isoUserId, isoUsername);
    assert.equal(res.status, 200);
    const messages = res.body as Array<{ id: number; channel: string }>;
    assert.ok(Array.isArray(messages), "response should be an array");

    const leaked = messages.find(m => m.id === generalMsgId);
    assert.equal(leaked, undefined, "general-channel message must not appear in lfg query");

    for (const m of messages) {
      assert.equal(m.channel, "lfg", `message ${m.id} has unexpected channel "${m.channel}"`);
    }
  });

  test("GET /global-chat/messages?channel=general does not return lfg messages", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, $2, 'lfg') RETURNING id`,
      [isoUserId, `iso-lfg-only-${SUFFIX}`],
    );
    const lfgMsgId = rows[0].id;
    createdMessageIds.push(lfgMsgId);

    const res = await req("GET", "/global-chat/messages?channel=general", isoUserId, isoUsername);
    assert.equal(res.status, 200);
    const messages = res.body as Array<{ id: number; channel: string }>;
    assert.ok(Array.isArray(messages));

    const leaked = messages.find(m => m.id === lfgMsgId);
    assert.equal(leaked, undefined, "lfg message must not appear in general query");
  });
});

describe("gifUrl domain stripping", () => {
  test("gifUrl pointing to a non-Giphy/Tenor domain is stripped and not stored", async () => {
    const res = await postMsg(gifUrlPro1Id, gifUrlPro1Username, {
      content:     "sneaky gif",
      messageType: "gif",
      metadata:    { gifUrl: "https://evil.example.com/malicious.gif" },
      channel:     "general",
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    assert.equal(
      body.metadata.gifUrl,
      undefined,
      `gifUrl should be stripped from response metadata, got: ${JSON.stringify(body.metadata)}`,
    );

    // Verify at DB level
    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    assert.equal(
      stored.gifUrl,
      undefined,
      `gifUrl must not persist in DB: ${JSON.stringify(stored)}`,
    );
  });

  test("valid Giphy CDN gifUrl is accepted and stored", async () => {
    const validUrl = "https://media2.giphy.com/media/xyz/giphy.gif";
    const res = await postMsg(gifUrlPro2Id, gifUrlPro2Username, {
      content:     "valid gif",
      messageType: "gif",
      metadata:    { gifUrl: validUrl },
      channel:     "general",
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    assert.equal(
      body.metadata.gifUrl,
      validUrl,
      `expected gifUrl to be preserved, got: ${JSON.stringify(body.metadata)}`,
    );
  });

  test("gifUrl is stripped when messageType is 'text'", async () => {
    const res = await postMsg(gifTextId, gifTextUsername, {
      content:     "just a text message",
      messageType: "text",
      metadata:    { gifUrl: "https://media.giphy.com/media/abc123/giphy.gif" },
      channel:     "general",
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    assert.equal(
      body.metadata.gifUrl,
      undefined,
      `gifUrl must be absent from text message response metadata, got: ${JSON.stringify(body.metadata)}`,
    );

    // Verify at DB level
    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    assert.equal(
      stored.gifUrl,
      undefined,
      `gifUrl must not persist in DB for text message: ${JSON.stringify(stored)}`,
    );
  });

  test("gifUrl is stripped when messageType is 'lfg_signal'", async () => {
    const res = await postMsg(gifLfgId, gifLfgUsername, {
      content:     "looking for group",
      messageType: "lfg_signal",
      metadata:    {
        gifUrl:   "https://media.giphy.com/media/abc123/giphy.gif",
        game:     "Valorant",
        platform: "PC",
      },
      channel:     "general",
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    assert.equal(
      body.metadata.gifUrl,
      undefined,
      `gifUrl must be absent from lfg_signal response metadata, got: ${JSON.stringify(body.metadata)}`,
    );

    // Verify at DB level
    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    assert.equal(
      stored.gifUrl,
      undefined,
      `gifUrl must not persist in DB for lfg_signal message: ${JSON.stringify(stored)}`,
    );
  });
});

describe("Pin expiry", () => {
  test("expired pin is not returned by GET /global-chat/pinned", async () => {
    // Seed a message in the trading channel
    const { rows: mr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'expired-pin-msg', 'trading') RETURNING id`,
      [expProId],
    );
    const msgId = mr[0].id;

    // Clear any active pins for this channel, then insert a pin that is already expired
    await pool.query(`DELETE FROM global_chat_pins WHERE channel = 'trading'`);
    const { rows: pr } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_pins (message_id, pinner_id, channel, pinned_until)
       VALUES ($1, $2, 'trading', NOW() - INTERVAL '1 minute') RETURNING id`,
      [msgId, expProId],
    );
    createdMessageIds.push(msgId);
    createdPinIds.push(pr[0].id);

    const res = await req("GET", "/global-chat/pinned?channel=trading", expProId, expProUsername);
    assert.equal(res.status, 200);
    assert.equal(
      res.body,
      null,
      `expected null for expired pin, got: ${JSON.stringify(res.body)}`,
    );
  });
});

describe("Message edit gate — Pro-only and subscription-expiry", () => {
  // Seed messages directly in DB (no POST cooldown concerns).
  // The PATCH route re-reads is_pro from the DB on every request, so flipping
  // the flag simulates a mid-session Pro subscription expiry.

  test("non-Pro user cannot edit any message → 403", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'free-user-msg', 'general') RETURNING id`,
      [editFreeId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req(
      "PATCH", `/global-chat/messages/${msgId}`,
      editFreeId, editFreeUsername,
      { content: "trying to edit" },
    );
    assert.equal(res.status, 403, `expected 403 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { error: string };
    assert.ok(
      body.error?.toLowerCase().includes("pro"),
      `error message should mention Pro, got: ${body.error}`,
    );
  });

  test("active Pro user can edit their own recent message → 200", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'pro-original-content', 'general') RETURNING id`,
      [editProId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req(
      "PATCH", `/global-chat/messages/${msgId}`,
      editProId, editProUsername,
      { content: "edited by pro" },
    );
    assert.equal(res.status, 200, `expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { messageId: number; content: string };
    assert.equal(body.messageId, msgId);
    assert.equal(body.content, "edited by pro");
  });

  test("user whose Pro lapses mid-session loses edit access immediately → 403", async () => {
    // Seed a fresh message for this user
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'will-be-blocked', 'general') RETURNING id`,
      [editProId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    // Simulate subscription expiry by flipping is_pro → false in the DB
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [editProId]);

    try {
      const res = await req(
        "PATCH", `/global-chat/messages/${msgId}`,
        editProId, editProUsername,
        { content: "should be blocked" },
      );
      assert.equal(res.status, 403, `expected 403 after expiry, got ${res.status}: ${JSON.stringify(res.body)}`);
      const body = res.body as { error: string };
      assert.ok(
        body.error?.toLowerCase().includes("pro"),
        `error should mention Pro, got: ${body.error}`,
      );
    } finally {
      // Restore Pro status so teardown user-deletion doesn't leave noise
      await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [editProId]);
    }
  });

  test("editing another user's message is rejected → 403", async () => {
    // Seed a message owned by the free user
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel)
       VALUES ($1, 'free-user-owns-this', 'general') RETURNING id`,
      [editFreeId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    // editProId (Pro) tries to edit a message they don't own
    const res = await req(
      "PATCH", `/global-chat/messages/${msgId}`,
      editProId, editProUsername,
      { content: "stealing the edit" },
    );
    assert.equal(res.status, 403, `expected 403 got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("editing a message older than 5 minutes → 403", async () => {
    // Insert a message with created_at forced to 6 minutes ago
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO global_chat_messages (user_id, content, channel, created_at)
       VALUES ($1, 'old-message', 'general', NOW() - INTERVAL '6 minutes') RETURNING id`,
      [editProId],
    );
    const msgId = rows[0].id;
    createdMessageIds.push(msgId);

    const res = await req(
      "PATCH", `/global-chat/messages/${msgId}`,
      editProId, editProUsername,
      { content: "too late to edit" },
    );
    assert.equal(res.status, 403, `expected 403 for stale message, got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { error: string };
    assert.ok(
      body.error?.toLowerCase().includes("5 min"),
      `error should mention time limit, got: ${body.error}`,
    );
  });
});

describe("GIF broadcast — gifUrl domain stripping in WebSocket payload", () => {
  // These tests verify that the broadcastAll() call in the POST route uses the
  // sanitised `safeMeta` object (not raw req.body), so WS clients never receive
  // an invalid gifUrl even if the DB row is clean.
  //
  // bcastPro1 is the WS observer; bcastPro2 is the HTTP poster.
  // They are different users so the poster's cooldown doesn't affect the observer.

  test("WS broadcast for a gif with an invalid gifUrl domain has no gifUrl in metadata", async () => {
    const observer = openWsObserver(bcastPro1Id, bcastPro1Username);

    // Wait for the WS connection to open before posting
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WS open timeout")), 3_000);
      const ws = new WebSocket(
        `${wsBaseUrl}?token=${encodeURIComponent(signToken({ userId: bcastPro1Id, username: bcastPro1Username }))}`,
      );
      ws.once("open",  () => { clearTimeout(t); ws.terminate(); resolve(); });
      ws.once("error", (e) => { clearTimeout(t); reject(e); });
    });

    // Post a gif message with an evil gifUrl
    const postRes = await postMsg(bcastPro2Id, bcastPro2Username, {
      content:     "evil broadcast",
      messageType: "gif",
      metadata:    { gifUrl: "https://evil.example.com/steal.gif" },
      channel:     "general",
    });
    assert.equal(postRes.status, 201, `POST failed: ${JSON.stringify(postRes.body)}`);
    const posted = postRes.body as { id: number };
    if (posted.id) createdMessageIds.push(posted.id);

    try {
      // Wait for the broadcast frame that matches this specific message id
      const frame = await observer.waitFor((m) => {
        const msg = m as { type?: string; message?: { id?: number } };
        return msg.type === "global_chat" && msg.message?.id === posted.id;
      });

      const broadcast = frame as {
        type: string;
        message: { id: number; metadata: Record<string, unknown> };
      };

      assert.equal(
        broadcast.message.metadata.gifUrl,
        undefined,
        `gifUrl must be absent from WS broadcast metadata, got: ${JSON.stringify(broadcast.message.metadata)}`,
      );
    } finally {
      observer.close();
    }
  });

  test("WS broadcast for a gif with a valid Giphy gifUrl includes the gifUrl in metadata", async () => {
    const validUrl = "https://media.giphy.com/media/valid123/giphy.gif";
    const observer = openWsObserver(bcastPro1Id, bcastPro1Username);

    // Small delay so the previous test's cooldown has cleared for bcastPro2
    await new Promise(r => setTimeout(r, 600));

    const postRes = await postMsg(bcastPro2Id, bcastPro2Username, {
      content:     "valid broadcast gif",
      messageType: "gif",
      metadata:    { gifUrl: validUrl },
      channel:     "general",
    });
    assert.equal(postRes.status, 201, `POST failed: ${JSON.stringify(postRes.body)}`);
    const posted = postRes.body as { id: number };
    if (posted.id) createdMessageIds.push(posted.id);

    try {
      const frame = await observer.waitFor((m) => {
        const msg = m as { type?: string; message?: { id?: number } };
        return msg.type === "global_chat" && msg.message?.id === posted.id;
      });

      const broadcast = frame as {
        type: string;
        message: { id: number; metadata: Record<string, unknown> };
      };

      assert.equal(
        broadcast.message.metadata.gifUrl,
        validUrl,
        `valid gifUrl should be present in WS broadcast, got: ${JSON.stringify(broadcast.message.metadata)}`,
      );
    } finally {
      observer.close();
    }
  });
});

describe("Pro metadata stripping — free users cannot inject Pro-only fields", () => {
  // sanitizeMeta gates nameColor, textColor, badge, nameAnimation, msgBgColor
  // behind the isPro flag.  These tests confirm all five fields are silently
  // dropped from both the HTTP response and the DB row when a free user sends them.

  const PRO_FIELDS = {
    nameColor:     "#ff0000",
    textColor:     "#00ff00",
    badge:         "⭐",
    nameAnimation: true,
    msgBgColor:    "#0000ff",
  };

  test("free user: all Pro metadata fields are absent from the HTTP response", async () => {
    const res = await postMsg(metaFree1Id, metaFree1Username, {
      content:  "plain message with sneaky meta",
      metadata: PRO_FIELDS,
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    const meta = body.metadata ?? {};
    for (const field of Object.keys(PRO_FIELDS)) {
      assert.equal(
        meta[field],
        undefined,
        `field "${field}" must be stripped from response metadata, got: ${JSON.stringify(meta)}`,
      );
    }
  });

  test("free user: all Pro metadata fields are absent from the DB row", async () => {
    // Wait for free-user cooldown (1 s) before this second POST
    await new Promise(r => setTimeout(r, 1_100));

    const res = await postMsg(metaFree2Id, metaFree2Username, {
      content:  "second sneaky message",
      metadata: PRO_FIELDS,
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number };
    if (body.id) createdMessageIds.push(body.id);

    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    for (const field of Object.keys(PRO_FIELDS)) {
      assert.equal(
        stored[field],
        undefined,
        `field "${field}" must not be persisted in DB, got: ${JSON.stringify(stored)}`,
      );
    }
  });

  test("Pro user: all Pro metadata fields are preserved in the HTTP response (positive control)", async () => {
    const res = await postMsg(metaProId, metaProUsername, {
      content:  "pro message with all meta",
      metadata: PRO_FIELDS,
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    const meta = body.metadata ?? {};
    assert.equal(meta.nameColor,     PRO_FIELDS.nameColor,     `nameColor mismatch`);
    assert.equal(meta.textColor,     PRO_FIELDS.textColor,     `textColor mismatch`);
    assert.equal(meta.badge,         PRO_FIELDS.badge,         `badge mismatch`);
    assert.equal(meta.nameAnimation, PRO_FIELDS.nameAnimation, `nameAnimation mismatch`);
    assert.equal(meta.msgBgColor,    PRO_FIELDS.msgBgColor,    `msgBgColor mismatch`);
  });

  test("lapsed Pro: Pro metadata fields are stripped after subscription expires mid-session", async () => {
    // Step 1 — while still Pro, post a message with nameColor + badge → fields stored
    const res1 = await postMsg(lapsedProId, lapsedProUsername, {
      content:  "pro message before expiry",
      metadata: { nameColor: PRO_FIELDS.nameColor, badge: PRO_FIELDS.badge },
    });
    assert.equal(res1.status, 201, `expected 201 (pre-lapse) got ${res1.status}: ${JSON.stringify(res1.body)}`);
    const body1 = res1.body as { id: number; metadata: Record<string, unknown> };
    if (body1.id) createdMessageIds.push(body1.id);

    // Confirm Pro fields were accepted in the first post
    assert.equal(body1.metadata?.nameColor, PRO_FIELDS.nameColor, `nameColor should be stored while Pro`);
    assert.equal(body1.metadata?.badge,     PRO_FIELDS.badge,     `badge should be stored while Pro`);

    // Step 2 — simulate subscription expiry by flipping is_pro → false in the DB
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [lapsedProId]);

    try {
      // After the Pro flag flips the cooldown becomes 1 000 ms (free-user rate).
      // Wait long enough to clear the free-user cooldown from the first POST.
      await new Promise(r => setTimeout(r, 1_100));

      // Step 3 — post again with the same metadata; route re-reads is_pro from DB
      const res2 = await postMsg(lapsedProId, lapsedProUsername, {
        content:  "message after expiry with stale meta",
        metadata: { nameColor: PRO_FIELDS.nameColor, badge: PRO_FIELDS.badge },
      });
      assert.equal(res2.status, 201, `expected 201 (post-lapse) got ${res2.status}: ${JSON.stringify(res2.body)}`);
      const body2 = res2.body as { id: number; metadata: Record<string, unknown> };
      if (body2.id) createdMessageIds.push(body2.id);

      // Response must not contain Pro fields
      const meta = body2.metadata ?? {};
      assert.equal(
        meta.nameColor,
        undefined,
        `nameColor must be stripped after Pro lapse, got: ${JSON.stringify(meta)}`,
      );
      assert.equal(
        meta.badge,
        undefined,
        `badge must be stripped after Pro lapse, got: ${JSON.stringify(meta)}`,
      );

      // DB row must also be clean
      const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
        `SELECT metadata FROM global_chat_messages WHERE id = $1`,
        [body2.id],
      );
      const stored = rows[0]?.metadata ?? {};
      assert.equal(
        stored.nameColor,
        undefined,
        `nameColor must not persist in DB after Pro lapse, got: ${JSON.stringify(stored)}`,
      );
      assert.equal(
        stored.badge,
        undefined,
        `badge must not persist in DB after Pro lapse, got: ${JSON.stringify(stored)}`,
      );
    } finally {
      // Restore Pro status so teardown can proceed cleanly
      await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [lapsedProId]);
    }
  });
});

describe("Type-gated metadata stripping — lfg_signal / trade_offer fields on a plain text message", () => {
  // sanitizeMeta only copies lfg-signal fields (game, platform, rank, slots, lfgPostId)
  // when messageType === "lfg_signal", and trade fields (offering, seeking, price) when
  // messageType === "trade_offer".  These tests confirm that sending those fields with
  // messageType:"text" results in a 201 but none of the fields are stored.

  test("text message with lfg_signal fields in metadata — all lfg fields are silently dropped", async () => {
    const res = await postMsg(lfgTextId, lfgTextUsername, {
      content:     "just a regular message",
      messageType: "text",
      metadata:    {
        game:      "Valorant",
        platform:  "PC",
        rank:      "Diamond",
        slots:     3,
        lfgPostId: 99999,
      },
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    const meta = body.metadata ?? {};
    for (const field of ["game", "platform", "rank", "slots", "lfgPostId"]) {
      assert.equal(
        meta[field],
        undefined,
        `lfg field "${field}" must be stripped from text message response, got: ${JSON.stringify(meta)}`,
      );
    }

    // Verify DB row is also clean
    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    for (const field of ["game", "platform", "rank", "slots", "lfgPostId"]) {
      assert.equal(
        stored[field],
        undefined,
        `lfg field "${field}" must not be persisted in DB for text message, got: ${JSON.stringify(stored)}`,
      );
    }
  });

  test("text message with trade_offer fields in metadata — all trade fields are silently dropped", async () => {
    const res = await postMsg(tradeTextId, tradeTextUsername, {
      content:     "just another regular message",
      messageType: "text",
      metadata:    {
        offering: "AK-47 | Redline",
        seeking:  "AWP | Asiimov",
        price:    "$15",
      },
    });
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
    const body = res.body as { id: number; metadata: Record<string, unknown> };
    if (body.id) createdMessageIds.push(body.id);

    const meta = body.metadata ?? {};
    for (const field of ["offering", "seeking", "price"]) {
      assert.equal(
        meta[field],
        undefined,
        `trade field "${field}" must be stripped from text message response, got: ${JSON.stringify(meta)}`,
      );
    }

    // Verify DB row is also clean
    const { rows } = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM global_chat_messages WHERE id = $1`,
      [body.id],
    );
    const stored = rows[0]?.metadata ?? {};
    for (const field of ["offering", "seeking", "price"]) {
      assert.equal(
        stored[field],
        undefined,
        `trade field "${field}" must not be persisted in DB for text message, got: ${JSON.stringify(stored)}`,
      );
    }
  });
});

describe("Pro lapse — length cap and GIF gate", () => {
  // The POST route re-reads is_pro from the DB on every request.
  // Flipping is_pro → false between requests simulates a mid-session
  // subscription expiry and must immediately revoke both the extended
  // message-length allowance (800 → 300 chars) and GIF posting.
  //
  // Each test uses its own dedicated user so no cross-test cooldown
  // collision can produce a false 429.

  test("lapsed Pro: 800-char message is rejected with 400 after subscription expires", async () => {
    // Step 1 — while still Pro, an 800-char message is accepted
    const res1 = await postMsg(lapsedLenId, lapsedLenUsername, {
      content: "b".repeat(800),
    });
    assert.equal(
      res1.status, 201,
      `expected 201 (pre-lapse) got ${res1.status}: ${JSON.stringify(res1.body)}`,
    );
    const body1 = res1.body as { id: number };
    if (body1.id) createdMessageIds.push(body1.id);

    // Step 2 — simulate subscription expiry
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [lapsedLenId]);

    try {
      // Pro cooldown was 500 ms; free-user cooldown is 1 000 ms.
      // Wait long enough to clear the free-user rate-limit window.
      await new Promise(r => setTimeout(r, 1_100));

      // Step 3 — the same 800-char message now exceeds the 300-char free limit
      const res2 = await postMsg(lapsedLenId, lapsedLenUsername, {
        content: "b".repeat(800),
      });
      assert.equal(
        res2.status, 400,
        `expected 400 (post-lapse length cap) got ${res2.status}: ${JSON.stringify(res2.body)}`,
      );
    } finally {
      await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [lapsedLenId]);
    }
  });

  test("lapsed Pro: gif message is rejected with 403 after subscription expires", async () => {
    // Step 1 — while still Pro, a gif message is accepted
    const res1 = await postMsg(lapsedGifId, lapsedGifUsername, {
      content:     "look at this gif",
      messageType: "gif",
      metadata:    { gifUrl: "https://media.giphy.com/media/abc123/giphy.gif" },
    });
    assert.equal(
      res1.status, 201,
      `expected 201 (pre-lapse gif) got ${res1.status}: ${JSON.stringify(res1.body)}`,
    );
    const body1 = res1.body as { id: number };
    if (body1.id) createdMessageIds.push(body1.id);

    // Step 2 — simulate subscription expiry
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [lapsedGifId]);

    try {
      // Wait for the free-user cooldown to clear
      await new Promise(r => setTimeout(r, 1_100));

      // Step 3 — gif posting is now blocked for non-Pro users
      const res2 = await postMsg(lapsedGifId, lapsedGifUsername, {
        content:     "still trying to post a gif",
        messageType: "gif",
        metadata:    { gifUrl: "https://media.giphy.com/media/abc123/giphy.gif" },
      });
      assert.equal(
        res2.status, 403,
        `expected 403 (post-lapse gif gate) got ${res2.status}: ${JSON.stringify(res2.body)}`,
      );
    } finally {
      await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [lapsedGifId]);
    }
  });
});
