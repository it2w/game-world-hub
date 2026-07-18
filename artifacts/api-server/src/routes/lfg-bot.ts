import { Router, type IRouter } from "express";
import { eq, and, isNull, or, lt, sql } from "drizzle-orm";
import {
  db,
  lfgBotSettingsTable,
  usersTable,
  lfgPostsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /lfg/bot
router.get("/lfg/bot", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const [settings] = await db
    .select()
    .from(lfgBotSettingsTable)
    .where(eq(lfgBotSettingsTable.userId, myId));
  res.json(settings ?? null);
});

// PUT /lfg/bot
router.put("/lfg/bot", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;

  // Check Pro
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
  const now = new Date();
  const isPro = user.isPro && (!user.proExpiresAt || user.proExpiresAt > now);
  if (!isPro) {
    res.status(403).json({ error: "LFG Bot is a Pro feature" });
    return;
  }

  const {
    game,
    platform,
    rank,
    description,
    neededPlayers,
    micRequired,
    intervalMinutes,
    enabled,
  } = req.body as {
    game?: string;
    platform?: string;
    rank?: string;
    description?: string;
    neededPlayers?: number;
    micRequired?: boolean;
    intervalMinutes?: number;
    enabled?: boolean;
  };

  if (!game || !description) {
    res.status(400).json({ error: "game and description are required" });
    return;
  }

  const values = {
    userId: myId,
    game,
    platform: platform ?? null,
    rank: rank ?? null,
    description,
    neededPlayers: neededPlayers ?? 1,
    micRequired: micRequired ?? false,
    intervalMinutes: Math.max(30, intervalMinutes ?? 60),
    enabled: enabled ?? false,
  };

  const [existing] = await db
    .select()
    .from(lfgBotSettingsTable)
    .where(eq(lfgBotSettingsTable.userId, myId));

  if (existing) {
    const [updated] = await db
      .update(lfgBotSettingsTable)
      .set(values)
      .where(eq(lfgBotSettingsTable.userId, myId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(lfgBotSettingsTable)
      .values(values)
      .returning();
    res.json(created);
  }
});

// DELETE /lfg/bot
router.delete("/lfg/bot", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  await db
    .update(lfgBotSettingsTable)
    .set({ enabled: false })
    .where(eq(lfgBotSettingsTable.userId, myId));
  res.json({ success: true });
});

// ── LFG Bot Runner ────────────────────────────────────────────────────────────

export function startLfgBotRunner(): void {
  setInterval(() => {
    void runLfgBotCycle().catch((err) =>
      logger.error({ err }, "lfg-bot: runner cycle failed"),
    );
  }, 60_000);
  logger.info("lfg-bot: runner started");
}

async function runLfgBotCycle(): Promise<void> {
  const now = new Date();
  const enabled = await db
    .select()
    .from(lfgBotSettingsTable)
    .where(eq(lfgBotSettingsTable.enabled, true));

  for (const bot of enabled) {
    const staleMs = bot.intervalMinutes * 60 * 1000;
    const isDue =
      bot.lastPostedAt === null ||
      now.getTime() - bot.lastPostedAt.getTime() >= staleMs;

    if (!isDue) continue;

    try {
      // Close any previously open bot post for this user
      await db
        .update(lfgPostsTable)
        .set({ status: "closed" })
        .where(
          and(
            eq(lfgPostsTable.authorId, bot.userId),
            eq(lfgPostsTable.status, "open"),
          ),
        );

      const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h
      await db.insert(lfgPostsTable).values({
        authorId: bot.userId,
        game: bot.game,
        platform: bot.platform,
        rank: bot.rank,
        description: `[🤖 Auto] ${bot.description}`,
        neededPlayers: bot.neededPlayers,
        micRequired: bot.micRequired,
        expiresAt,
      });

      await db
        .update(lfgBotSettingsTable)
        .set({ lastPostedAt: now })
        .where(eq(lfgBotSettingsTable.id, bot.id));

      logger.info({ userId: bot.userId, game: bot.game }, "lfg-bot: posted");
    } catch (err) {
      logger.error({ err, userId: bot.userId }, "lfg-bot: failed to post");
    }
  }
}

export default router;
