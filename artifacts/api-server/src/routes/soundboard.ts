import { Router } from "express";
import busboy from "busboy";
import { eq, and, desc } from "drizzle-orm";
import { pool, db, soundboardSoundsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { computeProStatus } from "../lib/pro";
import { logger } from "../lib/logger";

const router = Router();

const MAX_AUDIO_BYTES = 250_000; // ~5 s at 320 kbps
const MAX_PERSONAL_CLIPS = 10;
const ALLOWED_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS soundboard_sounds (
      id          SERIAL PRIMARY KEY,
      owner_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title       VARCHAR(100) NOT NULL,
      file_data   BYTEA NOT NULL,
      mime_type   VARCHAR(50)  NOT NULL DEFAULT 'audio/mpeg',
      duration_ms INTEGER      NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS soundboard_sounds_owner_idx ON soundboard_sounds(owner_id);
  `);
}

void ensureTables().catch((e) => logger.error({ e }, "soundboard: ensureTables failed"));

// ── GET /api/soundboard/sounds ─────────────────────────────────────────────────
// Returns the caller's personal clip metadata (no binary data).

router.get("/soundboard/sounds", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  try {
    const rows = await db
      .select({
        id:         soundboardSoundsTable.id,
        title:      soundboardSoundsTable.title,
        mimeType:   soundboardSoundsTable.mimeType,
        durationMs: soundboardSoundsTable.durationMs,
        createdAt:  soundboardSoundsTable.createdAt,
      })
      .from(soundboardSoundsTable)
      .where(eq(soundboardSoundsTable.ownerId, userId))
      .orderBy(desc(soundboardSoundsTable.createdAt));
    res.json({ personal: rows });
  } catch (err) {
    logger.error({ err }, "soundboard: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/soundboard/sounds ────────────────────────────────────────────────
// Multipart upload. Pro-gated, max 250 KB, max 10 clips per user.

router.post("/soundboard/sounds", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const pro = await computeProStatus(userId);
  if (!pro.isPro) {
    res.status(403).json({ error: "Pro required to upload custom sounds" });
    return;
  }

  const { rows: cnt } = await pool.query<{ c: string }>(
    "SELECT COUNT(*) AS c FROM soundboard_sounds WHERE owner_id = $1",
    [userId],
  );
  if (parseInt(cnt[0].c, 10) >= MAX_PERSONAL_CLIPS) {
    res.status(409).json({ error: `Maximum ${MAX_PERSONAL_CLIPS} clips allowed` });
    return;
  }

  const ct = req.headers["content-type"] ?? "";
  if (!ct.includes("multipart/form-data")) {
    res.status(400).json({ error: "multipart/form-data required" });
    return;
  }

  let title = "Custom Sound";
  let fileBuffer: Buffer | null = null;
  let mimeType = "audio/mpeg";
  let tooLarge = false;
  let invalidMime = false;

  await new Promise<void>((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_AUDIO_BYTES + 1 } });
    bb.on("field", (name, val) => {
      if (name === "title") title = val.slice(0, 100).trim() || title;
    });
    bb.on("file", (_field, stream, info) => {
      const mime = info.mimeType.toLowerCase().split(";")[0].trim();
      if (!ALLOWED_MIMES.has(mime)) {
        invalidMime = true;
        stream.resume();
        return;
      }
      mimeType = mime;
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("limit", () => { tooLarge = true; stream.resume(); });
      stream.on("end", () => {
        if (!tooLarge) fileBuffer = Buffer.concat(chunks);
      });
    });
    bb.on("finish", resolve);
    bb.on("error", reject);
    req.pipe(bb);
  });

  if (invalidMime) {
    res.status(415).json({ error: "Unsupported type — use mp3, ogg or wav" });
    return;
  }
  if (tooLarge) {
    res.status(413).json({ error: "File too large (max ~5 s / 250 KB)" });
    return;
  }
  if (!fileBuffer) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

  try {
    const [sound] = await db
      .insert(soundboardSoundsTable)
      .values({ ownerId: userId, title, fileData: fileBuffer, mimeType })
      .returning({
        id:         soundboardSoundsTable.id,
        title:      soundboardSoundsTable.title,
        mimeType:   soundboardSoundsTable.mimeType,
        durationMs: soundboardSoundsTable.durationMs,
        createdAt:  soundboardSoundsTable.createdAt,
      });
    res.status(201).json(sound);
  } catch (err) {
    logger.error({ err }, "soundboard: upload failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /api/soundboard/sounds/:id ─────────────────────────────────────────

router.delete("/soundboard/sounds/:id", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.auth!.userId;
  const soundId = Number(req.params.id);
  if (isNaN(soundId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [deleted] = await db
      .delete(soundboardSoundsTable)
      .where(
        and(
          eq(soundboardSoundsTable.id, soundId),
          eq(soundboardSoundsTable.ownerId, userId),
        ),
      )
      .returning({ id: soundboardSoundsTable.id });

    if (!deleted) { res.status(404).json({ error: "Sound not found" }); return; }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "soundboard: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/soundboard/sounds/:id/audio ──────────────────────────────────────
// Streams the raw audio bytes for any personal clip by ID.
// Auth required, but NOT restricted to the owner — other participants in the
// same voice room receive the soundId via LiveKit data channel and need to be
// able to play the clip back locally.

router.get("/soundboard/sounds/:id/audio", requireAuth, async (req, res): Promise<void> => {
  const soundId = Number(req.params.id);
  if (isNaN(soundId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [sound] = await db
      .select()
      .from(soundboardSoundsTable)
      .where(eq(soundboardSoundsTable.id, soundId));

    if (!sound) { res.status(404).json({ error: "Sound not found" }); return; }

    res.setHeader("Content-Type",   sound.mimeType);
    res.setHeader("Content-Length", String(sound.fileData.length));
    res.setHeader("Cache-Control",  "private, max-age=3600");
    res.end(sound.fileData);
  } catch (err) {
    logger.error({ err }, "soundboard: serve audio failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
