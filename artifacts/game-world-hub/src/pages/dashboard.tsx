import { useGetOnlineFriendsSummary, useGetPartyActivityFeed, useListPartyInvites, useGetMe, getListPartyInvitesQueryKey, getGetOnlineFriendsSummaryQueryKey, getGetPartyActivityFeedQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Activity, Gamepad2, Users, ChevronRight, Play } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useAcceptPartyInvite, useDeclinePartyInvite } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAcceptInvite = (inviteId: number) => {
    acceptInvite.mutate({ inviteId }, {
      onSuccess: () => {
        toast({ title: "Invite accepted" });
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
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">OVERVIEW</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">STATUS: {me?.status}</p>
        </div>
        <div className="flex gap-4">
          <Button asChild variant="outline" className="font-mono rounded-none border-border">
            <Link href="/parties">BROWSE PARTIES</Link>
          </Button>
          <Button asChild className="font-mono rounded-none">
            <Link href="/parties">CREATE PARTY</Link>
          </Button>
        </div>
      </div>

      {invites && invites.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 p-4">
          <h3 className="font-mono text-sm uppercase text-primary font-bold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> PENDING INVITES ({invites.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {invites.map(invite => (
              <div key={invite.id} className="bg-card border border-border p-3 flex flex-col gap-3">
                <div>
                  <div className="font-bold">{invite.party.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">Invited by @{invite.invitedBy.username}</div>
                  {invite.party.game && <div className="text-xs text-primary font-mono mt-1">[{invite.party.game}]</div>}
                </div>
                <div className="flex gap-2 mt-auto">
                  <Button size="sm" className="flex-1 rounded-none font-mono text-xs h-8" onClick={() => handleAcceptInvite(invite.id)} disabled={acceptInvite.isPending}>ACCEPT</Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-none font-mono text-xs h-8" onClick={() => handleDeclineInvite(invite.id)} disabled={declineInvite.isPending}>DECLINE</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="border border-border bg-card">
            <div className="p-3 border-b border-border bg-muted/30 flex justify-between items-center">
              <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> ONLINE_NETWORK
              </h2>
              <span className="font-mono text-xs text-primary">{friendsSummary?.onlineCount || 0} ACTIVE</span>
            </div>
            <div className="p-4">
              {loadingFriends ? (
                <div className="flex gap-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="w-16 h-16 rounded-none bg-muted" />)}
                </div>
              ) : friendsSummary?.friends.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                  NO AGENTS ONLINE
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {friendsSummary?.friends.map(entry => (
                    <Link key={entry.id} href={`/profile/${entry.friend.id}`} className="group p-3 border border-transparent hover:border-border hover:bg-muted/20 transition-all flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="relative">
                          {entry.friend.avatarUrl ? (
                            <img src={entry.friend.avatarUrl} alt="" className="w-10 h-10 object-cover border border-border" />
                          ) : (
                            <div className="w-10 h-10 bg-muted flex items-center justify-center font-mono border border-border">
                              {entry.friend.displayName.charAt(0)}
                            </div>
                          )}
                          <StatusBadge status={entry.friend.status} className="absolute -bottom-1 -right-1" />
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div>
                        <div className="font-bold text-sm truncate">{entry.friend.displayName}</div>
                        {entry.friend.currentGame ? (
                          <div className="text-xs text-primary font-mono truncate flex items-center gap-1 mt-1">
                            <Play className="w-3 h-3 fill-primary" /> {entry.friend.currentGame}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground font-mono truncate mt-1">
                            {entry.friend.status}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-border bg-card">
            <div className="p-3 border-b border-border bg-muted/30">
              <h2 className="font-mono text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> ACTIVITY_FEED
              </h2>
            </div>
            <div className="p-0">
              {loadingActivity ? (
                <div className="p-4 space-y-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-none bg-muted" />)}
                </div>
              ) : partyActivity?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground font-mono text-xs">NO RECENT ACTIVITY</div>
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
                            {activity.action === 'created' ? 'established party' :
                             activity.action === 'joined' ? 'joined party' :
                             activity.action === 'left' ? 'left party' : 'invited to'}
                          </span>
                          <Link href={`/party/${activity.party.id}`} className="text-primary hover:underline font-mono">
                            {activity.party.name}
                          </Link>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-1">
                          {new Date(activity.createdAt).toLocaleTimeString()}
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
