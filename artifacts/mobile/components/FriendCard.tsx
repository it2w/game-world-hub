import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FriendEntry } from '@workspace/api-client-react';
import { Avatar } from '@/components/Avatar';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

interface FriendCardProps {
  entry: FriendEntry;
  onPress?: () => void;
}

export function FriendCard({ entry, onPress }: FriendCardProps) {
  const colors = useColors();
  const { friend } = entry;
  const isOnline = friend.status === 'online' || friend.status === 'away' || friend.status === 'busy';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      testID={`friend-card-${friend.id}`}
    >
      <Avatar
        uri={friend.avatarUrl}
        name={friend.displayName || friend.username}
        size={44}
        status={friend.status}
        showStatus
      />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.displayName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {friend.displayName || friend.username}
          </Text>
          {(friend as { isPro?: boolean }).isPro && (
            <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.proText, { color: colors.primaryForeground }]}>PRO</Text>
            </View>
          )}
        </View>

        {friend.currentGame ? (
          <View style={styles.gameRow}>
            <Feather name="play" size={11} color={colors.primary} />
            <Text
              style={[styles.gameText, { color: colors.primary }]}
              numberOfLines={1}
            >
              {friend.currentGame}
            </Text>
          </View>
        ) : (
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {friend.status === 'away'
              ? 'عائد قريباً'
              : friend.status === 'busy'
              ? 'مشغول'
              : isOnline
              ? 'متصل'
              : 'غير متصل'}
          </Text>
        )}
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  proBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  proText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gameText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 12,
  },
});
