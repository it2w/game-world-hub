import { useRoute } from "wouter";
import { useGetUser, useGetUserPlatforms, getGetUserQueryKey, getGetUserPlatformsQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { Gamepad2, Calendar, Monitor, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const [, params] = useRoute("/profile/:userId");
  const userId = params?.userId ? parseInt(params.userId) : 0;

  const { data: user, isLoading } = useGetUser(userId, {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId) }
  });

  const { data: platforms } = useGetUserPlatforms(userId, {
    query: { enabled: !!userId, queryKey: getGetUserPlatformsQueryKey(userId) }
  });

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
          <div>
            <h1 className="text-4xl font-bold font-mono tracking-tighter uppercase">{user.displayName}</h1>
            <p className="text-primary font-mono text-sm mt-1">@{user.username}</p>
          </div>
          
          {user.bio && (
            <p className="max-w-2xl text-muted-foreground border-l-2 border-border pl-4 italic">
              "{user.bio}"
            </p>
          )}

          <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-2">
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5">
              <Gamepad2 className="w-4 h-4 text-primary" /> 
              {user.currentGame ? <span className="text-primary">{user.currentGame}</span> : <span className="text-muted-foreground">NO ACTIVE PROCESS</span>}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" /> 
              INIT: {format(new Date(user.createdAt), "yyyy.MM.dd")}
            </div>
          </div>
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
            <Library className="w-4 h-4" /> ACQUIRED_ASSETS
          </h2>
          
          <div className="grid grid-cols-3 gap-2">
            {user.games?.slice(0, 9).map((g: any) => (
              <div key={g.id} className="aspect-[3/4] bg-background border border-border relative group overflow-hidden" title={g.game.name}>
                {g.game.coverUrl ? (
                  <img src={g.game.coverUrl} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-xs text-center p-1 text-muted-foreground">
                    {g.game.name.substring(0, 3).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {user.games?.length === 0 && (
              <div className="col-span-full text-sm font-mono text-muted-foreground italic">LIBRARY EMPTY</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Needed to fix import error above
import { Library } from "lucide-react";