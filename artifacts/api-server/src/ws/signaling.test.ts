import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, partiesTable, partyMembersTable, pool } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import { attachSignaling } from "./signaling";

/**
 * Integration tests for the WebRTC signaling authorization boundary.
 *
 * These protect the rule that keeps voice conversations private:
 *   - `party:<id>` rooms require current party membership (checked in the DB)
 *   - `call:<id>` rooms require being the caller or target of that call
 *
 * Everything here is signaling-only — no real audio/video is involved. We
 * connect to the WebSocket with valid JWTs and assert who is allowed to join
 * and whose signaling frames get relayed.
 */

// ─── Test fixtures ─────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

// Populated in `before`.
let memberA = 0; // party member
let memberB = 0; // party member
let outsider = 0; // NOT a party member
let partyId = 0;

const createdUserIds: number[] = [];

function u(name: string) {
  return {
    username: `sigtest_${name}_${SUFFIX}`,
    passwordHash: "x",
    displayName: `SigTest ${name}`,
    status: "online" as const,
  };
}

before(async () => {
  const [a, b, c] = await db
    .insert(usersTable)
    .values([u("a"), u("b"), u("c")])
    .returning({ id: usersTable.id });
  memberA = a.id;
  memberB = b.id;
  outsider = c.id;
  createdUserIds.push(memberA, memberB, outsider);

  const [party] = await db
    .insert(partiesTable)
    .values({ name: `SigTest Party ${SUFFIX}`, leaderId: memberA, isPublic: false })
    .returning({ id: partiesTable.id });
  partyId = party.id;

  await db.insert(partyMembersTable).values([
    { partyId, userId: memberA },
    { partyId, userId: memberB },
  ]);

  server = createServer();
  attachSignaling(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${port}/api/ws`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // party_members / parties cascade from the users, but delete explicitly so a
  // failed run mid-way still cleans up.
  await db.delete(partyMembersTable).where(eq(partyMembersTable.partyId, partyId));
  await db.delete(partiesTable).where(eq(partiesTable.id, partyId));
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

// ─── WebSocket test helpers ────────────────────────────────────────────────

type Msg = Record<string, any>;

/** A test client that buffers incoming messages and lets tests await them. */
class TestClient {
  ws: WebSocket;
  private queue: Msg[] = [];
  private waiters: Array<(m: Msg) => void> = [];

  constructor(userId: number, username: string) {
    const token = signToken({ userId, username });
    this.ws = new WebSocket(`${baseUrl}?token=${encodeURIComponent(token)}`);
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      const waiter = this.waiters.shift();
      if (waiter) waiter(msg);
      else this.queue.push(msg);
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
    // The server sends a `ready` frame immediately on connect; consume it.
    await this.waitFor((m) => m.type === "ready");
  }

  send(msg: Msg): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Resolve with the next message matching `pred`, or reject after `timeoutMs`. */
  waitFor(pred: (m: Msg) => boolean, timeoutMs = 2000): Promise<Msg> {
    const existingIdx = this.queue.findIndex(pred);
    if (existingIdx !== -1) {
      return Promise.resolve(this.queue.splice(existingIdx, 1)[0]);
    }
    return new Promise<Msg>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(onMsg);
        if (i !== -1) this.waiters.splice(i, 1);
        reject(new Error("timed out waiting for message"));
      }, timeoutMs);
      const onMsg = (m: Msg) => {
        if (pred(m)) {
          clearTimeout(timer);
          resolve(m);
        } else {
          // Not the message we want; keep waiting for the next one.
          this.waiters.push(onMsg);
        }
      };
      this.waiters.push(onMsg);
    });
  }

  /** Assert that NO message matching `pred` arrives within `windowMs`. */
  async expectNothing(pred: (m: Msg) => boolean, windowMs = 500): Promise<void> {
    await assert.rejects(this.waitFor(pred, windowMs));
  }

  close(): void {
    this.ws.close();
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("signaling authorization", () => {
  test("joining a party you belong to succeeds", async () => {
    const client = new TestClient(memberA, "sigtest_a");
    await client.open();
    client.send({ type: "join", room: `party:${partyId}` });
    const msg = await client.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(msg.type, "joined", "member should be allowed to join their party");
    assert.equal(msg.room, `party:${partyId}`);
    client.close();
  });

  test("joining a party you are NOT a member of is rejected", async () => {
    const client = new TestClient(outsider, "sigtest_c");
    await client.open();
    client.send({ type: "join", room: `party:${partyId}` });
    const msg = await client.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(msg.type, "error", "non-member must not be allowed to join the party");
    client.close();
  });

  test("joining a call room with no matching invite is rejected", async () => {
    const client = new TestClient(outsider, "sigtest_c");
    await client.open();
    client.send({ type: "join", room: `call:${memberA}-${outsider}-999999` });
    const msg = await client.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(msg.type, "error", "a call room with no invite must not be joinable");
    client.close();
  });

  test("signaling frames are not relayed on behalf of a non-member", async () => {
    const room = `party:${partyId}`;
    const a = new TestClient(memberA, "sigtest_a");
    const b = new TestClient(memberB, "sigtest_b");
    const evil = new TestClient(outsider, "sigtest_c");
    await Promise.all([a.open(), b.open(), evil.open()]);

    // Two real members join the party room.
    a.send({ type: "join", room });
    await a.waitFor((m) => m.type === "joined");
    b.send({ type: "join", room });
    await b.waitFor((m) => m.type === "joined");
    // a should learn b joined, draining that frame so it doesn't confuse later waits.
    await a.waitFor((m) => m.type === "peer-joined");

    // The outsider was rejected from the room but still tries to relay a signal
    // to member A. The server must not deliver it.
    evil.send({ type: "join", room });
    await evil.waitFor((m) => m.type === "error");
    evil.send({ type: "signal", room, to: memberA, data: { sdp: "malicious" } });

    await a.expectNothing((m) => m.type === "signal");

    a.close();
    b.close();
    evil.close();
  });

  test("both call participants can join after an invite, but an outsider cannot", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const target = new TestClient(memberB, "sigtest_b");
    const evil = new TestClient(outsider, "sigtest_c");
    await Promise.all([caller.open(), target.open(), evil.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    const incoming = await target.waitFor((m) => m.type === "incoming-call");
    const room: string = ringing.room;
    assert.equal(incoming.room, room);

    // Outsider cannot join the call room even though the invite exists.
    evil.send({ type: "join", room });
    const evilMsg = await evil.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(evilMsg.type, "error", "outsider must not join a call they are not part of");

    // Caller and target (the two authorized participants) can both join.
    caller.send({ type: "join", room });
    const callerJoined = await caller.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(callerJoined.type, "joined", "caller should join their own call room");

    target.send({ type: "join", room });
    const targetJoined = await target.waitFor((m) => m.type === "joined" || m.type === "error");
    assert.equal(targetJoined.type, "joined", "target should join the call room");

    caller.close();
    target.close();
    evil.close();
  });
});
