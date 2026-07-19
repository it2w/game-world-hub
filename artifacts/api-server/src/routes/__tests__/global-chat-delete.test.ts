/**
 * Tests for DELETE /global-chat/messages/:id
 *
 * Covered scenarios:
 *  1. Non-admin user cannot delete → 403
 *  2. Admin without can_delete_content flag cannot delete → 403
 *  3. Deleting a non-existent message → 404
 *  4. Admin with can_delete_content permission deletes a message → 200,
 *     WS frame broadcast, message gone from GET /global-chat/messages
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
import { startupSweepDone } from "../global-chat";

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server:    Server;
let baseUrl:   string;
let wsBaseUrl: string;

// Each test that posts a message gets its own author (rate-limit isolation)
let adminId        = 0; let adminUsername        = "";
let noPermAdminId  = 0; let noPermAdminUsername  = "";
let freeUserId     = 0; let freeUserUsername     = "";
let author1Id      = 0; let author1Username      = "";   // for non-admin test
let author2Id      = 0; let author2Username      = "";   // for no-perm test
let author3Id      = 0; let author3Username      = "";   // for main delete test

const createdUserIds: number[] = [];

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

/** Open a WS connection and wait for a frame matching predicate. */
function openWsObserver(userId: number, username: string) {
  const token = signToken({ userId, username });
  const ws    = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token)}`);
  const queue: unknown[] = [];
  const waiters: Array<{
    predicate: (m: unknown) => boolean;
    resolve:   (v: unknown) => void;
    reject:    (e: Error)   => void;
  }> = [];

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

// ── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  // Wait for ensureTables + startup sweep so we don't race with DDL
  await startupSweepDone;

  // Verify required columns exist
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await pool.query(`SELECT channel FROM global_chat_messages LIMIT 0`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Insert test users — one dedicated author per test that posts (rate-limit isolation)
  const users = await db
    .insert(usersTable)
    .values([
      // admin with can_delete_content (granted below)
      { username: `gcd_admin_${SUFFIX}`,   passwordHash: "x", displayName: "Admin",       isAdmin: true, status: "online" as const },
      // admin without can_delete_content
      { username: `gcd_noperm_${SUFFIX}`,  passwordHash: "x", displayName: "NoPermAdmin", isAdmin: true, status: "online" as const },
      // plain user (tries to delete)
      { username: `gcd_free_${SUFFIX}`,    passwordHash: "x", displayName: "Free",                       status: "online" as const },
      // dedicated author per test
      { username: `gcd_auth1_${SUFFIX}`,   passwordHash: "x", displayName: "Auth1",                      status: "online" as const },
      { username: `gcd_auth2_${SUFFIX}`,   passwordHash: "x", displayName: "Auth2",                      status: "online" as const },
      { username: `gcd_auth3_${SUFFIX}`,   passwordHash: "x", displayName: "Auth3",                      status: "online" as const },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [
    [adminId,       adminUsername],
    [noPermAdminId, noPermAdminUsername],
    [freeUserId,    freeUserUsername],
    [author1Id,     author1Username],
    [author2Id,     author2Username],
    [author3Id,     author3Username],
  ] = users.map(u => [u.id, u.username]) as [number, string][];

  createdUserIds.push(...users.map(u => u.id));

  // Ensure admin_permissions table exists, then grant / deny flags
  await pool.query(
    `INSERT INTO admin_permissions (user_id, can_delete_content)
     VALUES ($1, true)
     ON CONFLICT (user_id) DO UPDATE SET can_delete_content = true`,
    [adminId],
  );
  await pool.query(
    `INSERT INTO admin_permissions (user_id, can_delete_content)
     VALUES ($1, false)
     ON CONFLICT (user_id) DO UPDATE SET can_delete_content = false`,
    [noPermAdminId],
  );

  server = createServer(app);
  attachSignaling(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const addr = server.address() as AddressInfo;
  baseUrl   = `http://127.0.0.1:${addr.port}/api`;
  wsBaseUrl = `ws://127.0.0.1:${addr.port}/api/ws`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Users deletion cascades to messages and admin_permissions rows
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ── Helper — post a message as a given author ─────────────────────────────────

async function postMessage(authorId: number, authorUsername: string, content: string): Promise<number> {
  const r = await req("POST", "/global-chat/messages", authorId, authorUsername, { content, channel: "general" });
  assert.equal(r.status, 201, `Expected 201 posting message, got ${r.status}: ${JSON.stringify(r.body)}`);
  return (r.body as any).id as number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /global-chat/messages/:id", () => {
  test("non-admin user gets 403", async () => {
    const msgId = await postMessage(author1Id, author1Username, `msg-nonAdmin-${SUFFIX}`);
    const r = await req("DELETE", `/global-chat/messages/${msgId}`, freeUserId, freeUserUsername);
    assert.equal(r.status, 403);
  });

  test("admin without can_delete_content gets 403", async () => {
    const msgId = await postMessage(author2Id, author2Username, `msg-noperm-${SUFFIX}`);
    const r = await req("DELETE", `/global-chat/messages/${msgId}`, noPermAdminId, noPermAdminUsername);
    assert.equal(r.status, 403);
  });

  test("deleting a non-existent message returns 404", async () => {
    const r = await req("DELETE", `/global-chat/messages/999999999`, adminId, adminUsername);
    assert.equal(r.status, 404);
  });

  test("admin with can_delete_content broadcasts WS frame and message disappears from GET", async () => {
    const content = `msg-to-delete-${SUFFIX}`;
    const msgId   = await postMessage(author3Id, author3Username, content);

    // Open WS observer before deleting so we catch the broadcast
    const obs = openWsObserver(adminId, adminUsername);
    // Give the WS a moment to connect
    await new Promise(r => setTimeout(r, 100));

    // Delete the message
    const r = await req("DELETE", `/global-chat/messages/${msgId}`, adminId, adminUsername);
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal((r.body as any).deleted, true);
    assert.equal((r.body as any).messageId, msgId);

    // Verify WS broadcast received
    const frame = await obs.waitFor(
      (m: any) => m?.type === "global_chat_delete" && m?.messageId === msgId,
    );
    assert.ok(frame, "Expected global_chat_delete WS frame");
    obs.close();

    // Verify message is no longer returned by GET
    const listR = await req("GET", `/global-chat/messages?channel=general`, adminId, adminUsername);
    assert.equal(listR.status, 200);
    const messages = listR.body as any[];
    assert.ok(Array.isArray(messages));
    assert.ok(
      !messages.some((m: any) => m.id === msgId),
      "Deleted message should not appear in GET /global-chat/messages",
    );
  });
});
