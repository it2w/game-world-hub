import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// GET /notifications
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, myId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      isRead: n.isRead,
      relatedId: n.relatedId ?? null,
      createdAt: n.createdAt.toISOString(),
    }))
  );
});

// POST /notifications/:notificationId/read
router.post("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.notificationId) ? req.params.notificationId[0] : req.params.notificationId;
  const notificationId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, myId)));

  res.json({ success: true });
});

// POST /notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, myId));
  res.json({ success: true });
});

export default router;
