/**
 * Integration tests confirming that GET /factions returns a stable, deterministic
 * order when two factions tie on weekly_points.
 *
 * Tiebreaker policy: factions with equal weekly_points are ordered by f.id ASC
 * (lower id ranks higher).  This matches the ORDER BY weekly_points DESC, f.id ASC
 * clause added to WAR_SQL.
 *
 * Covered scenarios:
 *  1. Two tied factions appear in ascending id order on every call
 *  2. A third faction with strictly fewer points always trails both tied factions
 *  3. When one tied faction pulls ahead (one extra activity), rank order flips correctly
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  lfgPostsTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
} from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let viewerId = 0;
let viewerUsername = "";

// Two factions that will be seeded with equal weekly points
let tiedFactionAId = 0; // will have the lower id → should rank first on tie
let tiedFactionBId = 0; // higher id → should rank second on tie

// A third faction with strictly fewer points
let trailerFactionId = 0;

// Users to generate activity
let memberAId = 0;  // member of tiedFactionA
let memberBId = 0;  // member of tiedFactionB

// Shared conversation for messages
let testConvId = 0;

const createdUserIds: number[] = [];
const createdPostIds: number[] = [];
const createdMessageIds: number[] = [];
const createdConvIds: number[] = [];

function mkUser(label: string) {
  return {
    username: `ftie_${label}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `FTie ${label}`,
    status: "online" as const,
  };
}

before(async () => {
  // Ensure faction tables exist (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS factions (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      color       TEXT NOT NULL,
      icon_emoji  TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_factions (
      user_id    INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      faction_id INTEGER NOT NULL REFERENCES factions(id),
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create three isolated test factions; insert order guarantees A < B < trailer by id
  const { rows: fA } = await pool.query<{ id: number }>(
    `INSERT INTO factions (name, slug, color, icon_emoji, description)
     VALUES ($1, $2, '#111111', '🅰️', 'Tie test faction A')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FTieFactionA_${SUFFIX}`, `ftie_a_${SUFFIX}`],
  );
  tiedFactionAId = fA[0].id;

  const { rows: fB } = await pool.query<{ id: number }>(
    `INSERT INTO factions (name, slug, color, icon_emoji, description)
     VALUES ($1, $2, '#222222', '🅱️', 'Tie test faction B')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FTieFactionB_${SUFFIX}`, `ftie_b_${SUFFIX}`],
  );
  tiedFactionBId = fB[0].id;

  const { rows: fT } = await pool.query<{ id: number }>(
    `INSERT INTO factions (name, slug, color, icon_emoji, description)
     VALUES ($1, $2, '#333333', '🔻', 'Tie test trailer faction')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [`FTieTrailer_${SUFFIX}`, `ftie_t_${SUFFIX}`],
  );
  trailerFactionId = fT[0].id;

  // Since SERIAL is monotonically increasing, inserting A then B guarantees A < B.
  assert.ok(
    tiedFactionAId < tiedFactionBId,
    `Precondition: tiedFactionAId (${tiedFactionAId}) must be < tiedFactionBId (${tiedFactionBId})`,
  );

  // Create users
  const inserted = await db
    .insert(usersTable)
    .values([mkUser("viewer"), mkUser("memberA"), mkUser("memberB")])
    .returning({ id: usersTable.id, username: usersTable.username });

  viewerId       = inserted[0].id;
  viewerUsername = inserted[0].username;
  memberAId      = inserted[1].id;
  memberBId      = inserted[2].id;
  createdUserIds.push(viewerId, memberAId, memberBId);

  // Enroll members in their respective factions
  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id) VALUES ($1, $2), ($3, $4)`,
    [memberAId, tiedFactionAId, memberBId, tiedFactionBId],
  );

  // Create a shared conversation so messages have a valid conversation_id
  const [conv] = await db
    .insert(conversationsTable)
    .values({ type: "group" })
    .returning({ id: conversationsTable.id });
  testConvId = conv.id;
  createdConvIds.push(testConvId);

  await db.insert(conversationParticipantsTable).values([
    { conversationId: testConvId, userId: memberAId },
    { conversationId: testConvId, userId: memberBId },
  ]);

  // Seed IDENTICAL activity for both tied members so weekly_points are equal.
  // 1 lfg_post × 5 pts + 1 message × 1 pt = 6 pts each → faction totals both 6.
  const posts = await db
    .insert(lfgPostsTable)
    .values([
      { authorId: memberAId, game: "TieGame", description: "Tie post A", neededPlayers: 1, micRequired: false, status: "open" as const },
      { authorId: memberBId, game: "TieGame", description: "Tie post B", neededPlayers: 1, micRequired: false, status: "open" as const },
    ])
    .returning({ id: lfgPostsTable.id });
  createdPostIds.push(...posts.map(p => p.id));

  const msgs = await db
    .insert(messagesTable)
    .values([
      { conversationId: testConvId, senderId: memberAId, content: "tie msg A" },
      { conversationId: testConvId, senderId: memberBId, content: "tie msg B" },
    ])
    .returning({ id: messagesTable.id });
  createdMessageIds.push(...msgs.map(m => m.id));

  // trailerFaction has no members → weekly_points = 0 (strictly less than 6)

  // Start HTTP server
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdMessageIds.length) {
    await db.delete(messagesTable).where(inArray(messagesTable.id, createdMessageIds));
  }
  if (createdConvIds.length) {
    await db
      .delete(conversationParticipantsTable)
      .where(inArray(conversationParticipantsTable.conversationId, createdConvIds));
    await db
      .delete(conversationsTable)
      .where(inArray(conversationsTable.id, createdConvIds));
  }
  if (createdPostIds.length) {
    await db.delete(lfgPostsTable).where(inArray(lfgPostsTable.id, createdPostIds));
  }
  await pool.query(
    `DELETE FROM user_factions WHERE user_id = ANY($1::int[])`,
    [[memberAId, memberBId]],
  );
  await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  await pool.query(
    `DELETE FROM factions WHERE id = ANY($1::int[])`,
    [[tiedFactionAId, tiedFactionBId, trailerFactionId]],
  );
  await pool.end();
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function authedGet(path: string): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId: viewerId, username: viewerUsername });
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /factions — leaderboard tie stability", () => {
  test("both tied factions report equal weekly_points", async () => {
    const { status, body } = await authedGet("/factions");
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const factions = body as Array<Record<string, unknown>>;
    const fA = factions.find(f => f.id === tiedFactionAId);
    const fB = factions.find(f => f.id === tiedFactionBId);

    assert.ok(fA, `tiedFactionA (id=${tiedFactionAId}) not found in /factions response`);
    assert.ok(fB, `tiedFactionB (id=${tiedFactionBId}) not found in /factions response`);

    assert.equal(
      fA.weekly_points,
      fB.weekly_points,
      `Precondition: tied factions must have equal weekly_points; A=${fA.weekly_points}, B=${fB.weekly_points}`,
    );
    assert.ok(
      (fA.weekly_points as number) > 0,
      `Tied factions must have non-zero weekly_points to distinguish from the trailer; got ${fA.weekly_points}`,
    );
  });

  test("tied factions are ordered by id ASC (lower id ranks first)", async () => {
    const { status, body } = await authedGet("/factions");
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const factions = body as Array<Record<string, unknown>>;
    const idxA = factions.findIndex(f => f.id === tiedFactionAId);
    const idxB = factions.findIndex(f => f.id === tiedFactionBId);

    assert.ok(idxA !== -1, `tiedFactionA (id=${tiedFactionAId}) not found in /factions`);
    assert.ok(idxB !== -1, `tiedFactionB (id=${tiedFactionBId}) not found in /factions`);

    assert.ok(
      idxA < idxB,
      `On a tie, faction with lower id (${tiedFactionAId} at index ${idxA}) must appear before faction with higher id (${tiedFactionBId} at index ${idxB})`,
    );
  });

  test("stable order is consistent across multiple calls", async () => {
    // Run 3 back-to-back requests and confirm the relative positions never change
    for (let i = 0; i < 3; i++) {
      const { status, body } = await authedGet("/factions");
      assert.equal(status, 200, `call ${i + 1}: expected 200, got ${status}`);

      const factions = body as Array<Record<string, unknown>>;
      const idxA = factions.findIndex(f => f.id === tiedFactionAId);
      const idxB = factions.findIndex(f => f.id === tiedFactionBId);

      assert.ok(
        idxA < idxB,
        `call ${i + 1}: tiedFactionA (idx=${idxA}) must precede tiedFactionB (idx=${idxB})`,
      );
    }
  });

  test("trailer faction (0 weekly_points) always ranks after both tied factions", async () => {
    const { status, body } = await authedGet("/factions");
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

    const factions = body as Array<Record<string, unknown>>;
    const idxA       = factions.findIndex(f => f.id === tiedFactionAId);
    const idxB       = factions.findIndex(f => f.id === tiedFactionBId);
    const idxTrailer = factions.findIndex(f => f.id === trailerFactionId);

    assert.ok(idxA       !== -1, `tiedFactionA not found`);
    assert.ok(idxB       !== -1, `tiedFactionB not found`);
    assert.ok(idxTrailer !== -1, `trailerFaction not found`);

    assert.ok(
      idxTrailer > idxA,
      `trailer faction (idx=${idxTrailer}) must rank after tiedFactionA (idx=${idxA})`,
    );
    assert.ok(
      idxTrailer > idxB,
      `trailer faction (idx=${idxTrailer}) must rank after tiedFactionB (idx=${idxB})`,
    );
  });

  test("when one tied faction gains an extra point, it moves ahead of the other", async () => {
    // Give memberA one extra message so tiedFactionA has more weekly_points than tiedFactionB
    const [extraMsg] = await db
      .insert(messagesTable)
      .values({ conversationId: testConvId, senderId: memberAId, content: "tiebreaker msg" })
      .returning({ id: messagesTable.id });
    createdMessageIds.push(extraMsg.id);

    try {
      const { status, body } = await authedGet("/factions");
      assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);

      const factions = body as Array<Record<string, unknown>>;
      const fA = factions.find(f => f.id === tiedFactionAId) as Record<string, unknown>;
      const fB = factions.find(f => f.id === tiedFactionBId) as Record<string, unknown>;

      assert.ok(fA, `tiedFactionA not found`);
      assert.ok(fB, `tiedFactionB not found`);

      assert.ok(
        (fA.weekly_points as number) > (fB.weekly_points as number),
        `After extra activity, factionA (${fA.weekly_points} pts) must have strictly more pts than factionB (${fB.weekly_points} pts)`,
      );

      const idxA = factions.findIndex(f => f.id === tiedFactionAId);
      const idxB = factions.findIndex(f => f.id === tiedFactionBId);

      assert.ok(
        idxA < idxB,
        `After tiebreak, factionA (${fA.weekly_points} pts, idx=${idxA}) must lead factionB (${fB.weekly_points} pts, idx=${idxB})`,
      );
    } finally {
      // Clean up extra message so subsequent tests see the tie again
      await db.delete(messagesTable).where(inArray(messagesTable.id, [extraMsg.id]));
      // Remove from tracking so after() doesn't try to delete it twice
      const i = createdMessageIds.indexOf(extraMsg.id);
      if (i !== -1) createdMessageIds.splice(i, 1);
    }
  });
});
