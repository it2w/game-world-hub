import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import { URL } from "node:url";
import { and, eq } from "drizzle-orm";
import { db, usersTable, partyMembersTable, conversationParticipantsTable } from "@workspace/db";
import { verifyToken } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

/**
 * WebRTC signaling server for voice chat & screen sharing.
 *
 * Media (audio + screen video) flows peer-to-peer over WebRTC. This server
 * only relays signaling (SDP offers/answers + ICE candidates) and coordinates
 * room membership and the direct-call handshake. Nothing is persisted — all
 * state is in memory and lives only as long as connections are open.
 *
 * Rooms are keyed by a string:
 *   - `party:<partyId>`  — a party voice channel (group mesh)
 *   - `call:<callId>`    — an ephemeral 1:1 direct call
 */

// ─── Types ───────────────────────────────────────────────────────────────

interface Client {
  ws: WebSocket;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rooms: Set<string>;
  isAlive: boolean;
}

interface RoomMember {
  client: Client;
  muted: boolean;
  sharing: boolean;
}

interface PendingCall {
  callId: string;
  room: string;
  callerId: number;
  targetId: number;
}

// ─── State ───────────────────────────────────────────────────────────────

/** roomId → (userId → member) */
const rooms = new Map<string, Map<number, RoomMember>>();
/** userId → set of that user's connections (multiple tabs/devices) */
const clientsByUser = new Map<number, Set<Client>>();
/** ws → client wrapper */
const clientBySocket = new Map<WebSocket, Client>();
/** callId → pending call */
const pendingCalls = new Map<string, PendingCall>();
/**
 * roomId → the two participants authorized for a `call:<id>` room. Populated the
 * moment an invite is created (so both the accepting callee and the caller can
 * join) and cleared when the call is resolved or the room empties. This is the
 * authorization list for call rooms.
 */
const callRooms = new Map<string, { callerId: number; targetId: number }>();

// ─── Helpers ─────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function peerSummary(member: RoomMember) {
  return {
    userId: member.client.userId,
    username: member.client.username,
    displayName: member.client.displayName,
    avatarUrl: member.client.avatarUrl,
    muted: member.muted,
    sharing: member.sharing,
  };
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

// ─── Room operations ─────────────────────────────────────────────────────

/**
 * A client may only join a room it legitimately belongs to:
 *   - `party:<id>` — must be a current member of that party (checked in the DB).
 *   - `call:<id>`  — must be the caller or target of that call.
 * Anything else is rejected. Without this, any authenticated user could join
 * arbitrary rooms and receive/relay signaling for calls they aren't part of.
 */
async function authorizeJoin(client: Client, room: string): Promise<boolean> {
  if (room.startsWith("party:")) {
    const partyId = Number(room.slice("party:".length));
    if (!Number.isInteger(partyId) || partyId <= 0) return false;
    try {
      const [membership] = await db
        .select({ userId: partyMembersTable.userId })
        .from(partyMembersTable)
        .where(and(eq(partyMembersTable.partyId, partyId), eq(partyMembersTable.userId, client.userId)));
      return !!membership;
    } catch (err) {
      logger.error({ err, room }, "voice: party authorization check failed");
      return false;
    }
  }
  if (room.startsWith("call:")) {
    const info = callRooms.get(room);
    return !!info && (info.callerId === client.userId || info.targetId === client.userId);
  }
  return false;
}

async function joinRoom(client: Client, room: string): Promise<void> {
  if (!(await authorizeJoin(client, room))) {
    send(client.ws, { type: "error", message: "Not authorized to join room", room });
    logger.warn({ room, userId: client.userId }, "voice: rejected unauthorized room join");
    return;
  }

  let members = rooms.get(room);
  if (!members) {
    members = new Map();
    rooms.set(room, members);
  }

  // Cross-tab: if this user is already in the room via another connection,
  // evict the old one so there is exactly one peer per user per room.
  const existing = members.get(client.userId);
  if (existing && existing.client !== client) {
    send(existing.client.ws, { type: "force-leave", room });
    existing.client.rooms.delete(room);
    members.delete(client.userId);
    // Tell remaining peers the old connection left before the new one joins.
    for (const [, m] of members) {
      send(m.client.ws, { type: "peer-left", room, userId: client.userId });
    }
  }

  // Send the joiner the list of peers already present.
  const peers = Array.from(members.values()).map(peerSummary);
  send(client.ws, { type: "joined", room, peers });

  // Add the joiner and announce to everyone else.
  const member: RoomMember = { client, muted: false, sharing: false };
  members.set(client.userId, member);
  client.rooms.add(room);

  for (const [uid, m] of members) {
    if (uid === client.userId) continue;
    send(m.client.ws, { type: "peer-joined", room, peer: peerSummary(member) });
  }

  logger.info({ room, userId: client.userId, size: members.size }, "voice: peer joined room");
}

function leaveRoom(client: Client, room: string): void {
  const members = rooms.get(room);
  if (!members) {
    client.rooms.delete(room);
    return;
  }
  const member = members.get(client.userId);
  // Only remove if this exact connection owns the membership.
  if (member && member.client === client) {
    members.delete(client.userId);
    for (const [, m] of members) {
      send(m.client.ws, { type: "peer-left", room, userId: client.userId });
    }
  }
  client.rooms.delete(room);
  if (members.size === 0) {
    rooms.delete(room);
    if (room.startsWith("call:")) callRooms.delete(room);
  }
}

function relaySignal(client: Client, room: string, toUserId: number, data: unknown): void {
  const members = rooms.get(room);
  // The sender must be an active member of the room (via this exact connection)
  // before we relay anything on their behalf.
  const self = members?.get(client.userId);
  if (!members || !self || self.client !== client) return;
  const target = members.get(toUserId);
  if (!target) return;
  send(target.client.ws, { type: "signal", room, from: client.userId, data });
}

function updateState(client: Client, room: string, muted: boolean, sharing: boolean): void {
  const members = rooms.get(room);
  const member = members?.get(client.userId);
  if (!member || member.client !== client) return;
  member.muted = muted;
  member.sharing = sharing;
  for (const [uid, m] of members!) {
    if (uid === client.userId) continue;
    send(m.client.ws, { type: "peer-state", room, userId: client.userId, muted, sharing });
  }
}

// ─── Direct call handshake ───────────────────────────────────────────────

function handleCallInvite(caller: Client, targetId: number): void {
  const targets = clientsByUser.get(targetId);
  if (!targets || targets.size === 0) {
    send(caller.ws, { type: "call-failed", to: targetId, reason: "offline" });
    return;
  }

  const callId = `${caller.userId}-${targetId}-${Date.now()}`;
  const room = `call:${callId}`;
  pendingCalls.set(callId, { callId, room, callerId: caller.userId, targetId });
  callRooms.set(room, { callerId: caller.userId, targetId });

  // Auto-expire the invite if unanswered.
  setTimeout(() => {
    if (pendingCalls.has(callId)) {
      pendingCalls.delete(callId);
      // Only drop the room authorization if nobody actually joined it.
      if (!rooms.has(room)) callRooms.delete(room);
      send(caller.ws, { type: "call-failed", to: targetId, reason: "timeout" });
      for (const t of targets) send(t.ws, { type: "call-cancelled", callId });
    }
  }, 45_000);

  send(caller.ws, { type: "call-ringing", callId, room, to: targetId });

  const from = {
    userId: caller.userId,
    username: caller.username,
    displayName: caller.displayName,
    avatarUrl: caller.avatarUrl,
  };
  for (const t of targets) {
    send(t.ws, { type: "incoming-call", callId, room, from });
  }
}

/**
 * A direct-call invite is fanned out to every one of the callee's sessions. The
 * first session to accept or decline wins (it deletes the pending call, so any
 * later action is a no-op). Once one session has acted, this stops the callee's
 * *other* sessions from ringing by clearing their invite UI.
 */
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

  // This session answered — stop the callee's other sessions from ringing.
  clearOtherCalleeSessions(callee, callId);

  const callers = clientsByUser.get(call.callerId);
  if (!callers || callers.size === 0) {
    send(callee.ws, { type: "call-failed", to: call.callerId, reason: "offline" });
    return;
  }
  for (const c of callers) {
    send(c.ws, { type: "call-accepted", callId, room: call.room, by: callee.userId });
  }
  // Both sides now issue their own `join` for call.room; the mesh connects.
  send(callee.ws, { type: "call-accepted", callId, room: call.room, by: callee.userId });
}

function handleCallDecline(callee: Client, callId: string): void {
  const call = pendingCalls.get(callId);
  if (!call || call.targetId !== callee.userId) return;
  pendingCalls.delete(callId);
  if (!rooms.has(call.room)) callRooms.delete(call.room);
  // This session declined — clear the invite on the callee's other sessions so
  // they stop ringing (only an explicit decline reaches this path now).
  clearOtherCalleeSessions(callee, callId);
  const callers = clientsByUser.get(call.callerId);
  if (callers) {
    for (const c of callers) send(c.ws, { type: "call-declined", callId, by: callee.userId });
  }
}

function handleCallCancel(caller: Client, callId: string): void {
  const call = pendingCalls.get(callId);
  if (!call || call.callerId !== caller.userId) return;
  pendingCalls.delete(callId);
  if (!rooms.has(call.room)) callRooms.delete(call.room);
  const targets = clientsByUser.get(call.targetId);
  if (targets) {
    for (const t of targets) send(t.ws, { type: "call-cancelled", callId });
  }
}

function cleanupCallsFor(client: Client): void {
  // Only act once this was the user's final connection — other tabs/devices of
  // the same user keep the pending call alive.
  const remaining = clientsByUser.get(client.userId);
  const stillOnline = !!remaining && Array.from(remaining).some((c) => c !== client);
  if (stillOnline) return;

  for (const [callId, call] of pendingCalls) {
    if (call.callerId === client.userId) {
      pendingCalls.delete(callId);
      if (!rooms.has(call.room)) callRooms.delete(call.room);
      const targets = clientsByUser.get(call.targetId);
      if (targets) for (const t of targets) send(t.ws, { type: "call-cancelled", callId });
    } else if (call.targetId === client.userId) {
      pendingCalls.delete(callId);
      if (!rooms.has(call.room)) callRooms.delete(call.room);
      const callers = clientsByUser.get(call.callerId);
      if (callers) for (const c of callers) send(c.ws, { type: "call-declined", callId, by: client.userId });
    }
  }
}

// ─── Message dispatch ────────────────────────────────────────────────────

async function handleMessage(client: Client, raw: RawData): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    send(client.ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg?.type) {
    case "join":
      if (typeof msg.room === "string") await joinRoom(client, msg.room);
      break;
    case "leave":
      if (typeof msg.room === "string") leaveRoom(client, msg.room);
      break;
    case "signal":
      if (typeof msg.room === "string" && typeof msg.to === "number") {
        relaySignal(client, msg.room, msg.to, msg.data);
      }
      break;
    case "state":
      if (typeof msg.room === "string") {
        updateState(client, msg.room, !!msg.muted, !!msg.sharing);
      }
      break;
    case "call-invite":
      if (typeof msg.to === "number") handleCallInvite(client, msg.to);
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

/** Relay typing indicator to all online participants of a conversation (except sender). */
async function handleTyping(client: Client, conversationId: number): Promise<void> {
  let participants: { userId: number }[];
  try {
    participants = await db
      .select({ userId: conversationParticipantsTable.userId })
      .from(conversationParticipantsTable)
      .where(eq(conversationParticipantsTable.conversationId, conversationId));
  } catch (err) {
    logger.error({ err, conversationId }, "ws: failed to fetch conversation participants for typing");
    return;
  }
  // Verify the sender is actually a participant (authorization)
  const isMember = participants.some((p) => p.userId === client.userId);
  if (!isMember) return;

  for (const p of participants) {
    if (p.userId === client.userId) continue;
    const targets = clientsByUser.get(p.userId);
    if (!targets) continue;
    for (const t of targets) {
      send(t.ws, {
        type: "typing",
        conversationId,
        userId: client.userId,
        displayName: client.displayName,
      });
    }
  }
}

function handleClose(client: Client): void {
  for (const room of Array.from(client.rooms)) {
    leaveRoom(client, room);
  }
  cleanupCallsFor(client);
  unregisterClient(client);
  logger.info({ userId: client.userId }, "voice: client disconnected");
}

// ─── External eviction API ───────────────────────────────────────────────

/**
 * Force-evict a user from a specific signaling room (e.g. after a party kick).
 * All of the user's active sessions in that room receive a `force-leave` and
 * are removed from the in-memory room membership so they cannot relay any
 * further signaling frames.
 */
export function evictUserFromRoom(userId: number, room: string): void {
  const members = rooms.get(room);
  if (!members) return;
  const member = members.get(userId);
  if (!member) return;

  // Send force-leave to the kicked user so their client tears down the call.
  send(member.client.ws, { type: "force-leave", room });
  member.client.rooms.delete(room);
  members.delete(userId);

  // Tell the remaining peers that this user left.
  for (const [, m] of members) {
    send(m.client.ws, { type: "peer-left", room, userId });
  }

  if (members.size === 0) {
    rooms.delete(room);
  }

  // Also clear any other sessions for the same user that might be in the room
  // (defensive: joinRoom ensures only one session per user per room, but cover it anyway).
  const sessions = clientsByUser.get(userId);
  if (sessions) {
    for (const client of sessions) {
      if (client.rooms.has(room)) {
        client.rooms.delete(room);
      }
    }
  }
}

// ─── Server attachment ───────────────────────────────────────────────────

export function attachSignaling(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
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

    // Only handle our signaling path; ignore other upgrades (e.g. Vite HMR).
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

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, payload);
    });
  });

  wss.on("connection", async (ws: WebSocket, payload: { userId: number; username: string }) => {
    // Look up display info for richer peer summaries.
    let displayName = payload.username;
    let avatarUrl: string | null = null;
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
      if (user) {
        displayName = user.displayName;
        avatarUrl = toPublicImageUrl(user.avatarUrl ?? null);
      }
    } catch (err) {
      logger.error({ err }, "voice: failed to load user for connection");
    }

    const client: Client = {
      ws,
      userId: payload.userId,
      username: payload.username,
      displayName,
      avatarUrl,
      rooms: new Set(),
      isAlive: true,
    };
    registerClient(client);
    send(ws, { type: "ready", userId: client.userId });
    logger.info({ userId: client.userId }, "voice: client connected");

    ws.on("pong", () => {
      client.isAlive = true;
    });
    ws.on("message", (data) => {
      void handleMessage(client, data).catch((err) =>
        logger.error({ err, userId: client.userId }, "voice: message handler failed"),
      );
    });
    ws.on("close", () => handleClose(client));
    ws.on("error", () => handleClose(client));
  });

  // Heartbeat: terminate connections that stop responding to pings.
  const interval = setInterval(() => {
    for (const [ws, client] of clientBySocket) {
      if (!client.isAlive) {
        ws.terminate();
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => clearInterval(interval));

  logger.info("voice: signaling server attached at /api/ws");
}
