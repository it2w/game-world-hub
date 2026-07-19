/**
 * Integration tests confirming that GET /api/users/search never leaks
 * internal or sensitive fields to authenticated callers.
 *
 * Assertions:
 *  1. Requires authentication (401 without a token).
 *  2. Returns 400 when the query param is missing or blank.
 *  3. Returns an array of results for a valid query.
 *  4. Each result contains exactly the allowed typeahead display fields.
 *  5. Sensitive / internal fields are absent from every result.
 *  6. The caller's own user is excluded from results.
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
import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let searcherId = 0;
let searcherUsername = "";
let targetId = 0;
let targetUsername = "";

const createdUserIds: number[] = [];

before(async () => {
  // Insert two users whose usernames share a unique prefix so the search query
  // reliably matches the target but not random other DB rows.
  const prefix = `srch_${SUFFIX}`;

  const [searcher, target] = await db
    .insert(usersTable)
    .values([
      {
        username: `${prefix}_caller`,
        passwordHash: "hashed_secret",
        email: `${prefix}_caller@private.example`,
        displayName: "Search Caller",
        status: "online" as const,
      },
      {
        username: `${prefix}_target`,
        passwordHash: "hashed_secret_2",
        email: `${prefix}_target@private.example`,
        displayName: "Search Target",
        status: "away" as const,
        isPro: true,
        prestigeLevel: 2,
      },
    ])
    .returning({ id: usersTable.id, username: usersTable.username });

  searcherId = searcher.id;
  searcherUsername = searcher.username;
  targetId = target.id;
  targetUsername = target.username;
  createdUserIds.push(searcherId, targetId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function get(
  path: string,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers,
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
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

/**
 * Fields that must NEVER appear in search results regardless of auth level.
 */
const FORBIDDEN_FIELDS = new Set([
  "email",
  "passwordHash",
  "password_hash",
  "proExpiresAt",
  "pro_expires_at",
  "lastActiveAt",
  "last_active_at",
  "usernameChangedAt",
  "username_changed_at",
  // broader internal fields not needed for a typeahead
  "bannerUrl",
  "profileBgUrl",
  "profileFrameColor",
  "totalXp",
  "xpIntoLevel",
  "xpForNext",
  "tier",
  "tierLevel",
  "bio",
  "rank",
  "allowProfileComments",
  "statusText",
  "createdAt",
  "spotlightOptOut",
]);

function assertNoForbiddenFields(obj: Record<string, unknown>, label: string) {
  for (const key of FORBIDDEN_FIELDS) {
    assert.ok(
      !(key in obj),
      `${label}: forbidden field "${key}" must not be present in search results`,
    );
  }
}

/** Fields the typeahead UI is allowed to receive. */
const ALLOWED_KEYS = new Set([
  "id",
  "username",
  "displayName",
  "avatarUrl",
  "status",
  "isPro",
  "prestigeLevel",
]);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /users/search — authentication", () => {
  test("returns 401 without an Authorization header", async () => {
    const { status } = await get(`/users/search?q=${encodeURIComponent(targetUsername)}`);
    assert.equal(status, 401, "unauthenticated request must be rejected");
  });
});

describe("GET /users/search — input validation", () => {
  test("returns 400 when q param is missing", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    const { status } = await get("/users/search", token);
    assert.equal(status, 400);
  });

  test("returns 400 when q param is blank", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    const { status } = await get("/users/search?q=   ", token);
    assert.equal(status, 400);
  });
});

describe("GET /users/search — response shape", () => {
  test("returns an array for a valid query", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    const { status, body } = await get(
      `/users/search?q=${encodeURIComponent(targetUsername)}`,
      token,
    );
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), "response must be an array");
  });

  test("each result has exactly the allowed typeahead fields", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    const { body } = await get(
      `/users/search?q=${encodeURIComponent(targetUsername)}`,
      token,
    );
    const results = body as Record<string, unknown>[];
    assert.ok(results.length >= 1, "must return at least the target user");

    for (const user of results) {
      // No forbidden / sensitive fields
      assertNoForbiddenFields(user, "search result");

      // No unexpected keys beyond the typeahead set
      for (const key of Object.keys(user)) {
        assert.ok(
          ALLOWED_KEYS.has(key),
          `search result has unexpected key "${key}"`,
        );
      }
    }
  });

  test("results include required display fields with correct types", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    const { body } = await get(
      `/users/search?q=${encodeURIComponent(targetUsername)}`,
      token,
    );
    const results = body as Record<string, unknown>[];
    const hit = results.find((u) => u.id === targetId);
    assert.ok(hit, "target user must appear in results");

    assert.equal(typeof hit.id, "number", "id must be a number");
    assert.equal(typeof hit.username, "string", "username must be a string");
    assert.equal(typeof hit.displayName, "string", "displayName must be a string");
    assert.equal(typeof hit.status, "string", "status must be a string");
    assert.equal(typeof hit.isPro, "boolean", "isPro must be a boolean");
    assert.equal(typeof hit.prestigeLevel, "number", "prestigeLevel must be a number");
    // avatarUrl may be null or string
    assert.ok(
      hit.avatarUrl === null || typeof hit.avatarUrl === "string",
      "avatarUrl must be null or string",
    );
  });

  test("caller's own user is excluded from results", async () => {
    const token = signToken({ userId: searcherId, username: searcherUsername });
    // Use a prefix that matches BOTH the caller and the target
    const sharedPrefix = `srch_${SUFFIX}`;
    const { body } = await get(
      `/users/search?q=${encodeURIComponent(sharedPrefix)}`,
      token,
    );
    const results = body as Record<string, unknown>[];
    const selfInResults = results.some((u) => u.id === searcherId);
    assert.ok(!selfInResults, "caller must not appear in their own search results");
  });
});
