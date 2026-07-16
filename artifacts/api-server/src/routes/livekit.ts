import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { requireAuth } from "../middlewares/auth";
import { and, eq } from "drizzle-orm";
import { db, partyMembersTable, usersTable } from "@workspace/db";
import { callRooms } from "../ws/signaling";
import { logger } from "../lib/logger";
import { toPublicImageUrl } from "../lib/objectStorage";

const router = Router();

/**
 * GET /api/livekit/token?room=<roomName>
 *
 * Issues a LiveKit access token for the calling user after verifying they are
 * authorized to join the requested room:
 *   - party:<id>  — user must be a current member of that party
 *   - call:<id>   — user must be the caller or target of that pending call
 *
 * Returns { token, url } so the client can connect directly to LiveKit Cloud.
 */
router.get("/livekit/token", requireAuth, async (req, res): Promise<void> => {
  const room = typeof req.query.room === "string" ? req.query.room.trim() : null;
  if (!room) {
    res.status(400).json({ error: "room query param is required" });
    return;
  }

  const userId = req.auth!.userId;
  const username = req.auth!.username;

  // ─── Authorization ──────────────────────────────────────────────────────────

  if (room.startsWith("party:")) {
    const partyId = Number(room.slice("party:".length));
    if (!Number.isInteger(partyId) || partyId <= 0) {
      res.status(400).json({ error: "Invalid party id" });
      return;
    }
    try {
      const [membership] = await db
        .select({ userId: partyMembersTable.userId })
        .from(partyMembersTable)
        .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, userId)));
      if (!membership) {
        res.status(403).json({ error: "Not a party member" });
        return;
      }
    } catch (err) {
      logger.error({ err }, "livekit: party membership check failed");
      res.status(500).json({ error: "Internal error" });
      return;
    }
  } else if (room.startsWith("call:")) {
    const info = callRooms.get(room);
    if (!info || (info.callerId !== userId && info.targetId !== userId)) {
      res.status(403).json({ error: "Not authorized for this call" });
      return;
    }
  } else {
    res.status(400).json({ error: "Invalid room format (expected party:<id> or call:<id>)" });
    return;
  }

  // ─── Config check ───────────────────────────────────────────────────────────

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    logger.error("livekit: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL not set");
    res.status(503).json({ error: "Voice service not configured" });
    return;
  }

  // ─── Participant metadata ───────────────────────────────────────────────────
  // Include display info so other participants can render name + avatar without
  // a separate API call.

  let displayName = username;
  let avatarUrl: string | null = null;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user) {
      displayName = user.displayName;
      avatarUrl = toPublicImageUrl(user.avatarUrl ?? null);
    }
  } catch {
    /* non-fatal — fall back to username */
  }

  // ─── Token ─────────────────────────────────────────────────────────────────

  const at = new AccessToken(apiKey, apiSecret, {
    identity: String(userId),
    name: username,
    metadata: JSON.stringify({ displayName, avatarUrl }),
    ttl: "4h",
  });

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  res.json({ token: await at.toJwt(), url });
});

export default router;
