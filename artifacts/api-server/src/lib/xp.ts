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
 * Ten platform tiers, each with a minimum level threshold.
 * The tier is the highest one whose minLevel the user's level meets.
 */
export const TIER_DEFS = [
  { id: "INITIATE",  minLevel: 1  },
  { id: "SCOUT",     minLevel: 2  },
  { id: "OPERATIVE", minLevel: 4  },
  { id: "HUNTER",    minLevel: 7  },
  { id: "WARRIOR",   minLevel: 11 },
  { id: "VETERAN",   minLevel: 16 },
  { id: "ELITE",     minLevel: 22 },
  { id: "CHAMPION",  minLevel: 29 },
  { id: "LEGEND",    minLevel: 37 },
  { id: "MYTHIC",    minLevel: 46 },
] as const;

export type TierName = (typeof TIER_DEFS)[number]["id"];

export function getTier(level: number): TierName {
  let current: TierName = "INITIATE";
  for (const t of TIER_DEFS) {
    if (level >= t.minLevel) current = t.id;
  }
  return current;
}
