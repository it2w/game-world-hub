/**
 * الرئيسية — Premium home dashboard
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { useWsFrame } from '@/contexts/WsContext';
import { customFetch } from '@workspace/api-client-react';
import {
  useGetOnlineFriendsSummary,
  useListParties,
  useListPartyInvites,
  useAcceptPartyInvite,
  useDeclinePartyInvite,
  type FriendEntry,
  type PartyInvite,
  type User,
} from '@workspace/api-client-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FriendsClip {
  id: number;
  ownerId: number;
  owner?: { displayName: string; username: string; avatarUrl?: string | null };
  title: string;
  game: string | null;
  mimeType: string;
  isVideo: boolean;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
}

interface RankingEntry {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  totalXp: number;
  rank: string;
  weeklyPoints: number;
  position: number;
}
interface RankingsResponse {
  season: { id: number } | null;
  total: number;
  rankings: RankingEntry[];
}

interface HofEntry {
  id: number;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  rank?: string;
  totalXp?: number;
  isPro?: boolean;
  prestigeLevel?: number;
}

interface GWHEvent {
  id: number;
  title: string;
  description?: string;
  game?: string;
  scheduledAt?: string;
  status: string;
  participantCount?: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

const FRIENDS_CLIPS_KEY = ['/api/clips/friends'] as const;

function useFriendsClips() {
  const queryClient = useQueryClient();

  const query = useQuery<FriendsClip[]>({
    queryKey: FRIENDS_CLIPS_KEY,
    queryFn: () => customFetch<FriendsClip[]>('/api/clips/friends'),
    staleTime: 60_000,
  });

  // A friend uploaded a clip — refetch to get full clip data including owner info
  useWsFrame<{ clipId: number; ownerId: number }>('clip-uploaded', () => {
    void queryClient.invalidateQueries({ queryKey: FRIENDS_CLIPS_KEY });
  });

  // A friend deleted a clip — remove it from the local cache immediately
  useWsFrame<{ clipId: number; ownerId: number }>('clip-deleted', ({ clipId }) => {
    queryClient.setQueryData<FriendsClip[]>(FRIENDS_CLIPS_KEY, (prev) =>
      prev ? prev.filter((c) => c.id !== clipId) : prev,
    );
  });

  return query;
}

function useTopRankings() {
  return useQuery<RankingsResponse>({
    queryKey: ['/api/seasons/current/rankings/top3'],
    queryFn: () => customFetch<RankingsResponse>('/api/seasons/current/rankings?limit=3'),
    staleTime: 120_000,
  });
}

function useHallOfFame() {
  return useQuery<HofEntry[]>({
    queryKey: ['/api/hall-of-fame'],
    queryFn: () => customFetch<HofEntry[]>('/api/hall-of-fame'),
    staleTime: 300_000,
  });
}

function useActiveEvents() {
  return useQuery<GWHEvent[]>({
    queryKey: ['/api/events/active-home'],
    queryFn: () => customFetch<GWHEvent[]>('/api/events?status=active'),
    staleTime: 120_000,
  });
}

// ── Friends clip card ─────────────────────────────────────────────────────────

function FriendsClipCard({ clip }: { clip: FriendsClip }) {
  const colors = useColors();
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  const thumbUri = domain ? `https://${domain}/api/clips/${clip.id}/thumbnail` : null;

  return (
    <View style={[clipCardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Thumbnail */}
      <View style={[clipCardStyles.thumb, { backgroundColor: colors.secondary }]}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={clipCardStyles.thumbImg}
            resizeMode="cover"
          />
        ) : (
          <Feather name={clip.isVideo ? 'video' : 'image'} size={20} color={colors.mutedForeground} />
        )}
        {clip.isVideo && (
          <View style={[clipCardStyles.playBadge, { backgroundColor: `${colors.background}cc` }]}>
            <Feather name="play" size={10} color={colors.foreground} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={clipCardStyles.info}>
        <Text style={[clipCardStyles.title, { color: colors.foreground }]} numberOfLines={1}>
          {clip.title}
        </Text>
        {clip.owner && (
          <Text style={[clipCardStyles.owner, { color: colors.mutedForeground }]} numberOfLines={1}>
            {clip.owner.displayName || clip.owner.username}
          </Text>
        )}
        <View style={clipCardStyles.meta}>
          <Feather name="zap" size={10} color={colors.mutedForeground} />
          <Text style={[clipCardStyles.metaText, { color: colors.mutedForeground }]}>{clip.reactionCount}</Text>
          <Feather name="message-square" size={10} color={colors.mutedForeground} style={clipCardStyles.metaGap} />
          <Text style={[clipCardStyles.metaText, { color: colors.mutedForeground }]}>{clip.commentCount}</Text>
        </View>
      </View>
    </View>
  );
}
const clipCardStyles = StyleSheet.create({
  card: { width: 140, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', flexShrink: 0 },
  thumb: { width: 140, height: 90, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { ...StyleSheet.absoluteFillObject },
  playBadge: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  info: { padding: 8, gap: 3 },
  title: { fontSize: 12, fontWeight: '700' },
  owner: { fontSize: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  metaText: { fontSize: 10 },
  metaGap: { marginLeft: 4 },
});

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({
  label, count, action, onAction,
}: {
  label: string; count?: number; action?: string; onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={slStyles.row}>
      <View style={[slStyles.bar, { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.8 }]} />
      <Text style={[slStyles.text, { color: colors.mutedForeground }]}>{label}</Text>
      {count !== undefined && count > 0 && (
        <View style={[slStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[slStyles.badgeText, { color: colors.primaryForeground }]}>{count}</Text>
        </View>
      )}
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[slStyles.action, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
const slStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 10 },
  bar: { width: 3, height: 14 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  action: { fontSize: 12, fontWeight: '600' },
});

// ── Invite card ───────────────────────────────────────────────────────────────

function InviteCard({
  invite, onAccept, onDecline, acting,
}: {
  invite: PartyInvite; onAccept: () => void; onDecline: () => void; acting: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[invStyles.card, { backgroundColor: colors.card, borderColor: colors.primary, shadowColor: colors.primary }]}>
      <View style={invStyles.header}>
        <View style={[invStyles.iconBox, { backgroundColor: `${colors.primary}20` }]}>
          <Feather name="users" size={14} color={colors.primary} />
        </View>
        <View style={invStyles.info}>
          <Text style={[invStyles.partyName, { color: colors.foreground }]}>{invite.party.name}</Text>
          <Text style={[invStyles.from, { color: colors.mutedForeground }]}>
            دعوة من {invite.invitedBy?.displayName || invite.invitedBy?.username}
          </Text>
        </View>
        {invite.party.game && (
          <View style={[invStyles.gameBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[invStyles.gameText, { color: colors.primary }]} numberOfLines={1}>
              {invite.party.game}
            </Text>
          </View>
        )}
      </View>
      <View style={invStyles.actions}>
        <Pressable
          onPress={onAccept}
          disabled={acting}
          style={({ pressed }) => [invStyles.btn, { backgroundColor: colors.primary, opacity: pressed || acting ? 0.7 : 1, flex: 1 }]}
        >
          {acting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[invStyles.btnText, { color: colors.primaryForeground }]}>قبول</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={acting}
          style={({ pressed }) => [invStyles.btn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, opacity: pressed || acting ? 0.7 : 1, flex: 1 }]}
        >
          <Text style={[invStyles.btnText, { color: colors.mutedForeground }]}>رفض</Text>
        </Pressable>
      </View>
    </View>
  );
}
const invStyles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 14, gap: 10, borderWidth: 1, marginBottom: 8, shadowOffset: { width: 0, height: 0 }, shadowRadius: 10, shadowOpacity: 0.2, elevation: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  partyName: { fontSize: 14, fontWeight: '700' },
  from: { fontSize: 12 },
  gameBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  gameText: { fontSize: 11, fontWeight: '600', maxWidth: 90 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingVertical: 9, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
});

// ── My party mini ─────────────────────────────────────────────────────────────

function MyPartyMini({ party, onPress }: { party: any; onPress: () => void }) {
  const colors = useColors();
  const members: User[] = party.members ?? [];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        mpStyles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[mpStyles.strip, { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.6 }]} />
      <View style={mpStyles.body}>
        <View style={mpStyles.row}>
          <Feather name="users" size={15} color={colors.primary} />
          <Text style={[mpStyles.name, { color: colors.foreground }]} numberOfLines={1}>{party.name}</Text>
          {party.game && (
            <View style={[mpStyles.gameBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[mpStyles.gameText, { color: colors.primary }]} numberOfLines={1}>{party.game}</Text>
            </View>
          )}
          <Text style={[mpStyles.slots, { color: colors.mutedForeground }]}>
            {members.length}/{party.maxSize ?? '?'}
          </Text>
        </View>
        <View style={mpStyles.avatarRow}>
          {members.slice(0, 6).map((m) => (
            <Avatar key={m.id} uri={m.avatarUrl} name={m.displayName || m.username} size={28} status={m.status} showStatus />
          ))}
          {members.length > 6 && (
            <Text style={[mpStyles.more, { color: colors.mutedForeground }]}>+{members.length - 6}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
const mpStyles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  strip: { height: 2 },
  body: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', flex: 1 },
  gameBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  gameText: { fontSize: 11, fontWeight: '600', maxWidth: 80 },
  slots: { fontSize: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  more: { fontSize: 12, marginLeft: 2 },
});

// ── Friend chip ───────────────────────────────────────────────────────────────

function FriendChip({ entry, onPress }: { entry: FriendEntry; onPress: () => void }) {
  const colors = useColors();
  const { friend } = entry;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        fcStyles.chip,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Avatar uri={friend.avatarUrl} name={friend.displayName || friend.username} size={44} status={friend.status} showStatus />
      <Text style={[fcStyles.name, { color: colors.foreground }]} numberOfLines={1}>
        {friend.displayName || friend.username}
      </Text>
      {friend.currentGame ? (
        <Text style={[fcStyles.sub, { color: colors.primary }]} numberOfLines={1}>{friend.currentGame}</Text>
      ) : (
        <Text style={[fcStyles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {friend.status === 'away' ? 'عائد' : friend.status === 'busy' ? 'مشغول' : 'متصل'}
        </Text>
      )}
    </Pressable>
  );
}
const fcStyles = StyleSheet.create({
  chip: { width: 88, alignItems: 'center', padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  sub: { fontSize: 10, textAlign: 'center' },
});

// ── Top 3 ranking row ─────────────────────────────────────────────────────────

function TopRankerRow({ entry, rank }: { entry: RankingEntry; rank: number }) {
  const colors = useColors();
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={[trStyles.row, { borderColor: colors.border }]}>
      <Text style={trStyles.medal}>{medals[rank] ?? `#${rank + 1}`}</Text>
      <Avatar uri={entry.avatarUrl} name={entry.displayName || entry.username} size={32} />
      <View style={trStyles.info}>
        <Text style={[trStyles.name, { color: colors.foreground }]} numberOfLines={1}>
          {entry.displayName || entry.username}
        </Text>
        <Text style={[trStyles.pts, { color: colors.mutedForeground }]}>{entry.weeklyPoints} نقطة</Text>
      </View>
      <View style={[trStyles.rankBadge, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` }]}>
        <Text style={[trStyles.rankText, { color: colors.primary }]}>{entry.rank}</Text>
      </View>
    </View>
  );
}
const trStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  medal: { fontSize: 18, width: 26, textAlign: 'center' },
  info: { flex: 1, gap: 1 },
  name: { fontSize: 13, fontWeight: '700' },
  pts: { fontSize: 11 },
  rankBadge: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  rankText: { fontSize: 11, fontWeight: '700' },
});

// ── Hall of Fame card ─────────────────────────────────────────────────────────

function HofCard({ entry, position }: { entry: HofEntry; position: number }) {
  const colors = useColors();
  const posIcons = ['👑', '🏆', '🥇'];
  const isFirst = position === 0;
  return (
    <View style={[hofStyles.card, {
      backgroundColor: isFirst ? `${colors.primary}0e` : colors.card,
      borderColor: isFirst ? `${colors.primary}55` : colors.border,
      shadowColor: isFirst ? colors.primary : 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 10,
      shadowOpacity: isFirst ? 0.3 : 0,
      elevation: isFirst ? 6 : 0,
    }]}>
      {isFirst && <View style={[hofStyles.topLine, { backgroundColor: colors.primary }]} />}
      <View style={hofStyles.inner}>
        <Text style={hofStyles.posIcon}>{posIcons[position] ?? `#${position + 1}`}</Text>
        <View style={hofStyles.avatarWrap}>
          <Avatar uri={entry.avatarUrl} name={entry.displayName || entry.username} size={isFirst ? 48 : 40} />
          {isFirst && (
            <View style={[hofStyles.glowRing, { borderColor: `${colors.primary}66`, shadowColor: colors.primary }]} />
          )}
        </View>
        <View style={hofStyles.info}>
          <Text style={[hofStyles.name, { color: colors.foreground, fontSize: isFirst ? 15 : 13 }]} numberOfLines={1}>
            {entry.displayName || entry.username}
          </Text>
          {entry.rank && (
            <View style={[hofStyles.rankBadge, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` }]}>
              <Text style={[hofStyles.rankText, { color: colors.primary }]}>{entry.rank}</Text>
            </View>
          )}
        </View>
        {(entry.totalXp ?? 0) > 0 && (
          <View style={hofStyles.xpWrap}>
            <Text style={[hofStyles.xpValue, { color: isFirst ? colors.primary : colors.foreground }]}>
              {((entry.totalXp ?? 0) / 1000).toFixed(1)}K
            </Text>
            <Text style={[hofStyles.xpLabel, { color: colors.mutedForeground }]}>XP</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const hofStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, borderWidth: 1, overflow: 'hidden' },
  topLine: { height: 2 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  posIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  avatarWrap: { position: 'relative' },
  glowRing: {
    position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
    borderWidth: 1, borderRadius: 50,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 0.5,
  },
  info: { flex: 1, gap: 4 },
  name: { fontWeight: '700' },
  rankBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  rankText: { fontSize: 10, fontWeight: '700' },
  xpWrap: { alignItems: 'center', gap: 1 },
  xpValue: { fontSize: 16, fontWeight: '800' },
  xpLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});

// ── Event teaser ──────────────────────────────────────────────────────────────

function EventTeaser({ event, onPress }: { event: GWHEvent; onPress: () => void }) {
  const colors = useColors();
  const isActive = event.status === 'active';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        etStyles.card,
        { backgroundColor: colors.card, borderColor: isActive ? `${colors.primary}44` : colors.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {isActive && <View style={[etStyles.strip, { backgroundColor: colors.primary }]} />}
      <View style={etStyles.body}>
        <View style={[etStyles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="calendar" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[etStyles.title, { color: colors.foreground }]} numberOfLines={1}>{event.title}</Text>
          {event.game && <Text style={[etStyles.game, { color: colors.primary }]}>{event.game}</Text>}
        </View>
        {isActive && (
          <View style={[etStyles.liveDot, { backgroundColor: colors.primary }]} />
        )}
        <Feather name="chevron-left" size={14} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}
const etStyles = StyleSheet.create({
  card: { width: 220, borderWidth: 1, overflow: 'hidden', flexShrink: 0 },
  strip: { height: 2 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  iconBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '700' },
  game: { fontSize: 10, fontWeight: '600' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
});

// ── Quick action tile ─────────────────────────────────────────────────────────

function QuickAction({
  icon, label, onPress, glow,
}: {
  icon: string; label: string; onPress: () => void; glow?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        qaStyles.tile,
        {
          backgroundColor: colors.card,
          borderColor: glow ? `${colors.primary}66` : colors.border,
          opacity: pressed ? 0.75 : 1,
          shadowColor: glow ? colors.primary : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 8,
          shadowOpacity: glow ? 0.35 : 0,
          elevation: glow ? 4 : 0,
        },
      ]}
    >
      <Feather name={icon as any} size={22} color={glow ? colors.primary : colors.mutedForeground} />
      <Text style={[qaStyles.label, { color: glow ? colors.primary : colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}
const qaStyles = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 7, borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: onlineSummary, isLoading: loadingFriends, refetch: refetchFriends } = useGetOnlineFriendsSummary();
  const { data: parties, isLoading: loadingParties, refetch: refetchParties } = useListParties();
  const { data: invites, isLoading: loadingInvites, refetch: refetchInvites } = useListPartyInvites();
  const { data: rankings, isLoading: loadingRankings } = useTopRankings();
  const { data: hofData, isLoading: loadingHof } = useHallOfFame();
  const { data: events, isLoading: loadingEvents } = useActiveEvents();
  const { data: friendsClips, isLoading: loadingClips } = useFriendsClips();

  const [actingId, setActingId] = React.useState<number | null>(null);

  const acceptMutation = useAcceptPartyInvite({
    mutation: {
      onMutate: ({ inviteId }) => setActingId(inviteId),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
        void queryClient.invalidateQueries({ queryKey: ['/api/parties'] });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onSettled: () => setActingId(null),
    },
  });

  const declineMutation = useDeclinePartyInvite({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] }),
    },
  });

  const isLoading = loadingFriends || loadingParties || loadingInvites;

  const onlineFriends = (onlineSummary?.friends ?? []).filter(
    (f: FriendEntry) => ['online', 'away', 'busy'].includes(f.friend.status ?? ''),
  );

  const myParty = (parties ?? []).find(
    (p: any) => p.leader?.id === user?.id || (p.members ?? []).some((m: User) => m.id === user?.id),
  );

  const topRankers: RankingEntry[] = (rankings?.rankings ?? []).slice(0, 3);
  const hofTop = (hofData ?? []).slice(0, 3);
  const activeEvents = (events ?? []).filter((e) => e.status === 'active').slice(0, 5);

  const handleRefresh = () => {
    void refetchFriends();
    void refetchParties();
    void refetchInvites();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مرحباً' : 'مساء النور';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80) }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero gradient ──────────────────────────────────────────── */}
      <LinearGradient
        colors={['#081a09', '#080808']}
        locations={[0, 1]}
        style={[styles.hero, { paddingTop: topPad + 20 }]}
      >
        <View style={styles.heroInner}>
          <View style={styles.heroLeft}>
            <Text style={[styles.helloText, { color: colors.primary }]}>{greeting} ،</Text>
            <Text style={[styles.heroName, { color: colors.foreground }]}>
              {user?.displayName || user?.username || 'لاعب'}
            </Text>
            {user?.currentGame && (
              <View style={styles.nowPlayingRow}>
                <View style={[styles.nowPlayingDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.nowPlayingText, { color: colors.primary }]} numberOfLines={1}>
                  {user.currentGame}
                </Text>
              </View>
            )}
          </View>
          {user && (
            <View style={styles.avatarWrap}>
              <Avatar
                uri={user.avatarUrl}
                name={user.displayName || user.username}
                size={60}
                status={user.status}
                showStatus
              />
              {/* Glow ring */}
              <View style={[styles.avatarGlow, { borderColor: `${colors.primary}44`, shadowColor: colors.primary }]} />
            </View>
          )}
        </View>

        {/* ── Quick stats row ───────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { icon: 'users', value: onlineSummary?.onlineCount ?? 0, label: 'أصدقاء', glow: true },
            { icon: 'shield', value: myParty ? (myParty.members?.length ?? 1) : 0, label: 'بارتي', glow: !!myParty },
            { icon: 'star', value: invites?.length ?? 0, label: 'دعوات', glow: (invites?.length ?? 0) > 0 },
            { icon: 'calendar', value: activeEvents.length, label: 'فعاليات', glow: activeEvents.length > 0 },
          ].map((s) => (
            <View
              key={s.label}
              style={[
                styles.statPill,
                {
                  backgroundColor: s.glow ? `${colors.primary}18` : `${colors.card}`,
                  borderColor: s.glow ? `${colors.primary}55` : colors.border,
                  shadowColor: s.glow ? colors.primary : 'transparent',
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 8,
                  shadowOpacity: s.glow ? 0.4 : 0,
                  elevation: s.glow ? 4 : 0,
                },
              ]}
            >
              <Feather name={s.icon as any} size={14} color={s.glow ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.statValue, { color: s.glow ? colors.foreground : colors.mutedForeground }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── Quick actions ──────────────────────────────────────────── */}
      <View style={styles.quickActionsRow}>
        <QuickAction icon="compass"       label="استكشاف"   onPress={() => router.push('/(tabs)/explore' as never)}  glow />
        <QuickAction icon="target"        label="مكافآت"   onPress={() => router.push('/(tabs)/explore' as never)} />
        <QuickAction icon="zap"           label="تحديات"   onPress={() => router.push('/(tabs)/explore' as never)} />
        <QuickAction icon="user"          label="ملفي"     onPress={() => router.push('/(tabs)/profile' as never)} />
      </View>

      {/* ── Invites ─────────────────────────────────────────────────── */}
      {(invites ?? []).length > 0 && (
        <>
          <SectionLabel label="دعوات البارتي" count={(invites ?? []).length} />
          {(invites ?? []).map((inv: PartyInvite) => (
            <InviteCard
              key={inv.id}
              invite={inv}
              acting={actingId === inv.id}
              onAccept={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                acceptMutation.mutate({ inviteId: inv.id });
              }}
              onDecline={() => declineMutation.mutate({ inviteId: inv.id })}
            />
          ))}
        </>
      )}

      {/* ── My party ────────────────────────────────────────────────── */}
      <SectionLabel
        label="مجموعتي"
        action={myParty ? 'عرض' : 'إنشاء'}
        onAction={() => router.push('/(tabs)/explore' as never)}
      />
      {loadingParties ? (
        <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
      ) : myParty ? (
        <MyPartyMini party={myParty} onPress={() => router.push('/(tabs)/explore' as never)} />
      ) : (
        <Pressable
          onPress={() => router.push('/(tabs)/explore' as never)}
          style={({ pressed }) => [
            styles.emptyCard,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="users" size={20} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لست في مجموعة — انقر للاستكشاف
          </Text>
          <Feather name="chevron-left" size={16} color={colors.border} />
        </Pressable>
      )}

      {/* ── Active Events ────────────────────────────────────────────── */}
      {(activeEvents.length > 0 || loadingEvents) && (
        <>
          <SectionLabel
            label="الفعاليات النشطة"
            count={activeEvents.length}
            action="الكل"
            onAction={() => router.push('/(tabs)/explore' as never)}
          />
          {loadingEvents ? (
            <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventsRow}>
              {activeEvents.map((ev) => (
                <EventTeaser key={ev.id} event={ev} onPress={() => router.push('/(tabs)/explore' as never)} />
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* ── Top Rankings ────────────────────────────────────────────── */}
      <SectionLabel
        label="أفضل اللاعبين هذا الأسبوع"
        action="الكل"
        onAction={() => router.push('/(tabs)/explore' as never)}
      />
      <View style={[styles.rankingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loadingRankings ? (
          <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
        ) : topRankers.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: 'transparent', borderWidth: 0 }]}>
            <Feather name="award" size={18} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا يوجد ترتيب موسمي بعد</Text>
          </View>
        ) : (
          topRankers.map((entry, i) => <TopRankerRow key={entry.userId} entry={entry} rank={i} />)
        )}
      </View>

      {/* ── Hall of Fame ────────────────────────────────────────────── */}
      <SectionLabel label="قاعة المجد" action="عرض الكل" onAction={() => router.push('/(tabs)/explore' as never)} />
      {loadingHof ? (
        <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
      ) : hofTop.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="star" size={18} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            قاعة المجد — أعظم اللاعبين
          </Text>
        </View>
      ) : (
        hofTop.map((entry, i) => <HofCard key={entry.id} entry={entry} position={i} />)
      )}

      {/* ── Online friends ───────────────────────────────────────────── */}
      <SectionLabel
        label="الأصدقاء المتصلون"
        count={onlineSummary?.onlineCount}
        action="الكل"
        onAction={() => router.push('/(tabs)/messages' as never)}
      />
      {loadingFriends ? (
        <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
      ) : onlineFriends.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="moon" size={18} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لا يوجد أصدقاء متصلون الآن
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {onlineFriends.slice(0, 12).map((entry: FriendEntry) => (
            <FriendChip
              key={entry.id}
              entry={entry}
              onPress={() => router.push('/(tabs)/messages' as never)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Friends' recent clips ─────────────────────────────────── */}
      {(loadingClips || (friendsClips ?? []).length > 0) && (
        <>
          <SectionLabel label="كليبات الأصدقاء" />
          {loadingClips ? (
            <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} size="small" /></View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.clipsRow}
            >
              {(friendsClips ?? []).map((clip) => (
                <FriendsClipCard key={clip.id} clip={clip} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Hero */
  hero: { paddingBottom: 20 },
  heroInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  heroLeft: { flex: 1, gap: 3 },
  helloText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  heroName: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  nowPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  nowPlayingDot: { width: 6, height: 6, borderRadius: 3 },
  nowPlayingText: { fontSize: 12, fontWeight: '600' },
  avatarWrap: { position: 'relative' },
  avatarGlow: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderWidth: 1,
    borderRadius: 64,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.5,
  },

  /* Stats */
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  statPill: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },

  /* Quick actions */
  quickActionsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 8 },

  /* Rankings */
  rankingsCard: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  /* Events */
  eventsRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },

  /* Misc */
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  emptyCard: { marginHorizontal: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  emptyText: { fontSize: 13, flex: 1 },
  chipsRow: { paddingHorizontal: 16, gap: 8, paddingTop: 4, paddingBottom: 8 },
  clipsRow: { paddingHorizontal: 16, gap: 10, paddingTop: 4, paddingBottom: 8 },
});
