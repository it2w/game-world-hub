import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { FriendCard } from '@/components/FriendCard';
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
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

function SectionHeader({ title, count }: { title: string; count?: number }) {
  const colors = useColors();
  return (
    <View style={sectionStyles.row}>
      <Text style={[sectionStyles.title, { color: colors.mutedForeground }]}>
        {title}
      </Text>
      {count !== undefined && (
        <View style={[sectionStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[sectionStyles.badgeText, { color: colors.primaryForeground }]}>
            {count}
          </Text>
        </View>
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

function PartyInviteCard({
  invite,
  onAccept,
  onDecline,
  isActing,
}: {
  invite: PartyInvite;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  isActing: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        inviteStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.primary,
        },
      ]}
    >
      <View style={inviteStyles.header}>
        <Feather name="users" size={16} color={colors.primary} />
        <Text style={[inviteStyles.title, { color: colors.foreground }]}>
          {invite.party.name}
        </Text>
        {invite.party.game && (
          <Text style={[inviteStyles.game, { color: colors.mutedForeground }]}>
            • {invite.party.game}
          </Text>
        )}
      </View>
      <Text style={[inviteStyles.inviter, { color: colors.mutedForeground }]}>
        دعوة من {invite.invitedBy?.displayName || invite.invitedBy?.username}
      </Text>
      <View style={inviteStyles.actions}>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAccept(invite.id);
          }}
          disabled={isActing}
          style={({ pressed }) => [
            inviteStyles.btn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || isActing ? 0.7 : 1,
              flex: 1,
            },
          ]}
        >
          {isActing ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[inviteStyles.btnText, { color: colors.primaryForeground }]}>
              قبول
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => onDecline(invite.id)}
          disabled={isActing}
          style={({ pressed }) => [
            inviteStyles.btn,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
              borderWidth: 1,
              opacity: pressed || isActing ? 0.7 : 1,
              flex: 1,
            },
          ]}
        >
          <Text style={[inviteStyles.btnText, { color: colors.mutedForeground }]}>
            رفض
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const inviteStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: '700', flex: 1 },
  game: { fontSize: 13 },
  inviter: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700' },
});

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: onlineSummary,
    isLoading: loadingFriends,
    refetch: refetchFriends,
  } = useGetOnlineFriendsSummary();

  const {
    data: parties,
    isLoading: loadingParties,
    refetch: refetchParties,
  } = useListParties();

  const {
    data: invites,
    isLoading: loadingInvites,
    refetch: refetchInvites,
  } = useListPartyInvites();

  const [actingInviteId, setActingInviteId] = React.useState<number | null>(null);

  const acceptMutation = useAcceptPartyInvite({
    mutation: {
      onMutate: ({ inviteId }) => setActingInviteId(inviteId),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
        void queryClient.invalidateQueries({ queryKey: ['/api/parties'] });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onSettled: () => setActingInviteId(null),
    },
  });

  const declineMutation = useDeclinePartyInvite({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
      },
    },
  });

  const handleRefresh = () => {
    void refetchFriends();
    void refetchParties();
    void refetchInvites();
  };

  const isLoading = loadingFriends || loadingParties || loadingInvites;

  const onlineFriends = onlineSummary?.friends?.filter(
    (f: FriendEntry) =>
      f.friend.status === 'online' ||
      f.friend.status === 'away' ||
      f.friend.status === 'busy',
  ) ?? [];

  // Find user's current party
  const myParty = (parties ?? []).find(
    (p) =>
      p.leader.id === user?.id ||
      p.members?.some((m: User) => m.id === user?.id),
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80),
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <View style={styles.greetingLeft}>
          <Text style={[styles.greetingLabel, { color: colors.mutedForeground }]}>
            مرحباً،
          </Text>
          <Text style={[styles.greetingName, { color: colors.foreground }]}>
            {user?.displayName || user?.username || 'لاعب'}
          </Text>
        </View>
        {user && (
          <Avatar
            uri={user.avatarUrl}
            name={user.displayName || user.username}
            size={40}
            status={user.status}
            showStatus
          />
        )}
      </View>

      {/* Party Invites */}
      {(invites ?? []).length > 0 && (
        <>
          <SectionHeader title="دعوات المجموعة" count={(invites ?? []).length} />
          {(invites ?? []).map((invite: PartyInvite) => (
            <PartyInviteCard
              key={invite.id}
              invite={invite}
              onAccept={(id) => acceptMutation.mutate({ inviteId: id })}
              onDecline={(id) => declineMutation.mutate({ inviteId: id })}
              isActing={actingInviteId === invite.id}
            />
          ))}
        </>
      )}

      {/* Current Party */}
      <SectionHeader title="مجموعتي" />
      {loadingParties ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : myParty ? (
        <View
          style={[
            styles.partyCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.partyHeader}>
            <Feather name="users" size={18} color={colors.primary} />
            <Text style={[styles.partyName, { color: colors.foreground }]}>
              {myParty.name}
            </Text>
            {myParty.game && (
              <View
                style={[styles.partyGameBadge, { backgroundColor: colors.secondary }]}
              >
                <Text style={[styles.partyGame, { color: colors.foreground }]}>
                  {myParty.game}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.partyMembers}>
            {(myParty.members ?? []).slice(0, 8).map((member: User) => (
              <Avatar
                key={member.id}
                uri={member.avatarUrl}
                name={member.displayName || member.username}
                size={32}
                status={member.status}
                showStatus
              />
            ))}
            <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
              {myParty.members?.length ?? 0}/{myParty.maxSize}
            </Text>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.emptyParty,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="users" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لست في مجموعة حالياً
          </Text>
        </View>
      )}

      {/* Online Friends */}
      <SectionHeader
        title="الأصدقاء المتصلون"
        count={onlineSummary?.onlineCount}
      />
      {loadingFriends ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : onlineFriends.length === 0 ? (
        <View
          style={[
            styles.emptyFriends,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="moon" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لا يوجد أصدقاء متصلون الآن
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.friendsList,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {onlineFriends.slice(0, 10).map((entry: FriendEntry) => (
            <FriendCard key={entry.id} entry={entry} />
          ))}
          {onlineFriends.length > 10 && (
            <View style={[styles.moreRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                +{onlineFriends.length - 10} أصدقاء آخرون
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 0, paddingHorizontal: 0 },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    marginBottom: 4,
  },
  greetingLeft: { gap: 2 },
  greetingLabel: { fontSize: 13 },
  greetingName: { fontSize: 24, fontWeight: '800' },
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  partyCard: {
    marginHorizontal: 16,
    padding: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partyName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  partyGameBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  partyGame: { fontSize: 12, fontWeight: '600' },
  partyMembers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  memberCount: { fontSize: 12 },
  emptyParty: {
    marginHorizontal: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 13 },
  friendsList: {
    marginHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  emptyFriends: {
    marginHorizontal: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  moreRow: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreText: { fontSize: 12 },
});
