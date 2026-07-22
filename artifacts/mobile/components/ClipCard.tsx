/**
 * ClipCard
 *
 * Displays a clip thumbnail with:
 *   - Aggregate reaction + comment counts (always visible as overlay badges)
 *   - Per-emoji reaction pills (shown on long-press; hidden on tap)
 *   - Live per-emoji count updates via clip-reaction WebSocket events
 *
 * The per-emoji breakdown is fetched lazily (GET /api/clips/:id/reactions)
 * on the first long-press.  Subsequent WS clip-reaction events for this clip
 * update the cached breakdown in place so the pills stay accurate without a
 * second fetch.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { customFetch } from '@workspace/api-client-react';
import { useWsFrame } from '@/contexts/WsContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Clip {
  id: number;
  ownerId: number;
  title: string;
  game: string | null;
  mimeType: string;
  isVideo: boolean;
  durationSeconds: number | null;
  viewCount: number;
  mediaUrl: string;
  thumbnailUrl: string;
  reactionCount: number;
  commentCount: number;
  viewerReactions: string[];
  createdAt: string;
}

interface ReactionsResponse {
  reactions: Record<string, number>;
  mine: string[];
}

interface ClipReactionWsEvent {
  type: 'clip-reaction';
  clipId: number;
  reactions: Record<string, number>;
}

// ── Emoji pill ────────────────────────────────────────────────────────────────

function EmojiPill({
  emoji,
  count,
  isOwn,
}: {
  emoji: string;
  count: number;
  isOwn: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        pillStyles.pill,
        {
          backgroundColor: isOwn ? `${colors.primary}22` : 'rgba(0,0,0,0.55)',
          borderColor: isOwn ? `${colors.primary}77` : 'rgba(255,255,255,0.18)',
        },
      ]}
    >
      <Text style={pillStyles.emoji}>{emoji}</Text>
      <Text style={[pillStyles.count, { color: isOwn ? colors.primary : '#fff' }]}>
        {count}
      </Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emoji: { fontSize: 12 },
  count: { fontSize: 11, fontWeight: '700' },
});

// ── ClipCard ──────────────────────────────────────────────────────────────────

export function ClipCard({
  clip,
  width,
  onPress,
}: {
  clip: Clip;
  /** Card width in pixels — height is derived at 16∶9 */
  width: number;
  onPress?: () => void;
}) {
  const colors = useColors();

  // Per-emoji reactions — null until first fetch
  const [reactions, setReactions] = useState<Record<string, number> | null>(null);
  const [myReactions, setMyReactions] = useState<string[]>([]);
  const [showPills, setShowPills] = useState(false);
  const [loadingReactions, setLoadingReactions] = useState(false);

  // Keep a ref to reactions so the WS handler always sees the latest value
  // without needing to be recreated on every state change.
  const reactionsRef = useRef<Record<string, number> | null>(null);
  reactionsRef.current = reactions;

  // ── WebSocket live updates ─────────────────────────────────────────────────
  // Update the cached per-emoji map whenever a reaction event arrives for this
  // clip, regardless of whether the pills are currently visible.
  useWsFrame<ClipReactionWsEvent>('clip-reaction', (msg) => {
    if (msg.clipId !== clip.id) return;
    setReactions(msg.reactions);
  });

  // ── Fetch reactions on demand ──────────────────────────────────────────────
  const fetchReactions = useCallback(async () => {
    if (loadingReactions) return;
    setLoadingReactions(true);
    try {
      const data = await customFetch<ReactionsResponse>(`/api/clips/${clip.id}/reactions`);
      setReactions(data.reactions);
      setMyReactions(data.mine);
    } catch {
      // best-effort; pills will show empty state
    } finally {
      setLoadingReactions(false);
    }
  }, [clip.id, loadingReactions]);

  const handleLongPress = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowPills(true);
    // Only fetch if we haven't yet; subsequent opens reuse cached state
    // (kept fresh by WS updates).
    if (reactionsRef.current === null) {
      await fetchReactions();
    }
  }, [fetchReactions]);

  const handlePress = useCallback(() => {
    if (showPills) {
      setShowPills(false);
      return;
    }
    onPress?.();
  }, [showPills, onPress]);

  // ── Dimensions ────────────────────────────────────────────────────────────
  const thumbHeight = Math.round((width * 9) / 16);

  // ── Reactions to render ───────────────────────────────────────────────────
  const reactionEntries = reactions
    ? Object.entries(reactions)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)
    : [];

  // ── Full image URL (Image component needs absolute URL) ───────────────────
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  const thumbUri = domain
    ? `https://${domain}${clip.thumbnailUrl}`
    : undefined;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        cardStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* ── Thumbnail ─────────────────────────────────────────────────── */}
      <View
        style={[
          cardStyles.thumb,
          { width, height: thumbHeight, backgroundColor: colors.muted },
        ]}
      >
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, cardStyles.noThumb]}>
            <Feather name="film" size={22} color={colors.border} />
          </View>
        )}

        {/* Video duration badge (bottom-left) */}
        {clip.isVideo && (
          <View style={cardStyles.videoBadge}>
            <Feather name="play" size={9} color="#fff" />
            {clip.durationSeconds != null && (
              <Text style={cardStyles.durationText}>
                {Math.floor(clip.durationSeconds / 60)}:
                {String(clip.durationSeconds % 60).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}

        {/* Aggregate counts (bottom-right, always visible) */}
        <View style={cardStyles.countsRow}>
          <View style={cardStyles.countBadge}>
            <Text style={cardStyles.countText}>⚡ {clip.reactionCount}</Text>
          </View>
          <View style={cardStyles.countBadge}>
            <Text style={cardStyles.countText}>💬 {clip.commentCount}</Text>
          </View>
        </View>

        {/* Per-emoji pills overlay (shown on long-press) */}
        {showPills && (
          <View style={cardStyles.pillsOverlay}>
            {loadingReactions ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : reactionEntries.length === 0 ? (
              <Text style={cardStyles.noReactionsText}>لا توجد تفاعلات</Text>
            ) : (
              <View style={cardStyles.pillRow}>
                {reactionEntries.map(([emoji, count]) => (
                  <EmojiPill
                    key={emoji}
                    emoji={emoji}
                    count={count}
                    isOwn={myReactions.includes(emoji)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Meta ──────────────────────────────────────────────────────── */}
      <View style={cardStyles.meta}>
        <Text
          style={[cardStyles.title, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {clip.title}
        </Text>
        {clip.game ? (
          <Text
            style={[cardStyles.game, { color: colors.primary }]}
            numberOfLines={1}
          >
            {clip.game}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  thumb: { position: 'relative', overflow: 'hidden' },
  noThumb: { alignItems: 'center', justifyContent: 'center' },

  videoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  countsRow: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    gap: 4,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  // Per-emoji overlay that slides up from the bottom of the thumbnail
  pillsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  noReactionsText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  meta: { paddingHorizontal: 8, paddingVertical: 7, gap: 2 },
  title: { fontSize: 12, fontWeight: '600' },
  game: { fontSize: 10, fontWeight: '600' },
});
