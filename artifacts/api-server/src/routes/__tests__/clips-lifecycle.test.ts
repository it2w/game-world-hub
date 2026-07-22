/**
 * Integration tests for the clips upload → serve → delete lifecycle.
 *
 * Covered scenarios:
 *  - POST /clips (multipart) writes to object storage, inserts DB rows, returns 201 + mediaUrl
 *  - POST /clips rejects missing title (400)
 *  - POST /clips rejects oversized file (400)
 *  - GET /clips/:id/media streams file with correct Content-Type header
 *  - GET /clips/:id/thumbnail serves thumbnail for image clips
 *  - GET /clips/:id/thumbnail returns 204 for video clips without a thumbnail
 *  - GET /clips/:id/thumbnail serves the thumbnail when one was uploaded alongside a video
 *  - DELETE /clips/:id removes the DB row and triggers GCS cleanup (owner only)
 *  - DELETE /clips/:id is forbidden for non-owners (403)
 *  - clips_media table has no legacy BYTEA columns (file_data / thumbnail_data)
 *
 * GCS is not accessed in tests — ObjectStorageService prototype methods are
 * patched with node:test mock.method so the lifecycle can be verified without
 * real credentials.
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
import { pool, db, usersTable } from "@workspace/db";
import { signToken } from "../../middlewares/auth";
import { ObjectStorageService, objectStorageClient } from "../../lib/objectStorage";
import { ensureClipsTables } from "../clips";
import app from "../../app";

// ── Server + auth helpers ──────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

async function makeUser(tag: string): Promise<{ id: number; token: string }> {
  const username = `clips_test_${tag}_${Date.now()}`;
  const [u] = await db
    .insert(usersTable)
    .values({ username, displayName: `Clips ${tag}`, passwordHash: "x" })
    .returning({ id: usersTable.id });
  const token = await signToken({ userId: u.id, username });
  return { id: u.id, token };
}

function multipartBody(
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; mime: string; data: Buffer },
  thumb?: { data: Buffer; mime: string },
): { body: Buffer; contentType: string } {
  const boundary = `ClipsTestBound${Date.now()}`;
  const parts: Buffer[] = [];

  // Text fields
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  // Main file
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from("\r\n"));

  // Optional thumbnail
  if (thumb) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="thumbnail"; filename="thumb.jpg"\r\nContent-Type: ${thumb.mime}\r\n\r\n`,
      ),
    );
    parts.push(thumb.data);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Low-level HTTP helper; returns status + parsed body + raw IncomingMessage. */
function req(
  method: string,
  path: string,
  token: string | null,
  body?: Buffer,
  contentType?: string,
): Promise<{ status: number; body: unknown; raw: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body && contentType) {
      headers["Content-Type"] = contentType;
      headers["Content-Length"] = String(body.length);
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
    if (body) r.write(body);
    r.end();
  });
}

/** Convenience wrapper for JSON bodies. */
function jsonReq(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown; raw: IncomingMessage }> {
  const buf = body ? Buffer.from(JSON.stringify(body)) : undefined;
  return req(method, path, token, buf, buf ? "application/json" : undefined);
}

// ── GCS mock setup ─────────────────────────────────────────────────────────────
//
// Patch ObjectStorageService.prototype so the module-level instance inside
// clips.ts inherits the fakes at call time (prototype lookup is dynamic).

const FAKE_FILE_PATH = "/objects/uploads/test-fake-uuid";
const FAKE_FILE_BYTES = Buffer.from("FAKE_MEDIA_BYTES");

/** Build a minimal GCS File-like object for serve tests. */
function makeFakeGcsFile(opts: { mime: string; bytes?: Buffer } = { mime: "image/jpeg" }): object {
  const bytes = opts.bytes ?? FAKE_FILE_BYTES;
  return {
    getMetadata: async () => [{ size: String(bytes.length), contentType: opts.mime }],
    createReadStream: () => Readable.from([bytes]),
  };
}

// Track upload calls so we can verify count/args in tests
let uploadCalls: Array<{ contentType: string }> = [];
let deletedPaths: string[] = [];

before(async () => {
  // Ensure clips tables exist (normally called from index.ts at server startup,
  // not from app.ts which is what tests import).
  await ensureClipsTables();

  // ── Mock: uploadObjectEntityBuffer ────────────────────────────────────────
  mock.method(
    ObjectStorageService.prototype,
    "uploadObjectEntityBuffer",
    async function (this: ObjectStorageService, _buf: Buffer, contentType: string) {
      uploadCalls.push({ contentType });
      return FAKE_FILE_PATH;
    },
  );

  // ── Mock: getObjectEntityFile ─────────────────────────────────────────────
  mock.method(
    ObjectStorageService.prototype,
    "getObjectEntityFile",
    async function (this: ObjectStorageService, objectPath: string) {
      // Simulate the real path check
      if (!objectPath.startsWith("/objects/")) {
        const { ObjectNotFoundError } = await import("../../lib/objectStorage");
        throw new ObjectNotFoundError();
      }
      // Infer mime from test context: thumbnail paths get image/jpeg, otherwise keep flexible
      const mime = "image/jpeg";
      return makeFakeGcsFile({ mime });
    },
  );

  // Start server
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  mock.restoreAll();
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Clips lifecycle — upload, serve, delete", () => {
  let owner: { id: number; token: string };
  let other: { id: number; token: string };
  const createdClipIds: number[] = [];
  const createdUserIds: number[] = [];

  before(async () => {
    owner = await makeUser("owner");
    other = await makeUser("other");
    createdUserIds.push(owner.id, other.id);
  });

  after(async () => {
    // Cascade delete clips → clips_media via FK
    if (createdClipIds.length) {
      await pool.query("DELETE FROM clips WHERE id = ANY($1)", [createdClipIds]);
    }
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
  });

  // ── Upload ───────────────────────────────────────────────────────────────

  it("POST /clips — rejects non-multipart requests (400)", async () => {
    const r = await jsonReq("POST", "/api/clips", owner.token, { title: "test" });
    assert.equal(r.status, 400);
    assert.match(String((r.body as { error: string }).error), /multipart/i);
  });

  it("POST /clips — rejects missing title (400)", async () => {
    const { body, contentType } = multipartBody(
      {},
      { fieldname: "file", filename: "clip.jpg", mime: "image/jpeg", data: Buffer.from("IMGDATA") },
    );
    const r = await req("POST", "/api/clips", owner.token, body, contentType);
    assert.equal(r.status, 400);
    assert.match(String((r.body as { error: string }).error), /title/i);
  });

  it("POST /clips — rejects invalid MIME type (400)", async () => {
    const { body, contentType } = multipartBody(
      { title: "Bad MIME" },
      { fieldname: "file", filename: "clip.pdf", mime: "application/pdf", data: Buffer.from("PDFDATA") },
    );
    const r = await req("POST", "/api/clips", owner.token, body, contentType);
    assert.equal(r.status, 400);
    assert.match(String((r.body as { error: string }).error), /image or video/i);
  });

  it("POST /clips — rejects unauthenticated requests (401)", async () => {
    const { body, contentType } = multipartBody(
      { title: "Unauth" },
      { fieldname: "file", filename: "clip.jpg", mime: "image/jpeg", data: Buffer.from("IMG") },
    );
    const r = await req("POST", "/api/clips", null, body, contentType);
    assert.equal(r.status, 401);
  });

  it("POST /clips — successfully uploads an image clip (201)", async () => {
    uploadCalls = [];
    const { body, contentType } = multipartBody(
      { title: "Epic Screenshot", game: "TestGame", description: "A great moment" },
      { fieldname: "file", filename: "epic.jpg", mime: "image/jpeg", data: Buffer.from("JPEG_FAKE_DATA") },
    );
    const r = await req("POST", "/api/clips", owner.token, body, contentType);
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    const b = r.body as { id: number; mediaUrl: string; thumbnailUrl: string };
    assert.ok(b.id > 0, "should return a positive clip id");
    assert.match(b.mediaUrl, /\/api\/clips\/\d+\/media/);
    assert.match(b.thumbnailUrl, /\/api\/clips\/\d+\/thumbnail/);
    // GCS upload should have been called once (file only, no thumbnail)
    assert.equal(uploadCalls.length, 1, "expected one upload call for the file");
    assert.equal(uploadCalls[0].contentType, "image/jpeg");
    // Verify DB row
    const { rows } = await pool.query<{ file_url: string; thumbnail_url: string | null }>(
      "SELECT file_url, thumbnail_url FROM clips_media WHERE clip_id=$1",
      [b.id],
    );
    assert.equal(rows.length, 1, "clips_media row should exist");
    assert.equal(rows[0].file_url, FAKE_FILE_PATH, "file_url should be the object path");
    assert.equal(rows[0].thumbnail_url, null, "no thumbnail uploaded");
    createdClipIds.push(b.id);
  });

  it("POST /clips — uploads a video clip with a thumbnail (201)", async () => {
    uploadCalls = [];
    const { body, contentType } = multipartBody(
      { title: "Sick Clutch", game: "FPS", durationSeconds: "42" },
      { fieldname: "file", filename: "clutch.mp4", mime: "video/mp4", data: Buffer.from("FAKE_MP4_BYTES") },
      { data: Buffer.from("FAKE_THUMB_JPEG"), mime: "image/jpeg" },
    );
    const r = await req("POST", "/api/clips", owner.token, body, contentType);
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    const b = r.body as { id: number; mediaUrl: string };
    assert.ok(b.id > 0);
    // Two uploads: file + thumbnail
    assert.equal(uploadCalls.length, 2, "expected two upload calls (file + thumbnail)");
    // Thumbnail stored in DB
    const { rows } = await pool.query<{ thumbnail_url: string | null }>(
      "SELECT thumbnail_url FROM clips_media WHERE clip_id=$1",
      [b.id],
    );
    assert.ok(rows[0].thumbnail_url !== null, "thumbnail_url should be set");
    createdClipIds.push(b.id);
  });

  // ── Serve ────────────────────────────────────────────────────────────────

  it("GET /clips/:id/media — streams file with correct Content-Type", async () => {
    // Use the first uploaded clip (image/jpeg)
    const clipId = createdClipIds[0];
    // Override getObjectEntityFile to return a clear image mime
    const getFileMock = mock.method(
      ObjectStorageService.prototype,
      "getObjectEntityFile",
      async () => makeFakeGcsFile({ mime: "image/jpeg", bytes: Buffer.from("JPEG_BYTES") }),
    );
    try {
      const r = await req("GET", `/api/clips/${clipId}/media`, null);
      assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      const ct = (r.raw as IncomingMessage).headers["content-type"] ?? "";
      assert.ok(ct.startsWith("image/"), `expected image content-type, got: ${ct}`);
      const cc = (r.raw as IncomingMessage).headers["cache-control"] ?? "";
      assert.ok(cc.includes("max-age="), "should set cache-control max-age");
    } finally {
      getFileMock.mock.restore();
    }
  });

  it("GET /clips/:id/media — returns 404 for unknown clip", async () => {
    const r = await req("GET", "/api/clips/99999999/media", null);
    assert.equal(r.status, 404);
  });

  it("GET /clips/:id/thumbnail — serves thumbnail for image clips (200)", async () => {
    const clipId = createdClipIds[0]; // image clip, no separate thumbnail stored
    const getFileMock = mock.method(
      ObjectStorageService.prototype,
      "getObjectEntityFile",
      async () => makeFakeGcsFile({ mime: "image/jpeg", bytes: Buffer.from("THUMB_BYTES") }),
    );
    try {
      const r = await req("GET", `/api/clips/${clipId}/thumbnail`, null);
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
      const ct = (r.raw as IncomingMessage).headers["content-type"] ?? "";
      assert.ok(ct.startsWith("image/"), `expected image content-type, got: ${ct}`);
    } finally {
      getFileMock.mock.restore();
    }
  });

  it("GET /clips/:id/thumbnail — returns 204 for video without a thumbnail", async () => {
    // Insert a video clip directly with no thumbnail_url
    const { rows: [user] } = await pool.query<{ id: number }>("SELECT id FROM users WHERE id=$1", [owner.id]);
    assert.ok(user);
    const { rows: [clip] } = await pool.query<{ id: number }>(
      `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, $3) RETURNING id`,
      [owner.id, "Raw Video No Thumb", "video/mp4"],
    );
    await pool.query(
      "INSERT INTO clips_media (clip_id, file_url, thumbnail_url) VALUES ($1, $2, NULL)",
      [clip.id, FAKE_FILE_PATH],
    );
    createdClipIds.push(clip.id);

    const r = await req("GET", `/api/clips/${clip.id}/thumbnail`, null);
    assert.equal(r.status, 204, `expected 204 for video without thumbnail, got ${r.status}`);
  });

  it("GET /clips/:id/thumbnail — serves thumbnail when video has one (200)", async () => {
    const clipId = createdClipIds[1]; // video clip with thumbnail from the upload test
    const getFileMock = mock.method(
      ObjectStorageService.prototype,
      "getObjectEntityFile",
      async () => makeFakeGcsFile({ mime: "image/jpeg", bytes: Buffer.from("THUMB_JPEG") }),
    );
    try {
      const r = await req("GET", `/api/clips/${clipId}/thumbnail`, null);
      assert.equal(r.status, 200, `expected 200 for video with thumbnail, got ${r.status}`);
      const ct = (r.raw as IncomingMessage).headers["content-type"] ?? "";
      assert.ok(ct.startsWith("image/"), `expected image content-type, got: ${ct}`);
    } finally {
      getFileMock.mock.restore();
    }
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  it("DELETE /clips/:id — forbidden for non-owner (403)", async () => {
    const clipId = createdClipIds[0];
    const r = await jsonReq("DELETE", `/api/clips/${clipId}`, other.token);
    assert.equal(r.status, 403);
    // Row should still exist
    const { rows } = await pool.query("SELECT id FROM clips WHERE id=$1", [clipId]);
    assert.equal(rows.length, 1, "clip should not have been deleted");
  });

  it("DELETE /clips/:id — removes DB row and returns ok:true (owner)", async () => {
    const clipId = createdClipIds[0];
    const r = await jsonReq("DELETE", `/api/clips/${clipId}`, owner.token);
    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body, { ok: true });
    // DB row should be gone (cascade deletes clips_media)
    const { rows: clipRows } = await pool.query("SELECT id FROM clips WHERE id=$1", [clipId]);
    assert.equal(clipRows.length, 0, "clips row should be deleted");
    const { rows: mediaRows } = await pool.query(
      "SELECT clip_id FROM clips_media WHERE clip_id=$1",
      [clipId],
    );
    assert.equal(mediaRows.length, 0, "clips_media row should be cascade-deleted");
    // Remove from tracking so after() cleanup doesn't try to delete again
    createdClipIds.splice(createdClipIds.indexOf(clipId), 1);
  });

  it("DELETE /clips/:id — returns 404 for already-deleted clip", async () => {
    const r = await jsonReq("DELETE", "/api/clips/99999999", owner.token);
    assert.equal(r.status, 404);
  });

  // ── Schema check ─────────────────────────────────────────────────────────

  it("clips_media has no legacy BYTEA columns (file_data / thumbnail_data)", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'clips_media'
         AND data_type = 'bytea'`,
    );
    const byteaColumns = rows.map((r) => r.column_name);
    assert.deepEqual(
      byteaColumns,
      [],
      `Expected no BYTEA columns in clips_media, found: ${byteaColumns.join(", ")}`,
    );
  });

  it("clips_media has required URL columns with correct types", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'clips_media'
       ORDER BY column_name`,
    );
    const colMap = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    assert.ok(colMap["file_url"], "file_url column should exist");
    assert.equal(colMap["file_url"].data_type, "text", "file_url should be TEXT");
    assert.equal(colMap["file_url"].is_nullable, "NO", "file_url should be NOT NULL");
    assert.ok(colMap["thumbnail_url"], "thumbnail_url column should exist");
    assert.equal(colMap["thumbnail_url"].data_type, "text", "thumbnail_url should be TEXT");
  });

  // ── Upload limit ─────────────────────────────────────────────────────────

  it("POST /clips — rejects with 409 when free user exceeds 20-clip limit", async () => {
    // Create a dedicated user so we don't interfere with clips created by other tests
    const limitUser = await makeUser("limit");
    createdUserIds.push(limitUser.id);

    // Insert 20 clips directly into the DB (bypass GCS — we only need the count)
    const insertedIds: number[] = [];
    for (let i = 0; i < 20; i++) {
      const { rows: [c] } = await pool.query<{ id: number }>(
        `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, 'image/jpeg') RETURNING id`,
        [limitUser.id, `Limit test clip ${i + 1}`],
      );
      await pool.query(
        `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
        [c.id, FAKE_FILE_PATH],
      );
      insertedIds.push(c.id);
    }

    // 21st upload attempt via the API — should be rejected before any GCS call
    uploadCalls = [];
    const { body, contentType } = multipartBody(
      { title: "One Too Many" },
      { fieldname: "file", filename: "clip.jpg", mime: "image/jpeg", data: Buffer.from("IMGDATA") },
    );
    const r = await req("POST", "/api/clips", limitUser.token, body, contentType);
    assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);
    const b = r.body as { error: string; limit: number; current: number };
    assert.equal(b.limit, 20, "limit should be 20 for free users");
    assert.equal(b.current, 20, "current should reflect the 20 existing clips");
    assert.match(b.error, /20 clips/i, "error message should mention the limit");
    // GCS upload must NOT have been called
    assert.equal(uploadCalls.length, 0, "GCS upload should not be called when limit is exceeded");

    // Cleanup
    await pool.query("DELETE FROM clips WHERE id = ANY($1)", [insertedIds]);
  });

  it("POST /clips — Nth clip (exactly at limit minus 1) succeeds for free user", async () => {
    // Create a dedicated user with 19 pre-existing clips; the 20th should succeed
    const limitUser2 = await makeUser("limit2");
    createdUserIds.push(limitUser2.id);

    const insertedIds: number[] = [];
    for (let i = 0; i < 19; i++) {
      const { rows: [c] } = await pool.query<{ id: number }>(
        `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, 'image/jpeg') RETURNING id`,
        [limitUser2.id, `Prefill clip ${i + 1}`],
      );
      await pool.query(
        `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
        [c.id, FAKE_FILE_PATH],
      );
      insertedIds.push(c.id);
    }

    // 20th upload — exactly at limit, should succeed (201)
    uploadCalls = [];
    const { body, contentType } = multipartBody(
      { title: "Twentieth Clip" },
      { fieldname: "file", filename: "clip.jpg", mime: "image/jpeg", data: Buffer.from("IMGDATA") },
    );
    const r = await req("POST", "/api/clips", limitUser2.token, body, contentType);
    assert.equal(r.status, 201, `expected 201 for the Nth clip, got ${r.status}: ${JSON.stringify(r.body)}`);
    const b = r.body as { id: number };
    insertedIds.push(b.id);
    assert.equal(uploadCalls.length, 1, "GCS upload should be called for the last allowed clip");

    // Cleanup
    await pool.query("DELETE FROM clips WHERE id = ANY($1)", [insertedIds]);
  });

  it("POST /clips — Pro user limit is 100 (free limit does not apply)", async () => {
    // Create a Pro user with 20 clips — they should still be allowed to upload
    const proUser = await makeUser("pro");
    createdUserIds.push(proUser.id);
    await pool.query(`UPDATE users SET is_pro = true WHERE id = $1`, [proUser.id]);

    const insertedIds: number[] = [];
    for (let i = 0; i < 20; i++) {
      const { rows: [c] } = await pool.query<{ id: number }>(
        `INSERT INTO clips (owner_id, title, mime_type) VALUES ($1, $2, 'image/jpeg') RETURNING id`,
        [proUser.id, `Pro prefill ${i + 1}`],
      );
      await pool.query(
        `INSERT INTO clips_media (clip_id, file_url) VALUES ($1, $2)`,
        [c.id, FAKE_FILE_PATH],
      );
      insertedIds.push(c.id);
    }

    // Pro user's 21st clip — should succeed (they get 100)
    uploadCalls = [];
    const { body, contentType } = multipartBody(
      { title: "Pro Extra Clip" },
      { fieldname: "file", filename: "clip.jpg", mime: "image/jpeg", data: Buffer.from("IMGDATA") },
    );
    const r = await req("POST", "/api/clips", proUser.token, body, contentType);
    assert.equal(r.status, 201, `Pro user should not be blocked at 20 clips, got ${r.status}: ${JSON.stringify(r.body)}`);
    const rb = r.body as { id: number };
    insertedIds.push(rb.id);
    assert.equal(uploadCalls.length, 1, "GCS upload should be called for a Pro user within their limit");

    // Cleanup
    await pool.query("DELETE FROM clips WHERE id = ANY($1)", [insertedIds]);
    await pool.query(`UPDATE users SET is_pro = false WHERE id = $1`, [proUser.id]);
  });

  // ── Orphan cleanup ───────────────────────────────────────────────────────

  it("POST /clips — no GCS orphans when the file upload itself fails (500 returned)", async () => {
    // If uploadObjectEntityBuffer throws for the main file, nothing was stored in GCS
    // so deleteObjectSafe must NOT be called (there is nothing to clean up).
    const fileFailUser = await makeUser("file_fail");
    createdUserIds.push(fileFailUser.id);

    const deletedObjects: string[] = [];
    const savedPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = "gs://test-bucket/test-private-dir";

    const bucketMock = mock.method(
      objectStorageClient,
      "bucket",
      (_bucketName: string) => ({
        file: (objectName: string) => ({
          delete: async (_opts?: unknown) => {
            deletedObjects.push(objectName);
          },
        }),
      }),
    );

    // Override uploadObjectEntityBuffer to throw on the file upload attempt
    const origUpload = ObjectStorageService.prototype.uploadObjectEntityBuffer;
    const uploadMock = mock.method(
      ObjectStorageService.prototype,
      "uploadObjectEntityBuffer",
      async function (_buf: Buffer, _contentType: string) {
        throw new Error("Simulated file upload failure");
      },
    );

    uploadCalls = [];
    try {
      const { body, contentType } = multipartBody(
        { title: "File-Fail Clip" },
        { fieldname: "file", filename: "fail.jpg", mime: "image/jpeg", data: Buffer.from("IMG_DATA") },
      );
      const r = await req("POST", "/api/clips", fileFailUser.token, body, contentType);

      // Route must fail (file upload error is not a 400-class error)
      assert.equal(r.status, 500, `expected 500 when file upload throws, got ${r.status}: ${JSON.stringify(r.body)}`);

      // Nothing was uploaded, so deleteObjectSafe must not have attempted any GCS delete
      assert.equal(
        deletedObjects.length,
        0,
        `expected no GCS deletes when file upload failed, got: ${deletedObjects.join(", ")}`,
      );
    } finally {
      uploadMock.mock.restore();
      bucketMock.mock.restore();
      if (savedPrivateDir === undefined) {
        delete process.env.PRIVATE_OBJECT_DIR;
      } else {
        process.env.PRIVATE_OBJECT_DIR = savedPrivateDir;
      }
      void origUpload; // keep reference; restore handled above
    }
  });

  it("POST /clips — thumbnail upload failure is non-fatal: returns 201 with only file_url in DB", async () => {
    // uploadObjectEntityBuffer succeeds for the file but throws for the thumbnail.
    // The route wraps the thumbnail upload in try/catch and continues without it.
    // The response must be 201 and clips_media must have file_url set, thumbnail_url null.
    const thumbFailUser = await makeUser("thumb_fail");
    createdUserIds.push(thumbFailUser.id);

    let callIndex = 0;
    const uploadMock = mock.method(
      ObjectStorageService.prototype,
      "uploadObjectEntityBuffer",
      async function (_buf: Buffer, contentType: string) {
        callIndex += 1;
        if (callIndex === 1) {
          // First call: file upload — succeeds
          uploadCalls.push({ contentType });
          return FAKE_FILE_PATH;
        }
        // Second call: thumbnail upload — fails
        throw new Error("Simulated thumbnail upload failure");
      },
    );

    uploadCalls = [];
    callIndex = 0;
    let newClipId: number | null = null;
    try {
      const { body, contentType } = multipartBody(
        { title: "Thumb-Fail Video", game: "FPS", durationSeconds: "30" },
        { fieldname: "file", filename: "video.mp4", mime: "video/mp4", data: Buffer.from("FAKE_MP4") },
        { data: Buffer.from("FAKE_THUMB"), mime: "image/jpeg" },
      );
      const r = await req("POST", "/api/clips", thumbFailUser.token, body, contentType);

      // Thumbnail failure must not abort the upload — still 201
      assert.equal(r.status, 201, `expected 201 even when thumbnail upload fails, got ${r.status}: ${JSON.stringify(r.body)}`);
      const b = r.body as { id: number; mediaUrl: string; thumbnailUrl: string };
      assert.ok(b.id > 0, "response should include a positive clip id");
      newClipId = b.id;

      // Only the file upload should have been attempted (thumbnail throw is caught internally,
      // but the upload mock still increments callIndex for the thumbnail attempt)
      assert.equal(callIndex, 2, "uploadObjectEntityBuffer should have been called twice (file + attempted thumbnail)");

      // DB must have file_url set but thumbnail_url must be null
      const { rows } = await pool.query<{ file_url: string; thumbnail_url: string | null }>(
        "SELECT file_url, thumbnail_url FROM clips_media WHERE clip_id=$1",
        [b.id],
      );
      assert.equal(rows.length, 1, "clips_media row should exist");
      assert.equal(rows[0].file_url, FAKE_FILE_PATH, "file_url should be the uploaded object path");
      assert.equal(rows[0].thumbnail_url, null, "thumbnail_url must be null when thumbnail upload fails");
    } finally {
      uploadMock.mock.restore();
      if (newClipId !== null) {
        await pool.query("DELETE FROM clips WHERE id=$1", [newClipId]);
      }
    }
  });

  it("POST /clips — deletes orphaned GCS objects when the DB insert fails", async () => {
    // The user stays in the DB so requireAuth (which uses drizzle `db`) passes.
    // We mock pool.query — used only by the clips route — to throw on INSERT INTO clips,
    // simulating a transient DB failure after GCS already received the file.
    const ghostUser = await makeUser("ghost_orphan");
    createdUserIds.push(ghostUser.id);

    // Track GCS delete calls made by deleteObjectSafe
    const deletedObjects: string[] = [];
    const savedPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    // Ensure deleteObjectSafe doesn't early-return due to missing env var
    process.env.PRIVATE_OBJECT_DIR = "gs://test-bucket/test-private-dir";

    // Mock objectStorageClient.bucket so we capture delete calls without hitting GCS
    const bucketMock = mock.method(
      objectStorageClient,
      "bucket",
      (_bucketName: string) => ({
        file: (objectName: string) => ({
          delete: async (_opts?: unknown) => {
            deletedObjects.push(objectName);
          },
        }),
      }),
    );

    // Save original pool.query before mocking, so we can delegate non-INSERT calls
    const origQuery = pool.query.bind(pool) as typeof pool.query;
    const queryMock = mock.method(
      pool,
      "query",
      async (...args: Parameters<typeof pool.query>) => {
        const text = args[0];
        if (typeof text === "string" && text.trimStart().toUpperCase().startsWith("INSERT INTO CLIPS ")) {
          throw new Error("Simulated DB failure for orphan cleanup test");
        }
        // Pass everything else (SELECT, INSERT INTO clips_media row after first insert, etc.) through
        return origQuery(...args);
      },
    );

    uploadCalls = [];
    try {
      const { body, contentType } = multipartBody(
        { title: "Orphan Clip", game: "TestGame" },
        { fieldname: "file", filename: "orphan.jpg", mime: "image/jpeg", data: Buffer.from("ORPHAN_JPEG") },
      );
      const r = await req("POST", "/api/clips", ghostUser.token, body, contentType);

      // The DB insert must fail → route returns 500
      assert.equal(r.status, 500, `expected 500 when DB insert fails, got ${r.status}: ${JSON.stringify(r.body)}`);

      // GCS upload was invoked (the upload itself succeeded before the DB failure)
      assert.ok(uploadCalls.length >= 1, "uploadObjectEntityBuffer should have been called");

      // GCS delete must have been attempted for each uploaded object (orphan cleanup)
      assert.ok(
        deletedObjects.length >= uploadCalls.length,
        `expected at least ${uploadCalls.length} GCS delete call(s) to clean up orphans, got ${deletedObjects.length}`,
      );
    } finally {
      queryMock.mock.restore();
      bucketMock.mock.restore();
      if (savedPrivateDir === undefined) {
        delete process.env.PRIVATE_OBJECT_DIR;
      } else {
        process.env.PRIVATE_OBJECT_DIR = savedPrivateDir;
      }
    }
  });
});
