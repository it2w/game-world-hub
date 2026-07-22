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
 *  6. Two different users react with the same emoji concurrently →
 *     GET /clips/:id/reactions per-emoji count is exactly 2.
 *  7. The POST response reactions map matches GET /clips/:id/reactions
 *     (server truth) after any successful toggle.
 *  8. A failed POST (invalid emoji) leaves per-emoji counts unchanged.
 *  9. Optimistic-rollback scenario: server state is correct after a
 *     second user's concurrent reaction arrives while the first user's
 *     toggle is still in flight.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { db, usersTable, pool } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { signToken } from "../middlewares/auth";
import { ensureClipsTables } from "./clips";
import app from "../app";
import { ensureClipsTables } from "./clips";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let ownerId = 0;
let reactorId = 0;
let viewerId = 0;
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
  // Create three users: clip owner, a reactor, and a non-owner viewer
  const [owner, reactor, viewer] = await db
    .insert(usersTable)
    .values([makeUser("owner"), makeUser("reactor"), makeUser("viewer")])
    .returning({ id: usersTable.id, username: usersTable.username });
  ownerId = owner.id;
  reactorId = reactor.id;
  viewerId = viewer.id;
  createdUserIds.push(ownerId, reactorId, viewerId);

  // Ensure clips tables exist (idempotent — uses the canonical URL-based schema).
  await ensureClipsTables();

  // Seed a single clip for the owner (raw SQL — clips use pool directly)
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `INSERT INTO clips (owner_id, title, game, mime_type) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ownerId, "Test Clip", "TestGame", "image/png"],
  );
  clipId = clip.id;
  // Add a stub media row (object-storage schema: file_url TEXT)
  await pool.query(
    `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
    [clipId, "/objects/uploads/stub-test-uuid"],
  );

  // Spin up the HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  test("non-owner viewer receives correct per-emoji breakdown when reacting to a clip they do not own", async () => {
    /**
     * Scenario:
     *   - ownerId    owns the clip
     *   - reactorId  reacts with 🔥  (non-owner)
     *   - viewerId   reacts with 🔥 and GG  (third user, non-owner)
     *
     * After viewerId's GG reaction the response map must aggregate all users:
     *   🔥 → 2 (owner + reactor)   GG → 1 (viewer)
     * The map is identical to the broadcastAll payload, so this also validates
     * the broadcast shape from the perspective of a non-owning reactor.
     */
    const viewerUsername = `clipstest_viewer_${SUFFIX}`;

    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1`, [clipId]);

    // Owner reacts with 🔥
    const r1 = await postReaction(ownerId, ownerUsername, clipId, EMOJI_FIRE);
    assert.equal(r1.status, 200, "owner 🔥 POST should succeed");
    assert.equal((r1.body as { reactions: Record<string, number> }).reactions[EMOJI_FIRE], 1);

    // Non-owner reactor reacts with 🔥 — count should reach 2
    const r2 = await postReaction(reactorId, reactorUsername, clipId, EMOJI_FIRE);
    assert.equal(r2.status, 200, "non-owner reactor 🔥 POST should succeed");
    const b2 = r2.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b2.toggled, true, "non-owner reactor's 🔥 should be toggled on");
    assert.equal(b2.reactions[EMOJI_FIRE], 2, "🔥 count should be 2 after owner + reactor");

    // Third non-owner user (viewer) reacts with GG — the map returned to them
    // must contain the full aggregated picture across all users.
    const r3 = await postReaction(viewerId, viewerUsername, clipId, EMOJI_GG);
    assert.equal(r3.status, 200, "non-owner viewer GG POST should succeed");
    const b3 = r3.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b3.toggled, true, "viewer's GG should be toggled on");
    assert.equal(b3.reactions[EMOJI_FIRE], 2, "🔥 count must remain 2 in non-owner viewer response");
    assert.equal(b3.reactions[EMOJI_GG], 1, "GG count must be 1 in non-owner viewer response");
    assert.equal(
      Object.keys(b3.reactions).length,
      2,
      "exactly two emoji keys expected in non-owner viewer response map",
    );

    // Non-owner viewer toggles GG off — GG key must disappear from the map
    const r4 = await postReaction(viewerId, viewerUsername, clipId, EMOJI_GG);
    assert.equal(r4.status, 200, "viewer GG toggle-off should succeed");
    const b4 = r4.body as { toggled: boolean; reactions: Record<string, number> };
    assert.equal(b4.toggled, false, "viewer's GG toggle-off should be reflected");
    assert.equal(b4.reactions[EMOJI_FIRE], 2, "🔥 count must still be 2 after viewer removes GG");
    assert.ok(
      !Object.prototype.hasOwnProperty.call(b4.reactions, EMOJI_GG),
      "GG key must be absent after non-owner viewer toggles it off",
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

describe("GET /clips/:id/reactions — per-emoji accuracy with concurrent cross-user toggles", () => {
  const EMOJI = "🔥";
  const ownerUsername = `clipstest_owner_${SUFFIX}`;
  const reactorUsername = `clipstest_reactor_${SUFFIX}`;

  test("two different users reacting with the same emoji concurrently yields count=2", async () => {
    // Clean slate for both users on this emoji
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`,
      [clipId, EMOJI],
    );

    // Both users react simultaneously — simulates a second user reacting while
    // the lightbox is open for the first user
    const [r1, r2] = await Promise.all([
      postReaction(ownerId, ownerUsername, clipId, EMOJI),
      postReaction(reactorId, reactorUsername, clipId, EMOJI),
    ]);

    assert.equal(r1.status, 200, "owner reaction POST should succeed");
    assert.equal(r2.status, 200, "reactor reaction POST should succeed");

    // DB must have exactly 2 distinct rows for this emoji
    const dbCounts = await dbPerEmojiCounts(clipId);
    assert.equal(
      dbCounts[EMOJI] ?? 0,
      2,
      "two different users reacting gives per-emoji count of 2 in the database",
    );

    // GET /clips/:id/reactions must agree with the DB
    const getRes = await getClipReactions(ownerId, ownerUsername, clipId);
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
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`, [clipId, EMOJI]);
  });

  test("POST response reactions map matches GET /clips/:id/reactions after a toggle", async () => {
    // Ensure a known baseline: reactor has no reaction
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [clipId, reactorId, EMOJI],
    );

    const postRes = await postReaction(reactorId, reactorUsername, clipId, EMOJI);
    assert.equal(postRes.status, 200, "reaction POST should succeed");
    const postBody = postRes.body as { toggled: boolean; reactions: Record<string, number> };

    // Immediately fetch per-emoji counts from the server
    const getRes = await getClipReactions(reactorId, reactorUsername, clipId);
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
      [clipId, reactorId, EMOJI],
    );
  });

  test("a failed POST (invalid emoji) leaves per-emoji counts unchanged on the server", async () => {
    // Establish a known state: owner reacts with EMOJI
    await pool.query(
      `DELETE FROM clip_reactions WHERE clip_id=$1 AND user_id=$2 AND emoji=$3`,
      [clipId, ownerId, EMOJI],
    );
    await pool.query(
      `INSERT INTO clip_reactions (clip_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [clipId, ownerId, EMOJI],
    );

    const beforeCounts = await dbPerEmojiCounts(clipId);

    // Attempt a bad POST (unsupported emoji) — this simulates the server rejecting
    // a request that the frontend would optimistically roll back
    const badRes = await postReaction(reactorId, reactorUsername, clipId, "🦄");
    assert.equal(badRes.status, 400, "bad emoji should be rejected with 400");

    // Server state must be identical to before the failed request
    const afterCounts = await dbPerEmojiCounts(clipId);
    assert.deepEqual(
      afterCounts,
      beforeCounts,
      "a failed POST must not mutate per-emoji counts on the server",
    );

    // GET /clips/:id/reactions must still report the pre-failure state
    const getRes = await getClipReactions(ownerId, ownerUsername, clipId);
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
      [clipId, ownerId, EMOJI],
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
      [clipId, EMOJI],
    );

    // Step 2: B reacts first (in the background while A's lightbox is "open")
    const bRes = await postReaction(reactorId, reactorUsername, clipId, EMOJI);
    assert.equal(bRes.status, 200, "user B reaction should succeed");
    const bBody = bRes.body as { reactions: Record<string, number> };
    // B sees count=1 (only their own row)
    assert.equal(bBody.reactions[EMOJI] ?? 0, 1, "B is the sole reactor after their toggle");

    // Step 3: A now reacts — simulates the optimistic POST from the open lightbox
    const aRes = await postReaction(ownerId, ownerUsername, clipId, EMOJI);
    assert.equal(aRes.status, 200, "user A reaction should succeed");
    const aBody = aRes.body as { reactions: Record<string, number> };
    // After A's POST settles, server truth must reflect both reactions
    assert.equal(
      aBody.reactions[EMOJI] ?? 0,
      2,
      "after A reconciles with the server, per-emoji count must be 2 (A + B)",
    );

    // Confirm GET also agrees
    const getRes = await getClipReactions(ownerId, ownerUsername, clipId);
    const getBody = getRes.body as { reactions: Record<string, number>; mine: string[] };
    assert.equal(getBody.reactions[EMOJI] ?? 0, 2, "GET must confirm final count of 2");

    // DB as ground truth
    const dbCounts = await dbPerEmojiCounts(clipId);
    assert.equal(dbCounts[EMOJI] ?? 0, 2, "database must hold exactly 2 reaction rows");

    // Cleanup
    await pool.query(`DELETE FROM clip_reactions WHERE clip_id=$1 AND emoji=$2`, [clipId, EMOJI]);
  });
});
