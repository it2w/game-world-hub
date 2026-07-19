import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getUserProgress } from "../lib/xp";
import { db, notificationsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Tier definitions (prestige 1–6) ──────────────────────────────────────────
export const PRESTIGE_TIERS = [
  { level: 1, color: "#e5e7eb", labelEn: "Prestige I",   labelAr: "برستيج I"   },
  { level: 2, color: "#22c55e", labelEn: "Prestige II",  labelAr: "برستيج II"  },
  { level: 3, color: "#3b82f6", labelEn: "Prestige III", labelAr: "برستيج III" },
  { level: 4, color: "#a855f7", labelEn: "Prestige IV",  labelAr: "برستيج IV"  },
  { level: 5, color: "#eab308", labelEn: "Prestige V",   labelAr: "برستيج V"   },
  { level: 6, color: "#ef4444", labelEn: "Prestige VI",  labelAr: "برستيج VI"  },
] as const;

export const MAX_PRESTIGE_LEVEL = 6;
/** Minimum level required to prestige (TRANSCENDENT tier threshold in xp.ts). */
export const PRESTIGE_REQUIRED_LEVEL = 106;

// ── DDL ───────────────────────────────────────────────────────────────────────
export async function ensurePrestigeTables(): Promise<void> {
  // Add prestige columns to users (idempotent)
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS prestige_level     INT    NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS prestige_xp_offset BIGINT NOT NULL DEFAULT 0;
  `);

  // Reference table: tier colours/labels
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prestige_tiers (
      level    INT  PRIMARY KEY,
      color    TEXT NOT NULL,
      label_en TEXT NOT NULL,
      label_ar TEXT NOT NULL
    )
  `);

  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM prestige_tiers`);
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO prestige_tiers (level, color, label_en, label_ar) VALUES
        (1, '#e5e7eb', 'Prestige I',   'برستيج I'),
        (2, '#22c55e', 'Prestige II',  'برستيج II'),
        (3, '#3b82f6', 'Prestige III', 'برستيج III'),
        (4, '#a855f7', 'Prestige IV',  'برستيج IV'),
        (5, '#eab308', 'Prestige V',   'برستيج V'),
        (6, '#ef4444', 'Prestige VI',  'برستيج VI')
    `);
  }

  // Profile views: silent visit tracking (one row per viewer×owner pair;
  // view_count tracks how many times that visitor has been to that profile)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_views (
      id               SERIAL     PRIMARY KEY,
      viewer_id        INT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_owner_id INT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      view_count       INT        NOT NULL DEFAULT 1,
      viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (viewer_id, profile_owner_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS profile_views_owner_idx      ON profile_views(profile_owner_id);
    CREATE INDEX IF NOT EXISTS profile_views_owner_time_idx ON profile_views(profile_owner_id, viewed_at DESC);
  `);

  logger.info("prestige: tables ensured");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the prestige tier object for a given prestige level (0 = none). */
export function getPrestigeTier(prestigeLevel: number) {
  if (prestigeLevel <= 0) return null;
  const capped = Math.min(prestigeLevel, MAX_PRESTIGE_LEVEL);
  return PRESTIGE_TIERS[capped - 1];
}

/**
 * Silently records a profile view.  Called fire-and-forget from GET /users/:id.
 * No-op when viewer === owner or on any DB error.
 */
export async function recordProfileView(viewerId: number, profileOwnerId: number): Promise<void> {
  if (viewerId === profileOwnerId) return;
  try {
    await pool.query(
      `INSERT INTO profile_views (viewer_id, profile_owner_id, view_count, viewed_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (viewer_id, profile_owner_id)
       DO UPDATE SET viewed_at = NOW(), view_count = profile_views.view_count + 1`,
      [viewerId, profileOwnerId],
    );
  } catch (err) {
    logger.warn({ err }, "prestige: failed to record profile view");
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /auth/me/prestige — trigger prestige (requires TRANSCENDENT level)
router.post("/auth/me/prestige", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const { rows: userRows } = await pool.query<{ prestige_level: number; prestige_xp_offset: string }>(
    `SELECT prestige_level, prestige_xp_offset FROM users WHERE id = $1`,
    [userId],
  );
  if (!userRows[0]) { res.status(404).json({ error: "User not found" }); return; }

  const currentPrestige = userRows[0].prestige_level;
  if (currentPrestige >= MAX_PRESTIGE_LEVEL) {
    res.status(400).json({ error: "You have reached the maximum prestige level" });
    return;
  }

  // getUserProgress already subtracts prestige_xp_offset, so progress.level
  // reflects the CURRENT-cycle level (i.e. the level since last prestige).
  const progress = await getUserProgress(userId);
  if (progress.level < PRESTIGE_REQUIRED_LEVEL) {
    res.status(400).json({
      error: `Reach Level ${PRESTIGE_REQUIRED_LEVEL} (TRANSCENDENT) to prestige. You are currently Level ${progress.level}.`,
    });
    return;
  }

  // The new XP offset = old offset + effective XP earned this cycle.
  // This resets the effective XP to 0 without erasing any activity history.
  const oldOffset = parseInt(userRows[0].prestige_xp_offset, 10);
  const newOffset = oldOffset + progress.totalXp;
  const newPrestige = currentPrestige + 1;
  const tier = PRESTIGE_TIERS[newPrestige - 1];

  await pool.query(
    `UPDATE users SET prestige_level = $1, prestige_xp_offset = $2 WHERE id = $3`,
    [newPrestige, newOffset, userId],
  );

  // Notification (best-effort)
  try {
    await db.insert(notificationsTable as any).values({
      userId,
      type: "prestige",
      title: tier.labelEn,
      body: `You have achieved ${tier.labelEn}! Your level resets to 1 — the grind begins again.`,
      isRead: false,
    } as any);
  } catch (err) {
    logger.warn({ err }, "prestige: notification insert failed");
  }

  res.json({ prestigeLevel: newPrestige, tier, message: `${tier.labelEn} achieved!` });
});

// GET /users/:id/prestige — public badge info for any user
router.get("/users/:id/prestige", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { rows } = await pool.query<{ prestige_level: number }>(
    `SELECT prestige_level FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) { res.status(404).json({ error: "User not found" }); return; }

  const tier = getPrestigeTier(rows[0].prestige_level);
  res.json({ prestigeLevel: rows[0].prestige_level, tier });
});

// GET /auth/me/analytics — Pro-only profile analytics
router.get("/auth/me/analytics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;

  const { rows: userRows } = await pool.query<{ is_pro: boolean; pro_expires_at: string | null }>(
    `SELECT is_pro, pro_expires_at FROM users WHERE id = $1`,
    [userId],
  );
  const u = userRows[0];
  const proActive = u?.is_pro && (!u.pro_expires_at || new Date(u.pro_expires_at) > new Date());
  if (!proActive) {
    res.status(403).json({ error: "Pro subscription required", requiresPro: true });
    return;
  }

  const now = new Date();
  const dayAgo  = new Date(now.getTime() -      24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);

  // View counts
  const { rows: viewCounts } = await pool.query<{ period: string; count: string }>(
    `SELECT 'day'::text  AS period, COALESCE(SUM(view_count),0)::text AS count
       FROM profile_views WHERE profile_owner_id = $1 AND viewed_at >= $2
     UNION ALL
     SELECT 'week', COALESCE(SUM(view_count),0)::text
       FROM profile_views WHERE profile_owner_id = $1 AND viewed_at >= $3
     UNION ALL
     SELECT 'all',  COALESCE(SUM(view_count),0)::text
       FROM profile_views WHERE profile_owner_id = $1`,
    [userId, dayAgo, weekAgo],
  );
  const views: Record<string, number> = {};
  for (const r of viewCounts) views[r.period] = parseInt(r.count, 10);

  // Top 5 visitors (by recency, tie-broken by total visits)
  const { rows: topVisitors } = await pool.query<{
    viewer_id: number; viewed_at: string;
    username: string; display_name: string; avatar_url: string | null;
    visit_count: string;
  }>(
    `SELECT pv.viewer_id,
            pv.viewed_at::text,
            u.username,
            u.display_name,
            u.avatar_url,
            pv.view_count::text AS visit_count
     FROM profile_views pv
     JOIN users u ON u.id = pv.viewer_id
     WHERE pv.profile_owner_id = $1
     ORDER BY pv.viewed_at DESC
     LIMIT 5`,
    [userId],
  );

  // Friend request acceptance rate (requests sent BY this user)
  const { rows: frRows } = await pool.query<{ total: string; accepted: string }>(
    `SELECT
       COUNT(*)                                    ::text AS total,
       COUNT(*) FILTER (WHERE status = 'accepted') ::text AS accepted
     FROM friend_requests
     WHERE from_user_id = $1`,
    [userId],
  );
  const frTotal    = parseInt(frRows[0]?.total    ?? "0", 10);
  const frAccepted = parseInt(frRows[0]?.accepted ?? "0", 10);
  const friendAcceptRate = frTotal > 0 ? Math.round((frAccepted / frTotal) * 100) : null;

  // LFG response rate: % of own posts that got at least one response
  const { rows: lfgRows } = await pool.query<{ total_posts: string; posts_with_response: string }>(
    `SELECT
       COUNT(DISTINCT lp.id)                ::text AS total_posts,
       COUNT(DISTINCT lr.post_id)           ::text AS posts_with_response
     FROM lfg_posts lp
     LEFT JOIN lfg_responses lr ON lr.post_id = lp.id
     WHERE lp.author_id = $1`,
    [userId],
  );
  const lfgTotal        = parseInt(lfgRows[0]?.total_posts           ?? "0", 10);
  const lfgWithResponse = parseInt(lfgRows[0]?.posts_with_response   ?? "0", 10);
  const lfgResponseRate = lfgTotal > 0 ? Math.round((lfgWithResponse / lfgTotal) * 100) : null;

  res.json({
    views: {
      day:  views.day  ?? 0,
      week: views.week ?? 0,
      all:  views.all  ?? 0,
    },
    topVisitors: topVisitors.map(v => ({
      userId:        v.viewer_id,
      username:      v.username,
      displayName:   v.display_name,
      avatarUrl:     v.avatar_url ?? null,
      lastVisitedAt: v.viewed_at,
      visitCount:    parseInt(v.visit_count, 10),
    })),
    friendAcceptRate,
    lfgResponseRate,
  });
});

export default router;
