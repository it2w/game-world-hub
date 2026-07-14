import { useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  useListFriends, 
  useListFriendRequests, 
  useSendFriendRequest, 
  useAcceptFriendRequest, 
  useRejectFriendRequest, 
  useRemoveFriend,
  useSearchUsers,
  getListFriendsQueryKey,
  getListFriendRequestsQueryKey,
  getSearchUsersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { useVoice } from "@/voice/voice-context";
import { Search, UserPlus, Check, X, UserMinus, Play, Phone } from "lucide-react";
import { Link } from "wouter";

export default function Friends() {
  const { t } = useTranslation("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "requests" | "search">("list");
  
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

  const handleRemove = (friendId: number) => {
    if (confirm(t("confirm.removeFriend"))) {
      removeFriend.mutate({ friendId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
        }
      });
    }
  };

  // Sort friends online first
  const sortedFriends = friends ? [...friends].sort((a, b) => {
    const aOnline = a.friend.status === 'online' || a.friend.status === 'busy' || a.friend.status === 'away';
    const bOnline = b.friend.status === 'online' || b.friend.status === 'busy' || b.friend.status === 'away';
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.friend.displayName.localeCompare(b.friend.displayName);
  }) : [];

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-end justify-between border-b border-border pb-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">{t("header.title")}</h1>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab === "list" ? "default" : "outline"} 
            className="rounded-none font-mono text-xs h-8"
            onClick={() => setActiveTab("list")}
          >
            {t("header.roster")}
          </Button>
          <Button 
            variant={activeTab === "requests" ? "default" : "outline"} 
            className="rounded-none font-mono text-xs h-8 relative"
            onClick={() => setActiveTab("requests")}
          >
            {t("header.requests")}
            {requests && requests.length > 0 && (
              <span className="absolute -top-1 -end-1 w-3 h-3 bg-primary rounded-full" />
            )}
          </Button>
          <Button 
            variant={activeTab === "search" ? "default" : "outline"} 
            className="rounded-none font-mono text-xs h-8"
            onClick={() => setActiveTab("search")}
          >
            {t("header.search")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "list" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedFriends.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted-foreground font-mono text-sm border border-dashed border-border">
                {t("roster.empty")}
              </div>
            ) : (
              sortedFriends.map(entry => (
                <div key={entry.id} className="bg-card border border-border p-4 flex gap-4 items-center group">
                  <Link href={`/profile/${entry.friend.id}`} className="relative shrink-0 cursor-pointer">
                    {entry.friend.avatarUrl ? (
                      <img src={entry.friend.avatarUrl} alt="" className="w-12 h-12 object-cover border border-border" />
                    ) : (
                      <div className="w-12 h-12 bg-muted flex items-center justify-center font-mono border border-border text-lg">
                        {entry.friend.displayName.charAt(0)}
                      </div>
                    )}
                    <StatusBadge status={entry.friend.status} className="absolute -bottom-1 -end-1" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${entry.friend.id}`} className="font-bold text-sm truncate block hover:underline">
                      {entry.friend.displayName}
                    </Link>
                    {entry.friend.currentGame ? (
                      <div className="text-xs text-primary font-mono truncate flex items-center gap-1 mt-0.5">
                        <Play className="w-3 h-3 fill-primary shrink-0" /> {entry.friend.currentGame}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground font-mono uppercase mt-0.5">
                        {entry.friend.status}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary disabled:opacity-30"
                      title={activeRoom ? t("actions.leaveChannelFirst") : t("actions.startVoiceCall")}
                      disabled={!!activeRoom}
                      onClick={() =>
                        callUser({
                          userId: entry.friend.id,
                          username: entry.friend.username,
                          displayName: entry.friend.displayName,
                          avatarUrl: entry.friend.avatarUrl ?? null,
                        })
                      }
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(entry.friend.id)}>
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="max-w-2xl">
            {requests?.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground font-mono text-sm border border-dashed border-border">
                {t("requests.empty")}
              </div>
            ) : (
              <div className="space-y-4">
                {requests?.map(req => (
                  <div key={req.id} className="bg-card border border-border p-4 flex gap-4 items-center">
                    <div className="w-10 h-10 bg-muted flex items-center justify-center font-mono border border-border shrink-0">
                      {req.from.displayName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{req.from.displayName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">@{req.from.username}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="rounded-none font-mono text-xs h-8 px-3" onClick={() => handleAccept(req.id)}>
                        <Check className="w-3 h-3 me-1" /> {t("requests.accept")}
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-8 px-3" onClick={() => handleReject(req.id)}>
                        <X className="w-3 h-3 me-1" /> {t("requests.reject")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div className="max-w-2xl space-y-6">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="ps-10 font-mono rounded-none border-border bg-card focus-visible:ring-primary h-12"
              />
            </div>
            
            {searchQuery.length >= 3 && (
              <div className="space-y-4">
                {isSearching ? (
                  <div className="font-mono text-sm text-muted-foreground animate-pulse">{t("search.searching")}</div>
                ) : searchResults?.length === 0 ? (
                  <div className="font-mono text-sm text-muted-foreground">{t("search.noMatches")}</div>
                ) : (
                  searchResults?.map(user => (
                    <div key={user.id} className="bg-card border border-border p-4 flex gap-4 items-center">
                      <div className="w-10 h-10 bg-muted flex items-center justify-center font-mono border border-border shrink-0">
                        {user.displayName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm">{user.displayName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">@{user.username}</div>
                      </div>
                      <Button size="sm" className="rounded-none font-mono text-xs h-8" onClick={() => handleSendRequest(user.id)} disabled={sendRequest.isPending}>
                        <UserPlus className="w-3 h-3 me-1" /> {t("search.add")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
