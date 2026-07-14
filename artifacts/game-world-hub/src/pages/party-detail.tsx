import { useState } from "react";
import { useLocation } from "wouter";
import { 
  useGetParty, 
  useJoinParty, 
  useLeaveParty, 
  useDeleteParty,
  useGetMe,
  useListFriends,
  useInviteToParty,
  useSearchUsers,
  getGetPartyQueryKey,
  getGetMeQueryKey,
  getListFriendsQueryKey,
  getSearchUsersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useVoice } from "@/voice/voice-context";
import { Users, Gamepad2, Monitor, ShieldAlert, LogOut, Trash2, Shield, UserPlus, Plus, Mic, PhoneOff, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "wouter";

export default function PartyDetail({ params }: { params: { partyId: string } }) {
  const partyId = parseInt(params.partyId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inviteQuery, setInviteQuery] = useState("");

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: party, isLoading } = useGetParty(partyId, {
    query: { enabled: !!partyId, refetchInterval: 5000, queryKey: getGetPartyQueryKey(partyId) }
  });
  const { data: friends } = useListFriends({ query: { queryKey: getListFriendsQueryKey() } });

  const trimmedQuery = inviteQuery.trim();
  const { data: searchResults, isFetching: isSearching } = useSearchUsers(
    { q: trimmedQuery },
    { query: { enabled: trimmedQuery.length > 0, queryKey: getSearchUsersQueryKey({ q: trimmedQuery }) } }
  );

  const joinParty = useJoinParty();
  const leaveParty = useLeaveParty();
  const deleteParty = useDeleteParty();
  const inviteToParty = useInviteToParty();

  const { joinPartyVoice, leaveVoice, isInPartyVoice } = useVoice();
  const inVoice = isInPartyVoice(partyId);

  const handleJoin = () => {
    joinParty.mutate({ partyId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetPartyQueryKey(partyId) })
    });
  };

  const handleLeave = () => {
    leaveParty.mutate({ partyId }, {
      onSuccess: () => setLocation("/parties")
    });
  };

  const handleDelete = () => {
    if (confirm("Disband this squad? This action cannot be reversed.")) {
      deleteParty.mutate({ partyId }, {
        onSuccess: () => setLocation("/parties")
      });
    }
  };

  const handleInvite = (userId: number, displayName: string) => {
    inviteToParty.mutate(
      { partyId, data: { userId } },
      {
        onSuccess: () => toast({ title: "Invite sent", description: `${displayName} was invited to the squad.` }),
        onError: () => toast({ title: "Couldn't send invite", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return <div className="p-12 text-center font-mono text-muted-foreground animate-pulse">ESTABLISHING CONNECTION...</div>;
  }

  if (!party) {
    return <div className="p-12 text-center font-mono text-destructive">PARTY NOT FOUND OR SIGNAL LOST</div>;
  }

  const isMember = party.members.some(m => m.id === me?.id);
  const isLeader = party.leader.id === me?.id;
  const isFull = party.members.length >= party.maxSize;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Board */}
      <div className="bg-card border border-border p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
        
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">{party.name}</h1>
            {!party.isPublic && <ShieldAlert className="w-5 h-5 text-yellow-500" aria-label="Private" />}
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5 border border-border px-2 py-1 bg-background">
              <Users className="w-3.5 h-3.5" /> {party.members.length}/{party.maxSize} OPERATORS
            </span>
            <span className="flex items-center gap-1.5 border border-border px-2 py-1 bg-background text-primary">
              <Gamepad2 className="w-3.5 h-3.5" /> {party.game || 'ANY_GAME'}
            </span>
            <span className="flex items-center gap-1.5 border border-border px-2 py-1 bg-background">
              <Monitor className="w-3.5 h-3.5" /> {party.platform || 'ANY_SYS'}
            </span>
          </div>
          {party.description && (
            <p className="max-w-xl text-sm mt-4 border-l-2 border-primary/50 pl-3 py-1">
              "{party.description}"
            </p>
          )}
        </div>

        <div className="relative z-10 flex flex-col gap-2 min-w-[200px]">
          {isMember ? (
            <>
              {inVoice ? (
                <Button
                  variant="default"
                  className="w-full font-mono rounded-none bg-destructive hover:bg-destructive/90"
                  onClick={() => leaveVoice()}
                >
                  <PhoneOff className="w-4 h-4 mr-2" /> LEAVE VOICE
                </Button>
              ) : (
                <Button
                  className="w-full font-mono rounded-none"
                  onClick={() => void joinPartyVoice(party.id, party.name)}
                >
                  <Mic className="w-4 h-4 mr-2" /> JOIN VOICE
                </Button>
              )}

              {party.conversationId && (
                <Button asChild variant="outline" className="w-full font-mono rounded-none border-border">
                  <Link href={`/chat/${party.conversationId}`}>OPEN COMMS</Link>
                </Button>
              )}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full font-mono rounded-none border-border">
                    <UserPlus className="w-4 h-4 mr-2" /> INVITE ROSTER
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0 rounded-none border-border bg-card">
                  <div className="p-2 border-b border-border font-mono text-xs uppercase bg-muted/50">Transmit Invites</div>
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={inviteQuery}
                        onChange={(e) => setInviteQuery(e.target.value)}
                        placeholder="SEARCH OPERATORS..."
                        className="h-8 pl-7 font-mono text-xs rounded-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-auto flex flex-col">
                    {(() => {
                      const results = trimmedQuery.length > 0
                        ? (searchResults ?? []).map(u => ({ id: u.id, displayName: u.displayName }))
                        : (friends ?? []).map(entry => ({ id: entry.friend.id, displayName: entry.friend.displayName }));

                      if (trimmedQuery.length > 0 && isSearching) {
                        return <div className="p-3 text-xs font-mono text-muted-foreground text-center animate-pulse">SCANNING...</div>;
                      }
                      if (results.length === 0) {
                        return (
                          <div className="p-3 text-xs font-mono text-muted-foreground text-center">
                            {trimmedQuery.length > 0 ? "NO OPERATORS FOUND" : "NO FRIENDS YET — SEARCH BY USERNAME ABOVE"}
                          </div>
                        );
                      }
                      return results.map(person => {
                        const alreadyIn = party.members.some(m => m.id === person.id);
                        return (
                          <div key={person.id} className="p-2 flex items-center justify-between hover:bg-muted/30">
                            <span className="text-sm font-mono truncate">{person.displayName}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] font-mono rounded-none"
                              disabled={alreadyIn || inviteToParty.isPending}
                              onClick={() => handleInvite(person.id, person.displayName)}
                            >
                              {alreadyIn ? 'IN SQUAD' : 'SEND'}
                            </Button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex gap-2">
                {isLeader ? (
                  <Button variant="destructive" className="flex-1 font-mono rounded-none" onClick={handleDelete} disabled={deleteParty.isPending}>
                    <Trash2 className="w-4 h-4 mr-2" /> DISBAND
                  </Button>
                ) : (
                  <Button variant="outline" className="flex-1 font-mono rounded-none text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleLeave} disabled={leaveParty.isPending}>
                    <LogOut className="w-4 h-4 mr-2" /> EXTRACT
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Button 
              className="w-full font-mono rounded-none h-12" 
              onClick={handleJoin} 
              disabled={isFull || joinParty.isPending}
            >
              {isFull ? 'SQUAD FULL' : 'JOIN SQUAD'}
            </Button>
          )}
        </div>
      </div>

      {/* Roster Grid */}
      <div>
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 border-b border-border pb-2">Active Roster</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {party.members.map(member => (
            <div key={member.id} className="bg-card border border-border p-4 flex items-center gap-4">
              <Link href={`/profile/${member.id}`} className="relative shrink-0">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="w-12 h-12 border border-border object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-muted border border-border flex items-center justify-center font-mono">
                    {member.displayName.charAt(0)}
                  </div>
                )}
                <StatusBadge status={member.status} className="absolute -bottom-1 -right-1" />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/profile/${member.id}`} className="font-bold text-sm hover:underline truncate">
                    {member.displayName}
                  </Link>
                  {member.id === party.leader.id && (
                    <Shield className="w-3 h-3 text-primary shrink-0" aria-label="Squad Leader" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-2">
                  <span>@{member.username}</span>
                </div>
              </div>
            </div>
          ))}
          {/* Empty slots */}
          {Array.from({ length: party.maxSize - party.members.length }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-background border border-dashed border-border p-4 flex items-center gap-4 opacity-50">
              <div className="w-12 h-12 border border-dashed border-border flex items-center justify-center text-muted-foreground">
                <Plus className="w-4 h-4" />
              </div>
              <div className="font-mono text-sm text-muted-foreground tracking-widest">AWAITING_OPERATOR</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
