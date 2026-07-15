/**
 * Integration tests for profile image removal endpoints.
 *
 * Covered scenarios:
 *  - authenticated user can clear their own avatar (200, avatarUrl is null)
 *  - authenticated user can clear their own banner (200, bannerUrl is null)
 *  - authenticated user can delete their own photo (204, row gone from DB)
 *  - user cannot delete another user's photo (404 — ownership enforced by userId filter)
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  profilePhotosTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let userId = 0;
let otherUserId = 0;

const createdUserIds: number[] = [];
const createdPhotoIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `utest_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `UTest ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Seed two users, give the first an avatar and banner URL
  const [u, o] = await db
    .insert(usersTable)
    .values([
      { ...mkUser("owner"), avatarUrl: "/objects/avatar.jpg", bannerUrl: "/objects/banner.jpg" },
      mkUser("other"),
    ])
    .returning({ id: usersTable.id });
  userId = u.id;
  otherUserId = o.id;
  createdUserIds.push(userId, otherUserId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdPhotoIds.length) {
    await db
      .delete(profilePhotosTable)
      .where(inArray(profilePhotosTable.id, createdPhotoIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function request(
  method: string,
  path: string,
  actorId: number,
  actorUsername: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: actorId, username: actorUsername });

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) {
            resolve({ status: res.statusCode ?? 0, body: null });
            return;
          }
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

/** Send a request with no Authorization header at all. */
async function requestUnauthenticated(
  method: string,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) {
            resolve({ status: res.statusCode ?? 0, body: null });
            return;
          }
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

// ─── DELETE /users/me/avatar ──────────────────────────────────────────────────

describe("DELETE /users/me/avatar", () => {
  test("unauthenticated request returns 401", async () => {
    const res = await requestUnauthenticated("DELETE", "/users/me/avatar");
    assert.equal(res.status, 401, "should return 401 when no Authorization header is sent");
  });

  test("authenticated user can clear their own avatar", async () => {
    const res = await request(
      "DELETE",
      "/users/me/avatar",
      userId,
      `utest_owner_${SUFFIX}`,
    );
    assert.equal(res.status, 200, "should return 200");
    const body = res.body as Record<string, unknown>;
    assert.equal(body.avatarUrl, null, "avatarUrl should be null after deletion");

    // Verify persisted in DB
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    assert.equal(row.avatarUrl, null, "avatarUrl should be null in DB");
  });
});

// ─── DELETE /users/me/banner ──────────────────────────────────────────────────

describe("DELETE /users/me/banner", () => {
  test("unauthenticated request returns 401", async () => {
    const res = await requestUnauthenticated("DELETE", "/users/me/banner");
    assert.equal(res.status, 401, "should return 401 when no Authorization header is sent");
  });

  test("authenticated user can clear their own banner", async () => {
    const res = await request(
      "DELETE",
      "/users/me/banner",
      userId,
      `utest_owner_${SUFFIX}`,
    );
    assert.equal(res.status, 200, "should return 200");
    const body = res.body as Record<string, unknown>;
    assert.equal(body.bannerUrl, null, "bannerUrl should be null after deletion");

    // Verify persisted in DB
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    assert.equal(row.bannerUrl, null, "bannerUrl should be null in DB");
  });
});

// ─── DELETE /users/me/photos/:photoId ────────────────────────────────────────

describe("DELETE /users/me/photos/:photoId", () => {
  test("unauthenticated request returns 401", async () => {
    const res = await requestUnauthenticated("DELETE", "/users/me/photos/999999");
    assert.equal(res.status, 401, "should return 401 when no Authorization header is sent");
  });

  test("authenticated user can delete their own photo", async () => {
    // Insert a photo for the owner
    const [photo] = await db
      .insert(profilePhotosTable)
      .values({ userId, objectPath: "/objects/photo.jpg", caption: null })
      .returning({ id: profilePhotosTable.id });
    createdPhotoIds.push(photo.id);

    const res = await request(
      "DELETE",
      `/users/me/photos/${photo.id}`,
      userId,
      `utest_owner_${SUFFIX}`,
    );
    assert.equal(res.status, 204, "should return 204 No Content");

    // Row must be gone from DB
    const rows = await db
      .select()
      .from(profilePhotosTable)
      .where(eq(profilePhotosTable.id, photo.id));
    assert.equal(rows.length, 0, "photo row should be deleted from DB");
  });

  test("user cannot delete another user's photo", async () => {
    // Insert a photo owned by otherUser
    const [photo] = await db
      .insert(profilePhotosTable)
      .values({ userId: otherUserId, objectPath: "/objects/other-photo.jpg", caption: null })
      .returning({ id: profilePhotosTable.id });
    createdPhotoIds.push(photo.id);

    const res = await request(
      "DELETE",
      `/users/me/photos/${photo.id}`,
      userId,                       // acting as owner, not otherUserId
      `utest_owner_${SUFFIX}`,
    );
    assert.equal(res.status, 404, "should return 404 when photo belongs to another user");

    // Row must still be in DB
    const rows = await db
      .select()
      .from(profilePhotosTable)
      .where(eq(profilePhotosTable.id, photo.id));
    assert.equal(rows.length, 1, "other user's photo should remain in DB");
  });
});
