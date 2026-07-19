/**
 * Shared XP / platform-tier computation.
 *
 * XP is derived on-read from existing activity data — no migrations needed.
 * Tiers are bands mapped to the computed level so users can never fake them.
 */

export const XP_PER = {
  friend: 50,
  partyCreated: 120,
  partyJoined: 40,
  message: 4,
  lfgPost: 70,
  lfgResponse: 35,
  game: 20,
  platform: 30,
} as const;

export interface ActivityCounts {
  friends: number;
  partiesCreated: number;
  partiesJoined: number;
  messagesSent: number;
  lfgPosts: number;
  lfgResponses: number;
  games: number;
  platforms: number;
}

export function computeXp(counts: ActivityCounts): number {
  return (
    counts.friends * XP_PER.friend +
    counts.partiesCreated * XP_PER.partyCreated +
    counts.partiesJoined * XP_PER.partyJoined +
    counts.messagesSent * XP_PER.message +
    counts.lfgPosts * XP_PER.lfgPost +
    counts.lfgResponses * XP_PER.lfgResponse +
    counts.games * XP_PER.game +
    counts.platforms * XP_PER.platform
  );
}

/**
 * Progressive level curve: level 2 costs 400 XP, each subsequent level costs
 * 200 XP more than the last, so growth is quadratic but approachable.
 */
export function computeLevel(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
} {
  let level = 1;
  let remaining = totalXp;
  let need = 400;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = 400 + (level - 1) * 200;
  }
  return { level, xpIntoLevel: remaining, xpForNext: need };
}

/**
 * Fifteen platform tiers, each with a minimum level threshold.
 * The tier is the highest one whose minLevel the user's level meets.
 * Tiers 11–15 are endgame prestige ranks for long-term players.
 */
export const TIER_DEFS = [
  { id: "INITIATE",     minLevel: 1  },
  { id: "SCOUT",        minLevel: 2  },
  { id: "OPERATIVE",    minLevel: 4  },
  { id: "HUNTER",       minLevel: 7  },
  { id: "WARRIOR",      minLevel: 11 },
  { id: "VETERAN",      minLevel: 16 },
  { id: "ELITE",        minLevel: 22 },
  { id: "CHAMPION",     minLevel: 29 },
  { id: "LEGEND",       minLevel: 37 },
  { id: "MYTHIC",       minLevel: 46 },
  { id: "CELESTIAL",    minLevel: 56 },
  { id: "TITAN",        minLevel: 67 },
  { id: "IMMORTAL",     minLevel: 79 },
  { id: "GODLIKE",      minLevel: 92 },
  { id: "TRANSCENDENT", minLevel: 106 },
] as const;

export type TierName = (typeof TIER_DEFS)[number]["id"];

export function getTier(level: number): TierName {
  let current: TierName = "INITIATE";
  for (const t of TIER_DEFS) {
    if (level >= t.minLevel) current = t.id;
  }
  return current;
}

/**
 * Compute the full XP/level/tier progress for a single user by counting
 * their activity across the platform. This is read-only and derived from
 * existing tables, so no migrations are needed.
 */
export async function getUserProgress(userId: number): Promise<{
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  tier: TierName;
}> {
  const { db } = await import("@workspace/db");
  const { count, eq } = await import("drizzle-orm");
  const {
    friendshipsTable,
    partiesTable,
    partyMembersTable,
    messagesTable,
    lfgPostsTable,
    lfgResponsesTable,
    userGamesTable,
    platformLinksTable,
  } = await import("@workspace/db");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cw = async (table: any, col: any) => {
    const [r] = await db.select({ c: count() }).from(table).where(eq(col, userId));
    return Number(r?.c ?? 0);
  };

  // Quest bonus XP stored in user_streaks
  let bonusXp = 0;
  try {
    const { pool } = await import("@workspace/db");
    const { rows } = await pool.query<{ bonus_xp: number }>(
      `SELECT bonus_xp FROM user_streaks WHERE user_id = $1`,
      [userId],
    );
    bonusXp = rows[0]?.bonus_xp ?? 0;
  } catch { /* table may not exist on first deploy */ }

  const [friends, partiesCreated, partiesJoined, messagesSent, lfgPosts, lfgResponses, games, platforms] =
    await Promise.all([
      cw(friendshipsTable, friendshipsTable.userId),
      cw(partiesTable, partiesTable.leaderId),
      cw(partyMembersTable, partyMembersTable.userId),
      cw(messagesTable, messagesTable.senderId),
      cw(lfgPostsTable, lfgPostsTable.authorId),
      cw(lfgResponsesTable, lfgResponsesTable.userId),
      cw(userGamesTable, userGamesTable.userId),
      cw(platformLinksTable, platformLinksTable.userId),
    ]);

  const activityXp = computeXp({
    friends,
    partiesCreated,
    partiesJoined,
    messagesSent,
    lfgPosts,
    lfgResponses,
    games,
    platforms,
  });
  const totalXp = activityXp + bonusXp;
  const { level, xpIntoLevel, xpForNext } = computeLevel(totalXp);
  return { totalXp, level, xpIntoLevel, xpForNext, tier: getTier(level) };
}
