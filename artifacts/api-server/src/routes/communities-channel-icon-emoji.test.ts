/**
 * Integration tests confirming that GET /communities/:slug includes
 * `iconEmoji` for every channel, and that this remains true after the
 * community slug is renamed.
 *
 * Covered scenarios:
 *  1. GET /communities/:slug returns channels with iconEmoji populated
 *  2. GET /communities/:slug returns channels with iconEmoji null when unset
 *  3. After a slug rename, GET /communities/:newSlug still returns iconEmoji
 *  4. Old slug returns 404 after rename (so clients must use the new slug)
 *  5. GET /communities/:numericId also returns iconEmoji (numeric id fallback)
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
  communityRolesTable,
  communityMemberRolesTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { signToken } from "../middlewares/auth";
import { ensureCommunityPremiumTables } from "./communities";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let ownerId = 0;
let ownerUsername = "";

let communityId = 0;
let originalSlug = "";
let renamedSlug = "";

/** Channel with iconEmoji set */
let emojiChannelId = 0;
const TEST_EMOJI = "🎮";

/** Channel with iconEmoji intentionally null */
let plainChannelId = 0;

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
      username: `iconemoji_owner_${SUFFIX}`,
      passwordHash: "x",
      displayName: "IconEmoji Owner",
      status: "online" as const,
    })
    .returning({ id: usersTable.id, username: usersTable.username });
  ownerId = owner.id;
  ownerUsername = owner.username;
  createdUserIds.push(ownerId);

  // Create community
  originalSlug = `iconemoji-test-${SUFFIX}`;
  renamedSlug = `iconemoji-renamed-${SUFFIX}`;
  const [community] = await db
    .insert(communitiesTable)
    .values({
      ownerId,
      name: `IconEmojiTest_${SUFFIX}`,
      slug: originalSlug,
      privacy: "public",
      memberCount: 1,
    })
    .returning();
  communityId = community.id;
  createdCommunityIds.push(communityId);

  // Auto-join owner
  await db.insert(communityMembersTable).values({ communityId, userId: ownerId });

  // Channel with iconEmoji set
  const [emojiCh] = await db
    .insert(communityChannelsTable)
    .values({ communityId, name: "gaming", type: "text", position: 0, iconEmoji: TEST_EMOJI } as any)
    .returning();
  emojiChannelId = emojiCh.id;

  // Channel without iconEmoji (null)
  const [plainCh] = await db
    .insert(communityChannelsTable)
    .values({ communityId, name: "general", type: "text", position: 1 })
    .returning();
  plainChannelId = plainCh.id;

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

// ─── GET /communities/:slug — iconEmoji in channel list ───────────────────────

describe("GET /communities/:slug — iconEmoji in channel serializer", () => {
  test("returns channels array with iconEmoji populated for the emoji channel", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${originalSlug}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "response must include a channels array");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must be present in response`);
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `expected iconEmoji "${TEST_EMOJI}", got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });

  test("returns iconEmoji as null for a plain channel with no emoji set", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${originalSlug}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200);

    const community = body as { channels: Array<{ id: number; iconEmoji: string | null }> };
    const plainCh = community.channels.find(c => c.id === plainChannelId);
    assert.ok(plainCh, `channel ${plainChannelId} must be present in response`);

    // The field must be present in the response object (not simply omitted) and
    // equal null — absence of the key would indicate the serializer dropped it,
    // which would be a regression for the "every channel includes iconEmoji" guarantee.
    assert.ok(
      Object.prototype.hasOwnProperty.call(plainCh, "iconEmoji"),
      `iconEmoji key must be present in channel response even when unset`,
    );
    assert.strictEqual(
      plainCh.iconEmoji,
      null,
      `expected iconEmoji to be null for plain channel, got ${JSON.stringify(plainCh.iconEmoji)}`,
    );
  });

  test("numeric id fallback also returns iconEmoji", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `numeric id lookup failed: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; iconEmoji: string | null }> };
    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} should be present via numeric id lookup`);
    assert.equal(emojiCh.iconEmoji, TEST_EMOJI);
  });
});

// ─── After slug rename — iconEmoji survives ────────────────────────────────────

describe("GET /communities/:newSlug after slug rename — iconEmoji survives", () => {
  before(async () => {
    // Rename the slug directly in the DB (simulates a rename operation)
    await db
      .update(communitiesTable)
      .set({ slug: renamedSlug })
      .where(eq(communitiesTable.id, communityId));
  });

  test("old slug returns 404 after rename", async () => {
    const { status } = await request(
      "GET",
      `/communities/${originalSlug}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 404, `expected 404 for old slug after rename, got ${status}`);
  });

  test("new slug returns 200 with iconEmoji intact", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${renamedSlug}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 for new slug, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present after rename");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must still be present after slug rename`);
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive a slug rename`,
    );
  });

  test("numeric id lookup still returns iconEmoji after rename", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200);

    const community = body as { channels: Array<{ id: number; iconEmoji: string | null }> };
    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh);
    assert.equal(emojiCh.iconEmoji, TEST_EMOJI);
  });
});

// ─── PATCH channel type change — iconEmoji is preserved ───────────────────────

describe("PATCH /communities/:id/channels/:cid type change — iconEmoji is preserved", () => {
  test("PATCH response includes iconEmoji unchanged after type change (text → announcement)", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(ownerId, ownerUsername),
      { type: "announcement" },
    );
    assert.equal(status, 200, `expected 200 from PATCH, got ${status}: ${JSON.stringify(body)}`);

    const channel = body as { id: number; type: string; iconEmoji: string | null };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.type,
      "announcement",
      `expected channel type to be "announcement", got ${JSON.stringify(channel.type)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(channel, "iconEmoji"),
      "iconEmoji key must be present in PATCH response",
    );
    assert.equal(
      channel.iconEmoji,
      TEST_EMOJI,
      `iconEmoji must remain "${TEST_EMOJI}" after type change, got ${JSON.stringify(channel.iconEmoji)}`,
    );
  });

  test("GET /communities/:id after type change still returns correct iconEmoji", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; type: string; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must still appear in community response after type change`);
    assert.equal(
      emojiCh.type,
      "announcement",
      `channel type should reflect the change, got ${JSON.stringify(emojiCh.type)}`,
    );
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive a type change, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });
});

// ─── PATCH channel rename — iconEmoji is preserved ────────────────────────────

describe("PATCH /communities/:id/channels/:cid rename — iconEmoji is preserved", () => {
  const RENAMED_CHANNEL = "gaming-renamed";

  test("PATCH response includes iconEmoji unchanged after channel rename", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(ownerId, ownerUsername),
      { name: RENAMED_CHANNEL },
    );
    assert.equal(status, 200, `expected 200 from PATCH, got ${status}: ${JSON.stringify(body)}`);

    const channel = body as { id: number; name: string; iconEmoji: string | null };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.name,
      RENAMED_CHANNEL,
      `expected channel name to be "${RENAMED_CHANNEL}", got ${JSON.stringify(channel.name)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(channel, "iconEmoji"),
      "iconEmoji key must be present in PATCH response",
    );
    assert.equal(
      channel.iconEmoji,
      TEST_EMOJI,
      `iconEmoji must remain "${TEST_EMOJI}" after rename, got ${JSON.stringify(channel.iconEmoji)}`,
    );
  });

  test("GET /communities/:id after channel rename still returns correct iconEmoji", async () => {
    // Use numeric community id since the slug was renamed by the previous describe block
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; name: string; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must still appear in community response after rename`);
    assert.equal(
      emojiCh.name,
      RENAMED_CHANNEL,
      `channel name should reflect the rename, got ${JSON.stringify(emojiCh.name)}`,
    );
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive a channel rename, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });
});

// ─── PATCH slowmodeSeconds by a mod — iconEmoji is not cleared ────────────────

describe("PATCH slowmodeSeconds by a mod — iconEmoji is not cleared", () => {
  let modId = 0;
  let modUsername = "";

  before(async () => {
    // Create a mod user
    const [mod] = await db
      .insert(usersTable)
      .values({
        username: `iconemoji_mod_${SUFFIX}`,
        passwordHash: "x",
        displayName: "IconEmoji Mod",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });
    modId = mod.id;
    modUsername = mod.username;
    createdUserIds.push(modId);

    // Join mod to the community
    const [membership] = await db
      .insert(communityMembersTable)
      .values({ communityId, userId: modId })
      .returning({ id: communityMembersTable.id });

    // Create a role with can_manage_channels and assign it to the mod
    const roleResult = await pool.query<{ id: number }>(
      `INSERT INTO community_roles (community_id, name, color, position, permissions)
       VALUES ($1, $2, '#ffffff', 0, '{"can_manage_channels":true}'::jsonb)
       RETURNING id`,
      [communityId, `mod-role-${SUFFIX}`],
    );
    const roleId = roleResult.rows[0].id;
    await pool.query(
      `INSERT INTO community_member_roles (member_id, role_id) VALUES ($1, $2)`,
      [membership.id, roleId],
    );
  });

  test("mod PATCH of slowmodeSeconds returns iconEmoji unchanged in response", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(modId, modUsername),
      { slowmodeSeconds: 30 },
    );
    assert.equal(status, 200, `expected 200 from mod PATCH, got ${status}: ${JSON.stringify(body)}`);

    const channel = body as { id: number; slowmodeSeconds: number; iconEmoji: string | null };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.slowmodeSeconds,
      30,
      `expected slowmodeSeconds to be 30, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(channel, "iconEmoji"),
      "iconEmoji key must be present in PATCH response even after mod-only slowmode update",
    );
    assert.equal(
      channel.iconEmoji,
      TEST_EMOJI,
      `iconEmoji must remain "${TEST_EMOJI}" after mod slowmode update, got ${JSON.stringify(channel.iconEmoji)}`,
    );
  });

  test("GET /communities/:id after mod slowmode update confirms iconEmoji still set", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; slowmodeSeconds: number; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must appear in GET response`);
    assert.equal(
      emojiCh.slowmodeSeconds,
      30,
      `slowmodeSeconds should reflect the mod's change, got ${JSON.stringify(emojiCh.slowmodeSeconds)}`,
    );
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive a mod slowmode update, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });

  test("mod PATCH with slowmodeSeconds AND iconEmoji:null — iconEmoji is still preserved in response", async () => {
    // A mod sends both slowmodeSeconds and iconEmoji:null in the same body.
    // The handler only allows mods to touch slowmodeSeconds, so the null for
    // iconEmoji must be silently ignored and the original emoji must survive.
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(modId, modUsername),
      { slowmodeSeconds: 10, iconEmoji: null },
    );
    assert.equal(status, 200, `expected 200 from mod PATCH, got ${status}: ${JSON.stringify(body)}`);

    const channel = body as { id: number; slowmodeSeconds: number; iconEmoji: string | null };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.slowmodeSeconds,
      10,
      `expected slowmodeSeconds to be updated to 10, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(channel, "iconEmoji"),
      "iconEmoji key must be present in PATCH response",
    );
    assert.equal(
      channel.iconEmoji,
      TEST_EMOJI,
      `iconEmoji must remain "${TEST_EMOJI}" even when mod sends iconEmoji:null, got ${JSON.stringify(channel.iconEmoji)}`,
    );
  });

  test("GET /communities/:id after mod sends iconEmoji:null confirms emoji still persisted", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; slowmodeSeconds: number; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must appear in GET response`);
    assert.equal(
      emojiCh.slowmodeSeconds,
      10,
      `slowmodeSeconds should reflect the second mod update (10s), got ${JSON.stringify(emojiCh.slowmodeSeconds)}`,
    );
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must not be cleared when mod sends iconEmoji:null alongside slowmodeSeconds, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });

  test("slowmodeSeconds=99999 is rejected with 400 (exceeds the maximum of 21600)", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(modId, modUsername),
      { slowmodeSeconds: 99999 },
    );
    assert.equal(status, 400, `expected 400 from mod PATCH with out-of-range slowmode, got ${status}: ${JSON.stringify(body)}`);

    const err = body as { error?: string };
    assert.ok(
      typeof err.error === "string" && /slowmode/i.test(err.error),
      `expected an error message mentioning slowmode, got ${JSON.stringify(err)}`,
    );
  });

  test("slowmodeSeconds=-1 is rejected with 400 (below the minimum of 0)", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(modId, modUsername),
      { slowmodeSeconds: -1 },
    );
    assert.equal(status, 400, `expected 400 from mod PATCH with out-of-range slowmode, got ${status}: ${JSON.stringify(body)}`);

    const err = body as { error?: string };
    assert.ok(
      typeof err.error === "string" && /slowmode/i.test(err.error),
      `expected an error message mentioning slowmode, got ${JSON.stringify(err)}`,
    );
  });
});

// ─── slowmodeSeconds integer validation ───────────────────────────────────────

describe("PATCH slowmodeSeconds — integer validation", () => {
  let modId2 = 0;
  let modUsername2 = "";

  before(async () => {
    const [mod] = await db
      .insert(usersTable)
      .values({
        username: `intval_mod_${SUFFIX}`,
        passwordHash: "x",
        displayName: "IntVal Mod",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });
    modId2 = mod.id;
    modUsername2 = mod.username;
    createdUserIds.push(modId2);

    const [membership] = await db
      .insert(communityMembersTable)
      .values({ communityId, userId: modId2 })
      .returning({ id: communityMembersTable.id });

    const roleResult = await pool.query<{ id: number }>(
      `INSERT INTO community_roles (community_id, name, color, position, permissions)
       VALUES ($1, $2, '#ffffff', 0, '{"can_manage_channels":true}'::jsonb)
       RETURNING id`,
      [communityId, `intval-mod-role-${SUFFIX}`],
    );
    const roleId = roleResult.rows[0].id;
    await pool.query(
      `INSERT INTO community_member_roles (member_id, role_id) VALUES ($1, $2)`,
      [membership.id, roleId],
    );
  });

  test("PATCH with slowmodeSeconds: 21600.5 (float above cap) is rejected with 400", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId2, modUsername2),
      { slowmodeSeconds: 21600.5 },
    );
    assert.equal(
      status,
      400,
      `expected 400 for float slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );
  });

  test("PATCH with slowmodeSeconds: 0.5 (non-integer within range) is rejected with 400", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId2, modUsername2),
      { slowmodeSeconds: 0.5 },
    );
    assert.equal(
      status,
      400,
      `expected 400 for non-integer slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );
  });

  test("PATCH with slowmodeSeconds: 0 (zero, disable slowmode) is accepted with 200", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId2, modUsername2),
      { slowmodeSeconds: 0 },
    );
    assert.equal(
      status,
      200,
      `expected 200 for slowmodeSeconds=0, got ${status}: ${JSON.stringify(body)}`,
    );
    const channel = body as { slowmodeSeconds: number };
    assert.equal(
      channel.slowmodeSeconds,
      0,
      `expected slowmodeSeconds 0 to be stored, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });

  test("PATCH with slowmodeSeconds: 60 (valid integer) is accepted with 200", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId2, modUsername2),
      { slowmodeSeconds: 60 },
    );
    assert.equal(
      status,
      200,
      `expected 200 for valid integer slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );
    const channel = body as { slowmodeSeconds: number };
    assert.equal(
      channel.slowmodeSeconds,
      60,
      `expected slowmodeSeconds 60, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });
});

// ─── Mod cannot change name or privacy — owner-only guard ─────────────────────

describe("PATCH /communities/:id/channels/:cid — mod cannot rename or change privacy", () => {
  let modId = 0;
  let modUsername = "";

  before(async () => {
    // Create a mod user
    const [mod] = await db
      .insert(usersTable)
      .values({
        username: `guard_mod_${SUFFIX}`,
        passwordHash: "x",
        displayName: "Guard Mod",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });
    modId = mod.id;
    modUsername = mod.username;
    createdUserIds.push(modId);

    // Join mod to the community
    const [membership] = await db
      .insert(communityMembersTable)
      .values({ communityId, userId: modId })
      .returning({ id: communityMembersTable.id });

    // Create a role with can_manage_channels and assign it to the mod
    const roleResult = await pool.query<{ id: number }>(
      `INSERT INTO community_roles (community_id, name, color, position, permissions)
       VALUES ($1, $2, '#ffffff', 0, '{"can_manage_channels":true}'::jsonb)
       RETURNING id`,
      [communityId, `guard-mod-role-${SUFFIX}`],
    );
    const roleId = roleResult.rows[0].id;
    await pool.query(
      `INSERT INTO community_member_roles (member_id, role_id) VALUES ($1, $2)`,
      [membership.id, roleId],
    );
  });

  test("mod PATCH with { name } returns 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId, modUsername),
      { name: "hacked" },
    );
    assert.equal(status, 403, `expected 403 when mod tries to rename, got ${status}: ${JSON.stringify(body)}`);
  });

  test("GET after rejected rename confirms channel name is unchanged", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; name: string }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const plainCh = community.channels.find(c => c.id === plainChannelId);
    assert.ok(plainCh, `channel ${plainChannelId} must be present in GET response`);
    assert.notEqual(
      plainCh.name,
      "hacked",
      `channel name must not be "hacked" after a mod's rejected rename attempt, got ${JSON.stringify(plainCh.name)}`,
    );
  });

  test("mod PATCH with { isPrivate: true } returns 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId, modUsername),
      { isPrivate: true },
    );
    assert.equal(status, 403, `expected 403 when mod tries to change isPrivate, got ${status}: ${JSON.stringify(body)}`);
  });

  test("GET after rejected privacy change confirms channel privacy is unchanged", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; isPrivate: boolean }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const plainCh = community.channels.find(c => c.id === plainChannelId);
    assert.ok(plainCh, `channel ${plainChannelId} must be present in GET response`);
    assert.equal(
      plainCh.isPrivate,
      false,
      `channel isPrivate must remain false after a mod's rejected privacy change attempt, got ${JSON.stringify(plainCh.isPrivate)}`,
    );
  });
});

// ─── PATCH channel isPrivate toggle — iconEmoji is preserved ──────────────────

describe("PATCH /communities/:id/channels/:cid isPrivate toggle — iconEmoji is preserved", () => {
  test("PATCH response includes iconEmoji unchanged after toggling isPrivate false → true", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(ownerId, ownerUsername),
      { isPrivate: true },
    );
    assert.equal(status, 200, `expected 200 from PATCH, got ${status}: ${JSON.stringify(body)}`);

    const channel = body as { id: number; isPrivate: boolean; iconEmoji: string | null };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.isPrivate,
      true,
      `expected isPrivate to be true after toggle, got ${JSON.stringify(channel.isPrivate)}`,
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(channel, "iconEmoji"),
      "iconEmoji key must be present in PATCH response",
    );
    assert.equal(
      channel.iconEmoji,
      TEST_EMOJI,
      `iconEmoji must remain "${TEST_EMOJI}" after isPrivate toggle, got ${JSON.stringify(channel.iconEmoji)}`,
    );
  });

  test("GET /communities/:id after isPrivate toggle still returns correct iconEmoji", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; isPrivate: boolean; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must still appear in community response after isPrivate toggle`);
    assert.equal(
      emojiCh.isPrivate,
      true,
      `isPrivate should reflect the toggle, got ${JSON.stringify(emojiCh.isPrivate)}`,
    );
    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive a privacy toggle, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });
});

// ─── Concurrent PATCH slowmodeSeconds — last writer wins, no corruption ────────

describe("Concurrent PATCH slowmodeSeconds — final state is consistent", () => {
  /** Two different slowmode values used by the two concurrent requests. */
  const SLOW_A = 60;
  const SLOW_B = 120;

  test("both concurrent PATCH requests succeed (no 500) and final slowmodeSeconds is one of the two values", async () => {
    // Fire both requests simultaneously and wait for both to settle.
    const [resA, resB] = await Promise.all([
      request(
        "PATCH",
        `/communities/${communityId}/channels/${emojiChannelId}`,
        auth(ownerId, ownerUsername),
        { slowmodeSeconds: SLOW_A },
      ),
      request(
        "PATCH",
        `/communities/${communityId}/channels/${emojiChannelId}`,
        auth(ownerId, ownerUsername),
        { slowmodeSeconds: SLOW_B },
      ),
    ]);

    // Both requests must succeed — a concurrent plain UPDATE is always serialised
    // by Postgres and should never produce a 500.
    assert.equal(resA.status, 200, `request A: expected 200, got ${resA.status}: ${JSON.stringify(resA.body)}`);
    assert.equal(resB.status, 200, `request B: expected 200, got ${resB.status}: ${JSON.stringify(resB.body)}`);

    // Each response must carry a valid (non-zero) slowmodeSeconds.
    const bodyA = resA.body as { slowmodeSeconds: number; iconEmoji: string | null };
    const bodyB = resB.body as { slowmodeSeconds: number; iconEmoji: string | null };

    assert.ok(
      bodyA.slowmodeSeconds === SLOW_A || bodyA.slowmodeSeconds === SLOW_B,
      `response A slowmodeSeconds must be ${SLOW_A} or ${SLOW_B}, got ${bodyA.slowmodeSeconds}`,
    );
    assert.ok(
      bodyB.slowmodeSeconds === SLOW_A || bodyB.slowmodeSeconds === SLOW_B,
      `response B slowmodeSeconds must be ${SLOW_A} or ${SLOW_B}, got ${bodyB.slowmodeSeconds}`,
    );

    // iconEmoji must survive in both responses.
    assert.equal(
      bodyA.iconEmoji,
      TEST_EMOJI,
      `response A: iconEmoji must remain "${TEST_EMOJI}" after concurrent update, got ${JSON.stringify(bodyA.iconEmoji)}`,
    );
    assert.equal(
      bodyB.iconEmoji,
      TEST_EMOJI,
      `response B: iconEmoji must remain "${TEST_EMOJI}" after concurrent update, got ${JSON.stringify(bodyB.iconEmoji)}`,
    );
  });

  test("GET after concurrent PATCH reflects one of the two slowmodeSeconds values and iconEmoji is intact", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; slowmodeSeconds: number; iconEmoji: string | null }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const emojiCh = community.channels.find(c => c.id === emojiChannelId);
    assert.ok(emojiCh, `channel ${emojiChannelId} must appear in GET response after concurrent update`);

    // The persisted value must be one of the two submitted values — not zero and not
    // some corrupted intermediate — confirming last-writer-wins with no silent loss.
    assert.ok(
      emojiCh.slowmodeSeconds === SLOW_A || emojiCh.slowmodeSeconds === SLOW_B,
      `final slowmodeSeconds must be ${SLOW_A} or ${SLOW_B}, got ${emojiCh.slowmodeSeconds}`,
    );

    assert.equal(
      emojiCh.iconEmoji,
      TEST_EMOJI,
      `iconEmoji "${TEST_EMOJI}" must survive concurrent slowmode updates, got ${JSON.stringify(emojiCh.iconEmoji)}`,
    );
  });
});

// ─── PATCH slowmodeSeconds cap validation — 0–21600 boundary ──────────────────

describe("PATCH slowmodeSeconds cap validation — 0–21600 boundary", () => {
  test("slowmodeSeconds above 21600 is clamped to 21600", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(ownerId, ownerUsername),
      { slowmodeSeconds: 21601 },
    );
    assert.equal(
      status,
      200,
      `expected 200 for slowmodeSeconds > 21600 (clamped), got ${status}: ${JSON.stringify(body)}`,
    );
    const channel = body as { id: number; slowmodeSeconds: number };
    assert.equal(
      channel.slowmodeSeconds,
      21600,
      `expected slowmodeSeconds to be clamped to 21600, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });

  test("negative slowmodeSeconds is clamped to 0", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(ownerId, ownerUsername),
      { slowmodeSeconds: -1 },
    );
    assert.equal(
      status,
      200,
      `expected 200 for negative slowmodeSeconds (clamped), got ${status}: ${JSON.stringify(body)}`,
    );
    const channel = body as { id: number; slowmodeSeconds: number };
    assert.equal(
      channel.slowmodeSeconds,
      0,
      `expected slowmodeSeconds to be clamped to 0, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });

  test("slowmodeSeconds of exactly 21600 is accepted with 200", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(ownerId, ownerUsername),
      { slowmodeSeconds: 21600 },
    );
    assert.equal(
      status,
      200,
      `expected 200 for slowmodeSeconds === 21600, got ${status}: ${JSON.stringify(body)}`,
    );
    const channel = body as { id: number; slowmodeSeconds: number };
    assert.equal(
      channel.slowmodeSeconds,
      21600,
      `expected slowmodeSeconds to be 21600 in response, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });
});

// ─── Mod cannot change channel type — owner-only guard ────────────────────────

describe("PATCH /communities/:id/channels/:cid — mod cannot change channel type", () => {
  let modId = 0;
  let modUsername = "";

  before(async () => {
    // Create a mod user
    const [mod] = await db
      .insert(usersTable)
      .values({
        username: `type_guard_mod_${SUFFIX}`,
        passwordHash: "x",
        displayName: "Type Guard Mod",
        status: "online" as const,
      })
      .returning({ id: usersTable.id, username: usersTable.username });
    modId = mod.id;
    modUsername = mod.username;
    createdUserIds.push(modId);

    // Join mod to the community
    const [membership] = await db
      .insert(communityMembersTable)
      .values({ communityId, userId: modId })
      .returning({ id: communityMembersTable.id });

    // Create a role with can_manage_channels and assign it to the mod
    const roleResult = await pool.query<{ id: number }>(
      `INSERT INTO community_roles (community_id, name, color, position, permissions)
       VALUES ($1, $2, '#ffffff', 0, '{"can_manage_channels":true}'::jsonb)
       RETURNING id`,
      [communityId, `type-guard-mod-role-${SUFFIX}`],
    );
    const roleId = roleResult.rows[0].id;
    await pool.query(
      `INSERT INTO community_member_roles (member_id, role_id) VALUES ($1, $2)`,
      [membership.id, roleId],
    );
  });

  test("mod PATCH with { type: 'announcement' } returns 403", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId, modUsername),
      { type: "announcement" },
    );
    assert.equal(
      status,
      403,
      `expected 403 when mod tries to change channel type to announcement, got ${status}: ${JSON.stringify(body)}`,
    );
  });

  test("GET after rejected type change confirms channel type is unchanged", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; type: string }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const plainCh = community.channels.find(c => c.id === plainChannelId);
    assert.ok(plainCh, `channel ${plainChannelId} must be present in GET response`);
    assert.notEqual(
      plainCh.type,
      "announcement",
      `channel type must not be "announcement" after a mod's rejected type change, got ${JSON.stringify(plainCh.type)}`,
    );
  });

  test("mod PATCH with { type: 'voice', slowmodeSeconds: 10 } returns 403", async () => {
    // Even though slowmodeSeconds is a field mods are allowed to set,
    // the presence of `type` in the same payload triggers the owner-only guard.
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${plainChannelId}`,
      auth(modId, modUsername),
      { type: "voice", slowmodeSeconds: 10 },
    );
    assert.equal(
      status,
      403,
      `expected 403 when mod sends type alongside slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );
  });

  test("GET after rejected type+slowmodeSeconds confirms channel type is still unchanged", async () => {
    const { status, body } = await request(
      "GET",
      `/communities/${communityId}`,
      auth(ownerId, ownerUsername),
    );
    assert.equal(status, 200, `expected 200 from GET, got ${status}: ${JSON.stringify(body)}`);

    const community = body as { channels: Array<{ id: number; type: string }> };
    assert.ok(Array.isArray(community.channels), "channels array must be present");

    const plainCh = community.channels.find(c => c.id === plainChannelId);
    assert.ok(plainCh, `channel ${plainChannelId} must be present in GET response`);
    assert.notEqual(
      plainCh.type,
      "voice",
      `channel type must not be "voice" after a mod's rejected type+slowmodeSeconds change, got ${JSON.stringify(plainCh.type)}`,
    );
  });
});

// ─── Owner slowmode clamping — same cap enforced for owners ───────────────────

describe("PATCH slowmodeSeconds by owner — cap is enforced the same as for mods", () => {
  test("owner PATCH with slowmodeSeconds=99999 is clamped to 21600", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(ownerId, ownerUsername),
      { slowmodeSeconds: 99999 },
    );
    assert.equal(
      status,
      200,
      `expected 200 from owner PATCH with out-of-range slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );

    const channel = body as { id: number; slowmodeSeconds: number };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.slowmodeSeconds,
      21600,
      `expected slowmodeSeconds to be clamped to 21600, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });

  test("owner PATCH with slowmodeSeconds=-5 is clamped to 0", async () => {
    const { status, body } = await request(
      "PATCH",
      `/communities/${communityId}/channels/${emojiChannelId}`,
      auth(ownerId, ownerUsername),
      { slowmodeSeconds: -5 },
    );
    assert.equal(
      status,
      200,
      `expected 200 from owner PATCH with negative slowmodeSeconds, got ${status}: ${JSON.stringify(body)}`,
    );

    const channel = body as { id: number; slowmodeSeconds: number };
    assert.equal(channel.id, emojiChannelId, "response channel id must match");
    assert.equal(
      channel.slowmodeSeconds,
      0,
      `expected slowmodeSeconds to be clamped to 0, got ${JSON.stringify(channel.slowmodeSeconds)}`,
    );
  });
});
