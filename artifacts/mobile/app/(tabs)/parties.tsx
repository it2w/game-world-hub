/**
 * البارتيات — Dedicated parties tab
 * Shows: active invites → my party → browseable open parties
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import {
  useListParties,
  useListPartyInvites,
  useAcceptPartyInvite,
  useDeclinePartyInvite,
  useCreateParty,
  useLeaveParty,
  type Party,
  type PartyInvite,
  type User,
} from '@workspace/api-client-react';

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
    <View style={[iStyles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={iStyles.top}>
        <View style={[iStyles.iconWrap, { backgroundColor: `${colors.primary}20` }]}>
          <Feather name="users" size={16} color={colors.primary} />
        </View>
        <View style={iStyles.info}>
          <Text style={[iStyles.name, { color: colors.foreground }]}>{invite.party.name}</Text>
          <Text style={[iStyles.from, { color: colors.mutedForeground }]}>
            دعوة من {invite.invitedBy?.displayName || invite.invitedBy?.username}
          </Text>
        </View>
        {invite.party.game && (
          <View style={[iStyles.gameBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[iStyles.gameText, { color: colors.primary }]} numberOfLines={1}>
              {invite.party.game}
            </Text>
          </View>
        )}
      </View>
      <View style={iStyles.actions}>
        <Pressable
          onPress={onAccept}
          disabled={acting}
          style={({ pressed }) => [
            iStyles.btn,
            { backgroundColor: colors.primary, opacity: pressed || acting ? 0.7 : 1, flex: 1 },
          ]}
        >
          {acting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[iStyles.btnText, { color: colors.primaryForeground }]}>قبول</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={acting}
          style={({ pressed }) => [
            iStyles.btn,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              opacity: pressed || acting ? 0.7 : 1,
              flex: 1,
            },
          ]}
        >
          <Text style={[iStyles.btnText, { color: colors.mutedForeground }]}>رفض</Text>
        </Pressable>
      </View>
    </View>
  );
}

const iStyles = StyleSheet.create({
  card: { margin: 16, marginBottom: 8, padding: 14, gap: 12, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  from: { fontSize: 12 },
  gameBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  gameText: { fontSize: 11, fontWeight: '700', maxWidth: 80 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
});

// ── My party card ─────────────────────────────────────────────────────────────

function MyPartyCard({ party, onLeave }: { party: Party; onLeave: () => void }) {
  const colors = useColors();
  const members: User[] = (party.members as User[] | undefined) ?? [];

  return (
    <View style={[mpStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Green accent top strip */}
      <View style={[mpStyles.strip, { backgroundColor: colors.primary }]} />

      <View style={mpStyles.body}>
        <View style={mpStyles.headerRow}>
          <View style={mpStyles.titleBlock}>
            <Text style={[mpStyles.partyName, { color: colors.foreground }]}>{party.name}</Text>
            {party.game && (
              <Text style={[mpStyles.gameName, { color: colors.primary }]}>{party.game}</Text>
            )}
          </View>
          <View style={[mpStyles.slotBadge, { backgroundColor: colors.secondary }]}>
            <Feather name="users" size={12} color={colors.primary} />
            <Text style={[mpStyles.slotText, { color: colors.primary }]}>
              {members.length}/{party.maxSize ?? '?'}
            </Text>
          </View>
        </View>

        {/* Members */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={mpStyles.membersRow}>
            {members.map((m) => (
              <View key={m.id} style={mpStyles.memberCol}>
                <Avatar
                  uri={m.avatarUrl}
                  name={m.displayName || m.username}
                  size={38}
                  status={m.status}
                  showStatus
                />
                <Text
                  style={[mpStyles.memberName, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {m.displayName || m.username}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <Pressable
          onPress={onLeave}
          style={({ pressed }) => [
            mpStyles.leaveBtn,
            { borderColor: colors.destructive, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="log-out" size={13} color={colors.destructive} />
          <Text style={[mpStyles.leaveBtnText, { color: colors.destructive }]}>مغادرة البارتي</Text>
        </Pressable>
      </View>
    </View>
  );
}

const mpStyles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  strip: { height: 3 },
  body: { padding: 14, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 2 },
  partyName: { fontSize: 18, fontWeight: '800' },
  gameName: { fontSize: 12, fontWeight: '600' },
  slotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  slotText: { fontSize: 12, fontWeight: '700' },
  membersRow: { flexDirection: 'row', gap: 12 },
  memberCol: { alignItems: 'center', gap: 4, width: 52 },
  memberName: { fontSize: 10, textAlign: 'center' },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
  },
  leaveBtnText: { fontSize: 13, fontWeight: '600' },
});

// ── Create party modal (inline) ───────────────────────────────────────────────

function CreatePartyPanel({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [game, setGame] = useState('');

  const createMutation = useCreateParty({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['/api/parties'] });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      },
    },
  });

  return (
    <View style={[cpStyles.panel, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <Text style={[cpStyles.panelTitle, { color: colors.foreground }]}>إنشاء بارتي جديد</Text>
      <TextInput
        style={[cpStyles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
        placeholder="اسم البارتي"
        placeholderTextColor={colors.mutedForeground}
        value={name}
        onChangeText={setName}
        maxLength={40}
      />
      <TextInput
        style={[cpStyles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
        placeholder="اللعبة (اختياري)"
        placeholderTextColor={colors.mutedForeground}
        value={game}
        onChangeText={setGame}
        maxLength={40}
      />
      <View style={cpStyles.btnRow}>
        <Pressable
          onPress={onClose}
          style={[cpStyles.btn, { backgroundColor: colors.secondary }]}
        >
          <Text style={[cpStyles.btnText, { color: colors.mutedForeground }]}>إلغاء</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!name.trim()) return;
            createMutation.mutate({ data: { name: name.trim(), game: game.trim() || undefined, maxSize: 5 } });
          }}
          disabled={!name.trim() || createMutation.isPending}
          style={({ pressed }) => [
            cpStyles.btn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || createMutation.isPending || !name.trim() ? 0.6 : 1,
              flex: 1,
            },
          ]}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[cpStyles.btnText, { color: colors.primaryForeground }]}>إنشاء</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const cpStyles = StyleSheet.create({
  panel: { margin: 16, padding: 16, gap: 10, borderWidth: 1 },
  panelTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  input: {
    height: 44,
    paddingHorizontal: 12,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { paddingVertical: 11, alignItems: 'center', flex: 1 },
  btnText: { fontSize: 14, fontWeight: '700' },
});

// ── Browse party row ──────────────────────────────────────────────────────────

function BrowsePartyRow({ party }: { party: Party }) {
  const colors = useColors();
  const members: User[] = (party.members as User[] | undefined) ?? [];
  const full = members.length >= (party.maxSize ?? Infinity);

  return (
    <View
      style={[
        bpStyles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={bpStyles.left}>
        <View style={[bpStyles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={bpStyles.info}>
          <Text style={[bpStyles.name, { color: colors.foreground }]} numberOfLines={1}>
            {party.name}
          </Text>
          {party.game && (
            <Text style={[bpStyles.game, { color: colors.primary }]} numberOfLines={1}>
              {party.game}
            </Text>
          )}
        </View>
      </View>
      <View style={bpStyles.right}>
        <View style={[bpStyles.slotChip, { backgroundColor: full ? colors.secondary : `${colors.primary}20` }]}>
          <Text style={[bpStyles.slotNum, { color: full ? colors.mutedForeground : colors.primary }]}>
            {members.length}/{party.maxSize ?? '?'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const bpStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconBox: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700' },
  game: { fontSize: 12, fontWeight: '500' },
  right: {},
  slotChip: { paddingHorizontal: 10, paddingVertical: 4 },
  slotNum: { fontSize: 12, fontWeight: '700' },
});

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count?: number }) {
  const colors = useColors();
  return (
    <View style={slStyles.row}>
      <View style={[slStyles.dot, { backgroundColor: colors.primary }]} />
      <Text style={[slStyles.text, { color: colors.mutedForeground }]}>{label}</Text>
      {count !== undefined && (
        <View style={[slStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[slStyles.badgeText, { color: colors.primaryForeground }]}>{count}</Text>
        </View>
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
    paddingTop: 24,
    paddingBottom: 10,
  },
  dot: { width: 4, height: 14 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PartiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const [showCreate, setShowCreate] = useState(false);
  const [actingInviteId, setActingInviteId] = useState<number | null>(null);

  const { data: parties, isLoading: loadingParties, refetch: refetchParties } = useListParties();
  const { data: invites, isLoading: loadingInvites, refetch: refetchInvites } = useListPartyInvites();

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
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] }),
    },
  });

  const leaveMutation = useLeaveParty({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/parties'] }),
    },
  });

  const isLoading = loadingParties || loadingInvites;
  const allParties: Party[] = parties ?? [];
  const allInvites: PartyInvite[] = invites ?? [];

  const myParty = allParties.find((p) => {
    const members: User[] = (p.members as User[] | undefined) ?? [];
    return p.leader?.id === user?.id || members.some((m) => m.id === user?.id);
  });

  const otherParties = allParties.filter((p) => p.id !== myParty?.id);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80),
      }}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => { void refetchParties(); void refetchInvites(); }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>البارتيات</Text>
        <View style={[styles.accentLine, { backgroundColor: colors.primary }]} />
      </View>

      {/* Invites */}
      {allInvites.length > 0 && (
        <>
          <SectionLabel label="دعوات" count={allInvites.length} />
          {allInvites.map((inv) => (
            <InviteCard
              key={inv.id}
              invite={inv}
              acting={actingInviteId === inv.id}
              onAccept={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                acceptMutation.mutate({ inviteId: inv.id });
              }}
              onDecline={() => declineMutation.mutate({ inviteId: inv.id })}
            />
          ))}
        </>
      )}

      {/* My party */}
      <SectionLabel label="بارتيي" />
      {loadingParties ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : myParty ? (
        <MyPartyCard
          party={myParty}
          onLeave={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            leaveMutation.mutate({ partyId: myParty.id });
          }}
        />
      ) : showCreate ? (
        <CreatePartyPanel onClose={() => setShowCreate(false)} />
      ) : (
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [
            styles.createBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary,
              borderStyle: 'dashed',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="plus" size={20} color={colors.primary} />
          <Text style={[styles.createBtnText, { color: colors.primary }]}>إنشاء بارتي جديد</Text>
        </Pressable>
      )}

      {/* Browse open parties */}
      {otherParties.length > 0 && (
        <>
          <SectionLabel label="بارتيات مفتوحة" count={otherParties.length} />
          {otherParties.map((p) => (
            <BrowsePartyRow key={p.id} party={p} />
          ))}
        </>
      )}

      {!isLoading && allParties.length === 0 && !showCreate && (
        <View style={styles.empty}>
          <Feather name="users" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا توجد بارتيات</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            أنشئ بارتياً وادعُ أصدقاءك
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  accentLine: { height: 2, width: 32 },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  createBtn: {
    marginHorizontal: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  createBtnText: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyHint: { fontSize: 14 },
});
