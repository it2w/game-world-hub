import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, usersTable, gamesTable, userGamesTable } from "@workspace/db";
import { AddGameBody, AddUserGameBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function safeGame(g: typeof gamesTable.$inferSelect) {
  return {
    id: g.id,
    name: g.name,
    coverUrl: g.coverUrl ?? null,
    genre: g.genre ?? null,
    platforms: g.platforms ?? [],
    createdAt: g.createdAt.toISOString(),
  };
}

// GET /games
router.get("/games", requireAuth, async (_req, res): Promise<void> => {
  const games = await db.select().from(gamesTable).orderBy(gamesTable.name);
  res.json(games.map(safeGame));
});

// POST /games
router.post("/games", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [game] = await db.insert(gamesTable).values(parsed.data).returning();
  res.status(201).json(safeGame(game));
});

// GET /users/:userId/games
router.get("/users/:userId/games", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  const rows = await db
    .select({ ug: userGamesTable, game: gamesTable })
    .from(userGamesTable)
    .innerJoin(gamesTable, eq(userGamesTable.gameId, gamesTable.id))
    .where(eq(userGamesTable.userId, userId));

  res.json(
    rows.map((r) => ({
      id: r.ug.id,
      game: safeGame(r.game),
      addedAt: r.ug.addedAt.toISOString(),
    }))
  );
});

// POST /users/:userId/games
router.post("/users/:userId/games", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = AddUserGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ug] = await db
    .insert(userGamesTable)
    .values({ userId, gameId: parsed.data.gameId })
    .returning();

  const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, parsed.data.gameId));

  res.status(201).json({
    id: ug.id,
    game: safeGame(game),
    addedAt: ug.addedAt.toISOString(),
  });
});

// DELETE /users/:userId/games/:gameId
router.delete("/users/:userId/games/:gameId", requireAuth, async (req, res): Promise<void> => {
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rawGame = Array.isArray(req.params.gameId) ? req.params.gameId[0] : req.params.gameId;
  const userId = parseInt(rawUser, 10);
  const gameId = parseInt(rawGame, 10);

  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .delete(userGamesTable)
    .where(and(eq(userGamesTable.userId, userId), eq(userGamesTable.gameId, gameId)));

  res.json({ success: true });
});

export default router;
