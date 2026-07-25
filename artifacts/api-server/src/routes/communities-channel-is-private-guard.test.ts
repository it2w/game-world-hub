/**
 * Integration tests confirming that a non-owner with can_manage_channels
 * cannot toggle isPrivate on a channel via PATCH.
 *
 * Covered scenarios:
 *  1. Mod with can_manage_channels sends PATCH { isPrivate: true } → 403
 *  2. A subsequent GET confirms isPrivate was NOT changed
 *  3. Owner can still toggle isPrivate → 200
 *  4. Mod with can_manage_channels sends PATCH { isPrivate: false } → 403 (no change)
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
  communityChannelsTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
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

let communityId = 0;
let channelId = 0;

const createdUserIds: number[] = [];
const createdCommunityIds: number[] = [];

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
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

before(async () => {
  await ensureCommunityPremiumTables();

  // Create owner
  const [owner] = await db
    .insert(usersTable)
    .values({
      username: `isprivate_owner_${SUFFIX}`,
      passwordHash: "x",
      displayName: "IsPrivate Owner",
      status: "online" as const,
    })
    .returning({ id: usersTable.id, username: usersTable.username });
  ownerId = owner.id;
  ownerUsername = owner.username;
  createdUserIds.push(ownerId);

  // Create mod
  const [mod] = await db
    .insert(usersTable)
    .values({
      username: `isprivate_mod_${SUFFIX}`,
      passwordHash: "x",
      displayName: "IsPrivate Mod",
      status: "online" as const,
    })
    .returning({ id: usersTable.id, username: usersTable.username });
  modId = mod.id;
  modUsername = mod.username;
  createdUserIds.push(modId);

  // Create community
  const [community] = await db
    .insert(communitiesTable)
    .values({
      ownerId,
      name: `IsPrivateTest_${SUFFIX}`,
      slug: `isprivate-test-${SUFFIX}`,
      privacy: "public",
      memberCount: 1,
    })
    .returning();
  communityId = community.id;
  createdCommunityIds.push(communityId);

  // Join owner
  await db.insert(communityMembersTable).values({ communityId, userId: ownerId });

  // Join mod and give them can_manage_channels role
  const [modMembership] = await db
    .insert(communityMembersTable)
    .values({ communityId, userId: modId })
    .returning({ id: communityMembersTable.id });

  const roleResult = await pool.query<{ id: number }>(
    `INSERT INTO community_roles (community_id, name, color, position, permissions)
     VALUES ($1, $2, '#ffffff', 0, '{"can_manage_channels":true}'::jsonb)
     RETURNING id`,
    [communityId, `mod-role-${SUFFIX}`],
  );
  const roleId = roleResult.rows[0].id;
  await pool.query(
    `INSERT INTO community_member_roles (member_id, role_id) VALUES ($1, $2)`,
    [modMembership.id, roleId],
  );

  // Create a public channel (isPrivate = false)
  const [ch] = await db
    .insert(communityChannelsTable)
    .values({ communityId, name: "general", type: "text", position: 0 })
    .returning();
  channelId = ch.id;

  // Start HTTP server
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

// ─── Mod cannot toggle isPrivate ──────────────────────────────────────────────

describe("PATCH isPrivate by a mod with can_manage_channels — must be rejected", () => {
  test("mod PATCH { isPrivate: true } returns 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${channelId}`,
      auth(modId, modUsername),
      { isPrivate: true },
    );
    assert.equal(
      status,
      403,
      `expected 403, got ${status}: ${JSON.stringify(body)}`,
    );
  });

  test("GET confirms isPrivate was not changed after rejected mod PATCH", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; isPrivate: boolean }> };
    assert.ok(Array.isArray(community.channels), "response must include a channels array");

    const ch = community.channels.find(c => c.id === channelId);
    assert.ok(ch, `channel ${channelId} must be present in response`);
    assert.equal(
      ch.isPrivate,
      false,
      `isPrivate must still be false after rejected mod PATCH, got ${JSON.stringify(ch.isPrivate)}`,
    );
  });

  test("mod PATCH { isPrivate: false } (no-op value) also returns 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${channelId}`,
      auth(modId, modUsername),
      { isPrivate: false },
    );
    assert.equal(
      status,
      403,
      `expected 403 for any isPrivate in mod PATCH, got ${status}: ${JSON.stringify(body)}`,
    );
  });
});

// ─── Owner can still toggle isPrivate ─────────────────────────────────────────

describe("PATCH isPrivate by the owner — must succeed", () => {
  test("owner PATCH { isPrivate: true } returns 200", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${channelId}`,
      auth(ownerId, ownerUsername),
      { isPrivate: true },
    );
    assert.equal(
      status,
      200,
      `expected 200 from owner PATCH, got ${status}: ${JSON.stringify(body)}`,
    );

    const channel = body as { id: number; isPrivate: boolean };
    assert.equal(channel.id, channelId, "response channel id must match");
    assert.equal(
      channel.isPrivate,
      true,
      `expected isPrivate to be true after owner toggle, got ${JSON.stringify(channel.isPrivate)}`,
    );
  });

  test("GET confirms isPrivate is now true after owner PATCH", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; isPrivate: boolean }> };
    assert.ok(Array.isArray(community.channels), "response must include a channels array");

    const ch = community.channels.find(c => c.id === channelId);
    assert.ok(ch, `channel ${channelId} must be present in response`);
    assert.equal(
      ch.isPrivate,
      true,
      `isPrivate must be true after owner toggle, got ${JSON.stringify(ch.isPrivate)}`,
    );
  });
});
