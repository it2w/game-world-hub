import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { LfgPost } from '@workspace/api-client-react';
import { Avatar } from '@/components/Avatar';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface LFGCardProps {
  post: LfgPost;
  onRespond?: (postId: number) => void;
  isResponding?: boolean;
}

export function LFGCard({ post, onRespond, isResponding }: LFGCardProps) {
  const colors = useColors();

  const handleRespond = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRespond?.(post.id);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `منذ ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24) return `منذ ${h} ساعة`;
    return `منذ ${Math.floor(h / 24)} يوم`;
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: post.viewerHasResponded ? colors.primary : colors.border,
          borderWidth: post.viewerHasResponded ? 1 : StyleSheet.hairlineWidth,
        },
      ]}
      testID={`lfg-card-${post.id}`}
    >
      {/* Header */}
      <View style={styles.header}>
        <Avatar
          uri={post.author.avatarUrl}
          name={post.author.displayName || post.author.username}
          size={36}
          status={post.author.status}
          showStatus
        />
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: colors.foreground }]}>
            {post.author.displayName || post.author.username}
          </Text>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
            {timeAgo(post.createdAt)}
          </Text>
        </View>

        <View
          style={[styles.gameBadge, { backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.gameText, { color: colors.foreground }]} numberOfLines={1}>
            {post.game}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text
        style={[styles.description, { color: colors.foreground }]}
        numberOfLines={3}
      >
        {post.description}
      </Text>

      {/* Tags row */}
      <View style={styles.tagsRow}>
        <View style={[styles.tag, { borderColor: colors.border }]}>
          <Feather name="users" size={11} color={colors.mutedForeground} />
          <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
            {post.neededPlayers} لاعبين
          </Text>
        </View>

        {post.micRequired && (
          <View style={[styles.tag, { borderColor: colors.border }]}>
            <Feather name="mic" size={11} color={colors.mutedForeground} />
            <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
              ميكروفون
            </Text>
          </View>
        )}

        {post.rank && (
          <View style={[styles.tag, { borderColor: colors.border }]}>
            <Feather name="award" size={11} color={colors.mutedForeground} />
            <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
              {post.rank}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.responseCount, { color: colors.mutedForeground }]}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>
            {post.responseCount}
          </Text>{' '}
          مستجيب
        </Text>

        {post.status === 'open' && (
          <Pressable
            onPress={handleRespond}
            disabled={post.viewerHasResponded || isResponding}
            style={({ pressed }) => [
              styles.respondBtn,
              {
                backgroundColor: post.viewerHasResponded
                  ? colors.muted
                  : colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID={`lfg-respond-${post.id}`}
          >
            {isResponding ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : post.viewerHasResponded ? (
              <>
                <Feather name="check" size={13} color={colors.mutedForeground} />
                <Text style={[styles.respondText, { color: colors.mutedForeground }]}>
                  تم الانضمام
                </Text>
              </>
            ) : (
              <>
                <Feather name="zap" size={13} color={colors.primaryForeground} />
                <Text style={[styles.respondText, { color: colors.primaryForeground }]}>
                  انضم
                </Text>
              </>
            )}
          </Pressable>
        )}

        {post.status === 'closed' && (
          <View style={[styles.closedBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.closedText, { color: colors.mutedForeground }]}>
              مغلق
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
  },
  gameBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 100,
  },
  gameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: {
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  responseCount: {
    fontSize: 13,
  },
  respondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    justifyContent: 'center',
  },
  respondText: {
    fontSize: 13,
    fontWeight: '700',
  },
  closedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  closedText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
