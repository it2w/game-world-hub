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
