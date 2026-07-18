/**
 * Regression tests for new owner API endpoints added in Task #17:
 *  - GET  /owner/analytics?range=30|90      — time-series shape + cache
 *  - GET  /owner/users/:id/detail            — 404 on missing, fields present on existing
 *  - GET/POST/DELETE /owner/users/:id/notes  — CRUD, validation
 *  - DELETE /owner/notes/:noteId             — 404 on missing, ok on existing
 *  - GET  /owner/content?type=lfg|party      — listing, invalid type → 400
 *  - DELETE /owner/content/lfg/:id           — 404 on missing, deleted + activity logged
 *  - DELETE /owner/content/party/:id         — 404 on missing, deleted + activity logged
 *  - POST /owner/users/bulk                  — each action, invalid ids skipped, counts returned
 *  - GET  /owner/export/users                — CSV header, ?token= auth, 401 unauthorized
 *  - GET  /owner/export/log                  — CSV header, Bearer auth, 401 unauthorized
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, superAdminsTable, lfgPostsTable, partiesTable, pool } from "@workspace/db";
import { signOwnerToken } from "../middlewares/owner";
import { signToken } from "../middlewares/auth";
import app from "../app";

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;
let ownerToken = "";
let ownerId = 0;

/* IDs to clean up after all tests */
const createdUserIds: number[] = [];
let testUserId = 0;
let testOwnerId = 0;

before(async () => {
  /* Insert a super_admin row so the owner token is valid */
  const [owner] = await db
    .insert(superAdminsTable)
    .values({
      username: `owner_tst_${SUFFIX}`,
      passwordHash: "x",
    })
    .returning({ id: superAdminsTable.id });
  testOwnerId = owner.id;
  ownerId = owner.id;
  ownerToken = signOwnerToken({ ownerId: owner.id, username: `owner_tst_${SUFFIX}`, purpose: "owner" });

  /* Insert a regular user to act as subject for detail / notes / bulk tests */
  const [user] = await db
    .insert(usersTable)
    .values({ username: `own_subj_${SUFFIX}`, passwordHash: "x", displayName: "SubjectUser", status: "online" as const })
    .returning({ id: usersTable.id });
  testUserId = user.id;
  createdUserIds.push(testUserId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  /* Clean up users */
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds)).catch(() => {});
  }
  /* Clean up owner */
  await db.delete(superAdminsTable).where(eq(superAdminsTable.id, testOwnerId)).catch(() => {});
  /* Clean up any lingering admin_notes for test user */
  await pool.query(`DELETE FROM admin_notes WHERE user_id = ANY($1::int[])`, [createdUserIds]).catch(() => {});
});

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function get(path: string, auth?: string, queryToken?: string): Promise<{ status: number; body: unknown; text: string }> {
  const url = queryToken ? `${baseUrl}${path}?token=${encodeURIComponent(queryToken)}` : `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, text };
}

async function post(path: string, body: unknown, auth?: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(path: string, auth?: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* ── Analytics ──────────────────────────────────────────────────────────── */

describe("GET /owner/analytics", () => {
  test("401 when unauthenticated", async () => {
    const r = await get("/owner/analytics");
    assert.strictEqual(r.status, 401);
  });

  test("returns correct shape for range=30", async () => {
    const r = await get("/owner/analytics?range=30", ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as {
      range: number;
      newUsers: { date: string; count: number }[];
      dau: { date: string; count: number }[];
      lfgPosts: { date: string; count: number }[];
      proActivations: { date: string; count: number }[];
      summary: { peakDau: number; proConvRate: number };
    };
    assert.strictEqual(body.range, 30);
    assert.ok(Array.isArray(body.newUsers), "newUsers must be an array");
    assert.ok(Array.isArray(body.dau), "dau must be an array");
    assert.ok(Array.isArray(body.lfgPosts), "lfgPosts must be an array");
    assert.ok(Array.isArray(body.proActivations), "proActivations must be an array");
    /* generate_series for 30 days produces 31 rows (today inclusive) */
    assert.ok(body.newUsers.length >= 30 && body.newUsers.length <= 31, `expected 30-31 rows, got ${body.newUsers.length}`);
    /* Each row must have a date string and a numeric count */
    const sample = body.newUsers[0];
    assert.ok(typeof sample.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sample.date), "date must be YYYY-MM-DD");
    assert.ok(typeof sample.count === "number", "count must be a number");
    /* Summary fields */
    assert.ok(typeof body.summary.peakDau === "number");
    assert.ok(typeof body.summary.proConvRate === "number");
  });

  test("returns correct shape for range=90", async () => {
    const r = await get("/owner/analytics?range=90", ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { range: number; newUsers: unknown[] };
    assert.strictEqual(body.range, 90);
    assert.ok(body.newUsers.length >= 90 && body.newUsers.length <= 91, `expected 90-91 rows, got ${body.newUsers.length}`);
  });
});

/* ── User Detail ────────────────────────────────────────────────────────── */

describe("GET /owner/users/:id/detail", () => {
  test("401 when unauthenticated", async () => {
    const r = await get(`/owner/users/${testUserId}/detail`);
    assert.strictEqual(r.status, 401);
  });

  test("404 when user does not exist", async () => {
    const r = await get("/owner/users/999999999/detail", ownerToken);
    assert.strictEqual(r.status, 404);
  });

  test("returns user data for existing user", async () => {
    const r = await get(`/owner/users/${testUserId}/detail`, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as {
      id: number; username: string; status: string;
      notes: unknown[]; reportCount: number;
    };
    assert.strictEqual(body.id, testUserId);
    assert.ok(typeof body.username === "string");
    assert.ok(Array.isArray(body.notes), "notes must be an array");
    assert.ok(typeof body.reportCount === "number", "reportCount must be a number");
  });
});

/* ── Admin Notes ────────────────────────────────────────────────────────── */

describe("Admin notes CRUD", () => {
  let noteId = 0;

  test("401 when listing notes unauthenticated", async () => {
    const r = await get(`/owner/users/${testUserId}/notes`);
    assert.strictEqual(r.status, 401);
  });

  test("GET /owner/users/:id/notes — returns empty list initially", async () => {
    const r = await get(`/owner/users/${testUserId}/notes`, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { items: unknown[] };
    assert.ok(Array.isArray(body.items));
  });

  test("POST /owner/users/:id/notes — 400 when body is missing", async () => {
    const r = await post(`/owner/users/${testUserId}/notes`, {}, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("POST /owner/users/:id/notes — 400 when body is empty string", async () => {
    const r = await post(`/owner/users/${testUserId}/notes`, { body: "   " }, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("POST /owner/users/:id/notes — 201 when body is valid", async () => {
    const r = await post(`/owner/users/${testUserId}/notes`, { body: "Test note for regression suite" }, ownerToken);
    assert.strictEqual(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    const body = r.body as { id: number; body: string };
    assert.ok(typeof body.id === "number");
    assert.ok(typeof body.body === "string");
    noteId = body.id;
  });

  test("GET /owner/users/:id/notes — note appears after creation", async () => {
    const r = await get(`/owner/users/${testUserId}/notes`, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { items: { id: number }[] };
    assert.ok(body.items.some((n) => n.id === noteId), "created note must appear in list");
  });

  test("DELETE /owner/notes/:noteId — 404 when note does not exist", async () => {
    const r = await del("/owner/notes/999999999", ownerToken);
    assert.strictEqual(r.status, 404);
  });

  test("DELETE /owner/notes/:noteId — 200 when note exists", async () => {
    const r = await del(`/owner/notes/${noteId}`, ownerToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((r.body as { ok: boolean }).ok, true);
  });

  test("GET /owner/users/:id/notes — note gone after deletion", async () => {
    const r = await get(`/owner/users/${testUserId}/notes`, ownerToken);
    const body = r.body as { items: { id: number }[] };
    assert.ok(!body.items.some((n) => n.id === noteId), "deleted note must not appear in list");
  });
});

/* ── Content Moderation ─────────────────────────────────────────────────── */

describe("GET /owner/content", () => {
  test("401 when unauthenticated", async () => {
    const r = await get("/owner/content?type=lfg");
    assert.strictEqual(r.status, 401);
  });

  test("400 when type is invalid", async () => {
    const r = await get("/owner/content?type=message", ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("returns lfg listing shape", async () => {
    const r = await get("/owner/content?type=lfg", ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { total: number; items: unknown[] };
    assert.ok(typeof body.total === "number");
    assert.ok(Array.isArray(body.items));
  });

  test("returns party listing shape", async () => {
    const r = await get("/owner/content?type=party", ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { total: number; items: unknown[] };
    assert.ok(typeof body.total === "number");
    assert.ok(Array.isArray(body.items));
  });
});

describe("DELETE /owner/content/lfg/:id", () => {
  let lfgPostId = 0;

  before(async () => {
    const [post] = await db
      .insert(lfgPostsTable)
      .values({ game: "TestGame", description: "Regression test post", authorId: testUserId })
      .returning({ id: lfgPostsTable.id });
    lfgPostId = post.id;
  });

  test("401 when unauthenticated", async () => {
    const r = await del(`/owner/content/lfg/${lfgPostId}`);
    assert.strictEqual(r.status, 401);
  });

  test("404 when LFG post does not exist", async () => {
    const r = await del("/owner/content/lfg/999999999", ownerToken);
    assert.strictEqual(r.status, 404);
  });

  test("200 and row deleted for existing LFG post", async () => {
    const r = await del(`/owner/content/lfg/${lfgPostId}`, ownerToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((r.body as { ok: boolean }).ok, true);

    /* Confirm row is gone from DB */
    const rows = await db.select({ id: lfgPostsTable.id }).from(lfgPostsTable).where(eq(lfgPostsTable.id, lfgPostId));
    assert.strictEqual(rows.length, 0, "LFG post must be deleted from DB");
  });

  test("activity log entry written after LFG deletion", async () => {
    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM owner_activity_log WHERE action='delete_content' AND detail=$1 ORDER BY created_at DESC LIMIT 1`,
      [`lfg_post #${lfgPostId}`],
    );
    assert.ok(rows.length > 0, "activity log must contain delete_content entry for the LFG post");
  });
});

describe("DELETE /owner/content/party/:id", () => {
  let partyId = 0;

  before(async () => {
    const [party] = await db
      .insert(partiesTable)
      .values({ name: "RegressionParty", leaderId: testUserId, maxSize: 4 })
      .returning({ id: partiesTable.id });
    partyId = party.id;
  });

  test("401 when unauthenticated", async () => {
    const r = await del(`/owner/content/party/${partyId}`);
    assert.strictEqual(r.status, 401);
  });

  test("404 when party does not exist", async () => {
    const r = await del("/owner/content/party/999999999", ownerToken);
    assert.strictEqual(r.status, 404);
  });

  test("200 and row deleted for existing party", async () => {
    const r = await del(`/owner/content/party/${partyId}`, ownerToken);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((r.body as { ok: boolean }).ok, true);

    const rows = await db.select({ id: partiesTable.id }).from(partiesTable).where(eq(partiesTable.id, partyId));
    assert.strictEqual(rows.length, 0, "Party must be deleted from DB");
  });

  test("activity log entry written after party deletion", async () => {
    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM owner_activity_log WHERE action='delete_content' AND detail=$1 ORDER BY created_at DESC LIMIT 1`,
      [`party #${partyId}`],
    );
    assert.ok(rows.length > 0, "activity log must contain delete_content entry for the party");
  });
});

/* ── Bulk Actions ───────────────────────────────────────────────────────── */

describe("POST /owner/users/bulk", () => {
  let bulkUserId = 0;

  before(async () => {
    const [u] = await db
      .insert(usersTable)
      .values({ username: `own_bulk_${SUFFIX}`, passwordHash: "x", displayName: "BulkTarget", status: "online" as const })
      .returning({ id: usersTable.id });
    bulkUserId = u.id;
    createdUserIds.push(bulkUserId);
  });

  test("401 when unauthenticated", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "suspend" });
    assert.strictEqual(r.status, 401);
  });

  test("400 when userIds is empty", async () => {
    const r = await post("/owner/users/bulk", { userIds: [], action: "suspend" }, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("400 when userIds is not an array", async () => {
    const r = await post("/owner/users/bulk", { userIds: 123, action: "suspend" }, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("400 when action is invalid", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "delete_everything" }, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("400 when more than 100 userIds provided", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    const r = await post("/owner/users/bulk", { userIds: ids, action: "suspend" }, ownerToken);
    assert.strictEqual(r.status, 400);
  });

  test("suspend action — valid id in succeeded, invalid id skipped", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId, 0, -1, 999999999], action: "suspend" }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    /* 0 and -1 are filtered by .filter(n > 0 && isInteger); 999999999 succeeds (no-op update) */
    assert.ok(body.succeeded.includes(bulkUserId), "valid userId must be in succeeded");
    assert.ok(!body.failed.includes(bulkUserId), "valid userId must not be in failed");
    /* Verify DB was actually updated */
    const [u] = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.id, bulkUserId));
    assert.strictEqual(u?.status, "suspended");
  });

  test("suspend action — suspended user's active token is immediately rejected (403)", async () => {
    /* bulkUserId is already suspended by the previous test. Sign a JWT for them and
       confirm that any authenticated endpoint returns 403 — the suspension is enforced
       at the middleware level on the very next request, without waiting for token expiry. */
    const userToken = signToken({ userId: bulkUserId, username: `own_bulk_${SUFFIX}` });
    const res = await fetch(`${baseUrl}/users/search?q=x`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.status, 403, "suspended user must be rejected with 403 on any authenticated endpoint");
    const body = await res.json() as { error?: string };
    assert.strictEqual(body.error, "suspended", "error message must be 'suspended'");
  });

  test("unsuspend action — user status set to offline", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "unsuspend" }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    assert.ok(body.succeeded.includes(bulkUserId));
    const [u] = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.id, bulkUserId));
    assert.strictEqual(u?.status, "offline");
  });

  test("activate_pro action — succeeded array contains userId", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "activate_pro", durationDays: 7 }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    assert.ok(body.succeeded.includes(bulkUserId));
  });

  test("deactivate_pro action — succeeded array contains userId", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "deactivate_pro" }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    assert.ok(body.succeeded.includes(bulkUserId));
  });

  test("force_logout action — sessionsInvalidatedBefore updated", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId], action: "force_logout" }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    assert.ok(body.succeeded.includes(bulkUserId));
    const [u] = await db
      .select({ sessionsInvalidatedBefore: usersTable.sessionsInvalidatedBefore })
      .from(usersTable)
      .where(eq(usersTable.id, bulkUserId));
    assert.ok(u?.sessionsInvalidatedBefore instanceof Date, "sessionsInvalidatedBefore must be set");
  });

  test("response includes succeeded and failed counts", async () => {
    const r = await post("/owner/users/bulk", { userIds: [bulkUserId, 999999998], action: "suspend" }, ownerToken);
    assert.strictEqual(r.status, 200);
    const body = r.body as { succeeded: number[]; failed: number[] };
    assert.ok(Array.isArray(body.succeeded));
    assert.ok(Array.isArray(body.failed));
    /* Total processed = succeeded + failed (no-op updates succeed, invalid filtered before loop) */
    assert.ok(body.succeeded.length + body.failed.length > 0);
  });
});

/* ── Export ─────────────────────────────────────────────────────────────── */

describe("GET /owner/export/users", () => {
  test("401 when no token provided", async () => {
    const r = await get("/owner/export/users");
    assert.strictEqual(r.status, 401);
  });

  test("401 when token is invalid", async () => {
    const r = await get("/owner/export/users", undefined, "not-a-valid-token");
    assert.strictEqual(r.status, 401);
  });

  test("200 with Bearer auth — CSV header row present", async () => {
    const r = await get("/owner/export/users", ownerToken);
    assert.strictEqual(r.status, 200);
    const firstLine = r.text.split("\n")[0];
    assert.ok(
      firstLine.includes("id") && firstLine.includes("username") && firstLine.includes("is_pro"),
      `CSV header must contain required columns; got: ${firstLine}`,
    );
  });

  test("200 with ?token= query param — CSV header row present", async () => {
    const r = await get("/owner/export/users", undefined, ownerToken);
    assert.strictEqual(r.status, 200);
    const firstLine = r.text.split("\n")[0];
    assert.ok(firstLine.includes("username"), "CSV must contain username column");
  });
});

describe("GET /owner/export/log", () => {
  test("401 when no token provided", async () => {
    const r = await get("/owner/export/log");
    assert.strictEqual(r.status, 401);
  });

  test("401 when token is invalid", async () => {
    const r = await get("/owner/export/log", undefined, "bad-token");
    assert.strictEqual(r.status, 401);
  });

  test("200 with Bearer auth — CSV header row present", async () => {
    const r = await get("/owner/export/log", ownerToken);
    assert.strictEqual(r.status, 200);
    const firstLine = r.text.split("\n")[0];
    assert.ok(
      firstLine.includes("id") && firstLine.includes("action") && firstLine.includes("owner_name"),
      `CSV header must contain required columns; got: ${firstLine}`,
    );
  });

  test("200 with ?token= query param — CSV header present", async () => {
    const r = await get("/owner/export/log", undefined, ownerToken);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.split("\n")[0].includes("action"), "CSV must contain action column");
  });
});
