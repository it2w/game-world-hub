import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, contentLinksTable } from "@workspace/db";
import { LinkContentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CONTENT_PLATFORMS = ["twitch", "youtube", "tiktok", "kick"] as const;

// Handles are constrained to a safe charset (see normalizeHandle), so the only
// URLs ever produced point at the canonical platform domains. We NEVER trust or
// render a client-supplied URL — that would be a stored-link injection vector.
function channelUrl(platform: string, handle: string): string {
  const h = encodeURIComponent(handle.replace(/^@/, ""));
  switch (platform) {
    case "twitch":
      return `https://twitch.tv/${h}`;
    case "youtube":
      return `https://youtube.com/@${h}`;
    case "tiktok":
      return `https://tiktok.com/@${h}`;
    case "kick":
      return `https://kick.com/${h}`;
    default:
      return "";
  }
}

// Strip an optional leading @ and accept only characters that appear in real
// creator handles. Anything else is rejected so no URL manipulation is possible.
function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(h)) return null;
  return h;
}

function safeContentLink(c: typeof contentLinksTable.$inferSelect) {
  return {
    id: c.id,
    platform: c.platform,
    handle: c.handle,
    channelUrl: channelUrl(c.platform, c.handle),
    linkedAt: c.linkedAt.toISOString(),
  };
}

// GET /users/:userId/content
router.get("/users/:userId/content", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  const links = await db.select().from(contentLinksTable).where(eq(contentLinksTable.userId, userId));
  res.json(links.map(safeContentLink));
});

// POST /users/:userId/content
router.post("/users/:userId/content", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = LinkContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!CONTENT_PLATFORMS.includes(parsed.data.platform as (typeof CONTENT_PLATFORMS)[number])) {
    res.status(400).json({ error: "Unsupported platform" });
    return;
  }

  const handle = normalizeHandle(parsed.data.handle);
  if (!handle) {
    res.status(400).json({ error: "Invalid handle" });
    return;
  }

  // Upsert: linking the same platform again updates the handle instead of failing.
  // The channel URL is always derived server-side, so `url` is never stored.
  const [link] = await db
    .insert(contentLinksTable)
    .values({
      userId,
      platform: parsed.data.platform,
      handle,
      url: null,
    })
    .onConflictDoUpdate({
      target: [contentLinksTable.userId, contentLinksTable.platform],
      set: { handle, url: null, linkedAt: new Date() },
    })
    .returning();

  res.status(201).json(safeContentLink(link));
});

// DELETE /users/:userId/content/:linkId
router.delete("/users/:userId/content/:linkId", requireAuth, async (req, res): Promise<void> => {
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rawLink = Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId;
  const userId = parseInt(rawUser, 10);
  const linkId = parseInt(rawLink, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .delete(contentLinksTable)
    .where(and(eq(contentLinksTable.id, linkId), eq(contentLinksTable.userId, userId)));

  res.json({ success: true });
});

export default router;
