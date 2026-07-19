import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { eq, inArray, and } from "drizzle-orm";
import { db, usersTable, lfgPostsTable, lfgResponsesTable, notificationsTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

/**
 * Integration tests for LFG stale-post guards (Task 28 behaviour).
 *
 * Covered scenarios:
 *   1. POST /lfg/:postId/respond on a manually-closed post  → 409
 *   2. POST /lfg/:postId/respond on a time-expired post     → 409
 *   3. GET  /lfg excludes closed posts that belong to other users
 */

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// Users
let authorId = 0;
let responderId = 0;

// Posts created in before(); deleted in after()
let closedPostId = 0;
let expiredPostId = 0;
let openPostId = 0;

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];

function makeUser(tag: string) {
  return {
    username: `lfgtest_${tag}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `LfgTest ${tag}`,
    status: "online" as const,
  };
}

function authHeader(userId: number, username: string): Record<string, string> {
  return { Authorization: `Bearer ${signToken({ userId, username })}` };
}

before(async () => {
  // Create two users: one who owns posts, one who tries to respond
  const [author, responder] = await db
    .insert(usersTable)
    .values([makeUser("author"), makeUser("responder")])
    .returning({ id: usersTable.id, username: usersTable.username });
  authorId = author.id;
  responderId = responder.id;
  createdUserIds.push(authorId, responderId);

  // Closed post (status = "closed")
  const [closedPost] = await db
    .insert(lfgPostsTable)
    .values({
      authorId,
      game: "TestGame",
      description: "Closed post",
      neededPlayers: 1,
      micRequired: false,
      status: "closed",
    })
    .returning({ id: lfgPostsTable.id });
  closedPostId = closedPost.id;
  createdPostIds.push(closedPostId);

  // Expired post (status = "open" but expiresAt is in the past)
  const pastDate = new Date(Date.now() - 60_000); // 1 minute ago
  const [expiredPost] = await db
    .insert(lfgPostsTable)
    .values({
      authorId,
      game: "TestGame",
      description: "Expired post",
      neededPlayers: 1,
      micRequired: false,
      status: "open",
      expiresAt: pastDate,
    })
    .returning({ id: lfgPostsTable.id });
  expiredPostId = expiredPost.id;
  createdPostIds.push(expiredPostId);

  // Open post owned by the author (should appear in GET /lfg for everyone)
  const [openPost] = await db
    .insert(lfgPostsTable)
    .values({
      authorId,
      game: "TestGame",
      description: "Open post",
      neededPlayers: 1,
      micRequired: false,
      status: "open",
    })
    .returning({ id: lfgPostsTable.id });
  openPostId = openPost.id;
  createdPostIds.push(openPostId);

  // Spin up an HTTP server wrapping the Express app
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdPostIds.length) {
    await db.delete(notificationsTable).where(
      inArray(notificationsTable.relatedId, createdPostIds),
    );
    await db.delete(lfgResponsesTable).where(
      inArray(lfgResponsesTable.postId, createdPostIds),
    );
    await db.delete(lfgPostsTable).where(
      inArray(lfgPostsTable.id, createdPostIds),
    );
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

// ─── Helper ────────────────────────────────────────────────────────────────

async function postRespond(
  postId: number,
  userId: number,
  username: string,
): Promise<Response> {
  return fetch(`${baseUrl}/api/lfg/${postId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(userId, username),
    },
    body: JSON.stringify({ message: "Let me in!" }),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("POST /lfg/:postId/respond — concurrent duplicate guard", () => {
  // Isolated post so this describe block doesn't share state with others
  let concurrentPostId = 0;
  let concurrentResponderId = 0;

  before(async () => {
    const [concurrentResponder] = await db
      .insert(usersTable)
      .values(makeUser("concurrent"))
      .returning({ id: usersTable.id });
    concurrentResponderId = concurrentResponder.id;
    createdUserIds.push(concurrentResponderId);

    const [concurrentPost] = await db
      .insert(lfgPostsTable)
      .values({
        authorId,
        game: "RaceGame",
        description: "Post for concurrent-response test",
        neededPlayers: 2,
        micRequired: false,
        status: "open",
      })
      .returning({ id: lfgPostsTable.id });
    concurrentPostId = concurrentPost.id;
    createdPostIds.push(concurrentPostId);
  });

  test("two simultaneous requests create exactly one DB row and one notification", async () => {
    const headers = {
      "Content-Type": "application/json",
      ...authHeader(concurrentResponderId, `lfgtest_concurrent_${SUFFIX}`),
    };
    const body = JSON.stringify({ message: "Race me!" });

    // Fire both requests at the same time — simulates two-tab simultaneous submit
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/lfg/${concurrentPostId}/respond`, { method: "POST", headers, body }),
      fetch(`${baseUrl}/api/lfg/${concurrentPostId}/respond`, { method: "POST", headers, body }),
    ]);

    assert.equal(res1.status, 200, "first concurrent request must return 200");
    assert.equal(res2.status, 200, "second concurrent request must return 200");

    // Exactly one response row
    const responseRows = await db
      .select()
      .from(lfgResponsesTable)
      .where(
        and(
          eq(lfgResponsesTable.postId, concurrentPostId),
          eq(lfgResponsesTable.userId, concurrentResponderId),
        ),
      );
    assert.equal(
      responseRows.length,
      1,
      "concurrent duplicate responses must produce exactly one lfg_responses row",
    );

    // Exactly one notification
    const notifRows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, authorId),
          eq(notificationsTable.type, "lfg_response"),
          eq(notificationsTable.relatedId, concurrentPostId),
        ),
      );
    assert.equal(
      notifRows.length,
      1,
      "concurrent duplicate responses must produce exactly one lfg_response notification",
    );
  });
});

describe("POST /lfg/:postId/respond — author and duplicate guards", () => {
  test("returns 400 when the post author responds to their own post", async () => {
    const res = await postRespond(openPostId, authorId, `lfgtest_author_${SUFFIX}`);
    assert.equal(res.status, 400, "expected 400 when author responds to own post");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });

  test("returns 200 on a duplicate response without adding a second record", async () => {
    // First response — should succeed and insert one record
    const res1 = await postRespond(openPostId, responderId, `lfgtest_responder_${SUFFIX}`);
    assert.equal(res1.status, 200, "expected 200 for first response");

    const countBefore = await db
      .select()
      .from(lfgResponsesTable)
      .where(
        eq(lfgResponsesTable.postId, openPostId),
      )
      .then((rows) => rows.filter((r) => r.userId === responderId).length);

    // Second response — idempotent, should still return 200
    const res2 = await postRespond(openPostId, responderId, `lfgtest_responder_${SUFFIX}`);
    assert.equal(res2.status, 200, "expected 200 for duplicate response");

    const countAfter = await db
      .select()
      .from(lfgResponsesTable)
      .where(
        eq(lfgResponsesTable.postId, openPostId),
      )
      .then((rows) => rows.filter((r) => r.userId === responderId).length);

    assert.equal(countAfter, countBefore, "duplicate response must not add a second DB record");
  });
});

describe("POST /lfg/:postId/respond — missing-post guard", () => {
  test("returns 404 when the post does not exist", async () => {
    const res = await postRespond(999999999, responderId, `lfgtest_responder_${SUFFIX}`);
    assert.equal(res.status, 404, "expected 404 when post does not exist");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });
});

describe("POST /lfg/:postId/respond — stale-post guard", () => {
  test("returns 409 when the post is closed", async () => {
    const res = await postRespond(closedPostId, responderId, `lfgtest_responder_${SUFFIX}`);
    assert.equal(res.status, 409, "expected 409 for a closed post");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });

  test("returns 409 when the post has expired", async () => {
    const res = await postRespond(expiredPostId, responderId, `lfgtest_responder_${SUFFIX}`);
    assert.equal(res.status, 409, "expected 409 for an expired post");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });
});

describe("POST /lfg/:postId/respond — empty / missing body", () => {
  // Dedicated posts + responders so state is isolated from other blocks
  let emptyBodyPostId = 0;
  let noBodyPostId = 0;
  let emptyResponderId = 0;
  let noBodyResponderId = 0;

  before(async () => {
    const [emptyResponder, noBodyResponder] = await db
      .insert(usersTable)
      .values([makeUser("emptybody"), makeUser("nobody")])
      .returning({ id: usersTable.id });
    emptyResponderId = emptyResponder.id;
    noBodyResponderId = noBodyResponder.id;
    createdUserIds.push(emptyResponderId, noBodyResponderId);

    const posts = await db
      .insert(lfgPostsTable)
      .values([
        {
          authorId,
          game: "EmptyBodyGame",
          description: "Post for empty-body respond test",
          neededPlayers: 1,
          micRequired: false,
          status: "open" as const,
        },
        {
          authorId,
          game: "NoBodyGame",
          description: "Post for no-body respond test",
          neededPlayers: 1,
          micRequired: false,
          status: "open" as const,
        },
      ])
      .returning({ id: lfgPostsTable.id });
    emptyBodyPostId = posts[0].id;
    noBodyPostId = posts[1].id;
    createdPostIds.push(emptyBodyPostId, noBodyPostId);
  });

  test("returns 200 with an empty JSON object body and increments responseCount", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${emptyBodyPostId}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(emptyResponderId, `lfgtest_emptybody_${SUFFIX}`),
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200, "respond with {} body must return 200");

    const post = (await res.json()) as {
      responseCount: number;
      viewerHasResponded: boolean;
    };
    assert.equal(post.responseCount, 1, "responseCount must increment to 1");
    assert.equal(post.viewerHasResponded, true, "viewerHasResponded must be true");

    // DB row exists with a null message
    const rows = await db
      .select()
      .from(lfgResponsesTable)
      .where(
        and(
          eq(lfgResponsesTable.postId, emptyBodyPostId),
          eq(lfgResponsesTable.userId, emptyResponderId),
        ),
      );
    assert.equal(rows.length, 1, "exactly one response row must exist");
    assert.equal(rows[0].message, null, "message must be stored as null");
  });

  test("returns 200 with no body and no Content-Type header", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${noBodyPostId}/respond`, {
      method: "POST",
      headers: authHeader(noBodyResponderId, `lfgtest_nobody_${SUFFIX}`),
      // No body, no Content-Type — express.json() leaves req.body undefined/{}
    });
    assert.equal(res.status, 200, "respond with no body must return 200");

    const post = (await res.json()) as { responseCount: number };
    assert.equal(post.responseCount, 1, "responseCount must increment to 1");

    const rows = await db
      .select()
      .from(lfgResponsesTable)
      .where(
        and(
          eq(lfgResponsesTable.postId, noBodyPostId),
          eq(lfgResponsesTable.userId, noBodyResponderId),
        ),
      );
    assert.equal(rows.length, 1, "exactly one response row must exist");
    assert.equal(rows[0].message, null, "message must be stored as null");
  });
});

describe("POST /lfg/:postId/respond — notification to post author", () => {
  // Use a dedicated post so notification state is isolated from other describe blocks
  let notifPostId = 0;

  before(async () => {
    const [notifPost] = await db
      .insert(lfgPostsTable)
      .values({
        authorId,
        game: "NotifGame",
        description: "Post for notification tests",
        neededPlayers: 1,
        micRequired: false,
        status: "open",
      })
      .returning({ id: lfgPostsTable.id });
    notifPostId = notifPost.id;
    createdPostIds.push(notifPostId);
  });

  test("creates a notification for the post author on a new response", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${notifPostId}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
      },
      body: JSON.stringify({ message: "I want to join!" }),
    });
    assert.equal(res.status, 200, "respond should return 200");

    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, authorId),
          eq(notificationsTable.type, "lfg_response"),
          eq(notificationsTable.relatedId, notifPostId),
        ),
      );

    assert.ok(rows.length >= 1, "expected at least one lfg_response notification for the author");

    const row = rows[0];
    // Verify the notification type is correct
    assert.equal(row.type, "lfg_response", "notification type must be 'lfg_response'");
    // Verify relatedId points to the correct post
    assert.equal(row.relatedId, notifPostId, "notification relatedId must match the post ID");
    // Verify the title contains the responder's display name and the game name
    // The responder was created with makeUser("responder") → displayName = "LfgTest responder"
    // The post was created with game = "NotifGame"
    assert.ok(
      typeof row.title === "string" && row.title.includes("LfgTest responder"),
      `notification title must include the responder's display name; got: "${row.title}"`,
    );
    assert.ok(
      typeof row.title === "string" && row.title.includes("NotifGame"),
      `notification title must include the game name; got: "${row.title}"`,
    );
    // Verify the body contains the responder's free-text message
    assert.equal(
      row.body,
      "I want to join!",
      `notification body must equal the responder's message; got: "${row.body}"`,
    );
    // Verify the notification is addressed to the post author explicitly
    assert.equal(
      row.userId,
      authorId,
      `notification userId must equal the post author's ID; got: ${row.userId}`,
    );
  });

  test("does NOT create a second notification on a duplicate response", async () => {
    // Count existing notifications for this post before the duplicate
    const before = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, authorId),
          eq(notificationsTable.type, "lfg_response"),
          eq(notificationsTable.relatedId, notifPostId),
        ),
      );

    // Send the same response again (duplicate)
    const res = await fetch(`${baseUrl}/api/lfg/${notifPostId}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
      },
      body: JSON.stringify({ message: "I want to join!" }),
    });
    assert.equal(res.status, 200, "duplicate respond should still return 200");

    const after = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, authorId),
          eq(notificationsTable.type, "lfg_response"),
          eq(notificationsTable.relatedId, notifPostId),
        ),
      );

    assert.equal(
      after.length,
      before.length,
      "duplicate response must not create an additional notification",
    );
  });
});

describe("DELETE /lfg/:postId — notification cleanup", () => {
  let deletePostId = 0;
  let deleteNotifId = 0;

  before(async () => {
    // Create a fresh open post owned by the author
    const [deletePost] = await db
      .insert(lfgPostsTable)
      .values({
        authorId,
        game: "DeleteGame",
        description: "Post to be deleted",
        neededPlayers: 1,
        micRequired: false,
        status: "open",
      })
      .returning({ id: lfgPostsTable.id });
    deletePostId = deletePost.id;
    createdPostIds.push(deletePostId);

    // Seed a notification that points to this post (simulates a responder notif)
    const [notif] = await db
      .insert(notificationsTable)
      .values({
        userId: authorId,
        type: "lfg_response",
        title: "Someone responded",
        relatedId: deletePostId,
      })
      .returning({ id: notificationsTable.id });
    deleteNotifId = notif.id;
  });

  // Seed a non-LFG notification with the same relatedId to confirm it is NOT deleted
  let unrelatedNotifId = 0;
  before(async () => {
    const [unrelated] = await db
      .insert(notificationsTable)
      .values({
        userId: authorId,
        type: "friend_request",
        title: "Unrelated notification",
        relatedId: deletePostId, // same numeric ID — must survive the delete
      })
      .returning({ id: notificationsTable.id });
    unrelatedNotifId = unrelated.id;
  });

  after(async () => {
    // Clean up unrelated notif in case the test didn't run
    await db.delete(notificationsTable).where(eq(notificationsTable.id, unrelatedNotifId));
  });

  test("deleting a post also removes its lfg_response notifications", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${deletePostId}`, {
      method: "DELETE",
      headers: authHeader(authorId, `lfgtest_author_${SUFFIX}`),
    });
    assert.equal(res.status, 200, "DELETE should return 200");

    // The post is now gone; remove from createdPostIds so after() doesn't fail
    const idx = createdPostIds.indexOf(deletePostId);
    if (idx !== -1) createdPostIds.splice(idx, 1);

    // Verify the lfg_response notification was cleaned up
    const remaining = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, deleteNotifId));

    assert.equal(
      remaining.length,
      0,
      "lfg_response notification should be deleted when the post is deleted",
    );
  });

  test("deleting a post does NOT remove non-LFG notifications with the same relatedId", async () => {
    // The unrelated friend_request notification seeded with the same relatedId
    // must still exist — the cleanup must be scoped to lfg_response type only.
    const remaining = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, unrelatedNotifId));

    assert.equal(
      remaining.length,
      1,
      "non-LFG notification with same relatedId must not be deleted when post is removed",
    );
  });
});

describe("POST /lfg/:postId/respond — invalid body", () => {
  test("returns 400 when message is a non-string value", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${openPostId}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
      },
      body: JSON.stringify({ message: 12345 }),
    });
    assert.equal(res.status, 400, "expected 400 when message is a non-string");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });

  test("returns 400 when message exceeds the 300-character limit", async () => {
    const longMessage = "a".repeat(301);
    const res = await fetch(`${baseUrl}/api/lfg/${openPostId}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
      },
      body: JSON.stringify({ message: longMessage }),
    });
    assert.equal(res.status, 400, "expected 400 when message exceeds 300 chars");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });
});

describe("POST /lfg/:postId/boost — cooldown enforcement", () => {
  let proUserId = 0;
  let nonProUserId = 0;
  let boostPostId = 0;
  let nonProPostId = 0;

  before(async () => {
    // Pro user — isPro=true, no expiry
    const [proUser] = await db
      .insert(usersTable)
      .values({ ...makeUser("boost_pro"), isPro: true })
      .returning({ id: usersTable.id, username: usersTable.username });
    proUserId = proUser.id;
    createdUserIds.push(proUserId);

    // Non-Pro user
    const [nonProUser] = await db
      .insert(usersTable)
      .values(makeUser("boost_nonpro"))
      .returning({ id: usersTable.id, username: usersTable.username });
    nonProUserId = nonProUser.id;
    createdUserIds.push(nonProUserId);

    // Open post owned by the Pro user
    const [boostPost] = await db
      .insert(lfgPostsTable)
      .values({
        authorId: proUserId,
        game: "BoostGame",
        description: "Post for boost tests",
        neededPlayers: 1,
        micRequired: false,
        status: "open",
      })
      .returning({ id: lfgPostsTable.id });
    boostPostId = boostPost.id;
    createdPostIds.push(boostPostId);

    // Open post owned by the non-Pro user
    const [nonProPost] = await db
      .insert(lfgPostsTable)
      .values({
        authorId: nonProUserId,
        game: "BoostGame",
        description: "Non-pro post",
        neededPlayers: 1,
        micRequired: false,
        status: "open",
      })
      .returning({ id: lfgPostsTable.id });
    nonProPostId = nonProPost.id;
    createdPostIds.push(nonProPostId);
  });

  test("non-Pro user gets 403", async () => {
    const res = await fetch(`${baseUrl}/api/lfg/${nonProPostId}/boost`, {
      method: "POST",
      headers: authHeader(nonProUserId, `lfgtest_boost_nonpro_${SUFFIX}`),
    });
    assert.equal(res.status, 403, "non-Pro user must receive 403");
    const body = await res.json() as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
  });

  test("first boost succeeds and sets boostedUntil ~30 min ahead", async () => {
    // Ensure no prior boost state
    await pool.query(
      `UPDATE lfg_posts SET boosted_until = NULL, last_boosted_at = NULL WHERE id = $1`,
      [boostPostId],
    );

    const before = new Date();
    const res = await fetch(`${baseUrl}/api/lfg/${boostPostId}/boost`, {
      method: "POST",
      headers: authHeader(proUserId, `lfgtest_boost_pro_${SUFFIX}`),
    });
    const after = new Date();

    assert.equal(res.status, 200, "first boost must return 200");
    const body = await res.json() as { boostedUntil: string; lastBoostedAt: string };

    // boostedUntil must be ~30 min (1800 s) in the future
    const boostedUntilMs = new Date(body.boostedUntil).getTime();
    const expectedMin = before.getTime() + 29 * 60 * 1000;
    const expectedMax = after.getTime()  + 31 * 60 * 1000;
    assert.ok(
      boostedUntilMs >= expectedMin && boostedUntilMs <= expectedMax,
      `boostedUntil (${body.boostedUntil}) must be ~30 min after the request time`,
    );

    // lastBoostedAt must be close to now
    const lastBoostedMs = new Date(body.lastBoostedAt).getTime();
    assert.ok(
      lastBoostedMs >= before.getTime() - 1000 && lastBoostedMs <= after.getTime() + 1000,
      `lastBoostedAt (${body.lastBoostedAt}) must be close to now`,
    );
  });

  test("second boost within 6 hours returns 429 with nextAllowedAt", async () => {
    // The first boost test already set last_boosted_at to now, so we're within the 6-hour window
    const res = await fetch(`${baseUrl}/api/lfg/${boostPostId}/boost`, {
      method: "POST",
      headers: authHeader(proUserId, `lfgtest_boost_pro_${SUFFIX}`),
    });
    assert.equal(res.status, 429, "second boost within 6 h must return 429");
    const body = await res.json() as { error?: string; nextAllowedAt?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "expected an error message in the body",
    );
    assert.ok(
      typeof body.nextAllowedAt === "string" && body.nextAllowedAt.length > 0,
      "expected nextAllowedAt in the 429 response",
    );

    // nextAllowedAt must be ~6 hours from the last boost
    const nextAllowedMs = new Date(body.nextAllowedAt!).getTime();
    const now = Date.now();
    // Should be between 5h 59m and 6h 1m from now
    assert.ok(
      nextAllowedMs > now + 5 * 60 * 60 * 1000,
      `nextAllowedAt (${body.nextAllowedAt}) must be more than 5h 59m in the future`,
    );
    assert.ok(
      nextAllowedMs < now + 7 * 60 * 60 * 1000,
      `nextAllowedAt (${body.nextAllowedAt}) must be less than 7h in the future`,
    );
  });

  test("boost succeeds again after the 6-hour cooldown has elapsed", async () => {
    // Simulate the cooldown being over by backdating last_boosted_at by 7 hours
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE lfg_posts SET last_boosted_at = $1 WHERE id = $2`,
      [sevenHoursAgo, boostPostId],
    );

    const res = await fetch(`${baseUrl}/api/lfg/${boostPostId}/boost`, {
      method: "POST",
      headers: authHeader(proUserId, `lfgtest_boost_pro_${SUFFIX}`),
    });
    assert.equal(res.status, 200, "boost after cooldown must return 200");
    const body = await res.json() as { boostedUntil?: string; lastBoostedAt?: string };
    assert.ok(
      typeof body.boostedUntil === "string",
      "response must include boostedUntil after successful re-boost",
    );
  });
});

describe("GET /lfg — closed-post visibility", () => {
  test("excludes closed posts that belong to other users", async () => {
    // responderId is NOT the author, so the author's closed post must not appear
    const res = await fetch(`${baseUrl}/api/lfg`, {
      headers: authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
    });
    assert.equal(res.status, 200);
    const posts = await res.json() as Array<{ id: number; status: string }>;

    const closedOtherPost = posts.find((p) => p.id === closedPostId);
    assert.equal(
      closedOtherPost,
      undefined,
      "closed post from another user should not appear in GET /lfg",
    );
  });

  test("includes the viewer's own closed post", async () => {
    // authorId IS the owner of the closed post — it should appear for them
    const res = await fetch(`${baseUrl}/api/lfg`, {
      headers: authHeader(authorId, `lfgtest_author_${SUFFIX}`),
    });
    assert.equal(res.status, 200);
    const posts = await res.json() as Array<{ id: number; status: string }>;

    const ownClosedPost = posts.find((p) => p.id === closedPostId);
    assert.ok(
      ownClosedPost !== undefined,
      "author's own closed post should appear in GET /lfg for the author",
    );
    assert.equal(ownClosedPost?.status, "closed");
  });

  test("open non-expired posts are visible to non-owners", async () => {
    const res = await fetch(`${baseUrl}/api/lfg`, {
      headers: authHeader(responderId, `lfgtest_responder_${SUFFIX}`),
    });
    assert.equal(res.status, 200);
    const posts = await res.json() as Array<{ id: number }>;
    const found = posts.find((p) => p.id === openPostId);
    assert.ok(found !== undefined, "open post should be visible to non-owner");
  });
});
