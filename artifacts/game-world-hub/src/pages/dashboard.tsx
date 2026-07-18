import {
  useGetOnlineFriendsSummary,
  useGetPartyActivityFeed,
  useListPartyInvites,
  useGetMe,
  getListPartyInvitesQueryKey,
  getGetOnlineFriendsSummaryQueryKey,
  getGetPartyActivityFeedQueryKey,
  getGetMeQueryKey,
  customFetch,
  useBlockUser,
  useListLfgPosts,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import {
  Activity, Users, Play, Phone, MessageSquare, ShieldOff,
  Loader2, Check, X, Swords, Radio, Trophy, Star, Zap,
  Crown, TrendingUp, Target, Clock,
} from "lucide-react";
import { TierPip } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";
import { useState, useEffect, useRef } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useAcceptPartyInvite, useDeclinePartyInvite } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useVoice } from "@/voice/voice-context";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface StatsMe {
  totalLfgPosts: number;
  totalLfgResponses: number;
  totalFriends: number;
  totalMessages: number;
  isPro: boolean;
  xpProgress: { level: number; xpIntoLevel: number; xpForNext: number; totalXp: number };
}

interface Challenge {
  id: number;
  title: string;
  description: string;
  progress: number;
  goal: number;
  xpReward: number;
  status: string;
  expiresAt: string;
}

// ── Live Ticker ────────────────────────────────────────────────────────────────
function LiveTicker({ events }: { events: string[] }) {
  const [offset, setOffset] = useState(0);
  const text = events.join("   ◆   ");
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!events.length) return;
    let pos = 0;
    const tick = () => {
      pos = (pos + 0.6) % (text.length * 7.5);
      setOffset(pos);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current!);
  }, [text]);

  if (!events.length) return null;

  return (
    <div className="flex items-center h-8 bg-card border-b border-border overflow-hidden shrink-0">
      <div className="shrink-0 flex items-center gap-1.5 bg-primary text-primary-foreground text-[9px] font-mono font-black tracking-[2px] px-3 h-full">
        <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" />
        LIVE
      </div>
      <div className="flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)" }}>
        <div className="flex items-center whitespace-nowrap" style={{ transform: `translateX(-${offset}px)` }}>
          {[...events, ...events].map((e, i) => (
            <span key={i} className="text-[11px] font-mono text-muted-foreground inline-flex items-center">
              {e}
              <span className="mx-4 text-border">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── XP Bar ─────────────────────────────────────────────────────────────────────
function XpBar({ me }: { me: ReturnType<typeof useGetMe>["data"] }) {
  if (!me) return null;
  const pct = me.xpForNext > 0 ? Math.round((me.xpIntoLevel / me.xpForNext) * 100) : 0;

  return (
    <div className="min-w-[200px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-mono font-black text-primary tracking-[2px]">LVL {me.tierLevel ?? 1}</span>
        <span className="text-[9px] font-mono text-muted-foreground">
          {(me.xpIntoLevel ?? 0).toLocaleString()} / {(me.xpForNext ?? 1000).toLocaleString()} XP
        </span>
      </div>
      <div className="relative h-1.5 bg-muted border border-border overflow-hidden">
        <div
          className="absolute inset-y-0 start-0 bg-primary transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Stat Chip ──────────────────────────────────────────────────────────────────
function StatChip({ icon: Icon, value, label, color = "text-primary" }: {
  icon: React.ElementType; value: string | number; label: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-card border border-border px-3 py-2 min-w-[90px]">
      <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
      <div>
        <div className={cn("text-base font-black font-mono leading-none tracking-tight", color)}>{value}</div>
        <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Friend Card ────────────────────────────────────────────────────────────────
function FriendCard({
  entry, onCall, onDm, onBlock, openingDm, blocking, confirmBlock,
  onConfirmBlock, onCancelBlock, activeRoom,
}: {
  entry: any;
  onCall: () => void;
  onDm: (e: React.MouseEvent) => void;
  onBlock: (e: React.MouseEvent) => void;
  openingDm: boolean;
  blocking: boolean;
  confirmBlock: boolean;
  onConfirmBlock: (e: React.MouseEvent) => void;
  onCancelBlock: () => void;
  activeRoom: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const f = entry.friend;
  const frameColor = (f as any).profileFrameColor;

  return (
    <div
      className="group relative flex flex-col border border-border bg-card hover:border-primary/40 transition-all duration-200"
      style={frameColor ? { borderColor: `${frameColor}55` } : {}}
    >
      <Link href={`/profile/${f.id}`} className="flex flex-col flex-1">
        {/* banner */}
        <div className="relative h-14 overflow-hidden shrink-0">
          {(f as any).profileBgUrl ? (
            <img src={(f as any).profileBgUrl} alt="" className="w-full h-full object-cover" />
          ) : (f as any).bannerUrl ? (
            <img src={(f as any).bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: frameColor
                  ? `linear-gradient(135deg, ${frameColor}33 0%, ${frameColor}08 100%)`
                  : "linear-gradient(135deg, hsl(var(--primary)/0.15) 0%, hsl(var(--primary)/0.03) 100%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        </div>

        {/* avatar */}
        <div className="flex justify-center -mt-6 mb-2">
          <div className="relative">
            {f.avatarUrl ? (
              <img
                src={f.avatarUrl}
                alt={f.displayName}
                className="w-12 h-12 rounded-full object-cover ring-[3px] ring-card border-2"
                style={{ borderColor: frameColor ?? "hsl(var(--border))" }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full ring-[3px] ring-card border-2 bg-muted flex items-center justify-center font-mono font-bold text-lg"
                style={{ borderColor: frameColor ?? "hsl(var(--border))" }}
              >
                {f.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <StatusBadge status={f.status} className="absolute -bottom-0.5 -end-0.5" />
          </div>
        </div>

        {/* info */}
        <div className="px-2 pb-3 text-center">
          <div className="flex items-center justify-center gap-1 min-w-0">
            <TierPip tier={f.tier} />
            <span className="font-bold text-sm truncate leading-tight">{f.displayName}</span>
            {f.isPro && <ProBadge size="icon" />}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">@{f.username}</div>
          {f.currentGame ? (
            <div className="text-[10px] text-primary font-mono truncate flex items-center justify-center gap-1 mt-1">
              <Play className="w-2.5 h-2.5 fill-primary shrink-0" />
              {f.currentGame}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1 tracking-wider">
              {f.status}
            </div>
          )}
        </div>
      </Link>

      {/* actions */}
      {confirmBlock ? (
        <div className="flex items-center border-t border-border bg-destructive/10">
          <span className="flex-1 text-[10px] text-destructive font-mono px-2 leading-tight">
            {t("network.confirmBlock")}
          </span>
          <button
            className="p-2 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors border-s border-border"
            onClick={onConfirmBlock}
          >
            {blocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            className="p-2 text-muted-foreground hover:text-foreground transition-colors border-s border-border"
            onClick={(e) => { e.stopPropagation(); onCancelBlock(); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex border-t border-border">
          <button
            className="flex-1 flex items-center justify-center gap-1 py-2 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-30 border-e border-border text-[9px] font-mono uppercase tracking-wider"
            disabled={activeRoom}
            onClick={onCall}
          >
            <Phone className="w-3 h-3" /> {t("network.call")}
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 py-2 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-e border-border text-[9px] font-mono uppercase tracking-wider"
            onClick={onDm}
            disabled={openingDm}
          >
            {openingDm ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
            {t("network.chat")}
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors text-[9px] font-mono uppercase tracking-wider"
            onClick={onBlock}
          >
            <ShieldOff className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── LFG Suggestions ────────────────────────────────────────────────────────────
function LfgSuggestions() {
  const { t } = useTranslation("dashboard");
  const [responding, setResponding] = useState<number | null>(null);
  const [responded, setResponded] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data: suggestions, isLoading } = useQuery<any[]>({
    queryKey: ["lfg-suggestions"],
    queryFn: () => customFetch("/api/lfg/suggestions"),
    refetchInterval: 30000,
  });

  if (isLoading) return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="h-4 w-40 bg-muted animate-pulse" />
      </div>
      <div className="p-4 space-y-2">
        {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-none bg-muted" />)}
      </div>
    </div>
  );

  if (!suggestions?.length) return null;

  const respond = async (postId: number) => {
    setResponding(postId);
    try {
      await customFetch(`/api/lfg/${postId}/respond`, { method: "POST" });
      setResponded(prev => new Set([...prev, postId]));
      toast({ title: t("lfg.responded") });
    } catch {
      toast({ title: t("lfg.respondError"), variant: "destructive" });
    } finally {
      setResponding(null);
    }
  };

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
        <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" /> {t("lfg.title")}
        </h2>
        <Link href="/lfg" className="text-[10px] font-mono text-primary hover:underline uppercase tracking-wider">
          {t("lfg.viewAll")} →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {suggestions.slice(0, 4).map(post => {
          const isDone = responded.has(post.id) || post.viewerHasResponded;
          return (
            <div key={post.id} className="p-3 flex items-center gap-3 hover:bg-muted/10 transition-colors">
              {/* avatar */}
              <div className="shrink-0">
                {post.author.avatarUrl ? (
                  <img src={post.author.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center font-mono font-bold text-sm">
                    {post.author.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm truncate">{post.author.displayName}</span>
                  {post.author.isPro && <ProBadge size="icon" />}
                  <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5">{post.game}</span>
                  {post.rank && (
                    <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5">{post.rank}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{post.description}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {post.neededPlayers && (
                  <span className="text-[9px] font-mono text-muted-foreground">{post.neededPlayers}P</span>
                )}
                <Button
                  size="sm"
                  variant={isDone ? "outline" : "default"}
                  className="rounded-none font-mono text-[10px] h-7 px-3"
                  disabled={isDone || responding === post.id}
                  onClick={() => respond(post.id)}
                >
                  {responding === post.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isDone ? (
                    <><Check className="w-3 h-3 me-1" />{t("lfg.joined")}</>
                  ) : t("lfg.join")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Challenges Widget ──────────────────────────────────────────────────────────
function ChallengesWidget() {
  const { t } = useTranslation("dashboard");
  const { data: challenges, isLoading } = useQuery<Challenge[]>({
    queryKey: ["challenges-dashboard"],
    queryFn: () => customFetch("/api/challenges"),
    refetchInterval: 60000,
  });

  const active = challenges?.filter(c => c.status === "active").slice(0, 2) ?? [];

  if (isLoading) return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="h-4 w-36 bg-muted animate-pulse" />
      </div>
      <div className="p-4 space-y-2">
        {[1,2].map(i => <Skeleton key={i} className="h-12 rounded-none bg-muted" />)}
      </div>
    </div>
  );

  if (!active.length) return null;

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
        <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> {t("challenges.title")}
        </h2>
        <Link href="/challenges" className="text-[10px] font-mono text-primary hover:underline uppercase tracking-wider">
          {t("challenges.viewAll")} →
        </Link>
      </div>
      <div className="divide-y divide-border">
        {active.map(c => {
          const pct = Math.min(100, Math.round((c.progress / c.goal) * 100));
          return (
            <div key={c.id} className="p-3">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 me-2">
                  <div className="font-bold text-sm leading-tight truncate">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{c.description}</div>
                </div>
                <span className="text-[10px] font-mono text-primary font-bold shrink-0">+{c.xpReward} XP</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted border border-border overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{c.progress}/{c.goal}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stats Row ──────────────────────────────────────────────────────────────────
function StatsRow({ me, friendsCount }: { me: any; friendsCount: number }) {
  const { data: stats } = useQuery<StatsMe>({
    queryKey: ["stats-me-dash"],
    queryFn: () => customFetch("/api/stats/me"),
    staleTime: 60000,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <StatChip icon={Users}      value={friendsCount}              label="Online"   color="text-primary" />
      <StatChip icon={TrendingUp} value={stats?.totalLfgPosts ?? 0} label="LFG نشر"  color="text-sky-400" />
      <StatChip icon={Target}     value={stats?.totalFriends ?? 0}  label="أصدقاء"   color="text-violet-400" />
      <StatChip icon={Star}       value={me?.tier ?? "—"}           label="Tier"     color="text-amber-400" />
    </div>
  );
}

// ── Pro Card ───────────────────────────────────────────────────────────────────
function ProWidget({ me }: { me: any }) {
  const { t } = useTranslation("dashboard");
  if (!me?.isPro) return null;

  return (
    <div className="border border-amber-400/30 bg-card relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/5 to-transparent pointer-events-none" />
      <div className="px-4 py-3 border-b border-amber-400/20 flex items-center gap-2">
        <Crown className="w-4 h-4 text-amber-400" />
        <span className="font-mono text-sm font-black tracking-widest text-amber-400 uppercase">Pro Member</span>
        <span className="ms-auto text-[9px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5">ACTIVE</span>
      </div>
      <div className="p-3 flex flex-col gap-1.5 text-[11px] font-mono">
        <div className="flex justify-between text-muted-foreground">
          <span>🎙️ {t("pro.myRoom")}</span><span className="text-primary">{t("pro.active")}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>🤖 {t("pro.lfgBot")}</span><span className="text-primary">{t("pro.enabled")}</span>
        </div>
        <Link href="/pro" className="mt-2 block text-center border border-amber-400/30 text-amber-400 py-2 hover:bg-amber-400/10 transition-colors uppercase tracking-wider text-[10px]">
          {t("pro.manage")} →
        </Link>
      </div>
    </div>
  );
}

// ── Quick Dock ─────────────────────────────────────────────────────────────────
function QuickDock({ inviteCount }: { inviteCount: number }) {
  const { t } = useTranslation("dashboard");
  const ITEMS = [
    { icon: Swords,        label: t("dock.newParty"),   href: "/parties",    badge: null        },
    { icon: Radio,         label: t("dock.lfg"),         href: "/lfg",        badge: null        },
    { icon: Users,         label: t("dock.friends"),     href: "/friends",    badge: null        },
    { icon: MessageSquare, label: t("dock.messages"),    href: "/chat",       badge: null        },
    { icon: Trophy,        label: t("dock.challenges"),  href: "/challenges", badge: null        },
    { icon: Star,          label: t("dock.achievements"),href: "/achievements",badge: null       },
  ] as const;

  return (
    <div className="flex border-b border-border bg-card overflow-x-auto">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="relative flex items-center gap-2 px-4 py-3 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-e border-border text-[10px] font-mono uppercase tracking-wider whitespace-nowrap font-bold"
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
          {item.badge && (
            <span className="absolute top-1.5 end-1.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[7px] flex items-center justify-center font-black">
              {item.badge}
            </span>
          )}
        </Link>
      ))}
      {inviteCount > 0 && (
        <Link
          href="/parties"
          className="relative flex items-center gap-2 px-4 py-3 text-primary bg-primary/5 border-e border-border text-[10px] font-mono uppercase tracking-wider whitespace-nowrap font-bold"
        >
          <Activity className="w-3.5 h-3.5" />
          {t("dock.invites")}
          <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center font-black">
            {inviteCount}
          </span>
        </Link>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useTranslation("dashboard");
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [, navigate] = useLocation();
  const { callUser, activeRoom } = useVoice();

  const [openingDm, setOpeningDm]     = useState<number | null>(null);
  const [blocking, setBlocking]       = useState<number | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<number | null>(null);

  const blockUser   = useBlockUser();
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const openDm = async (e: React.MouseEvent, friendId: number) => {
    e.preventDefault(); e.stopPropagation();
    if (openingDm) return;
    setOpeningDm(friendId);
    try {
      const conv = await customFetch<{ id: number }>(`/api/conversations/direct/${friendId}`);
      navigate(`/chat/${conv.id}`);
    } finally { setOpeningDm(null); }
  };

  const { data: friendsSummary, isLoading: loadingFriends } = useGetOnlineFriendsSummary({
    query: { refetchInterval: 5000, queryKey: getGetOnlineFriendsSummaryQueryKey() }
  });

  const { data: partyActivity, isLoading: loadingActivity } = useGetPartyActivityFeed({
    query: { refetchInterval: 10000, queryKey: getGetPartyActivityFeedQueryKey() }
  });

  const { data: invites } = useListPartyInvites({
    query: { refetchInterval: 10000, queryKey: getListPartyInvitesQueryKey() }
  });

  const acceptInvite  = useAcceptPartyInvite();
  const declineInvite = useDeclinePartyInvite();

  const handleAcceptInvite = (inviteId: number) => {
    acceptInvite.mutate({ inviteId }, {
      onSuccess: () => {
        toast({ title: t("toasts.inviteAccepted") });
        queryClient.invalidateQueries({ queryKey: getListPartyInvitesQueryKey() });
      }
    });
  };

  const handleDeclineInvite = (inviteId: number) => {
    declineInvite.mutate({ inviteId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPartyInvitesQueryKey() })
    });
  };

  // ticker events from activity feed
  const tickerEvents = (partyActivity ?? []).slice(0, 8).map(a => {
    const action = a.action === "created" ? t("activity.created") :
                   a.action === "joined"  ? t("activity.joined")  :
                   a.action === "left"    ? t("activity.left")    : t("activity.invited");
    return `${a.actor.displayName} ${action} ${a.party.name}`;
  });

  // greeting
  const hour = new Date().getHours();
  const greeting = hour < 5  ? t("header.greetingNight") :
                   hour < 12 ? t("header.greetingMorning") :
                   hour < 17 ? t("header.greetingAfternoon") :
                               t("header.greetingEvening");

  const onlineCount = friendsSummary?.onlineCount ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <LiveTicker events={tickerEvents} />

      <div className="flex-1 overflow-y-auto">
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-border bg-card/50 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-[3px] uppercase mb-1">{greeting}</div>
            <h1 className="text-2xl font-black font-mono tracking-tighter uppercase leading-none">
              {me?.displayName ?? "—"}
              {me?.isPro && <ProBadge size="sm" className="ms-2 align-middle" />}
            </h1>
            <div className="mt-2">
              <XpBar me={me} />
            </div>
          </div>
          <StatsRow me={me} friendsCount={onlineCount} />
        </div>

        {/* ── Quick Dock ── */}
        <QuickDock inviteCount={invites?.length ?? 0} />

        <div className="p-6 space-y-6">
          {/* ── Party Invites ── */}
          {invites && invites.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 p-4">
              <h3 className="font-mono text-sm uppercase text-primary font-bold mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> {t("invites.title", { count: invites.length })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invites.map(invite => (
                  <div key={invite.id} className="bg-card border border-border p-3 flex flex-col gap-3">
                    <div>
                      <div className="font-bold">{invite.party.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{t("invites.invitedBy", { username: invite.invitedBy.username })}</div>
                      {invite.party.game && <div className="text-xs text-primary font-mono mt-1">[{invite.party.game}]</div>}
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Button size="sm" className="flex-1 rounded-none font-mono text-xs h-8" onClick={() => handleAcceptInvite(invite.id)} disabled={acceptInvite.isPending}>{t("invites.accept")}</Button>
                      <Button size="sm" variant="outline" className="flex-1 rounded-none font-mono text-xs h-8" onClick={() => handleDeclineInvite(invite.id)} disabled={declineInvite.isPending}>{t("invites.decline")}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: friends + LFG */}
            <div className="lg:col-span-2 space-y-6">
              {/* Friends */}
              <div className="border border-border bg-card">
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
                  <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> {t("network.title")}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-mono text-xs text-primary">{t("network.active", { count: onlineCount })}</span>
                  </div>
                </div>

                <div className="p-4">
                  {loadingFriends ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-[160px] rounded-none bg-muted" />)}
                    </div>
                  ) : !friendsSummary?.friends.length ? (
                    <div className="text-center py-10 text-muted-foreground font-mono text-sm">
                      {t("network.empty")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {friendsSummary.friends.map(entry => (
                        <FriendCard
                          key={entry.id}
                          entry={entry}
                          onCall={() => callUser({
                            userId: entry.friend.id,
                            username: entry.friend.username,
                            displayName: entry.friend.displayName,
                            avatarUrl: entry.friend.avatarUrl ?? null,
                          })}
                          onDm={(e) => openDm(e, entry.friend.id)}
                          onBlock={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmBlock(entry.friend.id); }}
                          openingDm={openingDm === entry.friend.id}
                          blocking={blocking === entry.friend.id}
                          confirmBlock={confirmBlock === entry.friend.id}
                          onConfirmBlock={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            setBlocking(entry.friend.id);
                            setConfirmBlock(null);
                            blockUser.mutate({ userId: entry.friend.id }, {
                              onSuccess: () => {
                                toast({ title: t("network.blocked") });
                                queryClient.invalidateQueries({ queryKey: getGetOnlineFriendsSummaryQueryKey() });
                              },
                              onSettled: () => setBlocking(null),
                            });
                          }}
                          onCancelBlock={() => setConfirmBlock(null)}
                          activeRoom={!!activeRoom}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* LFG Suggestions */}
              <LfgSuggestions />
            </div>

            {/* RIGHT: activity + challenges + pro */}
            <div className="space-y-4">
              {/* Challenges */}
              <ChallengesWidget />

              {/* Activity Feed */}
              <div className="border border-border bg-card">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> {t("activity.title")}
                  </h2>
                </div>
                <div>
                  {loadingActivity ? (
                    <div className="p-4 space-y-3">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-none bg-muted" />)}
                    </div>
                  ) : !partyActivity?.length ? (
                    <div className="p-4 text-center text-muted-foreground font-mono text-xs">{t("activity.empty")}</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-border">
                      {partyActivity.slice(0, 10).map(activity => (
                        <div key={activity.id} className="p-3 flex gap-3 hover:bg-muted/10 transition-colors">
                          <div className="shrink-0">
                            {activity.actor.avatarUrl ? (
                              <img src={activity.actor.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                            ) : (
                              <div className="w-8 h-8 bg-muted flex items-center justify-center border border-border font-mono text-xs text-muted-foreground">
                                {activity.actor.displayName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-center">
                            <div className="text-sm leading-tight">
                              <span className="font-bold">{activity.actor.displayName}</span>
                              <span className="text-muted-foreground mx-1 text-xs font-mono">
                                {activity.action === "created" ? t("activity.created") :
                                 activity.action === "joined"  ? t("activity.joined")  :
                                 activity.action === "left"    ? t("activity.left")    : t("activity.invited")}
                              </span>
                              <Link href={`/party/${activity.party.id}`} className="text-primary hover:underline font-mono text-xs">
                                {activity.party.name}
                              </Link>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {new Date(activity.createdAt).toLocaleTimeString(i18n.language)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pro Card */}
              <ProWidget me={me} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
