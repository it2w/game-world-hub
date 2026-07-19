import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { Star, Award, Calendar } from "lucide-react";
import { Link } from "wouter";
import { ProBadge } from "@/components/pro-badge";

interface HofEntry {
  rank: number;
  userId: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  totalXp: number;
  factionSlug: string | null;
}

interface HofSeason {
  season: { id: number; name: string; endDate: string };
  entries: HofEntry[];
}

const FACTION_COLORS: Record<string, string> = {
  shadows: "#7c3aed",
  titans: "#dc2626",
  ghosts: "#0891b2",
};

const FACTION_EMOJIS: Record<string, string> = {
  shadows: "👤",
  titans: "⚔️",
  ghosts: "👻",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-8 h-8 flex items-center justify-center text-xl font-bold bg-yellow-500/20 border border-yellow-500/40 shrink-0">
      🥇
    </div>
  );
  if (rank === 2) return (
    <div className="w-8 h-8 flex items-center justify-center text-xl font-bold bg-slate-500/20 border border-slate-500/40 shrink-0">
      🥈
    </div>
  );
  if (rank === 3) return (
    <div className="w-8 h-8 flex items-center justify-center text-xl font-bold bg-orange-700/20 border border-orange-700/40 shrink-0">
      🥉
    </div>
  );
  return (
    <div className="w-8 h-8 flex items-center justify-center font-mono text-xs text-muted-foreground bg-muted border border-border shrink-0">
      #{rank}
    </div>
  );
}

export default function HallOfFamePage() {
  const { t } = useTranslation("factions");

  const { data: seasons, isLoading } = useQuery<HofSeason[]>({
    queryKey: ["hall-of-fame"],
    queryFn: () => customFetch("/api/hall-of-fame"),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Award className="w-8 h-8 text-yellow-400" />
          {t("hof.title")}
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
          {t("hof.subtitle")}
        </p>
      </div>

      {/* No entries yet */}
      {!isLoading && (!seasons || seasons.length === 0) && (
        <div className="border border-dashed border-yellow-500/30 p-12 text-center space-y-3">
          <Star className="w-10 h-10 text-yellow-500/40 mx-auto" />
          <p className="font-mono text-sm text-muted-foreground">{t("hof.noEntries")}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-8">
          {[1, 2].map(i => (
            <div key={i} className="border border-border overflow-hidden">
              <div className="h-14 bg-muted animate-pulse" />
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted animate-pulse rounded" />
                    <div className="w-8 h-8 bg-muted animate-pulse rounded-full" />
                    <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
                    <div className="w-20 h-4 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Season Cards */}
      {seasons?.map((item, seasonIdx) => (
        <div key={item.season.id} className="border border-border overflow-hidden">

          {/* Season header */}
          <div className={`px-5 py-4 flex items-center justify-between ${seasonIdx === 0 ? "bg-yellow-500/5 border-b border-yellow-500/20" : "bg-card border-b border-border"}`}>
            <div className="flex items-center gap-3">
              {seasonIdx === 0 && <Star className="w-5 h-5 text-yellow-400" />}
              <div>
                <h2 className={`font-mono font-bold text-lg uppercase tracking-tight ${seasonIdx === 0 ? "text-yellow-400" : "text-foreground"}`}>
                  {item.season.name}
                </h2>
                <p className="font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  {t("hof.ended")} {new Date(item.season.endDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            {item.entries[0] && (
              <div className="text-end">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("hof.champion")}</p>
                <p className="font-mono font-bold text-sm text-primary">{item.entries[0].displayName}</p>
              </div>
            )}
          </div>

          {/* Entries */}
          <div className="divide-y divide-border">
            {item.entries.map((entry) => {
              const factionColor = entry.factionSlug ? FACTION_COLORS[entry.factionSlug] : null;
              const factionEmoji = entry.factionSlug ? FACTION_EMOJIS[entry.factionSlug] : null;

              return (
                <div
                  key={entry.userId}
                  className={`px-5 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors ${entry.rank === 1 ? "bg-yellow-500/5" : ""}`}
                >
                  <RankBadge rank={entry.rank} />

                  {/* Avatar */}
                  <Link href={`/profile/${entry.userId}`}>
                    <div className="w-9 h-9 shrink-0 overflow-hidden bg-muted border border-border cursor-pointer hover:opacity-80">
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
                      <Link href={`/profile/${entry.userId}`} className={`font-mono text-sm font-bold hover:text-primary transition-colors truncate ${entry.rank === 1 ? "text-yellow-400" : ""}`}>
                        {entry.displayName}
                      </Link>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">@{entry.username}</p>
                  </div>

                  {/* Faction */}
                  {factionColor && factionEmoji && entry.factionSlug && (
                    <span
                      className="hidden sm:inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5 shrink-0"
                      style={{ backgroundColor: `${factionColor}22`, borderColor: `${factionColor}55`, color: factionColor }}
                    >
                      {factionEmoji} {entry.factionSlug}
                    </span>
                  )}

                  {/* XP */}
                  <div className="text-right shrink-0">
                    <div className={`font-mono text-sm font-bold ${entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-slate-400" : entry.rank === 3 ? "text-orange-500" : ""}`}>
                      {entry.totalXp.toLocaleString()}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">XP</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
