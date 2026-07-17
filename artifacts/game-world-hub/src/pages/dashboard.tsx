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
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Activity, Users, Play, Phone, MessageSquare, ShieldOff, Loader2, Check, X } from "lucide-react";
import { TierPip } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useAcceptPartyInvite, useDeclinePartyInvite } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useVoice } from "@/voice/voice-context";

export default function Dashboard() {
  const { t } = useTranslation("dashboard");
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [, navigate] = useLocation();
  const { callUser, activeRoom } = useVoice();

  const [openingDm, setOpeningDm] = useState<number | null>(null);
  const [blocking, setBlocking] = useState<number | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<number | null>(null);

  const blockUser = useBlockUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const openDm = async (e: React.MouseEvent, friendId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (openingDm) return;
    setOpeningDm(friendId);
    try {
      const conv = await customFetch<{ id: number }>(`/api/conversations/direct/${friendId}`);
      navigate(`/chat/${conv.id}`);
    } finally {
      setOpeningDm(null);
    }
  };

  const handleBlock = (e: React.MouseEvent, userId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmBlock(userId);
  };

  const confirmBlockUser = (e: React.MouseEvent, userId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setBlocking(userId);
    setConfirmBlock(null);
    blockUser.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: t("network.blocked") });
        queryClient.invalidateQueries({ queryKey: getGetOnlineFriendsSummaryQueryKey() });
      },
      onSettled: () => setBlocking(null),
    });
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

  const acceptInvite = useAcceptPartyInvite();
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPartyInvitesQueryKey() });
      }
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* header */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">{t("header.title")}</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.status", { status: me?.status })}</p>
        </div>
        <div className="flex gap-4">
          <Button asChild variant="outline" className="font-mono rounded-none border-border">
            <Link href="/parties">{t("header.browseParties")}</Link>
          </Button>
          <Button asChild className="font-mono rounded-none">
            <Link href="/parties">{t("header.createParty")}</Link>
          </Button>
        </div>
      </div>

      {/* party invites */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ONLINE NETWORK */}
        <div className="col-span-2 space-y-6">
          <div className="border border-border bg-card">
            {/* section header */}
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex justify-between items-center">
              <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> {t("network.title")}
              </h2>
              <span className="font-mono text-xs text-primary">{t("network.active", { count: friendsSummary?.onlineCount || 0 })}</span>
            </div>

            <div className="p-4">
              {loadingFriends ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-[140px] rounded-none bg-muted" />)}
                </div>
              ) : friendsSummary?.friends.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground font-mono text-sm">
                  {t("network.empty")}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {friendsSummary?.friends.map(entry => {
                    const f = entry.friend;
                    const isConfirmingBlock = confirmBlock === f.id;
                    return (
                      <div
                        key={entry.id}
                        className="group relative flex flex-col border border-border bg-background hover:border-primary/40 transition-all duration-200 overflow-hidden"
                      >
                        {/* profile link area */}
                        <Link href={`/profile/${f.id}`} className="flex flex-col flex-1">
                          {/* banner */}
                          <div className="relative h-[60px] overflow-hidden shrink-0">
                            {(f as any).bannerUrl ? (
                              <img src={(f as any).bannerUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full"
                                style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.18) 0%, hsl(var(--primary)/0.04) 100%)" }}
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                            {f.isPro && (
                              <div className="absolute top-1.5 end-1.5">
                                <ProBadge size="sm" />
                              </div>
                            )}
                          </div>

                          {/* avatar — overlaps banner */}
                          <div className="px-3 -mt-5">
                            <div className="relative inline-block">
                              {f.avatarUrl ? (
                                <img
                                  src={f.avatarUrl}
                                  alt=""
                                  className="w-10 h-10 object-cover rounded-full ring-[3px] ring-background border border-border/50"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full ring-[3px] ring-background border border-border/50 bg-muted flex items-center justify-center font-mono font-bold text-sm">
                                  {f.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <StatusBadge status={f.status} className="absolute -bottom-0.5 -end-0.5 scale-90" />
                            </div>
                          </div>

                          {/* info */}
                          <div className="px-3 pb-3 pt-1.5">
                            <div className="font-bold text-sm truncate leading-tight">{f.displayName}</div>
                            {f.currentGame ? (
                              <div className="text-[10px] text-primary font-mono truncate flex items-center gap-1 mt-1">
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

                        {/* action bar */}
                        {isConfirmingBlock ? (
                          /* block confirm */
                          <div className="flex items-center border-t border-border bg-destructive/10">
                            <span className="flex-1 text-[10px] text-destructive font-mono px-2 leading-tight">
                              {t("network.confirmBlock")}
                            </span>
                            <button
                              className="p-2 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors border-s border-border"
                              onClick={(e) => confirmBlockUser(e, f.id)}
                              title={t("network.blockConfirmYes")}
                            >
                              {blocking === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              className="p-2 text-muted-foreground hover:text-foreground transition-colors border-s border-border"
                              onClick={(e) => { e.stopPropagation(); setConfirmBlock(null); }}
                              title={t("network.blockConfirmNo")}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex border-t border-border">
                            {/* voice call */}
                            <button
                              className="flex-1 flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-e border-border"
                              title={activeRoom ? t("network.leaveFirst") : t("network.call")}
                              disabled={!!activeRoom}
                              onClick={(e) => {
                                e.preventDefault();
                                callUser({ userId: f.id, username: f.username, displayName: f.displayName, avatarUrl: f.avatarUrl ?? null });
                              }}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span className="text-[9px] font-mono uppercase tracking-wider">{t("network.call")}</span>
                            </button>
                            {/* DM */}
                            <button
                              className="flex-1 flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-e border-border"
                              title={t("network.openChat")}
                              onClick={(e) => openDm(e, f.id)}
                              disabled={openingDm === f.id}
                            >
                              {openingDm === f.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <MessageSquare className="w-3.5 h-3.5" />
                              }
                              <span className="text-[9px] font-mono uppercase tracking-wider">{t("network.chat")}</span>
                            </button>
                            {/* block */}
                            <button
                              className="flex-1 flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                              title={t("network.block")}
                              onClick={(e) => handleBlock(e, f.id)}
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                              <span className="text-[9px] font-mono uppercase tracking-wider">{t("network.block")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* activity feed */}
        <div className="space-y-6">
          <div className="border border-border bg-card">
            <div className="p-3 border-b border-border bg-muted/30">
              <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> {t("activity.title")}
              </h2>
            </div>
            <div className="p-0">
              {loadingActivity ? (
                <div className="p-4 space-y-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-none bg-muted" />)}
                </div>
              ) : partyActivity?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground font-mono text-xs">{t("activity.empty")}</div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {partyActivity?.slice(0, 10).map(activity => (
                    <div key={activity.id} className="p-3 text-sm flex gap-3 hover:bg-muted/10 transition-colors">
                      <div className="w-8 h-8 shrink-0 bg-muted flex items-center justify-center border border-border font-mono text-xs text-muted-foreground">
                        {activity.actor.displayName.charAt(0)}
                      </div>
                      <div className="flex-1 flex flex-col justify-center">
                        <div className="leading-tight">
                          <span className="font-bold text-foreground">{activity.actor.displayName}</span>
                          <span className="text-muted-foreground mx-1">
                            {activity.action === 'created' ? t("activity.created") :
                             activity.action === 'joined' ? t("activity.joined") :
                             activity.action === 'left' ? t("activity.left") : t("activity.invited")}
                          </span>
                          <Link href={`/party/${activity.party.id}`} className="text-primary hover:underline font-mono">
                            {activity.party.name}
                          </Link>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-1">
                          {new Date(activity.createdAt).toLocaleTimeString(i18n.language)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
