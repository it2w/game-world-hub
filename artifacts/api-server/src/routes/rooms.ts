import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, permanentRoomsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { computeProStatus } from "../lib/pro";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();

function safeRoom(r: typeof permanentRoomsTable.$inferSelect, owner: typeof usersTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    imageUrl: r.imageUrl ?? null,
    hasPassword: !!r.passwordHash,
    createdAt: r.createdAt,
    owner: {
      id: owner.id,
      username: owner.username,
      displayName: owner.displayName,
      avatarUrl: toPublicImageUrl(owner.avatarUrl ?? null),
    },
  };
}

/** GET /api/rooms — list all rooms (public browse) */
router.get("/rooms", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(permanentRoomsTable)
      .innerJoin(usersTable, eq(permanentRoomsTable.ownerId, usersTable.id))
      .orderBy(desc(permanentRoomsTable.createdAt));
    res.json(rows.map((r) => safeRoom(r.permanent_rooms, r.users)));
  } catch (err) {
    logger.error({ err }, "rooms: list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** GET /api/rooms/mine — get my room */
router.get("/rooms/mine", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  try {
    const [row] = await db
      .select()
      .from(permanentRoomsTable)
      .innerJoin(usersTable, eq(permanentRoomsTable.ownerId, usersTable.id))
      .where(eq(permanentRoomsTable.ownerId, userId));
    if (!row) { res.json(null); return; }
    res.json(safeRoom(row.permanent_rooms, row.users));
  } catch (err) {
    logger.error({ err }, "rooms: mine failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /api/rooms — create room (Pro only, 1 per user) */
router.post("/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const pro = await computeProStatus(userId);
  if (!pro.isPro) { res.status(403).json({ error: "Pro required" }); return; }

  const { name, description, password } = req.body as { name?: string; description?: string; password?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const [existing] = await db.select({ id: permanentRoomsTable.id })
      .from(permanentRoomsTable).where(eq(permanentRoomsTable.ownerId, userId));
    if (existing) { res.status(409).json({ error: "You already have a room" }); return; }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const [room] = await db.insert(permanentRoomsTable).values({
      ownerId: userId,
      name: name.trim(),
      description: description?.trim() || null,
      passwordHash,
    }).returning();

    const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json(safeRoom(room, owner));
  } catch (err) {
    logger.error({ err }, "rooms: create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** PATCH /api/rooms/mine — update name/description/password */
router.patch("/rooms/mine", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const pro = await computeProStatus(userId);
  if (!pro.isPro) { res.status(403).json({ error: "Pro required" }); return; }

  const { name, description, password, clearPassword } = req.body as {
    name?: string; description?: string; password?: string; clearPassword?: boolean;
  };

  try {
    const update: Partial<typeof permanentRoomsTable.$inferInsert> = { updatedAt: new Date() };
    if (name?.trim()) update.name = name.trim();
    if (description !== undefined) update.description = description?.trim() || null;
    if (clearPassword) update.passwordHash = null;
    else if (password) update.passwordHash = await bcrypt.hash(password, 10);

    const [room] = await db.update(permanentRoomsTable)
      .set(update)
      .where(eq(permanentRoomsTable.ownerId, userId))
      .returning();
    if (!room) { res.status(404).json({ error: "No room found" }); return; }

    const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.json(safeRoom(room, owner));
  } catch (err) {
    logger.error({ err }, "rooms: update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** DELETE /api/rooms/mine */
router.delete("/rooms/mine", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  try {
    await db.delete(permanentRoomsTable).where(eq(permanentRoomsTable.ownerId, userId));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "rooms: delete failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** POST /api/rooms/:id/verify-password — check password before token issuance */
router.post("/rooms/:id/verify-password", requireAuth, async (req, res): Promise<void> => {
  const roomId = Number(req.params.id);
  const { password } = req.body as { password?: string };
  try {
    const [room] = await db.select().from(permanentRoomsTable)
      .where(eq(permanentRoomsTable.id, roomId));
    if (!room) { res.status(404).json({ error: "Room not found" }); return; }
    if (!room.passwordHash) { res.json({ ok: true }); return; }
    if (!password) { res.status(401).json({ error: "Password required" }); return; }
    const ok = await bcrypt.compare(password, room.passwordHash);
    if (!ok) { res.status(401).json({ error: "Wrong password" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rooms: verify-password failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
