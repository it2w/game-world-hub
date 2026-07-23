/**
 * In-memory map of who is currently inside each community voice channel.
 *
 * channelId (number) → Map<userId, { displayName, username, avatarUrl }>
 *
 * Populated by POST /api/communities/:id/voice-join
 * Cleared by POST /api/communities/:id/voice-leave  AND  on WS disconnect
 * (signaling.ts calls removeCommunityVoicePresence on last-session disconnect).
 */

export interface VoicePresenceUser {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  cameraEnabled?: boolean;
}

/** channelId → Map<userId, VoicePresenceUser> */
const channelMembers = new Map<number, Map<number, VoicePresenceUser>>();

/** channelId → communityId  (needed for disconnect cleanup broadcasts) */
const channelToCommunity = new Map<number, number>();

/** userId → Set<channelId>  (which channels is this user currently in?) */
const userChannels = new Map<number, Set<number>>();

export function addCommunityVoicePresence(
  communityId: number,
  channelId: number,
  user: VoicePresenceUser,
): void {
  let members = channelMembers.get(channelId);
  if (!members) {
    members = new Map();
    channelMembers.set(channelId, members);
  }
  members.set(user.userId, user);
  channelToCommunity.set(channelId, communityId);

  let channels = userChannels.get(user.userId);
  if (!channels) {
    channels = new Set();
    userChannels.set(user.userId, channels);
  }
  channels.add(channelId);
}

export function removeCommunityVoicePresenceForChannel(
  channelId: number,
  userId: number,
): void {
  const members = channelMembers.get(channelId);
  if (members) {
    members.delete(userId);
    if (members.size === 0) {
      channelMembers.delete(channelId);
      channelToCommunity.delete(channelId);
    }
  }
  const channels = userChannels.get(userId);
  if (channels) {
    channels.delete(channelId);
    if (channels.size === 0) userChannels.delete(userId);
  }
}

/** Remove a user from ALL community voice channels (called on WS disconnect). */
export function removeCommunityVoicePresenceForUser(userId: number): Array<{
  communityId: number;
  channelId: number;
}> {
  const affected: Array<{ communityId: number; channelId: number }> = [];
  const channels = userChannels.get(userId);
  if (!channels) return affected;

  for (const channelId of channels) {
    const communityId = channelToCommunity.get(channelId);
    if (communityId !== undefined) affected.push({ communityId, channelId });
    const members = channelMembers.get(channelId);
    if (members) {
      members.delete(userId);
      if (members.size === 0) {
        channelMembers.delete(channelId);
        channelToCommunity.delete(channelId);
      }
    }
  }
  userChannels.delete(userId);
  return affected;
}

/** Update camera state for a user already in a channel. Returns false if user not found. */
export function updateCommunityVoiceCameraState(
  channelId: number,
  userId: number,
  cameraEnabled: boolean,
): boolean {
  const members = channelMembers.get(channelId);
  if (!members) return false;
  const user = members.get(userId);
  if (!user) return false;
  members.set(userId, { ...user, cameraEnabled });
  return true;
}

/** Return all participants in a channel. */
export function getCommunityVoiceParticipants(channelId: number): VoicePresenceUser[] {
  return [...(channelMembers.get(channelId)?.values() ?? [])];
}

/** Return presence snapshot for all voice channels of a community.
 *  channelId → VoicePresenceUser[]
 */
export function getCommunityVoicePresenceSnapshot(
  channelIds: number[],
): Record<number, VoicePresenceUser[]> {
  const result: Record<number, VoicePresenceUser[]> = {};
  for (const id of channelIds) {
    const participants = getCommunityVoiceParticipants(id);
    if (participants.length > 0) result[id] = participants;
  }
  return result;
}
