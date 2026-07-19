import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  status?: 'online' | 'offline' | 'away' | 'busy' | string;
  showStatus?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  online: '#00ff40',
  away: '#f59e0b',
  busy: '#ef4444',
  offline: '#6b7280',
};

export function Avatar({
  uri,
  name = '?',
  size = 44,
  status = 'offline',
  showStatus = false,
}: AvatarProps) {
  const colors = useColors();
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const dotSize = size * 0.28;

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: colors.border,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.36, color: colors.mutedForeground },
            ]}
          >
            {initials}
          </Text>
        </View>
      )}

      {showStatus && (
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.offline,
              right: 0,
              bottom: 0,
              borderColor: '#080808',
              borderWidth: 2,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderWidth: 1,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  initials: {
    fontWeight: '600',
  },
  dot: {
    position: 'absolute',
  },
});
