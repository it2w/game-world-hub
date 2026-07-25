/**
 * Integration tests — sticker-pack concurrency cap (Task #531)
 *
 * Confirms that:
 *  1. The 20-sticker cap is enforced under concurrent uploads — two simultaneous
 *     uploads at the boundary cannot both succeed, leaving the count > 20.
 *  2. A community with 0 stickers returns an empty array (StickerTray hides).
 *  3. A normal sequential upload succeeds and returns the sticker record.
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

const SUFFIX = `stk_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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

async function createUser(username: string) {
  const hash = await bcrypt.hash("pass", 4);
  const [u] = await db
    .insert(usersTable)
    .values({ username, displayName: username, email: `${username}@test.local`, passwordHash: hash })
    .returning({ id: usersTable.id });
  return { id: u.id, username, token: makeToken(u.id, username) };
}

/** Minimal 1×1 transparent PNG as base64 */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function stickerBody(name: string) {
  return { name, data: TINY_PNG_B64, mimeType: "image/png" };
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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Sticker cap concurrency", () => {
  let ownerToken = "";
  let communityId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Stickers`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;
  });

  test("empty community returns an empty sticker list", async () => {
    const r = await req("GET", `/api/communities/${communityId}/stickers`, ownerToken);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body), "body should be an array");
    assert.equal((r.body as unknown[]).length, 0, "no stickers yet");
  });

  test("sequential upload creates a sticker and returns its record", async () => {
    const r = await req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody("first"));
    assert.equal(r.status, 201, `upload: ${JSON.stringify(r.body)}`);
    const s = r.body as any;
    assert.equal(typeof s.id, "number");
    assert.equal(s.name, "first");
    assert.match(s.image_key, /^\/api\/images\//);
  });

  test("concurrent uploads at the 20-sticker boundary never exceed the cap", async () => {
    // Upload 19 stickers sequentially to reach count=19 (one already exists from previous test → this suite adds 18 more)
    // Actually: after the previous test we have 1 sticker. We need to reach 19.
    const existing = (await req("GET", `/api/communities/${communityId}/stickers`, ownerToken)).body as any[];
    const needed = 19 - existing.length;
    for (let i = 0; i < needed; i++) {
      const r = await req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody(`fill_${i}`));
      assert.equal(r.status, 201, `fill upload ${i}: ${JSON.stringify(r.body)}`);
    }

    // Verify we're at exactly 19
    const before19 = (await req("GET", `/api/communities/${communityId}/stickers`, ownerToken)).body as any[];
    assert.equal(before19.length, 19, "should be at 19 before race");

    // Fire two concurrent uploads — only one should succeed (201), the other must get 409
    const [r1, r2] = await Promise.all([
      req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody("race_a")),
      req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody("race_b")),
    ]);

    const statuses = [r1.status, r2.status].sort();
    assert.ok(
      (statuses[0] === 201 && statuses[1] === 409) ||
      (statuses[0] === 409 && statuses[1] === 409),
      `Expected one 201 + one 409 (or both 409 if first already filled), got ${statuses}`,
    );

    // Final count must never exceed 20
    const after = (await req("GET", `/api/communities/${communityId}/stickers`, ownerToken)).body as any[];
    assert.ok(after.length <= 20, `Cap exceeded: ${after.length} stickers`);
  });

  test("uploading when already at 20 returns 409", async () => {
    // Ensure we're at 20 (top-up if the concurrent test left us at 19 because both were 409)
    const current = (await req("GET", `/api/communities/${communityId}/stickers`, ownerToken)).body as any[];
    if (current.length < 20) {
      const r = await req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody("top_up"));
      assert.equal(r.status, 201, `top-up: ${JSON.stringify(r.body)}`);
    }

    const r = await req("POST", `/api/communities/${communityId}/stickers`, ownerToken, stickerBody("over_cap"));
    assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Cap must still be respected
    const after = (await req("GET", `/api/communities/${communityId}/stickers`, ownerToken)).body as any[];
    assert.ok(after.length <= 20, `Cap exceeded after 409: ${after.length} stickers`);
  });
});
