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
 * Integration tests for the WebSocket signaling server.
 *
 * Since LiveKit Cloud now handles all media transport, this server's
 * responsibilities are scoped to:
 *   - Direct-call handshake (invite / accept / decline / cancel / ringing)
 *   - Multi-session call routing (fan-out to all callee sessions, first-wins)
 *   - Admin force-mute relay
 *   - Typing indicator relay
 *
 * Room join/leave and SDP relay have been removed — those are handled by the
 * LiveKit client SDK directly against LiveKit Cloud.
 */

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let memberA = 0;
let memberB = 0;
let outsider = 0;
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
  await db.delete(partyMembersTable).where(eq(partyMembersTable.partyId, partyId));
  await db.delete(partiesTable).where(eq(partiesTable.id, partyId));
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await pool.end();
});

// ─── WebSocket test helpers ────────────────────────────────────────────────────

type Msg = Record<string, any>;

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
    // Consume the `ready` frame sent on connect.
    await this.waitFor((m) => m.type === "ready");
  }

  send(msg: Msg): void {
    this.ws.send(JSON.stringify(msg));
  }

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
          this.waiters.push(onMsg);
        }
      };
      this.waiters.push(onMsg);
    });
  }

  async expectNothing(pred: (m: Msg) => boolean, windowMs = 500): Promise<void> {
    await assert.rejects(this.waitFor(pred, windowMs));
  }

  close(): void {
    this.ws.close();
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("direct call handshake", () => {
  test("caller receives call-ringing and target receives incoming-call", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const target = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), target.open()]);

    caller.send({ type: "call-invite", to: memberB });

    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    assert.ok(ringing.callId, "call-ringing must include a callId");
    assert.ok(ringing.room.startsWith("call:"), "call room must start with call:");

    const incoming = await target.waitFor((m) => m.type === "incoming-call");
    assert.equal(incoming.callId, ringing.callId);
    assert.equal(incoming.from.userId, memberA);

    // Clean up
    caller.send({ type: "call-cancel", callId: ringing.callId });
    caller.close();
    target.close();
  });

  test("callee accept → both sides get call-accepted with the room name", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const target = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), target.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    await target.waitFor((m) => m.type === "incoming-call");

    target.send({ type: "call-accept", callId: ringing.callId });

    const callerAccepted = await caller.waitFor((m) => m.type === "call-accepted");
    const targetAccepted = await target.waitFor((m) => m.type === "call-accepted");
    assert.equal(callerAccepted.room, ringing.room);
    assert.equal(targetAccepted.room, ringing.room);
    assert.equal(callerAccepted.by, memberB);

    caller.close();
    target.close();
  });

  test("callee decline → caller gets call-declined", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const target = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), target.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    await target.waitFor((m) => m.type === "incoming-call");

    target.send({ type: "call-decline", callId: ringing.callId });
    const declined = await caller.waitFor((m) => m.type === "call-declined");
    assert.equal(declined.by, memberB);

    caller.close();
    target.close();
  });

  test("caller cancel → target gets call-cancelled", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const target = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), target.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    await target.waitFor((m) => m.type === "incoming-call");

    caller.send({ type: "call-cancel", callId: ringing.callId });
    const cancelled = await target.waitFor((m) => m.type === "call-cancelled");
    assert.equal(cancelled.callId, ringing.callId);

    caller.close();
    target.close();
  });

  test("calling an offline user returns call-failed with reason=offline", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    await caller.open();

    // outsider is not connected — all calls to them fail immediately.
    caller.send({ type: "call-invite", to: outsider });
    const failed = await caller.waitFor((m) => m.type === "call-failed");
    assert.equal(failed.reason, "offline");

    caller.close();
  });
});

describe("multi-session direct calls", () => {
  test("invite fans out to all callee sessions", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const s1 = new TestClient(memberB, "sigtest_b");
    const s2 = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), s1.open(), s2.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    const inc1 = await s1.waitFor((m) => m.type === "incoming-call");
    const inc2 = await s2.waitFor((m) => m.type === "incoming-call");
    assert.equal(inc1.callId, ringing.callId, "session 1 must ring on the same call");
    assert.equal(inc2.callId, ringing.callId, "session 2 must ring on the same call");

    caller.send({ type: "call-cancel", callId: ringing.callId });
    caller.close();
    s1.close();
    s2.close();
  });

  test("when one session accepts, the other session is told to stop ringing", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const s1 = new TestClient(memberB, "sigtest_b");
    const s2 = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), s1.open(), s2.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    const callId: string = ringing.callId;
    await s1.waitFor((m) => m.type === "incoming-call");
    await s2.waitFor((m) => m.type === "incoming-call");

    s1.send({ type: "call-accept", callId });
    await s1.waitFor((m) => m.type === "call-accepted");
    await caller.waitFor((m) => m.type === "call-accepted");

    const cancelled = await s2.waitFor((m) => m.type === "call-cancelled");
    assert.equal(cancelled.callId, callId);

    caller.close();
    s1.close();
    s2.close();
  });

  test("when one session declines, the other stops ringing and the caller hears the decline", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const s1 = new TestClient(memberB, "sigtest_b");
    const s2 = new TestClient(memberB, "sigtest_b");
    await Promise.all([caller.open(), s1.open(), s2.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    const callId: string = ringing.callId;
    await s1.waitFor((m) => m.type === "incoming-call");
    await s2.waitFor((m) => m.type === "incoming-call");

    s2.send({ type: "call-decline", callId });

    const cancelled = await s1.waitFor((m) => m.type === "call-cancelled");
    assert.equal(cancelled.callId, callId);

    const declined = await caller.waitFor((m) => m.type === "call-declined");
    assert.equal(declined.by, memberB);

    caller.close();
    s1.close();
    s2.close();
  });

  test("a session that ignores the invite does not cancel it for the other session", async () => {
    const caller = new TestClient(memberA, "sigtest_a");
    const s1 = new TestClient(memberB, "sigtest_b"); // will ignore the invite
    const s2 = new TestClient(memberB, "sigtest_b"); // will explicitly decline
    await Promise.all([caller.open(), s1.open(), s2.open()]);

    caller.send({ type: "call-invite", to: memberB });
    const ringing = await caller.waitFor((m) => m.type === "call-ringing");
    const callId: string = ringing.callId;
    await s1.waitFor((m) => m.type === "incoming-call");
    await s2.waitFor((m) => m.type === "incoming-call");

    // s1 simply does nothing — the call must stay pending for s2.
    await caller.expectNothing(
      (m) => m.type === "call-declined" || m.type === "call-failed",
    );
    await s2.expectNothing((m) => m.type === "call-cancelled");

    // Only an explicit decline from s2 surfaces to the caller.
    s2.send({ type: "call-decline", callId });
    const declined = await caller.waitFor((m) => m.type === "call-declined");
    assert.equal(declined.by, memberB);

    caller.close();
    s1.close();
    s2.close();
  });
});
