import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetUser, useGetUserPlatforms, useGetUserContentLinks, useGetFriendStatus, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriend, useBlockUser, useUnblockUser, useGetLibrary, useGetMe, useUpdateMyStatus, getGetUserQueryKey, getGetUserPlatformsQueryKey, getGetUserContentLinksQueryKey, getGetFriendStatusQueryKey, getGetLibraryQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { contentMeta } from "@/lib/content-platforms";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Gamepad2, Calendar, Monitor, Link as LinkIcon, Radio, ExternalLink, UserPlus, UserCheck, UserX, Clock, Check, Ban, ShieldOff } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const [, params] = useRoute("/profile/:userId");
  const userId = params?.userId ? parseInt(params.userId) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetUser(userId, {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId) }
  });

  const { data: platforms } = useGetUserPlatforms(userId, {
    query: { enabled: !!userId, queryKey: getGetUserPlatformsQueryKey(userId) }
  });

  const { data: contentLinks } = useGetUserContentLinks(userId, {
    query: { enabled: !!userId, queryKey: getGetUserContentLinksQueryKey(userId) }
  });

  const { data: friendStatus } = useGetFriendStatus(userId, {
    query: { enabled: !!userId, queryKey: getGetFriendStatusQueryKey(userId) }
  });

  const { data: library } = useGetLibrary(userId, {
    query: { enabled: !!userId, queryKey: getGetLibraryQueryKey(userId) }
  });

  const { data: me } = useGetMe();
  const updateStatus = useUpdateMyStatus();

  const handleLaunch = (launchUri: string | null | undefined, name: string) => {
    if (!launchUri) {
      toast({ title: "No launch link", description: `${name} has no launch link — add one from the Library to launch it.` });
      return;
    }
    // Protocol deep-link: opens the platform client if installed on the device.
    window.location.href = launchUri;
    toast({ title: `Launching ${name}…`, description: "If nothing opens, make sure the game's client is installed." });
    // Reflect the launch as our active presence ("ACTIVE PROCESS").
    updateStatus.mutate(
      { data: { currentGame: name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          if (me?.id) queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
        },
      },
    );
  };

  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  const refreshRelationship = () => {
    queryClient.invalidateQueries({ queryKey: getGetFriendStatusQueryKey(userId) });
    queryClient.invalidateQueries();
  };

  const handleAdd = () => {
    sendRequest.mutate({ data: { toUserId: userId } }, {
      onSuccess: () => { toast({ title: "Friend request sent" }); refreshRelationship(); },
      onError: () => toast({ title: "Couldn't send request", variant: "destructive" }),
    });
  };

  const handleAccept = () => {
    if (!friendStatus?.requestId) return;
    acceptRequest.mutate({ requestId: friendStatus.requestId }, {
      onSuccess: () => { toast({ title: "Friend request accepted" }); refreshRelationship(); },
      onError: () => toast({ title: "Couldn't accept request", variant: "destructive" }),
    });
  };

  const handleRemove = () => {
    removeFriend.mutate({ friendId: userId }, {
      onSuccess: () => { toast({ title: "Friend removed" }); refreshRelationship(); },
      onError: () => toast({ title: "Couldn't remove friend", variant: "destructive" }),
    });
  };

  const handleBlock = () => {
    blockUser.mutate({ userId }, {
      onSuccess: () => { toast({ title: "User blocked" }); refreshRelationship(); },
      onError: () => toast({ title: "Couldn't block user", variant: "destructive" }),
    });
  };

  const handleUnblock = () => {
    unblockUser.mutate({ userId }, {
      onSuccess: () => { toast({ title: "User unblocked" }); refreshRelationship(); },
      onError: () => toast({ title: "Couldn't unblock user", variant: "destructive" }),
    });
  };

  const friendBusy = sendRequest.isPending || acceptRequest.isPending || removeFriend.isPending || blockUser.isPending || unblockUser.isPending;

  if (isLoading) return <div className="p-12 text-center font-mono text-muted-foreground animate-pulse">DOWNLOADING PROFILE DATA...</div>;
  if (!user) return <div className="p-12 text-center font-mono text-destructive">PROFILE NOT FOUND</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-card border border-border p-8 relative overflow-hidden flex flex-col md:flex-row gap-8 items-center md:items-start">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 shrink-0">
          <div className="w-32 h-32 border-2 border-border bg-muted flex items-center justify-center relative">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono text-5xl text-muted-foreground">{user.displayName.charAt(0)}</span>
            )}
            <div className="absolute -bottom-2 -right-2 p-1 bg-card">
              <StatusBadge status={user.status} className="w-5 h-5 border-[3px]" />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex-1 text-center md:text-left space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold font-mono tracking-tighter uppercase">{user.displayName}</h1>
              <p className="text-primary font-mono text-sm mt-1">@{user.username}</p>
            </div>

            {friendStatus && friendStatus.state !== "self" && (
              <div className="shrink-0 flex items-center gap-2">
                {friendStatus.state === "blocked" ? (
                  <Button onClick={handleUnblock} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2">
                    <ShieldOff className="w-4 h-4" /> UNBLOCK
                  </Button>
                ) : (
                  <>
                    {friendStatus.state === "none" && (
                      <Button onClick={handleAdd} disabled={friendBusy} className="font-mono rounded-none gap-2">
                        <UserPlus className="w-4 h-4" /> ADD FRIEND
                      </Button>
                    )}
                    {friendStatus.state === "request_sent" && (
                      <Button variant="outline" disabled className="font-mono rounded-none gap-2">
                        <Clock className="w-4 h-4" /> REQUEST SENT
                      </Button>
                    )}
                    {friendStatus.state === "request_received" && (
                      <Button onClick={handleAccept} disabled={friendBusy} className="font-mono rounded-none gap-2">
                        <Check className="w-4 h-4" /> ACCEPT REQUEST
                      </Button>
                    )}
                    {friendStatus.state === "friends" && (
                      <Button onClick={handleRemove} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2 group">
                        <UserCheck className="w-4 h-4 group-hover:hidden" />
                        <UserX className="w-4 h-4 hidden group-hover:block text-destructive" />
                        <span className="group-hover:hidden">FRIENDS</span>
                        <span className="hidden group-hover:inline text-destructive">REMOVE</span>
                      </Button>
                    )}
                    <Button onClick={handleBlock} disabled={friendBusy} variant="ghost" size="icon" title="Block user" className="text-muted-foreground hover:text-destructive rounded-none">
                      <Ban className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {user.bio && (
            <p className="max-w-2xl text-muted-foreground border-l-2 border-border pl-4 italic">
              "{user.bio}"
            </p>
          )}

          <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-2">
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5">
              <Gamepad2 className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground uppercase tracking-widest">Active Process:</span>
              {user.currentGame ? (
                <span className="text-primary flex items-center gap-1"><Radio className="w-3 h-3 animate-pulse" />{user.currentGame}</span>
              ) : (
                <span className="text-muted-foreground">NONE</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" /> 
              INIT: {format(new Date(user.createdAt), "yyyy.MM.dd")}
            </div>
          </div>

          {contentLinks && contentLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
              {contentLinks.map(c => {
                const meta = contentMeta(c.platform);
                const Icon = meta?.icon ?? Radio;
                return (
                  <a
                    key={c.id}
                    href={c.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs font-mono bg-background border px-3 py-1.5 hover:bg-muted/30 transition-colors group"
                    style={{ borderColor: meta?.color ?? "var(--border)" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: meta?.color }} />
                    <span>{c.handle}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Linked Platforms */}
        <div className="bg-card border border-border p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" /> LINKED_SYSTEMS
          </h2>
          
          <div className="space-y-3">
            {!platforms || platforms.length === 0 ? (
              <div className="text-sm font-mono text-muted-foreground italic">NO EXTERNAL LINKS DETECTED</div>
            ) : (
              platforms.map(p => (
                <a key={p.id} href={p.profileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 border border-border hover:border-primary/50 bg-background transition-colors group">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-bold text-sm capitalize">{p.platform}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{p.username || 'Linked'}</span>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Library Preview */}
        <div className="bg-card border border-border p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
            <Library className="w-4 h-4" /> GAME_LIBRARY {library && library.length > 0 ? `(${library.length})` : ""}
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {library?.slice(0, 9).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleLaunch(g.launchUri, g.name)}
                title={g.launchUri ? `Launch ${g.name}` : g.name}
                className="aspect-[3/4] bg-background border border-border relative group overflow-hidden text-left"
              >
                {g.coverUrl ? (
                  <img src={g.coverUrl} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-xs text-center p-1 text-muted-foreground">
                    {g.name.substring(0, 3).toUpperCase()}
                  </div>
                )}
                {g.launchUri && (
                  <span className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-5 h-5 text-primary" />
                  </span>
                )}
              </button>
            ))}
            {(!library || library.length === 0) && (
              <div className="col-span-full text-sm font-mono text-muted-foreground italic">LIBRARY EMPTY</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Needed to fix import error above
import { Library, Play } from "lucide-react";