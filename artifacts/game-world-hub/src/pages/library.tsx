import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  useUpdateMyStatus,
  getGetLibraryQueryKey,
  getGetGameAccountsQueryKey,
  getGetMeQueryKey,
  getGetUserQueryKey,
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

function platformLabel(p: string) {
  return PLATFORM_META[p]?.label ?? p;
}
function platformColor(p: string) {
  return PLATFORM_META[p]?.color ?? "#9aa0a6";
}

export default function LibraryPage() {
  const { t } = useTranslation("library");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const LAUNCH_HINTS: Record<string, string> = {
    epic: t("launchHints.epic"),
    battlenet: t("launchHints.battlenet"),
    xbox: t("launchHints.xbox"),
    playstation: t("launchHints.playstation"),
    nintendo: t("launchHints.nintendo"),
    riot: t("launchHints.riot"),
    ea: t("launchHints.ea"),
    gog: t("launchHints.gog"),
    other: t("launchHints.other"),
  };

  const { data: me } = useGetMe();
  const myId = me?.id ?? 0;
  const updateStatus = useUpdateMyStatus();

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
          toast({ title: t("toasts.steamLinked"), description: t("toasts.steamImported", { count: res.imported }) });
          setSteamInput("");
          refresh();
        },
        onError: (e: any) => {
          const msg = e?.response?.data?.error || e?.data?.error || t("toasts.steamLinkFailedDefault");
          toast({ title: t("toasts.steamLinkFailed"), description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleSyncSteam = () => {
    syncSteam.mutate(undefined as any, {
      onSuccess: (res) => {
        toast({ title: t("toasts.steamSynced"), description: t("toasts.steamSyncedDescription", { count: res.imported }) });
        refresh();
      },
      onError: () => toast({ title: t("toasts.syncFailed"), variant: "destructive" }),
    });
  };

  const handleLinkManual = () => {
    if (!manualHandle.trim()) return;
    linkAccount.mutate(
      { data: { platform: manualPlatform, handle: manualHandle.trim() } },
      {
        onSuccess: () => {
          toast({ title: t("toasts.accountLinked", { platform: platformLabel(manualPlatform) }) });
          setManualHandle("");
          refresh();
        },
        onError: () => toast({ title: t("toasts.accountLinkFailed"), variant: "destructive" }),
      }
    );
  };

  const handleUnlink = (accountId: number, label: string) => {
    unlinkAccount.mutate(
      { accountId },
      {
        onSuccess: () => {
          toast({ title: t("toasts.accountUnlinked", { label }) });
          refresh();
        },
        onError: () => toast({ title: t("toasts.unlinkFailed"), variant: "destructive" }),
      }
    );
  };

  const handleAddGame = () => {
    if (!gForm.name.trim()) return;
    // Client-side guard so invalid launch links get immediate, visible feedback.
    if (gForm.launchUri.trim() && !isValidLaunchUri(gForm.launchUri)) {
      setGError(t("toasts.invalidLaunchError"));
      toast({ title: t("toasts.invalidLaunchTitle"), description: t("toasts.invalidLaunchDescription"), variant: "destructive" });
      return;
    }
    setGError("");
    addGame.mutate(
      { data: { platform: gForm.platform, name: gForm.name.trim(), coverUrl: gForm.coverUrl.trim() || undefined, launchUri: gForm.launchUri.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: t("toasts.gameAdded") });
          setAddOpen(false);
          setGForm({ platform: gForm.platform, name: "", coverUrl: "", launchUri: "" });
          refresh();
        },
        onError: (e: any) => {
          const msg = e?.response?.data?.error || e?.data?.error || t("toasts.addFailedDefault");
          toast({ title: t("toasts.addFailed"), description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleRemoveGame = (gameId: number) => {
    removeGame.mutate({ gameId }, {
      onSuccess: () => { toast({ title: t("toasts.gameRemoved") }); refresh(); },
      onError: () => toast({ title: t("toasts.removeFailed"), variant: "destructive" }),
    });
  };

  const handleLaunch = (launchUri: string | null | undefined, name: string) => {
    if (!launchUri) {
      toast({ title: t("toasts.noLaunchLinkTitle"), description: t("toasts.noLaunchLinkDescription", { name }) });
      return;
    }
    // Protocol deep-link: opens the platform client if installed on the user's device.
    window.location.href = launchUri;
    toast({ title: t("toasts.launching", { name }), description: t("toasts.launchingDescription") });
    // A web page can't detect the native process, so mark the game as our active
    // presence ("ACTIVE PROCESS") when we trigger the launch.
    updateStatus.mutate(
      { data: { currentGame: name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          if (myId) queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(myId) });
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <LibraryIcon className="w-7 h-7 text-primary" /> {t("header.title")}
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">{t("header.subtitle")}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-none gap-2"><Plus className="w-4 h-4" /> {t("header.addGame")}</Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border-border bg-card">
            <DialogHeader><DialogTitle className="font-mono uppercase">{t("addDialog.title")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">{t("addDialog.platform")}</label>
                <select
                  value={gForm.platform}
                  onChange={(e) => setGForm({ ...gForm, platform: e.target.value })}
                  className="w-full h-9 bg-background border border-border font-mono text-sm px-2 rounded-none"
                >
                  {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">{t("addDialog.gameName")}</label>
                <Input value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} className="font-mono rounded-none" placeholder={t("addDialog.gameNamePlaceholder")} />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">{t("addDialog.coverUrl")}</label>
                <Input value={gForm.coverUrl} onChange={(e) => setGForm({ ...gForm, coverUrl: e.target.value })} className="font-mono rounded-none" placeholder={t("addDialog.coverUrlPlaceholder")} />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-muted-foreground">{t("addDialog.launchLink")}</label>
                <Input value={gForm.launchUri} onChange={(e) => setGForm({ ...gForm, launchUri: e.target.value })} className="font-mono rounded-none" placeholder={LAUNCH_HINTS[gForm.platform] || t("addDialog.launchLinkFallbackPlaceholder")} />
                <p className="text-[10px] text-muted-foreground font-mono mt-1">{t("addDialog.launchLinkHint")}</p>
              </div>
              {gError && <p className="text-xs font-mono text-destructive">{gError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleAddGame} disabled={addGame.isPending || !gForm.name.trim()} className="font-mono rounded-none">{t("addDialog.submit")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Connect accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Steam */}
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm uppercase tracking-widest" style={{ color: platformColor("steam") }}>{t("steam.title")}</h2>
            {steamAccount && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none" title={t("steam.resync")} onClick={handleSyncSteam} disabled={syncSteam.isPending}>
                  <RefreshCw className={`w-4 h-4 ${syncSteam.isPending ? "animate-spin" : ""}`} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none text-destructive" title={t("steam.unlink")} onClick={() => handleUnlink(steamAccount.id, "Steam")} disabled={unlinkAccount.isPending}>
                  <Unlink className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          {steamAccount ? (
            <p className="text-xs font-mono text-muted-foreground">
              {t("steam.linked")}{" "}
              {steamAccount.profileUrl && (
                <a href={steamAccount.profileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t("steam.viewProfile")}</a>
              )}
            </p>
          ) : (
            <>
              <p className="text-xs font-mono text-muted-foreground">{t("steam.prompt")}</p>
              <div className="flex gap-2">
                <Input value={steamInput} onChange={(e) => setSteamInput(e.target.value)} placeholder={t("steam.inputPlaceholder")} className="font-mono rounded-none text-sm" />
                <Button onClick={handleLinkSteam} disabled={linkSteam.isPending || !steamInput.trim()} className="font-mono rounded-none gap-2 shrink-0">
                  <Link2 className="w-4 h-4" /> {linkSteam.isPending ? t("steam.importing") : t("steam.import")}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Other platforms */}
        <div className="bg-card border border-border p-4 space-y-3">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary">{t("other.title")}</h2>
          <div className="flex gap-2">
            <select value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)} className="h-9 bg-background border border-border font-mono text-sm px-2 rounded-none">
              {MANUAL_PLATFORMS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
            </select>
            <Input value={manualHandle} onChange={(e) => setManualHandle(e.target.value)} placeholder={t("other.handlePlaceholder")} className="font-mono rounded-none text-sm" />
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
              <span className="text-xs font-mono text-muted-foreground">{t("other.empty")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Games grid */}
      <div>
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 border-b border-border pb-2">
          {t("games.title")} {games ? t("games.count", { n: games.length }) : ""}
        </h2>
        {!games || games.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border">
            <Gamepad2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-mono text-sm text-muted-foreground">{t("games.empty")}</p>
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
                  <span className="absolute top-1 start-1 text-[9px] font-mono px-1.5 py-0.5 bg-background/80 border border-border" style={{ color: platformColor(g.platform) }}>
                    {platformLabel(g.platform)}
                  </span>
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <Button size="sm" className="font-mono rounded-none gap-1 h-8" onClick={() => handleLaunch(g.launchUri, g.name)}>
                      <Play className="w-3.5 h-3.5" /> {t("games.launch")}
                    </Button>
                    <Button size="sm" variant="ghost" className="font-mono rounded-none gap-1 h-7 text-destructive hover:text-destructive" onClick={() => handleRemoveGame(g.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> {t("games.remove")}
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs font-mono truncate" title={g.name}>{g.name}</p>
                  {typeof g.playtimeMinutes === "number" && g.playtimeMinutes > 0 && (
                    <p className="text-[10px] text-muted-foreground font-mono">{t("games.playtime", { count: Math.round(g.playtimeMinutes / 60) })}</p>
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
