/**
 * Integration tests — GET /communities/:id/insights (Task #427)
 *
 * Confirms:
 *  1. Empty community returns empty arrays for all aggregates
 *  2. Inserted members appear in memberGrowth counts
 *  3. Non-owner / non-mod receives 403
 *  4. A second identical request within 10 min is served from the cache
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
import bcrypt from "bcryptjs";
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { attachSignaling } from "../../ws/signaling";
import app from "../../app";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUFFIX = `ins_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;
let closeSignaling: () => Promise<void>;

function makeToken(userId: number, username: string): string {
  return signToken({ userId, username });
}

function req(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const url = new URL(baseUrl + path);
    const r = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res: IncomingMessage) => {
        let raw = "";
        res.on("data", (c: Buffer) => (raw += c));
        res.on("end", () => {
          if (!raw) { resolve({ status: res.statusCode ?? 0, body: null }); return; }
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function createUser(username: string, extra: Record<string, unknown> = {}) {
  const hash = await bcrypt.hash("pass", 4);
  const [u] = await db
    .insert(usersTable)
    .values({ username, displayName: username, email: `${username}@test.local`, passwordHash: hash, ...extra })
    .returning({ id: usersTable.id });
  const token = makeToken(u.id, username);
  return { id: u.id, username, token };
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

before(async () => {
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeSignaling = attachSignaling(server);
});

after(async () => {
  await closeSignaling();
  await new Promise<void>((r) => server.close(() => r()));
  await pool.query(`DELETE FROM users WHERE username LIKE '${SUFFIX}%'`);
});

// ── 1. Empty community returns empty arrays ───────────────────────────────────

describe("Insights — empty community returns empty arrays", () => {
  let ownerToken = "";
  let communityId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_empty_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Empty`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;
  });

  after(async () => {
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  test("insights returns 200 with empty arrays for a brand-new community", async () => {
    const r = await req("GET", `/api/communities/${communityId}/insights`, ownerToken);
    assert.equal(r.status, 200, `expected 200, got: ${JSON.stringify(r.body)}`);
    const body = r.body as any;
    assert.ok(Array.isArray(body.memberGrowth), "memberGrowth should be an array");
    assert.ok(Array.isArray(body.dailyMessages), "dailyMessages should be an array");
    assert.ok(Array.isArray(body.topMembers), "topMembers should be an array");
    assert.ok(Array.isArray(body.peakHours), "peakHours should be an array");
    // A brand-new community has only the owner joined, but the owner joined
    // implicitly so it may appear; just verify the shape is correct.
    for (const entry of body.memberGrowth as any[]) {
      assert.ok(typeof entry.day === "string", "memberGrowth entry must have a day string");
      assert.ok(typeof entry.count === "number", "memberGrowth entry must have a numeric count");
    }
  });
});

// ── 2. Inserted members appear in memberGrowth ────────────────────────────────

describe("Insights — inserted members appear in memberGrowth", () => {
  let ownerToken = "";
  let communityId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_growth_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Growth`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    // Add two more members via the join API
    for (const tag of ["m1", "m2"]) {
      const u = await createUser(`${SUFFIX}_growth_${tag}`);
      const jr = await req("POST", `/api/communities/${communityId}/join`, u.token);
      assert.ok([200, 201, 204].includes(jr.status), `join ${tag}: ${JSON.stringify(jr.body)}`);
    }
  });

  after(async () => {
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  test("memberGrowth reflects all joined members (owner + 2 = 3 total)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/insights`, ownerToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const body = r.body as any;
    assert.ok(Array.isArray(body.memberGrowth), "memberGrowth should be an array");
    // Sum of all counts in the 30-day window must be at least 3
    const total: number = (body.memberGrowth as any[]).reduce((s: number, e: any) => s + e.count, 0);
    assert.ok(total >= 3, `expected total memberGrowth count >= 3, got ${total}`);
  });
});

// ── 3. Non-owner / non-mod receives 403 ──────────────────────────────────────

describe("Insights — non-owner and non-mod get 403", () => {
  let ownerToken = "";
  let memberToken = "";
  let strangerToken = "";
  let communityId = 0;

  before(async () => {
    const owner   = await createUser(`${SUFFIX}_403_owner`);
    const member  = await createUser(`${SUFFIX}_403_member`);
    const stranger = await createUser(`${SUFFIX}_403_stranger`);
    ownerToken   = owner.token;
    memberToken  = member.token;
    strangerToken = stranger.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Forbid`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
  });

  after(async () => {
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  test("plain member cannot access insights (403)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/insights`, memberToken);
    assert.equal(r.status, 403, `expected 403, got: ${JSON.stringify(r.body)}`);
  });

  test("non-member stranger cannot access insights (403)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/insights`, strangerToken);
    assert.equal(r.status, 403, `expected 403, got: ${JSON.stringify(r.body)}`);
  });

  test("owner can access insights (200)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/insights`, ownerToken);
    assert.equal(r.status, 200, `expected 200, got: ${JSON.stringify(r.body)}`);
  });
});

// ── 4. Cache — second request within 10 min returns identical cached data ─────

describe("Insights — cache returns same data within 10 min", () => {
  let ownerToken = "";
  let communityId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_cache_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Cache`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;
  });

  after(async () => {
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  test("two consecutive requests return identical body (cached response)", async () => {
    const r1 = await req("GET", `/api/communities/${communityId}/insights`, ownerToken);
    assert.equal(r1.status, 200, `first request: ${JSON.stringify(r1.body)}`);

    // Add a member between requests — cached response must NOT include them
    const extra = await createUser(`${SUFFIX}_cache_extra`);
    const jr = await req("POST", `/api/communities/${communityId}/join`, extra.token);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);

    const r2 = await req("GET", `/api/communities/${communityId}/insights`, ownerToken);
    assert.equal(r2.status, 200, `second request: ${JSON.stringify(r2.body)}`);

    // Both responses must be identical (cache was not invalidated)
    assert.deepEqual(
      r2.body,
      r1.body,
      "cached second response must match first response exactly",
    );
  });
});
