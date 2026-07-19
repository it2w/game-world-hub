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
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { useGetMe, useGetPlayerProgress } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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
  const { data: progress, isLoading: loadingProgress, refetch: refetchProgress } = useGetPlayerProgress();

  const displayUser = user ?? ctxUser;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleLogout = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
    router.replace('/login');
  };

  if (loadingMe && !displayUser) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingTop: topPad },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!displayUser) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingTop: topPad },
        ]}
      >
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

  // XP progress calculation — PlayerProgress: { level, rank, totalXp, xpIntoLevel, xpForNext, ... }
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
      {/* Avatar + Name */}
      <View style={styles.heroSection}>
        <Avatar
          uri={displayUser.avatarUrl}
          name={displayUser.displayName || displayUser.username}
          size={80}
          status={status}
          showStatus={false}
        />

        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>
              {displayUser.displayName || displayUser.username}
            </Text>
            {(displayUser as { isPro?: boolean }).isPro && (
              <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.proText, { color: colors.primaryForeground }]}>
                  PRO
                </Text>
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
                <Text style={[styles.separator, { color: colors.border }]}>•</Text>
                <Text style={[styles.currentGame, { color: colors.primary }]}>
                  {displayUser.currentGame}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* XP / Level */}
      <View style={[styles.xpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.xpHeader}>
          <View>
            <Text style={[styles.levelText, { color: colors.foreground }]}>
              المستوى {level}
            </Text>
            <Text style={[styles.xpText, { color: colors.mutedForeground }]}>
              {currentXp.toLocaleString()} XP
            </Text>
          </View>
          {!loadingProgress && (
            <Text style={[styles.xpNext, { color: colors.mutedForeground }]}>
              / {xpForNextLevel.toLocaleString()} XP
            </Text>
          )}
          {loadingProgress && (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          )}
        </View>
        <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.xpFill,
              {
                width: `${Math.round(xpProgress * 100)}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* Stats row */}
      <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          {
            icon: 'award' as const,
            label: 'الرتبة',
            value: (progress as { rank?: string })?.rank ?? '—',
          },
          {
            icon: 'star' as const,
            label: 'المستوى',
            value: String(level),
          },
        ].map((stat) => (
          <View key={stat.label} style={styles.statItem}>
            <Feather name={stat.icon} size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={[styles.actionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => { void handleLogout(); }}
          style={({ pressed }) => [
            styles.actionRow,
            {
              borderBottomColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          testID="logout-button"
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={[styles.actionText, { color: colors.destructive }]}>
            تسجيل الخروج
          </Text>
          <Feather name="chevron-right" size={16} color={colors.destructive} style={styles.actionChevron} />
        </Pressable>
      </View>

      {/* Version */}
      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Game World Hub Mobile v1.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  nameBlock: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  displayName: {
    fontSize: 22,
    fontWeight: '800',
  },
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  username: { fontSize: 14 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: { fontSize: 13 },
  separator: { fontSize: 12 },
  currentGame: { fontSize: 13, fontWeight: '600' },
  xpCard: {
    padding: 16,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  levelText: { fontSize: 18, fontWeight: '700' },
  xpText: { fontSize: 13 },
  xpNext: { fontSize: 13 },
  xpTrack: { height: 4, width: '100%', overflow: 'hidden' },
  xpFill: { height: '100%' },
  statsCard: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  actionsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  actionChevron: { marginLeft: 'auto' },
  version: { fontSize: 11, textAlign: 'center', paddingTop: 4 },
});
