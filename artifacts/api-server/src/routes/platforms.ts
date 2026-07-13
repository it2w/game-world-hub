import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, platformLinksTable } from "@workspace/db";
import { LinkPlatformBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function safePlatform(p: typeof platformLinksTable.$inferSelect) {
  return {
    id: p.id,
    platform: p.platform,
    profileUrl: p.profileUrl,
    username: p.username ?? null,
    linkedAt: p.linkedAt.toISOString(),
  };
}

// GET /users/:userId/platforms
router.get("/users/:userId/platforms", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  const platforms = await db.select().from(platformLinksTable).where(eq(platformLinksTable.userId, userId));
  res.json(platforms.map(safePlatform));
});

// POST /users/:userId/platforms
router.post("/users/:userId/platforms", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = LinkPlatformBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [link] = await db
    .insert(platformLinksTable)
    .values({ userId, ...parsed.data })
    .returning();

  res.status(201).json(safePlatform(link));
});

// DELETE /users/:userId/platforms/:platformId
router.delete("/users/:userId/platforms/:platformId", requireAuth, async (req, res): Promise<void> => {
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rawPlatform = Array.isArray(req.params.platformId) ? req.params.platformId[0] : req.params.platformId;
  const userId = parseInt(rawUser, 10);
  const platformId = parseInt(rawPlatform, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .delete(platformLinksTable)
    .where(and(eq(platformLinksTable.id, platformId), eq(platformLinksTable.userId, userId)));

  res.json({ success: true });
});

export default router;
