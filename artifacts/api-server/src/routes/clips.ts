/**
 * Clips Gallery & Rich Presence API
 * - POST   /clips                        — upload a clip (multipart: file + optional thumbnail + metadata)
 * - GET    /clips/friends                — friends' recent clips for dashboard highlights
 * - GET    /clips/:id                    — clip metadata
 * - GET    /clips/:id/media              — serve raw file (proxied from object storage)
 * - GET    /clips/:id/thumbnail          — serve thumbnail (falls back to media for images)
 * - DELETE /clips/:id                    — owner only
 * - GET    /users/:id/clips              — paginated user clips
 * - POST   /clips/:id/reactions          — toggle reaction
 * - GET    /clips/:id/reactions          — reaction counts
 * - POST   /clips/:id/comments           — add comment
 * - GET    /clips/:id/comments           — list comments
 * - PUT    /users/me/presence-settings   — update presence privacy
 * - GET    /users/:id/presence           — rich presence data
 */

import Busboy from "busboy";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { toPublicImageUrl, ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { broadcastAll } from "../ws/signaling";

/** Thrown for user-caused upload errors that should return HTTP 400. */
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;  // 50 MB
const MAX_THUMB_BYTES =  2 * 1024 * 1024;  //  2 MB
const VALID_EMOJIS = ["🔥", "GG", "💀", "👑", "😂"];

// Per-user clip limits — enforced before any GCS upload is attempted
const FREE_CLIP_LIMIT = 20;
const PRO_CLIP_LIMIT  = 100;

// ── Schema bootstrap ─────────────────────────────────────────────────────────
export async function ensureClipsTables(): Promise<void> {
  // Main clips metadata table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clips (
      id               SERIAL PRIMARY KEY,
      owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title            TEXT    NOT NULL,
      game             TEXT,
      description      TEXT,
      mime_type        TEXT    NOT NULL,
      duration_seconds INTEGER,
      view_count       INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS clips_owner_idx ON clips(owner_id, created_at DESC)`);

  // Media storage — object-storage URLs (file_url / thumbnail_url).
  // Previous schema used BYTEA (file_data / thumbnail_data); drop those if they exist.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clips_media (
      clip_id        INTEGER PRIMARY KEY REFERENCES clips(id) ON DELETE CASCADE,
      file_url       TEXT    NOT NULL,
      thumbnail_url  TEXT
    )
  `);
  // Additive migration: add URL columns when upgrading from the old BYTEA layout
  await pool.query(`ALTER TABLE clips_media ADD COLUMN IF NOT EXISTS file_url      TEXT`);
  await pool.query(`ALTER TABLE clips_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
  // Remove legacy BYTEA columns (data was never in production; safe to drop)
  await pool.query(`ALTER TABLE clips_media DROP COLUMN IF EXISTS file_data`);
  await pool.query(`ALTER TABLE clips_media DROP COLUMN IF EXISTS thumbnail_data`);
  // Enforce NOT NULL on file_url (no-op if already correct)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE clips_media ALTER COLUMN file_url SET NOT NULL;
    EXCEPTION WHEN others THEN null;
    END $$
  `);

  // Reactions — one row per (clip, user, emoji); toggle by insert/delete
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_reactions (
      clip_id    INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (clip_id, user_id, emoji)
    )
  `);

  // Comments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_comments (
      id         SERIAL PRIMARY KEY,
      clip_id    INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS clip_comments_clip_idx ON clip_comments(clip_id, created_at)`);

  // Presence sessions — single row per user; tracks when they started the current game
  await pool.query(`
    CREATE TABLE IF NOT EXISTS presence_sessions (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      game       TEXT    NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Presence privacy setting — additive column on users
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_setting TEXT NOT NULL DEFAULT 'full'`,
  );

  logger.info("clips: tables ensured");
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function serializeClip(
  row: {
    id: number; owner_id: number; title: string; game: string | null;
    description: string | null; mime_type: string; duration_seconds: number | null;
    view_count: number; created_at: Date;
    // owner join
    owner_display_name?: string; owner_username?: string; owner_avatar_url?: string | null;
    // aggregates
    reaction_count?: string; comment_count?: string; viewer_reactions?: string;
  },
  viewerId?: number,
) {
  const isVideo = row.mime_type.startsWith("video/");
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner: row.owner_display_name ? {
      displayName: row.owner_display_name,
      username: row.owner_username ?? "",
      avatarUrl: toPublicImageUrl(row.owner_avatar_url ?? null),
    } : undefined,
    title: row.title,
    game: row.game ?? null,
    description: row.description ?? null,
    mimeType: row.mime_type,
    isVideo,
    durationSeconds: row.duration_seconds ?? null,
    viewCount: row.view_count,
    mediaUrl: `/api/clips/${row.id}/media`,
    thumbnailUrl: `/api/clips/${row.id}/thumbnail`,
    reactionCount: parseInt(String(row.reaction_count ?? "0"), 10),
    commentCount: parseInt(String(row.comment_count ?? "0"), 10),
    viewerReactions: row.viewer_reactions ? row.viewer_reactions.split(",").filter(Boolean) : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/**
 * Delete a clip object (file or thumbnail) from GCS.
 * Errors are swallowed — we never want a failed GCS delete to block DB cleanup.
 */
async function deleteObjectSafe(objectPath: string | null): Promise<void> {
  if (!objectPath) return;
  try {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR ?? "";
    if (!privateObjectDir) return;
    // objectPath is "/objects/uploads/<uuid>"; full GCS path is PRIVATE_OBJECT_DIR/uploads/<uuid>
    const entityId = objectPath.replace(/^\/objects\//, "");
    const fullPath = `${privateObjectDir.replace(/\/$/, "")}/${entityId}`;
    // Parse bucket / object from gs://bucket/object or /bucket/object
    const stripped = fullPath.startsWith("gs://") ? fullPath.slice(5) : fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
    const slashIdx = stripped.indexOf("/");
    if (slashIdx === -1) return;
    const bucketName = stripped.slice(0, slashIdx);
    const objectName = stripped.slice(slashIdx + 1);
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  } catch (err) {
    logger.warn({ err, objectPath }, "clips: failed to delete object from GCS (non-fatal)");
  }
}

// ── POST /clips — upload ──────────────────────────────────────────────────────
router.post("/clips", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.auth!.userId;
  const ct = req.headers["content-type"] ?? "";
  if (!ct.includes("multipart/form-data")) {
    res.status(400).json({ error: "Expected multipart/form-data" }); return;
  }

  try {
    const result = await new Promise<{
      fileBuffer: Buffer; thumbBuffer: Buffer | null;
      mimeType: string; title: string; game: string | null;
      description: string | null; durationSeconds: number | null;
    }>((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { files: 2 } });
      let fileBuffer: Buffer | null = null;
      let thumbBuffer: Buffer | null = null;
      let mimeType = "";
      const fields: Record<string, string> = {};

      bb.on("file", (fieldname, stream, info) => {
        const { mimeType: mt } = info;
        const isVideo = mt.startsWith("video/");
        const isImage = mt.startsWith("image/");
        if (fieldname === "file") {
          if (!isVideo && !isImage) {
            stream.resume();
            reject(new ValidationError("Only image or video files are allowed"));
            return;
          }
          mimeType = mt;
          const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
          const chunks: Buffer[] = [];
          stream.on("data", (c) => {
            chunks.push(c);
            const total = chunks.reduce((s, b) => s + b.length, 0);
            if (total > maxBytes) {
              reject(new ValidationError(isVideo ? "Video is too large (max 50 MB)" : "Image is too large (max 10 MB)"));
            }
          });
          stream.on("end", () => { fileBuffer = Buffer.concat(chunks); });
        } else if (fieldname === "thumbnail") {
          if (!mt.startsWith("image/")) { stream.resume(); return; }
          const chunks: Buffer[] = [];
          stream.on("data", (c) => { chunks.push(c); });
          stream.on("end", () => {
            const total = Buffer.concat(chunks);
            thumbBuffer = total.length <= MAX_THUMB_BYTES ? total : null;
          });
        } else {
          stream.resume();
        }
      });

      bb.on("field", (name, val) => { fields[name] = val; });

      bb.on("finish", () => {
        if (!fileBuffer || !mimeType) { reject(new ValidationError("No file uploaded")); return; }
        const title = (fields.title ?? "").trim();
        if (!title) { reject(new ValidationError("Title is required")); return; }
        resolve({
          fileBuffer, thumbBuffer, mimeType,
          title,
          game: (fields.game ?? "").trim() || null,
          description: (fields.description ?? "").trim() || null,
          durationSeconds: fields.durationSeconds ? parseInt(fields.durationSeconds, 10) : null,
        });
      });

      bb.on("error", reject);
      req.pipe(bb);
    });

    // Enforce per-user clip limit before wasting any storage bandwidth
    const { rows: [limitRow] } = await pool.query<{ clip_count: string; is_pro: boolean }>(
      `SELECT (SELECT COUNT(*) FROM clips WHERE owner_id=$1) AS clip_count,
              COALESCE(u.is_pro, false) AS is_pro
       FROM users u WHERE u.id=$1`,
      [ownerId],
    );
    if (limitRow) {
      const clipCount = parseInt(limitRow.clip_count, 10);
      const limit = limitRow.is_pro ? PRO_CLIP_LIMIT : FREE_CLIP_LIMIT;
      if (clipCount >= limit) {
        res.status(409).json({
          error: limitRow.is_pro
            ? `Pro users may store up to ${PRO_CLIP_LIMIT} clips. Delete some clips to upload more.`
            : `Free users may store up to ${FREE_CLIP_LIMIT} clips. Delete some clips or upgrade to Pro for a higher limit.`,
          limit,
          current: clipCount,
        });
        return;
      }
    }

    // Upload file buffer to object storage
    const fileUrl = await objectStorageService.uploadObjectEntityBuffer(result.fileBuffer, result.mimeType);

    // Upload thumbnail if provided
    let thumbnailUrl: string | null = null;
    if (result.thumbBuffer) {
      try {
        thumbnailUrl = await objectStorageService.uploadObjectEntityBuffer(result.thumbBuffer, "image/jpeg");
      } catch (thumbErr) {
        logger.warn({ thumbErr }, "clips: thumbnail upload failed, continuing without thumbnail");
      }
    }

    // Insert metadata + media URLs — if the DB step fails, delete the orphaned GCS objects
    let clip: { id: number };
    try {
      const { rows: [inserted] } = await pool.query<{ id: number }>(
        `INSERT INTO clips (owner_id, title, game, description, mime_type, duration_seconds)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ownerId, result.title, result.game, result.description, result.mimeType, result.durationSeconds],
      );
      clip = inserted;
      await pool.query(
        `INSERT INTO clips_media (clip_id, file_url, thumbnail_url) VALUES ($1,$2,$3)`,
        [clip.id, fileUrl, thumbnailUrl],
      );
    } catch (dbErr) {
      // GCS uploads succeeded but DB failed — delete orphaned objects before surfacing the error
      logger.error({ dbErr }, "clips: DB insert failed after GCS upload; deleting orphaned objects");
      await Promise.all([deleteObjectSafe(fileUrl), deleteObjectSafe(thumbnailUrl)]);
      throw dbErr;
    }

    // Notify all connected dashboards so friends' strips update immediately
    broadcastAll({ type: "clip-uploaded", clipId: clip.id, ownerId });

    res.status(201).json({ id: clip.id, mediaUrl: `/api/clips/${clip.id}/media`, thumbnailUrl: `/api/clips/${clip.id}/thumbnail` });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
    } else {
      logger.error({ err }, "clips: upload error");
      res.status(500).json({ error: "Upload failed" });
    }
  }
});

// ── GET /clips/friends — dashboard highlights ─────────────────────────────────
router.get("/clips/friends", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const myId = req.auth!.userId;
  const limit = Math.min(parseInt(String(req.query.limit ?? "8"), 10), 20);
  const { rows } = await pool.query<{
    id: number; owner_id: number; title: string; game: string | null;
    description: string | null; mime_type: string; duration_seconds: number | null;
    view_count: number; created_at: Date;
    owner_display_name: string; owner_username: string; owner_avatar_url: string | null;
    reaction_count: string; comment_count: string;
  }>(
    `SELECT c.id, c.owner_id, c.title, c.game, c.description, c.mime_type,
            c.duration_seconds, c.view_count, c.created_at,
            u.display_name AS owner_display_name, u.username AS owner_username,
            u.avatar_url AS owner_avatar_url,
            (SELECT COUNT(*) FROM clip_reactions r WHERE r.clip_id = c.id) AS reaction_count,
            (SELECT COUNT(*) FROM clip_comments cm WHERE cm.clip_id = c.id) AS comment_count
     FROM clips c
     JOIN users u ON u.id = c.owner_id
     WHERE c.owner_id IN (
       SELECT CASE WHEN user_id=$1 THEN friend_id ELSE user_id END
       FROM friendships WHERE (user_id=$1 OR friend_id=$1)
     )
     AND c.created_at > NOW() - INTERVAL '7 days'
     ORDER BY reaction_count DESC, c.created_at DESC
     LIMIT $2`,
    [myId, limit],
  );
  const clips = await Promise.all(rows.map(r => serializeClip(r)));
  res.json(clips);
});

// ── GET /clips/:id — metadata ─────────────────────────────────────────────────
router.get("/clips/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const myId = req.auth!.userId;

  const { rows: [row] } = await pool.query<{
    id: number; owner_id: number; title: string; game: string | null;
    description: string | null; mime_type: string; duration_seconds: number | null;
    view_count: number; created_at: Date;
    owner_display_name: string; owner_username: string; owner_avatar_url: string | null;
    reaction_count: string; comment_count: string; viewer_reactions: string;
  }>(
    `SELECT c.id, c.owner_id, c.title, c.game, c.description, c.mime_type,
            c.duration_seconds, c.view_count, c.created_at,
            u.display_name AS owner_display_name, u.username AS owner_username,
            u.avatar_url AS owner_avatar_url,
            (SELECT COUNT(*) FROM clip_reactions r WHERE r.clip_id = c.id) AS reaction_count,
            (SELECT COUNT(*) FROM clip_comments cm WHERE cm.clip_id = c.id) AS comment_count,
            COALESCE((SELECT string_agg(emoji, ',') FROM clip_reactions WHERE clip_id=c.id AND user_id=$2),'') AS viewer_reactions
     FROM clips c
     JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1`,
    [id, myId],
  );
  if (!row) { res.status(404).json({ error: "Clip not found" }); return; }

  // Increment view count (fire-and-forget)
  void pool.query(`UPDATE clips SET view_count = view_count + 1 WHERE id = $1`, [id]);

  res.json(await serializeClip(row, myId));
});

// ── GET /clips/:id/media — proxy from object storage ─────────────────────────
router.get("/clips/:id/media", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { rows: [row] } = await pool.query<{ file_url: string; mime_type: string }>(
      `SELECT m.file_url, c.mime_type FROM clips_media m JOIN clips c ON c.id=m.clip_id WHERE m.clip_id=$1`,
      [id],
    );
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const objectFile = await objectStorageService.getObjectEntityFile(row.file_url);
    const [metadata] = await objectFile.getMetadata();

    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

    objectFile.createReadStream().pipe(res);
  } catch (err) {
    logger.error({ err }, "clips: media serve error");
    res.status(500).json({ error: "Failed to serve media" });
  }
});

// ── GET /clips/:id/thumbnail — proxy thumbnail from object storage ─────────────
router.get("/clips/:id/thumbnail", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const { rows: [row] } = await pool.query<{ file_url: string; thumbnail_url: string | null; mime_type: string }>(
      `SELECT m.file_url, m.thumbnail_url, c.mime_type FROM clips_media m JOIN clips c ON c.id=m.clip_id WHERE m.clip_id=$1`,
      [id],
    );
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    // For videos without a thumbnail, return 204 (no thumbnail available)
    const objectPath = row.thumbnail_url ?? (row.mime_type.startsWith("image/") ? row.file_url : null);
    if (!objectPath) { res.status(204).end(); return; }

    const servedMimeType = row.thumbnail_url ? "image/jpeg" : row.mime_type;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();

    res.setHeader("Content-Type", servedMimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

    objectFile.createReadStream().pipe(res);
  } catch (err) {
    logger.error({ err }, "clips: thumbnail serve error");
    res.status(500).json({ error: "Failed to serve thumbnail" });
  }
});

// ── DELETE /clips/:id ─────────────────────────────────────────────────────────
router.delete("/clips/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const myId = req.auth!.userId;
  const { rows: [clip] } = await pool.query<{ owner_id: number }>(
    `SELECT owner_id FROM clips WHERE id=$1`, [id],
  );
  if (!clip) { res.status(404).json({ error: "Clip not found" }); return; }
  if (clip.owner_id !== myId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Fetch media URLs before cascade-deleting the row
  const { rows: [media] } = await pool.query<{ file_url: string; thumbnail_url: string | null }>(
    `SELECT file_url, thumbnail_url FROM clips_media WHERE clip_id=$1`, [id],
  );

  await pool.query(`DELETE FROM clips WHERE id=$1`, [id]);

  // Notify all connected dashboards so friends' strips drop this clip immediately
  broadcastAll({ type: "clip-deleted", clipId: id, ownerId: myId });

  // Clean up objects from storage (best-effort, after DB delete succeeds)
  if (media) {
    void Promise.all([
      deleteObjectSafe(media.file_url),
      deleteObjectSafe(media.thumbnail_url),
    ]);
  }

  res.json({ ok: true });
});

// ── GET /users/:id/clips ──────────────────────────────────────────────────────
router.get("/users/:id/clips", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = parseInt(rawId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const myId = req.auth!.userId;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 12;
  const offset = (page - 1) * limit;

  const { rows } = await pool.query<{
    id: number; owner_id: number; title: string; game: string | null;
    description: string | null; mime_type: string; duration_seconds: number | null;
    view_count: number; created_at: Date;
    reaction_count: string; comment_count: string; viewer_reactions: string;
  }>(
    `SELECT c.id, c.owner_id, c.title, c.game, c.description, c.mime_type,
            c.duration_seconds, c.view_count, c.created_at,
            (SELECT COUNT(*) FROM clip_reactions r WHERE r.clip_id=c.id) AS reaction_count,
            (SELECT COUNT(*) FROM clip_comments cm WHERE cm.clip_id=c.id) AS comment_count,
            COALESCE((SELECT string_agg(emoji,',') FROM clip_reactions WHERE clip_id=c.id AND user_id=$3),'') AS viewer_reactions
     FROM clips c
     WHERE c.owner_id=$1
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $4`,
    [userId, limit, myId, offset],
  );
  const { rows: [{ total }] } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM clips WHERE owner_id=$1`, [userId],
  );
  const clips = await Promise.all(rows.map(r => serializeClip(r, myId)));
  res.json({ clips, total: parseInt(total, 10), page, limit });
});

// ── POST /clips/:id/reactions — toggle ────────────────────────────────────────
router.post("/clips/:id/reactions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const myId = req.auth!.userId;
  const { emoji } = req.body as { emoji?: string };
  if (!emoji || !VALID_EMOJIS.includes(emoji)) {
    res.status(400).json({ error: `emoji must be one of: ${VALID_EMOJIS.join(", ")}` }); return;
  }
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `SELECT id FROM clips WHERE id=$1`, [id],
  );
  if (!clip) { res.status(404).json({ error: "Clip not found" }); return; }

  // Atomic toggle via a single CTE statement — eliminates the DELETE+INSERT race.
  // The CTE executes within one snapshot: the DELETE and the conditional INSERT
  // are both visible to each other, so two concurrent requests for the same
  // (clip, user, emoji) cannot both see 0 deleted rows and both insert.
  const { rows: [toggleResult] } = await pool.query<{
    was_deleted: boolean; was_inserted: boolean;
  }>(
    `WITH deleted AS (
       DELETE FROM clip_reactions
       WHERE clip_id=$1 AND user_id=$2 AND emoji=$3
       RETURNING 1
     ),
     inserted AS (
       INSERT INTO clip_reactions (clip_id, user_id, emoji)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM deleted)
       ON CONFLICT DO NOTHING
       RETURNING 1
     )
     SELECT
       (SELECT COUNT(*) FROM deleted) > 0 AS was_deleted,
       (SELECT COUNT(*) FROM inserted) > 0 AS was_inserted`,
    [id, myId, emoji],
  );
  const toggled = toggleResult.was_inserted;

  const { rows: counts } = await pool.query<{ emoji: string; count: string }>(
    `SELECT emoji, COUNT(*) AS count FROM clip_reactions WHERE clip_id=$1 GROUP BY emoji`,
    [id],
  );
  const reactionMap = Object.fromEntries(counts.map(r => [r.emoji, parseInt(r.count, 10)]));

  // Push real-time update to all connected clients so open lightboxes stay in sync
  broadcastAll({ type: "clip-reaction", clipId: id, reactions: reactionMap, actingUserId: myId });

  res.json({ toggled, reactions: reactionMap });
});

// ── GET /clips/:id/reactions ─────────────────────────────────────────────────
router.get("/clips/:id/reactions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const myId = req.auth!.userId;
  const { rows } = await pool.query<{ emoji: string; count: string }>(
    `SELECT emoji, COUNT(*) AS count FROM clip_reactions WHERE clip_id=$1 GROUP BY emoji`,
    [id],
  );
  const myReactions = await pool.query<{ emoji: string }>(
    `SELECT emoji FROM clip_reactions WHERE clip_id=$1 AND user_id=$2`, [id, myId],
  );
  const reactionMap = Object.fromEntries(rows.map(r => [r.emoji, parseInt(r.count, 10)]));
  res.json({ reactions: reactionMap, mine: myReactions.rows.map(r => r.emoji) });
});

// ── POST /clips/:id/comments ─────────────────────────────────────────────────
router.post("/clips/:id/comments", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const myId = req.auth!.userId;
  const content = String(req.body?.content ?? "").trim();
  if (!content || content.length > 500) {
    res.status(400).json({ error: "Comment must be 1–500 characters" }); return;
  }
  const { rows: [clip] } = await pool.query<{ id: number }>(
    `SELECT id FROM clips WHERE id=$1`, [id],
  );
  if (!clip) { res.status(404).json({ error: "Clip not found" }); return; }

  const { rows: [comment] } = await pool.query<{ id: number; created_at: Date }>(
    `INSERT INTO clip_comments (clip_id, user_id, content) VALUES ($1,$2,$3) RETURNING id, created_at`,
    [id, myId, content],
  );
  const { rows: [user] } = await pool.query<{ display_name: string; username: string; avatar_url: string | null }>(
    `SELECT display_name, username, avatar_url FROM users WHERE id=$1`, [myId],
  );
  res.status(201).json({
    id: comment.id,
    clipId: id,
    author: { id: myId, displayName: user.display_name, username: user.username, avatarUrl: toPublicImageUrl(user.avatar_url) },
    content,
    createdAt: comment.created_at.toISOString(),
  });
});

// ── GET /clips/:id/comments ──────────────────────────────────────────────────
router.get("/clips/:id/comments", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);
  const { rows } = await pool.query<{
    id: number; user_id: number; content: string; created_at: Date;
    display_name: string; username: string; avatar_url: string | null;
  }>(
    `SELECT cc.id, cc.user_id, cc.content, cc.created_at,
            u.display_name, u.username, u.avatar_url
     FROM clip_comments cc
     JOIN users u ON u.id=cc.user_id
     WHERE cc.clip_id=$1
     ORDER BY cc.created_at
     LIMIT $2`,
    [id, limit],
  );
  res.json(rows.map(r => ({
    id: r.id,
    clipId: id,
    author: { id: r.user_id, displayName: r.display_name, username: r.username, avatarUrl: toPublicImageUrl(r.avatar_url) },
    content: r.content,
    createdAt: r.created_at.toISOString(),
  })));
});

// ── PUT /users/me/presence-settings ──────────────────────────────────────────
router.put("/users/me/presence-settings", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const myId = req.auth!.userId;
  const { setting } = req.body as { setting?: string };
  if (!setting || !["full", "game_only", "hidden"].includes(setting)) {
    res.status(400).json({ error: "setting must be full, game_only, or hidden" }); return;
  }
  await pool.query(`UPDATE users SET presence_setting=$1 WHERE id=$2`, [setting, myId]);
  res.json({ ok: true, setting });
});

// ── GET /users/:id/presence ───────────────────────────────────────────────────
router.get("/users/:id/presence", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = parseInt(rawId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { rows: [user] } = await pool.query<{
    current_game: string | null; status: string; presence_setting: string; last_active_at: Date | null;
  }>(
    `SELECT current_game, status, COALESCE(presence_setting,'full') AS presence_setting, last_active_at
     FROM users WHERE id=$1`,
    [userId],
  );
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Respect privacy
  if (user.presence_setting === "hidden") {
    res.json({ presenceSetting: "hidden", currentGame: null, sessionStartedAt: null, partyId: null, voiceRoom: null, sessionDurationMs: null });
    return;
  }

  // Get session start
  const { rows: [session] } = await pool.query<{ started_at: Date }>(
    `SELECT started_at FROM presence_sessions WHERE user_id=$1 AND game=$2`,
    [userId, user.current_game ?? ""],
  );

  // Get active party (left_at column is optional — guard against schema drift)
  let partyRow: { party_id: number; party_name: string; member_count: number } | undefined;
  try {
    const { rows: [r] } = await pool.query<{ party_id: number; party_name: string; member_count: number }>(
      `SELECT pm.party_id,
              p.name AS party_name,
              (SELECT COUNT(*) FROM party_members pm2 WHERE pm2.party_id=pm.party_id AND pm2.left_at IS NULL) AS member_count
       FROM party_members pm
       JOIN parties p ON p.id=pm.party_id
       WHERE pm.user_id=$1 AND pm.left_at IS NULL
       LIMIT 1`,
      [userId],
    );
    partyRow = r;
  } catch {
    partyRow = undefined;
  }

  const sessionStartedAt = session?.started_at ?? null;
  const sessionDurationMs = sessionStartedAt ? Date.now() - new Date(sessionStartedAt).getTime() : null;

  // Enforce per-field privacy:
  //  full      → show game + session timing + party context
  //  game_only → show game only; hide session start/duration and party details
  //  hidden    → handled above (returns early)
  const showSession = user.presence_setting === "full";

  res.json({
    presenceSetting: user.presence_setting,
    currentGame: user.current_game ?? null,            // both full + game_only expose the game
    sessionStartedAt: showSession && sessionStartedAt ? sessionStartedAt.toISOString() : null,
    sessionDurationMs: showSession ? sessionDurationMs : null,
    partyId: showSession ? (partyRow?.party_id ?? null) : null,
    partySize: showSession ? (partyRow?.member_count ?? null) : null,
    voiceRoom: null, // populated from LiveKit state server-side — future enhancement
  });
});

export default router;
