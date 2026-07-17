import Busboy from "busboy";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, storedImagesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * POST /images
 *
 * Accepts multipart/form-data with a single image file.
 * Stores it as BYTEA in PostgreSQL (bypasses object storage / GCS).
 * Returns { objectPath: "/images/<uuid>" }.
 */
router.post("/images", requireAuth, async (req: Request, res: Response) => {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    res.status(400).json({ error: "Expected multipart/form-data" });
    return;
  }

  try {
    const result = await new Promise<{ id: string; contentType: string }>(
      (resolve, reject) => {
        const bb = Busboy({
          headers: req.headers,
          limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
        });

        let handled = false;

        bb.on("file", (_fieldname, fileStream, info) => {
          const { mimeType } = info;
          if (!mimeType.startsWith("image/")) {
            fileStream.resume();
            reject(new Error("Only image uploads are allowed"));
            return;
          }

          const chunks: Buffer[] = [];
          let limitHit = false;

          fileStream.on("data", (chunk) => chunks.push(chunk));
          fileStream.on("limit", () => {
            limitHit = true;
            reject(new Error("Image is too large (max 8 MB)"));
          });
          fileStream.on("end", async () => {
            if (handled || limitHit) return;
            handled = true;
            try {
              const buffer = Buffer.concat(chunks);
              const [row] = await db
                .insert(storedImagesTable)
                .values({ contentType: mimeType, data: buffer })
                .returning({ id: storedImagesTable.id });
              resolve({ id: row.id, contentType: mimeType });
            } catch (err) {
              reject(err);
            }
          });
        });

        bb.on("error", reject);
        req.pipe(bb);
      },
    );

    res.json({ objectPath: `/images/${result.id}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Upload failed";
    if (msg.includes("Only image") || msg.includes("too large")) {
      res.status(400).json({ error: msg });
    } else {
      logger.error({ err: error }, "Error storing image in DB");
      res.status(500).json({ error: "Upload failed" });
    }
  }
});

/**
 * GET /images/:id
 *
 * Serves an image stored in the database by its UUID.
 */
router.get("/images/:id", async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  // Basic UUID format check
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "Invalid image id" });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(storedImagesTable)
      .where(eq(storedImagesTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    res.setHeader("Content-Type", row.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(row.data.length));
    res.end(row.data);
  } catch (error) {
    logger.error({ err: error }, "Error serving image from DB");
    res.status(500).json({ error: "Failed to serve image" });
  }
});

export default router;
