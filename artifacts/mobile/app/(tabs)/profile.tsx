import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { useGetMe, useGetPlayerProgress } from '@workspace/api-client-react';

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

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: ctxUser, logout } = useAuth();

  const { data: user, isLoading: loadingMe, refetch: refetchMe } = useGetMe();
  const { data: progress, isLoading: loadingProgress, refetch: refetchProgress } =
    useGetPlayerProgress();

  const displayUser = user ?? ctxUser;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

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
    } catch {
      /* user cancelled */
    }
  };

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
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          تعذّر تحميل الملف الشخصي
        </Text>
        <Pressable
          onPress={() => { void refetchMe(); }}
          style={[styles.retryBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.retryText, { color: colors.foreground }]}>إعادة المحاولة</Text>
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
          refreshing={loadingMe || loadingProgress}
          onRefresh={() => { void refetchMe(); void refetchProgress(); }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Green accent strip */}
        <View style={[styles.heroStrip, { backgroundColor: colors.primary }]} />

        <View style={styles.heroBody}>
          <View style={styles.heroTop}>
            <Avatar
              uri={displayUser.avatarUrl}
              name={displayUser.displayName || displayUser.username}
              size={72}
              status={status}
              showStatus={false}
            />
            {/* Share button */}
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.shareBtn,
                { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40`, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="share-2" size={16} color={colors.primary} />
              <Text style={[styles.shareBtnText, { color: colors.primary }]}>مشاركة</Text>
            </Pressable>
          </View>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {displayUser.displayName || displayUser.username}
              </Text>
              {(displayUser as { isPro?: boolean }).isPro && (
                <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.proText, { color: colors.primaryForeground }]}>PRO</Text>
                </View>
              )}
            </View>
            <Text style={[styles.username, { color: colors.mutedForeground }]}>
              @{displayUser.username}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusDot }]} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                {statusLabel}
              </Text>
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
          </View>
        </View>
      </View>

      {/* ── XP / Level ────────────────────────────────────────────── */}
      <View style={[styles.xpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.xpHeader}>
          <View>
            <Text style={[styles.levelText, { color: colors.foreground }]}>
              المستوى {level}
            </Text>
            <Text style={[styles.xpText, { color: colors.mutedForeground }]}>
              {currentXp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
            </Text>
          </View>
          {loadingProgress ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.xpPct, { color: colors.primary }]}>
              {Math.round(xpProgress * 100)}%
            </Text>
          )}
        </View>
        <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[styles.xpFill, { width: `${Math.round(xpProgress * 100)}%`, backgroundColor: colors.primary }]}
          />
        </View>
      </View>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: 'award' as const,   label: 'الرتبة',   value: (progress as { rank?: string })?.rank ?? '—' },
          { icon: 'star'  as const,   label: 'المستوى',  value: String(level) },
        ].map((s, i) => (
          <View
            key={s.label}
            style={[
              styles.statItem,
              i < 1 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
            ]}
          >
            <Feather name={s.icon} size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Share profile row */}
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [
            styles.actionRow,
            { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="share-2" size={18} color={colors.foreground} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>مشاركة الملف الشخصي</Text>
          <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
        </Pressable>

        {/* Logout */}
        <Pressable
          onPress={() => { void handleLogout(); }}
          style={({ pressed }) => [
            styles.actionRow,
            { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          testID="logout-button"
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={[styles.actionText, { color: colors.destructive }]}>تسجيل الخروج</Text>
          <Feather name="chevron-left" size={16} color={colors.destructive} />
        </Pressable>
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Game World Hub Mobile v1.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1 },
  retryText: { fontSize: 14, fontWeight: '600' },

  heroCard: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  heroStrip: { height: 3 },
  heroBody: { padding: 16, gap: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  shareBtnText: { fontSize: 13, fontWeight: '700' },

  nameBlock: { gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  displayName: { fontSize: 22, fontWeight: '800' },
  proBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  proText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  username: { fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13 },
  sep: { width: 1, height: 10 },
  currentGame: { fontSize: 12, fontWeight: '600', flexShrink: 1 },

  xpCard: { padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  levelText: { fontSize: 17, fontWeight: '700' },
  xpText: { fontSize: 12, marginTop: 2 },
  xpPct: { fontSize: 22, fontWeight: '800' },
  xpTrack: { height: 4, width: '100%', overflow: 'hidden' },
  xpFill: { height: '100%' },

  statsCard: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth },
  statItem: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 16 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11 },

  actionsCard: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600' },

  version: { fontSize: 11, textAlign: 'center', paddingTop: 4 },
});
