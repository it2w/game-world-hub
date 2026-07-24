/**
 * Integration tests confirming that DELETE /communities/:id/invites/:code
 * is blocked at the API level for plain members.
 *
 * Covered scenarios:
 *  1. Unauthenticated request receives 401
 *  2. Plain member receives 403
 *  3. Mod with can_invite permission receives 204
 *  4. Owner receives 204
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  db,
  pool,
  usersTable,
  communitiesTable,
  communityMembersTable,
  communityRolesTable,
  communityMemberRolesTable,
} from "@workspace/db";
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
    username: `invokeguard_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `InvokeGuard ${label}`,
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

/** Insert a fresh invite row directly and return its code. */
async function createInvite(forCommunityId: number, createdBy: number): Promise<string> {
  const code = `test${Date.now()}`.slice(0, 8);
  await pool.query(
    `INSERT INTO community_invites (community_id, code, created_by, max_uses, expires_at)
     VALUES ($1, $2, $3, NULL, NULL)`,
    [forCommunityId, code, createdBy],
  );
  return code;
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
      name: `InvRevokeGuard_${SUFFIX}`,
      slug: `invrevokeguard-${SUFFIX}`,
      privacy: "public",
      memberCount: 1,
    })
    .returning();
  communityId = community.id;
  createdCommunityIds.push(communityId);

  // Add owner, mod, and plain member to community_members
  await db.insert(communityMembersTable).values([
    { communityId, userId: ownerId },
    { communityId, userId: modId },
    { communityId, userId: memberId },
  ]);

  // Create a "Mod" role with can_invite permission and assign it to modId
  const [modRole] = await db
    .insert(communityRolesTable)
    .values({
      communityId,
      name: "Inviter",
      color: "#00ff00",
      position: 1,
      permissions: { can_invite: true } as any,
    })
    .returning();

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

  if (createdCommunityIds.length) {
    await db.delete(communitiesTable).where(inArray(communitiesTable.id, createdCommunityIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

// ─── DELETE /communities/:id/invites/:code ────────────────────────────────────

describe("DELETE /communities/:id/invites/:code — invite revoke guard", () => {
  test("unauthenticated request returns 401", async () => {
    const code = await createInvite(communityId, ownerId);
    const { status } = await request(
      "DELETE",
      `/communities/${communityId}/invites/${code}`,
    );
    assert.equal(status, 401);
    // clean up since the DELETE didn't happen
    await pool.query(`DELETE FROM community_invites WHERE code = $1`, [code]);
  });

  test("plain member receives 403", async () => {
    const code = await createInvite(communityId, ownerId);
    const { status, body } = await request(
      "DELETE",
      `/communities/${communityId}/invites/${code}`,
      auth(memberId, memberUsername),
    );
    assert.equal(status, 403, `expected 403 for plain member, got ${status}: ${JSON.stringify(body)}`);
    // clean up since the DELETE was rejected
    await pool.query(`DELETE FROM community_invites WHERE code = $1`, [code]);
  });

  test("mod with can_invite permission receives 204", async () => {
    const code = await createInvite(communityId, ownerId);
    const { status, body } = await request(
      "DELETE",
      `/communities/${communityId}/invites/${code}`,
      auth(modId, modUsername),
    );
    assert.equal(status, 204, `expected 204 for mod, got ${status}: ${JSON.stringify(body)}`);
    // Invite is deleted by the endpoint — no manual cleanup needed
  });

  test("owner receives 204", async () => {
    const code = await createInvite(communityId, ownerId);
    const { status, body } = await request(
      "DELETE",
      `/communities/${communityId}/invites/${code}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 204, `expected 204 for owner, got ${status}: ${JSON.stringify(body)}`);
    // Invite is deleted by the endpoint — no manual cleanup needed
  });
});
