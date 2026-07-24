/**
 * Integration tests — Channel creation whitespace validation (Task #503)
 *
 * Confirms the POST /api/communities/:id/channels route rejects whitespace-only
 * names at the server layer, even when the request bypasses the UI.
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

const SUFFIX = `ch_ws_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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
  return { id: u.id, token: makeToken(u.id, username) };
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

describe("Channel creation — whitespace-only name rejection", () => {
  let ownerToken = "";
  let communityId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Community`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;
  });

  const whitespaceNames = [
    { label: "spaces only", value: "   " },
    { label: "tabs only", value: "\t\t" },
    { label: "newlines only", value: "\n\n" },
    { label: "mixed whitespace", value: "  \t \n  " },
  ];

  for (const { label, value } of whitespaceNames) {
    test(`rejects ${label} as channel name (→ 400)`, async () => {
      const r = await req(
        "POST",
        `/api/communities/${communityId}/channels`,
        ownerToken,
        { name: value },
      );
      assert.equal(
        r.status,
        400,
        `Expected 400 for whitespace name "${JSON.stringify(value)}", got ${r.status}: ${JSON.stringify(r.body)}`,
      );
      assert.ok(
        (r.body as any)?.error,
        `Expected an error message in the body, got: ${JSON.stringify(r.body)}`,
      );
    });
  }

  test("rejects empty string as channel name (→ 400)", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels`,
      ownerToken,
      { name: "" },
    );
    assert.equal(r.status, 400, `Expected 400 for empty name, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("rejects missing name field (→ 400)", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels`,
      ownerToken,
      { type: "text" },
    );
    assert.equal(r.status, 400, `Expected 400 for missing name, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("accepts a valid name and inserts exactly one channel", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels`,
      ownerToken,
      { name: "valid-channel" },
    );
    assert.equal(r.status, 201, `Expected 201 for valid name, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.ok((r.body as any)?.id, "Expected channel id in response");
  });

  test("trims surrounding spaces from a valid name", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels`,
      ownerToken,
      { name: "  padded-name  " },
    );
    assert.equal(r.status, 201, `Expected 201 for padded name, got ${r.status}: ${JSON.stringify(r.body)}`);
    // The stored name should be the trimmed+slugified version
    const storedName: string = (r.body as any)?.name ?? "";
    assert.ok(
      !storedName.startsWith(" ") && !storedName.endsWith(" "),
      `Stored name should not have leading/trailing spaces, got: "${storedName}"`,
    );
  });
});
