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
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
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
