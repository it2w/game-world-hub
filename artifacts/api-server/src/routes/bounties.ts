import { Router, type IRouter } from "express";
import { db, usersTable, notificationsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";
import { getUserProgress } from "../lib/xp";
import { logger } from "../lib/logger";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

const ESCROW_COST = 50;

/** Narrow Express param which may be string | string[] */
function p(v: string | string[]): string { return Array.isArray(v) ? v[0] : v; }
const SWEEP_INTERVAL_MS = 5 * 60 * 1_000;

// ── Tables ───────────────────────────────────────────────────────────────────

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bounties (
      id          SERIAL PRIMARY KEY,
      creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game        TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      xp_reward   INTEGER NOT NULL CHECK (xp_reward BETWEEN 50 AND 500),
      xp_escrow   INTEGER NOT NULL DEFAULT 50,
      status      TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','in_progress','completed','expired','cancelled')),
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bounties_creator  ON bounties(creator_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bounties_status   ON bounties(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bounties_game     ON bounties(game)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bounties_expires  ON bounties(expires_at) WHERE status = 'open'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bounty_applications (
      id           SERIAL PRIMARY KEY,
      bounty_id    INTEGER NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
      applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','accepted','rejected')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(bounty_id, applicant_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bapps_bounty     ON bounty_applications(bounty_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bapps_applicant  ON bounty_applications(applicant_id)`);
}

// Chain sweep startup so it only starts AFTER tables exist
ensureTables()
  .then(() => {
    sweepExpiredBounties();
    setInterval(sweepExpiredBounties, SWEEP_INTERVAL_MS).unref();
  })
  .catch(err => logger.error({ err }, "bounties: ensureTables failed"));

// ── XP helpers ───────────────────────────────────────────────────────────────

async function adjustBonusXp(userId: number, delta: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, 0, 0, CURRENT_DATE, 0, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET bonus_xp = user_streaks.bonus_xp + $2, updated_at = NOW()`,
    [userId, delta],
  );
}

// ── Expiry sweeper ───────────────────────────────────────────────────────────

async function sweepExpiredBounties() {
  try {
    const { rows: expired } = await pool.query<{ id: number; creator_id: number; xp_escrow: number; title: string }>(
      `UPDATE bounties SET status = 'expired', updated_at = NOW()
       WHERE status = 'open' AND expires_at < NOW()
       RETURNING id, creator_id, xp_escrow, title`,
    );
    for (const b of expired) {
      await adjustBonusXp(b.creator_id, b.xp_escrow);
      await pool.query(
        `UPDATE bounty_applications SET status = 'rejected' WHERE bounty_id = $1 AND status = 'pending'`,
        [b.id],
      );
      const [notification] = await db
        .insert(notificationsTable)
        .values({
          userId: b.creator_id,
          type: "bounty_expired",
          title: "Bounty Expired",
          body: `Your bounty "${b.title}" expired. ${b.xp_escrow} XP escrow refunded.`,
          relatedId: b.id,
        })
        .returning();
      pushToUser(b.creator_id, { type: "notification", notification });
    }
    if (expired.length > 0) logger.info({ count: expired.length }, "bounties: swept expired");
  } catch (err) {
    logger.error({ err }, "bounties: sweep failed");
  }
}

// ── User summary helper ───────────────────────────────────────────────────────

type UserSummary = { id: number; username: string; displayName: string; avatarUrl: string | null };

async function getUserSummary(userId: number): Promise<UserSummary> {
  const [u] = await db
    .select({ id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return { id: userId, username: "deleted", displayName: "Deleted User", avatarUrl: null };
  return { ...u, avatarUrl: toPublicImageUrl(u.avatarUrl ?? null) };
}

type BountyRow = {
  id: number; creator_id: number; game: string; title: string; description: string;
  xp_reward: number; xp_escrow: number; status: string; expires_at: string;
  created_at: string; updated_at: string;
};

function timeLeft(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── GET /bounties ─────────────────────────────────────────────────────────────

router.get("/bounties", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const { game, status, minXp, maxXp } = req.query;

  let sql = `SELECT b.*, COUNT(a.id) as applicant_count FROM bounties b
             LEFT JOIN bounty_applications a ON a.bounty_id = b.id`;
  const params: unknown[] = [];
  const wheres: string[] = [];

  if (game && typeof game === "string" && game.trim()) {
    params.push(`%${game.trim().toLowerCase()}%`);
    wheres.push(`LOWER(b.game) LIKE $${params.length}`);
  }
  if (status && typeof status === "string" && status !== "all") {
    params.push(status);
    wheres.push(`b.status = $${params.length}`);
  } else if (!status || status === "all") {
    wheres.push(`b.status IN ('open','in_progress','completed')`);
  }
  if (minXp) {
    params.push(Number(minXp));
    wheres.push(`b.xp_reward >= $${params.length}`);
  }
  if (maxXp) {
    params.push(Number(maxXp));
    wheres.push(`b.xp_reward <= $${params.length}`);
  }

  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  sql += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100`;

  const { rows } = await pool.query<BountyRow & { applicant_count: string }>(sql, params);

  const result = await Promise.all(
    rows.map(async b => ({
      id: b.id,
      game: b.game,
      title: b.title,
      description: b.description,
      xpReward: b.xp_reward,
      status: b.status,
      expiresAt: b.expires_at,
      timeLeft: timeLeft(b.expires_at),
      applicantCount: Number(b.applicant_count),
      createdAt: b.created_at,
      isCreator: b.creator_id === meId,
      creator: await getUserSummary(b.creator_id),
      // Has the current user applied?
      myApplication: null as { id: number; status: string } | null,
    })),
  );

  // Fetch the current user's applications in one shot
  if (result.length > 0) {
    const ids = result.map(b => b.id);
    const { rows: myApps } = await pool.query<{ bounty_id: number; id: number; status: string }>(
      `SELECT bounty_id, id, status FROM bounty_applications WHERE applicant_id = $1 AND bounty_id = ANY($2)`,
      [meId, ids],
    );
    const byBounty = new Map(myApps.map(a => [a.bounty_id, { id: a.id, status: a.status }]));
    for (const b of result) b.myApplication = byBounty.get(b.id) ?? null;
  }

  res.json(result);
});

// ── POST /bounties ────────────────────────────────────────────────────────────

router.post("/bounties", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const { game, title, description, xpReward, durationHours } = req.body;

  // Validate inputs
  if (!game || typeof game !== "string" || game.trim().length < 1 || game.trim().length > 60) {
    res.status(400).json({ error: "Game is required (max 60 chars)" }); return;
  }
  if (!title || typeof title !== "string" || title.trim().length < 3 || title.trim().length > 120) {
    res.status(400).json({ error: "Title must be 3–120 characters" }); return;
  }
  if (!description || typeof description !== "string" || description.trim().length < 10 || description.trim().length > 1000) {
    res.status(400).json({ error: "Description must be 10–1000 characters" }); return;
  }
  const reward = Number(xpReward);
  if (!Number.isInteger(reward) || reward < 50 || reward > 500) {
    res.status(400).json({ error: "XP reward must be 50–500" }); return;
  }
  const durH = Number(durationHours);
  if (![24, 48, 72].includes(durH)) {
    res.status(400).json({ error: "Duration must be 24, 48, or 72 hours" }); return;
  }

  // Check total XP >= escrow cost
  const progress = await getUserProgress(meId);
  if (progress.totalXp < ESCROW_COST) {
    res.status(402).json({ error: `You need at least ${ESCROW_COST} XP to post a bounty (current: ${progress.totalXp} XP)` });
    return;
  }

  // Deduct escrow atomically — if this fails the insert won't happen
  await adjustBonusXp(meId, -ESCROW_COST);

  const expiresAt = new Date(Date.now() + durH * 3_600_000);
  const { rows } = await pool.query<BountyRow>(
    `INSERT INTO bounties (creator_id, game, title, description, xp_reward, xp_escrow, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [meId, game.trim(), title.trim(), description.trim(), reward, ESCROW_COST, expiresAt],
  );
  const b = rows[0];
  const creator = await getUserSummary(meId);
  res.status(201).json({
    id: b.id, game: b.game, title: b.title, description: b.description,
    xpReward: b.xp_reward, status: b.status, expiresAt: b.expires_at,
    timeLeft: timeLeft(b.expires_at), applicantCount: 0, isCreator: true, creator,
    myApplication: null,
  });
});

// ── GET /bounties/:id ─────────────────────────────────────────────────────────

router.get("/bounties/:id", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  if (isNaN(bountyId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows } = await pool.query<BountyRow>(`SELECT * FROM bounties WHERE id = $1`, [bountyId]);
  if (!rows[0]) { res.status(404).json({ error: "Bounty not found" }); return; }
  const b = rows[0];

  const isCreator = b.creator_id === meId;

  // Fetch applications: creator sees all, others see only their own
  let appSql = `SELECT a.*, u.username, u.display_name, u.avatar_url
                FROM bounty_applications a
                JOIN users u ON u.id = a.applicant_id
                WHERE a.bounty_id = $1`;
  const appParams: unknown[] = [bountyId];
  if (!isCreator) {
    appSql += ` AND a.applicant_id = $2`;
    appParams.push(meId);
  }
  appSql += ` ORDER BY a.created_at ASC`;
  const { rows: apps } = await pool.query<{
    id: number; bounty_id: number; applicant_id: number; message: string; status: string; created_at: string;
    username: string; display_name: string; avatar_url: string | null;
  }>(appSql, appParams);

  const creator = await getUserSummary(b.creator_id);
  res.json({
    id: b.id, game: b.game, title: b.title, description: b.description,
    xpReward: b.xp_reward, xpEscrow: b.xp_escrow, status: b.status,
    expiresAt: b.expires_at, timeLeft: timeLeft(b.expires_at),
    createdAt: b.created_at, isCreator, creator,
    applications: apps.map(a => ({
      id: a.id, bountyId: a.bounty_id, message: a.message, status: a.status, createdAt: a.created_at,
      applicant: {
        id: a.applicant_id, username: a.username, displayName: a.display_name,
        avatarUrl: toPublicImageUrl(a.avatar_url ?? null),
      },
    })),
    myApplication: apps.find(a => a.applicant_id === meId)
      ? { id: apps.find(a => a.applicant_id === meId)!.id, status: apps.find(a => a.applicant_id === meId)!.status }
      : null,
  });
});

// ── DELETE /bounties/:id ──────────────────────────────────────────────────────

router.delete("/bounties/:id", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  if (isNaN(bountyId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows } = await pool.query<BountyRow>(`SELECT * FROM bounties WHERE id = $1`, [bountyId]);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const b = rows[0];
  if (b.creator_id !== meId) { res.status(403).json({ error: "Not the creator" }); return; }
  if (!["open"].includes(b.status)) {
    res.status(400).json({ error: "Can only cancel open bounties" }); return;
  }

  await pool.query(`UPDATE bounties SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [bountyId]);
  await pool.query(`UPDATE bounty_applications SET status = 'rejected' WHERE bounty_id = $1 AND status = 'pending'`, [bountyId]);
  await adjustBonusXp(meId, b.xp_escrow);

  res.status(204).end();
});

// ── POST /bounties/:id/apply ──────────────────────────────────────────────────

router.post("/bounties/:id/apply", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  if (isNaN(bountyId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { message } = req.body;
  if (!message || typeof message !== "string" || message.trim().length < 5 || message.trim().length > 500) {
    res.status(400).json({ error: "Application message must be 5–500 characters" }); return;
  }

  const { rows } = await pool.query<BountyRow>(`SELECT * FROM bounties WHERE id = $1`, [bountyId]);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  const b = rows[0];
  if (b.status !== "open") { res.status(400).json({ error: "Bounty is no longer open" }); return; }
  if (b.creator_id === meId) { res.status(400).json({ error: "Cannot apply to your own bounty" }); return; }

  // Check if already applied
  const { rows: existing } = await pool.query(
    `SELECT id FROM bounty_applications WHERE bounty_id = $1 AND applicant_id = $2`,
    [bountyId, meId],
  );
  if (existing.length > 0) { res.status(409).json({ error: "Already applied" }); return; }

  const { rows: appRows } = await pool.query<{ id: number; status: string; created_at: string }>(
    `INSERT INTO bounty_applications (bounty_id, applicant_id, message, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id, status, created_at`,
    [bountyId, meId, message.trim()],
  );
  const app = appRows[0];

  // Notify the bounty creator
  const applicant = await getUserSummary(meId);
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: b.creator_id,
      type: "bounty_application",
      title: "New Bounty Application",
      body: `${applicant.displayName} applied to your bounty "${b.title}"`,
      relatedId: bountyId,
    })
    .returning();
  pushToUser(b.creator_id, { type: "notification", notification });

  res.status(201).json({ id: app.id, status: app.status, createdAt: app.created_at });
});

// ── DELETE /bounties/:id/applications/:appId ──────────────────────────────────

router.delete("/bounties/:id/applications/:appId", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  const appId = parseInt(p(req.params.appId), 10);
  if (isNaN(bountyId) || isNaN(appId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows } = await pool.query<{ id: number; applicant_id: number; status: string }>(
    `SELECT id, applicant_id, status FROM bounty_applications WHERE id = $1 AND bounty_id = $2`,
    [appId, bountyId],
  );
  if (!rows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  const app = rows[0];
  if (app.applicant_id !== meId) { res.status(403).json({ error: "Not your application" }); return; }
  if (app.status !== "pending") { res.status(400).json({ error: "Can only withdraw pending applications" }); return; }

  await pool.query(`DELETE FROM bounty_applications WHERE id = $1`, [appId]);
  res.status(204).end();
});

// ── POST /bounties/:id/applications/:appId/accept ─────────────────────────────

router.post("/bounties/:id/applications/:appId/accept", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  const appId = parseInt(p(req.params.appId), 10);
  if (isNaN(bountyId) || isNaN(appId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows: bRows } = await pool.query<BountyRow>(`SELECT * FROM bounties WHERE id = $1`, [bountyId]);
  if (!bRows[0]) { res.status(404).json({ error: "Bounty not found" }); return; }
  const b = bRows[0];
  if (b.creator_id !== meId) { res.status(403).json({ error: "Not the creator" }); return; }
  if (b.status !== "open") { res.status(400).json({ error: "Bounty is not open" }); return; }

  const { rows: aRows } = await pool.query<{ id: number; applicant_id: number; status: string }>(
    `SELECT id, applicant_id, status FROM bounty_applications WHERE id = $1 AND bounty_id = $2`,
    [appId, bountyId],
  );
  if (!aRows[0]) { res.status(404).json({ error: "Application not found" }); return; }
  const app = aRows[0];
  if (app.status !== "pending") { res.status(400).json({ error: "Application is not pending" }); return; }

  // Accept this one, reject all others
  await pool.query(
    `UPDATE bounty_applications SET status = 'accepted' WHERE id = $1`,
    [appId],
  );
  await pool.query(
    `UPDATE bounty_applications SET status = 'rejected' WHERE bounty_id = $1 AND id != $2 AND status = 'pending'`,
    [bountyId, appId],
  );
  // Move bounty to in_progress
  await pool.query(
    `UPDATE bounties SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
    [bountyId],
  );

  // Notify the accepted applicant
  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: app.applicant_id,
      type: "bounty_accepted",
      title: "Application Accepted!",
      body: `Your application was accepted! Get to work on "${b.title}" and earn ${b.xp_reward} XP.`,
      relatedId: bountyId,
    })
    .returning();
  pushToUser(app.applicant_id, { type: "notification", notification });

  res.json({ success: true, acceptedApplicantId: app.applicant_id });
});

// ── POST /bounties/:id/complete ───────────────────────────────────────────────

router.post("/bounties/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const meId = req.auth!.userId;
  const bountyId = parseInt(p(req.params.id), 10);
  if (isNaN(bountyId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows: bRows } = await pool.query<BountyRow>(`SELECT * FROM bounties WHERE id = $1`, [bountyId]);
  if (!bRows[0]) { res.status(404).json({ error: "Bounty not found" }); return; }
  const b = bRows[0];
  if (b.creator_id !== meId) { res.status(403).json({ error: "Not the creator" }); return; }
  if (b.status !== "in_progress") { res.status(400).json({ error: "Bounty is not in progress" }); return; }

  // Find the accepted applicant
  const { rows: aRows } = await pool.query<{ applicant_id: number }>(
    `SELECT applicant_id FROM bounty_applications WHERE bounty_id = $1 AND status = 'accepted'`,
    [bountyId],
  );
  if (!aRows[0]) { res.status(400).json({ error: "No accepted applicant found" }); return; }
  const completerId = aRows[0].applicant_id;

  // Mark bounty as completed
  await pool.query(`UPDATE bounties SET status = 'completed', updated_at = NOW() WHERE id = $1`, [bountyId]);

  // Refund escrow to creator + award reward to completer
  await Promise.all([
    adjustBonusXp(meId, b.xp_escrow),
    adjustBonusXp(completerId, b.xp_reward),
  ]);

  // Notify completer
  const completer = await getUserSummary(completerId);
  const [notifCompleter] = await db
    .insert(notificationsTable)
    .values({
      userId: completerId,
      type: "bounty_completed",
      title: "Bounty Complete! XP Awarded",
      body: `"${b.title}" marked as complete! +${b.xp_reward} XP added to your account.`,
      relatedId: bountyId,
    })
    .returning();
  pushToUser(completerId, { type: "notification", notification: notifCompleter });

  res.json({ success: true, completer, xpAwarded: b.xp_reward, escrowRefunded: b.xp_escrow });
});

// ── GET /users/:id/bounties ───────────────────────────────────────────────────

router.get("/users/:userId/bounties", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Bounties posted by this user
  const { rows: posted } = await pool.query<BountyRow & { applicant_count: string }>(
    `SELECT b.*, COUNT(a.id) as applicant_count
     FROM bounties b
     LEFT JOIN bounty_applications a ON a.bounty_id = b.id
     WHERE b.creator_id = $1
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT 50`,
    [userId],
  );

  // Bounties this user has applied to
  const { rows: applied } = await pool.query<BountyRow & { app_id: number; app_status: string; app_created_at: string }>(
    `SELECT b.*, a.id as app_id, a.status as app_status, a.created_at as app_created_at
     FROM bounty_applications a
     JOIN bounties b ON b.id = a.bounty_id
     WHERE a.applicant_id = $1
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [userId],
  );

  res.json({
    posted: posted.map(b => ({
      id: b.id, game: b.game, title: b.title, xpReward: b.xp_reward, status: b.status,
      expiresAt: b.expires_at, createdAt: b.created_at, applicantCount: Number(b.applicant_count),
    })),
    applied: applied.map(b => ({
      id: b.id, game: b.game, title: b.title, xpReward: b.xp_reward, status: b.status,
      expiresAt: b.expires_at, createdAt: b.created_at,
      applicationId: b.app_id, applicationStatus: b.app_status, appliedAt: b.app_created_at,
    })),
  });
});

export default router;
