/**
 * In-memory map of which users are presently inside a stage-mode voice room.
 *
 * roomName → Set<userId>
 *
 * Populated by POST /api/stage/join, cleared automatically on WS disconnect
 * (signaling.ts calls removeStagePresence) and on explicit DELETE /api/stage/leave.
 *
 * Kept in a separate module to avoid circular imports between routes/stage.ts
 * (which imports pushToUser from ws/signaling.ts) and ws/signaling.ts (which
 * needs to clean up presence on disconnect).
 */
export const stageRoomMembers = new Map<string, Set<number>>();

export function addStagePresence(roomName: string, userId: number): void {
  let members = stageRoomMembers.get(roomName);
  if (!members) {
    members = new Set();
    stageRoomMembers.set(roomName, members);
  }
  members.add(userId);
}

/** Remove a user from ALL stage rooms (call on WS disconnect). */
export function removeStagePresence(userId: number): void {
  for (const [roomName, members] of stageRoomMembers.entries()) {
    members.delete(userId);
    if (members.size === 0) stageRoomMembers.delete(roomName);
  }
}

/** Remove a user from ONE specific stage room (call on explicit leave). */
export function removeStagePresenceForRoom(roomName: string, userId: number): void {
  const members = stageRoomMembers.get(roomName);
  if (!members) return;
  members.delete(userId);
  if (members.size === 0) stageRoomMembers.delete(roomName);
}

export function getStageMembers(roomName: string): number[] {
  return [...(stageRoomMembers.get(roomName) ?? [])];
}
