import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { BarChart2, MessageSquare, Users, Gamepad2, Camera, Zap, Crown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { TierBadge } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";

interface Stats {
  totalLfgPosts: number;
  totalLfgResponses: number;
  totalFriends: number;
  totalMessages: number;
  totalPhotos: number;
  memberSince: string;
  isPro: boolean;
  xpProgress: {
    totalXp: number;
    level: number;
    tier: string;
    tierLevel: number;
    xpIntoLevel: number;
    xpForNext: number;
  };
}

export default function StatsPage() {
  const { t } = useTranslation("stats");
  const { data: me } = useGetMe();

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["stats", "me"],
    queryFn: () => customFetch("/api/stats/me"),
    enabled: !!me,
  });

  const { data: weeklyRaw } = useQuery<{ lfgPosts: number[]; lfgResponses: number[]; messages: number[] }>({
    queryKey: ["stats", "me", "weekly"],
    queryFn: () => customFetch("/api/stats/me/weekly"),
    enabled: !!me,
  });

  if (isLoading || !me || !stats) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="border-b border-border pb-4 mb-8">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const memberDate = new Date(stats.memberSince);
  const nowMs = Date.now();
  const memberDays = Math.floor((nowMs - memberDate.getTime()) / (1000 * 60 * 60 * 24));

  // Localised day names from translation file
  const days: string[] = t("days", { returnObjects: true }) as string[];
  const weeklyData = days.map((day, i) => ({
    day,
    lfgPosts:    weeklyRaw?.lfgPosts[i]    ?? 0,
    lfgResponses: weeklyRaw?.lfgResponses[i] ?? 0,
    messages:    weeklyRaw?.messages[i]    ?? 0,
  }));

  const statCards = [
    { label: t("cards.lfgPosts"),     value: stats.totalLfgPosts,      icon: Gamepad2,      color: "text-primary" },
    { label: t("cards.lfgResponses"), value: stats.totalLfgResponses,   icon: Zap,           color: "text-yellow-400" },
    { label: t("cards.friends"),      value: stats.totalFriends,        icon: Users,         color: "text-blue-400" },
    { label: t("cards.messages"),     value: stats.totalMessages,       icon: MessageSquare, color: "text-green-400" },
    { label: t("cards.photos"),       value: stats.totalPhotos,         icon: Camera,        color: "text-purple-400" },
    { label: t("cards.memberDays"),   value: memberDays,                icon: Crown,         color: "text-orange-400" },
  ];

  const xpPct = stats.xpProgress.xpForNext > 0
    ? Math.round((stats.xpProgress.xpIntoLevel / stats.xpProgress.xpForNext) * 100)
    : 100;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-border pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-primary" />
            {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
            {t("subtitle", { date: memberDate.toLocaleDateString() })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats.isPro && <ProBadge size="icon" />}
          <TierBadge tier={stats.xpProgress.tier as any} level={stats.xpProgress.tierLevel} xpIntoLevel={stats.xpProgress.xpIntoLevel ?? 0} xpForNext={stats.xpProgress.xpForNext ?? 100} size="sm" showXpBar={false} />
        </div>
      </div>

      {/* XP Bar */}
      <div className="bg-card border border-border p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs uppercase text-muted-foreground tracking-widest">
            {t("level", { level: stats.xpProgress.level, tier: stats.xpProgress.tier })}
          </span>
          <span className="font-mono text-xs text-primary">
            {stats.xpProgress.xpIntoLevel.toLocaleString()} / {stats.xpProgress.xpForNext.toLocaleString()} XP
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700"
            style={{ width: `${xpPct}%` }}
          />
        </div>
        <p className="font-mono text-3xl font-bold text-primary mt-4 tracking-tight">
          {stats.xpProgress.totalXp.toLocaleString()} <span className="text-sm text-muted-foreground">XP</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{label}</span>
            </div>
            <span className="font-mono text-3xl font-bold">{value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Weekly Activity — visible for all users */}
      <div className="bg-card border border-border p-6 space-y-4">
        <h2 className="font-mono text-sm uppercase text-primary tracking-widest flex items-center gap-2">
          <Crown className="w-4 h-4" />
          {t("weeklyActivity")}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={14}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, fontFamily: "monospace", fontSize: 12 }}
              cursor={{ fill: "hsl(var(--muted)/0.3)" }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  lfgPosts: t("legend.lfgPosts"),
                  lfgResponses: t("legend.lfgResponses"),
                  messages: t("legend.messages"),
                };
                return [value, labels[name] ?? name];
              }}
            />
            <Legend
              iconType="square"
              iconSize={8}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  lfgPosts: t("legend.lfgPosts"),
                  lfgResponses: t("legend.lfgResponses"),
                  messages: t("legend.messages"),
                };
                return <span style={{ fontFamily: "monospace", fontSize: 10 }}>{labels[value] ?? value}</span>;
              }}
            />
            <Bar dataKey="lfgPosts"    stackId="a" fill="hsl(var(--primary))"        radius={0} />
            <Bar dataKey="lfgResponses" stackId="a" fill="hsl(48 96% 53%)"           radius={0} />
            <Bar dataKey="messages"    stackId="a" fill="hsl(142 71% 45%)"           radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        {!stats.isPro && (
          <p className="font-mono text-xs text-muted-foreground border-t border-border pt-3 flex items-center gap-2">
            <Crown className="w-3 h-3 text-primary flex-shrink-0" />
            {t("upgradeDesc")}
          </p>
        )}
      </div>
    </div>
  );
}
