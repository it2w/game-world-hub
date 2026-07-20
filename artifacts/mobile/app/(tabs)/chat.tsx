/**
 * Global Chat screen (mobile).
 *
 * Connects to GET /api/global-chat/messages for the initial load and
 * listens to two WS frames in real time:
 *   • global_chat        → prepend new message (filtered to active channel)
 *   • global_chat_delete → remove message by id (regardless of channel)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS: { id: string; label: string }[] = [
  { id: 'general', label: 'عام' },
  { id: 'lfg',     label: 'LFG' },
  { id: 'trading', label: 'تبادل' },
];

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

// ── Channel tabs ──────────────────────────────────────────────────────────────

function ChannelTabs({
  active,
  onSelect,
  unread,
  colors,
}: {
  active: string;
  onSelect: (id: string) => void;
  unread: Record<string, number>;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[tabStyles.scroll, { borderBottomColor: colors.border }]}
      contentContainerStyle={tabStyles.content}
    >
      {CHANNELS.map((ch) => {
        const isActive  = ch.id === active;
        const badgeCount = unread[ch.id] ?? 0;
        return (
          <Pressable
            key={ch.id}
            onPress={() => onSelect(ch.id)}
            style={[
              tabStyles.tab,
              isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <View style={tabStyles.labelRow}>
              <Text
                style={[
                  tabStyles.label,
                  { color: isActive ? colors.primary : colors.mutedForeground },
                  isActive && { fontWeight: '700' },
                ]}
              >
                {ch.label}
              </Text>
              {!isActive && badgeCount > 0 && (
                <View style={[tabStyles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={tabStyles.badgeText}>
                    {badgeCount > 99 ? '99+' : String(badgeCount)}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const tabStyles = StyleSheet.create({
  scroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
});

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

  const [channel, setChannel] = useState('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Unread counts per channel — incremented by WS frames on inactive channels,
  // cleared when the user switches to that channel.
  const [unread, setUnread] = useState<Record<string, number>>({});

  // Keep a ref so WS handlers always see the latest channel without stale closure
  const channelRef = useRef(channel);
  useEffect(() => { channelRef.current = channel; }, [channel]);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Monotonically-increasing request token — prevents stale fetch responses
  // from overwriting messages when the user switches channels rapidly.
  const loadTokenRef = useRef(0);

  // ── Load messages for the active channel ────────────────────────────────────
  const load = useCallback(async (ch: string) => {
    // Capture this request's token before the async work begins
    const token = ++loadTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const msgs = await fetchMessages(ch);
      // Only apply the result if no newer request has started since this one
      if (token !== loadTokenRef.current) return;
      setMessages(msgs);
    } catch {
      if (token !== loadTokenRef.current) return;
      setError('Failed to load messages.');
    } finally {
      if (token === loadTokenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, channel]);

  // ── Channel switch ───────────────────────────────────────────────────────────
  const handleSelectChannel = useCallback((id: string) => {
    if (id === channelRef.current) return;
    setMessages([]);
    setChannel(id);
    // Clear the unread badge for the channel we are switching TO
    setUnread((prev) => {
      if (!prev[id]) return prev; // nothing to clear — avoid re-render
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── WS: new message ──────────────────────────────────────────────────────────
  useWsFrame<GlobalChatFrame>('global_chat', (frame) => {
    if (!frame.message) return;
    if (frame.message.channel !== channelRef.current) {
      // Message belongs to an inactive channel — increment its unread badge
      const ch = frame.message.channel;
      setUnread((prev) => ({ ...prev, [ch]: (prev[ch] ?? 0) + 1 }));
      return;
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === frame.message.id)) return prev;
      return [...prev, frame.message];
    });
    // Scroll to bottom after state update
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  });

  // ── WS: message deleted — remove regardless of which channel is active ───────
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
      await postMessage(trimmed, channelRef.current);
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

      {/* Channel selector */}
      <ChannelTabs
        active={channel}
        onSelect={handleSelectChannel}
        unread={unread}
        colors={colors}
      />

      {/* Message list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>{error}</Text>
          <Pressable onPress={() => load(channel)} style={styles.retryBtn}>
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
