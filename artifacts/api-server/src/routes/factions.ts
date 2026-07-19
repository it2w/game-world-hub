/**
 * Faction Wars + Seasonal Rankings + Hall of Fame
 *
 * Three factions (Shadows / Titans / Ghosts) compete weekly.
 * Seasons last 3 months; when one ends the top 10 enter the Hall of Fame
 * and a new season starts automatically.
 *
 * Tables created here with raw SQL (no drizzle migration):
 *   factions, user_factions, seasons, hall_of_fame
 */
import { Router, type IRouter } from "express";
import { db, pool, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";
import { logger } from "../lib/logger";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

/** Narrow Express param string | string[] */
function p(v: string | string[]): string { return Array.isArray(v) ? v[0] : v; }

// ── Table setup ───────────────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS factions (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,  -- shadows | titans | ghosts
      color       TEXT NOT NULL,          -- hex color
      icon_emoji  TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_factions (
      user_id    INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      faction_id INTEGER NOT NULL REFERENCES factions(id),
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      start_date  TIMESTAMPTZ NOT NULL,
      end_date    TIMESTAMPTZ NOT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Tracks which ISO weeks have already had war-result notifications sent
    CREATE TABLE IF NOT EXISTS faction_war_notif_log (
      week_key TEXT NOT NULL PRIMARY KEY,  -- e.g. "2026-W29"
      sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id           SERIAL PRIMARY KEY,
      season_id    INTEGER NOT NULL REFERENCES seasons(id),
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rank         INTEGER NOT NULL,
      total_xp     INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      username     TEXT NOT NULL,
      avatar_url   TEXT,
      faction_slug TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(season_id, rank)
    );
  `);

  // Seed the three factions
  await pool.query(`
    INSERT INTO factions (name, slug, color, icon_emoji, description) VALUES
      ('Shadows', 'shadows', '#7c3aed', '👤', 'Masters of stealth and precision. They strike without warning and vanish without a trace.'),
      ('Titans',  'titans',  '#dc2626', '⚔️', 'Warriors of raw power and unstoppable force. They dominate through strength and aggression.'),
      ('Ghosts',  'ghosts',  '#0891b2', '👻', 'Tactical geniuses who outthink every opponent. Swift, coordinated, and always three moves ahead.')
    ON CONFLICT (slug) DO NOTHING;
  `);

  // Ensure there is always exactly one active season
  const { rows: active } = await pool.query(`SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1`);
  if (active.length === 0) {
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 3);
    const name = `Season ${now.getFullYear()}-S${Math.ceil((now.getMonth() + 1) / 3)}`;
    await pool.query(
      `INSERT INTO seasons (name, start_date, end_date, is_active) VALUES ($1, $2, $3, TRUE)`,
      [name, now, end],
    );
    logger.info({ name }, "factions: created initial season");
  }
}

// ── Season sweep cron ─────────────────────────────────────────────────────────

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

type UserRow = { id: number; username: string; display_name: string; avatar_url: string | null; faction_slug: string | null; computed_xp: number };

async function sweepSeasons(): Promise<void> {
  try {
    const { rows: expired } = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM seasons WHERE is_active = TRUE AND end_date < NOW()`,
    );
    for (const season of expired) {
      // Snapshot top 10 users by XP
      const { rows: top } = await pool.query<UserRow>(`
        SELECT
          u.id, u.username, u.display_name, u.avatar_url,
          uf_faction.slug AS faction_slug,
          (
            (SELECT COUNT(*)::INT FROM friendships        WHERE user_id   = u.id) * 50  +
            (SELECT COUNT(*)::INT FROM parties            WHERE leader_id = u.id) * 120 +
            (SELECT COUNT(*)::INT FROM party_members      WHERE user_id   = u.id) * 40  +
            (SELECT COUNT(*)::INT FROM messages           WHERE sender_id = u.id) * 4   +
            (SELECT COUNT(*)::INT FROM lfg_posts          WHERE author_id = u.id) * 70  +
            (SELECT COUNT(*)::INT FROM lfg_responses      WHERE user_id   = u.id) * 35  +
            (SELECT COUNT(*)::INT FROM user_games         WHERE user_id   = u.id) * 20  +
            (SELECT COUNT(*)::INT FROM platform_links     WHERE user_id   = u.id) * 30  +
            COALESCE((SELECT bonus_xp FROM user_streaks   WHERE user_id   = u.id), 0)
          ) AS computed_xp
        FROM users u
        LEFT JOIN user_factions uf ON uf.user_id = u.id
        LEFT JOIN factions uf_faction ON uf_faction.id = uf.faction_id
        ORDER BY computed_xp DESC
        LIMIT 10
      `);

      for (let i = 0; i < top.length; i++) {
        const u = top[i];
        await pool.query(
          `INSERT INTO hall_of_fame (season_id, user_id, rank, total_xp, display_name, username, avatar_url, faction_slug)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (season_id, rank) DO NOTHING`,
          [season.id, u.id, i + 1, u.computed_xp, u.display_name, u.username, u.avatar_url, u.faction_slug],
        );
        // Notify the top-10 players
        const [notification] = await db
          .insert(notificationsTable)
          .values({
            userId: u.id,
            type: "hall_of_fame",
            title: "Hall of Fame!",
            body: `You ranked #${i + 1} in ${season.name} with ${u.computed_xp.toLocaleString()} XP!`,
          })
          .returning();
        pushToUser(u.id, { type: "notification", notification });
      }

      // Mark season as ended
      await pool.query(`UPDATE seasons SET is_active = FALSE WHERE id = $1`, [season.id]);

      // Create next season automatically
      const now = new Date();
      const end = new Date(now);
      end.setMonth(end.getMonth() + 3);
      const idx = Math.ceil((now.getMonth() + 1) / 3);
      const newName = `Season ${now.getFullYear()}-S${idx}`;
      await pool.query(
        `INSERT INTO seasons (name, start_date, end_date, is_active) VALUES ($1, $2, $3, TRUE)`,
        [newName, now, end],
      );

      logger.info({ season: season.name, topCount: top.length }, "factions: season ended, HoF snapshotted, new season created");

      // Notify ALL users with faction membership about the new season
      const { rows: allFactionUsers } = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM user_factions`,
      );
      for (const { user_id } of allFactionUsers) {
        const [notification] = await db
          .insert(notificationsTable)
          .values({
            userId: user_id,
            type: "new_season",
            title: "New Season Started!",
            body: `${season.name} has ended. ${newName} has begun! Compete for glory.`,
          })
          .returning();
        pushToUser(user_id, { type: "notification", notification });
      }
    }
  } catch (err) {
    logger.error({ err }, "factions: season sweep failed");
  }
}

// ── Weekly war notification cron ──────────────────────────────────────────────

/** Returns ISO year-week string like "2026-W29" for the *previous* ISO week */
export function prevWeekKey(nowOverride?: Date): string {
  const now = nowOverride ?? new Date();
  // Go back 7 days to reliably land in the previous week
  const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day = d.getUTCDay() || 7; // 1=Mon, 7=Sun
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (4 - day)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Current ISO week key */
function currentWeekKey(nowOverride?: Date): string {
  const now = nowOverride ?? new Date();
  const day = now.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (4 - day)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function sweepWeeklyWarNotifications(nowOverride?: Date): Promise<void> {
  try {
    const wk = prevWeekKey(nowOverride);
    // Check if already sent for this week
    const { rows: already } = await pool.query(
      `SELECT 1 FROM faction_war_notif_log WHERE week_key = $1`,
      [wk],
    );
    if (already.length > 0) return; // already notified

    // We only send notifications when we're in a NEW week (day 1 = Monday, or early days)
    // Check: is the previous week key != current week key? (i.e., week has turned over)
    // This is always true since prevWeekKey() goes back 7 days. We guard with the notif log.

    // Compute last week's war standings using the same weekly SQL but shifted to last week's window
    const { rows: standings } = await pool.query<{ id: number; name: string; slug: string; color: string; icon_emoji: string; weekly_points: number; member_count: number }>(`
      WITH user_activity AS (
        SELECT
          uf.user_id, uf.faction_id,
          (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = uf.user_id AND created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') * 5 +
          (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = uf.user_id AND created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') * 3 +
          (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = uf.user_id AND created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days') * 1
          AS weekly_pts
        FROM user_factions uf
      )
      SELECT
        f.id, f.name, f.slug, f.color, f.icon_emoji,
        COALESCE(SUM(ua.weekly_pts), 0)::INT AS weekly_points,
        COUNT(ua.user_id)::INT               AS member_count
      FROM factions f
      LEFT JOIN user_activity ua ON ua.faction_id = f.id
      GROUP BY f.id, f.name, f.slug, f.color, f.icon_emoji
      ORDER BY weekly_points DESC
    `);

    if (standings.length === 0) return;
    const winner = standings[0];

    // Mark as sent BEFORE sending to avoid duplicate notifications on retry
    await pool.query(
      `INSERT INTO faction_war_notif_log (week_key) VALUES ($1) ON CONFLICT DO NOTHING`,
      [wk],
    );

    // Build result summary text
    const summary = standings
      .map((f, i) => `${["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`} ${f.name}: ${f.weekly_points.toLocaleString()} pts`)
      .join(" | ");

    // Notify all users with a faction
    const { rows: members } = await pool.query<{ user_id: number; faction_id: number }>(
      `SELECT user_id, faction_id FROM user_factions`,
    );
    for (const m of members) {
      const isWinnerFaction = m.faction_id === winner.id;
      const [notification] = await db
        .insert(notificationsTable)
        .values({
          userId: m.user_id,
          type: "faction_war_result",
          title: isWinnerFaction ? `${winner.name} wins this week! ⚔️` : `Week ${wk} War Results`,
          body: summary,
        })
        .returning();
      pushToUser(m.user_id, { type: "notification", notification });
    }

    logger.info({ week: wk, winner: winner.name, notified: members.length }, "factions: weekly war notifications sent");
  } catch (err) {
    logger.error({ err }, "factions: weekly war notification sweep failed");
  }
}

// Start after tables are ready
ensureTables()
  .then(() => {
    void sweepSeasons();
    void sweepWeeklyWarNotifications();
    setInterval(() => void sweepSeasons(), SWEEP_INTERVAL_MS).unref();
    setInterval(() => void sweepWeeklyWarNotifications(), SWEEP_INTERVAL_MS).unref();
  })
  .catch(err => logger.error({ err }, "factions: ensureTables failed"));

// ── Weekly war points helper ──────────────────────────────────────────────────

const WAR_SQL = `
  WITH user_activity AS (
    SELECT
      uf.user_id,
      uf.faction_id,
      (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = uf.user_id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 5 +
      (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = uf.user_id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 3 +
      (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = uf.user_id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 1
      AS weekly_pts
    FROM user_factions uf
  )
  SELECT
    f.id, f.name, f.slug, f.color, f.icon_emoji, f.description,
    COALESCE(SUM(ua.weekly_pts), 0)::INT AS weekly_points,
    COUNT(ua.user_id)::INT               AS member_count,
    COUNT(CASE WHEN ua.weekly_pts > 0 THEN 1 END)::INT AS active_members
  FROM factions f
  LEFT JOIN user_activity ua ON ua.faction_id = f.id
  GROUP BY f.id, f.name, f.slug, f.color, f.icon_emoji, f.description
  ORDER BY weekly_points DESC
`;

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /factions — all factions with war stats
router.get("/factions", requireAuth, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(WAR_SQL);
  res.json(rows);
});

// GET /factions/me — current user's faction (null if not joined)
router.get("/factions/me", requireAuth, async (req, res): Promise<void> => {
  const { rows } = await pool.query<{ faction_id: number; joined_at: string; name: string; slug: string; color: string; icon_emoji: string; description: string }>(
    `SELECT uf.faction_id, uf.joined_at, f.name, f.slug, f.color, f.icon_emoji, f.description
     FROM user_factions uf
     JOIN factions f ON f.id = uf.faction_id
     WHERE uf.user_id = $1`,
    [req.auth!.userId],
  );
  if (!rows[0]) { res.json(null); return; }
  const r = rows[0];
  res.json({ id: r.faction_id, name: r.name, slug: r.slug, color: r.color, iconEmoji: r.icon_emoji, description: r.description, joinedAt: r.joined_at });
});

// GET /users/:userId/faction — any user's faction (for profile badges)
router.get("/users/:userId/faction", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(p(req.params.userId), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { rows } = await pool.query<{ faction_id: number; name: string; slug: string; color: string; icon_emoji: string }>(
    `SELECT uf.faction_id, f.name, f.slug, f.color, f.icon_emoji
     FROM user_factions uf
     JOIN factions f ON f.id = uf.faction_id
     WHERE uf.user_id = $1`,
    [userId],
  );
  if (!rows[0]) { res.json(null); return; }
  const r = rows[0];
  res.json({ id: r.faction_id, name: r.name, slug: r.slug, color: r.color, iconEmoji: r.icon_emoji });
});

// POST /factions/:id/join — join a faction (one-time, permanent)
router.post("/factions/:id/join", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const factionId = parseInt(p(req.params.id), 10);
  if (isNaN(factionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Check already in a faction
  const { rows: existing } = await pool.query(
    `SELECT faction_id FROM user_factions WHERE user_id = $1`,
    [meId],
  );
  if (existing.length > 0) { res.status(409).json({ error: "You have already joined a faction. Faction choice is permanent." }); return; }

  // Check faction exists
  const { rows: factions } = await pool.query<{ id: number; name: string; slug: string; color: string; icon_emoji: string; description: string }>(
    `SELECT * FROM factions WHERE id = $1`,
    [factionId],
  );
  if (!factions[0]) { res.status(404).json({ error: "Faction not found" }); return; }
  const faction = factions[0];

  await pool.query(
    `INSERT INTO user_factions (user_id, faction_id) VALUES ($1, $2)`,
    [meId, factionId],
  );

  // Welcome notification
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: meId,
      type: "faction_joined",
      title: `Welcome to ${faction.name}!`,
      body: faction.description,
    })
    .returning();
  pushToUser(meId, { type: "notification", notification });

  res.status(201).json({ id: faction.id, name: faction.name, slug: faction.slug, color: faction.color, iconEmoji: faction.icon_emoji, description: faction.description });
});

// GET /factions/:id/members — paginated roster (20 per page, newest first)
router.get("/factions/:id/members", requireAuth, async (req, res): Promise<void> => {
  const factionId = parseInt(p(req.params.id), 10);
  if (isNaN(factionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 50);
  const offset = parseInt((req.query.offset as string) ?? "0", 10) || 0;

  const { rows: factionRows } = await pool.query<{ id: number }>(
    `SELECT id FROM factions WHERE id = $1`,
    [factionId],
  );
  if (!factionRows[0]) { res.status(404).json({ error: "Faction not found" }); return; }

  const { rows } = await pool.query<{
    user_id: number; display_name: string; username: string;
    avatar_url: string | null; is_pro: boolean; joined_at: string;
    weekly_pts: number; total_count: number;
  }>(`
    SELECT
      u.id         AS user_id,
      u.display_name,
      u.username,
      u.avatar_url,
      u.is_pro,
      uf.joined_at,
      (
        (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 5 +
        (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 3 +
        (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 1
      ) AS weekly_pts,
      COUNT(*) OVER () AS total_count
    FROM user_factions uf
    JOIN users u ON u.id = uf.user_id
    WHERE uf.faction_id = $1
    ORDER BY uf.joined_at DESC
    LIMIT $2 OFFSET $3
  `, [factionId, limit, offset]);

  const total = rows[0]?.total_count ?? 0;
  res.json({
    total,
    members: rows.map(r => ({
      userId:      r.user_id,
      displayName: r.display_name,
      username:    r.username,
      avatarUrl:   toPublicImageUrl(r.avatar_url),
      isPro:       r.is_pro,
      joinedAt:    r.joined_at,
      weeklyPts:   r.weekly_pts,
    })),
  });
});

// ── Season routes ─────────────────────────────────────────────────────────────

// GET /seasons — list all seasons (newest first)
router.get("/seasons", requireAuth, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, name, start_date, end_date, is_active, created_at FROM seasons ORDER BY id DESC`,
  );
  res.json(rows.map(r => ({
    id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date,
    isActive: r.is_active, createdAt: r.created_at,
  })));
});

// GET /seasons/current — current active season
router.get("/seasons/current", requireAuth, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, name, start_date, end_date, is_active, created_at FROM seasons WHERE is_active = TRUE LIMIT 1`,
  );
  if (!rows[0]) { res.status(404).json({ error: "No active season" }); return; }
  const r = rows[0];
  res.json({ id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date, isActive: r.is_active });
});

// GET /seasons/current/rankings — top 100 users by XP (paginated)
router.get("/seasons/current/rankings", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10) || 50, 100);
  const offset = parseInt((req.query.offset as string) ?? "0", 10) || 0;

  const { rows: season } = await pool.query(`SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1`);
  if (!season[0]) { res.json({ season: null, rankings: [], total: 0 }); return; }

  const { rows } = await pool.query<{
    id: number; username: string; display_name: string; avatar_url: string | null;
    is_pro: boolean; faction_slug: string | null; faction_color: string | null; faction_emoji: string | null;
    computed_xp: number; total_count: number;
  }>(`
    SELECT
      u.id, u.username, u.display_name, u.avatar_url, u.is_pro,
      f.slug  AS faction_slug,
      f.color AS faction_color,
      f.icon_emoji AS faction_emoji,
      (
        (SELECT COUNT(*)::INT FROM friendships    WHERE user_id   = u.id) * 50  +
        (SELECT COUNT(*)::INT FROM parties        WHERE leader_id = u.id) * 120 +
        (SELECT COUNT(*)::INT FROM party_members  WHERE user_id   = u.id) * 40  +
        (SELECT COUNT(*)::INT FROM messages       WHERE sender_id = u.id) * 4   +
        (SELECT COUNT(*)::INT FROM lfg_posts      WHERE author_id = u.id) * 70  +
        (SELECT COUNT(*)::INT FROM lfg_responses  WHERE user_id   = u.id) * 35  +
        (SELECT COUNT(*)::INT FROM user_games     WHERE user_id   = u.id) * 20  +
        (SELECT COUNT(*)::INT FROM platform_links WHERE user_id   = u.id) * 30  +
        COALESCE((SELECT bonus_xp FROM user_streaks WHERE user_id = u.id), 0)
      ) AS computed_xp,
      COUNT(*) OVER () AS total_count
    FROM users u
    LEFT JOIN user_factions uf ON uf.user_id = u.id
    LEFT JOIN factions f ON f.id = uf.faction_id
    ORDER BY computed_xp DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const total = rows[0]?.total_count ?? 0;
  const meId = (req as { auth?: { userId: number } }).auth!.userId;
  res.json({
    season: { id: season[0].id },
    total,
    rankings: rows.map((r, i) => ({
      rank: offset + i + 1,
      userId: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: toPublicImageUrl(r.avatar_url),
      isPro: r.is_pro,
      totalXp: r.computed_xp,
      faction: r.faction_slug ? { slug: r.faction_slug, color: r.faction_color, emoji: r.faction_emoji } : null,
      isMe: r.id === meId,
    })),
  });
});

// GET /factions/:id/weekly-top — top N contributors for the current ISO week
router.get("/factions/:id/weekly-top", requireAuth, async (req, res): Promise<void> => {
  const factionId = parseInt(p(req.params.id), 10);
  if (isNaN(factionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const limit = Math.min(parseInt((req.query.limit as string) ?? "5", 10) || 5, 25);

  // Verify faction exists
  const { rows: factionRows } = await pool.query<{ id: number; name: string; slug: string; color: string; icon_emoji: string }>(
    `SELECT id, name, slug, color, icon_emoji FROM factions WHERE id = $1`,
    [factionId],
  );
  if (!factionRows[0]) { res.status(404).json({ error: "Faction not found" }); return; }
  const faction = factionRows[0];

  const { rows } = await pool.query<{
    user_id: number; username: string; display_name: string; avatar_url: string | null; weekly_pts: number;
  }>(`
    SELECT
      u.id AS user_id,
      u.username,
      u.display_name,
      u.avatar_url,
      (
        (SELECT COUNT(*)::INT FROM lfg_posts     WHERE author_id = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 5 +
        (SELECT COUNT(*)::INT FROM lfg_responses WHERE user_id   = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 3 +
        (SELECT COUNT(*)::INT FROM messages      WHERE sender_id = u.id AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) * 1
      ) AS weekly_pts
    FROM user_factions uf
    JOIN users u ON u.id = uf.user_id
    WHERE uf.faction_id = $1
    ORDER BY weekly_pts DESC, u.id ASC
    LIMIT $2
  `, [factionId, limit]);

  res.json({
    faction: { id: faction.id, name: faction.name, slug: faction.slug, color: faction.color, iconEmoji: faction.icon_emoji },
    contributors: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: toPublicImageUrl(r.avatar_url),
      weeklyPoints: r.weekly_pts,
    })),
  });
});

// GET /hall-of-fame — all completed seasons with top 10 each
router.get("/hall-of-fame", requireAuth, async (_req, res): Promise<void> => {
  // Get all seasons that have hall_of_fame entries
  const { rows: seasons } = await pool.query<{ id: number; name: string; end_date: string }>(
    `SELECT DISTINCT s.id, s.name, s.end_date
     FROM seasons s
     JOIN hall_of_fame h ON h.season_id = s.id
     ORDER BY s.id DESC`,
  );

  const result = await Promise.all(seasons.map(async (season) => {
    const { rows: entries } = await pool.query<{
      rank: number; user_id: number; display_name: string; username: string;
      avatar_url: string | null; total_xp: number; faction_slug: string | null;
      prestige_level: number;
    }>(
      `SELECT h.rank, h.user_id, h.display_name, h.username, h.avatar_url, h.total_xp, h.faction_slug,
              COALESCE(u.prestige_level, 0) AS prestige_level
       FROM hall_of_fame h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.season_id = $1 ORDER BY h.rank ASC`,
      [season.id],
    );
    return {
      season: { id: season.id, name: season.name, endDate: season.end_date },
      entries: entries.map(e => ({
        rank: e.rank,
        userId: e.user_id,
        displayName: e.display_name,
        username: e.username,
        avatarUrl: toPublicImageUrl(e.avatar_url),
        totalXp: e.total_xp,
        factionSlug: e.faction_slug,
        prestigeLevel: e.prestige_level,
      })),
    };
  }));

  res.json(result);
});

export default router;
