/**
 * GET /download/windows
 *
 * Public, no-auth endpoint. Streams the Windows installer directly from the
 * GitHub release so the client receives bytes from this server with no
 * redirect — required by Microsoft Store package URL validation.
 *
 * The GitHub releases URL redirects to objects.githubusercontent.com; we
 * follow that redirect server-side and pipe the body to the client, so from
 * the client's perspective there is a single 200 response with the binary.
 */

import { Router, type IRouter, type Request, type Response } from 'express';

const router: IRouter = Router();

const RELEASE_FILENAME = 'GameWorldHubSetup.exe';

// Direct GitHub release asset URL (redirects server-side, transparent to client)
const GITHUB_RELEASE_URL =
  'https://github.com/it2w/game-world-hub/releases/download/main/GameWorldHubSetup.exe';

router.get('/download/windows', async (_req: Request, res: Response) => {
  try {
    // Follow GitHub's redirect server-side with a 30-second timeout
    const upstream = await fetch(GITHUB_RELEASE_URL, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: 'Release not available',
        message: 'The Windows installer could not be fetched. Please try again later.',
      });
      return;
    }

    // Forward content length so browsers show a progress bar
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${RELEASE_FILENAME}"`,
    );
    // Allow CDN/proxy caching for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream body directly to the client
    if (!upstream.body) {
      res.status(502).json({ error: 'Empty response from upstream' });
      return;
    }

    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const ok = res.write(value);
        // Respect backpressure
        if (!ok) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    };

    await pump();
  } catch (err) {
    console.error('[download/windows]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
