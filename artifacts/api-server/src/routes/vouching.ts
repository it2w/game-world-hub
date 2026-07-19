import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  friendshipsTable,
  notificationsTable,
  pool,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";

const router: IRouter = Router();

// ─── Tag definitions ──────────────────────────────────────────────────────────

interface TagDef {
  key: string;
  emoji: string;
  color: string;
  labelEn: string;
  labelAr: string;
  /** When true the tag is only shown publicly once ≥ 3 unique givers have used it */
  requiresMultiple: boolean;
}

const TAGS: TagDef[] = [
  { key: "clutch",      emoji: "🎯", color: "#EF4444", labelEn: "Clutch",      labelAr: "نجم الفريق",  requiresMultiple: false },
  { key: "team_player", emoji: "🤝", color: "#22C55E", labelEn: "Team Player", labelAr: "لاعب الفريق", requiresMultiple: false },
  { key: "chill",       emoji: "😎", color: "#06B6D4", labelEn: "Chill",       labelAr: "مريح",         requiresMultiple: false },
  { key: "leader",      emoji: "👑", color: "#FFD700", labelEn: "Leader",      labelAr: "قائد",         requiresMultiple: false },
  { key: "toxic",       emoji: "☠️", color: "#9333EA", labelEn: "Toxic",       labelAr: "سام",          requiresMultiple: true  },
];

const TAG_KEYS = new Set(TAGS.map(t => t.key));

// ─── DB setup ─────────────────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reputation_vouches (
      id          SERIAL PRIMARY KEY,
      giver_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag         TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rep_vouches_receiver
      ON reputation_vouches(receiver_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rep_vouches_giver_receiver
      ON reputation_vouches(giver_id, receiver_id)
  `);
}

ensureTables().catch(err => console.error("[vouching] init failed:", err));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the two users are connected (friends OR shared LFG post —
 * i.e. one authored a post the other responded to, in either direction).
 */
async function hasConnection(giverId: number, receiverId: number): Promise<boolean> {
  // Check friendship (one direction is enough — friendships are bidirectional rows)
  const [friendship] = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(and(eq(friendshipsTable.userId, giverId), eq(friendshipsTable.friendId, receiverId)));
  if (friendship) return true;

  // Check shared LFG: giver posted + receiver responded, OR vice versa
  const { rows } = await pool.query<{ shared: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM lfg_posts p
       JOIN lfg_responses r ON r.post_id = p.id
       WHERE (p.author_id = $1 AND r.user_id = $2)
          OR (p.author_id = $2 AND r.user_id = $1)
     ) AS shared`,
    [giverId, receiverId],
  );
  return rows[0]?.shared ?? false;
}

// ─── POST /users/:id/vouch ────────────────────────────────────────────────────

router.post("/users/:id/vouch", requireAuth, async (req, res): Promise<void> => {
  const giverId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const receiverId = parseInt(rawId, 10);
  const { tag } = req.body as { tag?: string };

  if (isNaN(receiverId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (giverId === receiverId) {
    res.status(400).json({ error: "You cannot vouch for yourself" });
    return;
  }
  if (!tag || !TAG_KEYS.has(tag)) {
    res.status(400).json({ error: "Invalid tag. Must be one of: " + [...TAG_KEYS].join(", ") });
    return;
  }

  // Receiver must exist
  const [receiver] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, receiverId));
  if (!receiver) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Giver info (for the notification title)
  const [giver] = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, giverId));

  // Eligibility: must be friends or have shared an LFG post
  const connected = await hasConnection(giverId, receiverId);
  if (!connected) {
    res.status(403).json({ error: "You can only vouch for friends or teammates you have played with in LFG" });
    return;
  }

  // Rate-limit: one vouch per giver-receiver pair per 7 days (any tag)
  const { rows: cooldownRows } = await pool.query<{ already: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM reputation_vouches
       WHERE giver_id = $1 AND receiver_id = $2
         AND created_at >= NOW() - INTERVAL '7 days'
     ) AS already`,
    [giverId, receiverId],
  );
  if (cooldownRows[0]?.already) {
    res.status(429).json({ error: "You can only vouch for this player once every 7 days" });
    return;
  }

  // Insert vouch
  const { rows: insertRows } = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO reputation_vouches (giver_id, receiver_id, tag)
     VALUES ($1, $2, $3)
     RETURNING id, created_at::text`,
    [giverId, receiverId, tag],
  );
  const vouch = insertRows[0]!;

  // Notification
  const tagDef = TAGS.find(t => t.key === tag)!;
  const notifTitle = `${giver.displayName} gave you a ${tagDef.emoji} ${tagDef.labelEn} vouch!`;

  await db.insert(notificationsTable).values({
    userId: receiverId,
    type: "reputation_vouch",
    title: notifTitle,
    relatedId: vouch.id,
  });

  // Real-time push to receiver's open WS connections
  pushToUser(receiverId, {
    type: "reputation_vouch",
    vouchId: vouch.id,
    giverId,
    giverName: giver.displayName,
    tag,
    emoji: tagDef.emoji,
    labelEn: tagDef.labelEn,
    title: notifTitle,
  });

  res.status(201).json({ id: vouch.id, tag, createdAt: vouch.created_at });
});

// ─── GET /users/:id/reputation ────────────────────────────────────────────────

router.get("/users/:id/reputation", requireAuth, async (req, res): Promise<void> => {
  const viewerId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const profileUserId = parseInt(rawId, 10);
  if (isNaN(profileUserId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  // Aggregate tag counts with unique-giver counts (for the toxic threshold)
  const { rows: countRows } = await pool.query<{
    tag: string;
    count: string;
    unique_givers: string;
  }>(
    `SELECT tag,
            COUNT(*)               AS count,
            COUNT(DISTINCT giver_id) AS unique_givers
     FROM reputation_vouches
     WHERE receiver_id = $1
     GROUP BY tag`,
    [profileUserId],
  );

  // Determine language preference from Accept-Language header
  const lang = (req.headers["accept-language"] ?? "en").startsWith("ar") ? "ar" : "en";

  // Build public tag summary — hide toxic if fewer than 3 distinct givers
  const tagSummary = countRows
    .filter(row => {
      const def = TAGS.find(t => t.key === row.tag);
      if (!def) return false;
      if (def.requiresMultiple && parseInt(row.unique_givers) < 3) return false;
      return true;
    })
    .map(row => {
      const def = TAGS.find(t => t.key === row.tag)!;
      return {
        key: row.tag,
        emoji: def.emoji,
        color: def.color,
        label: lang === "ar" ? def.labelAr : def.labelEn,
        count: parseInt(row.count),
      };
    })
    .sort((a, b) => b.count - a.count);

  // Can the viewer grant a vouch? (not own profile + has connection + not on cooldown)
  const canVouch = viewerId !== profileUserId && (await hasConnection(viewerId, profileUserId));

  // On cooldown?
  const { rows: cdRows } = await pool.query<{ already: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM reputation_vouches
       WHERE giver_id = $1 AND receiver_id = $2
         AND created_at >= NOW() - INTERVAL '7 days'
     ) AS already`,
    [viewerId, profileUserId],
  );
  const alreadyVouched = cdRows[0]?.already ?? false;

  // Pro detail: viewer is the profile owner AND has an active Pro subscription →
  // include the list of who gave each vouch (up to 50 most recent)
  let granters:
    | Array<{ userId: number; username: string; displayName: string; avatarUrl: string | null; tag: string; createdAt: string }>
    | undefined;

  if (viewerId === profileUserId) {
    const [viewerUser] = await db
      .select({ isPro: usersTable.isPro, proExpiresAt: usersTable.proExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, viewerId));
    const isProActive =
      viewerUser?.isPro && (!viewerUser.proExpiresAt || viewerUser.proExpiresAt > new Date());

    if (isProActive) {
      const { rows: granterRows } = await pool.query<{
        giver_id: number;
        username: string;
        display_name: string;
        avatar_url: string | null;
        tag: string;
        created_at: string;
      }>(
        `SELECT rv.giver_id,
                u.username,
                u.display_name,
                u.avatar_url,
                rv.tag,
                rv.created_at::text
         FROM reputation_vouches rv
         JOIN users u ON u.id = rv.giver_id
         WHERE rv.receiver_id = $1
         ORDER BY rv.created_at DESC
         LIMIT 50`,
        [profileUserId],
      );
      granters = granterRows.map(r => ({
        userId: r.giver_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        tag: r.tag,
        createdAt: r.created_at,
      }));
    }
  }

  // Available tags (for the vouch dialog UI)
  const availableTags = TAGS.map(t => ({
    key: t.key,
    emoji: t.emoji,
    color: t.color,
    label: lang === "ar" ? t.labelAr : t.labelEn,
  }));

  res.json({
    tags: tagSummary,
    availableTags,
    canVouch,
    alreadyVouched,
    granters,
  });
});

export default router;
