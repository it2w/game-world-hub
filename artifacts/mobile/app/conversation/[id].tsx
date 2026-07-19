/**
 * Individual DM / party conversation screen
 * Route: /conversation/:id  (conversationId)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Avatar';
import { useWsFrame } from '@/contexts/WsContext';
import {
  useGetMessages,
  useListConversations,
  useSendMessage,
  type Message,
  type Conversation,
  type User,
} from '@workspace/api-client-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

function getOther(conv: Conversation, myId: number): User | undefined {
  return conv.participants.find((p) => p.id !== myId);
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg, mine }: { msg: Message; mine: boolean }) {
  const colors = useColors();
  return (
    <View style={[bStyles.row, mine && bStyles.rowMine]}>
      {!mine && (
        <Avatar
          uri={msg.sender.avatarUrl}
          name={msg.sender.displayName || msg.sender.username}
          size={28}
        />
      )}
      <View
        style={[
          bStyles.bubble,
          mine
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        ]}
      >
        {!mine && (
          <Text style={[bStyles.senderName, { color: colors.primary }]}>
            {msg.sender.displayName || msg.sender.username}
          </Text>
        )}
        <Text style={[bStyles.content, { color: mine ? colors.primaryForeground : colors.foreground }]}>
          {msg.content}
        </Text>
        <Text
          style={[
            bStyles.time,
            { color: mine ? `${colors.primaryForeground}99` : colors.mutedForeground },
          ]}
        >
          {formatTime(msg.createdAt)}
          {msg.editedAt ? ' · عُدِّل' : ''}
        </Text>
      </View>
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6, paddingHorizontal: 12 },
  rowMine: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '72%', padding: 10, gap: 3 },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  content: { fontSize: 14, lineHeight: 20 },
  time: { fontSize: 10, alignSelf: 'flex-end' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flatRef = useRef<FlatList>(null);
  const [text, setText] = useState('');

  // Fetch conversation metadata for the header
  const { data: conversations } = useListConversations();
  const conv = (conversations ?? []).find((c: Conversation) => c.id === convId);
  const other = conv && user ? getOther(conv, user.id) : undefined;
  const headerName =
    conv?.type === 'party'
      ? (conv.name ?? 'مجموعة')
      : other?.displayName || other?.username || 'محادثة';

  // Messages
  const {
    data: msgs,
    isLoading,
    refetch,
  } = useGetMessages(convId, {
    query: { refetchInterval: 5_000 },
  });
  const messages: Message[] = msgs ?? [];

  // Real-time via WS — listen for any 'message' frame for this conversation
  useWsFrame<{ type: 'message'; message: Message }>(
    'message',
    useCallback(
      (frame) => {
        if (frame.message.conversationId !== convId) return;
        void queryClient.invalidateQueries({
          queryKey: [`/api/conversations/${convId}/messages`],
        });
      },
      [convId, queryClient],
    ),
  );

  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: [`/api/conversations/${convId}/messages`],
        });
        void queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      },
    },
  });

  const handleSend = () => {
    const content = text.trim();
    if (!content || sendMutation.isPending) return;
    setText('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMutation.mutate({ conversationId: convId, data: { content } });
  };

  const handleShare = async () => {
    if (!other) return;
    try {
      await Share.share({
        message: `تحقق من ملف ${other.displayName || other.username} على Game World Hub!`,
      });
    } catch {
      /* ignore */
    }
  };

  const bottomPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          {
            paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={12}
        >
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </Pressable>

        {other && (
          <Avatar
            uri={other.avatarUrl}
            name={other.displayName || other.username}
            size={34}
            status={other.status}
            showStatus
          />
        )}

        <Text style={[s.headerName, { color: colors.foreground }]} numberOfLines={1}>
          {headerName}
        </Text>

        {/* Action buttons */}
        <View style={s.headerActions}>
          {other && (
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [s.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={8}
            >
              <Feather name="share-2" size={20} color={colors.primary} />
            </Pressable>
          )}
          {/* Voice placeholder — routes user to web or shows coming-soon */}
          <Pressable
            style={({ pressed }) => [s.iconBtn, s.voiceBtn, { backgroundColor: `${colors.primary}18`, opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}
            onPress={() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)}
          >
            <Feather name="phone" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {isLoading && messages.length === 0 ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : messages.length === 0 ? (
          <View style={s.center}>
            <Feather name="message-square" size={40} color={colors.border} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              ابدأ المحادثة بإرسال رسالة
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => (
              <Bubble msg={item} mine={item.sender.id === user?.id} />
            )}
            onRefresh={() => void refetch()}
            refreshing={isLoading}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View
          style={[
            s.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 12,
            },
          ]}
        >
          <TextInput
            style={[
              s.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                borderColor: colors.border,
              },
            ]}
            placeholder="اكتب رسالة…"
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            textAlign="right"
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            style={({ pressed }) => [
              s.sendBtn,
              {
                backgroundColor: text.trim() ? colors.primary : colors.secondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather
                name="send"
                size={18}
                color={text.trim() ? colors.primaryForeground : colors.mutedForeground}
                style={{ transform: [{ scaleX: -1 }] }}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerName: { flex: 1, fontSize: 16, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  voiceBtn: { borderRadius: 20, padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
