/**
 * Integration tests confirming that the three public landing-page endpoints
 * never leak private user data (email, password hash, session tokens, etc.).
 *
 * Endpoints covered:
 *   GET /api/stats/live
 *   GET /api/users/spotlight
 *   GET /api/users/match
 *
 * Each test asserts:
 *   1. The endpoint is reachable without any Authorization header (status 200).
 *   2. The response contains only the documented display fields.
 *   3. Sensitive fields (email, passwordHash, proExpiresAt, lastActiveAt,
 *      usernameChangedAt, profileBgUrl, profileFrameColor, totalXp, xpIntoLevel,
 *      xpForNext, bannerUrl, rank, bio, allowProfileComments, statusText,
 *      createdAt, prestigeLevel) are absent from every item in the payload.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable, gamesTable, userGamesTable } from "@workspace/db";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

const createdUserIds: number[] = [];
const createdGameIds: number[] = [];
const createdUserGameIds: number[] = [];

// We need at least one online Pro user for spotlight, and one online user with
// a known game for match.
let proUserId = 0;
let matchUserId = 0;
const MATCH_GAME_NAME = `TestGame_${SUFFIX}`;

before(async () => {
  // Insert a Pro user who is online
  const [proUser] = await db
    .insert(usersTable)
    .values({
      username: `pub_pro_${SUFFIX}`,
      passwordHash: "secret_hash_not_for_eyes",
      displayName: "Pub Pro",
      status: "online",
      isPro: true,
      email: `pub_pro_${SUFFIX}@secret.example`,
    })
    .returning({ id: usersTable.id });
  proUserId = proUser.id;
  createdUserIds.push(proUserId);

  // Insert a regular online user with a known game
  const [matchUser] = await db
    .insert(usersTable)
    .values({
      username: `pub_match_${SUFFIX}`,
      passwordHash: "another_secret_hash",
      displayName: "Pub Match",
      status: "online",
      email: `pub_match_${SUFFIX}@secret.example`,
    })
    .returning({ id: usersTable.id });
  matchUserId = matchUser.id;
  createdUserIds.push(matchUserId);

  // Create a game and link it to the match user
  const [game] = await db
    .insert(gamesTable)
    .values({ name: MATCH_GAME_NAME })
    .returning({ id: gamesTable.id });
  createdGameIds.push(game.id);

  const [ug] = await db
    .insert(userGamesTable)
    .values({ userId: matchUserId, gameId: game.id })
    .returning({ id: userGamesTable.id });
  createdUserGameIds.push(ug.id);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdUserGameIds.length) {
    await db
      .delete(userGamesTable)
      .where(inArray(userGamesTable.id, createdUserGameIds));
  }
  if (createdGameIds.length) {
    await db.delete(gamesTable).where(inArray(gamesTable.id, createdGameIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helper (no auth header) ─────────────────────────────────────────────

async function get(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
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
 * The set of field names that must NEVER appear on any user-bearing object
 * returned by a public endpoint.
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
]);

function assertNoForbiddenFields(obj: Record<string, unknown>, label: string) {
  for (const key of FORBIDDEN_FIELDS) {
    assert.ok(
      !(key in obj),
      `${label}: forbidden field "${key}" must not be present in response`,
    );
  }
}

// ─── GET /stats/live ──────────────────────────────────────────────────────────

describe("GET /stats/live", () => {
  test("returns 200 without any Authorization header", async () => {
    const { status } = await get("/stats/live");
    assert.equal(status, 200, "should be accessible without auth");
  });

  test("response has exactly the documented top-level keys", async () => {
    const { body } = await get("/stats/live");
    const obj = body as Record<string, unknown>;

    assert.ok("onlineCount" in obj, "must have onlineCount");
    assert.ok("todayRegistrations" in obj, "must have todayRegistrations");
    assert.ok("factionScores" in obj, "must have factionScores");

    // No unexpected keys
    const allowed = new Set(["onlineCount", "todayRegistrations", "factionScores"]);
    for (const key of Object.keys(obj)) {
      assert.ok(allowed.has(key), `unexpected top-level key "${key}" must not appear`);
    }
  });

  test("onlineCount and todayRegistrations are non-negative integers", async () => {
    const { body } = await get("/stats/live");
    const obj = body as Record<string, unknown>;
    assert.ok(typeof obj.onlineCount === "number" && obj.onlineCount >= 0, "onlineCount must be a non-negative number");
    assert.ok(typeof obj.todayRegistrations === "number" && obj.todayRegistrations >= 0, "todayRegistrations must be a non-negative number");
  });

  test("factionScores is an array and each entry has only allowed fields", async () => {
    const { body } = await get("/stats/live");
    const obj = body as Record<string, unknown>;
    assert.ok(Array.isArray(obj.factionScores), "factionScores must be an array");

    const allowedFactionKeys = new Set(["id", "name", "slug", "color", "iconEmoji", "weeklyPoints", "memberCount"]);
    for (const faction of obj.factionScores as Record<string, unknown>[]) {
      for (const key of Object.keys(faction)) {
        assert.ok(allowedFactionKeys.has(key), `factionScores entry has unexpected key "${key}"`);
      }
    }
  });
});

// ─── GET /users/spotlight ─────────────────────────────────────────────────────

describe("GET /users/spotlight", () => {
  test("returns 200 without any Authorization header", async () => {
    const { status } = await get("/users/spotlight");
    assert.equal(status, 200, "should be accessible without auth");
  });

  test("response is an array", async () => {
    const { body } = await get("/users/spotlight");
    assert.ok(Array.isArray(body), "response must be an array");
  });

  test("each spotlight user has only the allowed display fields", async () => {
    const { body } = await get("/users/spotlight");
    const users = body as Record<string, unknown>[];
    if (users.length === 0) return; // nothing to check if empty

    // Spotlight returns only the documented display subset — NOT the full safeUser shape.
    const allowedKeys = new Set([
      "id", "username", "displayName", "avatarUrl",
      "tier", "tierLevel", "currentGame", "isPro",
    ]);

    for (const user of users) {
      // Check no forbidden fields
      assertNoForbiddenFields(user, "spotlight user");

      // Check no unknown unexpected keys
      for (const key of Object.keys(user)) {
        assert.ok(allowedKeys.has(key), `spotlight user has unexpected key "${key}"`);
      }
    }
  });

  test("spotlight users do not contain email or passwordHash", async () => {
    const { body } = await get("/users/spotlight");
    const users = body as Record<string, unknown>[];
    for (const user of users) {
      assert.ok(!("email" in user), "email must not be present");
      assert.ok(!("passwordHash" in user), "passwordHash must not be present");
      assert.ok(!("password_hash" in user), "password_hash must not be present");
    }
  });
});

// ─── GET /users/match ─────────────────────────────────────────────────────────

describe("GET /users/match", () => {
  test("returns 200 without any Authorization header (no games param)", async () => {
    const { status } = await get("/users/match");
    assert.equal(status, 200, "should be accessible without auth");
  });

  test("returns null when no games param is provided", async () => {
    const { body } = await get("/users/match");
    assert.equal(body, null, "should return null with no games param");
  });

  test("returns 200 without any Authorization header (with games param)", async () => {
    const { status } = await get(`/users/match?games=${encodeURIComponent(MATCH_GAME_NAME)}`);
    assert.equal(status, 200, "should be accessible without auth");
  });

  test("matched user has only the allowed display fields", async () => {
    const { body } = await get(`/users/match?games=${encodeURIComponent(MATCH_GAME_NAME)}`);
    if (body === null) return; // no online user found; shape cannot be checked

    const user = body as Record<string, unknown>;
    const allowedKeys = new Set(["id", "username", "displayName", "avatarUrl", "status", "matchedGame"]);

    // No forbidden PII
    assertNoForbiddenFields(user, "match user");
    assert.ok(!("email" in user), "email must not be present");
    assert.ok(!("passwordHash" in user), "passwordHash must not be present");

    // Only documented keys
    for (const key of Object.keys(user)) {
      assert.ok(allowedKeys.has(key), `match user has unexpected key "${key}"`);
    }
  });

  test("matched user response contains required fields with correct types", async () => {
    const { body } = await get(`/users/match?games=${encodeURIComponent(MATCH_GAME_NAME)}`);
    if (body === null) return;

    const user = body as Record<string, unknown>;
    assert.ok(typeof user.id === "number", "id must be a number");
    assert.ok(typeof user.username === "string", "username must be a string");
    assert.ok(typeof user.displayName === "string", "displayName must be a string");
    assert.ok(typeof user.status === "string", "status must be a string");
    assert.ok("matchedGame" in user, "matchedGame must be present");
  });

  test("response with unknown game still returns valid shape or null", async () => {
    // All online users are possible fallbacks; just verify the shape if non-null
    const { status, body } = await get("/users/match?games=__NonExistentGame__xyz__");
    assert.equal(status, 200, "must always return 200");
    if (body === null) return;

    const user = body as Record<string, unknown>;
    assert.ok(!("email" in user), "email must not be present in fallback");
    assert.ok(!("passwordHash" in user), "passwordHash must not be present in fallback");
    const allowedKeys = new Set(["id", "username", "displayName", "avatarUrl", "status", "matchedGame"]);
    for (const key of Object.keys(user)) {
      assert.ok(allowedKeys.has(key), `fallback match user has unexpected key "${key}"`);
    }
  });
});
