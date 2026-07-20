/**
 * Integration tests confirming that suspension is enforced at the middleware layer,
 * blocking authenticated requests to any protected endpoint, not just login.
 *
 * Representative scenarios (middleware coverage — applies to all routes behind requireAuth):
 *  - A suspended user with a valid JWT receives 403 { error: "suspended" } on GET /api/auth/me
 *  - A suspended user with a valid JWT receives 403 { error: "suspended" } on GET /api/lfg
 *  - After unsuspending the user, the same JWT grants 200 on GET /api/auth/me
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server, type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { inArray, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken } from "../middlewares/auth";
import app from "../app";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server: Server;
let baseUrl: string;

let suspendedUserId = 0;
let suspendedUsername = "";

const createdUserIds: number[] = [];

before(async () => {
  suspendedUsername = `susp_test_${SUFFIX}`;

  const [u] = await db
    .insert(usersTable)
    .values({
      username: suspendedUsername,
      passwordHash: "x",
      displayName: "Suspended Tester",
      status: "suspended",
    })
    .returning({ id: usersTable.id });

  suspendedUserId = u.id;
  createdUserIds.push(suspendedUserId);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function request(
  method: string,
  path: string,
  userId: number,
  username: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId, username });

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) {
            resolve({ status: res.statusCode ?? 0, body: null });
            return;
          }
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Suspension bypass tests ──────────────────────────────────────────────────

describe("Suspended user API access", () => {
  test("GET /auth/me returns 403 suspended for a suspended user with a valid JWT", async () => {
    const res = await request("GET", "/auth/me", suspendedUserId, suspendedUsername);
    assert.equal(res.status, 403, "suspended user should be denied with 403");
    assert.deepEqual(
      (res.body as { error: string }).error,
      "suspended",
      'response body should be { error: "suspended" }',
    );
  });

  test("GET /lfg returns 403 suspended for a suspended user with a valid JWT", async () => {
    const res = await request("GET", "/lfg", suspendedUserId, suspendedUsername);
    assert.equal(res.status, 403, "suspended user should be denied on /lfg with 403");
    assert.deepEqual(
      (res.body as { error: string }).error,
      "suspended",
      'response body should be { error: "suspended" }',
    );
  });

  test("after unsuspending, the same user can access GET /auth/me (200)", async () => {
    // Lift the suspension directly in DB (mimics the admin unsuspend action)
    await db
      .update(usersTable)
      .set({ status: "offline" })
      .where(eq(usersTable.id, suspendedUserId));

    const res = await request("GET", "/auth/me", suspendedUserId, suspendedUsername);
    assert.equal(res.status, 200, "unsuspended user should be able to access /auth/me");

    // Re-suspend so teardown order doesn't matter
    await db
      .update(usersTable)
      .set({ status: "suspended" })
      .where(eq(usersTable.id, suspendedUserId));
  });
});
