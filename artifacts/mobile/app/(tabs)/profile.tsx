import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { ClipCard, type Clip } from '@/components/ClipCard';
import { customFetch } from '@workspace/api-client-react';
import { useGetMe, useGetPlayerProgress, type Achievement } from '@workspace/api-client-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerStats {
  friends: number;
  partiesCreated: number;
  partiesJoined: number;
  messagesSent: number;
  lfgPosts: number;
  lfgResponses: number;
  games: number;
  platforms: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAchievements() {
  return useQuery<Achievement[]>({
    queryKey: ['/api/achievements'],
    queryFn: () => customFetch<Achievement[]>('/api/achievements'),
    staleTime: 300_000,
  });
}

function usePlayerStats() {
  return useQuery<PlayerStats>({
    queryKey: ['/api/stats/me'],
    queryFn: () => customFetch<PlayerStats>('/api/stats/me'),
    staleTime: 120_000,
  });
}

interface ClipsPage {
  clips: Clip[];
  total: number;
  page: number;
  limit: number;
}

function useMyClips(userId: number | undefined) {
  return useQuery<ClipsPage>({
    queryKey: ['/api/users', userId, 'clips'],
    queryFn: () => customFetch<ClipsPage>(`/api/users/${userId}/clips?page=1`),
    enabled: userId != null,
    staleTime: 60_000,
  });
}

interface ClipsQuota {
  current: number;
  limit: number;
  isPro: boolean;
}

function useClipsQuota() {
  return useQuery<ClipsQuota>({
    queryKey: ['/api/users/me/clips/quota'],
    queryFn: () => customFetch<ClipsQuota>('/api/users/me/clips/quota'),
    staleTime: 30_000,
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  online: 'متصل',
  away: 'عائد قريباً',
  busy: 'مشغول',
  offline: 'غير متصل',
};

const STATUS_COLOR: Record<string, string> = {
  online: '#00ff40',
  away: '#f59e0b',
  busy: '#ef4444',
  offline: '#6b7280',
};

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ icon, value, label, glow }: { icon: string; value: string; label: string; glow?: boolean }) {
  const colors = useColors();
  return (
    <View style={[
      stStyles.tile,
      {
        flex: 1,
        backgroundColor: glow ? `${colors.primary}12` : colors.card,
        borderColor: glow ? `${colors.primary}44` : colors.border,
        shadowColor: glow ? colors.primary : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: glow ? 0.3 : 0,
        elevation: glow ? 4 : 0,
      },
    ]}>
      <Feather name={icon as any} size={18} color={glow ? colors.primary : colors.mutedForeground} />
      <Text style={[stStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[stStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const stStyles = StyleSheet.create({
  tile: { alignItems: 'center', gap: 5, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
});

// ── Mini stat row ─────────────────────────────────────────────────────────────

function MiniStatRow({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  const colors = useColors();
  return (
    <View style={msStyles.row}>
      <View style={[msStyles.iconBox, { backgroundColor: colors.secondary }]}>
        <Feather name={icon as any} size={13} color={colors.primary} />
      </View>
      <Text style={[msStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[msStyles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}
const msStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 13 },
  value: { fontSize: 14, fontWeight: '700' },
});

// ── Achievement badge ─────────────────────────────────────────────────────────

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const colors = useColors();
  const pct = achievement.target > 0 ? Math.min(achievement.current / achievement.target, 1) : 0;

  return (
    <View style={[
      achStyles.card,
      {
        backgroundColor: achievement.unlocked ? `${colors.primary}0e` : colors.card,
        borderColor: achievement.unlocked ? `${colors.primary}55` : colors.border,
        shadowColor: achievement.unlocked ? colors.primary : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: achievement.unlocked ? 0.25 : 0,
      },
    ]}>
      {/* Icon */}
      <View style={[
        achStyles.iconBox,
        { backgroundColor: achievement.unlocked ? `${colors.primary}22` : colors.secondary },
      ]}>
        <Text style={achStyles.icon}>{achievement.icon || '🏆'}</Text>
      </View>
      <View style={achStyles.info}>
        <Text style={[achStyles.name, { color: achievement.unlocked ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
          {achievement.name}
        </Text>
        <Text style={[achStyles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
          {achievement.description}
        </Text>
        {/* Progress bar */}
        {!achievement.unlocked && achievement.target > 1 && (
          <View style={[achStyles.track, { backgroundColor: colors.muted }]}>
            <View style={[achStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
        )}
        {!achievement.unlocked && (
          <Text style={[achStyles.progress, { color: colors.mutedForeground }]}>
            {achievement.current}/{achievement.target}
          </Text>
        )}
      </View>
      {achievement.unlocked && (
        <View style={[achStyles.checkBox, { backgroundColor: `${colors.primary}22` }]}>
          <Feather name="check" size={14} color={colors.primary} />
        </View>
      )}
    </View>
  );
}
const achStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, marginHorizontal: 16, marginBottom: 8, borderWidth: 1 },
  iconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon: { fontSize: 20 },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 13, fontWeight: '700' },
  desc: { fontSize: 11, lineHeight: 16 },
  track: { height: 3, width: '100%', overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%' },
  progress: { fontSize: 10 },
  checkBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ── Clip quota row ────────────────────────────────────────────────────────────

function ClipQuotaRow({ current, limit }: { current: number; limit: number }) {
  const colors = useColors();
  const pct = limit > 0 ? Math.min(current / limit, 1) : 0;
  const atLimit = current >= limit;
  const nearLimit = !atLimit && pct >= 0.8;
  const barColor = atLimit ? colors.destructive : nearLimit ? '#f59e0b' : colors.primary;
  return (
    <View style={cqStyles.row}>
      <View style={[cqStyles.iconBox, { backgroundColor: atLimit ? `${colors.destructive}18` : colors.secondary }]}>
        <Feather name="film" size={13} color={atLimit ? colors.destructive : colors.primary} />
      </View>
      <View style={cqStyles.info}>
        <Text style={[cqStyles.label, { color: colors.mutedForeground }]}>المقاطع المحفوظة</Text>
        <View style={[cqStyles.track, { backgroundColor: colors.muted }]}>
          <View style={[cqStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }]} />
        </View>
      </View>
      <Text style={[cqStyles.value, { color: atLimit ? colors.destructive : nearLimit ? '#f59e0b' : colors.foreground }]}>
        {current}/{limit}
      </Text>
    </View>
  );
}
const cqStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  iconBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 4 },
  label: { fontSize: 13 },
  track: { height: 3, width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  value: { fontSize: 14, fontWeight: '700', minWidth: 36, textAlign: 'right' },
});

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  icon, label, sub, onPress, danger, rightEl,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  rightEl?: React.ReactNode;
}) {
  const colors = useColors();
  const iconColor = danger ? colors.destructive : colors.foreground;
  const textColor = danger ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        arStyles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[arStyles.iconBox, { backgroundColor: danger ? `${colors.destructive}15` : colors.secondary }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={arStyles.textBlock}>
        <Text style={[arStyles.label, { color: textColor }]}>{label}</Text>
        {sub && <Text style={[arStyles.sub, { color: colors.mutedForeground }]}>{sub}</Text>}
      </View>
      {rightEl ?? <Feather name="chevron-left" size={15} color={danger ? colors.destructive : colors.mutedForeground} />}
    </Pressable>
  );
}
const arStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBox: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  textBlock: { flex: 1, gap: 1 },
  label: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 11 },
});

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, accent }: { label: string; accent?: boolean }) {
  const colors = useColors();
  return (
    <View style={shStyles.row}>
      <View style={[shStyles.bar, { backgroundColor: colors.primary, shadowColor: accent ? colors.primary : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: accent ? 0.8 : 0 }]} />
      <Text style={[shStyles.text, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const shStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
  bar: { width: 3, height: 12 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: ctxUser, logout } = useAuth();

  const { data: user, isLoading: loadingMe, refetch: refetchMe } = useGetMe();
  const { data: progress, isLoading: loadingProgress, refetch: refetchProgress } = useGetPlayerProgress();
  const { data: achievements, isLoading: loadingAch, refetch: refetchAch } = useAchievements();
  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = usePlayerStats();
  const { data: clipsQuota, refetch: refetchClipsQuota } = useClipsQuota();

  const displayUser = user ?? ctxUser;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { width: screenWidth } = useWindowDimensions();

  const { data: clipsData, isLoading: loadingClips, refetch: refetchClips } = useMyClips(displayUser?.id);

  const handleLogout = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
    router.replace('/login');
  };

  const handleShare = async () => {
    if (!displayUser) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        title: `${displayUser.displayName || displayUser.username} — Game World Hub`,
        message: `تحقق من ملف ${displayUser.displayName || displayUser.username} على Game World Hub!\n@${displayUser.username}`,
      });
    } catch { /* cancelled */ }
  };

  // 2-column clip grid metrics (16px margin each side, 8px gap)
  const clipColGap = 8;
  const clipHPad = 16;
  const clipCardWidth = Math.floor((screenWidth - clipHPad * 2 - clipColGap) / 2);

  const isRefreshing = loadingMe || loadingProgress || loadingAch || loadingStats;
  const clipUsed  = clipsQuota?.current ?? 0;
  const clipLimit = clipsQuota?.limit ?? (((displayUser as { isPro?: boolean })?.isPro) ? 100 : 20);

  if (loadingMe && !displayUser) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!displayUser) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Feather name="user-x" size={40} color={colors.border} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>تعذّر تحميل الملف الشخصي</Text>
        <Pressable
          onPress={() => { void refetchMe(); }}
          style={[styles.retryBtn, { borderColor: colors.primary }]}
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  const status = displayUser.status ?? 'offline';
  const statusDot = STATUS_COLOR[status] ?? STATUS_COLOR.offline;
  const statusLabel = STATUS_LABEL[status] ?? 'غير متصل';

  const currentXp: number = progress?.xpIntoLevel ?? 0;
  const level: number = progress?.level ?? 1;
  const xpForNextLevel: number = progress?.xpForNext ?? 1000;
  const xpProgress = Math.min(currentXp / xpForNextLevel, 1);

  const unlockedAch = (achievements ?? []).filter((a) => a.unlocked);
  const lockedAch = (achievements ?? []).filter((a) => !a.unlocked);
  const totalAch = achievements?.length ?? 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80) }]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void refetchMe();
            void refetchProgress();
            void refetchAch();
            void refetchStats();
            void refetchClips();
            void refetchClipsQuota();
          }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero gradient ──────────────────────────────────────────── */}
      <LinearGradient colors={['#081a09', '#0a0a0a']} style={styles.heroGradient}>
        <View style={styles.heroTop}>
          <View style={styles.avatarWrap}>
            <Avatar
              uri={displayUser.avatarUrl}
              name={displayUser.displayName || displayUser.username}
              size={76}
              status={status}
              showStatus={false}
            />
            {/* Glow ring */}
            <View style={[styles.avatarGlow, { borderColor: `${colors.primary}55`, shadowColor: colors.primary }]} />
          </View>

          <View style={styles.heroMeta}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { color: colors.foreground }]} numberOfLines={1}>
                {displayUser.displayName || displayUser.username}
              </Text>
              {(displayUser as { isPro?: boolean }).isPro && (
                <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.proText, { color: colors.primaryForeground }]}>PRO</Text>
                </View>
              )}
            </View>
            <Text style={[styles.username, { color: colors.mutedForeground }]}>@{displayUser.username}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusDot, shadowColor: statusDot, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.8 }]} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{statusLabel}</Text>
              {displayUser.currentGame && (
                <>
                  <View style={[styles.sep, { backgroundColor: colors.border }]} />
                  <Feather name="play" size={10} color={colors.primary} />
                  <Text style={[styles.currentGame, { color: colors.primary }]} numberOfLines={1}>
                    {displayUser.currentGame}
                  </Text>
                </>
              )}
            </View>
            {/* Achievement count badge */}
            {totalAch > 0 && (
              <View style={styles.achBadgeRow}>
                <Text style={achBadgeStyle.emoji}>🏆</Text>
                <Text style={[achBadgeStyle.text, { color: colors.primary }]}>
                  {unlockedAch.length}/{totalAch} إنجاز
                </Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.shareBtn,
              { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}55`, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="share-2" size={16} color={colors.primary} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* ── XP / Level ─────────────────────────────────────────────── */}
      <View style={[styles.xpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.xpHeader}>
          <View>
            <Text style={[styles.levelText, { color: colors.foreground }]}>المستوى {level}</Text>
            <Text style={[styles.xpSub, { color: colors.mutedForeground }]}>
              {currentXp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
            </Text>
          </View>
          {loadingProgress ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.xpPct, { color: colors.primary }]}>{Math.round(xpProgress * 100)}%</Text>
          )}
        </View>
        {/* Glow bar */}
        <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.xpFill,
              {
                width: `${Math.round(xpProgress * 100)}%`,
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 6,
                shadowOpacity: 0.7,
              },
            ]}
          />
        </View>
      </View>

      {/* ── Top stats row ───────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <StatTile icon="award" value={(progress as { rank?: string })?.rank ?? '—'} label="الرتبة" glow />
        <StatTile icon="zap"   value={String(level)}                                  label="المستوى" />
        <StatTile icon="star"  value={`${Math.round(xpProgress * 100)}%`}             label="التقدم" />
      </View>

      {/* ── Activity Stats ──────────────────────────────────────────── */}
      <SectionHeader label="إحصائيات اللعب" accent />
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {loadingStats ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : stats ? (
          <>
            <MiniStatRow icon="users" label="الأصدقاء"        value={stats.friends} />
            <MiniStatRow icon="shield" label="مجموعات أنشأتها" value={stats.partiesCreated} />
            <MiniStatRow icon="user-plus" label="مجموعات انضممت إليها" value={stats.partiesJoined} />
            <MiniStatRow icon="message-circle" label="الرسائل المرسلة" value={stats.messagesSent} />
            <MiniStatRow icon="search" label="طلبات LFG"       value={stats.lfgPosts} />
            <MiniStatRow icon="send" label="ردود LFG"          value={stats.lfgResponses} />
            <MiniStatRow icon="monitor" label="الألعاب المسجّلة" value={stats.games} />
            <ClipQuotaRow current={clipUsed} limit={clipLimit} />
          </>
        ) : (
          <View style={{ paddingVertical: 16, paddingHorizontal: 16 }}>
            <Text style={[{ color: colors.mutedForeground, fontSize: 13 }]}>لا توجد إحصائيات بعد</Text>
          </View>
        )}
      </View>

      {/* ── My Clips ────────────────────────────────────────────────── */}
      <SectionHeader label={`مقاطعي${clipsData ? ` (${clipsData.total})` : ''}`} />
      {loadingClips ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : (clipsData?.clips ?? []).length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.emptyIcon}>🎬</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            لم ترفع أي مقاطع بعد
          </Text>
        </View>
      ) : (
        <View style={clipGridStyles.grid}>
          {(clipsData?.clips ?? []).map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              width={clipCardWidth}
            />
          ))}
        </View>
      )}

      {/* ── Achievements ────────────────────────────────────────────── */}
      <SectionHeader label={`الإنجازات (${unlockedAch.length}/${totalAch})`} />

      {loadingAch ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : (achievements ?? []).length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>العب أكثر لتفتح الإنجازات!</Text>
        </View>
      ) : (
        <>
          {unlockedAch.length > 0 && (
            <>
              <View style={[styles.achGroupLabel, { borderColor: `${colors.primary}33` }]}>
                <Text style={[styles.achGroupText, { color: colors.primary }]}>✅ مفتوحة ({unlockedAch.length})</Text>
              </View>
              {unlockedAch.map((a) => <AchievementBadge key={a.id} achievement={a} />)}
            </>
          )}
          {lockedAch.length > 0 && (
            <>
              <View style={[styles.achGroupLabel, { borderColor: colors.border }]}>
                <Text style={[styles.achGroupText, { color: colors.mutedForeground }]}>🔒 مقفلة ({lockedAch.length})</Text>
              </View>
              {lockedAch.slice(0, 5).map((a) => <AchievementBadge key={a.id} achievement={a} />)}
              {lockedAch.length > 5 && (
                <Text style={[styles.seeMore, { color: colors.mutedForeground }]}>
                  + {lockedAch.length - 5} إنجاز آخر
                </Text>
              )}
            </>
          )}
        </>
      )}

      {/* ── الحساب ─────────────────────────────────────────────────── */}
      <SectionHeader label="الحساب" />
      <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActionRow
          icon="share-2"
          label="مشاركة الملف الشخصي"
          sub="أرسل رابط ملفك لأصدقائك"
          onPress={handleShare}
        />
        <ActionRow
          icon="user"
          label="تعديل الملف الشخصي"
          sub="الاسم والصورة والحالة"
          onPress={() => { /* navigate to edit */ }}
        />
        <ActionRow
          icon="bell"
          label="الإشعارات"
          sub="تحكم في تنبيهات التطبيق"
          onPress={() => { /* navigate to notifs */ }}
        />
      </View>

      {/* ── اللعب ──────────────────────────────────────────────────── */}
      <SectionHeader label="اللعب" />
      <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActionRow
          icon="compass"
          label="استكشف الفصائل"
          sub="انضم أو شاهد حرب الفصائل"
          onPress={() => router.push('/(tabs)/explore' as never)}
        />
        <ActionRow
          icon="target"
          label="لوحة المكافآت"
          sub="اكسب XP من المهام والمكافآت"
          onPress={() => router.push('/(tabs)/explore' as never)}
        />
        <ActionRow
          icon="zap"
          label="التحديات"
          sub="تحدَّ أصدقاءك في ألعابك المفضلة"
          onPress={() => router.push('/(tabs)/explore' as never)}
        />
        <ActionRow
          icon="calendar"
          label="الفعاليات"
          sub="شارك في الفعاليات المجدولة"
          onPress={() => router.push('/(tabs)/explore' as never)}
        />
        <ActionRow
          icon="award"
          label="الترتيب الموسمي"
          sub="شاهد ترتيبك بين اللاعبين"
          onPress={() => router.push('/(tabs)/explore' as never)}
        />
      </View>

      {/* ── الدعم ──────────────────────────────────────────────────── */}
      <SectionHeader label="الدعم" />
      <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActionRow
          icon="help-circle"
          label="مركز المساعدة"
          sub="أسئلة شائعة وتواصل معنا"
          onPress={() => void Linking.openURL('https://gameworldhub.com/support')}
        />
        <ActionRow
          icon="log-out"
          label="تسجيل الخروج"
          onPress={() => { void handleLogout(); }}
          danger
        />
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Game World Hub Mobile v1.0
      </Text>
    </ScrollView>
  );
}

const achBadgeStyle = StyleSheet.create({
  // inside nameRow area – separate const to avoid collision
  emoji: { fontSize: 12 },
  text: { fontSize: 11, fontWeight: '700' },
} as const);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 14, fontWeight: '600' },

  heroGradient: { paddingBottom: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingTop: 20 },
  avatarWrap: { position: 'relative' },
  avatarGlow: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderWidth: 1, borderRadius: 50,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, shadowOpacity: 0.45,
  },
  heroMeta: { flex: 1, gap: 4, paddingTop: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  displayName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  proBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  proText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  username: { fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12 },
  sep: { width: 1, height: 10 },
  currentGame: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  shareBtn: { padding: 10, borderWidth: 1, marginTop: 2 },
  achBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },

  xpCard: { marginHorizontal: 16, marginTop: 14, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  levelText: { fontSize: 17, fontWeight: '700' },
  xpSub: { fontSize: 12, marginTop: 2 },
  xpPct: { fontSize: 22, fontWeight: '800' },
  xpTrack: { height: 4, width: '100%', overflow: 'hidden' },
  xpFill: { height: '100%' },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, gap: 8 },

  statsCard: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divRow: { borderBottomWidth: StyleSheet.hairlineWidth },

  actionsCard: { marginHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  achGroupLabel: { marginHorizontal: 16, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  achGroupText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  seeMore: { textAlign: 'center', fontSize: 12, paddingVertical: 12 },

  emptyCard: { marginHorizontal: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth },
  emptyIcon: { fontSize: 24 },
  emptyText: { fontSize: 13, flex: 1 },

  version: { fontSize: 11, textAlign: 'center', paddingVertical: 20 },
});

const clipGridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 8,
  },
});
