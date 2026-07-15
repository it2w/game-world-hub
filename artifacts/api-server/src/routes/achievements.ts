import { Router, type IRouter } from "express";
import { count, eq } from "drizzle-orm";
import {
  db,
  friendshipsTable,
  partiesTable,
  partyMembersTable,
  messagesTable,
  lfgPostsTable,
  lfgResponsesTable,
  userGamesTable,
  platformLinksTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getUserProgress } from "../lib/xp";

const router: IRouter = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countWhere(table: any, column: any, userId: number): Promise<number> {
  const [row] = await db.select({ c: count() }).from(table).where(eq(column, userId));
  return Number(row?.c ?? 0);
}

// GET /achievements — the authenticated player's rank, XP and achievement grid.
router.get("/achievements", requireAuth, async (req, res) => {
  const myId = req.auth!.userId;

  const [progress, friends, partiesCreated, partiesJoined, messagesSent, lfgPosts, lfgResponses, games, platforms] = await Promise.all([
    getUserProgress(myId),
    countWhere(friendshipsTable, friendshipsTable.userId, myId),
    countWhere(partiesTable, partiesTable.leaderId, myId),
    countWhere(partyMembersTable, partyMembersTable.userId, myId),
    countWhere(messagesTable, messagesTable.senderId, myId),
    countWhere(lfgPostsTable, lfgPostsTable.authorId, myId),
    countWhere(lfgResponsesTable, lfgResponsesTable.userId, myId),
    countWhere(userGamesTable, userGamesTable.userId, myId),
    countWhere(platformLinksTable, platformLinksTable.userId, myId),
  ]);
  const { level, totalXp, xpIntoLevel, xpForNext, tier } = progress;

  const stats = {
    friends,
    partiesCreated,
    partiesJoined,
    messagesSent,
    lfgPosts,
    lfgResponses,
    games,
    platforms,
  };

  const defs: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    current: number;
    target: number;
  }> = [
    { id: "first_contact", name: "First Contact", description: "Add your first ally", icon: "UserPlus", current: friends, target: 1 },
    { id: "social_butterfly", name: "Network Node", description: "Reach 10 allies", icon: "Users", current: friends, target: 10 },
    { id: "squad_leader", name: "Squad Leader", description: "Create 3 parties", icon: "Crown", current: partiesCreated, target: 3 },
    { id: "team_player", name: "Team Player", description: "Join 5 parties", icon: "Swords", current: partiesJoined, target: 5 },
    { id: "chatterbox", name: "Comms Expert", description: "Send 50 messages", icon: "MessageSquare", current: messagesSent, target: 50 },
    { id: "signal_caller", name: "Signal Caller", description: "Post 3 LFG signals", icon: "Radar", current: lfgPosts, target: 3 },
    { id: "wingman", name: "Wingman", description: "Answer 5 LFG signals", icon: "Handshake", current: lfgResponses, target: 5 },
    { id: "collector", name: "Collector", description: "Add 5 games to your library", icon: "Gamepad2", current: games, target: 5 },
    { id: "cross_platform", name: "Cross-Platform", description: "Link 2 platforms", icon: "Link2", current: platforms, target: 2 },
    { id: "veteran", name: "Veteran", description: "Reach level 5", icon: "Shield", current: level, target: 5 },
    { id: "legend", name: "Legend", description: "Reach level 10", icon: "Trophy", current: level, target: 10 },
  ];

  const achievements = defs.map((d) => ({
    ...d,
    current: Math.min(d.current, d.target),
    unlocked: d.current >= d.target,
  }));

  res.json({
    level,
    rank: tier,
    totalXp,
    xpIntoLevel,
    xpForNext,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    totalCount: achievements.length,
    stats,
    achievements,
  });
});

export default router;
