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

  // Remove any templates whose quest_key has no server-side hook wired.
  // (join_room is honor-based in the quests system with no atomic server event)
  await pool.query(`DELETE FROM flash_event_templates WHERE quest_key = 'join_room'`);

  // Seed templates if empty (only keys that have hooks: post_lfg, respond_lfg, send_messages, add_friend)
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

// ── Bonus XP helper (mirrors quests.ts addBonusXp) ──────────────────────────

async function addBonusXp(userId: number, xp: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date, shield_count, bonus_xp, updated_at)
     VALUES ($1, 0, 0, NULL, 0, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET bonus_xp = user_streaks.bonus_xp + $2, updated_at = NOW()`,
    [userId, xp],
  );
}

// ── Quest target counts (for multi-step flash challenges) ────────────────────
const QUEST_TARGETS: Record<string, number> = {
  post_lfg: 1,
  respond_lfg: 1,
  send_messages: 5,
  join_room: 1,
  add_friend: 1,
};

// ── Flash completion hook — exported for activity hooks in other routes ───────
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

    // For send_messages (target = 5), verify count BEFORE attempting the completion insert
    const target = QUEST_TARGETS[activityKey] ?? 1;
    if (target > 1 && activityKey === "send_messages") {
      const { rows: cntRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text FROM messages WHERE sender_id = $1 AND created_at >= $2`,
        [userId, flash.created_at],
      );
      if (parseInt(cntRows[0].count) < target) return;
    }

    // Atomic completion: INSERT ... RETURNING only yields a row when the insert
    // actually created a new row (not a duplicate). This eliminates the read-then-write
    // race; concurrent requests that both pass the count check above will race here,
    // but only one will get a RETURNING row and proceed to award XP.
    const { rows: insertedRows } = await pool.query<{ event_id: number }>(
      `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
      [flash.id, userId],
    );
    if (insertedRows.length === 0) return; // Already completed (or concurrent race loser)

    await addBonusXp(userId, flash.xp_reward);

    // Notify the user
    await db.insert(notificationsTable).values({
      userId,
      type: "flash_complete",
      title: `🎉 Flash Event Complete!`,
      body: `You earned ${flash.xp_reward} XP from "${flash.title}"`,
      relatedId: flash.id,
    });

    // Push real-time WS notification to the completing user
    pushToUser(userId, {
      type: "flash_event_complete",
      eventId: flash.id,
      xp: flash.xp_reward,
      title: flash.title,
    });

    logger.info({ userId, eventId: flash.id, xp: flash.xp_reward }, "flash-event: user completed");
  } catch (err) {
    logger.error({ err }, "flash-event: checkFlashCompletion error");
  }
}

// ── Flash Event scheduler — creates a new flash event every 48 h ─────────────
export function startFlashEventScheduler(): void {
  const INTERVAL_MS = 48 * 60 * 60 * 1000;

  const createNextFlash = async (): Promise<void> => {
    try {
      // Cancel any currently active flash events
      await pool.query(`UPDATE events SET status = 'cancelled' WHERE type = 'flash' AND status = 'active'`);

      // Round-robin template selection
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
         VALUES (NULL, 'flash', $1, $2, $3, $4, $5, $6, $7, 'active', $8)
         RETURNING id`,
        [tpl.title_en, tpl.title_ar, tpl.description_en, tpl.description_ar, tpl.quest_key, tpl.icon, expiresAt.toISOString(), tpl.xp_reward],
      );
      const eventId = evtRows[0]?.id;
      logger.info({ eventId, questKey: tpl.quest_key }, "flash-event: new event created");

      // Broadcast real-time WS notification to all connected clients
      if (eventId) {
        broadcastAll({
          type: "flash_event_new",
          eventId,
          title: tpl.title_en,
          titleAr: tpl.title_ar,
          icon: tpl.icon,
          xpReward: tpl.xp_reward,
          questKey: tpl.quest_key,
          expiresAt: expiresAt.toISOString(),
        });
      }

      // Notify online users (fire-and-forget, best-effort)
      const { rows: onlineRows } = await pool.query<{ id: number }>(
        `SELECT id FROM users WHERE status != 'offline' LIMIT 200`,
      );
      if (onlineRows.length > 0 && eventId) {
        const vals = onlineRows
          .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
          .join(",");
        const params: (string | number | null)[] = onlineRows.flatMap((u) => [
          u.id, "flash_event",
          `⚡ Flash Event: ${tpl.title_en}`,
          tpl.description_en ?? "",
          eventId,
        ]);
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`,
          params,
        );
      }
    } catch (err) {
      logger.error({ err }, "flash-event: scheduler error");
    }
  };

  // Create one immediately if there is no active flash event
  void pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM events WHERE type = 'flash' AND status = 'active'`)
    .then(({ rows }) => {
      if (parseInt(rows[0].count) === 0) void createNextFlash();
    })
    .catch(() => {});

  setInterval(() => void createNextFlash(), INTERVAL_MS);
  logger.info("flash-event: scheduler started");
}

// ── Game-night 1-hour reminder sweeper ───────────────────────────────────────
export function startGameNightSweeper(): void {
  setInterval(async () => {
    try {
      const { rows: upcoming } = await pool.query<{ id: number; title: string }>(
        `SELECT id, title FROM events
         WHERE type = 'game_night' AND status = 'active'
           AND notified_1h = FALSE
           AND scheduled_at IS NOT NULL
           AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'`,
      );
      for (const evt of upcoming) {
        const { rows: parts } = await pool.query<{ user_id: number }>(
          `SELECT user_id FROM event_participants WHERE event_id = $1`,
          [evt.id],
        );
        if (parts.length > 0) {
          const vals = parts
            .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
            .join(",");
          const params: (string | number | null)[] = parts.flatMap((p) => [
            p.user_id, "event_reminder",
            `🎮 Game Night Starting Soon!`,
            `"${evt.title}" starts in less than 1 hour`,
            evt.id,
          ]);
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, related_id) VALUES ${vals}`,
            params,
          );
        }
        await pool.query(`UPDATE events SET notified_1h = TRUE WHERE id = $1`, [evt.id]);
      }
    } catch (err) {
      logger.error({ err }, "events: game-night sweeper error");
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeEvent(
  row: Record<string, unknown>,
  participantCount: number,
  viewerJoined: boolean,
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
  };
}

// ── GET /events ───────────────────────────────────────────────────────────────
router.get("/events", requireAuth, async (req, res): Promise<void> => {
  const myId  = req.auth!.userId;
  const type   = typeof req.query.type   === "string" ? req.query.type   : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : "active";

  const params: unknown[] = [];
  let q = `SELECT * FROM events WHERE 1=1`;

  if (type) {
    params.push(type);
    q += ` AND type = $${params.length}`;
  }
  if (status !== "all") {
    params.push(status);
    q += ` AND status = $${params.length}`;
  }
  q += ` ORDER BY
    CASE WHEN type = 'flash' AND status = 'active' THEN 0 ELSE 1 END,
    created_at DESC
    LIMIT 50`;

  const { rows: events } = await pool.query(q, params);
  if (events.length === 0) { res.json([]); return; }

  const ids = events.map((e: any) => e.id as number);

  const [{ rows: countRows }, { rows: joinedRows }] = await Promise.all([
    pool.query<{ event_id: number; cnt: string }>(
      `SELECT event_id, COUNT(*)::text AS cnt FROM event_participants WHERE event_id = ANY($1) GROUP BY event_id`,
      [ids],
    ),
    pool.query<{ event_id: number }>(
      `SELECT event_id FROM event_participants WHERE user_id = $1 AND event_id = ANY($2)`,
      [myId, ids],
    ),
  ]);

  const countMap  = new Map(countRows.map((r) => [r.event_id, parseInt(r.cnt)]));
  const joinedSet = new Set(joinedRows.map((r) => r.event_id));

  res.json(events.map((e: any) => serializeEvent(e, countMap.get(e.id) ?? 0, joinedSet.has(e.id))));
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

  const [{ rows: pRows }, { rows: jRows }] = await Promise.all([
    pool.query<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [id]),
    pool.query(`SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2`, [id, myId]),
  ]);

  res.json(serializeEvent(evt, parseInt(pRows[0]?.cnt ?? "0"), jRows.length > 0));
});

// ── GET /events/:id/participants ──────────────────────────────────────────────
router.get("/events/:id/participants", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows: evtRows } = await pool.query<{ id: number }>(
    `SELECT id FROM events WHERE id = $1`, [id],
  );
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const { rows } = await pool.query<{
    id: number; display_name: string; avatar_url: string | null;
  }>(
    `SELECT u.id, u.display_name, u.avatar_url
     FROM event_participants ep
     JOIN users u ON u.id = ep.user_id
     WHERE ep.event_id = $1
     ORDER BY ep.joined_at ASC`,
    [id],
  );

  res.json(rows.map((r) => ({
    id:          r.id,
    displayName: r.display_name,
    avatarUrl:   toPublicImageUrl(r.avatar_url),
  })));
});

// ── POST /events — create a Game Night ───────────────────────────────────────
router.post("/events", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const { title, titleAr, description, game, maxParticipants, scheduledAt } = req.body as {
    title?: string; titleAr?: string; description?: string; game?: string;
    maxParticipants?: number; scheduledAt?: string;
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

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO events
       (creator_id, type, title, title_ar, description, game, max_participants, scheduled_at,
        expires_at, status, xp_reward, icon)
     VALUES ($1, 'game_night', $2, $3, $4, $5, $6, $7,
             $7 + INTERVAL '2 hours', 'active', 0, '🎮')
     RETURNING id`,
    [myId, title.trim(), titleAr ?? null, description ?? null, game ?? null,
     maxParticipants ?? null, scheduledDate.toISOString()],
  );
  const eventId = rows[0].id;

  // Auto-join the creator
  await pool.query(
    `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [eventId, myId],
  );

  const { rows: evtRows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
  res.status(201).json(serializeEvent(evtRows[0], 1, true));
});

// ── POST /events/:id/join ─────────────────────────────────────────────────────
router.post("/events/:id/join", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const id   = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid event id" }); return; }

  const { rows: evtRows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
  if (evtRows.length === 0) { res.status(404).json({ error: "Event not found" }); return; }
  const evt = evtRows[0];

  // Flash events are completed exclusively by activity hooks (post LFG, send messages, etc.)
  // Allowing a direct join would bypass activity validation and falsely mark the event as done.
  if (evt.type === "flash") {
    res.status(400).json({ error: "Flash events are completed by activity — do the challenge activity to earn XP" });
    return;
  }

  if (evt.status !== "active") {
    res.status(400).json({ error: "Event is no longer active" }); return;
  }
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
    `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, myId],
  );

  // Notify creator for game night joins
  if (evt.type === "game_night" && evt.creator_id && evt.creator_id !== myId) {
    const [me] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, myId));
    await db.insert(notificationsTable).values({
      userId: evt.creator_id as number,
      type: "event_join",
      title: `🎮 ${me?.displayName ?? "Someone"} joined your Game Night`,
      body: evt.title as string,
      relatedId: id,
    });
  }

  const { rows: pRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM event_participants WHERE event_id = $1`, [id],
  );
  res.json(serializeEvent(evt, parseInt(pRows[0].cnt), true));
});

void ensureTables();

export default router;
