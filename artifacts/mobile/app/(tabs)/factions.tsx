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
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { FactionCard, type FactionData } from '@/components/FactionCard';
import { RankingRow, type RankingEntry } from '@/components/RankingRow';
import { Feather } from '@expo/vector-icons';

interface RankingsResponse {
  season: { id: number } | null;
  total: number;
  rankings: RankingEntry[];
}

function useFactions() {
  return useQuery<FactionData[]>({
    queryKey: ['/api/factions'],
    queryFn: () => customFetch<FactionData[]>('/api/factions'),
    staleTime: 30_000,
  });
}

function useRankings() {
  return useQuery<RankingsResponse>({
    queryKey: ['/api/seasons/current/rankings'],
    queryFn: () =>
      customFetch<RankingsResponse>('/api/seasons/current/rankings?limit=50'),
    staleTime: 60_000,
  });
}

type Tab = 'war' | 'rankings';

export default function FactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('war');

  const {
    data: factions,
    isLoading: loadingFactions,
    isError: errorFactions,
    refetch: refetchFactions,
  } = useFactions();

  const {
    data: rankingsData,
    isLoading: loadingRankings,
    isError: errorRankings,
    refetch: refetchRankings,
  } = useRankings();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 84 : 80);

  const maxPoints = Math.max(
    ...(factions ?? []).map((f) => f.weekly_points),
    1,
  );

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
          الفصائل
        </Text>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { borderColor: colors.border }]}>
          {(['war', 'rankings'] as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor:
                    activeTab === tab ? colors.primary : 'transparent',
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather
                name={tab === 'war' ? 'shield' : 'bar-chart-2'}
                size={14}
                color={
                  activeTab === tab
                    ? colors.primaryForeground
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === tab
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    fontWeight: activeTab === tab ? '700' : '400',
                  },
                ]}
              >
                {tab === 'war' ? 'حرب الأسبوع' : 'ترتيب الموسم'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* War tab */}
      {activeTab === 'war' && (
        <>
          {loadingFactions ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : errorFactions ? (
            <View style={styles.center}>
              <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                تعذّر تحميل بيانات الفصائل
              </Text>
              <Pressable
                onPress={() => refetchFactions()}
                style={[styles.retryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.retryText, { color: colors.foreground }]}>
                  إعادة المحاولة
                </Text>
              </Pressable>
            </View>
          ) : (
            <FlatList<FactionData>
              data={factions ?? []}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item, index }) => (
                <FactionCard
                  faction={item}
                  rank={index + 1}
                  maxPoints={maxPoints}
                />
              )}
              refreshControl={
                <RefreshControl
                  refreshing={loadingFactions}
                  onRefresh={() => refetchFactions()}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
              ListHeaderComponent={
                <Text
                  style={[styles.sectionLabel, { color: colors.mutedForeground }]}
                >
                  نقاط هذا الأسبوع
                </Text>
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                    لا توجد فصائل بعد
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* Rankings tab */}
      {activeTab === 'rankings' && (
        <>
          {loadingRankings ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : errorRankings ? (
            <View style={styles.center}>
              <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                تعذّر تحميل الترتيب
              </Text>
              <Pressable
                onPress={() => refetchRankings()}
                style={[styles.retryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.retryText, { color: colors.foreground }]}>
                  إعادة المحاولة
                </Text>
              </Pressable>
            </View>
          ) : (
            <FlatList<RankingEntry>
              data={rankingsData?.rankings ?? []}
              keyExtractor={(item) => String(item.userId)}
              renderItem={({ item }) => <RankingRow entry={item} />}
              refreshControl={
                <RefreshControl
                  refreshing={loadingRankings}
                  onRefresh={() => refetchRankings()}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{ paddingBottom: bottomPad }}
              ListHeaderComponent={
                <View
                  style={[
                    styles.rankingsHeader,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    أفضل {rankingsData?.total ?? 0} لاعب هذا الموسم
                  </Text>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                    لا توجد بيانات بعد
                  </Text>
                </View>
              }
            />
          )}
        </>
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
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tabRow: {
    flexDirection: 'row',
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  rankingsHeader: {
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyBody: {
    fontSize: 13,
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
});
