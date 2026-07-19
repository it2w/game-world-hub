import React, { useState } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { LFGCard } from '@/components/LFGCard';
import { Feather } from '@expo/vector-icons';
import {
  useListLfgPosts,
  useRespondToLfgPost,
  type LfgPost,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const GAME_FILTERS = ['الكل', 'Valorant', 'CS2', 'COD', 'Apex', 'PUBG'];

export default function LFGScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [selectedGame, setSelectedGame] = useState<string>('الكل');
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const { data: posts, isLoading, isError, refetch } = useListLfgPosts(
    selectedGame !== 'الكل' ? { game: selectedGame } : {},
  );

  const respondMutation = useRespondToLfgPost({
    mutation: {
      onMutate: ({ postId }) => {
        setRespondingId(postId);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['/api/lfg'] });
      },
      onSettled: () => {
        setRespondingId(null);
      },
    },
  });

  const handleRespond = (postId: number) => {
    respondMutation.mutate({ postId, data: { message: '' } });
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          LFG
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          ابحث عن فريق
        </Text>
      </View>

      {/* Game filter chips */}
      <FlatList
        data={GAME_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.filters}
        renderItem={({ item }) => {
          const active = selectedGame === item;
          return (
            <Pressable
              onPress={() => setSelectedGame(item)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: active ? colors.primaryForeground : colors.mutedForeground,
                    fontWeight: active ? '700' : '400',
                  },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Posts list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            تعذّر تحميل المنشورات
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.retryText, { color: colors.foreground }]}>
              إعادة المحاولة
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<LfgPost>
          data={posts ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <LFGCard
              post={item}
              onRespond={handleRespond}
              isResponding={respondingId === item.id}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 84 : 80) },
          ]}
          scrollEnabled={!!(posts && posts.length > 0)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                لا توجد منشورات
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                لم يُنشر أحد بحثاً عن فريق بعد
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 13,
  },
  filters: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
  },
  listContent: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
  },
});
