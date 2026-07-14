import { useState } from "react";
import {
  useGetMe,
  useGetLibrary,
  useGetGameAccounts,
  useLinkSteam,
  useSyncSteam,
  useLinkGameAccount,
  useUnlinkGameAccount,
  useAddLibraryGame,
  useRemoveLibraryGame,
  getGetLibraryQueryKey,
  getGetGameAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Library as LibraryIcon, Plus, Trash2, Play, RefreshCw, Link2, Unlink, Gamepad2 } from "lucide-react";

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  steam: { label: "Steam", color: "#66c0f4" },
  epic: { label: "Epic Games", color: "#e0e0e0" },
  battlenet: { label: "Battle.net", color: "#00aeff" },
  xbox: { label: "Xbox", color: "#107c10" },
  playstation: { label: "PlayStation", color: "#0070d1" },
  nintendo: { label: "Nintendo", color: "#e60012" },
  riot: { label: "Riot Games", color: "#d13639" },
  ea: { label: "EA", color: "#ff4747" },
  gog: { label: "GOG", color: "#a259ff" },
  other: { label: "Other", color: "#9aa0a6" },
};

const MANUAL_PLATFORMS = ["epic", "battlenet", "xbox", "playstation", "nintendo", "riot", "ea", "gog", "other"];

// Mirrors the server allowlist — only real game-launcher protocols are accepted.
const ALLOWED_LAUNCH_SCHEMES = [
  "steam:", "com.epicgames.launcher:", "battlenet:", "uplay:", "origin:",
  "ea:", "ealink:", "riot:", "rockstar:", "gog:", "goggalaxy:", "minecraft:",
];
function isValidLaunchUri(uri: string): boolean {
  const lower = uri.trim().toLowerCase();
  return ALLOWED_LAUNCH_SCHEMES.some((s) => lower.startsWith(s));
}

const LAUNCH_HINTS: Record<string, string> = {
  epic: "com.epicgames.launcher://apps/<AppName>?action=launch",
  battlenet: "battlenet://WoW  (or D3, Pro, S2, ...)",
  xbox: "leave blank if unknown",
  playstation: "leave blank",
  nintendo: "leave blank",
  riot: "riot://",
  ea: "origin://launchgame/<id>",
  gog: "goggalaxy://openGameView/<id>",
  other: "steam:// , battlenet:// , ...",
};

function platformLabel(p: string) {
  return PLATFORM_META[p]?.label ?? p;
}
function platformColor(p: string) {
  return PLATFORM_META[p]?.color ?? "#9aa0a6";
}

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useGetMe();
  const myId = me?.id ?? 0;

  const { data: games } = useGetLibrary(myId, {
    query: { enabled: !!myId, queryKey: getGetLibraryQueryKey(myId) },
  });
  const { data: accounts } = useGetGameAccounts(myId, {
    query: { enabled: !!myId, queryKey: getGetGameAccountsQueryKey(myId) },
  });

  const linkSteam = useLinkSteam();
  const syncSteam = useSyncSteam();
  const linkAccount = useLinkGameAccount();
  const unlinkAccount = useUnlinkGameAccount();
  const addGame = useAddLibraryGame();
  const removeGame = useRemoveLibraryGame();

  const [steamInput, setSteamInput] = useState("");
  const [manualPlatform, setManualPlatform] = useState("epic");
  const [manualHandle, setManualHandle] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [gForm, setGForm] = useState({ platform: "epic", name: "", coverUrl: "", launchUri: "" });
  const [gError, setGError] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetLibraryQueryKey(myId) });
    queryClient.invalidateQueries({ queryKey: getGetGameAccountsQueryKey(myId) });
  };

  const steamAccount = accounts?.find((a) => a.platform === "steam");

  const handleLinkSteam = () => {
    if (!steamInput.trim()) return;
    linkSteam.mutate(
      { data: { input: steamInput.trim() } },
      {
        onSuccess: (res) => {
          toast({ title: "Steam linked", description: `Imported ${res.imported} game${res.imported === 1 ? "" : "s"}.` });
          setSteamInput("");
          refresh();
        },
        onError: (e: any) => {
          const msg = e?.response?.data?.error || e?.data?.error || "Couldn't link Steam. Check the profile URL and that it's public.";
          toast({ title: "Steam link failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleSyncSteam = () => {
    syncSteam.mutate(undefined as any, {
      onSuccess: (res) => {
        toast({ title: "Steam synced", description: `${res.imported} games in your library.` });
        refresh();
      },
      onError: () => toast({ title: "Sync failed", variant: "destructive" }),
    });
  };

  const handleLinkManual = () => {
    if (!manualHandle.trim()) return;
    linkAccount.mutate(
      { data: { platform: manualPlatform, handle: manualHandle.trim() } },
      {
        onSuccess: () => {
          toast({ title: `${platformLabel(manualPlatform)} linked` });
          setManualHandle("");
          refresh();
        },
        onError: () => toast({ title: "Couldn't link account", variant: "destructive" }),
      }
    );
  };

  const handleUnlink = (accountId: number, label: string) => {
    unlinkAccount.mutate(
      { accountId },
      {
        onSuccess: () => {
          toast({ title: `${label} unlinked` });
          refresh();
        },
        onError: () => toast({ title: "Couldn't unlink", variant: "destructive" }),
      }
    );
  };

  const handleAddGame = () => {
    if (!gForm.name.trim()) return;
    // Client-side guard so invalid launch links get immediate, visible feedback.
    if (gForm.launchUri.trim() && !isValidLaunchUri(gForm.launchUri)) {
      setGError("Launch link must be a supported game protocol (e.g. steam://, battlenet://).");
      toast({ title: "Invalid launch link", description: "Use a game protocol like steam:// or battlenet://.", variant: "destructive" });
      return;
    }
    setGError("");
    addGame.mutate(
      { data: { platform: gForm.platform, name: gForm.name.trim(), coverUrl: gForm.coverUrl.trim() || undefined, launchUri: gForm.launchUri.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Game added" });
          setAddOpen(false);
          setGForm({ platform: gForm.platform, name: "", coverUrl: "", launchUri: "" });
          refresh();
        },
        onError: (e: any) => {
          const msg = e?.response?.data?.error || e?.data?.error || "Couldn't add the game.";
          toast({ title: "Add failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleRemoveGame = (gameId: number) => {
    removeGame.mutate({ gameId }, {
      onSuccess: () => { toast({ title: "Removed from library" }); refresh(); },
      onError: () => toast({ title: "Couldn't remove", variant: "destructive" }),
    });
  };

  const handleLaunch = (launchUri: string | null | undefined, name: string) => {
    if (!launchUri) {
      toast({ title: "No launch link", description: `${name} has no launch link. Add one to launch it from your device.` });
      return;
    }
    // Protocol deep-link: opens the platform client if installed on the user's device.
    window.location.href = launchUri;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <LibraryIcon className="w-7 h-7 text-primary" /> GAME LIBRARY
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Link your accounts, import your games, and launch them from your device.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-none gap-2"><Plus className="w-4 h-4" /> ADD GAME</Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border-border bg-card">
            <DialogHeader><DialogTitle className="font-mono uppercase">Add a game manually</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">Platform</label>
                <select
                  value={gForm.platform}
                  onChange={(e) => setGForm({ ...gForm, platform: e.target.value })}
                  className="w-full h-9 bg-background border border-border font-mono text-sm px-2 rounded-none"
                >
                  {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">Game name</label>
                <Input value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} className="font-mono rounded-none" placeholder="e.g. Fortnite" />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">Cover image URL (optional)</label>
                <Input value={gForm.coverUrl} onChange={(e) => setGForm({ ...gForm, coverUrl: e.target.value })} className="font-mono rounded-none" placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">Launch link (optional)</label>
                <Input value={gForm.launchUri} onChange={(e) => setGForm({ ...gForm, launchUri: e.target.value })} className="font-mono rounded-none" placeholder={LAUNCH_HINTS[gForm.platform] || "steam:// ..."} />
                <p className="text-[10px] text-muted-foreground font-mono mt-1">A protocol link that opens the game on your device (e.g. battlenet://WoW). Only game protocols are allowed.</p>
              </div>
              {gError && <p className="text-xs font-mono text-destructive">{gError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleAddGame} disabled={addGame.isPending || !gForm.name.trim()} className="font-mono rounded-none">ADD TO LIBRARY</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Connect accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Steam */}
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm uppercase tracking-widest" style={{ color: platformColor("steam") }}>Steam — Auto Import</h2>
            {steamAccount && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none" title="Re-sync" onClick={handleSyncSteam} disabled={syncSteam.isPending}>
                  <RefreshCw className={`w-4 h-4 ${syncSteam.isPending ? "animate-spin" : ""}`} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none text-destructive" title="Unlink" onClick={() => handleUnlink(steamAccount.id, "Steam")} disabled={unlinkAccount.isPending}>
                  <Unlink className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          {steamAccount ? (
            <p className="text-xs font-mono text-muted-foreground">
              Linked ✓{" "}
              {steamAccount.profileUrl && (
                <a href={steamAccount.profileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">view profile</a>
              )}
            </p>
          ) : (
            <>
              <p className="text-xs font-mono text-muted-foreground">Paste your Steam profile URL or ID. Your game details must be public.</p>
              <div className="flex gap-2">
                <Input value={steamInput} onChange={(e) => setSteamInput(e.target.value)} placeholder="steamcommunity.com/id/yourname" className="font-mono rounded-none text-sm" />
                <Button onClick={handleLinkSteam} disabled={linkSteam.isPending || !steamInput.trim()} className="font-mono rounded-none gap-2 shrink-0">
                  <Link2 className="w-4 h-4" /> {linkSteam.isPending ? "..." : "IMPORT"}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Other platforms */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary">Other Accounts</h2>
          <div className="flex gap-2">
            <select value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)} className="h-9 bg-background border border-border font-mono text-sm px-2 rounded-none">
              {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
            </select>
            <Input value={manualHandle} onChange={(e) => setManualHandle(e.target.value)} placeholder="your handle" className="font-mono rounded-none text-sm" />
            <Button onClick={handleLinkManual} disabled={linkAccount.isPending || !manualHandle.trim()} className="font-mono rounded-none shrink-0"><Link2 className="w-4 h-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {accounts?.filter((a) => a.platform !== "steam").map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 border border-border px-2 py-1 text-xs font-mono" style={{ color: platformColor(a.platform) }}>
                {platformLabel(a.platform)}: <span className="text-foreground">{a.handle}</span>
                <button onClick={() => handleUnlink(a.id, platformLabel(a.platform))} className="text-muted-foreground hover:text-destructive"><Unlink className="w-3 h-3" /></button>
              </span>
            ))}
            {(!accounts || accounts.filter((a) => a.platform !== "steam").length === 0) && (
              <span className="text-xs font-mono text-muted-foreground">No other accounts linked. Add games manually below.</span>
            )}
          </div>
        </div>
      </div>

      {/* Games grid */}
      <div>
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 border-b border-border pb-2">
          My Games {games ? `(${games.length})` : ""}
        </h2>
        {!games || games.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border">
            <Gamepad2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-mono text-sm text-muted-foreground">No games yet. Link Steam to import automatically, or add a game manually.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {games.map((g) => (
              <div key={g.id} className="group bg-card border border-border overflow-hidden flex flex-col">
                <div className="relative aspect-[3/4] bg-muted overflow-hidden">
                  {g.coverUrl ? (
                    <img src={g.coverUrl} alt={g.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Gamepad2 className="w-8 h-8 text-muted-foreground" /></div>
                  )}
                  <span className="absolute top-1 left-1 text-[9px] font-mono px-1.5 py-0.5 bg-background/80 border border-border" style={{ color: platformColor(g.platform) }}>
                    {platformLabel(g.platform)}
                  </span>
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <Button size="sm" className="font-mono rounded-none gap-1 h-8" onClick={() => handleLaunch(g.launchUri, g.name)}>
                      <Play className="w-3.5 h-3.5" /> LAUNCH
                    </Button>
                    <Button size="sm" variant="ghost" className="font-mono rounded-none gap-1 h-7 text-destructive hover:text-destructive" onClick={() => handleRemoveGame(g.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs font-mono truncate" title={g.name}>{g.name}</p>
                  {typeof g.playtimeMinutes === "number" && g.playtimeMinutes > 0 && (
                    <p className="text-[10px] text-muted-foreground font-mono">{Math.round(g.playtimeMinutes / 60)}h played</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
