/**
 * Integration tests — Task #201
 * Confirms that GET /global-chat/gif-search returns HTTP 200 + [] under every
 * failure mode: absent/revoked key, network error, non-2xx Giphy response,
 * rate-limit 429.  Also covers the happy-path shape.
 *
 * Note on GIPHY_KEY module-load constraint
 * ─────────────────────────────────────────
 * GIPHY_KEY is captured as a module-level constant at import time
 * (`const GIPHY_KEY = process.env.GIPHY_API_KEY ?? ""`).  Because the Node.js
 * test runner shares the module cache across sequentially-run test files, we
 * cannot unset the env var after the module is already cached.
 *
 * The "absent key" branch (`if (!q || !GIPHY_KEY) { res.json([]); return; }`)
 * is therefore exercised here via the empty-query path (`?q=`), which hits the
 * identical early-return.  The "revoked/bad key" scenario is covered by mocking
 * globalThis.fetch to return a 401, which is what Giphy sends for invalid keys;
 * the catch-all returns [] with no 5xx.
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
import { inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import app from "../../app";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUFFIX = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let server:  Server;
let baseUrl: string;

let userId   = 0;
let username = "";

const createdUserIds: number[] = [];

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function get(
  path: string,
): Promise<{ status: number; body: unknown }> {
  const token = signToken({ userId, username });
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const r = httpRequest(
      {
        hostname: url.hostname,
        port:     url.port,
        path:     url.pathname + url.search,
        method:   "GET",
        headers:  { Authorization: `Bearer ${token}` },
      },
      (res: IncomingMessage) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (!data) { resolve({ status: res.statusCode ?? 0, body: null }); return; }
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

before(async () => {
  // Wait for global-chat DDL (ensureTables runs on import)
  for (let i = 0; i < 40; i++) {
    try {
      await pool.query(`SELECT channel FROM global_chat_messages LIMIT 0`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const [u] = await db
    .insert(usersTable)
    .values([{
      username:     `gcgs_u_${SUFFIX}`,
      passwordHash: "x",
      displayName:  "GifSearchUser",
      isPro:        true,
      status:       "online" as const,
    }])
    .returning({ id: usersTable.id, username: usersTable.username });

  userId   = u.id;
  username = u.username;
  createdUserIds.push(u.id);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  // Restore fetch in case any test left it mocked
  globalThis.fetch = originalFetch;

  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /global-chat/gif-search — absent / revoked key", () => {
  test("empty query string returns 200 [] (hits the same early-return as absent GIPHY_KEY)", async () => {
    // ?q= is empty → the route does: if (!q || !GIPHY_KEY) { res.json([]); return; }
    const res = await get("/global-chat/gif-search?q=");
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body), "expected an array");
    assert.equal((res.body as unknown[]).length, 0, "expected empty array for missing query");
  });

  test("revoked key (Giphy returns 401 JSON) → 200 []", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ message: "Invalid authentication credentials." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    try {
      const res = await get("/global-chat/gif-search?q=cats");
      assert.equal(res.status, 200, `expected 200 got ${res.status}`);
      assert.ok(Array.isArray(res.body), "body should be an array");
      assert.equal((res.body as unknown[]).length, 0, "expected empty array for revoked key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("GET /global-chat/gif-search — other failure modes", () => {
  test("network error (fetch throws) → 200 []", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };

    try {
      const res = await get("/global-chat/gif-search?q=dogs");
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.body), "body should be array");
      assert.equal((res.body as unknown[]).length, 0, "expected [] on network error");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rate-limit 429 from Giphy → 200 []", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ message: "Too Many Requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );

    try {
      const res = await get("/global-chat/gif-search?q=fire");
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.body));
      assert.equal((res.body as unknown[]).length, 0, "expected [] on rate-limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Giphy 500 → 200 []", async () => {
    globalThis.fetch = async () =>
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });

    try {
      const res = await get("/global-chat/gif-search?q=explosion");
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.body));
      assert.equal((res.body as unknown[]).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Giphy returns malformed JSON → 200 []", async () => {
    globalThis.fetch = async () =>
      new Response("not-json{{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const res = await get("/global-chat/gif-search?q=boom");
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.body));
      assert.equal((res.body as unknown[]).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("GET /global-chat/gif-search — happy path", () => {
  test("valid Giphy response returns shaped gif objects", async () => {
    const mockGiphyResponse = {
      data: [
        {
          id: "abc123",
          images: {
            fixed_height:       { url: "https://media.giphy.com/media/abc123/giphy.gif", width: "200", height: "150" },
            fixed_height_small: { url: "https://media.giphy.com/media/abc123/giphy-downsized-small.gif" },
          },
        },
        {
          id: "def456",
          images: {
            fixed_height:       { url: "https://media.giphy.com/media/def456/giphy.gif", width: "200", height: "150" },
            fixed_height_small: { url: "https://media.giphy.com/media/def456/giphy-downsized-small.gif" },
          },
        },
      ],
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockGiphyResponse), {
        status:  200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const res = await get("/global-chat/gif-search?q=gaming");
      assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(Array.isArray(res.body), "body should be an array");

      const gifs = res.body as Array<{ id: string; url: string; previewUrl: string }>;
      assert.equal(gifs.length, 2, "expected 2 gif results");

      for (const gif of gifs) {
        assert.ok(typeof gif.id         === "string" && gif.id.length > 0,         "each gif must have an id");
        assert.ok(typeof gif.url        === "string" && gif.url.length > 0,        "each gif must have a url");
        assert.ok(typeof gif.previewUrl === "string" && gif.previewUrl.length > 0, "each gif must have a previewUrl");
      }

      assert.equal(gifs[0].id,         "abc123");
      assert.equal(gifs[0].url,        "https://media.giphy.com/media/abc123/giphy.gif");
      assert.equal(gifs[0].previewUrl, "https://media.giphy.com/media/abc123/giphy-downsized-small.gif");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Giphy response with missing fixed_height_small falls back to fixed_height url for previewUrl", async () => {
    const mockResponse = {
      data: [{
        id: "ghi789",
        images: {
          fixed_height:       { url: "https://media2.giphy.com/media/ghi789/giphy.gif", width: "200", height: "150" },
          fixed_height_small: { url: "" }, // empty — should fall back
        },
      }],
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockResponse), {
        status:  200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const res = await get("/global-chat/gif-search?q=fallback");
      assert.equal(res.status, 200);
      const gifs = res.body as Array<{ id: string; url: string; previewUrl: string }>;
      assert.equal(gifs.length, 1);
      assert.equal(gifs[0].previewUrl, "https://media2.giphy.com/media/ghi789/giphy.gif",
        "previewUrl should fall back to fixed_height url when fixed_height_small is empty");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Giphy response with empty data array returns 200 []", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [] }), {
        status:  200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const res = await get("/global-chat/gif-search?q=nothing");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal((res.body as unknown[]).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
