import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import { URL } from "node:url";
import { eq, and } from "drizzle-orm";
import { db, usersTable, partiesTable, conversationParticipantsTable, friendshipsTable, blocksTable } from "@workspace/db";
import { verifyToken } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

/**
 * WebSocket server for call signaling, admin actions, and presence events.
 *
 * Media (audio / video / screen) is handled entirely by LiveKit Cloud — this
 * server no longer relays SDP or ICE candidates.  What remains here:
 *
 *   - Direct-call handshake  (call-invite / accept / decline / cancel)
 *   - Admin force-mute       (party leader mutes a member on their LiveKit side)
 *   - Force-evict            (kick a user so their client disconnects from LiveKit)
 *   - Typing indicators      (chat "typing…" events)
 *
 * `callRooms` is exported so the `/api/livekit/token` route can authorise call
 * participants before issuing tokens.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  ws: WebSocket;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAlive: boolean;
}

interface PendingCall {
  callId: string;
  room: string;
  callerId: number;
  targetId: number;
  /** True for invites sent to a 3rd+ person from inside an active call. */
  isGroupInvite?: boolean;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** userId → set of that user's open connections (multi-tab / multi-device) */
const clientsByUser = new Map<number, Set<Client>>();
/** ws → client */
const clientBySocket = new Map<WebSocket, Client>();
/** callId → pending call metadata */
const pendingCalls = new Map<string, PendingCall>();
/**
 * roomId → set of participants authorised for a `call:<id>` LiveKit room.
 * Starts with {callerId, targetId}; grows when extra participants are invited
 * via `call-group-invite`.  Exported for use by the `/api/livekit/token` route
 * so it can verify membership before issuing tokens.
 */
export const callRooms = new Map<string, { participants: Set<number> }>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function registerClient(client: Client): void {
  clientBySocket.set(client.ws, client);
  let set = clientsByUser.get(client.userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(client.userId, set);
  }
  set.add(client);
}

function unregisterClient(client: Client): void {
  clientBySocket.delete(client.ws);
  const set = clientsByUser.get(client.userId);
  if (set) {
    set.delete(client);
    if (set.size === 0) clientsByUser.delete(client.userId);
  }
}

/**
 * Push an arbitrary payload to all open WebSocket connections for a given user.
 * Used by HTTP route handlers that need to send a real-time event without going
 * through the signaling message loop (e.g. reputation vouches, quest credits).
 */
export function pushToUser(userId: number, payload: unknown): void {
  const clients = clientsByUser.get(userId);
  if (!clients) return;
  for (const client of clients) {
    send(client.ws, payload);
  }
}

// ─── Direct-call handshake ───────────────────────────────────────────────────

async function handleCallInvite(caller: Client, targetId: number): Promise<void> {
  // Prevent self-calls
  if (targetId === caller.userId) return;

  // Enforce block relationships — neither party can call the other if a block exists
  try {
    const [blockedByMe] = await db
      .select({ id: blocksTable.id })
      .from(blocksTable)
      .where(and(eq(blocksTable.blockerId, caller.userId), eq(blocksTable.blockedId, targetId)))
      .limit(1);
    const [blockedByThem] = await db
      .select({ id: blocksTable.id })
      .from(blocksTable)
      .where(and(eq(blocksTable.blockerId, targetId), eq(blocksTable.blockedId, caller.userId)))
      .limit(1);
    if (blockedByMe || blockedByThem) {
      send(caller.ws, { type: "call-failed", to: targetId, reason: "blocked" });
      return;
    }
  } catch (err) {
    logger.error({ err, caller: caller.userId, target: targetId }, "ws: block check failed for call-invite");
    send(caller.ws, { type: "call-failed", to: targetId, reason: "error" });
    return;
  }

  const targets = clientsByUser.get(targetId);
  if (!targets || targets.size === 0) {
    send(caller.ws, { type: "call-failed", to: targetId, reason: "offline" });
    return;
  }

  const callId = `${caller.userId}-${targetId}-${Date.now()}`;
  const room = `call:${callId}`;
  pendingCalls.set(callId, { callId, room, callerId: caller.userId, targetId, isGroupInvite: false });
  callRooms.set(room, { participants: new Set([caller.userId, targetId]) });

  // Auto-expire the invite if unanswered within 45 s.
  setTimeout(() => {
    if (pendingCalls.has(callId)) {
      pendingCalls.delete(callId);
      if (!callRooms.has(room)) return;
      callRooms.delete(room);
      send(caller.ws, { type: "call-failed", to: targetId, reason: "timeout" });
      const ts = clientsByUser.get(targetId);
      if (ts) for (const t of ts) send(t.ws, { type: "call-cancelled", callId });
    }
  }, 45_000);

  send(caller.ws, { type: "call-ringing", callId, room, to: targetId });

  const from = {
    userId: caller.userId,
    username: caller.username,
    displayName: caller.displayName,
    avatarUrl: caller.avatarUrl,
  };
  for (const t of targets) send(t.ws, { type: "incoming-call", callId, room, from });
}

/** First session of the callee to accept or decline wins; clear the others. */
function clearOtherCalleeSessions(actor: Client, callId: string): void {
  const sessions = clientsByUser.get(actor.userId);
  if (!sessions) return;
  for (const s of sessions) {
    if (s !== actor) send(s.ws, { type: "call-cancelled", callId });
  }
}

function handleCallAccept(callee: Client, callId: string): void {
  const call = pendingCalls.get(callId);
  if (!call || call.targetId !== callee.userId) return;
  pendingCalls.delete(callId);
  clearOtherCalleeSessions(callee, callId);

  const callers = clientsByUser.get(call.callerId);
  if (!callers || callers.size === 0) {
    send(callee.ws, { type: "call-failed", to: call.callerId, reason: "offline" });
    return;
  }

  // Add the new participant to the room's authorised set.
  // For regular calls this is a no-op (both were added in handleCallInvite).
  // For group invites the callee is a new entrant and must be added now so
  // the LiveKit token endpoint accepts their token request.
  const roomEntry = callRooms.get(call.room);
  if (roomEntry) roomEntry.participants.add(callee.userId);

  for (const c of callers) send(c.ws, { type: "call-accepted", callId, room: call.room, by: callee.userId });
  send(callee.ws, { type: "call-accepted", callId, room: call.room, by: callee.userId });
}

function handleCallDecline(callee: Client, callId: string): void {
  const call = pendingCalls.get(callId);
  if (!call || call.targetId !== callee.userId) return;
  pendingCalls.delete(callId);
  // For group invites, keep the room alive — other participants are still in it.
  if (!call.isGroupInvite) callRooms.delete(call.room);
  clearOtherCalleeSessions(callee, callId);
  const callers = clientsByUser.get(call.callerId);
  if (callers) for (const c of callers) send(c.ws, { type: "call-declined", callId, by: callee.userId });
}

function handleCallCancel(caller: Client, callId: string): void {
  const call = pendingCalls.get(callId);
  if (!call || call.callerId !== caller.userId) return;
  pendingCalls.delete(callId);
  // For group invites, keep the room alive — other participants are still in it.
  if (!call.isGroupInvite) callRooms.delete(call.room);
  const targets = clientsByUser.get(call.targetId);
  if (targets) for (const t of targets) send(t.ws, { type: "call-cancelled", callId });
}

/**
 * Clean up an active call room when a participant explicitly leaves.
 * Any current participant may send this.  The room is removed only when the
 * last participant departs (supports N-person group calls).
 */
function handleCallEnd(client: Client, room: string): void {
  if (!room.startsWith("call:")) return;
  const entry = callRooms.get(room);
  if (!entry || !entry.participants.has(client.userId)) return;
  entry.participants.delete(client.userId);
  if (entry.participants.size === 0) {
    callRooms.delete(room);
    logger.info({ room, by: client.userId }, "voice: call room cleaned up (last participant left)");
  } else {
    logger.info({ room, by: client.userId }, "voice: participant left call room");
  }
}

function cleanupCallsFor(client: Client): void {
  const remaining = clientsByUser.get(client.userId);
  const stillOnline = !!remaining && Array.from(remaining).some((c) => c !== client);
  if (stillOnline) return;

  // Clean up pending (unanswered) calls.
  for (const [callId, call] of pendingCalls) {
    if (call.callerId === client.userId) {
      pendingCalls.delete(callId);
      callRooms.delete(call.room);
      const targets = clientsByUser.get(call.targetId);
      if (targets) for (const t of targets) send(t.ws, { type: "call-cancelled", callId });
    } else if (call.targetId === client.userId) {
      pendingCalls.delete(callId);
      callRooms.delete(call.room);
      const callers = clientsByUser.get(call.callerId);
      if (callers) for (const c of callers) send(c.ws, { type: "call-declined", callId, by: client.userId });
    }
  }

  // Remove this user from any active call rooms they were part of.
  // Release the room only when the last participant departs.
  for (const [room, entry] of callRooms) {
    if (entry.participants.has(client.userId)) {
      entry.participants.delete(client.userId);
      if (entry.participants.size === 0) {
        callRooms.delete(room);
      }
      logger.info({ room, userId: client.userId }, "voice: call room released on WS disconnect");
    }
  }
}

// ─── Group call invite ────────────────────────────────────────────────────────

/**
 * Any participant already in an active call can invite a 3rd+ person.
 * Reuses the same pendingCalls + incoming-call flow as a regular call-invite,
 * but the room already exists so we must NOT create or delete it — only add
 * the new participant to callRooms when they accept.
 */
async function handleGroupCallInvite(inviter: Client, room: string, targetId: number): Promise<void> {
  if (targetId === inviter.userId) return;

  // Inviter must be an authorised participant of the named call room.
  const roomEntry = callRooms.get(room);
  if (!roomEntry || !roomEntry.participants.has(inviter.userId)) {
    send(inviter.ws, { type: "call-failed", to: targetId, reason: "not-in-room" });
    return;
  }

  // Target already in the room — silently ignore (race condition protection).
  if (roomEntry.participants.has(targetId)) return;

  // Block check — neither party can invite/be-invited across a block.
  try {
    const [blockedByMe] = await db
      .select({ id: blocksTable.id })
      .from(blocksTable)
      .where(and(eq(blocksTable.blockerId, inviter.userId), eq(blocksTable.blockedId, targetId)))
      .limit(1);
    const [blockedByThem] = await db
      .select({ id: blocksTable.id })
      .from(blocksTable)
      .where(and(eq(blocksTable.blockerId, targetId), eq(blocksTable.blockedId, inviter.userId)))
      .limit(1);
    if (blockedByMe || blockedByThem) {
      send(inviter.ws, { type: "call-failed", to: targetId, reason: "blocked" });
      return;
    }
  } catch (err) {
    logger.error({ err, inviter: inviter.userId, target: targetId }, "ws: block check failed for group invite");
    send(inviter.ws, { type: "call-failed", to: targetId, reason: "error" });
    return;
  }

  const targets = clientsByUser.get(targetId);
  if (!targets || targets.size === 0) {
    send(inviter.ws, { type: "call-failed", to: targetId, reason: "offline" });
    return;
  }

  const callId = `${inviter.userId}-${targetId}-${Date.now()}`;
  pendingCalls.set(callId, { callId, room, callerId: inviter.userId, targetId, isGroupInvite: true });

  // Auto-expire without touching callRooms (other participants are still active).
  setTimeout(() => {
    if (pendingCalls.has(callId)) {
      pendingCalls.delete(callId);
      send(inviter.ws, { type: "call-failed", to: targetId, reason: "timeout" });
      const ts = clientsByUser.get(targetId);
      if (ts) for (const t of ts) send(t.ws, { type: "call-cancelled", callId });
    }
  }, 45_000);

  // Notify the inviter that the invite is ringing (so UI can show pending state).
  send(inviter.ws, { type: "call-ringing", callId, room, to: targetId });

  // Ring the target with the same incoming-call event used for regular calls.
  const from = {
    userId: inviter.userId,
    username: inviter.username,
    displayName: inviter.displayName,
    avatarUrl: inviter.avatarUrl,
  };
  for (const t of targets) send(t.ws, { type: "incoming-call", callId, room, from });
  logger.info({ room, inviter: inviter.userId, target: targetId }, "voice: group invite sent");
}

// ─── Admin force-mute ─────────────────────────────────────────────────────────

/**
 * Party leader sends `admin-mute` → server verifies leadership in DB → relays
 * `force-mute` to the target's WS connections.  The target's LiveKit client
 * then calls `localParticipant.setMicrophoneEnabled(false)`.
 */
async function handleAdminMute(leader: Client, room: string, targetUserId: number): Promise<void> {
  if (!room.startsWith("party:")) return;
  const partyId = Number(room.slice("party:".length));
  if (!Number.isInteger(partyId) || partyId <= 0) return;

  try {
    const [party] = await db
      .select({ leaderId: partiesTable.leaderId })
      .from(partiesTable)
      .where(eq(partiesTable.id, partyId));
    if (!party || party.leaderId !== leader.userId) return;
  } catch (err) {
    logger.error({ err, room }, "voice: admin-mute party check failed");
    return;
  }

  const targets = clientsByUser.get(targetUserId);
  if (targets) {
    for (const t of targets) send(t.ws, { type: "force-mute", room });
    logger.info({ room, by: leader.userId, target: targetUserId }, "voice: admin-mute applied");
  }
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

async function handleTyping(client: Client, conversationId: number): Promise<void> {
  let participants: { userId: number }[];
  try {
    participants = await db
      .select({ userId: conversationParticipantsTable.userId })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, conversationId));
  } catch (err) {
    logger.error({ err, conversationId }, "ws: failed to fetch participants for typing");
    return;
  }
  if (!participants.some((p) => p.userId === client.userId)) return;

  for (const p of participants) {
    if (p.userId === client.userId) continue;
    const ts = clientsByUser.get(p.userId);
    if (!ts) continue;
    for (const t of ts) {
      send(t.ws, {
        type: "typing",
        conversationId,
        userId: client.userId,
        displayName: client.displayName,
      });
    }
  }
}

// ─── Message dispatch ─────────────────────────────────────────────────────────

async function handleMessage(client: Client, raw: RawData): Promise<void> {
  // Defense-in-depth: re-check suspension on every incoming message.
  // This ensures that a user who is suspended while already connected is
  // rejected on their next message rather than having their session persist
  // until the next heartbeat or manual disconnect.
  try {
    const [user] = await db
      .select({ status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, client.userId))
      .limit(1);
    if (!user || user.status === "suspended") {
      send(client.ws, { type: "suspended" });
      client.ws.terminate();
      logger.info({ userId: client.userId }, "ws: terminated suspended user mid-session");
      return;
    }
  } catch (err) {
    // Fail closed: if the DB is unavailable we cannot confirm the user is
    // still active, so terminate the connection.
    logger.error({ err, userId: client.userId }, "ws: suspension check failed; closing connection");
    client.ws.terminate();
    return;
  }

  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    send(client.ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg?.type) {
    case "call-invite":
      if (typeof msg.to === "number") await handleCallInvite(client, msg.to);
      break;
    case "call-group-invite":
      if (typeof msg.room === "string" && typeof msg.to === "number") {
        await handleGroupCallInvite(client, msg.room, msg.to);
      }
      break;
    case "call-accept":
      if (typeof msg.callId === "string") handleCallAccept(client, msg.callId);
      break;
    case "call-decline":
      if (typeof msg.callId === "string") handleCallDecline(client, msg.callId);
      break;
    case "call-cancel":
      if (typeof msg.callId === "string") handleCallCancel(client, msg.callId);
      break;
    case "call-end":
      if (typeof msg.room === "string") handleCallEnd(client, msg.room);
      break;
    case "admin-mute":
      if (typeof msg.room === "string" && typeof msg.userId === "number") {
        await handleAdminMute(client, msg.room, msg.userId);
      }
      break;
    case "typing":
      if (typeof msg.conversationId === "number") await handleTyping(client, msg.conversationId);
      break;
    case "ping":
      send(client.ws, { type: "pong" });
      break;
    default:
      break;
  }
}

function handleClose(client: Client): void {
  cleanupCallsFor(client);
  unregisterClient(client);
  logger.info({ userId: client.userId }, "voice: client disconnected");
}

// ─── Friend-online notification ───────────────────────────────────────────────

async function notifyFriendsOnline(client: Client): Promise<void> {
  const rows = await db
    .select({ friendId: friendshipsTable.friendId })
    .from(friendshipsTable)
    .where(eq(friendshipsTable.userId, client.userId));

  for (const { friendId } of rows) {
    const sessions = clientsByUser.get(friendId);
    if (!sessions) continue;
    for (const c of sessions) {
      send(c.ws, {
        type: "friend-online",
        userId: client.userId,
        displayName: client.displayName,
        avatarUrl: client.avatarUrl,
      });
    }
  }
}

// ─── External eviction API ────────────────────────────────────────────────────

/**
 * Tell all of a user's WS sessions to leave a specific room (e.g. after a
 * party kick).  The client receives `force-leave` and calls
 * `livekitRoom.disconnect()` to exit the LiveKit room.
 */
export function evictUserFromRoom(userId: number, room: string): void {
  const sessions = clientsByUser.get(userId);
  if (!sessions) return;
  for (const client of sessions) {
    send(client.ws, { type: "force-leave", room });
    logger.info({ room, userId }, "voice: force-evicted user from room");
  }
}

/**
 * Broadcast a payload to every connected client (all users, all sessions).
 * Used for server-wide push events like a new flash event starting.
 */
export function broadcastAll(payload: unknown): void {
  for (const clients of clientsByUser.values()) {
    for (const client of clients) {
      send(client.ws, payload);
    }
  }
}

/**
 * Terminate every open WebSocket connection for the given user.
 * Call this immediately after suspending a user so their existing WS session
 * is closed without waiting for the next message or heartbeat cycle.
 */
export function disconnectUser(userId: number): void {
  const sessions = clientsByUser.get(userId);
  if (!sessions) return;
  for (const client of sessions) {
    send(client.ws, { type: "suspended" });
    client.ws.terminate();
    logger.info({ userId }, "ws: terminated session due to suspension");
  }
}

// ─── Server attachment ────────────────────────────────────────────────────────

export function attachSignaling(server: Server): void {
  // Limit incoming frame size to 64 KB to prevent memory exhaustion from large payloads.
  // All legitimate signaling messages (typing, call-invite, admin-mute, ping) are tiny.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", async (req, socket, head) => {
    let pathname: string;
    let token: string | null;
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      pathname = url.pathname;
      token = url.searchParams.get("token");
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/api/ws") return;

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let payload: { userId: number; username: string };
    try {
      payload = verifyToken(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Check suspension in the DB before completing the upgrade.
    // verifyToken only validates the JWT signature — it does not query the DB.
    // A suspended user must be rejected here so they cannot establish a new
    // WS session even with a valid token.
    try {
      const [user] = await db
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (!user || user.status === "suspended") {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch (err) {
      logger.error({ err }, "ws: suspension check failed during upgrade; rejecting connection");
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, payload);
    });
  });

  wss.on("connection", async (ws: WebSocket, payload: { userId: number; username: string }) => {
    let displayName = payload.username;
    let avatarUrl: string | null = null;
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
      if (user) {
        displayName = user.displayName;
        avatarUrl = toPublicImageUrl(user.avatarUrl ?? null);
      }
    } catch (err) {
      logger.error({ err }, "voice: failed to load user on connect");
    }

    const client: Client = {
      ws,
      userId: payload.userId,
      username: payload.username,
      displayName,
      avatarUrl,
      isAlive: true,
    };
    registerClient(client);
    send(ws, { type: "ready", userId: client.userId });
    logger.info({ userId: client.userId }, "voice: client connected");

    // Fire-and-forget: notify friends that this user came online
    void notifyFriendsOnline(client).catch(() => {});

    ws.on("pong", () => { client.isAlive = true; });
    ws.on("message", (data) => {
      void handleMessage(client, data).catch((err) =>
        logger.error({ err, userId: client.userId }, "voice: message handler failed"),
      );
    });
    ws.on("close", () => handleClose(client));
    ws.on("error", () => handleClose(client));
  });

  const interval = setInterval(() => {
    for (const [ws, client] of clientBySocket) {
      if (!client.isAlive) { ws.terminate(); continue; }
      client.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => clearInterval(interval));

  logger.info("voice: signaling server attached at /api/ws");
}
