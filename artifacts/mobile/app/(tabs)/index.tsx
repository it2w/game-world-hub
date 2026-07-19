/**
 * الرئيسية — Premium home dashboard
 * Shows: greeting hero → party invites → my party → online friends
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
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

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count, action, onAction }: {
  label: string;
  count?: number;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={slStyles.row}>
      <View style={[slStyles.bar, { backgroundColor: colors.primary }]} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 10,
  },
  bar: { width: 3, height: 14 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  action: { fontSize: 12, fontWeight: '600' },
});

// ── Invite card ───────────────────────────────────────────────────────────────

function InviteCard({
  invite,
  onAccept,
  onDecline,
  acting,
}: {
  invite: PartyInvite;
  onAccept: () => void;
  onDecline: () => void;
  acting: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[invStyles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={invStyles.header}>
        <View style={[invStyles.iconBox, { backgroundColor: `${colors.primary}20` }]}>
          <Feather name="users" size={14} color={colors.primary} />
        </View>
        <View style={invStyles.info}>
          <Text style={[invStyles.partyName, { color: colors.foreground }]}>
            {invite.party.name}
          </Text>
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
          style={({ pressed }) => [
            invStyles.btn,
            { backgroundColor: colors.primary, opacity: pressed || acting ? 0.7 : 1, flex: 1 },
          ]}
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
          style={({ pressed }) => [
            invStyles.btn,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              opacity: pressed || acting ? 0.7 : 1,
              flex: 1,
            },
          ]}
        >
          <Text style={[invStyles.btnText, { color: colors.mutedForeground }]}>رفض</Text>
        </Pressable>
      </View>
    </View>
  );
}

const invStyles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 14, gap: 10, borderWidth: 1, marginBottom: 8 },
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

// ── My party mini-card ────────────────────────────────────────────────────────

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
      <View style={[mpStyles.strip, { backgroundColor: colors.primary }]} />
      <View style={mpStyles.body}>
        <View style={mpStyles.row}>
          <Feather name="users" size={15} color={colors.primary} />
          <Text style={[mpStyles.name, { color: colors.foreground }]} numberOfLines={1}>
            {party.name}
          </Text>
          {party.game && (
            <View style={[mpStyles.gameBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[mpStyles.gameText, { color: colors.primary }]} numberOfLines={1}>
                {party.game}
              </Text>
            </View>
          )}
          <Text style={[mpStyles.slots, { color: colors.mutedForeground }]}>
            {members.length}/{party.maxSize ?? '?'}
          </Text>
        </View>
        <View style={mpStyles.avatarRow}>
          {members.slice(0, 6).map((m) => (
            <Avatar
              key={m.id}
              uri={m.avatarUrl}
              name={m.displayName || m.username}
              size={28}
              status={m.status}
              showStatus
            />
          ))}
          {members.length > 6 && (
            <Text style={[mpStyles.more, { color: colors.mutedForeground }]}>
              +{members.length - 6}
            </Text>
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

// ── Online friend chip ────────────────────────────────────────────────────────

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
      <Avatar
        uri={friend.avatarUrl}
        name={friend.displayName || friend.username}
        size={44}
        status={friend.status}
        showStatus
      />
      <Text style={[fcStyles.name, { color: colors.foreground }]} numberOfLines={1}>
        {friend.displayName || friend.username}
      </Text>
      {friend.currentGame ? (
        <Text style={[fcStyles.sub, { color: colors.primary }]} numberOfLines={1}>
          {friend.currentGame}
        </Text>
      ) : (
        <Text style={[fcStyles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {friend.status === 'away' ? 'عائد' : friend.status === 'busy' ? 'مشغول' : 'متصل'}
        </Text>
      )}
    </Pressable>
  );
}

const fcStyles = StyleSheet.create({
  chip: {
    width: 88,
    alignItems: 'center',
    padding: 12,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  sub: { fontSize: 10, textAlign: 'center' },
});

// ── Quick stat pill ────────────────────────────────────────────────────────────

function StatPill({ icon, value, label, color }: {
  icon: string;
  value: string | number;
  label: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View style={[statStyles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={[statStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  value: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: onlineSummary, isLoading: loadingFriends, refetch: refetchFriends } =
    useGetOnlineFriendsSummary();
  const { data: parties, isLoading: loadingParties, refetch: refetchParties } = useListParties();
  const { data: invites, isLoading: loadingInvites, refetch: refetchInvites } =
    useListPartyInvites();

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
    (p: any) =>
      p.leader?.id === user?.id || (p.members ?? []).some((m: User) => m.id === user?.id),
  );

  const handleRefresh = () => {
    void refetchFriends();
    void refetchParties();
    void refetchInvites();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80),
      }}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero greeting ──────────────────────────────────────────── */}
      <View style={[styles.hero, { borderBottomColor: colors.border }]}>
        <View style={styles.heroLeft}>
          <Text style={[styles.helloText, { color: colors.mutedForeground }]}>مرحباً،</Text>
          <Text style={[styles.heroName, { color: colors.foreground }]}>
            {user?.displayName || user?.username || 'لاعب'}
          </Text>
          {user?.currentGame && (
            <View style={styles.nowPlayingRow}>
              <Feather name="play" size={10} color={colors.primary} />
              <Text style={[styles.nowPlayingText, { color: colors.primary }]} numberOfLines={1}>
                {user.currentGame}
              </Text>
            </View>
          )}
        </View>
        {user && (
          <Avatar
            uri={user.avatarUrl}
            name={user.displayName || user.username}
            size={52}
            status={user.status}
            showStatus
          />
        )}
      </View>

      {/* ── Quick stats ────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <StatPill
          icon="users"
          value={onlineSummary?.onlineCount ?? 0}
          label="أصدقاء"
          color={colors.primary}
        />
        <StatPill
          icon="shield"
          value={myParty ? (myParty.members?.length ?? 1) : 0}
          label="بارتي"
          color={myParty ? colors.primary : colors.mutedForeground}
        />
        <StatPill
          icon="message-square"
          value={invites?.length ?? 0}
          label="دعوات"
          color={(invites?.length ?? 0) > 0 ? colors.primary : colors.mutedForeground}
        />
      </View>

      {/* ── Invites ────────────────────────────────────────────────── */}
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

      {/* ── My party ───────────────────────────────────────────────── */}
      <SectionLabel
        label="مجموعتي"
        action={myParty ? 'عرض' : 'إنشاء'}
        onAction={() => router.push('/(tabs)/parties' as never)}
      />
      {loadingParties ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : myParty ? (
        <MyPartyMini party={myParty} onPress={() => router.push('/(tabs)/parties' as never)} />
      ) : (
        <Pressable
          onPress={() => router.push('/(tabs)/parties' as never)}
          style={({ pressed }) => [
            styles.emptyCard,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="users" size={20} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لست في مجموعة — انقر لإنشاء بارتي
          </Text>
          <Feather name="chevron-left" size={16} color={colors.border} />
        </Pressable>
      )}

      {/* ── Online friends ─────────────────────────────────────────── */}
      <SectionLabel
        label="الأصدقاء المتصلون"
        count={onlineSummary?.onlineCount}
        action="الكل"
        onAction={() => router.push('/(tabs)/messages' as never)}
      />
      {loadingFriends ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : onlineFriends.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  heroLeft: { flex: 1, gap: 2 },
  helloText: { fontSize: 13 },
  heroName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  nowPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  nowPlayingText: { fontSize: 11, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  emptyCard: {
    marginHorizontal: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: { fontSize: 13, flex: 1 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
});
