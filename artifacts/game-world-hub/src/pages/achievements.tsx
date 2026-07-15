import {
  useGetPlayerProgress,
  getGetPlayerProgressQueryKey,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  Trophy,
  UserPlus,
  Users,
  Crown,
  Swords,
  MessageSquare,
  Radar,
  Handshake,
  Gamepad2,
  Link2,
  Shield,
  Zap,
  Lock,
  Check,
  type LucideIcon,
} from "lucide-react";
import { TierBadge, DivisionBadge, type TierName } from "@/components/tier-badge";

const ICONS: Record<string, LucideIcon> = {
  UserPlus,
  Users,
  Crown,
  Swords,
  MessageSquare,
  Radar,
  Handshake,
  Gamepad2,
  Link2,
  Shield,
  Trophy,
};

const STAT_KEYS = new Set([
  "friends",
  "partiesCreated",
  "partiesJoined",
  "messagesSent",
  "lfgPosts",
  "lfgResponses",
  "games",
  "platforms",
]);

export default function Achievements() {
  const { t } = useTranslation("ranks");
  const { data, isLoading } = useGetPlayerProgress({
    query: { refetchInterval: 15000, queryKey: getGetPlayerProgressQueryKey() },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="py-12 text-center font-mono text-sm text-muted-foreground">
          {t("computing")}
        </div>
      </div>
    );
  }

  const pct = data.xpForNext > 0 ? Math.min(100, Math.round((data.xpIntoLevel / data.xpForNext) * 100)) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Trophy className="w-7 h-7 text-primary" /> {t("title")}
        </h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">
          {t("progression", { unlocked: data.unlockedCount, total: data.totalCount })}
        </p>
      </div>

      {/* Rank + XP */}
      <div className="bg-card border border-border">
        <div className="flex flex-col lg:flex-row">
          <div className="flex items-center gap-6 p-6 border-b lg:border-b-0 lg:border-e border-border">
            <TierBadge
              tier={data.rank as TierName}
              level={data.level}
              xpIntoLevel={data.xpIntoLevel}
              xpForNext={data.xpForNext}
              size="md"
              showXpBar={false}
            />
            <DivisionBadge
              tier={data.rank as TierName}
              level={data.level}
              size="md"
            />
            <div className="hidden sm:block">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{t("rank")}</div>
              <div className="text-2xl font-bold font-mono uppercase tracking-wider text-foreground">
                {t(`rankTitles.${data.rank}`, { defaultValue: data.rank })}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs font-mono text-primary">
                <Zap className="w-3 h-3" /> {t("totalXp", { xp: data.totalXp.toLocaleString("en-US") })}
              </div>
            </div>
          </div>

          <div className="flex-1 p-6 flex flex-col justify-center">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-muted-foreground mb-2">
              <span>{t("level", { level: data.level })}</span>
              <span>{t("xpProgress", { into: data.xpIntoLevel, forNext: data.xpForNext })}</span>
            </div>
            <div className="h-3 bg-muted border border-border overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-[11px] font-mono text-muted-foreground">
              {t("xpToNext", { xp: data.xpForNext - data.xpIntoLevel, level: data.level + 1 })}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
        {Object.entries(data.stats).map(([key, value]) => (
          <div key={key} className="bg-card p-4">
            <div className="text-2xl font-bold font-mono text-foreground">{value}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
              {STAT_KEYS.has(key) ? t(`stats.${key}`) : key}
            </div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">{t("achievements")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.achievements.map((a) => {
            const Icon = ICONS[a.icon] ?? Trophy;
            const progress = a.target > 0 ? Math.min(100, Math.round((a.current / a.target) * 100)) : 0;
            return (
              <div
                key={a.id}
                className={`border p-4 flex gap-4 transition-colors ${
                  a.unlocked ? "border-primary/60 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div
                  className={`w-12 h-12 shrink-0 flex items-center justify-center border ${
                    a.unlocked ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {a.unlocked ? <Icon className="w-6 h-6" /> : <Lock className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold font-mono uppercase text-sm truncate ${a.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                      {t(`defs.${a.id}.name`, { defaultValue: a.name })}
                    </span>
                    {a.unlocked && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t(`defs.${a.id}.description`, { defaultValue: a.description })}</p>
                  {!a.unlocked && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-muted border border-border overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        {a.current} / {a.target}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
