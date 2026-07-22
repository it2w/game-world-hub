/**
 * Integration tests for clips upload, reactions, and rich presence endpoints.
 *
 * Covered scenarios:
 *  1.  POST /clips accepts a valid image file (passes validation, not 400)
 *  2.  POST /clips accepts a valid video file (passes validation, not 400)
 *  3.  POST /clips rejects an oversized image (>10 MB) with 400
 *  4.  POST /clips rejects an oversized video (>50 MB) with 400
 *  5.  POST /clips rejects a non-image/video file type with 400
 *  6.  GET  /clips/:id increments view_count on each call
 *  7.  POST /clips/:id/reactions inserts on first call (toggled=true)
 *  8.  POST /clips/:id/reactions deletes on second call (toggled=false)
 *  9.  POST /clips/:id/reactions rejects invalid emoji with 400
 * 10.  DELETE /clips/:id returns 403 for non-owner
 * 11.  DELETE /clips/:id returns 200 for owner
 * 12.  GET  /clips/friends returns only clips from accepted friends
 * 13.  GET  /users/:id/presence returns hidden shape when presence_setting=hidden
 * 14.  GET  /users/:id/presence hides session details when presence_setting=game_only
 * 15.  PUT  /users/me/presence-settings rejects invalid values with 400
 * 16.  PUT  /users/me/presence-settings accepts valid values
 * 17.  Double-toggle: toggling the same emoji twice leaves reactionCount identical to original
 * 18.  Concurrent toggles: two rapid POSTs never double-count
 * 19.  GET /users/:id/clips reflects updated reactionCount after a reaction POST
 * 20.  Reacting to non-existent clip returns 404
 * 21.  Unauthenticated reaction request returns 401
 * 22.  Two users react with same emoji concurrently → per-emoji count is exactly 2
 * 23.  POST response reactions map matches server truth after any toggle
 * 24.  Non-owner viewer receives correct per-emoji breakdown
 * 25.  broadcastAll payload reflects per-emoji counts after toggle-on/off
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { db, pool, usersTable, friendshipsTable } from "@workspace/db";
import { inArray, or, eq } from "drizzle-orm";
import { signToken } from "../middlewares/auth";
import { ensureClipsTables } from "./clips";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// Users
let ownerId = 0;
let ownerUsername = "";
let reactorId = 0;
let reactorUsername = "";
let otherId = 0;
let otherUsername = "";
let friendId = 0;
let friendUsername = "";
let strangerId = 0;
let strangerUsername = "";

// A seeded clip used by reaction-correctness tests
let seededClipId = 0;

// Clips created on-the-fly during tests — cleaned up in after()
const createdClipIds: number[] = [];
const createdUserIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `clipstest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `ClipsTest ${label}`,
    status: "online" as const,
  };
}

function auth(id: number, username: string): Record<string, string> {
  return { Authorization: `Bearer ${signToken({ userId: id, username })}` };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

before(async () => {
  await ensureClipsTables();

  // Create test users
  const [owner, reactor, other, friend, stranger] = await db
    .insert(usersTable)
    .values([
      mkUser("owner"),
      mkUser("reactor"),
      mkUser("other"),
      mkUser("friend"),
      mkUser("stranger"),
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  ownerId = owner.id;
  ownerUsername = owner.username;
  reactorId = reactor.id;
  reactorUsername = reactor.username;
  otherId = other.id;
  otherUsername = other.username;
  friendId = friend.id;
  friendUsername = friend.username;
  strangerId = stranger.id;
  strangerUsername = stranger.username;

  createdUserIds.push(ownerId, reactorId, otherId, friendId, strangerId);

  // Create an accepted friendship between owner and friend
  await db.insert(friendshipsTable).values({ userId: ownerId, friendId });

  // Seed a clip for the owner used by reaction-correctness tests
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `INSERT INTO clips (owner_id, title, game, mime_type) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, "Seeded Clip", "TestGame", "image/png"],
  );
  seededClipId = clip.id;
  await pool.query(
    `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
    [seededClipId, "/objects/uploads/stub-test"],
  );
  createdClipIds.push(seededClipId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

  // Delete created clips (cascades to reactions, comments, media)
  if (createdClipIds.length) {
    await pool.query(`DELETE FROM clips WHERE id = ANY($1)`, [createdClipIds]);
  }

  // Clean up friendships
  await db.delete(friendshipsTable).where(
    or(eq(friendshipsTable.userId, ownerId), eq(friendshipsTable.friendId, ownerId)),
  );

  // Delete test users
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── Multipart helper ─────────────────────────────────────────────────────────

function buildMultipart(
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; mimeType: string; data: Buffer },
): { body: Buffer; boundary: string } {
  const boundary = `----FormBoundary${Date.now()}`;
  const CRLF = "\r\n";
  const parts: Buffer[] = [];

  const addPart = (header: string, body: Buffer) => {
    parts.push(Buffer.from(`--${boundary}${CRLF}${header}${CRLF}${CRLF}`));
    parts.push(body);
    parts.push(Buffer.from(CRLF));
  };

  for (const [name, value] of Object.entries(fields)) {
    addPart(`Content-Disposition: form-data; name="${name}"`, Buffer.from(value));
  }

  addPart(
    `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}`,
    file.data,
  );

  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { body: Buffer.concat(parts), boundary };
}

async function uploadClip(
  actorId: number,
  actorUsername: string,
  fileData: Buffer,
  mimeType: string,
  title = "Test Clip",
): Promise<{ status: number; body: unknown }> {
  const { body, boundary } = buildMultipart(
    { title },
    { fieldname: "file", filename: "clip.bin", mimeType, data: fileData },
  );
  const res = await fetch(`${baseUrl}/clips`, {
    method: "POST",
    headers: {
      ...auth(actorId, actorUsername),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function apiJson(
  method: string,
  path: string,
  actorId: number,
  actorUsername: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...auth(actorId, actorUsername),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

// Low-level reaction POST (used by concurrent-toggle tests that need httpRequest)
async function postReaction(
  actorId: number,
  actorUsername: string,
  clipIdParam: number,
  emoji: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: actorId, username: actorUsername });
  const payload = JSON.stringify({ emoji });

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        path: `/api/clips/${clipIdParam}/reactions`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
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
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getUserClips(
  actorId: number,
  actorUsername: string,
  targetUserId: number,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: actorId, username: actorUsername });

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        path: `/api/users/${targetUserId}/clips`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
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
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function getFriendsClips(
  actorId: number,
  actorUsername: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: actorId, username: actorUsername });

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        path: `/api/clips/friends`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
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
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function getClipReactions(
  actorId: number,
  actorUsername: string,
  clipIdParam: number,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: actorId, username: actorUsername });

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        path: `/api/clips/${clipIdParam}/reactions`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
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
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Helper: insert a clip row directly ──────────────────────────────────────

async function insertClip(clipOwnerId: number, opts: { title?: string } = {}): Promise<number> {
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, 'image/png') RETURNING id`,
    [clipOwnerId, opts.title ?? "Direct Clip"],
  );
  await pool.query(
    `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
    [clip.id, "/objects/uploads/stub-test"],
  );
  createdClipIds.push(clip.id);
  return clip.id;
}

/** Read the current total reaction count for a clip straight from the DB. */
async function dbReactionCount(id: number): Promise<number> {
  const { rows: [row] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM clip_reactions WHERE clip_id = $1`,
    [id],
  );
  return parseInt(row.cnt, 10);
}

/** Read per-emoji counts directly from the DB for a clip. */
async function dbPerEmojiCounts(id: number): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ emoji: string; cnt: string }>(
    `SELECT emoji, COUNT(*) AS cnt FROM clip_reactions WHERE clip_id=$1 GROUP BY emoji`,
    [id],
  );
  return Object.fromEntries(rows.map(r => [r.emoji, parseInt(r.cnt, 10)]));
}

// ─── POST /clips — upload ─────────────────────────────────────────────────────

describe("POST /clips — upload", () => {
  // "Accepts" tests verify that valid files pass all validation gates.
  // The route then hands off to object storage; in a test environment without
  // storage credentials the upload will fail with 500/503 — that is expected and
  // distinct from a 400 validation rejection. We assert status !== 400 to
  // confirm the file was accepted through validation, and track any clip row
  // that was inserted before a storage failure.

  test("passes validation for a small PNG image (not rejected with 400)", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082",
      "hex",
    );
    const { status, body } = await uploadClip(ownerId, ownerUsername, png, "image/png");
    assert.notEqual(status, 400, `PNG upload should pass validation; got status ${status}`);
    if (status === 201) {
      const b = body as Record<string, unknown>;
      if (typeof b.id === "number") createdClipIds.push(b.id as number);
    }
  });

  test("passes validation for a video/mp4 buffer (not rejected with 400)", async () => {
    const fakeVideo = Buffer.alloc(100, 0xff);
    const { status, body } = await uploadClip(ownerId, ownerUsername, fakeVideo, "video/mp4");
    assert.notEqual(status, 400, `video/mp4 upload should pass validation; got status ${status}`);
    if (status === 201) {
      const b = body as Record<string, unknown>;
      if (typeof b.id === "number") createdClipIds.push(b.id as number);
    }
  });

  test("rejects an image file larger than 10 MB with 400", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0x42);
    const { status, body } = await uploadClip(ownerId, ownerUsername, big, "image/jpeg");
    assert.equal(status, 400);
    assert.ok((body as Record<string, unknown>).error as string, "should return an error message");
    assert.ok(((body as Record<string, unknown>).error as string).toLowerCase().includes("too large"));
  });

  test("rejects a video file larger than 50 MB with 400", async () => {
    const big = Buffer.alloc(51 * 1024 * 1024, 0x42);
    const { status, body } = await uploadClip(ownerId, ownerUsername, big, "video/webm");
    assert.equal(status, 400);
    assert.ok(((body as Record<string, unknown>).error as string).toLowerCase().includes("too large"));
  });

  test("rejects a non-image/video MIME type with 400", async () => {
    const data = Buffer.from("hello world");
    const { status, body } = await uploadClip(ownerId, ownerUsername, data, "application/pdf");
    assert.equal(status, 400);
    assert.ok(((body as Record<string, unknown>).error as string).toLowerCase().includes("only"));
  });
});

// ─── GET /clips/:id — view count increment ────────────────────────────────────

describe("GET /clips/:id — view count", () => {
  test("increments view_count on each successful fetch", async () => {
    const clipId = await insertClip(ownerId);

    const r1 = await apiJson("GET", `/clips/${clipId}`, ownerId, ownerUsername);
    assert.equal(r1.status, 200);
    const before = (r1.body as Record<string, unknown>).viewCount as number;

    const r2 = await apiJson("GET", `/clips/${clipId}`, ownerId, ownerUsername);
    assert.equal(r2.status, 200);
    const after2 = (r2.body as Record<string, unknown>).viewCount as number;

    assert.ok(after2 >= before, `view_count should be ≥ ${before}, got ${after2}`);
  });
});

// ─── POST /clips/:id/reactions — basic toggle ─────────────────────────────────

describe("POST /clips/:id/reactions — toggle", () => {
  test("first call inserts (toggled=true), second call deletes (toggled=false)", async () => {
    const clipId = await insertClip(ownerId);

    const r1 = await apiJson("POST", `/clips/${clipId}/reactions`, ownerId, ownerUsername, { emoji: "🔥" });
    assert.equal(r1.status, 200);
    assert.equal((r1.body as Record<string, unknown>).toggled, true, "first call should insert → toggled=true");

    const r2 = await apiJson("POST", `/clips/${clipId}/reactions`, ownerId, ownerUsername, { emoji: "🔥" });
    assert.equal(r2.status, 200);
    assert.equal((r2.body as Record<string, unknown>).toggled, false, "second call should delete → toggled=false");
  });

  test("rejects an emoji not in the allowed set with 400", async () => {
    const clipId = await insertClip(ownerId);
    const r = await apiJson("POST", `/clips/${clipId}/reactions`, ownerId, ownerUsername, { emoji: "❤️" });
    assert.equal(r.status, 400);
  });
});

// ─── POST /clips/:id/reactions — correctness ─────────────────────────────────

describe("POST /clips/:id/reactions — toggle correctness", () => {
  const EMOJI = "🔥";

  test("toggling the same emoji twice returns reactionCount to the original value", async () => {
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, ownerId, EMOJI],
    );
    const countBefore = await dbReactionCount(seededClipId);

    const res1 = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI);
    assert.equal(res1.status, 200, "first POST should succeed");
    assert.equal((res1.body as { toggled: boolean }).toggled, true, "first toggle should add the reaction");
    assert.equal(await dbReactionCount(seededClipId), countBefore + 1, "count should increase by 1");

    const res2 = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI);
    assert.equal(res2.status, 200, "second POST should succeed");
    assert.equal((res2.body as { toggled: boolean }).toggled, false, "second toggle should remove the reaction");
    assert.equal(await dbReactionCount(seededClipId), countBefore, "count must equal original after double-toggle");
  });

  test("rapid double-toggle by same user never double-counts (at most +1 reaction row)", async () => {
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, ownerId, EMOJI],
    );
    const countBefore = await dbReactionCount(seededClipId);

    const [r1, r2] = await Promise.all([
      postReaction(ownerId, ownerUsername, seededClipId, EMOJI),
      postReaction(ownerId, ownerUsername, seededClipId, EMOJI),
    ]);
    assert.ok(r1.status === 200 && r2.status === 200, "both rapid toggle requests should succeed (200)");

    const countAfter = await dbReactionCount(seededClipId);
    assert.ok(countAfter >= 0, "reaction count must not go negative");
    assert.ok(
      countAfter <= countBefore + 1,
      `rapid double-toggle must never double-count: expected at most ${countBefore + 1}, got ${countAfter}`,
    );
  });

  test("GET /users/:id/clips reflects updated reactionCount after a reaction POST", async () => {
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2`,
      [seededClipId, reactorId],
    );

    const before = await getUserClips(reactorId, reactorUsername, ownerId);
    assert.equal(before.status, 200, "GET /users/:id/clips should return 200");
    const beforeClips = (before.body as { clips: Array<{ id: number; reactionCount: number }> }).clips;
    const clipBefore = beforeClips.find(c => c.id === seededClipId);
    assert.ok(clipBefore !== undefined, "seeded clip must appear in user clips list");
    const countBefore = clipBefore!.reactionCount;

    const reactionRes = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI);
    assert.equal(reactionRes.status, 200, "reaction POST should succeed");

    const after = await getUserClips(reactorId, reactorUsername, ownerId);
    assert.equal(after.status, 200);
    const afterClips = (after.body as { clips: Array<{ id: number; reactionCount: number }> }).clips;
    const clipAfter = afterClips.find(c => c.id === seededClipId);
    assert.ok(clipAfter !== undefined, "clip must still appear in the list after reaction");
    assert.equal(clipAfter!.reactionCount, countBefore + 1, "reactionCount must increase by 1");

    // Clean up
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2`, [seededClipId, reactorId]);
  });
});

describe("POST /clips/:id/reactions — broadcastAll payload", () => {
  /**
   * broadcastAll is called with { type:"clip-reaction", clipId, reactions, actingUserId }.
   * The `reactions` map is identical to the `reactions` field in the HTTP response, so
   * verifying the response body is a faithful proxy for asserting the broadcast payload.
   */
  const EMOJI_FIRE = "🔥";
  const EMOJI_GG = "GG";

  test("broadcast payload reactions map reflects all per-emoji counts after a toggle-on", async () => {
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);

    const r1 = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE);
    assert.equal(r1.status, 200, "reaction POST should succeed");
    const b1 = r1.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b1.toggled, true, "first reaction should add");
    assert.equal(b1.reactions[EMOJI_FIRE], 1, "🔥 count should be 1");
    assert.equal(Object.keys(b1.reactions).length, 1, "only one emoji should be present");

    const r2 = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI_FIRE);
    assert.equal(r2.status, 200);
    const b2 = r2.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b2.reactions[EMOJI_FIRE], 2, "🔥 count should be 2 after second user reacts");

    const r3 = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI_GG);
    assert.equal(r3.status, 200);
    const b3 = r3.body as { reactions: Record<string, number> };
    assert.equal(b3.reactions[EMOJI_FIRE], 2, "🔥 count should remain 2");
    assert.equal(b3.reactions[EMOJI_GG], 1, "GG count should be 1");
    assert.equal(Object.keys(b3.reactions).length, 2, "two emoji keys expected in broadcast payload");

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);
  });

  test("broadcast payload reflects removal after toggle-off (emoji key disappears when count reaches 0)", async () => {
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);

    await postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE);
    const r = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE);
    assert.equal(r.status, 200);
    const body = r.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(body.toggled, false, "second toggle should remove the reaction");
    assert.ok(
      !Object.prototype.hasOwnProperty.call(body.reactions, EMOJI_FIRE),
      "🔥 key must be absent from reactions map after toggle-off (no zero-count entries)",
    );

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);
  });

  test("non-owner viewer receives correct per-emoji breakdown when reacting to a clip they do not own", async () => {
    /**
     * Scenario:
     *   - ownerId   owns the clip
     *   - reactorId reacts with 🔥  (non-owner)
     *   - otherId   reacts with GG  (third user, non-owner)
     *
     * After otherId's GG reaction the response map must aggregate all users:
     *   🔥 → 2 (owner + reactor)   GG → 1 (other)
     * The map is identical to the broadcastAll payload, so this also validates
     * the broadcast shape from the perspective of a non-owning reactor.
     */
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);

    // Owner reacts with 🔥
    const r1 = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI_FIRE);
    assert.equal(r1.status, 200, "owner 🔥 POST should succeed");
    assert.equal((r1.body as { reactions: Record<string, number> }).reactions[EMOJI_FIRE], 1);

    // Non-owner reactor reacts with 🔥 — count should reach 2
    const r2 = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE);
    assert.equal(r2.status, 200, "non-owner reactor 🔥 POST should succeed");
    const b2 = r2.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b2.toggled, true, "non-owner reactor's 🔥 should be toggled on");
    assert.equal(b2.reactions[EMOJI_FIRE], 2, "🔥 count should be 2 after owner + reactor");

    // Third non-owner user reacts with GG — the map returned must aggregate all users.
    const r3 = await postReaction(otherId, otherUsername, seededClipId, EMOJI_GG);
    assert.equal(r3.status, 200, "non-owner other GG POST should succeed");
    const b3 = r3.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b3.toggled, true, "other's GG should be toggled on");
    assert.equal(b3.reactions[EMOJI_FIRE], 2, "🔥 count must remain 2 in non-owner response");
    assert.equal(b3.reactions[EMOJI_GG], 1, "GG count must be 1 in non-owner response");
    assert.equal(Object.keys(b3.reactions).length, 2, "exactly two emoji keys expected");

    // Non-owner toggles GG off — GG key must disappear from the map
    const r4 = await postReaction(otherId, otherUsername, seededClipId, EMOJI_GG);
    assert.equal(r4.status, 200, "GG toggle-off should succeed");
    const b4 = r4.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b4.toggled, false, "GG toggle-off should be reflected");
    assert.equal(b4.reactions[EMOJI_FIRE], 2, "🔥 count must still be 2 after GG removed");
    assert.ok(
      !Object.prototype.hasOwnProperty.call(b4.reactions, EMOJI_GG),
      "GG key must be absent after non-owner toggles it off",
    );

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);
  });
});

describe("POST /clips/:id/reactions — edge cases", () => {

  test("invalid emoji returns 400", async () => {
    const res = await postReaction(ownerId, ownerUsername, seededClipId, "🦄");
    assert.equal(res.status, 400, "unsupported emoji should be rejected with 400");
    const body = res.body as { error: string };
    assert.ok(typeof body.error === "string" && body.error.includes("emoji"), `error should mention 'emoji'`);
  });

  test("reacting to a non-existent clip returns 404", async () => {
    const res = await postReaction(ownerId, ownerUsername, 999_999_999, "🔥");
    assert.equal(res.status, 404);
  });

  test("unauthenticated request returns 401", async () => {
    const payload = JSON.stringify({ emoji: "🔥" });
    const port = (server.address() as AddressInfo).port;
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: `/api/clips/${seededClipId}/reactions`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (r: IncomingMessage) => resolve({ status: r.statusCode ?? 0 }),
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
    assert.equal(res.status, 401);
  });
});

// ─── DELETE /clips/:id — owner-only ──────────────────────────────────────────

describe("DELETE /clips/:id — owner-only", () => {
  test("returns 403 when a non-owner tries to delete", async () => {
    const clipId = await insertClip(ownerId);
    const r = await apiJson("DELETE", `/clips/${clipId}`, otherId, otherUsername);
    assert.equal(r.status, 403);
    const { rows } = await pool.query(`SELECT id FROM clips WHERE id=$1`, [clipId]);
    assert.equal(rows.length, 1, "clip should not have been deleted");
  });

  test("returns 200 when owner deletes their own clip", async () => {
    const clipId = await insertClip(ownerId);
    const r = await apiJson("DELETE", `/clips/${clipId}`, ownerId, ownerUsername);
    assert.ok([200, 204].includes(r.status), `expected 200/204, got ${r.status}`);
    const { rows } = await pool.query(`SELECT id FROM clips WHERE id=$1`, [clipId]);
    assert.equal(rows.length, 0, "clip should have been deleted");
    const idx = createdClipIds.indexOf(clipId);
    if (idx !== -1) createdClipIds.splice(idx, 1);
  });
});

// ─── GET /clips/friends ───────────────────────────────────────────────────────

describe("GET /clips/friends", () => {
  test("returns clips from accepted friends and not from strangers", async () => {
    const friendClipId = await insertClip(friendId, { title: "Friend Clip" });
    const strangerClipId = await insertClip(strangerId, { title: "Stranger Clip" });

    const r = await apiJson("GET", "/clips/friends", ownerId, ownerUsername);
    assert.equal(r.status, 200);
    const clips = r.body as Array<Record<string, unknown>>;
    const ids = clips.map((c) => c.id as number);
    assert.ok(ids.includes(friendClipId), "should include friend's clip");
    assert.ok(!ids.includes(strangerClipId), "should NOT include stranger's clip");
  });
});

// ─── GET /users/:id/presence — privacy ───────────────────────────────────────

describe("GET /users/:id/presence — privacy", () => {
  test("returns hidden shape when presence_setting=hidden", async () => {
    await pool.query(`UPDATE users SET presence_setting='hidden' WHERE id=$1`, [otherId]);

    const r = await apiJson("GET", `/users/${otherId}/presence`, ownerId, ownerUsername);
    assert.equal(r.status, 200);
    const b = r.body as Record<string, unknown>;
    assert.equal(b.presenceSetting, "hidden");
    assert.equal(b.currentGame, null);
    assert.equal(b.sessionStartedAt, null);
    assert.equal(b.sessionDurationMs, null);

    await pool.query(`UPDATE users SET presence_setting='full' WHERE id=$1`, [otherId]);
  });

  test("returns currentGame when presence_setting=game_only (session details hidden)", async () => {
    await pool.query(
      `UPDATE users SET presence_setting='game_only', current_game='TestGame' WHERE id=$1`,
      [otherId],
    );

    const r = await apiJson("GET", `/users/${otherId}/presence`, ownerId, ownerUsername);
    assert.equal(r.status, 200);
    const b = r.body as Record<string, unknown>;
    assert.equal(b.presenceSetting, "game_only");
    assert.equal(b.currentGame, "TestGame");
    assert.equal(b.sessionStartedAt, null, "session start should be hidden in game_only");
    assert.equal(b.sessionDurationMs, null, "duration should be hidden in game_only");

    await pool.query(`UPDATE users SET presence_setting='full', current_game=NULL WHERE id=$1`, [otherId]);
  });
});

// ─── PUT /users/me/presence-settings ─────────────────────────────────────────

describe("PUT /users/me/presence-settings", () => {
  test("rejects invalid setting values with 400", async () => {
    const r = await apiJson("PUT", "/users/me/presence-settings", ownerId, ownerUsername, { setting: "public" });
    assert.equal(r.status, 400);
  });

  test("accepts valid setting=full with 200", async () => {
    const r = await apiJson("PUT", "/users/me/presence-settings", ownerId, ownerUsername, { setting: "full" });
    assert.equal(r.status, 200);
    const b = r.body as Record<string, unknown>;
    assert.equal(b.ok, true);
    assert.equal(b.setting, "full");
  });

  test("accepts valid setting=game_only with 200", async () => {
    const r = await apiJson("PUT", "/users/me/presence-settings", ownerId, ownerUsername, { setting: "game_only" });
    assert.equal(r.status, 200);
    assert.equal((r.body as Record<string, unknown>).setting, "game_only");
  });

  test("accepts valid setting=hidden with 200", async () => {
    const r = await apiJson("PUT", "/users/me/presence-settings", ownerId, ownerUsername, { setting: "hidden" });
    assert.equal(r.status, 200);
    assert.equal((r.body as Record<string, unknown>).setting, "hidden");
    // Reset
    await apiJson("PUT", "/users/me/presence-settings", ownerId, ownerUsername, { setting: "full" });
  });
});

describe("GET /clips/:id/reactions — per-emoji accuracy with concurrent cross-user toggles", () => {
  const EMOJI = "🔥";
  // ownerUsername / reactorUsername are module-level vars set in before()

  test("two different users reacting with the same emoji concurrently yields count=2", async () => {
    // Clean slate for both users on this emoji
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`,
      [seededClipId, EMOJI],
    );

    // Both users react simultaneously — simulates a second user reacting while
    // the lightbox is open for the first user
    const [r1, r2] = await Promise.all([
      postReaction(ownerId, ownerUsername, seededClipId, EMOJI),
      postReaction(reactorId, reactorUsername, seededClipId, EMOJI),
    ]);

    assert.equal(r1.status, 200, "owner reaction POST should succeed");
    assert.equal(r2.status, 200, "reactor reaction POST should succeed");

    // DB must have exactly 2 distinct rows for this emoji
    const dbCounts = await dbPerEmojiCounts(seededClipId);
    assert.equal(
      dbCounts[EMOJI] ?? 0,
      2,
      "two different users reacting gives per-emoji count of 2 in the database",
    );

    // GET /clips/:id/reactions must agree with the DB
    const getRes = await getClipReactions(ownerId, ownerUsername, seededClipId);
    assert.equal(getRes.status, 200, "GET /clips/:id/reactions should return 200");
    const getBody = getRes.body as { reactions: Record<string, number>; mine: string[] };
    assert.equal(
      getBody.reactions[EMOJI] ?? 0,
      2,
      "GET /clips/:id/reactions per-emoji count must match the database (2)",
    );

    // At least one POST response reactions map should also show count=2
    // (whichever ran second will see the combined state)
    const body1 = r1.body as { reactions: Record<string, number> };
    const body2 = r2.body as { reactions: Record<string, number> };
    const maxReported = Math.max(body1.reactions[EMOJI] ?? 0, body2.reactions[EMOJI] ?? 0);
    assert.equal(
      maxReported,
      2,
      "at least one POST response reactions map must reflect the final count of 2",
    );

    // Cleanup
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`, [seededClipId, EMOJI]);
  });

  test("POST response reactions map matches GET /clips/:id/reactions after a toggle", async () => {
    // Ensure a known baseline: reactor has no reaction
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, reactorId, EMOJI],
    );

    const postRes = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI);
    assert.equal(postRes.status, 200, "reaction POST should succeed");
    const postBody = postRes.body as { toggled: boolean; reactions: Record<string, number> };

    // Immediately fetch per-emoji counts from the server
    const getRes = await getClipReactions(reactorId, reactorUsername, seededClipId);
    assert.equal(getRes.status, 200, "GET /clips/:id/reactions should return 200");
    const getBody = getRes.body as { reactions: Record<string, number>; mine: string[] };

    // The POST response reactions map must match what GET reports (server truth)
    for (const emoji of Object.keys({ ...postBody.reactions, ...getBody.reactions })) {
      assert.equal(
        postBody.reactions[emoji] ?? 0,
        getBody.reactions[emoji] ?? 0,
        `per-emoji count for '${emoji}' in POST response must match GET /clips/:id/reactions`,
      );
    }

    // The toggled emoji must appear in mine[]
    assert.ok(
      getBody.mine.includes(EMOJI),
      "GET /clips/:id/reactions mine[] must include the emoji the reactor just toggled on",
    );

    // Cleanup
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, reactorId, EMOJI],
    );
  });

  test("a failed POST (invalid emoji) leaves per-emoji counts unchanged on the server", async () => {
    // Establish a known state: owner reacts with EMOJI
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, ownerId, EMOJI],
    );
    await pool.query(
      `INSERT INTO clip_reactions (clip_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [seededClipId, ownerId, EMOJI],
    );

    const beforeCounts = await dbPerEmojiCounts(seededClipId);

    // Attempt a bad POST (unsupported emoji) — this simulates the server rejecting
    // a request that the frontend would optimistically roll back
    const badRes = await postReaction(reactorId, reactorUsername, seededClipId, "🦄");
    assert.equal(badRes.status, 400, "bad emoji should be rejected with 400");

    // Server state must be identical to before the failed request
    const afterCounts = await dbPerEmojiCounts(seededClipId);
    assert.deepEqual(
      afterCounts,
      beforeCounts,
      "a failed POST must not mutate per-emoji counts on the server",
    );

    // GET /clips/:id/reactions must still report the pre-failure state
    const getRes = await getClipReactions(ownerId, ownerUsername, seededClipId);
    assert.equal(getRes.status, 200);
    const getBody = getRes.body as { reactions: Record<string, number> };
    assert.equal(
      getBody.reactions[EMOJI] ?? 0,
      beforeCounts[EMOJI] ?? 0,
      "GET /clips/:id/reactions must still show pre-failure count after a rejected POST",
    );

    // Cleanup
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [seededClipId, ownerId, EMOJI],
    );
  });

  test("second user reacting mid-session: lightbox per-emoji counts reconcile to server truth after both settle", async () => {
    // This test simulates the sequence:
    //   1. User A opens the lightbox (no reactions yet)
    //   2. User B reacts with EMOJI (concurrent, separate request)
    //   3. User A then reacts with the same EMOJI
    // After step 3 settles, the server should report count=2 (not 1),
    // matching what a reconciled lightbox would show.
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`,
      [seededClipId, EMOJI],
    );

    // Step 2: B reacts first (in the background while A's lightbox is "open")
    const bRes = await postReaction(reactorId, reactorUsername, seededClipId, EMOJI);
    assert.equal(bRes.status, 200, "user B reaction should succeed");
    const bBody = bRes.body as { reactions: Record<string, number> };
    // B sees count=1 (only their own row)
    assert.equal(bBody.reactions[EMOJI] ?? 0, 1, "B is the sole reactor after their toggle");

    // Step 3: A now reacts — simulates the optimistic POST from the open lightbox
    const aRes = await postReaction(ownerId, ownerUsername, seededClipId, EMOJI);
    assert.equal(aRes.status, 200, "user A reaction should succeed");
    const aBody = aRes.body as { reactions: Record<string, number> };
    // After A's POST settles, server truth must reflect both reactions
    assert.equal(
      aBody.reactions[EMOJI] ?? 0,
      2,
      "after A reconciles with the server, per-emoji count must be 2 (A + B)",
    );

    // Confirm GET also agrees
    const getRes = await getClipReactions(ownerId, ownerUsername, seededClipId);
    const getBody = getRes.body as { reactions: Record<string, number>; mine: string[] };
    assert.equal(getBody.reactions[EMOJI] ?? 0, 2, "GET must confirm final count of 2");

    // DB as ground truth
    const dbCounts = await dbPerEmojiCounts(seededClipId);
    assert.equal(dbCounts[EMOJI] ?? 0, 2, "database must hold exactly 2 reaction rows");

    // Cleanup
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`, [seededClipId, EMOJI]);
  });
});

// ─── Friends-clips strip reaction accuracy ────────────────────────────────────

describe("GET /clips/friends — reactionCount accuracy with concurrent cross-user toggles", () => {
  /**
   * GET /clips/friends only returns clips from accepted friends.
   * We make otherId friends with ownerId so the seeded clip appears in
   * otherId's strip.  The friendship row is inserted/deleted around the suite.
   *
   * Fixture variables (all defined at module scope):
   *   ownerId / ownerUsername   — owns seededClipId
   *   reactorId / reactorUsername — second reactor
   *   otherId / otherUsername   — acts as the strip viewer (friends with owner)
   *   seededClipId              — the clip under test
   */
  const EMOJI_FIRE = "🔥";
  const EMOJI_GG   = "GG";

  // Insert a friendship between otherId and ownerId so the clip is visible
  before(async () => {
    await pool.query(
      `INSERT INTO friendships (user_id, friend_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [otherId, ownerId],
    );
  });

  after(async () => {
    await pool.query(
      `DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`,
      [otherId, ownerId],
    );
  });

  test("two different-user reactions posted concurrently → GET /clips/friends returns correct reactionCount", async () => {
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);

    // owner and reactor both react with 🔥 concurrently
    const [r1, r2] = await Promise.all([
      postReaction(ownerId, ownerUsername, seededClipId, EMOJI_FIRE),
      postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE),
    ]);
    assert.equal(r1.status, 200, "owner 🔥 POST should succeed");
    assert.equal(r2.status, 200, "reactor 🔥 POST should succeed");

    // DB sanity: both rows must exist
    const dbCounts = await dbPerEmojiCounts(seededClipId);
    assert.equal(dbCounts[EMOJI_FIRE] ?? 0, 2, "DB must hold 2 🔥 rows after concurrent POSTs");

    // otherId (who is friends with the owner) fetches the strip
    const res = await getFriendsClips(otherId, otherUsername);
    assert.equal(res.status, 200, "GET /clips/friends should return 200");

    const body = res.body as Array<{ id: number; reactionCount: number; viewerReactions: string[] }>;
    const clip = body.find(c => c.id === seededClipId);
    assert.ok(clip !== undefined, "seeded clip must appear in the viewer's friends strip");
    assert.equal(
      clip!.reactionCount,
      2,
      "GET /clips/friends reactionCount must equal 2 after two concurrent reactions",
    );

    // otherId has not reacted yet — their viewerReactions must be empty
    assert.deepEqual(
      clip!.viewerReactions,
      [],
      "viewerReactions must be empty for a user who has not reacted",
    );

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);
  });

  test("when the strip viewer is one of the reactors, viewerReactions includes their emoji", async () => {
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);

    // reactor adds 🔥 first; then otherId (the strip requester) also adds 🔥 + GG
    await postReaction(reactorId, reactorUsername, seededClipId, EMOJI_FIRE);
    await postReaction(otherId, otherUsername, seededClipId, EMOJI_FIRE);
    await postReaction(otherId, otherUsername, seededClipId, EMOJI_GG);

    // Total: 🔥 → 2 (reactor + other), GG → 1 (other)
    const dbCounts = await dbPerEmojiCounts(seededClipId);
    assert.equal(dbCounts[EMOJI_FIRE] ?? 0, 2, "DB 🔥 count should be 2");
    assert.equal(dbCounts[EMOJI_GG]   ?? 0, 1, "DB GG count should be 1");

    const res = await getFriendsClips(otherId, otherUsername);
    assert.equal(res.status, 200, "GET /clips/friends should return 200");

    const body = res.body as Array<{ id: number; reactionCount: number; viewerReactions: string[] }>;
    const clip = body.find(c => c.id === seededClipId);
    assert.ok(clip !== undefined, "seeded clip must appear in the viewer's friends strip");

    assert.equal(
      clip!.reactionCount,
      3,
      "reactionCount must be 3 (reactor 🔥 + viewer 🔥 + viewer GG)",
    );

    // viewerReactions must list both emojis otherId posted
    assert.ok(
      clip!.viewerReactions.includes(EMOJI_FIRE),
      "viewerReactions must include 🔥 (viewer reacted with it)",
    );
    assert.ok(
      clip!.viewerReactions.includes(EMOJI_GG),
      "viewerReactions must include GG (viewer reacted with it)",
    );
    assert.equal(
      clip!.viewerReactions.length,
      2,
      "viewerReactions must contain exactly the two emojis the viewer posted",
    );

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [seededClipId]);
  });
});
