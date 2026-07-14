import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, gameAccountsTable, linkedGamesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  resolveSteamId,
  fetchOwnedGames,
  steamLaunchUri,
  SteamConfigError,
  SteamResolveError,
} from "../lib/steam";

const router: IRouter = Router();

// Platforms that support manual game entry / account linking (steam is handled separately).
const MANUAL_PLATFORMS = ["epic", "battlenet", "xbox", "playstation", "nintendo", "riot", "ea", "gog", "other"];

// Only these protocol schemes may be used as launch links (prevents javascript:/data: injection).
const ALLOWED_LAUNCH_SCHEMES = [
  "steam:",
  "com.epicgames.launcher:",
  "battlenet:",
  "uplay:",
  "uplay://",
  "origin:",
  "ea:",
  "ealink:",
  "riot:",
  "rockstar:",
  "gog:",
  "goggalaxy:",
  "minecraft:",
];

function isValidLaunchUri(uri: string): boolean {
  const lower = uri.trim().toLowerCase();
  return ALLOWED_LAUNCH_SCHEMES.some((s) => lower.startsWith(s));
}

function isValidHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function safeAccount(a: typeof gameAccountsTable.$inferSelect) {
  return {
    id: a.id,
    platform: a.platform,
    externalId: a.externalId ?? null,
    handle: a.handle ?? null,
    profileUrl: a.platform === "steam" && a.externalId ? `https://steamcommunity.com/profiles/${a.externalId}` : null,
    createdAt: a.createdAt.toISOString(),
  };
}

function safeGame(g: typeof linkedGamesTable.$inferSelect) {
  // Derive the launch link server-side for steam; use the stored (validated) uri otherwise.
  const launchUri =
    g.source === "steam" && g.appId ? steamLaunchUri(g.appId) : g.launchUri ?? null;
  return {
    id: g.id,
    platform: g.platform,
    name: g.name,
    coverUrl: g.coverUrl ?? null,
    appId: g.appId ?? null,
    launchUri,
    source: g.source,
    playtimeMinutes: g.playtimeMinutes ?? null,
    createdAt: g.createdAt.toISOString(),
  };
}

// GET /users/:userId/game-accounts — a user's linked gaming accounts
router.get("/users/:userId/game-accounts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (Number.isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const rows = await db.select().from(gameAccountsTable).where(eq(gameAccountsTable.userId, userId));
  res.json(rows.map(safeAccount));
});

// GET /users/:userId/library — a user's games (imported + manual)
router.get("/users/:userId/library", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (Number.isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const rows = await db
    .select()
    .from(linkedGamesTable)
    .where(eq(linkedGamesTable.userId, userId))
    .orderBy(desc(linkedGamesTable.playtimeMinutes), linkedGamesTable.name);
  res.json(rows.map(safeGame));
});

// POST /game-accounts/steam — link Steam and import the owned-games library
router.post("/game-accounts/steam", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const input = typeof req.body?.input === "string" ? req.body.input : "";
  if (!input.trim()) {
    res.status(400).json({ error: "Enter your Steam profile URL or ID" });
    return;
  }

  try {
    const steamId = await resolveSteamId(input);
    const imported = await importSteamLibrary(myId, steamId);
    res.status(201).json({ steamId, imported });
  } catch (err) {
    if (err instanceof SteamConfigError) {
      res.status(503).json({ error: "Steam integration is not configured yet" });
      return;
    }
    if (err instanceof SteamResolveError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// POST /game-accounts/steam/sync — re-import the linked Steam library
router.post("/game-accounts/steam/sync", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const [account] = await db
    .select()
    .from(gameAccountsTable)
    .where(and(eq(gameAccountsTable.userId, myId), eq(gameAccountsTable.platform, "steam")));
  if (!account || !account.externalId) {
    res.status(404).json({ error: "No Steam account linked" });
    return;
  }
  try {
    const imported = await importSteamLibrary(myId, account.externalId);
    res.json({ imported });
  } catch (err) {
    if (err instanceof SteamConfigError) {
      res.status(503).json({ error: "Steam integration is not configured yet" });
      return;
    }
    if (err instanceof SteamResolveError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

async function importSteamLibrary(userId: number, steamId: string): Promise<number> {
  const games = await fetchOwnedGames(steamId);

  // A full reconcile inside one transaction: link the account, drop the
  // previously-imported Steam rows, and re-insert the current library. This
  // makes both "sync" and "relink to a different account" accurate — games no
  // longer owned (or belonging to the old account) are removed. Manually-added
  // games (source "manual") are left untouched.
  await db.transaction(async (tx) => {
    await tx
      .insert(gameAccountsTable)
      .values({ userId, platform: "steam", externalId: steamId })
      .onConflictDoUpdate({
        target: [gameAccountsTable.userId, gameAccountsTable.platform],
        set: { externalId: steamId },
      });

    await tx
      .delete(linkedGamesTable)
      .where(and(eq(linkedGamesTable.userId, userId), eq(linkedGamesTable.source, "steam")));

    // Steam can return several entries sharing the same display name; a single
    // INSERT ... ON CONFLICT can't touch the same (userId, platform, name) twice,
    // so collapse duplicates first (keep the one with the most playtime).
    const byName = new Map<string, (typeof games)[number]>();
    for (const g of games) {
      const key = g.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || g.playtimeMinutes > existing.playtimeMinutes) byName.set(key, g);
    }
    const uniqueGames = [...byName.values()];

    if (uniqueGames.length > 0) {
      await tx
        .insert(linkedGamesTable)
        .values(
          uniqueGames.map((g) => ({
            userId,
            platform: "steam",
            name: g.name,
            coverUrl: g.coverUrl,
            appId: g.appId,
            source: "steam",
            playtimeMinutes: g.playtimeMinutes,
          })),
        )
        // Guard against a name collision with a pre-existing manual "steam" game.
        .onConflictDoUpdate({
          target: [linkedGamesTable.userId, linkedGamesTable.platform, linkedGamesTable.name],
          set: {
            coverUrl: sql`excluded.cover_url`,
            appId: sql`excluded.app_id`,
            playtimeMinutes: sql`excluded.playtime_minutes`,
            source: sql`excluded.source`,
          },
        });
    }
  });

  return games.length;
}

// POST /game-accounts — link a non-Steam account (handle only)
router.post("/game-accounts", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "";
  const handle = typeof req.body?.handle === "string" ? req.body.handle.trim() : "";

  if (!MANUAL_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: "Unsupported platform" });
    return;
  }
  if (!handle || handle.length > 100) {
    res.status(400).json({ error: "Enter a valid handle" });
    return;
  }

  const [account] = await db
    .insert(gameAccountsTable)
    .values({ userId: myId, platform, handle })
    .onConflictDoUpdate({
      target: [gameAccountsTable.userId, gameAccountsTable.platform],
      set: { handle },
    })
    .returning();

  res.status(201).json(safeAccount(account));
});

// DELETE /game-accounts/:accountId — unlink an account and remove its games
router.delete("/game-accounts/:accountId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
  const accountId = parseInt(raw, 10);
  const myId = req.auth!.userId;
  if (Number.isNaN(accountId)) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }

  const [account] = await db
    .select()
    .from(gameAccountsTable)
    .where(and(eq(gameAccountsTable.id, accountId), eq(gameAccountsTable.userId, myId)));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  // Remove imported games for that platform (leave manually-added ones intact for non-steam).
  if (account.platform === "steam") {
    await db
      .delete(linkedGamesTable)
      .where(and(eq(linkedGamesTable.userId, myId), eq(linkedGamesTable.platform, "steam")));
  }
  await db.delete(gameAccountsTable).where(eq(gameAccountsTable.id, accountId));

  res.json({ success: true });
});

// POST /library — add a game manually
router.post("/library", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const platform = typeof req.body?.platform === "string" ? req.body.platform : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const coverUrlRaw = typeof req.body?.coverUrl === "string" ? req.body.coverUrl.trim() : "";
  const launchUriRaw = typeof req.body?.launchUri === "string" ? req.body.launchUri.trim() : "";

  if (![...MANUAL_PLATFORMS, "steam"].includes(platform)) {
    res.status(400).json({ error: "Unsupported platform" });
    return;
  }
  if (!name || name.length > 200) {
    res.status(400).json({ error: "Enter a valid game name" });
    return;
  }
  if (coverUrlRaw && !isValidHttpUrl(coverUrlRaw)) {
    res.status(400).json({ error: "Cover image must be a valid http(s) URL" });
    return;
  }
  if (launchUriRaw && !isValidLaunchUri(launchUriRaw)) {
    res.status(400).json({ error: "Launch link must be a supported game protocol (e.g. steam://, battlenet://)" });
    return;
  }

  const [game] = await db
    .insert(linkedGamesTable)
    .values({
      userId: myId,
      platform,
      name,
      coverUrl: coverUrlRaw || null,
      launchUri: launchUriRaw || null,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [linkedGamesTable.userId, linkedGamesTable.platform, linkedGamesTable.name],
      set: { coverUrl: coverUrlRaw || null, launchUri: launchUriRaw || null },
    })
    .returning();

  res.status(201).json(safeGame(game));
});

// DELETE /library/:gameId — remove a game from the library
router.delete("/library/:gameId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.gameId) ? req.params.gameId[0] : req.params.gameId;
  const gameId = parseInt(raw, 10);
  const myId = req.auth!.userId;
  if (Number.isNaN(gameId)) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }
  await db
    .delete(linkedGamesTable)
    .where(and(eq(linkedGamesTable.id, gameId), eq(linkedGamesTable.userId, myId)));
  res.json({ success: true });
});

export default router;
