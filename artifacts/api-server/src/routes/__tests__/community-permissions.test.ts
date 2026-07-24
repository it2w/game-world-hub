/**
 * Integration tests — Community Roles & Permissions (Task #416)
 *
 * Confirms that the new fine-grained permission system is enforced at every
 * relevant API boundary:
 *
 *  1.  Owner short-circuits all permission checks (always allowed)
 *  2.  @everyone default role grants can_post to all members
 *  3.  A plain member without can_kick cannot kick another member (→ 403)
 *  4.  Granting can_kick via a role allows that member to kick (→ 204)
 *  5.  A plain member cannot create / edit / delete roles (→ 403)
 *  6.  is_admin in a role grants every permission (can_kick, can_manage_roles…)
 *  7.  can_manage_channels controls channel create / edit / delete
 *  8.  can_invite controls invite create
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

const SUFFIX = `cperm_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;
let closeSignaling: () => Promise<void>;

function makeToken(userId: number, username: string): string {
  // signToken is synchronous — it just wraps jwt.sign
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

// ── Suites ────────────────────────────────────────────────────────────────────

describe("Community permissions — owner always allowed", () => {
  let ownerToken = "";
  let communityId = 0;
  let channelId = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_oa_owner`);
    ownerToken = owner.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} OA`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "general" });
    assert.equal(chRes.status, 201, `channel create: ${JSON.stringify(chRes.body)}`);
    channelId = (chRes.body as any).id;
  });

  test("owner can create a role", async () => {
    const r = await req("POST", `/api/communities/${communityId}/roles`, ownerToken, {
      name: "Mod", color: "#ff0000", permissions: { can_kick: true },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test("owner can post messages", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels/${channelId}/messages`,
      ownerToken,
      { content: "hello from owner" },
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test("owner can create an invite", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, ownerToken, {});
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
});

describe("Community permissions — @everyone grants can_post to all members", () => {
  let ownerToken = "";
  let memberToken = "";
  let communityId = 0;
  let channelId = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_pg_owner`);
    const member = await createUser(`${SUFFIX}_pg_member`);
    ownerToken  = owner.token;
    memberToken = member.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} PG`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community create: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "chat" });
    assert.equal(chRes.status, 201, `channel create: ${JSON.stringify(chRes.body)}`);
    channelId = (chRes.body as any).id;

    const joinRes = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(joinRes.status), `join: ${JSON.stringify(joinRes.body)}`);
  });

  test("plain member can post (can_post comes from @everyone)", async () => {
    const r = await req(
      "POST",
      `/api/communities/${communityId}/channels/${channelId}/messages`,
      memberToken,
      { content: "hello" },
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
});

describe("Community permissions — can_kick enforcement", () => {
  let ownerToken  = "";
  let memberToken = "";
  let modToken    = "";
  let victimToken = "";
  let communityId = 0;
  let victimId    = 0;
  let modId       = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_kk_owner`);
    const member = await createUser(`${SUFFIX}_kk_plain`);
    const mod    = await createUser(`${SUFFIX}_kk_mod`);
    const victim = await createUser(`${SUFFIX}_kk_victim`);
    ownerToken  = owner.token;
    memberToken = member.token;
    modToken    = mod.token;
    victimToken = victim.token;
    modId       = mod.id;
    victimId    = victim.id;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} KK`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    for (const t of [memberToken, modToken, victimToken]) {
      const jr = await req("POST", `/api/communities/${communityId}/join`, t);
      assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
    }

    // Create a Moderator role with can_kick=true and assign to mod
    const roleRes = await req("POST", `/api/communities/${communityId}/roles`, ownerToken, {
      name: "Moderator", color: "#00ff00", permissions: { can_kick: true },
    });
    assert.equal(roleRes.status, 201, `role: ${JSON.stringify(roleRes.body)}`);
    const kickRoleId = (roleRes.body as any).id;

    const assignRes = await req("POST", `/api/communities/${communityId}/members/${modId}/roles/${kickRoleId}`, ownerToken);
    assert.ok([200, 204].includes(assignRes.status), `assign: ${JSON.stringify(assignRes.body)}`);
  });

  test("plain member cannot kick (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/kick/${victimId}`, memberToken);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("member with can_kick role CAN kick (204)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/kick/${victimId}`, modToken);
    assert.equal(r.status, 204, JSON.stringify(r.body));
  });
});

describe("Community permissions — can_manage_roles enforcement", () => {
  let ownerToken  = "";
  let memberToken = "";
  let communityId = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_mr_owner`);
    const member = await createUser(`${SUFFIX}_mr_plain`);
    ownerToken  = owner.token;
    memberToken = member.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} MR`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
  });

  test("plain member cannot create a role (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/roles`, memberToken, {
      name: "Hacker", color: "#ff0000", permissions: {},
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("plain member cannot reorder roles (403)", async () => {
    // get existing roles via owner
    const rolesRes = await req("GET", `/api/communities/${communityId}/roles`, ownerToken);
    assert.equal(rolesRes.status, 200, `roles: ${JSON.stringify(rolesRes.body)}`);
    const roles = rolesRes.body as any[];
    const r = await req("PATCH", `/api/communities/${communityId}/roles/reorder`, memberToken, {
      order: roles.map((role: any, i: number) => ({ id: role.id, position: i })),
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

describe("Community permissions — is_admin grants all permissions", () => {
  let ownerToken  = "";
  let adminToken  = "";
  let victimToken = "";
  let communityId = 0;
  let channelId   = 0;
  let adminId     = 0;
  let victimId    = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_ia_owner`);
    const admin  = await createUser(`${SUFFIX}_ia_admin`);
    const victim = await createUser(`${SUFFIX}_ia_victim`);
    ownerToken  = owner.token;
    adminToken  = admin.token;
    victimToken = victim.token;
    adminId     = admin.id;
    victimId    = victim.id;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} IA`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "admin-ch" });
    assert.equal(chRes.status, 201, `channel: ${JSON.stringify(chRes.body)}`);
    channelId = (chRes.body as any).id;

    for (const t of [adminToken, victimToken]) {
      const jr = await req("POST", `/api/communities/${communityId}/join`, t);
      assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
    }

    // Create admin role with is_admin=true and assign
    const roleRes = await req("POST", `/api/communities/${communityId}/roles`, ownerToken, {
      name: "Admin", color: "#ff6600", permissions: { is_admin: true },
    });
    assert.equal(roleRes.status, 201, `role: ${JSON.stringify(roleRes.body)}`);
    const adminRoleId = (roleRes.body as any).id;

    const assignRes = await req("POST", `/api/communities/${communityId}/members/${adminId}/roles/${adminRoleId}`, ownerToken);
    assert.ok([200, 204].includes(assignRes.status), `assign: ${JSON.stringify(assignRes.body)}`);
  });

  test("admin user can kick (is_admin grants can_kick)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/kick/${victimId}`, adminToken);
    assert.equal(r.status, 204, JSON.stringify(r.body));
  });

  test("admin user can create a role (is_admin grants can_manage_roles)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/roles`, adminToken, {
      name: "SubRole", color: "#aabbcc", permissions: {},
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test("admin user cannot create a channel (channel create is owner-only)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels`, adminToken, {
      name: "admin-created",
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

describe("Community permissions — can_manage_channels enforcement", () => {
  let ownerToken  = "";
  let memberToken = "";
  let communityId = 0;
  let channelId   = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_mc_owner`);
    const member = await createUser(`${SUFFIX}_mc_member`);
    ownerToken  = owner.token;
    memberToken = member.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} MC`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "protected" });
    assert.equal(chRes.status, 201, `channel: ${JSON.stringify(chRes.body)}`);
    channelId = (chRes.body as any).id;

    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);
  });

  test("plain member cannot create a channel (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels`, memberToken, { name: "hacked" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("plain member cannot edit a channel (403)", async () => {
    const r = await req("PATCH", `/api/communities/${communityId}/channels/${channelId}`, memberToken, { name: "hacked" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("plain member cannot delete a channel (403)", async () => {
    const r = await req("DELETE", `/api/communities/${communityId}/channels/${channelId}`, memberToken);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Channel create / delete — owner-only; mods with can_manage_channels cannot
// ──────────────────────────────────────────────────────────────────────────────

describe("Community permissions — channel create/delete is owner-only", () => {
  let ownerToken  = "";
  let modToken    = "";
  let communityId = 0;
  let channelId   = 0;
  let modId       = 0;

  before(async () => {
    const owner = await createUser(`${SUFFIX}_cho_owner`);
    const mod   = await createUser(`${SUFFIX}_cho_mod`);
    ownerToken  = owner.token;
    modToken    = mod.token;
    modId       = mod.id;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} CHO`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    // Create a channel (as owner) to test deletion attempts
    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "target-ch" });
    assert.equal(chRes.status, 201, `channel create: ${JSON.stringify(chRes.body)}`);
    channelId = (chRes.body as any).id;

    // Join mod and assign a role with can_manage_channels=true
    const jr = await req("POST", `/api/communities/${communityId}/join`, modToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);

    const roleRes = await req("POST", `/api/communities/${communityId}/roles`, ownerToken, {
      name: "ChannelMod", color: "#0099ff", permissions: { can_manage_channels: true },
    });
    assert.equal(roleRes.status, 201, `role: ${JSON.stringify(roleRes.body)}`);
    const roleId = (roleRes.body as any).id;

    const assignRes = await req("POST", `/api/communities/${communityId}/members/${modId}/roles/${roleId}`, ownerToken);
    assert.ok([200, 204].includes(assignRes.status), `assign: ${JSON.stringify(assignRes.body)}`);
  });

  test("mod with can_manage_channels cannot create a channel (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels`, modToken, { name: "mod-attempt" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("mod with can_manage_channels cannot delete a channel (403)", async () => {
    const r = await req("DELETE", `/api/communities/${communityId}/channels/${channelId}`, modToken);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("owner can still create a channel (201)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "owner-new-ch" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test("owner can still delete a channel (204)", async () => {
    const r = await req("DELETE", `/api/communities/${communityId}/channels/${channelId}`, ownerToken);
    assert.equal(r.status, 204, JSON.stringify(r.body));
  });

  test("mod with can_manage_channels CAN still edit a channel (200)", async () => {
    // First create a fresh channel as owner for the mod to edit
    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "editable-ch" });
    assert.equal(chRes.status, 201);
    const newCid = (chRes.body as any).id;
    const r = await req("PATCH", `/api/communities/${communityId}/channels/${newCid}`, modToken, { name: "renamed-by-mod" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
});

describe("Community permissions — can_invite enforcement", () => {
  let ownerToken  = "";
  let memberToken = "";
  let communityId = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_ci_owner`);
    const member = await createUser(`${SUFFIX}_ci_member`);
    ownerToken  = owner.token;
    memberToken = member.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} CI`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);

    // Strip can_invite from @everyone so plain members can't invite
    const rolesRes = await req("GET", `/api/communities/${communityId}/roles`, ownerToken);
    assert.equal(rolesRes.status, 200, `roles: ${JSON.stringify(rolesRes.body)}`);
    const roles = Array.isArray(rolesRes.body) ? rolesRes.body : [];
    const everyone = roles.find((r: any) => r.is_default === true);
    if (everyone) {
      await req("PATCH", `/api/communities/${communityId}/roles/${everyone.id}`, ownerToken, {
        permissions: { can_post: true, can_send_media: true },
      });
    }
  });

  test("plain member cannot create invite when @everyone lacks can_invite (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, memberToken, {});
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  test("owner can always create invite", async () => {
    const r = await req("POST", `/api/communities/${communityId}/invites`, ownerToken, {});
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Private-channel thread access — member without can_view cannot use thread APIs
// ──────────────────────────────────────────────────────────────────────────────

describe("Community thread access — private-channel guard", () => {
  let ownerToken = "";
  let memberToken = "";
  let communityId = 0;
  let publicChannelId = 0;
  let privateChannelId = 0;
  let publicMsgId = 0;
  let privateMsgId = 0;
  let publicThreadId = 0;
  let privateThreadId = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_pta_owner`);
    const member = await createUser(`${SUFFIX}_pta_member`);
    ownerToken  = owner.token;
    memberToken = member.token;

    // Community + member join
    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} PTA`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;
    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);

    // Public channel — both can post
    const pubCh = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "public-thread-ch" });
    assert.equal(pubCh.status, 201);
    publicChannelId = (pubCh.body as any).id;

    // Private channel — member does NOT get can_view
    const privCh = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "private-thread-ch", isPrivate: true });
    assert.equal(privCh.status, 201);
    privateChannelId = (privCh.body as any).id;

    // Owner posts one message in each channel and creates threads
    const pubMsg = await req("POST", `/api/communities/${communityId}/channels/${publicChannelId}/messages`, ownerToken, { content: "pub thread root" });
    assert.equal(pubMsg.status, 201);
    publicMsgId = (pubMsg.body as any).id;

    const privMsg = await req("POST", `/api/communities/${communityId}/channels/${privateChannelId}/messages`, ownerToken, { content: "priv thread root" });
    assert.equal(privMsg.status, 201);
    privateMsgId = (privMsg.body as any).id;

    // Create threads (as owner) so we have IDs to test against
    const pubThread = await req("POST", `/api/communities/${communityId}/messages/${publicMsgId}/thread`, ownerToken, {});
    assert.equal(pubThread.status, 201);
    publicThreadId = (pubThread.body as any).id;

    const privThread = await req("POST", `/api/communities/${communityId}/messages/${privateMsgId}/thread`, ownerToken, {});
    assert.equal(privThread.status, 201);
    privateThreadId = (privThread.body as any).id;
  });

  after(async () => {
    await pool.query(`DELETE FROM community_message_threads WHERE community_id = $1`, [communityId]);
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  // ── Thread create ─────────────────────────────────────────────────────────

  test("member can start a thread on a public channel message (201)", async () => {
    // Post a second message so the member has something fresh to thread
    const msg = await req("POST", `/api/communities/${communityId}/channels/${publicChannelId}/messages`, memberToken, { content: "second root" });
    assert.equal(msg.status, 201, `msg: ${JSON.stringify(msg.body)}`);
    const msgId = (msg.body as any).id;
    const r = await req("POST", `/api/communities/${communityId}/messages/${msgId}/thread`, memberToken, {});
    // May return 201 (new) or 200 (existing)
    assert.ok([200, 201].includes(r.status), `expected 200/201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("member cannot start a thread on a private-channel message they cannot view (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/messages/${privateMsgId}/thread`, memberToken, {});
    assert.equal(r.status, 403, `expected 403 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Thread list ────────────────────────────────────────────────────────────

  test("member can list threads on a public channel (200)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/channels/${publicChannelId}/threads`, memberToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  test("member cannot list threads on a private channel they cannot view (403)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/channels/${privateChannelId}/threads`, memberToken);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  // ── Thread read ────────────────────────────────────────────────────────────

  test("member can read messages of a public thread (200)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/threads/${publicThreadId}/messages`, memberToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  test("member cannot read messages of a thread in a private channel (403)", async () => {
    const r = await req("GET", `/api/communities/${communityId}/threads/${privateThreadId}/messages`, memberToken);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });

  // ── Thread post ────────────────────────────────────────────────────────────

  test("member can reply to a public thread (201)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/threads/${publicThreadId}/messages`, memberToken, { content: "reply" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  test("member cannot reply to a thread in a private channel (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/threads/${privateThreadId}/messages`, memberToken, { content: "sneaky reply" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Rules-agreement enforcement — posting blocked until member agrees
// ──────────────────────────────────────────────────────────────────────────────

describe("Community rules-agreement — posting gated until agreed", () => {
  let ownerToken = "";
  let memberToken = "";
  let communityId = 0;
  let channelId   = 0;

  before(async () => {
    const owner  = await createUser(`${SUFFIX}_ra_owner`);
    const member = await createUser(`${SUFFIX}_ra_member`);
    ownerToken  = owner.token;
    memberToken = member.token;

    const cr = await req("POST", "/api/communities", ownerToken, {
      name: `${SUFFIX} RA`, privacy: "public", gameTag: "test",
    });
    assert.equal(cr.status, 201, `community: ${JSON.stringify(cr.body)}`);
    communityId = (cr.body as any).id;

    const jr = await req("POST", `/api/communities/${communityId}/join`, memberToken);
    assert.ok([200, 201, 204].includes(jr.status), `join: ${JSON.stringify(jr.body)}`);

    const chRes = await req("POST", `/api/communities/${communityId}/channels`, ownerToken, { name: "general" });
    assert.equal(chRes.status, 201);
    channelId = (chRes.body as any).id;

    // Enable requires_agreement via the welcome PUT endpoint
    const wRes = await req("PUT", `/api/communities/${communityId}/welcome`, ownerToken, {
      welcomeMessage: "Welcome!", rulesText: "Be nice.", requiresAgreement: true,
    });
    assert.equal(wRes.status, 200, `welcome put: ${JSON.stringify(wRes.body)}`);
  });

  after(async () => {
    await pool.query(`DELETE FROM communities WHERE id = $1`, [communityId]);
  });

  test("member is blocked from posting before agreeing to rules (403)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels/${channelId}/messages`, memberToken, { content: "hi" });
    assert.equal(r.status, 403, `expected 403 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  test("member can post after agreeing to rules (201)", async () => {
    const agreeRes = await req("POST", `/api/communities/${communityId}/welcome/agree`, memberToken);
    assert.equal(agreeRes.status, 200, `agree: ${JSON.stringify(agreeRes.body)}`);

    const r = await req("POST", `/api/communities/${communityId}/channels/${channelId}/messages`, memberToken, { content: "agreed!" });
    assert.equal(r.status, 201, `post after agree: ${JSON.stringify(r.body)}`);
  });

  test("owner bypasses rules-agreement gate (201 even without agreeing)", async () => {
    const r = await req("POST", `/api/communities/${communityId}/channels/${channelId}/messages`, ownerToken, { content: "owner post" });
    assert.equal(r.status, 201, `owner post: ${JSON.stringify(r.body)}`);
  });
});
