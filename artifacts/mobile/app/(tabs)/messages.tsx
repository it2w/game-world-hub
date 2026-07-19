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
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 24) {
    return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffH < 48) return 'أمس';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

function getOther(conv: Conversation, myId: number): User | undefined {
  return conv.participants.find((p) => p.id !== myId);
}

// ── Conversation row ──────────────────────────────────────────────────────────

function ConvRow({
  conv,
  myId,
  onPress,
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
  const avatarUri = conv.type === 'party' ? undefined : other?.avatarUrl ?? undefined;
  const avatarName = name;
  const preview = conv.lastMessage?.content ?? '…';
  const time = conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : '';
  const unread = (conv.unreadCount ?? 0) > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.container,
        {
          backgroundColor: pressed ? colors.secondary : colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Avatar */}
      <View style={rowStyles.avatarWrap}>
        <Avatar
          uri={avatarUri}
          name={avatarName}
          size={48}
          status={conv.type === 'party' ? undefined : other?.status}
          showStatus={conv.type !== 'party'}
        />
        {conv.type === 'party' && (
          <View style={[rowStyles.partyBadge, { backgroundColor: colors.primary }]}>
            <Feather name="users" size={8} color={colors.primaryForeground} />
          </View>
        )}
      </View>

      {/* Text */}
      <View style={rowStyles.body}>
        <View style={rowStyles.topRow}>
          <Text
            style={[
              rowStyles.name,
              { color: unread ? colors.foreground : colors.foreground },
              unread && { fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {time ? (
            <Text style={[rowStyles.time, { color: colors.mutedForeground }]}>
              {time}
            </Text>
          ) : null}
        </View>
        <View style={rowStyles.bottomRow}>
          <Text
            style={[
              rowStyles.preview,
              { color: unread ? colors.foreground : colors.mutedForeground },
              unread && { fontWeight: '600' },
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread && (
            <View style={[rowStyles.unreadDot, { backgroundColor: colors.primary }]}>
              <Text style={[rowStyles.unreadText, { color: colors.primaryForeground }]}>
                {conv.unreadCount! > 9 ? '9+' : conv.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { position: 'relative' },
  partyBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', flex: 1 },
  time: { fontSize: 11, marginLeft: 8 },
  preview: { fontSize: 13, flex: 1 },
  unreadDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  unreadText: { fontSize: 10, fontWeight: '800' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const { data: convs, isLoading, refetch } = useListConversations();
  const list = convs ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>رسائل</Text>
        <View style={[styles.accentLine, { backgroundColor: colors.primary }]} />
      </View>

      {isLoading && list.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Feather name="message-square" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            لا توجد محادثات بعد
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            ابدأ محادثة مع أحد أصدقائك من صفحته الشخصية
          </Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <ConvRow
              conv={item}
              myId={user?.id ?? 0}
              onPress={() => router.push(`/conversation/${item.id}` as never)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80),
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
