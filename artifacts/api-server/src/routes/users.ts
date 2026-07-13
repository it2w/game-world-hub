import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, usersTable, userGamesTable, gamesTable, platformLinksTable } from "@workspace/db";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? null,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

// GET /users/search
router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Query is required" });
    return;
  }
  const users = await db.select().from(usersTable)
    .where(ilike(usersTable.username, `%${q}%`))
    .limit(20);
  res.json(users.filter(u => u.id !== req.auth!.userId).map(safeUser));
});

// GET /users/:userId
router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const games = await db.select({ id: userGamesTable.id, game: gamesTable, addedAt: userGamesTable.addedAt })
    .from(userGamesTable)
    .innerJoin(gamesTable, eq(userGamesTable.gameId, gamesTable.id))
    .where(eq(userGamesTable.userId, userId));

  const platforms = await db.select().from(platformLinksTable).where(eq(platformLinksTable.userId, userId));

  res.json({
    ...safeUser(user),
    games: games.map(g => ({
      id: g.id,
      game: {
        id: g.game.id,
        name: g.game.name,
        coverUrl: g.game.coverUrl ?? null,
        genre: g.game.genre ?? null,
        platforms: g.game.platforms ?? [],
        createdAt: g.game.createdAt.toISOString(),
      },
      addedAt: g.addedAt.toISOString(),
    })),
    platforms: platforms.map(p => ({
      id: p.id,
      platform: p.platform,
      profileUrl: p.profileUrl,
      username: p.username ?? null,
      linkedAt: p.linkedAt.toISOString(),
    })),
  });
});

// PATCH /users/:userId/profile
router.patch("/users/:userId/profile", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db.update(usersTable)
    .set({ ...parsed.data })
    .where(eq(usersTable.id, userId))
    .returning();

  const games = await db.select({ id: userGamesTable.id, game: gamesTable, addedAt: userGamesTable.addedAt })
    .from(userGamesTable)
    .innerJoin(gamesTable, eq(userGamesTable.gameId, gamesTable.id))
    .where(eq(userGamesTable.userId, userId));

  const platforms = await db.select().from(platformLinksTable).where(eq(platformLinksTable.userId, userId));

  res.json({
    ...safeUser(user),
    games: games.map(g => ({
      id: g.id,
      game: {
        id: g.game.id,
        name: g.game.name,
        coverUrl: g.game.coverUrl ?? null,
        genre: g.game.genre ?? null,
        platforms: g.game.platforms ?? [],
        createdAt: g.game.createdAt.toISOString(),
      },
      addedAt: g.addedAt.toISOString(),
    })),
    platforms: platforms.map(p => ({
      id: p.id,
      platform: p.platform,
      profileUrl: p.profileUrl,
      username: p.username ?? null,
      linkedAt: p.linkedAt.toISOString(),
    })),
  });
});

export default router;
