import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { Trophy, Crown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ProBadge } from "@/components/pro-badge";

interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface RankEntry {
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

interface RankingsResponse {
  season: { id: number } | null;
  total: number;
  rankings: RankEntry[];
}

interface Countdown {
  d: number;
  h: number;
  m: number;
  s: number;
  expired: boolean;
}

function useCountdown(endDate: string | null): Countdown {
  const [timeLeft, setTimeLeft] = useState<Countdown>({ d: 0, h: 0, m: 0, s: 0, expired: false });
  useEffect(() => {
    if (!endDate) return;
    const tick = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ d: 0, h: 0, m: 0, s: 0, expired: true }); return; }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endDate]);
  return timeLeft;
}

const RANK_COLORS: Record<number, string> = {
  1: "#fbbf24",
  2: "#94a3b8",
  3: "#c2703a",
};

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-bold font-mono text-lg">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-bold font-mono text-lg">🥈</span>;
  if (rank === 3) return <span className="font-bold font-mono text-lg">🥉</span>;
  return <span className="font-mono text-sm text-muted-foreground w-6 text-center">#{rank}</span>;
}

const LIMIT = 50;

export default function SeasonsPage() {
  const { t } = useTranslation("factions");
  const { data: me } = useGetMe();
  const [offset, setOffset] = useState(0);
  const [allEntries, setAllEntries] = useState<RankEntry[]>([]);

  const { data: season, isLoading: seasonLoading } = useQuery<Season | null>({
    queryKey: ["seasons-current"],
    queryFn: async (): Promise<Season | null> => {
      try { return await customFetch("/api/seasons/current"); }
      catch { return null; }
    },
    staleTime: 60_000,
  });

  const { data: rankings, isLoading: rankingsLoading } = useQuery<RankingsResponse>({
    queryKey: ["season-rankings", offset],
    queryFn: () => customFetch(`/api/seasons/current/rankings?limit=${LIMIT}&offset=${offset}`),
    staleTime: 30_000,
    enabled: !!season,
  });

  // Accumulate entries across pages
  useEffect(() => {
    if (!rankings?.rankings) return;
    if (offset === 0) {
      setAllEntries(rankings.rankings);
    } else {
      setAllEntries(prev => {
        const ids = new Set(prev.map(e => e.userId));
        return [...prev, ...rankings.rankings.filter(e => !ids.has(e.userId))];
      });
    }
  }, [rankings, offset]);

  const countdown = useCountdown(season?.endDate ?? null);
  const total = rankings?.total ?? 0;
  const hasMore = allEntries.length < total;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Trophy className="w-8 h-8 text-primary" />
          {t("seasons.title")}
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
          {t("seasons.subtitle")}
        </p>
      </div>

      {/* Current Season Card */}
      {seasonLoading ? (
        <div className="h-24 bg-card border border-border animate-pulse" />
      ) : season ? (
        <div className="bg-card border border-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("seasons.season")}</p>
            <p className="font-mono font-bold text-xl text-primary">{season.name}</p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">
              {new Date(season.startDate).toLocaleDateString()} → {new Date(season.endDate).toLocaleDateString()}
            </p>
          </div>
          {!countdown.expired && (
            <div className="text-end">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> {t("seasons.endsIn")}
              </p>
              <div className="flex items-center gap-1 font-mono font-bold text-primary justify-end mt-1">
                <span className="text-xl">{countdown.d}</span><span className="text-xs text-muted-foreground">{t("seasons.days")}</span>
                <span className="text-xl ml-1">{countdown.h}</span><span className="text-xs text-muted-foreground">{t("seasons.hours")}</span>
                <span className="text-xl ml-1">{countdown.m}</span><span className="text-xs text-muted-foreground">{t("seasons.minutes")}</span>
                <span className="text-xl ml-1">{countdown.s}</span><span className="text-xs text-muted-foreground">s</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border p-5 text-center font-mono text-muted-foreground">
          {t("seasons.noSeason")}
        </div>
      )}

      {/* Rankings table */}
      <div className="bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-5 py-3 flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" />
          <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            {total > 0 ? `${total.toLocaleString()} players` : "Leaderboard"}
          </span>
        </div>

        {rankingsLoading && allEntries.length === 0 ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-4 bg-muted animate-pulse rounded" />
                <div className="w-8 h-8 bg-muted animate-pulse rounded-full" />
                <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
                <div className="w-20 h-4 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allEntries.map((entry) => (
              <div
                key={entry.userId}
                className={`px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors ${entry.isMe ? "bg-primary/5 border-s-2 border-primary" : ""}`}
              >
                {/* Rank */}
                <div className="w-8 shrink-0 flex justify-center">
                  <RankMedal rank={entry.rank} />
                </div>

                {/* Avatar */}
                <Link href={`/profile/${entry.userId}`}>
                  <div className="w-9 h-9 shrink-0 rounded-sm overflow-hidden bg-muted border border-border cursor-pointer hover:opacity-80">
                    {entry.avatarUrl ? (
                      <img src={entry.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-mono text-sm text-muted-foreground">
                        {entry.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                </Link>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/profile/${entry.userId}`} className="font-mono text-sm font-bold hover:text-primary transition-colors truncate">
                      {entry.displayName}
                    </Link>
                    {entry.isPro && <ProBadge size="icon" className="w-3.5 h-3.5" />}
                    {entry.isMe && (
                      <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30">
                        {t("seasons.you")}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">@{entry.username}</p>
                </div>

                {/* Faction badge */}
                {entry.faction && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5 shrink-0"
                    style={{ backgroundColor: `${entry.faction.color}22`, borderColor: `${entry.faction.color}55`, color: entry.faction.color }}
                  >
                    {entry.faction.emoji} {entry.faction.slug}
                  </span>
                )}

                {/* XP */}
                <div className="text-right shrink-0">
                  <div
                    className="font-mono text-sm font-bold"
                    style={entry.rank <= 3 ? { color: RANK_COLORS[entry.rank] } : undefined}
                  >
                    {entry.totalXp.toLocaleString()}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">XP</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              size="sm"
              className="font-mono rounded-none text-xs"
              onClick={() => setOffset(o => o + LIMIT)}
              disabled={rankingsLoading}
            >
              {t("seasons.loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
