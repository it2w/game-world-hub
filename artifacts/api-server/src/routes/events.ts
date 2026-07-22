import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { pool, db, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { pushToUser, broadcastAll } from "../ws/signaling";

const router: IRouter = Router();

// ── DDL ──────────────────────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id               SERIAL PRIMARY KEY,
      creator_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type             TEXT    NOT NULL CHECK (type IN ('game_night', 'flash')),
      title            TEXT    NOT NULL,
      title_ar         TEXT,
      description      TEXT,
      description_ar   TEXT,
      game             TEXT,
      quest_key        TEXT,
      icon             TEXT    NOT NULL DEFAULT '⚡',
      max_participants INTEGER,
      scheduled_at     TIMESTAMPTZ,
      expires_at       TIMESTAMPTZ,
      notified_1h      BOOLEAN NOT NULL DEFAULT FALSE,
      status           TEXT    NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'completed', 'cancelled')),
      xp_reward        INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_participants (
      event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS flash_event_templates (
      id             SERIAL PRIMARY KEY,
      title_en       TEXT    NOT NULL,
      title_ar       TEXT    NOT NULL,
      description_en TEXT,
      description_ar TEXT,
      quest_key      TEXT    NOT NULL,
      xp_reward      INTEGER NOT NULL DEFAULT 200,
      icon           TEXT    NOT NULL DEFAULT '⚡'
    )
  `);

  // Enhanced columns (additive — safe to re-run)
  for (const ddl of [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_image_key TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT CHECK (event_type IN ('casual','tournament','coaching','community'))`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring_rule JSONB`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS notified_24h BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS notified_15m BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS rating_sum INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0`,
  ]) {
    await pool.query(ddl);
  }

  // Per-user ratings table (idempotent — one row per user per event)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_ratings (
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      rated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    )
  `);

  // RSVP table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL CHECK (status IN ('going','maybe','not_going')),
      responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY  (event_id, user_id)
    )
  `);

  // Discussion posts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_posts (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT    NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`DELETE FROM flash_event_templates WHERE quest_key = 'join_room'`);

  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM flash_event_templates`);
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO flash_event_templates (title_en, title_ar, description_en, description_ar, quest_key, xp_reward, icon) VALUES
        ('Squad Up! Post an LFG signal now',          'شكّل فريقك! انشر طلب LFG الآن',          'Post a Looking For Group signal and earn bonus XP',                  'انشر طلب LFG واكسب XP إضافية',                       'post_lfg',      250, '📡'),
        ('Help a player! Respond to an LFG',          'ساعد لاعباً! استجب لطلب LFG',            'Find someone looking for a squad and respond to their signal',         'اعثر على شخص يبحث عن فريق وردّ عليه',                'respond_lfg',   200, '⚡'),
        ('Chat it up! Send 5 messages',               'تواصل! أرسل 5 رسائل لأصدقائك',           'Reach out to your friends — send 5 messages',                        'تحدث مع أصدقائك — أرسل 5 رسائل',                     'send_messages',  150, '💬'),
        ('Grow your network! Add a friend',           'وسّع شبكتك! أضف صديقاً جديداً',         'Accept a friend request or connect with someone new',                 'قبل طلب صداقة أو تواصل مع شخص جديد',                 'add_friend',    120, '👥'),
        ('LFG Blitz! Dominate the board',             'انفجارة LFG! تصدّر القائمة',             'Post an LFG and rise to the top of the feed',                        'انشر طلب LFG وتصدّر القائمة',                        'post_lfg',      300, '🔥'),
        ('Be the connector! Reply to an LFG signal',  'كن الرابط! ردّ على إشارة LFG',           'Find a player in need and answer their call — teamwork scores XP',   'اعثر على لاعب يحتاج مساعدة وردّ على ندائه',          'respond_lfg',   180, '🤝')
    `);
  }

  logger.info("events: tables ensured");
}

// ── Bonus XP helper ───────────────────────────────────────────────────────────

async function addBonusXp(userId: number, xp: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, 0, 0, NULL, 0, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET bonus_xp = user_streaks.bonus_xp + $2, updated_at = NOW()`,
    [userId, xp],
  );
}

const QUEST_TARGETS: Record<string, number> = {
  post_lfg: 1, respond_lfg: 1, send_messages: 5, join_room: 1, add_friend: 1,
};

// ── Flash completion hook ─────────────────────────────────────────────────────
export async function checkFlashCompletion(userId: number, activityKey: string): Promise<void> {
  try {
    const { rows: flashRows } = await pool.query<{
      id: number; title: string; xp_reward: number; created_at: Date;
    }>(
      `SELECT id, title, xp_reward, created_at FROM events
       WHERE type = 'flash' AND status = 'active' AND quest_key = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [activityKey],
    );
    if (flashRows.length === 0) return;
    const flash = flashRows[0];

    const target = QUEST_TARGETS[activityKey] ?? 1;
    if (target > 1 && activityKey === "send_messages") {
      const { rows: cntRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text FROM messages WHERE sender_id = $1 AND created_at >= $2`,
        [userId, flash.created_at],
      );
      if (parseInt(cntRows[0].count) < target) return;
    }

    const { rows: insertedRows } = await pool.query<{ event_id: number }>(
      `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
      [flash.id, userId],
    );
    if (insertedRows.length === 0) return;

    await addBonusXp(userId, flash.xp_reward);
    await db.insert(notificationsTable).values({
      userId, type: "flash_complete",
      title: `🎉 Flash Event Complete!`,
      body: `You earned ${flash.xp_reward} XP from "${flash.title}"`,
      relatedId: flash.id,
    });
    pushToUser(userId, { type: "flash_event_complete", eventId: flash.id, xp: flash.xp_reward, title: flash.title });
    logger.info({ userId, eventId: flash.id, xp: flash.xp_reward }, "flash-event: user completed");
  } catch (err) {
    logger.error({ err }, "flash-event: checkFlashCompletion error");
  }
}

// ── Flash Event scheduler ─────────────────────────────────────────────────────
export function startFlashEventScheduler(): void {
  const INTERVAL_MS = 48 * 60 * 60 * 1000;

  const createNextFlash = async (): Promise<void> => {
    try {
      await pool.query(`UPDATE events SET status = 'cancelled' WHERE type = 'flash' AND status = 'active'`);

      const { rows: cntRows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM flash_event_templates`);
      const templateCount = parseInt(cntRows[0].count);
      if (templateCount === 0) return;

      const { rows: histRows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM events WHERE type = 'flash'`);
      const offset = parseInt(histRows[0].count) % templateCount;

      const { rows: tplRows } = await pool.query<{
        title_en: string; title_ar: string; description_en: string | null; description_ar: string | null;
        quest_key: string; xp_reward: number; icon: string;
      }>(`SELECT * FROM flash_event_templates ORDER BY id LIMIT 1 OFFSET $1`, [offset]);
      if (tplRows.length === 0) return;
      const tpl = tplRows[0];

      const expiresAt = new Date(Date.now() + INTERVAL_MS);
      const { rows: evtRows } = await pool.query<{ id: number }>(
        `INSERT INTO events (creator_id, type, title, title_ar, description, description_ar, quest_key, icon, expires_at, status, xp_reward)
         VALUES (NULL, 'flash', $1, $2, $3, $4, $5, $6, $7, 'active', $8) RETURNING id`,
        [tpl.title_en, tpl.title_ar, tpl.description_en, tpl.description_ar, tpl.quest_key, tpl.icon, expiresAt.toISOString(), tpl.xp_reward],
      );
      const eventId = evtRows[0]?.id;
      if (eventId) {
        broadcastAll({ type: "flash_event_new", eventId, title: tpl.title_en, titleAr: tpl.title_ar,
          icon: tpl.icon, xpReward: tpl.xp_reward, questKey: tpl.quest_key, expiresAt: expiresAt.toISOString() });
        const { rows: onlineRows } = await pool.query<{ id: number }>(`SELECT id FROM users WHERE status != 'offline' LIMIT 200`);
        if (onlineRows.length > 0) {
          const vals = onlineRows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(",");
          const params: (string | number | null)[] = onlineRows.flatMap((u) => [
            u.id, "flash_event", `⚡ Flash Event: ${tpl.title_en}`, tpl.description_en ?? "", eventId,
          ]);
          await pool.query(`INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`, params);
        }
      }
      logger.info({ eventId, questKey: tpl.quest_key }, "flash-event: new event created");
    } catch (err) {
      logger.error({ err }, "flash-event: scheduler error");
    }
  };

  void pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM events WHERE type = 'flash' AND status = 'active'`)
    .then(({ rows }) => { if (parseInt(rows[0].count) === 0) void createNextFlash(); })
    .catch(() => {});

  setInterval(() => void createNextFlash(), INTERVAL_MS);
  logger.info("flash-event: scheduler started");
}

// ── Enhanced reminder sweeper (24h, 15min, start broadcast) ──────────────────
export function startEventReminderSweeper(): void {
  const sweep = async (): Promise<void> => {
    try {
      // 24-hour reminder
      const { rows: evt24 } = await pool.query<{ id: number; title: string }>(
        `SELECT id, title FROM events
         WHERE type = 'game_night' AND status = 'active'
           AND notified_24h = FALSE AND scheduled_at IS NOT NULL
           AND scheduled_at BETWEEN NOW() + INTERVAL '23 hours 55 minutes' AND NOW() + INTERVAL '24 hours 5 minutes'`,
      );
      for (const evt of evt24) {
        const { rows: rsvpRows } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND status IN ('going','maybe')`, [evt.id],
        );
        if (rsvpRows.length > 0) {
          const vals = rsvpRows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(",");
          const params: (string | number | null)[] = rsvpRows.flatMap((r) => [
            r.user_id, "event_reminder", `🗓️ Event Tomorrow!`, `"${evt.title}" is in 24 hours`, evt.id,
          ]);
          await pool.query(`INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`, params);
          for (const r of rsvpRows) {
            pushToUser(r.user_id, { type: "event_reminder_24h", eventId: evt.id, title: evt.title });
          }
        }
        await pool.query(`UPDATE events SET notified_24h = TRUE WHERE id = $1`, [evt.id]);
      }

      // 15-minute reminder
      const { rows: evt15 } = await pool.query<{ id: number; title: string; party_id: number | null }>(
        `SELECT id, title, party_id FROM events
         WHERE type = 'game_night' AND status = 'active'
           AND notified_15m = FALSE AND scheduled_at IS NOT NULL
           AND scheduled_at BETWEEN NOW() + INTERVAL '14 minutes' AND NOW() + INTERVAL '16 minutes'`,
      );
      for (const evt of evt15) {
        const { rows: rsvpRows } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND status IN ('going','maybe')`, [evt.id],
        );
        if (rsvpRows.length > 0) {
          const vals = rsvpRows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(",");
          const params: (string | number | null)[] = rsvpRows.flatMap((r) => [
            r.user_id, "event_reminder", `⏰ Starting Soon!`, `"${evt.title}" starts in 15 minutes`, evt.id,
          ]);
          await pool.query(`INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`, params);
          for (const r of rsvpRows) {
            pushToUser(r.user_id, { type: "event_starting_soon", eventId: evt.id, title: evt.title, partyId: evt.party_id });
          }
        }
        await pool.query(`UPDATE events SET notified_15m = TRUE WHERE id = $1`, [evt.id]);
      }

      // Legacy 1-hour reminder (for participants on event_participants table)
      const { rows: upcoming1h } = await pool.query<{ id: number; title: string }>(
        `SELECT id, title FROM events
         WHERE type = 'game_night' AND status = 'active'
           AND notified_1h = FALSE AND scheduled_at IS NOT NULL
           AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'`,
      );
      for (const evt of upcoming1h) {
        const { rows: parts } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM event_participants WHERE event_id = $1`, [evt.id],
        );
        if (parts.length > 0) {
          const vals = parts.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(",");
          const params: (string | number | null)[] = parts.flatMap((p) => [
            p.user_id, "event_reminder", `🎮 Game Night Starting Soon!`, `"${evt.title}" starts in less than 1 hour`, evt.id,
          ]);
          await pool.query(`INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`, params);
        }
        await pool.query(`UPDATE events SET notified_1h = TRUE WHERE id = $1`, [evt.id]);
      }

      // Broadcast start event for just-started events (within last 5 min)
      const { rows: started } = await pool.query<{ id: number; title: string; party_id: number | null }>(
        `SELECT id, title, party_id FROM events
         WHERE type = 'game_night' AND status = 'active' AND scheduled_at IS NOT NULL
           AND scheduled_at BETWEEN NOW() - INTERVAL '5 minutes' AND NOW()`,
      );
      for (const evt of started) {
        const { rows: rsvpRows } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND status = 'going'`, [evt.id],
        );
        for (const r of rsvpRows) {
          pushToUser(r.user_id, { type: "event_started", eventId: evt.id, title: evt.title, partyId: evt.party_id });
        }
      }
    } catch (err) {
      logger.error({ err }, "events: reminder sweeper error");
    }
  };

  setInterval(() => void sweep(), 5 * 60 * 1000);
  logger.info("events: reminder sweeper started");
}

// ── Kept for backward compat (still exported from index.ts) ──────────────────
export function startGameNightSweeper(): void {
  startEventReminderSweeper();
}

// ── Recurring event expander ──────────────────────────────────────────────────
async function expandRecurring(
  templateId: number,
  row: Record<string, unknown>,
  rule: { freq: string; count?: number },
): Promise<void> {
  const base = new Date(row.scheduled_at as string);
  const maxInstances = Math.min(rule.count ?? 12, 24);
  const instances: Date[] = [];

  for (let i = 1; i <= maxInstances; i++) {
    const d = new Date(base);
    if (rule.freq === "daily")        d.setDate(d.getDate() + i);
    else if (rule.freq === "weekly")  d.setDate(d.getDate() + i * 7);
    else if (rule.freq === "monthly") d.setMonth(d.getMonth() + i);
    else break;

    // Stop at 3 months ahead
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() + 3);
    if (d > cutoff) break;
    instances.push(d);
  }

  for (const dt of instances) {
    await pool.query(
      `INSERT INTO events
         (creator_id, type, title, title_ar, description, description_ar, game, icon,
          max_participants, scheduled_at, expires_at, status, xp_reward,
          event_type, banner_image_key, recurring_rule, party_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 + INTERVAL '2 hours', 'active', $12, $13, $14, $15, $16)`,
      [
        row.creator_id, row.type, row.title, row.title_ar, row.description, row.description_ar,
        row.game, row.icon, row.max_participants, dt.toISOString(), dt.toISOString(),
        row.xp_reward, row.event_type, row.banner_image_key,
        JSON.stringify({ ...rule, parentId: templateId }),
        row.party_id,
      ],
    );
  }
}

// ── RSVP counts helper ────────────────────────────────────────────────────────
async function fetchRsvpCounts(eventIds: number[]): Promise<Map<number, { going: number; maybe: number; notGoing: number }>> {
  if (eventIds.length === 0) return new Map();
  const { rows } = await pool.query<{ event_id: number; status: string; cnt: string }>(
    `SELECT event_id, status, COUNT(*)::text AS cnt FROM event_rsvps WHERE event_id = ANY($1) GROUP BY event_id, status`,
    [eventIds],
  );
  const map = new Map<number, { going: number; maybe: number; notGoing: number }>();
  for (const r of rows) {
    if (!map.has(r.event_id)) map.set(r.event_id, { going: 0, maybe: 0, notGoing: 0 });
    const entry = map.get(r.event_id)!;
    if (r.status === "going")     entry.going    = parseInt(r.cnt);
    if (r.status === "maybe")     entry.maybe    = parseInt(r.cnt);
    if (r.status === "not_going") entry.notGoing = parseInt(r.cnt);
  }
  return map;
}

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeEvent(
  row: Record<string, unknown>,
  participantCount: number,
  viewerJoined: boolean,
  rsvpCounts?: { going: number; maybe: number; notGoing: number },
  viewerRsvp?: string | null,
) {
  return {
    id:              row.id as number,
    type:            row.type as string,
    title:           row.title as string,
    titleAr:         (row.title_ar as string | null) ?? null,
    description:     (row.description as string | null) ?? null,
    descriptionAr:   (row.description_ar as string | null) ?? null,
    game:            (row.game as string | null) ?? null,
    questKey:        (row.quest_key as string | null) ?? null,
    icon:            row.icon as string,
    maxParticipants: (row.max_participants as number | null) ?? null,
    scheduledAt:     row.scheduled_at ? new Date(row.scheduled_at as string).toISOString() : null,
    expiresAt:       row.expires_at   ? new Date(row.expires_at   as string).toISOString() : null,
    status:          row.status as string,
    xpReward:        row.xp_reward as number,
    participantCount,
    viewerJoined,
    creatorId:       (row.creator_id as number | null) ?? null,
    createdAt:       new Date(row.created_at as string).toISOString(),
    // Enhanced fields
    eventType:       (row.event_type as string | null) ?? null,
    bannerImageKey:  (row.banner_image_key as string | null) ?? null,
    recurringRule:   (row.recurring_rule as Record<string, unknown> | null) ?? null,
    partyId:         (row.party_id as number | null) ?? null,
    rsvpCounts:      rsvpCounts ?? { going: 0, maybe: 0, notGoing: 0 },
    viewerRsvp:      viewerRsvp ?? null,
    ratingAvg:       (row.rating_count as number) > 0
      ? Math.round(((row.rating_sum as number) / (row.rating_count as number)) * 10) / 10
      : null,
    ratingCount:     (row.rating_count as number) ?? 0,
  };
}

// ── GET /events/featured — top 3 upcoming by going-RSVPs ─────────────────────
router.get("/events/featured", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { rows } = await pool.query(
    `SELECT e.*,
            COALESCE(SUM(CASE WHEN r.status='going' THEN 1 ELSE 0 END),0)::int AS going_count
     FROM events e
     LEFT JOIN event_rsvps r ON r.event_id = e.id
     WHERE e.status = 'active' AND e.type = 'game_night'
       AND e.scheduled_at IS NOT NULL AND e.scheduled_at > NOW()
     GROUP BY e.id
     ORDER BY going_count DESC, e.scheduled_at ASC
     LIMIT 3`,
  );
  if (rows.length === 0) { res.json([]); return; }

  const ids = rows.map((e: any) => e.id as number);
  const [rsvpMap, viewerRsvpRows] = await Promise.all([
    fetchRsvpCounts(ids),
    pool.query<{ event_id: number; status: string }>(
      `SELECT event_id, status FROM event_rsvps WHERE user_id = $1 AND event_id = ANY($2)`,
      [myId, ids],
    ),
  ]);
  const viewerRsvpMap = new Map(viewerRsvpRows.rows.map((r) => [r.event_id, r.status]));

  res.json(rows.map((e: any) => {
    const rc = rsvpMap.get(e.id) ?? { going: 0, maybe: 0, notGoing: 0 };
    return serializeEvent(e, e.going_count as number, false, rc, viewerRsvpMap.get(e.id) ?? null);
  }));
});

// ── GET /events/mine — upcoming events the viewer RSVPed to ──────────────────
router.get("/events/mine", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { rows } = await pool.query(
    `SELECT e.*, r.status AS my_rsvp
     FROM events e
     JOIN event_rsvps r ON r.event_id = e.id AND r.user_id = $1
     WHERE e.status = 'active' AND e.scheduled_at IS NOT NULL AND e.scheduled_at > NOW()
       AND r.status IN ('going','maybe')
     ORDER BY e.scheduled_at ASC LIMIT 10`,
    [myId],
  );
  if (rows.length === 0) { res.json([]); return; }

  const ids = rows.map((e: any) => e.id as number);
  const rsvpMap = await fetchRsvpCounts(ids);

  res.json(rows.map((e: any) => {
    const rc = rsvpMap.get(e.id) ?? { going: 0, maybe: 0, notGoing: 0 };
    return serializeEvent(e, rc.going, true, rc, e.my_rsvp as string);
  }));
});

// ── GET /events ───────────────────────────────────────────────────────────────
router.get("/events", requireAuth, async (req, res): Promise<void> => {
  const myId   = req.auth!.userId;
  const type   = typeof req.query.type      === "string" ? req.query.type      : undefined;
  const status = typeof req.query.status    === "string" ? req.query.status    : "active";
  const game   = typeof req.query.game      === "string" ? req.query.game      : undefined;
  const evtType = typeof req.query.eventType === "string" ? req.query.eventType : undefined;

  const params: unknown[] = [];
  let q = `SELECT * FROM events WHERE 1=1`;
  if (type) { params.push(type); q += ` AND type = $${params.length}`; }
  if (status !== "all") { params.push(status); q += ` AND status = $${params.length}`; }
  if (game) { params.push(`%${game}%`); q += ` AND game ILIKE $${params.length}`; }
  if (evtType) { params.push(evtType); q += ` AND event_type = $${params.length}`; }

  q += ` ORDER BY CASE WHEN type='flash' AND status='active' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`;

  const { rows: events } = await pool.query(q, params);
  if (events.length === 0) { res.json([]); return; }

  const ids = events.map((e: any) => e.id as number);
  const [{ rows: countRows }, { rows: joinedRows }, rsvpMap, viewerRsvpRows] = await Promise.all([
    pool.query<{ event_id: number; cnt: string }>(
      `SELECT event_id, COUNT(*)::text AS cnt FROM event_participants WHERE event_id = ANY($1) GROUP BY event_id`, [ids],
    ),
    pool.query<{ event_id: number }>(
      `SELECT event_id FROM event_participants WHERE user_id = $1 AND event_id = ANY($2)`, [myId, ids],
    ),
    fetchRsvpCounts(ids),
    pool.query<{ event_id: number; status: string }>(
      `SELECT event_id, status FROM event_rsvps WHERE user_id = $1 AND event_id = ANY($2)`, [myId, ids],
    ),
  ]);

  const countMap   = new Map(countRows.map((r) => [r.event_id, parseInt(r.cnt)]));
  const joinedSet  = new Set(joinedRows.map((r) => r.event_id));
  const viewerRsvpMap = new Map(viewerRsvpRows.rows.map((r) => [r.event_id, r.status]));

  res.json(events.map((e: any) => {
    const rc = rsvpMap.get(e.id) ?? { going: 0, maybe: 0, notGoing: 0 };
    return serializeEvent(e, countMap.get(e.id) ?? 0, joinedSet.has(e.id), rc, viewerRsvpMap.get(e.id) ?? null);
  }));
});

// ── GET /events/flash/active ──────────────────────────────────────────────────
router.get("/events/flash/active", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { rows } = await pool.query(
    `SELECT * FROM events
     WHERE type = 'flash' AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
  );
  if (rows.length === 0) { res.json(null); return; }
  const evt = rows[0];

  const [{ rows: pRows }, { rows: jRows }] = await Promise.all([
    pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [evt.id]),
    pool.query(`SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2`, [evt.id, myId]),
  ]);

  res.json(serializeEvent(evt, parseInt(pRows[0]?.cnt ?? "0"), jRows.length > 0));
});

// ── GET /events/:id ───────────────────────────────────────────────────────────
router.get("/events/:id", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
  if (rows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }
  const evt = rows[0];

  const [{ rows: pRows }, { rows: jRows }, rsvpMap, viewerRsvpRows] = await Promise.all([
    pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [id]),
    pool.query(`SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2`, [id, myId]),
    fetchRsvpCounts([id]),
    pool.query<{ status: string }>(
      `SELECT status FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [id, myId],
    ),
  ]);

  const rc = rsvpMap.get(id) ?? { going: 0, maybe: 0, notGoing: 0 };
  res.json(serializeEvent(evt, parseInt(pRows[0]?.cnt ?? "0"), jRows.length > 0, rc, viewerRsvpRows.rows[0]?.status ?? null));
});

// ── GET /events/:id/participants ──────────────────────────────────────────────
router.get("/events/:id/participants", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows: evtRows } = await pool.query(`SELECT id FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const { rows } = await pool.query<{
    id: number; display_name: string; avatar_url: string | null;
  }>(
    `SELECT u.id, u.display_name, u.avatar_url
     FROM event_participants ep JOIN users u ON u.id = ep.user_id
     WHERE ep.event_id = $1 ORDER BY ep.joined_at ASC`,
    [id],
  );
  res.json(rows.map((r) => ({ id: r.id, displayName: r.display_name, avatarUrl: toPublicImageUrl(r.avatar_url) })));
});

// ── GET /events/:id/rsvps — paginated RSVP roster ────────────────────────────
router.get("/events/:id/rsvps", requireAuth, async (req, res): Promise<void> => {
  const id     = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const page   = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit  = 20;
  const offset = (page - 1) * limit;

  const { rows: evtRows } = await pool.query(`SELECT id FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const params: unknown[] = [id, limit, offset];
  let q = `SELECT u.id, u.display_name, u.avatar_url, r.status, r.responded_at
           FROM event_rsvps r JOIN users u ON u.id = r.user_id
           WHERE r.event_id = $1`;
  if (status) { params.splice(1, 0, status); q += ` AND r.status = $2`; }
  q += ` ORDER BY r.responded_at ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const { rows } = await pool.query(q, params);
  res.json(rows.map((r: any) => ({
    id:          r.id,
    displayName: r.display_name,
    avatarUrl:   toPublicImageUrl(r.avatar_url),
    status:      r.status,
    respondedAt: new Date(r.responded_at).toISOString(),
  })));
});

// ── POST /events/:id/rsvp — upsert RSVP ──────────────────────────────────────
router.post("/events/:id/rsvp", requireAuth, async (req, res): Promise<void> => {
  const myId   = req.auth!.userId;
  const id     = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }
  const { status } = req.body as { status?: string };
  if (!status || !["going", "maybe", "not_going"].includes(status)) {
    res.status(400).json({ error: "status must be going, maybe, or not_going" }); return;
  }

  const { rows: evtRows } = await pool.query(
    `SELECT * FROM events WHERE id = $1 AND status = 'active'`, [id],
  );
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found or not active" }); return; }
  const evt = evtRows[0];

  // Enforce max_attendees cap for "going"
  if (status === "going" && evt.max_participants) {
    const { rows: capRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM event_rsvps WHERE event_id = $1 AND status = 'going'
         AND user_id != $2`, [id, myId],
    );
    if (parseInt(capRows[0].cnt) >= (evt.max_participants as number)) {
      res.status(400).json({ error: "Event is at capacity for 'Going' RSVPs" }); return;
    }
  }

  await pool.query(
    `INSERT INTO event_rsvps (event_id, user_id, status, responded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3, responded_at = NOW()`,
    [id, myId, status],
  );

  // Notify creator
  if ((evt.creator_id as number | null) && evt.creator_id !== myId && status === "going") {
    const [me] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, myId));
    await db.insert(notificationsTable).values({
      userId: evt.creator_id as number,
      type: "event_rsvp",
      title: `🎮 ${me?.displayName ?? "Someone"} is going to your event`,
      body: evt.title as string,
      relatedId: id,
    });
  }

  const rsvpMap = await fetchRsvpCounts([id]);
  res.json({ eventId: id, status, rsvpCounts: rsvpMap.get(id) ?? { going: 0, maybe: 0, notGoing: 0 } });
});

// ── DELETE /events/:id/rsvp ───────────────────────────────────────────────────
router.delete("/events/:id/rsvp", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  await pool.query(`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [id, myId]);
  res.json({ ok: true });
});

// ── GET /events/:id/posts — discussion thread ─────────────────────────────────
router.get("/events/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows: evtRows } = await pool.query(`SELECT id FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const { rows } = await pool.query(
    `SELECT ep.id, ep.body, ep.created_at, u.id AS user_id, u.display_name, u.avatar_url
     FROM event_posts ep JOIN users u ON u.id = ep.user_id
     WHERE ep.event_id = $1 ORDER BY ep.created_at ASC LIMIT 100`,
    [id],
  );
  res.json(rows.map((r: any) => ({
    id: r.id, body: r.body, createdAt: new Date(r.created_at).toISOString(),
    user: { id: r.user_id, displayName: r.display_name, avatarUrl: toPublicImageUrl(r.avatar_url) },
  })));
});

// ── POST /events/:id/posts ────────────────────────────────────────────────────
router.post("/events/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }
  const { body } = req.body as { body?: string };
  if (!body || body.trim().length === 0) { res.status(400).json({ error: "body is required" }); return; }
  if (body.trim().length > 2000) { res.status(400).json({ error: "body too long" }); return; }

  const { rows: evtRows } = await pool.query(`SELECT id FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO event_posts (event_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [id, myId, body.trim()],
  );
  res.status(201).json({ id: rows[0].id, eventId: id, body: body.trim() });
});

// ── POST /events/:id/rate ─────────────────────────────────────────────────────
router.post("/events/:id/rate", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }
  const { rating } = req.body as { rating?: number };
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ error: "rating must be 1-5" }); return; }

  // Only RSVPed attendees can rate
  const { rows: rsvpRows } = await pool.query(
    `SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND status = 'going'`, [id, myId],
  );
  if (rsvpRows.length === 0) { res.status(403).json({ error: "Only attendees (going) can rate this event" }); return; }

  // Upsert — one rating per user; updating is allowed (changing your mind)
  await pool.query(
    `INSERT INTO event_ratings (event_id, user_id, rating)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, rated_at = NOW()`,
    [id, myId, rating],
  );

  // Keep denormalized summary in sync from canonical data
  await pool.query(
    `UPDATE events e
     SET rating_sum   = COALESCE((SELECT SUM(r.rating)   FROM event_ratings r WHERE r.event_id = e.id), 0),
         rating_count = COALESCE((SELECT COUNT(*)         FROM event_ratings r WHERE r.event_id = e.id), 0)
     WHERE e.id = $1`,
    [id],
  );

  res.json({ ok: true, rating });
});

// ── POST /events — create Game Night ─────────────────────────────────────────
router.post("/events", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const {
    title, titleAr, description, game, maxParticipants, scheduledAt,
    eventType, bannerImageKey, recurringRule, partyId,
  } = req.body as {
    title?: string; titleAr?: string; description?: string; game?: string;
    maxParticipants?: number; scheduledAt?: string;
    eventType?: string; bannerImageKey?: string;
    recurringRule?: { freq: string; count?: number };
    partyId?: number;
  };

  if (!title || title.trim().length === 0) {
    res.status(400).json({ error: "Title is required" }); return;
  }
  if (!scheduledAt) {
    res.status(400).json({ error: "scheduledAt is required for Game Nights" }); return;
  }
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    res.status(400).json({ error: "scheduledAt must be a future date" }); return;
  }
  if (maxParticipants !== undefined && (maxParticipants < 2 || maxParticipants > 500)) {
    res.status(400).json({ error: "maxParticipants must be between 2 and 500" }); return;
  }
  const validEventTypes = ["casual", "tournament", "coaching", "community"];
  if (eventType && !validEventTypes.includes(eventType)) {
    res.status(400).json({ error: "Invalid eventType" }); return;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO events
       (creator_id, type, title, title_ar, description, game, max_participants, scheduled_at,
        expires_at, status, xp_reward, icon, event_type, banner_image_key, party_id)
     VALUES ($1, 'game_night', $2, $3, $4, $5, $6, $7,
             $7 + INTERVAL '2 hours', 'active', 0, '🎮', $8, $9, $10)
     RETURNING id`,
    [myId, title.trim(), titleAr ?? null, description ?? null, game ?? null,
     maxParticipants ?? null, scheduledDate.toISOString(),
     eventType ?? null, bannerImageKey ?? null, partyId ?? null],
  );
  const eventId = rows[0].id;

  // Auto-RSVP creator as going
  await pool.query(
    `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, 'going') ON CONFLICT DO NOTHING`,
    [eventId, myId],
  );
  // Also add to legacy participants
  await pool.query(
    `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [eventId, myId],
  );

  // Expand recurring instances
  if (recurringRule?.freq) {
    const { rows: evtRows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    void expandRecurring(eventId, evtRows[0] as Record<string, unknown>, recurringRule);
    await pool.query(`UPDATE events SET recurring_rule = $1 WHERE id = $2`, [JSON.stringify(recurringRule), eventId]);
  }

  const { rows: evtRows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
  res.status(201).json(serializeEvent(evtRows[0], 1, true, { going: 1, maybe: 0, notGoing: 0 }, "going"));
});

// ── POST /events/:id/join ─────────────────────────────────────────────────────
router.post("/events/:id/join", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows: evtRows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }
  const evt = evtRows[0];

  if (evt.type === "flash") {
    res.status(400).json({ error: "Flash events are completed by activity — do the challenge activity to earn XP" });
    return;
  }
  if (evt.status !== "active") { res.status(400).json({ error: "Event is no longer active" }); return; }
  if (evt.expires_at && new Date(evt.expires_at as string) < new Date()) {
    res.status(400).json({ error: "Event has expired" }); return;
  }
  if (evt.max_participants) {
    const { rows: cntRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [id],
    );
    if (parseInt(cntRows[0].cnt) >= (evt.max_participants as number)) {
      res.status(400).json({ error: "Event is full" }); return;
    }
  }

  await pool.query(
    `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, myId],
  );
  // Also upsert RSVP as "going"
  await pool.query(
    `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, 'going')
     ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'going', responded_at = NOW()`,
    [id, myId],
  );

  if (evt.creator_id && evt.creator_id !== myId) {
    const [me] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, myId));
    await db.insert(notificationsTable).values({
      userId: evt.creator_id as number,
      type: "event_join",
      title: `🎮 ${me?.displayName ?? "Someone"} joined your Game Night`,
      body: evt.title as string,
      relatedId: id,
    });
  }

  const [{ rows: pRows }, rsvpMap] = await Promise.all([
    pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [id]),
    fetchRsvpCounts([id]),
  ]);
  const rc = rsvpMap.get(id) ?? { going: 0, maybe: 0, notGoing: 0 };
  res.json(serializeEvent(evt, parseInt(pRows[0].cnt), true, rc, "going"));
});

void ensureTables();

export default router;
