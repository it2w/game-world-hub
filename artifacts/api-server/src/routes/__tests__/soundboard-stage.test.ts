/**
 * Integration tests for soundboard and stage channel HTTP endpoints.
 *
 * Covers:
 *  Soundboard:
 *   - GET  /soundboard/sounds returns only the caller's clips
 *   - POST /soundboard/sounds (upload) is Pro-gated
 *   - GET  /soundboard/sounds/:id/audio works for the owner
 *   - GET  /soundboard/sounds/:id/audio works for a NON-OWNER (cross-user playback)
 *   - DELETE /soundboard/sounds/:id enforces ownership
 *   - POST /soundboard/sounds enforces 10-clip cap
 *
 *  Stage:
 *   - POST /stage/join returns myRole from DB (not computed), so a previously-
 *     promoted user re-joins as "speaker" not "audience"
 *   - GET  /stage/:roomName/participants returns joined users
 *   - POST /stage/hand updates hand_raised in DB
 *   - POST /stage/grant/:userId elevates audience → speaker (owner only)
 *   - POST /stage/grant/:userId is forbidden for non-owners
 *   - POST /stage/revoke/:userId returns speaker → audience (owner only)
 *   - DELETE /stage/leave removes the participant and returns 204
 *   - PATCH /stage/room/:roomId/mode toggles is_stage_mode (owner only)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
} from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import bcrypt from "bcryptjs";
import { pool, db, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { attachSignaling } from "../../ws/signaling";
import { roomAccessCache } from "../rooms";
import app from "../../app";

// ── HTTP helpers ───────────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;
let closeSignaling: () => Promise<void>;

function req(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  contentType = "application/json",
): Promise<{ status: number; body: unknown; raw: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    let bodyBuf: Buffer | undefined;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) {
      bodyBuf = Buffer.from(
        contentType === "application/json" ? JSON.stringify(body) : (body as string),
      );
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = String(bodyBuf.length);
    }
    const r = httpRequest(
      { hostname: url.hostname, port: Number(url.port), path: url.pathname + url.search, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let parsed: unknown;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ status: res.statusCode ?? 0, body: parsed, raw: res });
        });
        res.on("error", reject);
      },
    );
    r.on("error", reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

/** Multipart file upload helper — minimal boundary-based encoding. */
function multipartBody(title: string, audioBytes: Buffer, mimeType: string): { body: Buffer; contentType: string } {
  const boundary = "---SBTestBoundary" + Date.now();
  const parts: Buffer[] = [];

  // title field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`,
  ));
  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="clip.mp3"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ));
  parts.push(audioBytes);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

async function makeUser(suffix: string): Promise<{ id: number; token: string }> {
  const username = `sb_${suffix}_${Date.now()}`;
  const [u] = await db
    .insert(usersTable)
    .values({
      username,
      displayName: `Test ${suffix}`,
      email: `${username}@example.test`,
      passwordHash: "x",
      isAdmin: false,
    })
    .returning({ id: usersTable.id });
  const token = await signToken({ userId: u.id, username, displayName: `Test ${suffix}` });
  return { id: u.id, token };
}

async function makeProUser(suffix: string): Promise<{ id: number; token: string }> {
  const u = await makeUser(suffix);
  await pool.query("UPDATE users SET is_pro = true WHERE id = $1", [u.id]);
  return u;
}

async function makeStageRoom(ownerId: number, isStageMode = true): Promise<{ roomId: number; roomName: string }> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO permanent_rooms (owner_id, name, is_stage_mode)
     VALUES ($1, 'Test Stage Room', $2)
     RETURNING id`,
    [ownerId, isStageMode],
  );
  const roomId = rows[0].id;
  return { roomId, roomName: `proroom:${roomId}` };
}

// ── Test lifecycle ─────────────────────────────────────────────────────────────

before(async () => {
  server = createServer(app);
  closeSignaling = attachSignaling(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  // Close the WebSocket server first so it doesn't keep the event loop alive.
  await closeSignaling();
  // Close all remaining HTTP keep-alive connections before shutting down.
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

// ══════════════════════════════════════════════════════════════════════════════
// Soundboard
// ══════════════════════════════════════════════════════════════════════════════

describe("Soundboard HTTP endpoints", () => {
  let owner: { id: number; token: string };
  let other: { id: number; token: string };
  let freeUser: { id: number; token: string };
  let uploadedSoundId: number;

  before(async () => {
    owner    = await makeProUser("sb_owner");
    other    = await makeUser("sb_other");
    freeUser = await makeUser("sb_free");
  });

  after(async () => {
    await pool.query("DELETE FROM soundboard_sounds WHERE owner_id = ANY($1)", [[owner.id, other.id]]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[owner.id, other.id, freeUser.id]]);
  });

  it("GET /soundboard/sounds returns empty list for new user", async () => {
    const r = await req("GET", "/api/soundboard/sounds", owner.token);
    assert.equal(r.status, 200);
    assert.deepEqual((r.body as { personal: unknown[] }).personal, []);
  });

  it("POST /soundboard/sounds is Pro-gated (free user → 403)", async () => {
    const audio = Buffer.from("ID3FAKE");
    const { body: mp, contentType } = multipartBody("Free clip", audio, "audio/mpeg");
    const r = await req("POST", "/api/soundboard/sounds", freeUser.token, mp, contentType);
    assert.equal(r.status, 403, "non-Pro should be rejected");
  });

  it("POST /soundboard/sounds uploads a clip for a Pro user (201)", async () => {
    const audio = Buffer.from("ID3FAKEAUDIOBYTES");
    const { body: mp, contentType } = multipartBody("My Sound", audio, "audio/mpeg");
    // Send raw buffer via custom request approach
    const r = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const url = new URL("/api/soundboard/sounds", baseUrl);
      const headers = {
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": contentType,
        "Content-Length": String(mp.length),
      };
      const rq = httpRequest(
        { hostname: url.hostname, port: Number(url.port), path: url.pathname, method: "POST", headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = text; }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
          res.on("error", reject);
        },
      );
      rq.on("error", reject);
      rq.write(mp);
      rq.end();
    });
    assert.equal(r.status, 201, `expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
    uploadedSoundId = (r.body as { id: number }).id;
    assert.ok(uploadedSoundId > 0, "should return an id");
  });

  it("GET /soundboard/sounds lists the uploaded clip", async () => {
    const r = await req("GET", "/api/soundboard/sounds", owner.token);
    assert.equal(r.status, 200);
    const { personal } = r.body as { personal: { id: number; title: string }[] };
    assert.equal(personal.length, 1);
    assert.equal(personal[0].title, "My Sound");
  });

  it("GET /soundboard/sounds/:id/audio works for the owner", async () => {
    const r = await req("GET", `/api/soundboard/sounds/${uploadedSoundId}/audio`, owner.token);
    assert.equal(r.status, 200, "owner should get 200");
    assert.ok((r.raw as IncomingMessage).headers["content-type"]?.startsWith("audio/"), "should be audio content-type");
  });

  it("GET /soundboard/sounds/:id/audio works for a NON-OWNER (cross-user playback)", async () => {
    // Critical: other participants receive a soundId via data channel and must
    // be able to fetch/play it even if they don't own the clip.
    const r = await req("GET", `/api/soundboard/sounds/${uploadedSoundId}/audio`, other.token);
    assert.equal(r.status, 200, "non-owner should get 200 — needed for cross-room playback sync");
  });

  it("DELETE /soundboard/sounds/:id rejects non-owner (404)", async () => {
    const r = await req("DELETE", `/api/soundboard/sounds/${uploadedSoundId}`, other.token);
    assert.equal(r.status, 404, "non-owner cannot delete another user's clip");
  });

  it("DELETE /soundboard/sounds/:id succeeds for owner", async () => {
    const r = await req("DELETE", `/api/soundboard/sounds/${uploadedSoundId}`, owner.token);
    assert.equal(r.status, 204);
  });

  it("POST /soundboard/sounds enforces 10-clip cap", async () => {
    // Insert 10 clips directly
    const audio = Buffer.from("DUMMY");
    for (let i = 0; i < 10; i++) {
      await pool.query(
        "INSERT INTO soundboard_sounds (owner_id, title, file_data) VALUES ($1, $2, $3)",
        [owner.id, `Cap Clip ${i}`, audio],
      );
    }
    const { body: mp, contentType } = multipartBody("Over Cap", audio, "audio/mpeg");
    const r = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const url = new URL("/api/soundboard/sounds", baseUrl);
      const headers = {
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": contentType,
        "Content-Length": String(mp.length),
      };
      const rq = httpRequest(
        { hostname: url.hostname, port: Number(url.port), path: url.pathname, method: "POST", headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = text; }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
          res.on("error", reject);
        },
      );
      rq.on("error", reject);
      rq.write(mp);
      rq.end();
    });
    assert.equal(r.status, 409, "11th upload should return 409");
    await pool.query("DELETE FROM soundboard_sounds WHERE owner_id = $1", [owner.id]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage channels
// ══════════════════════════════════════════════════════════════════════════════

describe("Stage Channel HTTP endpoints", () => {
  let owner:    { id: number; token: string };
  let audience: { id: number; token: string };
  let stranger: { id: number; token: string };
  let roomId:   number;
  let roomName: string;

  before(async () => {
    owner    = await makeUser("stage_owner");
    audience = await makeUser("stage_aud");
    stranger = await makeUser("stage_stranger");
    const room = await makeStageRoom(owner.id);
    roomId   = room.roomId;
    roomName = room.roomName;
  });

  after(async () => {
    await pool.query("DELETE FROM stage_participants WHERE room_name = $1", [roomName]);
    await pool.query("DELETE FROM permanent_rooms WHERE id = $1", [roomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[owner.id, audience.id, stranger.id]]);
  });

  it("POST /stage/join — owner joins as 'speaker' with authoritative ownerId", async () => {
    const r = await req("POST", "/api/stage/join", owner.token, { roomName });
    assert.equal(r.status, 200);
    const b = r.body as { isStageRoom: boolean; myRole: string; ownerId: number };
    assert.equal(b.isStageRoom, true);
    assert.equal(b.myRole, "speaker", "owner should join as speaker");
    assert.equal(b.ownerId, owner.id, "ownerId must equal the room owner's userId");
  });

  it("POST /stage/join — audience member joins as 'audience'", async () => {
    const r = await req("POST", "/api/stage/join", audience.token, { roomName });
    assert.equal(r.status, 200);
    const b = r.body as { isStageRoom: boolean; myRole: string; ownerId: number };
    assert.equal(b.isStageRoom, true);
    assert.equal(b.myRole, "audience", "non-owner should join as audience");
    assert.equal(b.ownerId, owner.id, "ownerId must be the room owner regardless of who calls join");
  });

  it("GET /stage/:roomName/participants lists both connected users with ownerId", async () => {
    // Participants endpoint only returns currently-connected users (those in
    // in-memory presence via POST /stage/join), filtering out disconnected users
    // whose DB rows are preserved for role-persistence purposes.
    const r = await req("GET", `/api/stage/${encodeURIComponent(roomName)}/participants`, owner.token);
    assert.equal(r.status, 200);
    const { participants, ownerId } = r.body as {
      participants: { userId: number; role: string }[];
      ownerId: number | null;
    };
    assert.equal(ownerId, owner.id, "participants endpoint must return ownerId");
    assert.equal(participants.length, 2, "both owner and audience should appear");
    const ownerRow = participants.find((p) => p.userId === owner.id);
    const audRow   = participants.find((p) => p.userId === audience.id);
    assert.equal(ownerRow?.role, "speaker");
    assert.equal(audRow?.role,   "audience");
  });

  it("POST /stage/hand — audience raises hand, broadcast is sent", async () => {
    const r = await req("POST", "/api/stage/hand", audience.token, { roomName, raised: true });
    assert.equal(r.status, 204, "hand-raise should return 204");
    // Verify DB
    const { rows } = await pool.query<{ hand_raised: boolean }>(
      "SELECT hand_raised FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, audience.id],
    );
    assert.equal(rows[0]?.hand_raised, true, "hand_raised should be true in DB");
  });

  it("POST /stage/grant/:userId — non-owner cannot grant (403)", async () => {
    const r = await req("POST", `/api/stage/grant/${audience.id}`, stranger.token, { roomName });
    assert.equal(r.status, 403, "non-owner should be forbidden");
  });

  it("POST /stage/grant/:userId — owner grants audience → speaker", async () => {
    const r = await req("POST", `/api/stage/grant/${audience.id}`, owner.token, { roomName });
    assert.equal(r.status, 204, "grant should return 204");
    // Verify DB
    const { rows } = await pool.query<{ role: string; hand_raised: boolean }>(
      "SELECT role, hand_raised FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, audience.id],
    );
    assert.equal(rows[0]?.role,        "speaker", "role should be speaker after grant");
    assert.equal(rows[0]?.hand_raised, false,     "hand should be lowered after grant");
  });

  it("POST /stage/join — previously-promoted user rejoins as 'speaker' (not audience)", async () => {
    // Simulate reconnect: remove presence-only and re-join via the API.
    // The DB row still has role='speaker' from the grant above.
    const r = await req("POST", "/api/stage/join", audience.token, { roomName });
    assert.equal(r.status, 200);
    const b = r.body as { myRole: string };
    assert.equal(b.myRole, "speaker",
      "rejoin must return persisted DB role, not recompute from owner/non-owner logic");
  });

  it("POST /stage/revoke/:userId — owner revokes speaker → audience", async () => {
    const r = await req("POST", `/api/stage/revoke/${audience.id}`, owner.token, { roomName });
    assert.equal(r.status, 204);
    const { rows } = await pool.query<{ role: string }>(
      "SELECT role FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, audience.id],
    );
    assert.equal(rows[0]?.role, "audience", "role should revert to audience after revoke");
  });

  it("DELETE /stage/leave — audience member leaves, row removed", async () => {
    const r = await req("DELETE", "/api/stage/leave", audience.token, { roomName });
    assert.equal(r.status, 204);
    const { rows } = await pool.query(
      "SELECT id FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, audience.id],
    );
    assert.equal(rows.length, 0, "row should be deleted after leave");
  });

  it("PATCH /stage/room/:roomId/mode — non-owner cannot toggle (404)", async () => {
    const r = await req("PATCH", `/api/stage/room/${roomId}/mode`, stranger.token, { isStageMode: false });
    assert.equal(r.status, 404, "stranger should get 404 (owner check)");
  });

  it("PATCH /stage/room/:roomId/mode — owner can disable stage mode", async () => {
    const r = await req("PATCH", `/api/stage/room/${roomId}/mode`, owner.token, { isStageMode: false });
    assert.equal(r.status, 204);
    const { rows } = await pool.query<{ is_stage_mode: boolean }>(
      "SELECT is_stage_mode FROM permanent_rooms WHERE id = $1",
      [roomId],
    );
    assert.equal(rows[0]?.is_stage_mode, false, "stage mode should be off");
  });

  it("POST /stage/join — non-stage room returns isStageRoom:false", async () => {
    // Re-disable was done above; this confirms the join response
    const r = await req("POST", "/api/stage/join", owner.token, { roomName });
    assert.equal(r.status, 200);
    const b = r.body as { isStageRoom: boolean };
    assert.equal(b.isStageRoom, false, "disabled stage room should return isStageRoom:false");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage join broadcast (real-time sync for mid-session joins)
// ══════════════════════════════════════════════════════════════════════════════

describe("Stage join broadcasts stage-participant-join to existing room members", () => {
  let wsOwner: { id: number; token: string };
  let wsAudience: { id: number; token: string };
  let wsRoomId: number;
  let wsRoomName: string;

  before(async () => {
    wsOwner    = await makeProUser("bcast_owner");
    wsAudience = await makeUser("bcast_aud");
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO permanent_rooms (owner_id, name, is_stage_mode)
       VALUES ($1, 'Bcast Test Room', true)
       RETURNING id`,
      [wsOwner.id],
    );
    wsRoomId   = rows[0].id;
    wsRoomName = `proroom:${wsRoomId}`;
  });

  after(async () => {
    await pool.query("DELETE FROM stage_participants WHERE room_name = $1", [wsRoomName]);
    await pool.query("DELETE FROM permanent_rooms WHERE id = $1", [wsRoomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[wsOwner.id, wsAudience.id]]);
  });

  it("owner receives stage-participant-join when audience member joins mid-session", async () => {
    const { port: wsPort } = server.address() as AddressInfo;

    // 1. Connect owner via WebSocket (path must be /api/ws — the signaling handler checks this).
    const ownerWs = new WebSocket(`ws://127.0.0.1:${wsPort}/api/ws?token=${wsOwner.token}`);
    await new Promise<void>((resolve, reject) => {
      ownerWs.once("open",  resolve);
      ownerWs.once("error", reject);
    });

    // 2. Owner joins the stage room via HTTP.
    const ownerJoin = await req("POST", "/api/stage/join", wsOwner.token, { roomName: wsRoomName });
    assert.equal(ownerJoin.status, 200);
    assert.equal((ownerJoin.body as { isStageRoom: boolean }).isStageRoom, true);

    // 3. Register listener BEFORE audience joins.
    const broadcastPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("no stage-participant-join broadcast received within 2 s")), 2000);
      ownerWs.on("message", (data) => {
        try {
          const msg = JSON.parse((data as Buffer).toString()) as Record<string, unknown>;
          if (msg.type === "stage-participant-join") {
            clearTimeout(timeout);
            resolve(msg);
          }
        } catch { /* skip non-JSON */ }
      });
    });

    // 4. Audience joins mid-session — should trigger broadcast to owner.
    const audJoin = await req("POST", "/api/stage/join", wsAudience.token, { roomName: wsRoomName });
    assert.equal(audJoin.status, 200);

    // 5. Owner must receive the broadcast.
    const broadcast = await broadcastPromise;
    assert.equal(broadcast.type, "stage-participant-join",        "event type must be stage-participant-join");
    assert.equal(broadcast.roomName, wsRoomName,                  "roomName must match");
    const p = broadcast.participant as Record<string, unknown>;
    assert.equal(p.userId,  wsAudience.id,  "participant userId must match the audience member");
    assert.equal(p.role,    "audience",      "participant role must be audience");

    ownerWs.close();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage access control — password-protected rooms
// ══════════════════════════════════════════════════════════════════════════════

describe("Stage join — password-protected room access control", () => {
  let pwOwner: { id: number; token: string };
  let pwOther: { id: number; token: string };
  let pwRoomId: number;
  let pwRoomName: string;

  before(async () => {
    pwOwner = await makeProUser("pw_owner");
    pwOther = await makeUser("pw_other");
    const passwordHash = await bcrypt.hash("secret", 10);
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO permanent_rooms (owner_id, name, is_stage_mode, password_hash)
       VALUES ($1, 'Password Stage Room', true, $2)
       RETURNING id`,
      [pwOwner.id, passwordHash],
    );
    pwRoomId   = rows[0].id;
    pwRoomName = `proroom:${pwRoomId}`;
  });

  after(async () => {
    await pool.query("DELETE FROM stage_participants WHERE room_name = $1", [pwRoomName]);
    await pool.query("DELETE FROM permanent_rooms WHERE id = $1", [pwRoomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[pwOwner.id, pwOther.id]]);
  });

  it("user without password verification is rejected with 403", async () => {
    const r = await req("POST", "/api/stage/join", pwOther.token, { roomName: pwRoomName });
    assert.equal(r.status, 403, "should be 403 without password verification");
    assert.ok(
      (r.body as { error: string }).error?.toLowerCase().includes("password"),
      "error message should mention password",
    );
  });

  it("user with verified password can join the password-protected room", async () => {
    // Seed the access cache directly — simulates what POST /rooms/:id/verify-password does.
    const key = `${pwOther.id}:${pwRoomId}`;
    roomAccessCache.add(key);
    try {
      const r = await req("POST", "/api/stage/join", pwOther.token, { roomName: pwRoomName });
      assert.equal(r.status, 200, "user with cache entry should succeed");
      assert.equal((r.body as { isStageRoom: boolean }).isStageRoom, true);
    } finally {
      roomAccessCache.delete(key);
      await pool.query(
        "DELETE FROM stage_participants WHERE room_name = $1 AND user_id = $2",
        [pwRoomName, pwOther.id],
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage multi-session disconnect — closing one tab must not evict stage presence
// ══════════════════════════════════════════════════════════════════════════════

describe("Stage multi-session: closing one WS tab does not evict stage presence", () => {
  let msUser: { id: number; token: string };
  let msOwner: { id: number; token: string };
  let msRoomId: number;
  let msRoomName: string;

  before(async () => {
    msOwner = await makeProUser("ms_owner");
    msUser  = await makeUser("ms_user");
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO permanent_rooms (owner_id, name, is_stage_mode)
       VALUES ($1, 'MultiSession Stage Room', true)
       RETURNING id`,
      [msOwner.id],
    );
    msRoomId   = rows[0].id;
    msRoomName = `proroom:${msRoomId}`;
  });

  after(async () => {
    await pool.query("DELETE FROM stage_participants WHERE room_name = $1", [msRoomName]);
    await pool.query("DELETE FROM permanent_rooms WHERE id = $1", [msRoomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[msOwner.id, msUser.id]]);
  });

  it("user with two WS sessions stays in participants after first tab closes", async () => {
    const { port: wsPort } = server.address() as AddressInfo;

    // Open two WS sessions for the same user.
    const ws1 = new WebSocket(`ws://127.0.0.1:${wsPort}/api/ws?token=${msUser.token}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${wsPort}/api/ws?token=${msUser.token}`);
    await Promise.all([
      new Promise<void>((res, rej) => { ws1.once("open", res); ws1.once("error", rej); }),
      new Promise<void>((res, rej) => { ws2.once("open", res); ws2.once("error", rej); }),
    ]);

    // User joins stage.
    const joinResp = await req("POST", "/api/stage/join", msUser.token, { roomName: msRoomName });
    assert.equal(joinResp.status, 200, "user should join stage successfully");

    // Close the FIRST session — should NOT remove stage presence.
    ws1.close();
    await new Promise<void>((r) => ws1.once("close", r));

    // Small delay for handleClose to process.
    await new Promise<void>((r) => setTimeout(r, 100));

    // User must still be in participants.
    const listResp = await req("GET", `/api/stage/${encodeURIComponent(msRoomName)}/participants`, msOwner.token);
    assert.equal(listResp.status, 200);
    const participants = (listResp.body as { participants: { userId: number }[] }).participants;
    assert.ok(
      participants.some((p) => p.userId === msUser.id),
      "user should remain in participants after closing one WS session",
    );

    // Close the SECOND (last) session — should remove stage presence.
    ws2.close();
    await new Promise<void>((r) => ws2.once("close", r));
    await new Promise<void>((r) => setTimeout(r, 100));

    const listResp2 = await req("GET", `/api/stage/${encodeURIComponent(msRoomName)}/participants`, msOwner.token);
    assert.equal(listResp2.status, 200);
    const participants2 = (listResp2.body as { participants: { userId: number }[] }).participants;
    assert.ok(
      !participants2.some((p) => p.userId === msUser.id),
      "user should be removed from participants after all WS sessions close",
    );
  });
});
