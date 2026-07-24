import { Router } from "express";
import { eq } from "drizzle-orm";
import { pool, db, permanentRoomsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";
import {
  addStagePresence,
  removeStagePresenceForRoom,
  getStageMembers,
} from "../lib/stage-presence";
import { roomAccessCache, verifiedKey } from "./rooms";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();

async function ensureTables(): Promise<void> {
  await pool.query(`
    ALTER TABLE permanent_rooms ADD COLUMN IF NOT EXISTS is_stage_mode BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS stage_participants (
      id          SERIAL PRIMARY KEY,
      room_name   VARCHAR(200) NOT NULL,
      user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        VARCHAR(20)  NOT NULL DEFAULT 'audience',
      hand_raised BOOLEAN      NOT NULL DEFAULT FALSE,
      granted_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS stage_participants_room_idx ON stage_participants(room_name);
  `);
  // Add the unique constraint idempotently — DO NOT rely on CREATE TABLE IF NOT EXISTS
  // for constraints because the table may already exist without the constraint.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stage_participants_room_name_user_id_key'
          AND conrelid = 'stage_participants'::regclass
      ) THEN
        ALTER TABLE stage_participants ADD CONSTRAINT stage_participants_room_name_user_id_key UNIQUE (room_name, user_id);
      END IF;
    END$$;
  `);
}

void ensureTables().catch((e) => logger.error({ e }, "stage: ensureTables failed"));

// ── helpers ────────────────────────────────────────────────────────────────────

interface StageParticipantRow {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  handRaised: boolean;
}

async function getParticipants(roomName: string): Promise<StageParticipantRow[]> {
  // Only return participants who are currently connected (in-memory presence).
  // DB rows are kept across reconnects to preserve promoted roles, so we must
  // filter here to avoid showing disconnected users in the participant list.
  const connectedIds = getStageMembers(roomName);
  if (connectedIds.length === 0) return [];

  const { rows } = await pool.query<{
    user_id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    role: string;
    hand_raised: boolean;
  }>(
    `SELECT sp.user_id, u.username, u.display_name, u.avatar_url, sp.role, sp.hand_raised
     FROM stage_participants sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.room_name = $1
       AND sp.user_id = ANY($2::int[])
     ORDER BY CASE sp.role WHEN 'speaker' THEN 0 ELSE 1 END, sp.created_at`,
    [roomName, connectedIds],
  );
  return rows.map((r) => ({
    userId:      r.user_id,
    username:    r.username,
    displayName: r.display_name,
    avatarUrl:   toPublicImageUrl(r.avatar_url),
    role:        r.role,
    handRaised:  r.hand_raised,
  }));
}

function broadcastToRoom(roomName: string, payload: unknown): void {
  for (const uid of getStageMembers(roomName)) {
    pushToUser(uid, payload);
  }
}

/** Return the ownerId for a `proroom:ID` room, or null otherwise. */
async function getRoomOwnerId(roomName: string): Promise<number | null> {
  if (!roomName.startsWith("proroom:")) return null;
  const roomId = Number(roomName.split(":")[1]);
  if (isNaN(roomId)) return null;
  const [room] = await db
    .select({ ownerId: permanentRoomsTable.ownerId })
    .from(permanentRoomsTable)
    .where(eq(permanentRoomsTable.id, roomId));
  return room?.ownerId ?? null;
}

// ── GET /api/stage/:roomName/participants ──────────────────────────────────────

router.get("/stage/:roomName/participants", requireAuth, async (req, res): Promise<void> => {
  const roomName = decodeURIComponent(req.params.roomName);
  try {
    const participants = await getParticipants(roomName);
    const ownerId = await getRoomOwnerId(roomName);
    res.json({ participants, ownerId });
  } catch (err) {
    logger.error({ err }, "stage: list participants failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/stage/join ───────────────────────────────────────────────────────
// Register the caller as an audience member (or speaker if they are the owner).
// Returns { isStageRoom, myRole, participants }.

router.post("/stage/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { roomName } = req.body as { roomName?: string };

  if (!roomName?.startsWith("proroom:")) {
    res.json({ isStageRoom: false, myRole: "speaker", participants: [] });
    return;
  }

  const roomId = Number(roomName.split(":")[1]);
  if (isNaN(roomId)) { res.status(400).json({ error: "Invalid room" }); return; }

  try {
    const { rows } = await pool.query<{
      owner_id: number;
      is_stage_mode: boolean;
      password_hash: string | null;
    }>(
      "SELECT owner_id, is_stage_mode, password_hash FROM permanent_rooms WHERE id = $1",
      [roomId],
    );
    const room = rows[0];
    if (!room || !room.is_stage_mode) {
      res.json({ isStageRoom: false, myRole: "speaker", participants: [] });
      return;
    }

    // Enforce room access — mirrors the livekit token gate.
    // If the room has a password, the user must have verified it via
    // POST /rooms/:id/verify-password (whose success populates roomAccessCache).
    if (room.password_hash) {
      const key = verifiedKey(userId, roomId);
      if (!roomAccessCache.has(key)) {
        res.status(403).json({ error: "Password verification required" });
        return;
      }
    }

    const defaultRole: "speaker" | "audience" = userId === room.owner_id ? "speaker" : "audience";

    // Upsert — insert with default role but DO NOTHING on conflict so a
    // previously-promoted speaker keeps their role across reconnects.
    await pool.query(
      `INSERT INTO stage_participants (room_name, user_id, role, hand_raised)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (room_name, user_id) DO NOTHING`,
      [roomName, userId, defaultRole],
    );

    // Always return the persisted role (may differ from defaultRole if the
    // user was previously granted speaker and is rejoining mid-session).
    const { rows: roleRows } = await pool.query<{ role: string }>(
      "SELECT role FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, userId],
    );
    const myRole = (roleRows[0]?.role ?? defaultRole) as "speaker" | "audience";

    // Capture members already in the room BEFORE adding the new joiner so we
    // can notify them — the joiner itself receives the full list in the response.
    const existingMembers = getStageMembers(roomName);

    addStagePresence(roomName, userId);

    const participants = await getParticipants(roomName);
    res.json({ isStageRoom: true, myRole, ownerId: room.owner_id, participants });

    // Push a join notification to everyone who was already connected.
    const joinedParticipant = participants.find((p) => p.userId === userId);
    if (joinedParticipant && existingMembers.length > 0) {
      for (const uid of existingMembers) {
        pushToUser(uid, {
          type:        "stage-participant-join",
          roomName,
          participant: joinedParticipant,
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "stage: join failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── DELETE /api/stage/leave ────────────────────────────────────────────────────

router.delete("/stage/leave", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { roomName } = req.body as { roomName?: string };
  if (!roomName) { res.status(400).json({ error: "roomName required" }); return; }

  try {
    await pool.query(
      "DELETE FROM stage_participants WHERE room_name = $1 AND user_id = $2",
      [roomName, userId],
    );
    removeStagePresenceForRoom(roomName, userId);

    // Notify remaining participants that this user left
    broadcastToRoom(roomName, { type: "stage-role-change", roomName, userId, role: "left" });

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "stage: leave failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/stage/hand ──────────────────────────────────────────────────────
// Toggle hand-raise for the calling audience member.

router.post("/stage/hand", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const { roomName, raised } = req.body as { roomName?: string; raised?: boolean };
  if (!roomName || typeof raised !== "boolean") {
    res.status(400).json({ error: "roomName and raised required" });
    return;
  }

  try {
    await pool.query(
      `UPDATE stage_participants
       SET hand_raised = $1
       WHERE room_name = $2 AND user_id = $3 AND role = 'audience'`,
      [raised, roomName, userId],
    );

    broadcastToRoom(roomName, {
      type:     "stage-hand-raise",
      roomName,
      userId,
      raised,
    });

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "stage: hand toggle failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/stage/grant/:targetUserId ───────────────────────────────────────
// Room owner elevates an audience member to speaker.

router.post("/stage/grant/:targetUserId", requireAuth, async (req, res): Promise<void> => {
  const callerId  = req.auth!.userId;
  const targetId  = Number(req.params.targetUserId);
  const { roomName } = req.body as { roomName?: string };

  if (!roomName || isNaN(targetId)) {
    res.status(400).json({ error: "roomName and valid userId required" });
    return;
  }

  const ownerId = await getRoomOwnerId(roomName);
  if (callerId !== ownerId) {
    res.status(403).json({ error: "Only the room owner can grant speaker" });
    return;
  }

  try {
    await pool.query(
      `UPDATE stage_participants
       SET role = 'speaker', hand_raised = false, granted_at = NOW()
       WHERE room_name = $1 AND user_id = $2`,
      [roomName, targetId],
    );

    broadcastToRoom(roomName, {
      type:     "stage-role-change",
      roomName,
      userId:   targetId,
      role:     "speaker",
    });

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "stage: grant speaker failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/stage/revoke/:targetUserId ──────────────────────────────────────
// Room owner returns a speaker to audience.

router.post("/stage/revoke/:targetUserId", requireAuth, async (req, res): Promise<void> => {
  const callerId  = req.auth!.userId;
  const targetId  = Number(req.params.targetUserId);
  const { roomName } = req.body as { roomName?: string };

  if (!roomName || isNaN(targetId)) {
    res.status(400).json({ error: "roomName and valid userId required" });
    return;
  }

  const ownerId = await getRoomOwnerId(roomName);
  if (callerId !== ownerId) {
    res.status(403).json({ error: "Only the room owner can revoke speaker" });
    return;
  }

  try {
    await pool.query(
      `UPDATE stage_participants
       SET role = 'audience', hand_raised = false, granted_at = NULL
       WHERE room_name = $1 AND user_id = $2`,
      [roomName, targetId],
    );

    broadcastToRoom(roomName, {
      type:     "stage-role-change",
      roomName,
      userId:   targetId,
      role:     "audience",
    });

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "stage: revoke speaker failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /api/stage/room/:roomId/mode ────────────────────────────────────────
// Room owner toggles stage mode on/off.

router.patch("/stage/room/:roomId/mode", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.auth!.userId;
  const roomId  = Number(req.params.roomId);
  const { isStageMode } = req.body as { isStageMode?: boolean };

  if (isNaN(roomId) || typeof isStageMode !== "boolean") {
    res.status(400).json({ error: "roomId and isStageMode boolean required" });
    return;
  }

  try {
    const { rowCount } = await pool.query(
      "UPDATE permanent_rooms SET is_stage_mode = $1 WHERE id = $2 AND owner_id = $3",
      [isStageMode, roomId, userId],
    );
    if (!rowCount) { res.status(404).json({ error: "Room not found" }); return; }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "stage: set mode failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
