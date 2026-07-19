import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface FactionData {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon_emoji: string;
  description: string;
  weekly_points: number;
  member_count: number;
  active_members: number;
}

interface FactionCardProps {
  faction: FactionData;
  rank: number;
  maxPoints: number;
  isMyFaction?: boolean;
}

export function FactionCard({
  faction,
  rank,
  maxPoints,
  isMyFaction,
}: FactionCardProps) {
  const colors = useColors();
  const progress = maxPoints > 0 ? faction.weekly_points / maxPoints : 0;

  const rankLabel = rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isMyFaction ? faction.color : colors.border,
          borderWidth: isMyFaction ? 1 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* Color accent strip */}
      <View
        style={[styles.accentStrip, { backgroundColor: faction.color }]}
      />

      <View style={styles.content}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.rankEmoji}>{rankLabel}</Text>
          <Text style={styles.iconEmoji}>{faction.icon_emoji}</Text>
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.foreground }]}>
                {faction.name}
              </Text>
              {isMyFaction && (
                <View style={[styles.myBadge, { backgroundColor: faction.color }]}>
                  <Text style={[styles.myText, { color: '#000' }]}>فصيلتك</Text>
                </View>
              )}
            </View>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {faction.description}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: faction.color }]}>
              {faction.weekly_points.toLocaleString()}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              نقطة هذا الأسبوع
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {faction.member_count}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              عضو
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {faction.active_members}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              نشط
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View
          style={[styles.progressTrack, { backgroundColor: colors.muted }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: faction.color,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  accentStrip: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rankEmoji: {
    fontSize: 20,
    lineHeight: 28,
  },
  iconEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  nameBlock: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  myBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  myText: {
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
  },
  progressTrack: {
    height: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
