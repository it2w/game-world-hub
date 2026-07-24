/**
 * Integration tests — Task #474
 * Confirms that POST /api/communities/:id/invites is enforced at the API level:
 *
 *  1. Plain member (no can_invite) → 403
 *  2. Owner → 201 (always allowed, short-circuits permission check)
 *  3. Mod with a role that grants can_invite → 201
 *
 * The UI already suppresses the button for plain members; these tests confirm
 * that a direct curl/fetch to the endpoint is also rejected server-side.
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
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { attachSignaling } from "../../ws/signaling";
import app from "../../app";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUFFIX = `civg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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
  const [u] = await db
    .insert(usersTable)
    .values({ username, displayName: username, email: `${username}@test.local`, passwordHash: "x" })
    .returning({ id: usersTable.id });
  return { id: u.id, username, token: makeToken(u.id, username) };
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

describe("POST /communities/:id/invites — can_invite API guard", () => {
  let ownerToken  = "";
  let memberToken = "";
  let modToken    = "";
  let modId       = 0;
  let communityId = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_owner`);
    const member = await createUser(`${SUFFIX}_member`);
    const mod    = await createUser(`${SUFFIX}_mod`);
    ownerToken  = owner.token;
    memberToken = member.token;
    modToken    = mod.token;
    modId       = mod.id;

    // Create community
    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} Invite Guard`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    // Both member and mod join
    for (const t of [memberToken, modToken]) {
      const jr = await req("POST", `/api/communities/${communityId}/join`, t);
      assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
    }

    // Strip can_invite from @everyone so plain members cannot invite
    const rolesRes = await req("GET", `/api/communities/${communityId}/roles`, ownerToken);
    assert.equal(rolesRes.status, 200, `roles fetch: ${JSON.stringify(rolesRes.body)}`);
    const roles = Array.isArray(rolesRes.body) ? rolesRes.body : [];
    const everyone = roles.find((r: any) => r.is_default === true);
    if (everyone) {
      await req("PATCH", `/api/communities/${communityId}/roles/${everyone.id}`, ownerToken, {
        permissions: { can_post: true, can_send_media: true },
      });
    }

    // Create a role with can_invite=true and assign it to the mod user
    const roleRes = await req("POST", `/api/communities/${communityId}/roles`, ownerToken, {
      name: "InviteMod", color: "#00aaff", permissions: { can_invite: true },
    });
    assert.equal(roleRes.status, 201, `role create: ${JSON.stringify(roleRes.body)}`);
    const inviteRoleId = (roleRes.body as any).id;

    const assignRes = await req(
      "POST",
      `/api/communities/${communityId}/members/${modId}/roles/${inviteRoleId}`,
      ownerToken,
    );
    assert.ok([200, 204].includes(assignRes.status), `role assign: ${JSON.stringify(assignRes.body)}`);
  });

  test("plain member without can_invite receives 403", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, memberToken, {});
    assert.equal(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("owner always succeeds — receives 201", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, ownerToken, {});
    assert.equal(r.status, 201, `expected 201 for owner, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.ok((r.body as any).code, "response should include invite code");
  });

  test("mod with can_invite role succeeds — receives 201", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, modToken, {});
    assert.equal(r.status, 201, `expected 201 for mod, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.ok((r.body as any).code, "response should include invite code");
  });
});
