/**
 * Integration tests confirming that owner-only community endpoints
 * correctly reject mod users with 403.
 *
 * Covered scenarios:
 *  1. DELETE /communities/:id — owner receives 204
 *  2. DELETE /communities/:id — mod receives 403
 *  3. DELETE /communities/:id — regular member receives 403
 *  4. DELETE /communities/:id — unauthenticated request receives 401
 *  5. PATCH  /communities/:id — owner receives 200
 *  6. PATCH  /communities/:id — mod receives 403
 *  7. PATCH  /communities/:id — regular member receives 403
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { db, pool, usersTable, communitiesTable, communityMembersTable, communityRolesTable, communityMemberRolesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { signToken } from "../middlewares/auth";
import { ensureCommunityPremiumTables } from "./communities";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let ownerId = 0;
let ownerUsername = "";
let modId = 0;
let modUsername = "";
let memberId = 0;
let memberUsername = "";

let communityId = 0;

const createdUserIds: number[] = [];
const createdCommunityIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `ownerguard_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `OwnerGuard ${label}`,
    status: "online" as const,
  };
}

function auth(id: number, username: string): Record<string, string> {
  return { Authorization: `Bearer ${signToken({ userId: id, username })}` };
}

async function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: object,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

before(async () => {
  await ensureCommunityPremiumTables();

  // Create test users
  const inserted = await db
    .insert(usersTable)
    .values([mkUser("owner"), mkUser("mod"), mkUser("member")])
    .returning({ id: usersTable.id, username: usersTable.username });

  [ownerId, modId, memberId] = inserted.map(u => u.id);
  [ownerUsername, modUsername, memberUsername] = inserted.map(u => u.username);
  createdUserIds.push(...inserted.map(u => u.id));

  // Create a community owned by ownerId
  const [community] = await db
    .insert(communitiesTable)
    .values({
      ownerId,
      name: `OGTest_${SUFFIX}`,
      slug: `ogtest-${SUFFIX}`,
      privacy: "public",
      memberCount: 1,
    })
    .returning();
  communityId = community.id;
  createdCommunityIds.push(communityId);

  // Add owner, mod, and regular member to community_members
  await db.insert(communityMembersTable).values([
    { communityId, userId: ownerId },
    { communityId, userId: modId },
    { communityId, userId: memberId },
  ]);

  // Create a "Mod" role with can_ban permission, then assign it to modId
  const [modRole] = await db
    .insert(communityRolesTable)
    .values({
      communityId,
      name: "Mod",
      color: "#ff0000",
      position: 1,
      permissions: { can_ban: true, can_kick: true } as any,
    })
    .returning();

  // Get mod's membership record
  const [modMembership] = await db
    .select({ id: communityMembersTable.id })
    .from(communityMembersTable)
    .where(and(
      eq(communityMembersTable.communityId, communityId),
      eq(communityMembersTable.userId, modId),
    ));

  await db.insert(communityMemberRolesTable).values({
    memberId: modMembership.id,
    roleId: modRole.id,
  });

  // Start the HTTP server on an ephemeral port
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );

  // Clean up in FK order: communities cascade-delete members/roles/channels
  if (createdCommunityIds.length) {
    await db.delete(communitiesTable).where(inArray(communitiesTable.id, createdCommunityIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

// ─── DELETE /communities/:id ──────────────────────────────────────────────────

describe("DELETE /communities/:id — owner-only guard", () => {
  test("unauthenticated request returns 401", async () => {
    const { status } = await request("DELETE", `/communities/${communityId}`);
    assert.equal(status, 401);
  });

  test("regular member receives 403", async () => {
    const { status, body } = await request(
      "DELETE",
      `/communities/${communityId}`,
      auth(memberId, memberUsername),
    );
    assert.equal(status, 403, `expected 403, got ${status}: ${JSON.stringify(body)}`);
  });

  test("mod receives 403 (not owner)", async () => {
    const { status, body } = await request(
      "DELETE",
      `/communities/${communityId}`,
      auth(modId, modUsername),
    );
    assert.equal(status, 403, `expected 403 for mod, got ${status}: ${JSON.stringify(body)}`);
  });

  // Owner test runs last so the community still exists for PATCH tests
  test("owner receives 204", async () => {
    // Create a separate throwaway community for the owner-delete test
    const [throwaway] = await db
      .insert(communitiesTable)
      .values({
        ownerId,
        name: `OGThrowaway_${SUFFIX}`,
        slug: `ogthrowaway-${SUFFIX}`,
        privacy: "public",
        memberCount: 1,
      })
      .returning();

    const { status } = await request(
      "DELETE",
      `/communities/${throwaway.id}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 204, `expected 204 for owner, got ${status}`);
    // No cleanup needed — DELETE succeeded
  });
});

// ─── PATCH /communities/:id ───────────────────────────────────────────────────

describe("PATCH /communities/:id — owner-only guard", () => {
  test("unauthenticated request returns 401", async () => {
    const { status } = await request("PATCH", `/communities/${communityId}`, {}, { description: "hack" });
    assert.equal(status, 401);
  });

  test("regular member receives 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}`,
      auth(memberId, memberUsername),
      { description: "member-attempt" },
    );
    assert.equal(status, 403, `expected 403 for member, got ${status}: ${JSON.stringify(body)}`);
  });

  test("mod receives 403 (not owner)", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}`,
      auth(modId, modUsername),
      { description: "mod-attempt" },
    );
    assert.equal(status, 403, `expected 403 for mod, got ${status}: ${JSON.stringify(body)}`);
  });

  test("owner receives 200", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
      { description: "owner-update" },
    );
    assert.equal(status, 200, `expected 200 for owner, got ${status}: ${JSON.stringify(body)}`);
    assert.equal((body as any).description, "owner-update");
  });
});
