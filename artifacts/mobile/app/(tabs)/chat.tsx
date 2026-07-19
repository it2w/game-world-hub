/**
 * Global Chat screen (mobile).
 *
 * Connects to GET /api/global-chat/messages for the initial load and
 * listens to two WS frames in real time:
 *   • global_chat        → prepend new message
 *   • global_chat_delete → remove message by id (moderator deletion)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useWsFrame } from '@/contexts/WsContext';
import { Avatar } from '@/components/Avatar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  content: string;
  channel: string;
  createdAt: string;
  editedAt?: string | null;
  author: {
    id: number;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

interface GlobalChatFrame {
  type: 'global_chat';
  message: ChatMessage;
}

interface GlobalChatDeleteFrame {
  type: 'global_chat_delete';
  messageId: number;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchMessages(channel = 'general'): Promise<ChatMessage[]> {
  return customFetch<ChatMessage[]>(
    `/api/global-chat/messages?channel=${channel}&limit=50`,
  );
}

async function postMessage(content: string, channel = 'general'): Promise<void> {
  await customFetch('/api/global-chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, channel }),
  });
}

// ── Message row ───────────────────────────────────────────────────────────────

function MessageRow({ msg, colors }: { msg: ChatMessage; colors: ReturnType<typeof useColors> }) {
  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={rowStyles.container}>
      <Avatar
        uri={msg.author.avatarUrl}
        name={msg.author.displayName || msg.author.username}
        size={34}
      />
      <View style={rowStyles.body}>
        <View style={rowStyles.header}>
          <Text style={[rowStyles.name, { color: colors.foreground }]}>
            {msg.author.displayName || msg.author.username}
          </Text>
          <Text style={[rowStyles.time, { color: colors.mutedForeground }]}>
            {time}
          </Text>
          {msg.editedAt && (
            <Text style={[rowStyles.edited, { color: colors.mutedForeground }]}>
              (edited)
            </Text>
          )}
        </View>
        <Text style={[rowStyles.content, { color: colors.foreground }]}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  body: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: 13, fontWeight: '600' },
  time: { fontSize: 11 },
  edited: { fontSize: 11, fontStyle: 'italic' },
  content: { fontSize: 14, lineHeight: 20 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setError(null);
      const msgs = await fetchMessages();
      setMessages(msgs);
    } catch {
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated, load]);

  // ── WS: new message ─────────────────────────────────────────────────────────
  useWsFrame<GlobalChatFrame>('global_chat', (frame) => {
    if (!frame.message) return;
    setMessages((prev) => {
      // Deduplicate by id
      if (prev.some((m) => m.id === frame.message.id)) return prev;
      return [...prev, frame.message];
    });
    // Scroll to bottom after state update
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  });

  // ── WS: message deleted ─────────────────────────────────────────────────────
  useWsFrame<GlobalChatDeleteFrame>('global_chat_delete', (frame) => {
    setMessages((prev) => prev.filter((m) => m.id !== frame.messageId));
  });

  // ── Send ─────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await postMessage(trimmed);
    } catch {
      setText(trimmed); // restore on error
    } finally {
      setSending(false);
    }
  }, [text, sending]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 44}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          الدردشة العامة
        </Text>
      </View>

      {/* Message list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <MessageRow msg={item} colors={colors} />}
          contentContainerStyle={{ paddingBottom: 8 }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: colors.mutedForeground }}>لا توجد رسائل بعد</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View
        style={[
          styles.inputBar,
          {
            paddingBottom: insets.bottom + 8,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              color: colors.foreground,
              borderColor: colors.border,
            },
          ]}
          placeholder="اكتب رسالة..."
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                text.trim() && !sending ? colors.primary : colors.muted,
            },
          ]}
        >
          <Text style={[styles.sendLabel, { color: colors.primaryForeground }]}>
            {sending ? '...' : 'إرسال'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  inputBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    height: 38,
  },
  sendLabel: { fontSize: 13, fontWeight: '600' },
});
