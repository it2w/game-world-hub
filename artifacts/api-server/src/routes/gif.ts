import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 50;

function mapGif(g: Record<string, any>) {
  return {
    id: g.id as string,
    title: (g.title as string) ?? "",
    url: (g.images?.fixed_height?.url ?? g.images?.original?.url ?? "") as string,
    preview: (g.images?.fixed_height_small?.url ?? g.images?.fixed_height?.url ?? "") as string,
    width: Number(g.images?.fixed_height?.width ?? 200),
    height: Number(g.images?.fixed_height?.height ?? 150),
  };
}

/** GET /gif/trending */
router.get("/gif/trending", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env.GIPHY_API_KEY ?? "";
  if (!apiKey) { res.status(503).json({ error: "GIF service not configured" }); return; }
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  try {
    const r = await fetch(`${GIPHY_BASE}/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13`);
    const data = await r.json() as { data?: Record<string, any>[] };
    res.json({ gifs: (data.data ?? []).map(mapGif) });
  } catch (err) {
    logger.error({ err }, "gif: trending fetch failed");
    res.status(500).json({ error: "Failed to fetch GIFs" });
  }
});

/** GET /gif/search?q=... */
router.get("/gif/search", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env.GIPHY_API_KEY ?? "";
  if (!apiKey) { res.status(503).json({ error: "GIF service not configured" }); return; }
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.json({ gifs: [] }); return; }
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  try {
    const r = await fetch(`${GIPHY_BASE}/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13`);
    const data = await r.json() as { data?: Record<string, any>[] };
    res.json({ gifs: (data.data ?? []).map(mapGif) });
  } catch (err) {
    logger.error({ err }, "gif: search fetch failed");
    res.status(500).json({ error: "Failed to search GIFs" });
  }
});

export default router;
