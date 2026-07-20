/**
 * رسائل — Private conversations (DMs + party chats)
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import {
  useListConversations,
  type Conversation,
  type User,
} from '@workspace/api-client-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 48) return 'أمس';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

function getOther(conv: Conversation, myId: number): User | undefined {
  return conv.participants.find((p) => p.id !== myId);
}

// ── Conv row ──────────────────────────────────────────────────────────────────

function ConvRow({
  conv, myId, onPress,
}: {
  conv: Conversation;
  myId: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const other = getOther(conv, myId);
  const name =
    conv.type === 'party'
      ? (conv.name ?? 'مجموعة')
      : other?.displayName || other?.username || 'محادثة';

  const lastMsg = conv.lastMessage;
  const unread = (conv.unreadCount ?? 0) > 0;
  const avatarUri = conv.type === 'party' ? undefined : other?.avatarUrl;
  const avatarName = name;
  const avatarStatus = conv.type === 'direct' ? other?.status : undefined;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        {
          backgroundColor: unread ? `${colors.primary}08` : colors.card,
          borderColor: unread ? `${colors.primary}33` : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {/* Unread accent strip */}
      {unread && <View style={[rowStyles.unreadStrip, { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.8 }]} />}

      <View style={rowStyles.avatarSection}>
        {conv.type === 'party' ? (
          <View style={[rowStyles.groupIconBox, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` }]}>
            <Feather name="users" size={22} color={colors.primary} />
          </View>
        ) : (
          <Avatar uri={avatarUri} name={avatarName} size={48} status={avatarStatus} showStatus />
        )}
      </View>

      <View style={rowStyles.textBlock}>
        <View style={rowStyles.topLine}>
          <Text
            style={[rowStyles.name, { color: colors.foreground, fontWeight: unread ? '700' : '600' }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {lastMsg?.createdAt && (
            <Text style={[rowStyles.time, { color: unread ? colors.primary : colors.mutedForeground }]}>
              {formatTime(lastMsg.createdAt)}
            </Text>
          )}
        </View>

        <View style={rowStyles.bottomLine}>
          <Text
            style={[
              rowStyles.preview,
              { color: unread ? colors.foreground : colors.mutedForeground, fontWeight: unread ? '500' : '400' },
            ]}
            numberOfLines={1}
          >
            {lastMsg?.content ?? 'ابدأ المحادثة…'}
          </Text>
          {unread && (
            <View style={[rowStyles.badge, { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.6 }]}>
              <Text style={[rowStyles.badgeText, { color: colors.primaryForeground }]}>
                {(conv.unreadCount ?? 0) > 99 ? '99+' : conv.unreadCount}
              </Text>
            </View>
          )}
        </View>

        {conv.type === 'party' && conv.name && (
          <View style={[rowStyles.partyTag, { backgroundColor: colors.secondary }]}>
            <Text style={[rowStyles.partyTagText, { color: colors.primary }]}>بارتي</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingRight: 16, overflow: 'hidden' },
  unreadStrip: { width: 3, alignSelf: 'stretch', marginRight: -8, marginLeft: 13 },
  avatarSection: { width: 48, alignItems: 'center' },
  groupIconBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  textBlock: { flex: 1, gap: 4 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flex: 1, fontSize: 14 },
  time: { fontSize: 11 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  preview: { flex: 1, fontSize: 12 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  partyTag: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  partyTagText: { fontSize: 10, fontWeight: '700' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: convs, isLoading, isError, refetch } = useListConversations();

  const sorted = React.useMemo(() => {
    const list: Conversation[] = convs ?? [];
    return [...list].sort((a, b) => {
      const aT = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bT = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bT - aT;
    });
  }, [convs]);

  const totalUnread = sorted.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with gradient */}
      <LinearGradient colors={['#081a09', '#080808']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>رسائل</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isLoading ? 'جارٍ التحميل…' : `${sorted.length} محادثة${totalUnread > 0 ? ` · ${totalUnread} غير مقروء` : ''}`}
            </Text>
          </View>
          {totalUnread > 0 && (
            <View style={[styles.totalBadge, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
              <Text style={[styles.totalBadgeText, { color: colors.primaryForeground }]}>{totalUnread}</Text>
            </View>
          )}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.primary }]} />
      </LinearGradient>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>تعذّر التحميل</Text>
          <Pressable onPress={() => void refetch()} style={[styles.retryBtn, { borderColor: colors.primary }]}>
            <Text style={[{ color: colors.primary, fontWeight: '600', fontSize: 13 }]}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIconBox, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}33` }]}>
            <Feather name="mail" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا توجد رسائل بعد</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            ابدأ محادثة من خلال الضغط على أيقونة الرسائل في بطاقة صديق
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ConvRow
              conv={item}
              myId={user?.id ?? 0}
              onPress={() => router.push(`/conversation/${item.id}` as never)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 0 },
  headerContent: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2 },
  totalBadge: { paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 0.5 },
  totalBadgeText: { fontSize: 13, fontWeight: '800' },
  divider: { height: 1, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.4 },
  listContent: { paddingBottom: 90 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  emptyIconBox: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 9, borderWidth: 1 },
});
