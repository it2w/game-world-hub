/**
 * GET /download/windows
 *
 * Public, no-auth endpoint.  Generates a short-lived presigned GCS GET URL
 * via the Replit sidecar and redirects the browser there, so the 350 MB ZIP
 * never passes through the API server.
 *
 * Returns 503 when the file has not been uploaded yet so the landing page
 * can still show a "coming soon" fallback if needed.
 */

import { Router, type IRouter, type Request, type Response } from 'express';
import { objectStorageClient } from '../lib/objectStorage';

const router: IRouter = Router();

const RELEASE_FILENAME = 'GameWorldHub-1.0.0-win.zip';
const REPLIT_SIDECAR = 'http://127.0.0.1:1106';
/** Signed URL valid for 10 min – enough for the slowest connection to start. */
const SIGNED_TTL_MS = 10 * 60 * 1000;

router.get('/download/windows', async (_req: Request, res: Response) => {
  try {
    // ── Resolve bucket + object from PUBLIC_OBJECT_SEARCH_PATHS ──────────
    const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (publicPaths.length === 0) {
      res.status(503).json({ error: 'Object storage not configured' });
      return;
    }

    // Path format: /bucket-name/optional/prefix
    const firstPath = publicPaths[0].replace(/^\//, '');
    const parts = firstPath.split('/');
    const bucketName = parts[0];
    const prefix = parts.slice(1).join('/');
    const objectName = prefix
      ? `${prefix}/${RELEASE_FILENAME}`
      : RELEASE_FILENAME;

    // ── Check the file actually exists ───────────────────────────────────
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();

    if (!exists) {
      res.status(503).json({
        error: 'Release not yet available',
        message: 'The Windows desktop app will be available soon.',
      });
      return;
    }

    // ── Ask the Replit sidecar for a short-lived signed GET URL ──────────
    const sideCar = await fetch(
      `${REPLIT_SIDECAR}/object-storage/signed-object-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket_name: bucketName,
          object_name: objectName,
          method: 'GET',
          expires_at: new Date(Date.now() + SIGNED_TTL_MS).toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!sideCar.ok) {
      throw new Error(`Sidecar error ${sideCar.status}`);
    }

    const { signed_url } = (await sideCar.json()) as { signed_url: string };

    // ── Redirect – browser follows to GCS and downloads directly ─────────
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${RELEASE_FILENAME}"`,
    );
    res.redirect(302, signed_url);
  } catch (err) {
    console.error('[download/windows]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
