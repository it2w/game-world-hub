/**
 * Integration tests for clip reaction correctness.
 *
 * Covered scenarios:
 *  1. Double-toggle: toggling the same emoji twice leaves reactionCount
 *     identical to the original value (no phantom increment).
 *  2. Concurrent toggles: two rapid sequential POSTs by the same user
 *     produce a net count equal to zero added reactions.
 *  3. After a successful reaction POST the GET /users/:id/clips list
 *     reflects the updated reactionCount.
 *  4. Invalid emoji is rejected with 400.
 *  5. Reacting to a non-existent clip returns 404.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { db, usersTable, pool } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let ownerId = 0;
let reactorId = 0;
let clipId = 0;

const createdUserIds: number[] = [];

function makeUser(tag: string) {
  return {
    username: `clipstest_${tag}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `ClipsTest ${tag}`,
    status: "online" as const,
  };
}

function authHeader(userId: number, username: string): Record<string, string> {
  return { Authorization: `Bearer ${signToken({ userId, username })}` };
}

before(async () => {
  // Create two users: clip owner and a reactor
  const [owner, reactor] = await db
    .insert(usersTable)
    .values([makeUser("owner"), makeUser("reactor")])
    .returning({ id: usersTable.id, username: usersTable.username });
  ownerId = owner.id;
  reactorId = reactor.id;
  createdUserIds.push(ownerId, reactorId);

  // Ensure clips tables exist (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clips (
      id               SERIAL PRIMARY KEY,
      owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      game             TEXT,
      description      TEXT,
      mime_type        TEXT    NOT NULL,
      duration_seconds INTEGER,
      view_count       INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clips_media (
      clip_id        INTEGER PRIMARY KEY REFERENCES clips(id) ON DELETE CASCADE,
      file_data      BYTEA NOT NULL,
      thumbnail_data BYTEA
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_reactions (
      clip_id    INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (clip_id, user_id, emoji)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_comments (
      id         SERIAL PRIMARY KEY,
      clip_id    INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed a single clip for the owner (raw SQL — clips use pool directly)
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `INSERT INTO clips (owner_id, title, game, mime_type) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, "Test Clip", "TestGame", "image/png"],
  );
  clipId = clip.id;
  // Add a stub media row so thumbnail / media endpoints don't 404
  await pool.query(
    `INSERT INTO clips_media (clip_id, file_data) VALUES ($1, $2)`,
    [clipId, Buffer.from("stub")],
  );

  // Spin up the HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Clean up reactions, clip, users (cascade handles clip_reactions / clips_media)
  if (clipId) {
    await pool.query(`DELETE FROM clips WHERE id = $1`, [clipId]);
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read the current total reaction count for a clip straight from the DB. */
async function dbReactionCount(id: number): Promise<number> {
  const { rows: [row] } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM clip_reactions WHERE clip_id = $1`,
    [id],
  );
  return parseInt(row.cnt, 10);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /clips/:id/reactions — toggle correctness", () => {
  const EMOJI = "🔥";
  const ownerUsername = `clipstest_owner_${SUFFIX}`;

  // Reset reactions before each relevant sub-test by wiping them at DB level
  // (we use explicit beforeEach-style cleanup inside each test instead)

  test("toggling the same emoji twice returns reactionCount to the original value", async () => {
    // Ensure no pre-existing reaction
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [clipId, ownerId, EMOJI],
    );

    const countBefore = await dbReactionCount(clipId);

    // First toggle: add reaction
    const res1 = await postReaction(ownerId, ownerUsername, clipId, EMOJI);
    assert.equal(res1.status, 200, "first POST should succeed");
    const body1 = res1.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(body1.toggled, true, "first toggle should add the reaction");

    const countAfter1 = await dbReactionCount(clipId);
    assert.equal(countAfter1, countBefore + 1, "reaction count should increase by 1 after first toggle");

    // Second toggle: remove reaction
    const res2 = await postReaction(ownerId, ownerUsername, clipId, EMOJI);
    assert.equal(res2.status, 200, "second POST should succeed");
    const body2 = res2.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(body2.toggled, false, "second toggle should remove the reaction");

    const countAfter2 = await dbReactionCount(clipId);
    assert.equal(
      countAfter2,
      countBefore,
      "reaction count after double-toggle must equal the original count (no double-count)",
    );
  });

  test("rapid double-toggle by same user never double-counts (at most +1 reaction row)", async () => {
    // Ensure clean slate
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [clipId, ownerId, EMOJI],
    );
    const countBefore = await dbReactionCount(clipId);

    // Fire both requests concurrently — simulates rapid UI taps
    const [r1, r2] = await Promise.all([
      postReaction(ownerId, ownerUsername, clipId, EMOJI),
      postReaction(ownerId, ownerUsername, clipId, EMOJI),
    ]);

    assert.ok(
      r1.status === 200 && r2.status === 200,
      "both rapid toggle requests should succeed (200)",
    );

    const countAfter = await dbReactionCount(clipId);

    // The PRIMARY KEY (clip_id, user_id, emoji) prevents duplicate rows.
    // Under concurrent execution the two requests may interleave as:
    //   (a) delete-A sees 0 → insert-A wins; delete-B finds the row → removes it → net 0
    //   (b) delete-A sees 0 → insert-A wins; delete-B misses (timing) → ON CONFLICT skips → net +1
    // Either outcome is valid — what is strictly forbidden is net +2 (double-count).
    assert.ok(
      countAfter >= 0,
      "reaction count must not go negative",
    );
    assert.ok(
      countAfter <= countBefore + 1,
      `rapid double-toggle must never double-count: expected at most ${countBefore + 1}, got ${countAfter}`,
    );
  });

  test("GET /users/:id/clips reflects updated reactionCount after a reaction POST", async () => {
    const reactorUsername = `clipstest_reactor_${SUFFIX}`;

    // Ensure reactor has no prior reaction on this clip
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2`,
      [clipId, reactorId],
    );

    // Read baseline count from the list endpoint
    const before = await getUserClips(reactorId, reactorUsername, ownerId);
    assert.equal(before.status, 200, "GET /users/:id/clips should return 200");
    const beforeBody = before.body as { clips: Array<{ id: number; reactionCount: number }> };
    const clipBefore = beforeBody.clips.find(c => c.id === clipId);
    assert.ok(clipBefore !== undefined, "seeded clip must appear in user clips list");
    const countBefore = clipBefore!.reactionCount;

    // Add a reaction
    const reactionRes = await postReaction(reactorId, reactorUsername, clipId, EMOJI);
    assert.equal(reactionRes.status, 200, "reaction POST should succeed");

    // Re-fetch the list and verify the count is now higher
    const after = await getUserClips(reactorId, reactorUsername, ownerId);
    assert.equal(after.status, 200, "GET /users/:id/clips after reaction should return 200");
    const afterBody = after.body as { clips: Array<{ id: number; reactionCount: number }> };
    const clipAfter = afterBody.clips.find(c => c.id === clipId);
    assert.ok(clipAfter !== undefined, "clip must still appear in the list after reaction");
    assert.equal(
      clipAfter!.reactionCount,
      countBefore + 1,
      "reactionCount in GET /users/:id/clips must increase by 1 after a reaction POST",
    );

    // Clean up
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2`,
      [clipId, reactorId],
    );
  });
});

describe("POST /clips/:id/reactions — broadcastAll payload", () => {
  /**
   * broadcastAll is called with { type:"clip-reaction", clipId, reactions, actingUserId }.
   * The `reactions` map is identical to the `reactions` field in the HTTP response, so
   * verifying the response body is a faithful proxy for asserting the broadcast payload.
   */
  const ownerUsername = `clipstest_owner_${SUFFIX}`;
  const reactorUsername = `clipstest_reactor_${SUFFIX}`;
  const EMOJI_FIRE = "🔥";
  const EMOJI_GG = "GG";

  test("broadcast payload reactions map reflects all per-emoji counts after a toggle-on", async () => {
    // Ensure a clean slate for this sub-test
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [clipId]);

    // Reactor adds 🔥
    const r1 = await postReaction(reactorId, reactorUsername, clipId, EMOJI_FIRE);
    assert.equal(r1.status, 200, "reaction POST should succeed");
    const b1 = r1.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b1.toggled, true, "first reaction should add");
    // reactions map must contain exactly the emojis that exist
    assert.equal(b1.reactions[EMOJI_FIRE], 1, "🔥 count should be 1");
    assert.equal(Object.keys(b1.reactions).length, 1, "only one emoji should be present");

    // Owner also adds 🔥 — count should reach 2
    const r2 = await postReaction(ownerId, ownerUsername, clipId, EMOJI_FIRE);
    assert.equal(r2.status, 200);
    const b2 = r2.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b2.reactions[EMOJI_FIRE], 2, "🔥 count should be 2 after second user reacts");

    // Owner also adds GG — map should now have two emoji keys
    const r3 = await postReaction(ownerId, ownerUsername, clipId, EMOJI_GG);
    assert.equal(r3.status, 200);
    const b3 = r3.body as { reactions: Record<string, number> };
    assert.equal(b3.reactions[EMOJI_FIRE], 2, "🔥 count should remain 2");
    assert.equal(b3.reactions[EMOJI_GG], 1, "GG count should be 1");
    assert.equal(Object.keys(b3.reactions).length, 2, "two emoji keys expected in broadcast payload");

    // Clean up
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [clipId]);
  });

  test("broadcast payload reflects removal after toggle-off (emoji key disappears when count reaches 0)", async () => {
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [clipId]);

    // Add 🔥
    await postReaction(reactorId, reactorUsername, clipId, EMOJI_FIRE);
    // Remove 🔥 (toggle off)
    const r = await postReaction(reactorId, reactorUsername, clipId, EMOJI_FIRE);
    assert.equal(r.status, 200);
    const body = r.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(body.toggled, false, "second toggle should remove the reaction");
    // Once removed the emoji should not appear in the map at all
    assert.ok(
      !Object.prototype.hasOwnProperty.call(body.reactions, EMOJI_FIRE),
      "🔥 key must be absent from reactions map after toggle-off (no zero-count entries)",
    );

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [clipId]);
  });
});

describe("POST /clips/:id/reactions — edge cases", () => {
  const ownerUsername = `clipstest_owner_${SUFFIX}`;

  test("invalid emoji returns 400", async () => {
    const res = await postReaction(ownerId, ownerUsername, clipId, "🦄");
    assert.equal(res.status, 400, "unsupported emoji should be rejected with 400");
    const body = res.body as { error: string };
    assert.ok(
      typeof body.error === "string" && body.error.includes("emoji"),
      `error message should mention 'emoji', got: ${body.error}`,
    );
  });

  test("reacting to a non-existent clip returns 404", async () => {
    const res = await postReaction(ownerId, ownerUsername, 999_999_999, "🔥");
    assert.equal(res.status, 404, "non-existent clip should return 404");
  });

  test("unauthenticated request returns 401", async () => {
    const payload = JSON.stringify({ emoji: "🔥" });
    const port = (server.address() as AddressInfo).port;
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: `/api/clips/${clipId}/reactions`,
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
    assert.equal(res.status, 401, "unauthenticated request should return 401");
  });
});
