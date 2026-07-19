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
let proAuthorId    = 0; let proAuthorUsername    = "";   // Pro user for pin test
let proAuthor2Id   = 0; let proAuthor2Username   = "";   // separate Pro user for unpinned test (rate-limit isolation)
// Dedicated authors for deletion-log tests (rate-limit isolation)
let reactAuthorId  = 0; let reactAuthorUsername  = "";   // posts the message-with-reactions
let rParentId      = 0; let rParentUsername      = "";   // posts the reply-target parent
let rChildId       = 0; let rChildUsername       = "";   // posts the reply (child message)

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
      // Pro users for pin tests (separate accounts for rate-limit isolation)
      { username: `gcd_pro_${SUFFIX}`,     passwordHash: "x", displayName: "ProUser",     isPro: true,   status: "online" as const },
      { username: `gcd_pro2_${SUFFIX}`,    passwordHash: "x", displayName: "ProUser2",    isPro: true,   status: "online" as const },
      // Deletion-log test authors (one per test for rate-limit isolation)
      { username: `gcd_react_${SUFFIX}`,   passwordHash: "x", displayName: "ReactAuthor",               status: "online" as const },
      { username: `gcd_rpar_${SUFFIX}`,    passwordHash: "x", displayName: "ReplyParent",               status: "online" as const },
      { username: `gcd_rchd_${SUFFIX}`,    passwordHash: "x", displayName: "ReplyChild",                status: "online" as const },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  [
    [adminId,        adminUsername],
    [noPermAdminId,  noPermAdminUsername],
    [freeUserId,     freeUserUsername],
    [author1Id,      author1Username],
    [author2Id,      author2Username],
    [author3Id,      author3Username],
    [proAuthorId,    proAuthorUsername],
    [proAuthor2Id,   proAuthor2Username],
    [reactAuthorId,  reactAuthorUsername],
    [rParentId,      rParentUsername],
    [rChildId,       rChildUsername],
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

  test("deleting a pinned message removes the pin and returns hadActivePin:true", async () => {
    // Post a message as the Pro user
    const content = `msg-pinned-${SUFFIX}`;
    const msgId   = await postMessage(proAuthorId, proAuthorUsername, content);

    // Pin the message (Pro user pins their own message)
    const pinR = await req("POST", `/global-chat/messages/${msgId}/pin`, proAuthorId, proAuthorUsername);
    assert.equal(pinR.status, 200, `Expected 200 pinning message, got ${pinR.status}: ${JSON.stringify(pinR.body)}`);

    // Verify the pin is visible before deletion
    const pinnedBefore = await req("GET", `/global-chat/pinned?channel=general`, adminId, adminUsername);
    assert.equal(pinnedBefore.status, 200);
    assert.equal((pinnedBefore.body as any)?.messageId, msgId, "Pin should be active before deletion");

    // Open WS observer to catch both the delete and pin_update broadcasts
    const obs = openWsObserver(adminId, adminUsername);
    await new Promise(r => setTimeout(r, 100));

    // Delete the pinned message as admin
    const delR = await req("DELETE", `/global-chat/messages/${msgId}`, adminId, adminUsername);
    assert.equal(delR.status, 200, `Expected 200, got ${delR.status}: ${JSON.stringify(delR.body)}`);
    assert.equal((delR.body as any).deleted, true);
    assert.equal((delR.body as any).messageId, msgId);
    assert.equal(
      (delR.body as any).hadActivePin,
      true,
      "Response should indicate an active pin was cleaned up",
    );

    // Verify the global_chat_delete WS frame was broadcast
    await obs.waitFor((m: any) => m?.type === "global_chat_delete" && m?.messageId === msgId);

    // Verify a pin_update WS frame clearing the pin was broadcast
    const pinFrame = await obs.waitFor(
      (m: any) => m?.type === "pin_update" && m?.channel === "general" && m?.pin === null,
    );
    assert.ok(pinFrame, "Expected pin_update WS frame clearing the pin");
    obs.close();

    // Verify pin is gone: GET /global-chat/pinned should return null
    const pinnedAfter = await req("GET", `/global-chat/pinned?channel=general`, adminId, adminUsername);
    assert.equal(pinnedAfter.status, 200);
    assert.equal(pinnedAfter.body, null, "Pin should be cleared after the pinned message is deleted");
  });

  test("deleting an unpinned message returns hadActivePin:false", async () => {
    // Use proAuthor2Id to avoid the rate limit from the previous test (proAuthorId posted there)
    const content = `msg-unpinned-${SUFFIX}`;
    const msgId   = await postMessage(proAuthor2Id, proAuthor2Username, content);

    const r = await req("DELETE", `/global-chat/messages/${msgId}`, adminId, adminUsername);
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal((r.body as any).hadActivePin, false, "hadActivePin should be false for a non-pinned message");
  });

  // ── Deletion-log snapshot tests ─────────────────────────────────────────────

  test("deletion log captures full snapshot when the message has reactions attached", async () => {
    const content = `msg-with-reactions-${SUFFIX}`;
    const msgId   = await postMessage(reactAuthorId, reactAuthorUsername, content);

    // Add a reaction so there is at least one global_chat_reactions row
    const reactR = await req(
      "POST", `/global-chat/messages/${msgId}/reactions`,
      adminId, adminUsername, { emoji: "👍" },
    );
    assert.equal(reactR.status, 200, `Reaction add failed: ${JSON.stringify(reactR.body)}`);

    // Open WS observer before deleting
    const obs = openWsObserver(adminId, adminUsername);
    await new Promise(r => setTimeout(r, 100));

    // Delete the message as admin
    const delR = await req("DELETE", `/global-chat/messages/${msgId}`, adminId, adminUsername);
    assert.equal(delR.status, 200, `Expected 200, got ${delR.status}: ${JSON.stringify(delR.body)}`);
    assert.equal((delR.body as any).deleted, true);

    // Broadcast must fire after commit
    await obs.waitFor((m: any) => m?.type === "global_chat_delete" && m?.messageId === msgId);
    obs.close();

    // global_chat_deletions must have a row with all four required fields populated
    const { rows } = await pool.query<{
      message_id: number;
      deleted_by_user_id: number;
      original_content: string;
      original_author_id: number;
    }>(
      `SELECT message_id, deleted_by_user_id, original_content, original_author_id
       FROM global_chat_deletions WHERE message_id = $1`,
      [msgId],
    );
    assert.equal(rows.length, 1, "Expected exactly one deletion-log row");
    assert.equal(rows[0].message_id,         msgId,          "message_id mismatch");
    assert.equal(rows[0].deleted_by_user_id, adminId,        "deleted_by_user_id mismatch");
    assert.equal(rows[0].original_content,   content,        "original_content mismatch");
    assert.equal(rows[0].original_author_id, reactAuthorId,  "original_author_id mismatch");

    // Reactions must have been cascade-deleted (no orphan rows)
    const { rowCount: reactCount } = await pool.query(
      `SELECT 1 FROM global_chat_reactions WHERE message_id = $1`, [msgId],
    );
    assert.equal(reactCount, 0, "Reactions should be cascade-deleted with the message");
  });

  test("deletion log captures snapshot for a reply-target message, and the reply's reply_to_id is nulled", async () => {
    // Post the parent message
    const parentContent = `msg-reply-parent-${SUFFIX}`;
    const parentId      = await postMessage(rParentId, rParentUsername, parentContent);

    // Post a reply that references the parent
    const replyR = await req(
      "POST", "/global-chat/messages",
      rChildId, rChildUsername,
      { content: `reply-child-${SUFFIX}`, channel: "general", replyToId: parentId },
    );
    assert.equal(replyR.status, 201, `Post reply failed: ${JSON.stringify(replyR.body)}`);
    const replyId = (replyR.body as any).id as number;
    assert.equal((replyR.body as any).replyTo?.id, parentId, "Reply should reference the parent");

    // Open WS observer before deleting the parent
    const obs = openWsObserver(adminId, adminUsername);
    await new Promise(r => setTimeout(r, 100));

    // Delete the parent (reply_to_id FK is ON DELETE SET NULL)
    const delR = await req("DELETE", `/global-chat/messages/${parentId}`, adminId, adminUsername);
    assert.equal(delR.status, 200, `Expected 200, got ${delR.status}: ${JSON.stringify(delR.body)}`);
    assert.equal((delR.body as any).deleted, true);

    // Broadcast must fire after commit
    await obs.waitFor((m: any) => m?.type === "global_chat_delete" && m?.messageId === parentId);
    obs.close();

    // Deletion log must capture the parent's content and author before cascade
    const { rows } = await pool.query<{
      message_id: number;
      deleted_by_user_id: number;
      original_content: string;
      original_author_id: number;
    }>(
      `SELECT message_id, deleted_by_user_id, original_content, original_author_id
       FROM global_chat_deletions WHERE message_id = $1`,
      [parentId],
    );
    assert.equal(rows.length, 1, "Expected exactly one deletion-log row for the parent");
    assert.equal(rows[0].message_id,         parentId,      "message_id mismatch");
    assert.equal(rows[0].deleted_by_user_id, adminId,       "deleted_by_user_id mismatch");
    assert.equal(rows[0].original_content,   parentContent, "original_content mismatch");
    assert.equal(rows[0].original_author_id, rParentId,     "original_author_id mismatch");

    // The child reply must still exist in the DB with reply_to_id NULLed out
    const { rows: childRows } = await pool.query<{
      id: number; reply_to_id: number | null;
    }>(
      `SELECT id, reply_to_id FROM global_chat_messages WHERE id = $1`, [replyId],
    );
    assert.equal(childRows.length, 1, "The reply message should still exist after parent deletion");
    assert.equal(
      childRows[0].reply_to_id,
      null,
      "reply_to_id should be SET NULL after the referenced parent is deleted",
    );
  });
});
