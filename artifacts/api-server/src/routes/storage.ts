import { Readable } from 'stream';
import Busboy from 'busboy';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { ObjectPermission } from '../lib/objectAcl';
import { requireAuth } from '../middlewares/auth';
import { logger } from '../lib/logger';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — profile media only

/**
 * POST /storage/uploads
 *
 * Direct multipart/form-data upload. Receives the file on the server and
 * writes it to GCS via the SDK (no sidecar signing required).
 * Returns { objectPath } in the same shape as the presigned-URL flow.
 */
router.post(
  '/storage/uploads',
  requireAuth,
  async (req: Request, res: Response) => {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data' });
      return;
    }

    try {
      const objectPath = await new Promise<string>((resolve, reject) => {
        const bb = Busboy({
          headers: req.headers,
          limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
        });

        let handled = false;

        bb.on('file', (_fieldname, fileStream, info) => {
          const { mimeType } = info;
          if (!mimeType.startsWith('image/')) {
            fileStream.resume(); // drain
            reject(new Error('Only image uploads are allowed'));
            return;
          }

          const chunks: Buffer[] = [];
          fileStream.on('data', (chunk) => chunks.push(chunk));
          fileStream.on('limit', () => {
            reject(new Error('Image is too large (max 8 MB)'));
          });
          fileStream.on('end', async () => {
            if (handled) return;
            handled = true;
            try {
              const buffer = Buffer.concat(chunks);
              const path = await objectStorageService.uploadObjectEntityBuffer(
                buffer,
                mimeType,
              );
              resolve(path);
            } catch (err) {
              reject(err);
            }
          });
        });

        bb.on('error', reject);
        req.pipe(bb);
      });

      res.json({ objectPath });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      if (
        msg.includes('Only image') ||
        msg.includes('too large') ||
        msg.includes('multipart')
      ) {
        res.status(400).json({ error: msg });
      } else {
        logger.error({ err: error }, 'Error uploading file');
        res.status(500).json({ error: 'Upload failed' });
      }
    }
  },
);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      // This endpoint only backs profile media: restrict to images with a
      // sane size limit so authenticated users cannot mint arbitrary uploads.
      if (!contentType.startsWith('image/')) {
        res.status(400).json({ error: 'Only image uploads are allowed' });
        return;
      }
      if (size <= 0 || size > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: 'Image is too large (max 8 MB)' });
        return;
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      logger.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    // Only objects explicitly marked public are served (profile media gets a
    // public ACL when it is saved to a profile). Everything else is denied.
    const canAccess = await objectStorageService.canAccessObjectEntity({
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      logger.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    logger.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
