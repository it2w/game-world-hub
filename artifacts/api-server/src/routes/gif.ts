import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

/** Limits per tier */
const PRO_LIMIT    = 100;
const FREE_LIMIT   = 30;
const MAX_ALLOWED  = 100; // hard cap — never exceed this toward GIPHY

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

/** Resolve whether the authenticated user is Pro. */
async function resolveIsPro(userId: number): Promise<boolean> {
  try {
    const [row] = await db
      .select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!row?.isPro) return false;
    if (row.proExpiresAt && row.proExpiresAt < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

/** GET /gif/trending */
router.get("/gif/trending", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env.GIPHY_API_KEY ?? "";
  if (!apiKey) { res.status(503).json({ error: "GIF service not configured" }); return; }

  const isPro = await resolveIsPro(req.auth!.userId);
  const tierDefault = isPro ? PRO_LIMIT : FREE_LIMIT;
  const limit = Math.min(Number(req.query.limit) || tierDefault, MAX_ALLOWED);

  try {
    const r = await fetch(`${GIPHY_BASE}/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13`);
    const data = await r.json() as { data?: Record<string, any>[] };
    res.json({ gifs: (data.data ?? []).map(mapGif), isPro });
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

  const isPro = await resolveIsPro(req.auth!.userId);
  const tierDefault = isPro ? PRO_LIMIT : FREE_LIMIT;
  const limit = Math.min(Number(req.query.limit) || tierDefault, MAX_ALLOWED);

  try {
    const r = await fetch(`${GIPHY_BASE}/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13`);
    const data = await r.json() as { data?: Record<string, any>[] };
    res.json({ gifs: (data.data ?? []).map(mapGif), isPro });
  } catch (err) {
    logger.error({ err }, "gif: search fetch failed");
    res.status(500).json({ error: "Failed to search GIFs" });
  }
});

export default router;
