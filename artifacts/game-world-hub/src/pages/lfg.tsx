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
import { Radar, Gamepad2, Monitor, Mic, MicOff, Plus, Users, Trophy, Check, Clock, Search, Trash2, X } from "lucide-react";

const createLfgSchema = z.object({
  game: z.string().min(1, "Game is required").max(100),
  platform: z.string().optional(),
  rank: z.string().optional(),
  neededPlayers: z.coerce.number().min(1).max(20),
  micRequired: z.boolean().default(false),
  expiresInHours: z.coerce.number().min(1).max(48),
  description: z.string().min(1, "Briefing is required").max(500),
});

type CreateLfgForm = z.infer<typeof createLfgSchema>;

function timeLeft(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "EXPIRED";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m LEFT` : `${m}m LEFT`;
}

export default function Lfg() {
  const queryClient = useQueryClient();
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
      expiresInHours: 12,
      description: "",
    },
  });

  const onSubmit = (data: CreateLfgForm) => {
    createLfg.mutate(
      { data },
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
            <Radar className="w-7 h-7 text-primary" /> LFG
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">SIGNAL FOR SQUAD // OPEN CALLS</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-none">
              <Plus className="w-4 h-4 mr-2" /> POST SIGNAL
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card rounded-none sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
                Broadcast Signal
              </DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="game"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Game</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder="e.g. Valorant" />
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
                        <FormLabel className="font-mono text-xs uppercase">Platform</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder="Any" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rank"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Rank / Tier</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder="Optional" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="neededPlayers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Slots</FormLabel>
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
                        <FormLabel className="font-mono text-xs uppercase">Mic</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                          <FormControl>
                            <SelectTrigger className="font-mono bg-background border-border rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border rounded-none font-mono">
                            <SelectItem value="false">Optional</SelectItem>
                            <SelectItem value="true">Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiresInHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">Expires</FormLabel>
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                          <FormControl>
                            <SelectTrigger className="font-mono bg-background border-border rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border rounded-none font-mono">
                            <SelectItem value="1">1h</SelectItem>
                            <SelectItem value="6">6h</SelectItem>
                            <SelectItem value="12">12h</SelectItem>
                            <SelectItem value="24">24h</SelectItem>
                            <SelectItem value="48">48h</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Briefing</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary resize-none" placeholder="What are you playing, what do you need?" />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <div className="pt-2 flex justify-end">
                  <Button type="submit" className="font-mono rounded-none tracking-widest w-full" disabled={createLfg.isPending}>
                    {createLfg.isPending ? "BROADCASTING..." : "BROADCAST"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="FILTER BY GAME, PLATFORM, PLAYER..."
          className="font-mono bg-background border-border rounded-none pl-10 focus-visible:ring-primary uppercase text-xs tracking-wider"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center font-mono text-sm text-muted-foreground">SCANNING FREQUENCIES...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
            NO OPEN SIGNALS // BE THE FIRST TO POST
          </div>
        ) : (
          filtered.map((post) => {
            const mine = me?.id === post.author.id;
            const remaining = timeLeft(post.expiresAt);
            return (
              <div key={post.id} className="bg-card border border-border flex flex-col hover:border-primary/50 transition-colors">
                <div className="p-4 border-b border-border bg-muted/20 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-sm bg-muted flex items-center justify-center font-mono text-sm overflow-hidden border border-border shrink-0">
                    {post.author.avatarUrl ? (
                      <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      post.author.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-primary font-bold">
                      <Gamepad2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{post.game}</span>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      @{post.author.username}
                    </div>
                  </div>
                  {remaining && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" /> {remaining}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                      <Monitor className="w-3 h-3" /> {post.platform || "Any"}
                    </span>
                    {post.rank && (
                      <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                        <Trophy className="w-3 h-3" /> {post.rank}
                      </span>
                    )}
                    <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
                      <Users className="w-3 h-3" /> Needs {post.neededPlayers}
                    </span>
                    <span className={`flex items-center gap-1 border px-2 py-0.5 ${post.micRequired ? "border-primary/60 text-primary" : "border-border text-muted-foreground"}`}>
                      {post.micRequired ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />} {post.micRequired ? "Mic req" : "No mic"}
                    </span>
                  </div>

                  <p className="text-sm text-foreground/90 leading-relaxed">{post.description}</p>

                  <div className="flex items-center justify-between mt-auto pt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {post.responders.slice(0, 4).map((r) => (
                          <div key={r.id} className="w-7 h-7 rounded-full border-2 border-card bg-muted flex items-center justify-center font-mono text-[10px] overflow-hidden" title={r.displayName}>
                            {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" /> : r.displayName.charAt(0)}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {post.responseCount} {post.responseCount === 1 ? "reply" : "replies"}
                      </span>
                    </div>

                    {mine ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="font-mono rounded-none text-xs"
                          disabled={close.isPending}
                          onClick={() => close.mutate({ postId: post.id }, { onSuccess: invalidate })}
                        >
                          <X className="w-3 h-3 mr-1" /> CLOSE
                        </Button>
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
                        <Check className="w-3 h-3 mr-1" /> SIGNAL SENT
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="font-mono rounded-none text-xs"
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ postId: post.id, data: {} }, { onSuccess: invalidate })}
                      >
                        RESPOND
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
