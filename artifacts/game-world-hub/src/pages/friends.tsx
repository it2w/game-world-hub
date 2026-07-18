import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListFriends,
  useListFriendRequests,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useRejectFriendRequest,
  useRemoveFriend,
  useBlockUser,
  useSearchUsers,
  getListFriendsQueryKey,
  getListFriendRequestsQueryKey,
  getSearchUsersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { TierPip } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";
import { useVoice } from "@/voice/voice-context";
import {
  Search, UserPlus, Check, X, UserMinus, Play, Phone,
  MessageSquare, ShieldOff, Loader2, Users, UserCheck, Inbox,
} from "lucide-react";
import { Link } from "wouter";

export default function Friends() {
  const { t } = useTranslation("friends");
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "requests" | "search">("list");
  const [openingDm, setOpeningDm] = useState<number | null>(null);
  const [blocking, setBlocking] = useState<number | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<number | null>(null);

  const { data: friends } = useListFriends({ query: { queryKey: getListFriendsQueryKey() } });
  const { data: requests } = useListFriendRequests({ query: { queryKey: getListFriendRequestsQueryKey() } });
  const { data: searchResults, isFetching: isSearching } = useSearchUsers(
    { q: searchQuery },
    { query: { enabled: searchQuery.length >= 3, queryKey: getSearchUsersQueryKey({ q: searchQuery }) } }
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { callUser, activeRoom } = useVoice();

  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const rejectRequest = useRejectFriendRequest();
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();

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
        toast({ title: t("toasts.blocked") });
        queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
      },
      onSettled: () => setBlocking(null),
    });
  };

  const handleSendRequest = (userId: number) => {
    sendRequest.mutate({ data: { toUserId: userId } }, {
      onSuccess: () => {
        toast({ title: t("toasts.requestSent") });
        setSearchQuery("");
      }
    });
  };

  const handleAccept = (requestId: number) => {
    acceptRequest.mutate({ requestId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListFriendRequestsQueryKey() });
      }
    });
  };

  const handleReject = (requestId: number) => {
    rejectRequest.mutate({ requestId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFriendRequestsQueryKey() });
      }
    });
  };

  const handleRemove = (e: React.MouseEvent, friendId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t("confirm.removeFriend"))) {
      removeFriend.mutate({ friendId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
        }
      });
    }
  };

  const sortedFriends = friends ? [...friends].sort((a, b) => {
    const aOnline = ["online", "busy", "away"].includes(a.friend.status);
    const bOnline = ["online", "busy", "away"].includes(b.friend.status);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.friend.displayName.localeCompare(b.friend.displayName);
  }) : [];

  const onlineCount = sortedFriends.filter(e => ["online", "busy", "away"].includes(e.friend.status)).length;

  const tabs = [
    { key: "list" as const, label: t("header.roster"), icon: Users, badge: null },
    { key: "requests" as const, label: t("header.requests"), icon: Inbox, badge: requests?.length || 0 },
    { key: "search" as const, label: t("header.search"), icon: Search, badge: null },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col gap-6">
      {/* page header */}
      <div className="flex items-end justify-between border-b border-border pb-5 shrink-0">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">{t("header.title")}</h1>
          {activeTab === "list" && (
            <p className="text-muted-foreground font-mono text-xs mt-1.5 uppercase tracking-widest">
              {onlineCount} {t("header.online")} · {sortedFriends.length} {t("header.total")}
            </p>
          )}
        </div>

        {/* tab bar */}
        <div className="flex border border-border">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors"
              style={{
                background: activeTab === tab.key ? "hsl(var(--primary))" : "transparent",
                color: activeTab === tab.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                borderRight: tab.key !== "search" ? "1px solid hsl(var(--border))" : undefined,
              }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-1.5 -end-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {/* ── Friend List ──────────────────────────────────────────────── */}
        {activeTab === "list" && (
          <>
            {sortedFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground font-mono text-sm border border-dashed border-border gap-3">
                <UserCheck className="w-10 h-10 opacity-20" />
                <p>{t("roster.empty")}</p>
                <Button variant="outline" className="rounded-none font-mono text-xs mt-2" onClick={() => setActiveTab("search")}>
                  <Search className="w-3.5 h-3.5 me-2" /> {t("header.search")}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedFriends.map(entry => {
                  const f = entry.friend;
                  const isOnline = ["online", "busy", "away"].includes(f.status);
                  const isConfirming = confirmBlock === f.id;

                  return (
                    <div
                      key={entry.id}
                      className="group border border-border bg-card hover:border-primary/30 transition-all duration-200 flex flex-col overflow-hidden"
                    >
                      {/* banner + avatar header */}
                      <Link href={`/profile/${f.id}`} className="block">
                        {/* banner */}
                        <div className="relative h-[76px] overflow-hidden">
                          {(f as any).profileBgUrl && (
                            <img src={(f as any).profileBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          )}
                          {(f as any).bannerUrl ? (
                            <img src={(f as any).bannerUrl} alt="" className="relative w-full h-full object-cover z-[1]" />
                          ) : (
                            !((f as any).profileBgUrl) && (
                              <div
                                className="w-full h-full"
                                style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.16) 0%, hsl(var(--primary)/0.03) 100%)" }}
                              />
                            )
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-card/85 via-card/10 to-transparent" />
                        </div>

                        {/* avatar + badges row */}
                        <div className="px-4 -mt-7 flex items-end gap-3">
                          <div className="relative shrink-0">
                            {f.avatarUrl ? (
                              <img
                                src={f.avatarUrl}
                                alt=""
                                className="w-14 h-14 object-cover rounded-full ring-[3px] ring-card border-2"
                                style={{ borderColor: (f as any).profileFrameColor ?? "hsl(var(--border)/0.4)" }}
                              />
                            ) : (
                              <div
                                className="w-14 h-14 rounded-full ring-[3px] ring-card border-2 flex items-center justify-center font-mono font-bold text-xl"
                                style={{
                                  borderColor: (f as any).profileFrameColor ?? "hsl(var(--border)/0.4)",
                                  background: isOnline ? "hsl(var(--primary)/0.15)" : "hsl(var(--muted))",
                                }}
                              >
                                {f.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <StatusBadge status={f.status} className="absolute -bottom-1 -end-1" />
                          </div>
                          <div className="flex items-center gap-1.5 pb-1.5">
                            {f.tier && <TierPip tier={f.tier} />}
                            {f.isPro && <ProBadge size="sm" />}
                          </div>
                        </div>

                        {/* info */}
                        <div className="px-4 pb-3 pt-2">
                          <div className="font-bold text-base truncate leading-tight hover:text-primary transition-colors">
                            {f.displayName}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">@{f.username}</div>
                          {f.currentGame ? (
                            <div className="text-xs text-primary font-mono truncate flex items-center gap-1.5 mt-1.5">
                              <Play className="w-3 h-3 fill-primary shrink-0" />
                              {f.currentGame}
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground font-mono uppercase mt-1.5 tracking-wider">
                              {f.status}
                            </div>
                          )}
                        </div>
                      </Link>

                      {/* action bar */}
                      {isConfirming ? (
                        <div className="flex items-center border-t border-border bg-destructive/5">
                          <span className="flex-1 text-[11px] text-destructive font-mono px-4 py-2.5">
                            {t("confirm.blockFriend")}
                          </span>
                          <button
                            className="px-4 py-2.5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors border-s border-border font-mono text-xs uppercase tracking-wide flex items-center gap-1.5"
                            onClick={(e) => confirmBlockUser(e, f.id)}
                          >
                            {blocking === f.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Check className="w-3.5 h-3.5" /> {t("actions.blockYes")}</>
                            }
                          </button>
                          <button
                            className="px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-s border-border font-mono text-xs uppercase tracking-wide flex items-center gap-1.5"
                            onClick={() => setConfirmBlock(null)}
                          >
                            <X className="w-3.5 h-3.5" /> {t("actions.cancel")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex border-t border-border">
                          {/* voice call */}
                          <button
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-e border-border font-mono text-[10px] uppercase tracking-wider"
                            title={activeRoom ? t("actions.leaveChannelFirst") : t("actions.startVoiceCall")}
                            disabled={!!activeRoom}
                            onClick={() => callUser({
                              userId: f.id,
                              username: f.username,
                              displayName: f.displayName,
                              avatarUrl: f.avatarUrl ?? null,
                            })}
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {t("actions.call")}
                          </button>
                          {/* DM */}
                          <button
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-e border-border font-mono text-[10px] uppercase tracking-wider"
                            title={t("actions.openChat")}
                            onClick={(e) => openDm(e, f.id)}
                            disabled={openingDm === f.id}
                          >
                            {openingDm === f.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <MessageSquare className="w-3.5 h-3.5" />
                            }
                            {t("actions.chat")}
                          </button>
                          {/* remove */}
                          <button
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors border-e border-border font-mono text-[10px] uppercase tracking-wider"
                            title={t("actions.removeFriend")}
                            onClick={(e) => handleRemove(e, f.id)}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            {t("actions.remove")}
                          </button>
                          {/* block */}
                          <button
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors font-mono text-[10px] uppercase tracking-wider"
                            title={t("actions.block")}
                            onClick={(e) => handleBlock(e, f.id)}
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            {t("actions.block")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Requests ─────────────────────────────────────────────────── */}
        {activeTab === "requests" && (
          <div className="max-w-2xl space-y-3">
            {requests?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground font-mono text-sm border border-dashed border-border gap-3">
                <Inbox className="w-10 h-10 opacity-20" />
                <p>{t("requests.empty")}</p>
              </div>
            ) : (
              requests?.map(req => (
                <div key={req.id} className="border border-border bg-card flex items-center gap-4 p-4 hover:border-border/80 transition-colors">
                  <div className="w-12 h-12 bg-muted flex items-center justify-center font-mono font-bold text-lg border border-border shrink-0">
                    {req.from.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{req.from.displayName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">@{req.from.username}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-1 uppercase tracking-wide">
                      {t("requests.wantsToConnect")}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors text-primary-foreground"
                      style={{ background: "hsl(var(--primary))" }}
                      onClick={() => handleAccept(req.id)}
                      disabled={acceptRequest.isPending}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("requests.accept")}
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 border border-border font-mono text-xs uppercase tracking-wider hover:border-destructive hover:text-destructive transition-colors"
                      onClick={() => handleReject(req.id)}
                      disabled={rejectRequest.isPending}
                    >
                      <X className="w-3.5 h-3.5" />
                      {t("requests.reject")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Search ───────────────────────────────────────────────────── */}
        {activeTab === "search" && (
          <div className="max-w-2xl space-y-5">
            <div className="relative">
              <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="ps-11 font-mono rounded-none border-border bg-card focus-visible:ring-primary h-12 text-sm"
                autoFocus
              />
            </div>

            {searchQuery.length >= 3 && (
              <div className="space-y-3">
                {isSearching ? (
                  <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground p-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("search.searching")}
                  </div>
                ) : searchResults?.length === 0 ? (
                  <div className="font-mono text-sm text-muted-foreground p-4 border border-dashed border-border">
                    {t("search.noMatches")}
                  </div>
                ) : (
                  searchResults?.map(user => (
                    <div key={user.id} className="border border-border bg-card flex items-center gap-4 p-4 hover:border-border/80 transition-colors">
                      <div className="w-12 h-12 bg-muted flex items-center justify-center font-mono font-bold text-lg border border-border shrink-0">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{user.displayName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">@{user.username}</div>
                      </div>
                      <button
                        className="flex items-center gap-1.5 px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors text-primary-foreground disabled:opacity-50"
                        style={{ background: "hsl(var(--primary))" }}
                        onClick={() => handleSendRequest(user.id)}
                        disabled={sendRequest.isPending}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t("search.add")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {searchQuery.length > 0 && searchQuery.length < 3 && (
              <p className="font-mono text-xs text-muted-foreground">{t("search.minChars")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
