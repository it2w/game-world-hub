import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { useColors } from '@/hooks/useColors';

export interface RankingEntry {
  rank: number;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPro: boolean;
  totalXp: number;
  faction: { slug: string; color: string; emoji: string } | null;
  isMe: boolean;
}

interface RankingRowProps {
  entry: RankingEntry;
}

const RANK_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
};

export function RankingRow({ entry }: RankingRowProps) {
  const colors = useColors();
  const rankColor = RANK_COLORS[entry.rank] ?? colors.mutedForeground;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: entry.isMe ? '#0f0f0f' : 'transparent',
          borderColor: entry.isMe ? colors.primary : colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* Rank */}
      <Text style={[styles.rank, { color: rankColor, minWidth: 32 }]}>
        {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
      </Text>

      {/* Avatar */}
      <Avatar
        uri={entry.avatarUrl}
        name={entry.displayName || entry.username}
        size={36}
      />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.displayName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {entry.displayName || entry.username}
          </Text>
          {entry.isPro && (
            <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.proText, { color: '#000' }]}>PRO</Text>
            </View>
          )}
          {entry.isMe && (
            <Text style={[styles.meLabel, { color: colors.primary }]}>أنت</Text>
          )}
        </View>
        {entry.faction && (
          <View style={styles.factionRow}>
            <Text style={styles.factionEmoji}>{entry.faction.emoji}</Text>
            <Text style={[styles.factionSlug, { color: entry.faction.color }]}>
              {entry.faction.slug}
            </Text>
          </View>
        )}
      </View>

      {/* XP */}
      <Text style={[styles.xp, { color: colors.mutedForeground }]}>
        {entry.totalXp.toLocaleString()}
        <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}> XP</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
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
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  proText: {
    fontSize: 9,
    fontWeight: '700',
  },
  meLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  factionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  factionEmoji: {
    fontSize: 12,
  },
  factionSlug: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  xp: {
    fontSize: 13,
    fontWeight: '600',
  },
  xpLabel: {
    fontSize: 10,
  },
});
