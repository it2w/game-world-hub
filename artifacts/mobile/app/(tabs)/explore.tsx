/**
 * استكشاف — Unified discovery hub
 * Six sub-tabs: LFG | البارتيات | الفصائل | الفعاليات | المكافآت | التحديات
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { LFGCard } from '@/components/LFGCard';
import { FactionCard, type FactionData } from '@/components/FactionCard';
import { RankingRow, type RankingEntry } from '@/components/RankingRow';
import { customFetch } from '@workspace/api-client-react';
import {
  useListLfgPosts,
  useRespondToLfgPost,
  useListParties,
  useCreateParty,
  useLeaveParty,
  type Party,
  type User,
} from '@workspace/api-client-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RankingsResponse {
  season: { id: number } | null;
  total: number;
  rankings: RankingEntry[];
}

interface GWHEvent {
  id: number;
  title: string;
  description?: string;
  game?: string;
  scheduledAt?: string;
  status: string;
  participantCount?: number;
  createdBy?: { username: string; displayName?: string };
}

interface Bounty {
  id: number;
  title: string;
  description?: string;
  game?: string;
  status: string;
  rewardXp?: number;
  deadline?: string;
  applicationCount?: number;
  postedBy?: { username: string; displayName?: string };
}

interface Challenge {
  id: number;
  challenger: { username: string; displayName?: string; avatarUrl?: string };
  challenged: { username: string; displayName?: string; avatarUrl?: string };
  game?: string;
  status: string;
  createdAt: string;
}

type SubTab = 'lfg' | 'parties' | 'factions' | 'events' | 'bounties' | 'challenges';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useFactions() {
  return useQuery<FactionData[]>({
    queryKey: ['/api/factions'],
    queryFn: () => customFetch<FactionData[]>('/api/factions'),
    staleTime: 30_000,
  });
}

function useRankings() {
  return useQuery<RankingsResponse>({
    queryKey: ['/api/seasons/current/rankings'],
    queryFn: () => customFetch<RankingsResponse>('/api/seasons/current/rankings?limit=50'),
    staleTime: 60_000,
  });
}

function useEvents() {
  return useQuery<GWHEvent[]>({
    queryKey: ['/api/events/active'],
    queryFn: () => customFetch<GWHEvent[]>('/api/events?status=active'),
    staleTime: 60_000,
  });
}

function useBounties() {
  return useQuery<Bounty[]>({
    queryKey: ['/api/bounties/open'],
    queryFn: () => customFetch<Bounty[]>('/api/bounties'),
    staleTime: 60_000,
  });
}

function useChallenges() {
  return useQuery<Challenge[]>({
    queryKey: ['/api/challenges/mine'],
    queryFn: () => customFetch<Challenge[]>('/api/challenges'),
    staleTime: 60_000,
  });
}

// ── Sub-tab pill ──────────────────────────────────────────────────────────────

function SubTabPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        pillStyles.pill,
        {
          backgroundColor: active ? colors.primary : `${colors.card}`,
          borderColor: active ? colors.primary : colors.border,
          shadowColor: active ? colors.primary : 'transparent',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 10,
          shadowOpacity: active ? 0.5 : 0,
          elevation: active ? 6 : 0,
        },
      ]}
    >
      <Feather name={icon as any} size={12} color={active ? colors.primaryForeground : colors.mutedForeground} />
      <Text style={[pillStyles.label, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 0,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});

// ── Premium empty state ───────────────────────────────────────────────────────

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={emptyStyles.wrap}>
      <View style={[emptyStyles.iconBox, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}33` }]}>
        <Feather name={icon as any} size={28} color={colors.primary} />
      </View>
      <Text style={[emptyStyles.text, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  iconBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { fontSize: 13, textAlign: 'center', maxWidth: 220, lineHeight: 20 },
});

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={slStyles.row}>
      <View style={[slStyles.bar, { backgroundColor: colors.primary }]} />
      <Text style={[slStyles.text, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const slStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  bar: { width: 3, height: 12 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: GWHEvent }) {
  const colors = useColors();
  const isActive = event.status === 'active';
  const dt = event.scheduledAt ? new Date(event.scheduledAt) : null;
  const dateStr = dt ? dt.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <View style={[evStyles.card, { backgroundColor: colors.card, borderColor: isActive ? `${colors.primary}44` : colors.border, shadowColor: isActive ? colors.primary : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: isActive ? 0.2 : 0 }]}>
      {isActive && <View style={[evStyles.topStrip, { backgroundColor: colors.primary }]} />}
      <View style={evStyles.body}>
        <View style={evStyles.headerRow}>
          <View style={[evStyles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="calendar" size={16} color={colors.primary} />
          </View>
          <View style={evStyles.info}>
            <Text style={[evStyles.title, { color: colors.foreground }]} numberOfLines={2}>{event.title}</Text>
            {event.game && <Text style={[evStyles.game, { color: colors.primary }]}>{event.game}</Text>}
          </View>
          <View style={[evStyles.statusBadge, { backgroundColor: isActive ? `${colors.primary}20` : colors.secondary, borderColor: isActive ? `${colors.primary}55` : colors.border }]}>
            <Text style={[evStyles.statusText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
              {isActive ? 'نشط' : event.status === 'upcoming' ? 'قريباً' : 'منتهي'}
            </Text>
          </View>
        </View>
        {event.description ? (
          <Text style={[evStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>{event.description}</Text>
        ) : null}
        <View style={evStyles.footer}>
          {dateStr && (
            <View style={evStyles.meta}>
              <Feather name="clock" size={11} color={colors.mutedForeground} />
              <Text style={[evStyles.metaText, { color: colors.mutedForeground }]}>{dateStr}</Text>
            </View>
          )}
          {(event.participantCount ?? 0) > 0 && (
            <View style={evStyles.meta}>
              <Feather name="users" size={11} color={colors.mutedForeground} />
              <Text style={[evStyles.metaText, { color: colors.mutedForeground }]}>{event.participantCount} مشارك</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
const evStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  topStrip: { height: 2 },
  body: { padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBox: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 0, flexShrink: 0 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  game: { fontSize: 11, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700' },
  desc: { fontSize: 12, lineHeight: 18 },
  footer: { flexDirection: 'row', gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11 },
});

// ── Bounty card ───────────────────────────────────────────────────────────────

function BountyCard({ bounty }: { bounty: Bounty }) {
  const colors = useColors();
  const isOpen = bounty.status === 'open';
  const deadline = bounty.deadline ? new Date(bounty.deadline) : null;
  const deadlineStr = deadline
    ? deadline.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
    : null;

  return (
    <View style={[bnStyles.card, { backgroundColor: colors.card, borderColor: isOpen ? `${colors.primary}33` : colors.border }]}>
      <View style={bnStyles.row}>
        <View style={[bnStyles.xpBox, { backgroundColor: isOpen ? `${colors.primary}18` : colors.secondary, borderColor: isOpen ? `${colors.primary}44` : colors.border }]}>
          <Feather name="target" size={14} color={isOpen ? colors.primary : colors.mutedForeground} />
          {(bounty.rewardXp ?? 0) > 0 && (
            <Text style={[bnStyles.xpText, { color: isOpen ? colors.primary : colors.mutedForeground }]}>
              +{bounty.rewardXp}
            </Text>
          )}
          {(bounty.rewardXp ?? 0) > 0 && (
            <Text style={[bnStyles.xpLabel, { color: colors.mutedForeground }]}>XP</Text>
          )}
        </View>
        <View style={bnStyles.content}>
          <Text style={[bnStyles.title, { color: colors.foreground }]} numberOfLines={2}>{bounty.title}</Text>
          {bounty.description && (
            <Text style={[bnStyles.desc, { color: colors.mutedForeground }]} numberOfLines={1}>{bounty.description}</Text>
          )}
          <View style={bnStyles.footer}>
            {bounty.game && (
              <View style={[bnStyles.tag, { backgroundColor: colors.secondary }]}>
                <Text style={[bnStyles.tagText, { color: colors.primary }]}>{bounty.game}</Text>
              </View>
            )}
            {deadlineStr && (
              <View style={bnStyles.meta}>
                <Feather name="clock" size={10} color={colors.mutedForeground} />
                <Text style={[bnStyles.metaText, { color: colors.mutedForeground }]}>{deadlineStr}</Text>
              </View>
            )}
            {(bounty.applicationCount ?? 0) > 0 && (
              <View style={bnStyles.meta}>
                <Feather name="users" size={10} color={colors.mutedForeground} />
                <Text style={[bnStyles.metaText, { color: colors.mutedForeground }]}>{bounty.applicationCount} طلب</Text>
              </View>
            )}
          </View>
        </View>
        <View style={[bnStyles.statusPill, { backgroundColor: isOpen ? `${colors.primary}20` : colors.secondary }]}>
          <Text style={[bnStyles.statusText, { color: isOpen ? colors.primary : colors.mutedForeground }]}>
            {isOpen ? 'مفتوح' : 'مغلق'}
          </Text>
        </View>
      </View>
    </View>
  );
}
const bnStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  xpBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 10, gap: 2, borderWidth: 1, minWidth: 52 },
  xpText: { fontSize: 16, fontWeight: '800' },
  xpLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  content: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  desc: { fontSize: 12, lineHeight: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '700' },
});

// ── Challenge card ────────────────────────────────────────────────────────────

function ChallengeCard({ challenge, me }: { challenge: Challenge; me?: { id?: number } }) {
  const colors = useColors();
  const isPending = challenge.status === 'pending';
  const isAccepted = challenge.status === 'accepted';
  const isChallenger = (me as any)?.username === challenge.challenger?.username;

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'بانتظار القبول', color: '#f59e0b' },
    accepted: { label: 'جارية', color: colors.primary },
    completed: { label: 'منتهية', color: colors.mutedForeground },
    declined: { label: 'مرفوضة', color: colors.destructive },
  };
  const sc = statusConfig[challenge.status] ?? { label: challenge.status, color: colors.mutedForeground };

  return (
    <View style={[chStyles.card, { backgroundColor: colors.card, borderColor: (isPending || isAccepted) ? `${colors.primary}33` : colors.border }]}>
      <View style={chStyles.header}>
        <Feather name="zap" size={14} color={colors.primary} />
        <Text style={[chStyles.headerText, { color: colors.foreground }]}>تحدي</Text>
        {challenge.game && (
          <View style={[chStyles.gameBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[chStyles.gameText, { color: colors.primary }]}>{challenge.game}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={[chStyles.statusBadge, { backgroundColor: `${sc.color}18` }]}>
          <Text style={[chStyles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>
      <View style={chStyles.players}>
        <View style={chStyles.player}>
          <Avatar uri={challenge.challenger?.avatarUrl} name={challenge.challenger?.displayName || challenge.challenger?.username} size={36} />
          <Text style={[chStyles.playerName, { color: isChallenger ? colors.primary : colors.foreground }]} numberOfLines={1}>
            {challenge.challenger?.displayName || challenge.challenger?.username}
          </Text>
          <Text style={[chStyles.role, { color: colors.mutedForeground }]}>المتحدي</Text>
        </View>
        <View style={chStyles.vsBox}>
          <Text style={[chStyles.vs, { color: colors.primary }]}>VS</Text>
        </View>
        <View style={chStyles.player}>
          <Avatar uri={undefined} name={challenge.challenged?.displayName || challenge.challenged?.username} size={36} />
          <Text style={[chStyles.playerName, { color: !isChallenger ? colors.primary : colors.foreground }]} numberOfLines={1}>
            {challenge.challenged?.displayName || challenge.challenged?.username}
          </Text>
          <Text style={[chStyles.role, { color: colors.mutedForeground }]}>المتحدَى</Text>
        </View>
      </View>
    </View>
  );
}
const chStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { fontSize: 13, fontWeight: '700' },
  gameBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  gameText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  players: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  player: { flex: 1, alignItems: 'center', gap: 4 },
  playerName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  role: { fontSize: 10 },
  vsBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  vs: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});

// ── Events Panel ──────────────────────────────────────────────────────────────

function EventsPanel() {
  const { data: events, isLoading, refetch } = useEvents();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor="#00ff40" />}
    >
      <SectionLabel label="الفعاليات النشطة" />
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color="#00ff40" size="large" />
        </View>
      ) : (events ?? []).length === 0 ? (
        <EmptyState icon="calendar" text="لا توجد فعاليات نشطة حالياً — تحقق لاحقاً" />
      ) : (
        (events ?? []).map((ev) => <EventCard key={ev.id} event={ev} />)
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Bounties Panel ────────────────────────────────────────────────────────────

function BountiesPanel() {
  const { data: bounties, isLoading, refetch } = useBounties();
  const open = (bounties ?? []).filter((b) => b.status === 'open');
  const others = (bounties ?? []).filter((b) => b.status !== 'open');

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor="#00ff40" />}
    >
      <SectionLabel label="المكافآت المفتوحة" />
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color="#00ff40" size="large" />
        </View>
      ) : open.length === 0 ? (
        <EmptyState icon="target" text="لا توجد مكافآت مفتوحة حالياً" />
      ) : (
        open.map((b) => <BountyCard key={b.id} bounty={b} />)
      )}
      {others.length > 0 && (
        <>
          <SectionLabel label="المكافآت المغلقة" />
          {others.map((b) => <BountyCard key={b.id} bounty={b} />)}
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Challenges Panel ──────────────────────────────────────────────────────────

function ChallengesPanel() {
  const colors = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: challenges, isLoading, refetch } = useChallenges();

  const createMutation = useMutation<unknown, unknown, { game?: string }>({
    mutationFn: ({ game }) => customFetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengedId: null, game }),
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['/api/challenges/mine'] }),
  });

  const active = (challenges ?? []).filter((c) => ['pending', 'accepted'].includes(c.status));
  const past = (challenges ?? []).filter((c) => ['completed', 'declined'].includes(c.status));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor="#00ff40" />}
    >
      <SectionLabel label="التحديات الجارية" />
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color="#00ff40" size="large" />
        </View>
      ) : active.length === 0 ? (
        <EmptyState icon="zap" text="لا توجد تحديات جارية — ابدأ تحدياً من ملف اللاعبين" />
      ) : (
        active.map((c) => <ChallengeCard key={c.id} challenge={c} me={user ?? undefined} />)
      )}
      {past.length > 0 && (
        <>
          <SectionLabel label="التحديات السابقة" />
          {past.map((c) => <ChallengeCard key={c.id} challenge={c} me={user ?? undefined} />)}
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── LFG Panel ─────────────────────────────────────────────────────────────────

function LFGPanel() {
  const colors = useColors();
  const qc = useQueryClient();
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [gameFilter, setGameFilter] = useState('');

  const { data: posts, isLoading, refetch } = useListLfgPosts();
  const respondMutation = useRespondToLfgPost({
    mutation: {
      onMutate: ({ postId }) => setRespondingId(postId),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['/api/lfg'] }),
      onSettled: () => setRespondingId(null),
    },
  });

  const filtered = (posts ?? []).filter(
    (p) => !gameFilter || p.game?.toLowerCase().includes(gameFilter.toLowerCase()),
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={[lfgStyles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={14} color={colors.mutedForeground} />
        <TextInput
          placeholder="فلتر حسب اللعبة…"
          placeholderTextColor={colors.mutedForeground}
          value={gameFilter}
          onChangeText={setGameFilter}
          style={[lfgStyles.searchInput, { color: colors.foreground }]}
        />
        {gameFilter ? (
          <Pressable onPress={() => setGameFilter('')}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        contentContainerStyle={lfgStyles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <EmptyState icon="search" text={gameFilter ? 'لا توجد نتائج لهذه اللعبة' : 'لا توجد طلبات LFG حالياً'} />
          )
        }
        renderItem={({ item }) => (
          <LFGCard
            post={item}
            isResponding={respondingId === item.id}
            onRespond={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              respondMutation.mutate({ postId: item.id, data: {} });
            }}
          />
        )}
      />
    </View>
  );
}
const lfgStyles = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 13, textAlign: 'right' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
});

// ── Parties Panel ─────────────────────────────────────────────────────────────

function PartiesPanel() {
  const colors = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createName, setCreateName] = useState('');
  const [createGame, setCreateGame] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: parties, isLoading, refetch } = useListParties();
  const createMutation = useCreateParty({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['/api/parties'] });
        setCreateName('');
        setCreateGame('');
        setShowCreate(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    },
  });
  const leaveMutation = useLeaveParty({
    mutation: { onSuccess: () => void qc.invalidateQueries({ queryKey: ['/api/parties'] }) },
  });

  const myParty = (parties ?? []).find(
    (p: any) => p.leader?.id === user?.id || (p.members ?? []).some((m: User) => m.id === user?.id),
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      {/* Create party form */}
      <View style={[pStyles.createCard, { backgroundColor: colors.card, borderColor: showCreate ? `${colors.primary}55` : colors.border }]}>
        <Pressable
          onPress={() => { setShowCreate((v) => !v); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={pStyles.createHeader}
        >
          <View style={[pStyles.createIconBox, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="plus" size={16} color={colors.primary} />
          </View>
          <Text style={[pStyles.createTitle, { color: colors.foreground }]}>إنشاء مجموعة جديدة</Text>
          <Feather name={showCreate ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </Pressable>
        {showCreate && (
          <View style={pStyles.createForm}>
            <TextInput
              placeholder="اسم المجموعة*"
              placeholderTextColor={colors.mutedForeground}
              value={createName}
              onChangeText={setCreateName}
              style={[pStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
            />
            <TextInput
              placeholder="اللعبة (اختياري)"
              placeholderTextColor={colors.mutedForeground}
              value={createGame}
              onChangeText={setCreateGame}
              style={[pStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
            />
            <Pressable
              disabled={!createName.trim() || createMutation.isPending}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                createMutation.mutate({ data: { name: createName.trim(), game: createGame.trim() || undefined, maxSize: 5 } });
              }}
              style={({ pressed }) => [pStyles.createBtn, { backgroundColor: colors.primary, opacity: (!createName.trim() || createMutation.isPending || pressed) ? 0.6 : 1 }]}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[pStyles.createBtnText, { color: colors.primaryForeground }]}>إنشاء</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {/* My party */}
      {myParty && (
        <>
          <SectionLabel label="مجموعتي" />
          <PartyCard party={myParty} isMine onLeave={() => leaveMutation.mutate({ partyId: myParty.id })} />
        </>
      )}

      {/* All parties */}
      <SectionLabel label="المجموعات المتاحة" />
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (parties ?? []).length === 0 ? (
        <EmptyState icon="users" text="لا توجد مجموعات حالياً — أنشئ الأولى!" />
      ) : (
        (parties ?? []).map((p: any) => (
          <PartyCard
            key={p.id}
            party={p}
            isMine={p.leader?.id === user?.id || (p.members ?? []).some((m: User) => m.id === user?.id)}
            onLeave={() => leaveMutation.mutate({ partyId: p.id })}
          />
        ))
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function PartyCard({ party, isMine, onLeave }: { party: any; isMine: boolean; onLeave: () => void }) {
  const colors = useColors();
  const members: User[] = party.members ?? [];
  return (
    <View style={[pStyles.card, { backgroundColor: colors.card, borderColor: isMine ? `${colors.primary}44` : colors.border, shadowColor: isMine ? colors.primary : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: isMine ? 0.2 : 0 }]}>
      {isMine && <View style={[pStyles.strip, { backgroundColor: colors.primary }]} />}
      <View style={pStyles.cardBody}>
        <View style={pStyles.cardRow}>
          <Feather name="users" size={14} color={isMine ? colors.primary : colors.mutedForeground} />
          <Text style={[pStyles.partyName, { color: colors.foreground }]} numberOfLines={1}>{party.name}</Text>
          {party.game && (
            <View style={[pStyles.gameBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[pStyles.gameText, { color: colors.primary }]}>{party.game}</Text>
            </View>
          )}
          <Text style={[pStyles.slots, { color: colors.mutedForeground }]}>{members.length}/{party.maxSize ?? '?'}</Text>
        </View>
        <View style={pStyles.avatarRow}>
          {members.slice(0, 6).map((m) => (
            <Avatar key={m.id} uri={m.avatarUrl} name={m.displayName || m.username} size={28} status={m.status} showStatus />
          ))}
          {members.length > 6 && (
            <Text style={[pStyles.more, { color: colors.mutedForeground }]}>+{members.length - 6}</Text>
          )}
        </View>
        {isMine && (
          <Pressable
            onPress={onLeave}
            style={[pStyles.leaveBtn, { borderColor: colors.destructive }]}
          >
            <Text style={[pStyles.leaveBtnText, { color: colors.destructive }]}>مغادرة</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
const pStyles = StyleSheet.create({
  createCard: { margin: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  createHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  createIconBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  createTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  createForm: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, padding: 10, fontSize: 13, textAlign: 'right' },
  createBtn: { paddingVertical: 11, alignItems: 'center' },
  createBtnText: { fontSize: 14, fontWeight: '700' },
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  strip: { height: 2 },
  cardBody: { padding: 12, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyName: { flex: 1, fontSize: 15, fontWeight: '700' },
  gameBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  gameText: { fontSize: 11, fontWeight: '600' },
  slots: { fontSize: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  more: { fontSize: 12 },
  leaveBtn: { borderWidth: 1, paddingVertical: 7, alignItems: 'center' },
  leaveBtnText: { fontSize: 12, fontWeight: '700' },
});

// ── Factions Panel ────────────────────────────────────────────────────────────

function FactionsPanel() {
  const colors = useColors();
  const { data: factions, isLoading, refetch } = useFactions();
  const { data: rankings, isLoading: loadRank } = useRankings();

  const maxPoints = Math.max(...(factions ?? []).map((f: FactionData) => (f as any).weeklyPoints ?? 0), 1);
  const topRankers: RankingEntry[] = (rankings?.rankings ?? []).slice(0, 10);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading || loadRank} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      <SectionLabel label="حرب الفصائل" />
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (factions ?? []).length === 0 ? (
        <EmptyState icon="shield" text="لا توجد فصائل حالياً" />
      ) : (
        <FlatList
          data={factions}
          keyExtractor={(item: FactionData) => String(item.id)}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
          renderItem={({ item, index }) => (
            <FactionCard faction={item} maxPoints={maxPoints} rank={index + 1} />
          )}
        />
      )}

      <SectionLabel label="ترتيب الموسم الحالي" />
      {loadRank ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : topRankers.length === 0 ? (
        <EmptyState icon="award" text="لا يوجد ترتيب موسمي بعد" />
      ) : (
        <View style={[facStyles.rankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {topRankers.map((entry, i) => (
            <RankingRow key={entry.userId} entry={entry} />
          ))}
        </View>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
const facStyles = StyleSheet.create({
  rankCard: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

const TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'lfg',        label: 'ابحث عن فريق', icon: 'search' },
  { id: 'parties',    label: 'البارتيات',     icon: 'users' },
  { id: 'factions',   label: 'الفصائل',       icon: 'shield' },
  { id: 'events',     label: 'الفعاليات',     icon: 'calendar' },
  { id: 'bounties',   label: 'المكافآت',      icon: 'target' },
  { id: 'challenges', label: 'التحديات',      icon: 'zap' },
];

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SubTab>('lfg');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 84 : 80);

  return (
    <View style={[xStyles.root, { backgroundColor: colors.background }]}>
      {/* ── Gradient header ─────────────────────────────────────────── */}
      <LinearGradient
        colors={['#081a09', '#080808']}
        style={[xStyles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={xStyles.headerInner}>
          <View style={[xStyles.headerIcon, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` }]}>
            <Feather name="compass" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[xStyles.headerTitle, { color: colors.foreground }]}>استكشاف</Text>
            <Text style={[xStyles.headerSub, { color: colors.mutedForeground }]}>اكتشف اللاعبين والأحداث والمكافآت</Text>
          </View>
        </View>

        {/* ── Sub-tab pills (horizontal scroll) ─────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={xStyles.pillsRow}
          style={{ marginTop: 14 }}
        >
          {TABS.map((tab) => (
            <SubTabPill
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onPress={() => {
                void Haptics.selectionAsync();
                setActiveTab(tab.id);
              }}
            />
          ))}
        </ScrollView>
      </LinearGradient>

      {/* ── Panel content ──────────────────────────────────────────────── */}
      <View style={[xStyles.panel, { paddingBottom: bottomPad }]}>
        {activeTab === 'lfg'        && <LFGPanel />}
        {activeTab === 'parties'    && <PartiesPanel />}
        {activeTab === 'factions'   && <FactionsPanel />}
        {activeTab === 'events'     && <EventsPanel />}
        {activeTab === 'bounties'   && <BountiesPanel />}
        {activeTab === 'challenges' && <ChallengesPanel />}
      </View>
    </View>
  );
}

const xStyles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 16 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, marginTop: 2 },
  pillsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 2 },
  panel: { flex: 1 },
});
