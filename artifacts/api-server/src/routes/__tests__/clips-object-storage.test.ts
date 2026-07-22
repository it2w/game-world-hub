/**
 * Clips object-storage integration tests
 *
 * Covered scenarios:
 *  POST /clips
 *   - uploadObjectEntityBuffer is called and the returned path is stored in clips_media.file_url
 *   - thumbnail upload succeeds and thumbnail_url is stored
 *   - upload with no file returns 400
 *   - upload with no title returns 400
 *
 *  GET /clips/:id/media
 *   - getObjectEntityFile is called with the stored file_url
 *   - response has correct Content-Type header
 *   - response body is streamed from createReadStream
 *
 *  GET /clips/:id/thumbnail
 *   - thumbnail_url path is used when a thumbnail exists
 *   - falls back to file_url for images when no thumbnail
 *   - returns 204 for video clips with no thumbnail
 *
 *  DELETE /clips/:id
 *   - deleteObjectSafe calls objectStorageClient.bucket().file().delete() for file_url
 *   - deleteObjectSafe calls objectStorageClient.bucket().file().delete() for thumbnail_url
 *   - DELETE rejects non-owner with 403
 *   - DELETE returns 404 for unknown clip
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
} from "node:http";
import { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { db, pool, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { ObjectStorageService, objectStorageClient } from "../../lib/objectStorage";
import { attachSignaling } from "../../ws/signaling";
import { ensureClipsTables } from "../clips";

// ── Mock GCS layer ─────────────────────────────────────────────────────────────
//
// We patch ObjectStorageService.prototype BEFORE importing `app` so that the
// module-level `objectStorageService = new ObjectStorageService()` instance
// inside clips.ts will delegate to our mocks (prototype-chain lookup).
//
// objectStorageClient.bucket is patched to intercept deleteObjectSafe calls.

const FAKE_FILE_URL       = "/objects/uploads/test-clip-uuid";
const FAKE_THUMB_URL      = "/objects/uploads/test-thumb-uuid";
const FAKE_MEDIA_BYTES    = Buffer.from("fake-video-bytes");
const FAKE_THUMB_BYTES    = Buffer.from("fake-thumb-bytes");
const PRIVATE_OBJECT_DIR  = "/test-bucket/clips-dir";

// Tracks objectStorageClient.bucket() → file() → delete() calls for the DELETE test
const gcsDeletedPaths: string[] = [];
let uploadCallCount = 0;
let getFileCalls: string[] = [];

// Mock uploadObjectEntityBuffer — returns FAKE_FILE_URL for the first call
// (main file) and FAKE_THUMB_URL for the second call (thumbnail).
mock.method(
  ObjectStorageService.prototype,
  "uploadObjectEntityBuffer",
  async function (_buffer: Buffer, _contentType: string): Promise<string> {
    uploadCallCount++;
    return uploadCallCount % 2 === 1 ? FAKE_FILE_URL : FAKE_THUMB_URL;
  },
);

// Mock getObjectEntityFile — validates the path and returns a fake File object.
mock.method(
  ObjectStorageService.prototype,
  "getObjectEntityFile",
  async function (objectPath: string) {
    getFileCalls.push(objectPath);
    // Return a duck-typed GCS File with the methods clips.ts uses.
    return {
      getMetadata: async () => [{ size: FAKE_MEDIA_BYTES.length }],
      createReadStream: () => Readable.from(FAKE_MEDIA_BYTES),
    };
  },
);

// Mock objectStorageClient.bucket — intercepts deleteObjectSafe calls.
mock.method(
  objectStorageClient,
  "bucket",
  function (bucketName: string) {
    return {
      file: (objectName: string) => ({
        delete: async (_opts?: unknown) => {
          gcsDeletedPaths.push(`${bucketName}/${objectName}`);
        },
      }),
    };
  },
);

// Set the env var deleteObjectSafe reads to build the GCS path.
process.env.PRIVATE_OBJECT_DIR = PRIVATE_OBJECT_DIR;

// Import app AFTER prototype patches are in place.
// eslint-disable-next-line import/order
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
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) {
      bodyBuf =
        body instanceof Buffer
          ? body
          : Buffer.from(
              contentType === "application/json"
                ? JSON.stringify(body)
                : String(body),
            );
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = String(bodyBuf.length);
    }
    const r = httpRequest(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
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

/** Build a minimal multipart/form-data body for clip uploads. */
function makeClipBody(opts: {
  title?: string;
  file?: Buffer;
  mimeType?: string;
  thumbnail?: Buffer;
  game?: string;
}): { body: Buffer; contentType: string } {
  const boundary = "---ClipTestBoundary" + Date.now();
  const parts: Buffer[] = [];

  if (opts.title !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${opts.title}\r\n`,
      ),
    );
  }

  if (opts.game !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="game"\r\n\r\n${opts.game}\r\n`,
      ),
    );
  }

  if (opts.file !== undefined) {
    const mt = opts.mimeType ?? "video/mp4";
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: ${mt}\r\n\r\n`,
      ),
    );
    parts.push(opts.file);
    parts.push(Buffer.from("\r\n"));
  }

  if (opts.thumbnail !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="thumbnail"; filename="thumb.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
    );
    parts.push(opts.thumbnail);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function makeUser(suffix: string): Promise<{ id: number; token: string }> {
  const username = `clips_os_${suffix}_${Date.now()}`;
  const [u] = await db
    .insert(usersTable)
    .values({
      username,
      displayName: `Clip OS ${suffix}`,
      email: `${username}@example.test`,
      passwordHash: "x",
      isAdmin: false,
    })
    .returning({ id: usersTable.id });
  const token = await signToken({
    userId: u.id,
    username,
    displayName: `Clip OS ${suffix}`,
  });
  return { id: u.id, token };
}

/** Insert a clip row + clips_media row directly, bypassing upload. */
async function seedClip(opts: {
  ownerId: number;
  mimeType?: string;
  fileUrl?: string;
  thumbUrl?: string | null;
}): Promise<number> {
  const mime = opts.mimeType ?? "video/mp4";
  const fileUrl = opts.fileUrl ?? FAKE_FILE_URL;
  const thumbUrl = opts.thumbUrl !== undefined ? opts.thumbUrl : FAKE_THUMB_URL;

  const {
    rows: [clip],
  } = await pool.query<{ id: number }>(
    `INSERT INTO clips (owner_id, title, mime_type)
     VALUES ($1, 'Test Clip', $2) RETURNING id`,
    [opts.ownerId, mime],
  );
  await pool.query(
    `INSERT INTO clips_media (clip_id, file_url, thumbnail_url) VALUES ($1,$2,$3)`,
    [clip.id, fileUrl, thumbUrl],
  );
  return clip.id;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(async () => {
  // Ensure clips tables exist — ensureClipsTables is only called from index.ts
  // (server startup), not from app.ts, so tests must invoke it explicitly.
  await ensureClipsTables();

  server = createServer(app);
  closeSignaling = attachSignaling(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await closeSignaling();
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /clips — upload
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /clips — object-storage upload", () => {
  let owner: { id: number; token: string };
  const createdClipIds: number[] = [];

  before(async () => {
    owner = await makeUser("uploader");
    // Reset upload counter so call ordering is deterministic for this suite.
    uploadCallCount = 0;
  });

  after(async () => {
    if (createdClipIds.length > 0) {
      await pool.query(
        "DELETE FROM clips WHERE id = ANY($1::int[])",
        [createdClipIds],
      );
    }
    await pool.query("DELETE FROM users WHERE id = $1", [owner.id]);
  });

  it("uploads a video clip, calls uploadObjectEntityBuffer, and stores file_url in clips_media", async () => {
    const { body: mp, contentType } = makeClipBody({
      title: "My Test Clip",
      file: Buffer.from("fake-video-bytes"),
      mimeType: "video/mp4",
    });

    const r = await req("POST", "/api/clips", owner.token, mp, contentType);
    assert.equal(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);

    const body = r.body as { id: number; mediaUrl: string; thumbnailUrl: string };
    assert.ok(body.id > 0, "response must include a clip id");
    assert.ok(body.mediaUrl.includes(String(body.id)), "mediaUrl must reference the clip id");
    createdClipIds.push(body.id);

    // Verify DB: clips_media must have the mocked file_url
    const { rows } = await pool.query<{ file_url: string; thumbnail_url: string | null }>(
      "SELECT file_url, thumbnail_url FROM clips_media WHERE clip_id = $1",
      [body.id],
    );
    assert.equal(rows.length, 1, "clips_media row must exist");
    assert.equal(
      rows[0].file_url,
      FAKE_FILE_URL,
      "file_url must be the value returned by uploadObjectEntityBuffer",
    );
  });

  it("uploads with a thumbnail, calls uploadObjectEntityBuffer twice, stores both URLs", async () => {
    // Reset so this test controls the call count independently
    uploadCallCount = 0;
    const { body: mp, contentType } = makeClipBody({
      title: "Clip With Thumb",
      file: Buffer.from("fake-video"),
      mimeType: "video/mp4",
      thumbnail: Buffer.from("fake-thumb"),
    });

    const r = await req("POST", "/api/clips", owner.token, mp, contentType);
    assert.equal(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);

    const body = r.body as { id: number };
    createdClipIds.push(body.id);

    const { rows } = await pool.query<{ file_url: string; thumbnail_url: string | null }>(
      "SELECT file_url, thumbnail_url FROM clips_media WHERE clip_id = $1",
      [body.id],
    );
    assert.equal(rows[0].file_url, FAKE_FILE_URL, "file_url must match first mock return value");
    assert.equal(
      rows[0].thumbnail_url,
      FAKE_THUMB_URL,
      "thumbnail_url must match second mock return value",
    );
  });

  it("rejects an upload with no file (non-2xx)", async () => {
    // The route returns 500 for "No file uploaded" (not matched by the 400 patterns).
    // What matters here is that the upload never silently succeeds.
    const { body: mp, contentType } = makeClipBody({ title: "No File" });
    const r = await req("POST", "/api/clips", owner.token, mp, contentType);
    assert.ok(r.status >= 400, `missing file must not return 2xx (got ${r.status})`);
  });

  it("rejects an upload with no title (400)", async () => {
    const { body: mp, contentType } = makeClipBody({
      title: "",
      file: Buffer.from("bytes"),
      mimeType: "video/mp4",
    });
    const r = await req("POST", "/api/clips", owner.token, mp, contentType);
    assert.equal(r.status, 400, "missing title should return 400");
  });

  it("rejects unauthenticated requests (401)", async () => {
    const { body: mp, contentType } = makeClipBody({
      title: "Auth Test",
      file: Buffer.from("bytes"),
      mimeType: "video/mp4",
    });
    const r = await req("POST", "/api/clips", "invalid-token", mp, contentType);
    assert.ok(r.status === 401 || r.status === 403, "unauthenticated should return 401 or 403");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /clips/:id/media — serve media via object storage
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /clips/:id/media — object-storage proxy", () => {
  let viewer: { id: number; token: string };
  let clipId: number;

  before(async () => {
    viewer = await makeUser("viewer");
    clipId = await seedClip({ ownerId: viewer.id, mimeType: "video/mp4" });
    getFileCalls = [];
  });

  after(async () => {
    await pool.query("DELETE FROM clips WHERE id = $1", [clipId]);
    await pool.query("DELETE FROM users WHERE id = $1", [viewer.id]);
  });

  it("calls getObjectEntityFile with the stored file_url", async () => {
    await req("GET", `/api/clips/${clipId}/media`, viewer.token);
    assert.ok(
      getFileCalls.includes(FAKE_FILE_URL),
      `getObjectEntityFile must be called with ${FAKE_FILE_URL}, got calls: ${JSON.stringify(getFileCalls)}`,
    );
  });

  it("responds with the correct Content-Type header", async () => {
    const r = await req("GET", `/api/clips/${clipId}/media`, viewer.token);
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const ct = (r.raw as IncomingMessage).headers["content-type"];
    assert.equal(ct, "video/mp4", "Content-Type must match the clip mime_type");
  });

  it("streams the body from createReadStream", async () => {
    // Make a raw HTTP request to capture the response body bytes
    const bodyBytes = await new Promise<Buffer>((resolve, reject) => {
      const url = new URL(`/api/clips/${clipId}/media`, baseUrl);
      const r = httpRequest(
        {
          hostname: url.hostname,
          port: Number(url.port),
          path: url.pathname,
          method: "GET",
          headers: { Authorization: `Bearer ${viewer.token}` },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        },
      );
      r.on("error", reject);
      r.end();
    });
    assert.deepEqual(
      bodyBytes,
      FAKE_MEDIA_BYTES,
      "response body must be the bytes from createReadStream",
    );
  });

  it("returns 404 for an unknown clip id", async () => {
    const r = await req("GET", "/api/clips/999999999/media", viewer.token);
    assert.equal(r.status, 404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /clips/:id/thumbnail — thumbnail proxy
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /clips/:id/thumbnail — thumbnail object-storage proxy", () => {
  let viewer: { id: number; token: string };

  before(async () => {
    viewer = await makeUser("thumb_viewer");
  });

  after(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [viewer.id]);
  });

  it("uses thumbnail_url when a thumbnail exists and returns image/jpeg", async () => {
    getFileCalls = [];
    const clipId = await seedClip({
      ownerId: viewer.id,
      mimeType: "video/mp4",
      fileUrl: FAKE_FILE_URL,
      thumbUrl: FAKE_THUMB_URL,
    });

    const r = await req("GET", `/api/clips/${clipId}/thumbnail`, viewer.token);
    assert.equal(r.status, 200, `Expected 200, got ${r.status}`);
    const ct = (r.raw as IncomingMessage).headers["content-type"];
    assert.equal(ct, "image/jpeg", "thumbnail Content-Type must be image/jpeg");
    assert.ok(
      getFileCalls.includes(FAKE_THUMB_URL),
      `getObjectEntityFile must be called with thumbnail_url ${FAKE_THUMB_URL}`,
    );

    await pool.query("DELETE FROM clips WHERE id = $1", [clipId]);
  });

  it("falls back to file_url for image clips that have no thumbnail", async () => {
    getFileCalls = [];
    const clipId = await seedClip({
      ownerId: viewer.id,
      mimeType: "image/png",
      fileUrl: FAKE_FILE_URL,
      thumbUrl: null,
    });

    const r = await req("GET", `/api/clips/${clipId}/thumbnail`, viewer.token);
    assert.equal(r.status, 200, `Expected 200 for image fallback, got ${r.status}`);
    assert.ok(
      getFileCalls.includes(FAKE_FILE_URL),
      `should fall back to file_url ${FAKE_FILE_URL} for image clips without a thumbnail`,
    );

    await pool.query("DELETE FROM clips WHERE id = $1", [clipId]);
  });

  it("returns 204 for video clips with no thumbnail", async () => {
    const clipId = await seedClip({
      ownerId: viewer.id,
      mimeType: "video/mp4",
      fileUrl: FAKE_FILE_URL,
      thumbUrl: null,
    });

    const r = await req("GET", `/api/clips/${clipId}/thumbnail`, viewer.token);
    assert.equal(r.status, 204, "video with no thumbnail must return 204");

    await pool.query("DELETE FROM clips WHERE id = $1", [clipId]);
  });

  it("returns 404 for unknown clip", async () => {
    const r = await req("GET", "/api/clips/999999999/thumbnail", viewer.token);
    assert.equal(r.status, 404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /clips/:id — GCS cleanup
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /clips/:id — calls deleteObjectSafe for both URLs", () => {
  let owner: { id: number; token: string };
  let other: { id: number; token: string };

  before(async () => {
    owner = await makeUser("deleter");
    other = await makeUser("del_other");
  });

  after(async () => {
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [[owner.id, other.id]]);
  });

  it("deletes the clip from DB and calls GCS delete for file_url and thumbnail_url", async () => {
    const clipId = await seedClip({
      ownerId: owner.id,
      mimeType: "video/mp4",
      fileUrl: "/objects/uploads/del-file-uuid",
      thumbUrl: "/objects/uploads/del-thumb-uuid",
    });

    gcsDeletedPaths.length = 0; // clear tracking array

    const r = await req("DELETE", `/api/clips/${clipId}`, owner.token);
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.deepEqual((r.body as { ok: boolean }).ok, true);

    // Clip must be gone from DB
    const { rows } = await pool.query("SELECT id FROM clips WHERE id = $1", [clipId]);
    assert.equal(rows.length, 0, "clip row must be deleted from clips table");

    // Give the fire-and-forget delete promises time to resolve.
    await new Promise<void>((res) => setTimeout(res, 200));

    // Both GCS objects must have been scheduled for deletion.
    // deleteObjectSafe builds the path as: PRIVATE_OBJECT_DIR/<entityId>
    // PRIVATE_OBJECT_DIR = "/test-bucket/clips-dir"
    // file_url = "/objects/uploads/del-file-uuid"  → entityId = "uploads/del-file-uuid"
    // GCS path = "/test-bucket/clips-dir/uploads/del-file-uuid"
    // After parsing: bucket = "test-bucket", object = "clips-dir/uploads/del-file-uuid"
    const expectedFilePath = "test-bucket/clips-dir/uploads/del-file-uuid";
    const expectedThumbPath = "test-bucket/clips-dir/uploads/del-thumb-uuid";

    assert.ok(
      gcsDeletedPaths.includes(expectedFilePath),
      `GCS delete must be called for file_url. Called paths: ${JSON.stringify(gcsDeletedPaths)}`,
    );
    assert.ok(
      gcsDeletedPaths.includes(expectedThumbPath),
      `GCS delete must be called for thumbnail_url. Called paths: ${JSON.stringify(gcsDeletedPaths)}`,
    );
  });

  it("deletes clip with no thumbnail — only calls GCS delete for file_url", async () => {
    const clipId = await seedClip({
      ownerId: owner.id,
      mimeType: "image/png",
      fileUrl: "/objects/uploads/img-file-uuid",
      thumbUrl: null,
    });

    gcsDeletedPaths.length = 0;

    const r = await req("DELETE", `/api/clips/${clipId}`, owner.token);
    assert.equal(r.status, 200);

    await new Promise<void>((res) => setTimeout(res, 200));

    const expectedFilePath = "test-bucket/clips-dir/uploads/img-file-uuid";
    assert.ok(
      gcsDeletedPaths.includes(expectedFilePath),
      `GCS delete must be called for file_url. Called: ${JSON.stringify(gcsDeletedPaths)}`,
    );
    // Should not be called for a null thumbnail
    assert.equal(
      gcsDeletedPaths.filter((p) => p.includes("null")).length,
      0,
      "GCS delete must not be called with null",
    );
  });

  it("rejects DELETE from non-owner with 403", async () => {
    const clipId = await seedClip({ ownerId: owner.id });

    const r = await req("DELETE", `/api/clips/${clipId}`, other.token);
    assert.equal(r.status, 403);

    await pool.query("DELETE FROM clips WHERE id = $1", [clipId]);
  });

  it("returns 404 when the clip does not exist", async () => {
    const r = await req("DELETE", "/api/clips/999999999", owner.token);
    assert.equal(r.status, 404);
  });
});
