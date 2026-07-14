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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Radar, Gamepad2, Monitor, Mic, MicOff, Plus, Users, Trophy, Check, Clock, Search, Trash2, X, Lock } from "lucide-react";

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

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: posts, isLoading } = useListLfgPosts(undefined, {
    query: { refetchInterval: 8000, queryKey: getListLfgPostsQueryKey() },
  });

  const createLfg = useCreateLfgPost();
  const respond = useRespondToLfgPost();
  const close = useCloseLfgPost();
  const remove = useDeleteLfgPost();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

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

  const filtered = useMemo(() => {
    if (!posts) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.game.toLowerCase().includes(q) ||
        (p.platform ?? "").toLowerCase().includes(q) ||
        p.author.displayName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [posts, filter]);

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

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filter.placeholder")}
          className="font-mono bg-background border-border rounded-none ps-10 focus-visible:ring-primary uppercase text-xs tracking-wider"
        />
      </div>

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
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      @{post.author.username}
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
                            disabled={close.isPending}
                            onClick={() => close.mutate({ postId: post.id }, { onSuccess: invalidate })}
                          >
                            <X className="w-3 h-3 me-1" /> {t("card.close")}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-mono rounded-none text-xs text-destructive hover:text-destructive"
                          disabled={remove.isPending}
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
                        onClick={() => !isClosed && respond.mutate({ postId: post.id, data: {} }, { onSuccess: invalidate })}
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
    </div>
  );
}
