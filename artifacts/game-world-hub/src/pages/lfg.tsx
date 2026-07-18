import { useState, useMemo } from "react";
import {
  useListLfgPosts,
  useCreateLfgPost,
  useRespondToLfgPost,
  useCloseLfgPost,
  useDeleteLfgPost,
  getListLfgPostsQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useListParties,
  getListPartiesQueryKey,
  useInviteToParty,
  useCreateParty,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Radar, Gamepad2, Monitor, Mic, MicOff, Plus, Users, Trophy, Check, Clock, Search, Trash2, X, Lock, UserPlus, Zap, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TierPip } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";

type CreateLfgForm = {
  game: string;
  platform?: string;
  rank?: string;
  neededPlayers: number;
  micRequired: boolean;
  expiresHours: number;
  expiresMinutes: number;
  description: string;
};

export default function Lfg() {
  const { t } = useTranslation("lfg");
  const queryClient = useQueryClient();

  const createLfgSchema = useMemo(
    () =>
      z.object({
        game: z.string().min(1, t("validation.gameRequired")).max(100),
        platform: z.string().optional(),
        rank: z.string().optional(),
        neededPlayers: z.coerce.number().min(1).max(20),
        micRequired: z.boolean().default(false),
        expiresHours: z.coerce.number().min(0).max(47).default(0),
        expiresMinutes: z.coerce.number().min(0).max(59).default(30),
        description: z.string().min(1, t("validation.briefingRequired")).max(500),
      }).refine((d) => d.expiresHours * 60 + d.expiresMinutes >= 15, {
        message: t("validation.expiresMin"),
        path: ["expiresMinutes"],
      }),
    [t],
  );

  const timeLeft = (expiresAt: string | null | undefined): string | null => {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return t("time.expired");
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? t("time.leftHm", { h, m }) : t("time.leftM", { m });
  };

  const { toast } = useToast();

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: posts, isLoading } = useListLfgPosts(undefined, {
    query: { refetchInterval: 8000, queryKey: getListLfgPostsQueryKey() },
  });

  const createLfg = useCreateLfgPost();
  const respond = useRespondToLfgPost();
  const close = useCloseLfgPost();
  const remove = useDeleteLfgPost();
  const inviteToParty = useInviteToParty();
  const createParty = useCreateParty();

  const { data: parties } = useListParties({ query: { queryKey: getListPartiesQueryKey() } });

  // Parties where the current user is a member (to invite from)
  const myParties = useMemo(() => {
    if (!parties || !me) return [];
    return parties.filter((p) => p.members.some((m) => m.id === me.id));
  }, [parties, me]);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");

  const { data: suggestions } = useQuery<any[]>({
    queryKey: ["lfg-suggestions"],
    queryFn: () => customFetch("/api/lfg/suggestions"),
    refetchInterval: 30000,
  });
  // Track which responder the "create party & invite" popover is open for
  const [createPartyFor, setCreatePartyFor] = useState<{ id: number; displayName: string } | null>(null);
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartySize, setNewPartySize] = useState<number>(4);

  type LfgPost = NonNullable<typeof posts>[number];
  const [closeConfirmPost, setCloseConfirmPost] = useState<LfgPost | null>(null);
  // Track which responder IDs have already been invited in this session
  const [invitedIds, setInvitedIds] = useState<Set<number>>(new Set());

  // Single place to close the confirm dialog so both pieces of state always reset together
  const closeConfirmDialog = () => {
    setCloseConfirmPost(null);
    setInvitedIds(new Set());
  };

  const handleCreatePartyAndInvite = (userId: number, displayName: string, partyName: string, maxSize: number) => {
    createParty.mutate(
      { data: { name: partyName, maxSize } },
      {
        onSuccess: (newParty) => {
          queryClient.invalidateQueries({ queryKey: getListPartiesQueryKey() });
          inviteToParty.mutate(
            { partyId: newParty.id, data: { userId } },
            {
              onSuccess: () => {
                setInvitedIds((prev) => new Set([...prev, userId]));
                setCreatePartyFor(null);
                setNewPartyName("");
                setNewPartySize(4);
                toast({ title: t("closeConfirm.inviteSent", { name: displayName }) });
              },
              onError: () => toast({ title: t("closeConfirm.inviteFailed"), variant: "destructive" }),
            },
          );
        },
        onError: () => toast({ title: t("closeConfirm.createPartyFailed"), variant: "destructive" }),
      },
    );
  };

  const handleInviteResponder = (userId: number, displayName: string, partyId: number) => {
    inviteToParty.mutate(
      { partyId, data: { userId } },
      {
        onSuccess: () => {
          setInvitedIds((prev) => new Set([...prev, userId]));
          toast({ title: t("closeConfirm.inviteSent", { name: displayName }) });
        },
        onError: () => toast({ title: t("closeConfirm.inviteFailed"), variant: "destructive" }),
      },
    );
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListLfgPostsQueryKey() });

  const form = useForm<CreateLfgForm>({
    resolver: zodResolver(createLfgSchema),
    defaultValues: {
      game: "",
      platform: "",
      rank: "",
      neededPlayers: 1,
      micRequired: false,
      expiresHours: 0,
      expiresMinutes: 30,
      description: "",
    },
  });

  const onSubmit = (data: CreateLfgForm) => {
    const expiresInHours = data.expiresHours + data.expiresMinutes / 60;
    createLfg.mutate(
      { data: { ...data, expiresInHours } },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset();
          invalidate();
        },
      },
    );
  };

  const REGIONS = ["SA", "US", "EU", "MENA", "ASIA"];

  const filtered = useMemo(() => {
    if (!posts) return [];
    let result = posts;
    const q = filter.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.game.toLowerCase().includes(q) ||
          (p.platform ?? "").toLowerCase().includes(q) ||
          p.author.displayName.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      );
    }
    if (regionFilter) {
      result = result.filter(
        (p) =>
          p.description.toUpperCase().includes(regionFilter) ||
          (p.platform ?? "").toUpperCase().includes(regionFilter),
      );
    }
    return result;
  }, [posts, filter, regionFilter]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Radar className="w-7 h-7 text-primary" /> {t("header.title")}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.subtitle")}</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-none">
              <Plus className="w-4 h-4 me-2" /> {t("header.postSignal")}
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card rounded-none sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
                {t("dialog.title")}
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="game"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">{t("form.game")}</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.gamePlaceholder")} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.platform")}</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.platformPlaceholder")} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rank"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.rank")}</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.rankPlaceholder")} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="neededPlayers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.slots")}</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="micRequired"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.mic")}</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                          <FormControl>
                            <SelectTrigger className="font-mono bg-background border-border rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border rounded-none font-mono">
                            <SelectItem value="false">{t("form.micOptional")}</SelectItem>
                            <SelectItem value="true">{t("form.micRequired")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase mb-2 text-muted-foreground">{t("form.expires")}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="expiresHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">{t("form.expiresHours")}</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={47} {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder="0" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expiresMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">{t("form.expiresMinutes")}</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={59} {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder="30" />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">{t("form.expiresHint")}</p>
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">{t("form.briefing")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary resize-none" placeholder={t("form.briefingPlaceholder")} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <div className="pt-2 flex justify-end">
                  <Button type="submit" className="font-mono rounded-none tracking-widest w-full" disabled={createLfg.isPending}>
                    {createLfg.isPending ? t("dialog.broadcasting") : t("dialog.broadcast")}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + Region filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filter.placeholder")}
            className="font-mono bg-background border-border rounded-none ps-10 focus-visible:ring-primary uppercase text-xs tracking-wider"
          />
        </div>
        <div className="relative">
          <Globe className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="h-10 bg-background border border-border font-mono text-xs ps-8 pe-3 rounded-none focus:outline-none focus:ring-1 focus:ring-primary uppercase appearance-none min-w-[90px]"
          >
            <option value="">كل المناطق</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Suggestions — based on your current game */}
      {suggestions && suggestions.length > 0 && (
        <div className="border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-primary">مقترح لك</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((post: any) => (
              <div key={post.id} className="bg-card border border-primary/20 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center font-mono text-xs overflow-hidden border border-border shrink-0">
                  {post.author.avatarUrl ? (
                    <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    post.author.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-primary truncate">
                    <Gamepad2 className="w-3 h-3 shrink-0" /> {post.game}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">@{post.author.username}</p>
                  <p className="text-xs mt-1 line-clamp-1">{post.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center font-mono text-sm text-muted-foreground">{t("list.scanning")}</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
            {t("list.empty")}
          </div>
        ) : (
          filtered.map((post) => {
            const mine = me?.id === post.author.id;
            const isClosed = post.status === "closed";
            const remaining = timeLeft(post.expiresAt);
            return (
              <div key={post.id} className={`border flex flex-col transition-colors ${isClosed ? "bg-muted/30 border-border opacity-70" : "bg-card border-border hover:border-primary/50"}`}>
                <div className={`p-4 border-b border-border flex items-start gap-3 ${isClosed ? "bg-muted/10" : "bg-muted/20"}`}>
                  <div className="w-10 h-10 rounded-sm bg-muted flex items-center justify-center font-mono text-sm overflow-hidden border border-border shrink-0">
                    {post.author.avatarUrl ? (
                      <img src={post.author.avatarUrl} alt="" className={`w-full h-full object-cover ${isClosed ? "grayscale" : ""}`} />
                    ) : (
                      post.author.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-primary font-bold">
                      <Gamepad2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{post.game}</span>
                      {isClosed && (
                        <span className="flex items-center gap-1 border border-muted-foreground/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                          <Lock className="w-2.5 h-2.5" /> {t("card.closed")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate flex items-center gap-2">
                      @{post.author.username}
                      {post.author.tier && <TierPip tier={post.author.tier} />}
                      {post.author.isPro && <ProBadge size="sm" />}
                    </div>
                  </div>
                  {remaining && !isClosed && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" /> {remaining}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                      <Monitor className="w-3 h-3" /> {post.platform || t("card.platformAny")}
                    </span>
                    {post.rank && (
                      <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                        <Trophy className="w-3 h-3" /> {post.rank}
                      </span>
                    )}
                    <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                      <Users className="w-3 h-3" /> {t("card.needs", { count: post.neededPlayers })}
                    </span>
                    <span className={`flex items-center gap-1 border px-2 py-0.5 ${post.micRequired ? "border-primary/60 text-primary" : "border-border text-muted-foreground"}`}>
                      {post.micRequired ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />} {post.micRequired ? t("card.micReq") : t("card.noMic")}
                    </span>
                  </div>

                  <p className="text-sm text-foreground/90 leading-relaxed">{post.description}</p>

                  <div className="flex items-center justify-between mt-auto pt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2 rtl:space-x-reverse">
                        {post.responders.slice(0, 4).map((r) => (
                          <div key={r.id} className="w-7 h-7 rounded-full border-2 border-card bg-muted flex items-center justify-center font-mono text-[10px] overflow-hidden" title={r.displayName}>
                            {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" /> : r.displayName.charAt(0)}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {t("card.replies", { count: post.responseCount })}
                      </span>
                    </div>

                    {mine ? (
                      <div className="flex gap-2">
                        {!isClosed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-mono rounded-none text-xs"
                            onClick={() => setCloseConfirmPost(post)}
                          >
                            <X className="w-3 h-3 me-1" /> {t("card.close")}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-mono rounded-none text-xs text-destructive hover:text-destructive"
                          disabled={remove.isPending}
                          data-testid="btn-delete-post"
                          onClick={() => remove.mutate({ postId: post.id }, { onSuccess: invalidate })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : post.viewerHasResponded ? (
                      <Button variant="outline" size="sm" className="font-mono rounded-none text-xs text-primary border-primary/60" disabled>
                        <Check className="w-3 h-3 me-1" /> {t("card.signalSent")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="font-mono rounded-none text-xs"
                        disabled={respond.isPending || isClosed}
                        onClick={() =>
                          !isClosed &&
                          respond.mutate(
                            { postId: post.id, data: {} },
                            {
                              onSuccess: invalidate,
                              onError: (err: unknown) => {
                                const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response?.status;
                                const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
                                if (status === 409) {
                                  if (msg.toLowerCase().includes("expired")) {
                                    toast({ title: t("toasts.signalExpired"), variant: "destructive" });
                                  } else {
                                    toast({ title: t("toasts.signalClosed"), variant: "destructive" });
                                  }
                                  invalidate();
                                }
                              },
                            },
                          )
                        }
                      >
                        {t("card.respond")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Close confirmation dialog */}
      <Dialog open={!!closeConfirmPost} onOpenChange={(v) => { if (!v) closeConfirmDialog(); }}>
        <DialogContent className="border-border bg-card rounded-none sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
              {t("closeConfirm.title")}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground pt-2">
              {t("closeConfirm.subtitle", { game: closeConfirmPost?.game })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-64 overflow-y-auto py-2">
            {closeConfirmPost && closeConfirmPost.responders.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground text-center py-4">{t("closeConfirm.noResponders")}</p>
            ) : (
              closeConfirmPost?.responders.map((r) => {
                const alreadyInvited = invitedIds.has(r.id);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
                    {/* Profile link — left side */}
                    <Link href={`/profile/${r.id}`} onClick={closeConfirmDialog} className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                      <div className="w-8 h-8 rounded-sm bg-muted border border-border flex items-center justify-center font-mono text-xs overflow-hidden shrink-0">
                        {r.avatarUrl
                          ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : r.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold truncate">{r.displayName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate">@{r.username}</div>
                      </div>
                    </Link>

                    {/* Invite button — right side */}
                    {alreadyInvited ? (
                      <Button variant="ghost" size="sm" disabled className="font-mono rounded-none text-[10px] text-primary shrink-0 px-2">
                        <Check className="w-3 h-3 me-1" /> {t("closeConfirm.invited")}
                      </Button>
                    ) : myParties.length === 0 ? (
                      <Popover
                        open={createPartyFor?.id === r.id}
                        onOpenChange={(v) => {
                          if (v) {
                            setCreatePartyFor({ id: r.id, displayName: r.displayName });
                            setNewPartySize(Math.min(100, Math.max(2, closeConfirmPost?.neededPlayers ?? 4)));
                          } else {
                            setCreatePartyFor(null);
                            setNewPartyName("");
                            setNewPartySize(4);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-mono rounded-none text-[10px] shrink-0 px-2"
                          >
                            <UserPlus className="w-3 h-3 me-1" /> {t("closeConfirm.createAndInvite")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 bg-card border-border rounded-none" align="end">
                          <p className="font-mono text-[10px] uppercase text-muted-foreground mb-2">
                            {t("closeConfirm.newPartyName")}
                          </p>
                          <Input
                            value={newPartyName}
                            onChange={(e) => setNewPartyName(e.target.value)}
                            placeholder={t("closeConfirm.newPartyNamePlaceholder")}
                            className="font-mono bg-background border-border rounded-none text-xs mb-2 focus-visible:ring-primary"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newPartyName.trim()) {
                                handleCreatePartyAndInvite(r.id, r.displayName, newPartyName.trim(), newPartySize);
                              }
                            }}
                          />
                          <p className="font-mono text-[10px] uppercase text-muted-foreground mb-1">
                            {t("closeConfirm.partySizeLabel")}
                          </p>
                          <Input
                            type="number"
                            min={2}
                            max={100}
                            value={newPartySize}
                            onChange={(e) => setNewPartySize(Math.min(100, Math.max(2, Number(e.target.value) || 2)))}
                            className="font-mono bg-background border-border rounded-none text-xs mb-2 focus-visible:ring-primary"
                          />
                          <Button
                            size="sm"
                            className="font-mono rounded-none text-[10px] w-full"
                            disabled={!newPartyName.trim() || createParty.isPending || inviteToParty.isPending}
                            onClick={() => handleCreatePartyAndInvite(r.id, r.displayName, newPartyName.trim(), newPartySize)}
                          >
                            {createParty.isPending || inviteToParty.isPending
                              ? t("closeConfirm.creating")
                              : t("closeConfirm.createAndInviteConfirm")}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    ) : myParties.length === 1 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={inviteToParty.isPending}
                        className="font-mono rounded-none text-[10px] shrink-0 px-2"
                        onClick={() => handleInviteResponder(r.id, r.displayName, myParties[0].id)}
                      >
                        <UserPlus className="w-3 h-3 me-1" /> {t("closeConfirm.invite")}
                      </Button>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={inviteToParty.isPending}
                            className="font-mono rounded-none text-[10px] shrink-0 px-2"
                          >
                            <UserPlus className="w-3 h-3 me-1" /> {t("closeConfirm.invite")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1 bg-card border-border rounded-none" align="end">
                          <p className="font-mono text-[10px] uppercase text-muted-foreground px-2 py-1 border-b border-border mb-1">
                            {t("closeConfirm.selectParty")}
                          </p>
                          {myParties.map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-start px-2 py-1.5 font-mono text-xs hover:bg-muted/50 truncate"
                              onClick={() => handleInviteResponder(r.id, r.displayName, p.id)}
                            >
                              {p.name}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              className="font-mono rounded-none text-xs flex-1"
              onClick={closeConfirmDialog}
            >
              {t("closeConfirm.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="font-mono rounded-none text-xs flex-1"
              disabled={close.isPending}
              onClick={() => {
                if (!closeConfirmPost) return;
                close.mutate({ postId: closeConfirmPost.id }, {
                  onSuccess: () => {
                    closeConfirmDialog();
                    invalidate();
                  },
                });
              }}
            >
              {close.isPending ? t("closeConfirm.closing") : t("closeConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
