import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Calendar, Zap, Users, Clock, Plus, Gamepad2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import i18n from "@/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GwhEvent {
  id: number;
  type: "game_night" | "flash";
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  game: string | null;
  questKey: string | null;
  icon: string;
  maxParticipants: number | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  status: "active" | "completed" | "cancelled";
  xpReward: number;
  participantCount: number;
  viewerJoined: boolean;
  creatorId: number | null;
  createdAt: string;
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null | undefined): number {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0,
  );
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

function formatCountdown(ms: number, t: (k: string, opts?: any) => string): string {
  if (ms <= 0) return t("time.expired");
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return t("time.hm", { h, m });
  if (m > 0) return `${m}m ${s}s`;
  return t("time.seconds", { s });
}

// ── Flash Event Card ──────────────────────────────────────────────────────────
function FlashEventCard({ evt, onJoin, joining }: { evt: GwhEvent; onJoin: () => void; joining: boolean }) {
  const { t } = useTranslation("events");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const remaining = useCountdown(evt.expiresAt);
  const countdown = formatCountdown(remaining, t);
  const title = isAr && evt.titleAr ? evt.titleAr : evt.title;
  const description = isAr && evt.descriptionAr ? evt.descriptionAr : evt.description;
  const pct = remaining > 0 && evt.expiresAt
    ? Math.round((remaining / (48 * 3_600_000)) * 100)
    : 0;

  const HOW_TO_MAP: Record<string, string> = {
    post_lfg: "howToDesc_post_lfg",
    respond_lfg: "howToDesc_respond_lfg",
    send_messages: "howToDesc_send_messages",
    join_room: "howToDesc_join_room",
    add_friend: "howToDesc_add_friend",
  };
  const howToKey = evt.questKey ? (HOW_TO_MAP[evt.questKey] ?? "howToDesc_default") : "howToDesc_default";

  const QUEST_LINKS: Record<string, string> = {
    post_lfg: "/lfg",
    respond_lfg: "/lfg",
    send_messages: "/chat",
    join_room: "/rooms",
    add_friend: "/friends",
  };
  const actionLink = evt.questKey ? (QUEST_LINKS[evt.questKey] ?? "/") : "/";

  return (
    <div className="border border-orange-500/40 bg-card relative overflow-hidden">
      {/* Pulsing top bar */}
      <div className="h-1 bg-gradient-to-r from-orange-500 via-yellow-400 to-orange-500 animate-pulse" />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center text-2xl bg-orange-500/10 border border-orange-500/30">
              {evt.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-0.5 border border-orange-500/30">
                  ⚡ FLASH
                </span>
                {evt.xpReward > 0 && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-2 py-0.5 border border-yellow-400/30">
                    +{evt.xpReward} XP
                  </span>
                )}
              </div>
              <h2 className="font-mono font-bold text-sm mt-1 leading-tight">{title}</h2>
            </div>
          </div>
          {/* Countdown */}
          <div className="text-end shrink-0">
            <div className="font-mono text-[10px] text-muted-foreground uppercase">{t("flash.expiresIn")}</div>
            <div className={`font-mono font-bold text-sm tabular-nums ${remaining < 3_600_000 ? "text-red-400" : "text-orange-400"}`}>
              {countdown}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>

        {description && (
          <p className="font-mono text-xs text-muted-foreground">{description}</p>
        )}

        {/* How to complete */}
        <div className="border border-border/50 bg-muted/20 p-3 space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("flash.howTo")}</p>
          <p className="font-mono text-xs">{t(`flash.${howToKey}`)}</p>
        </div>

        {/* Stats + CTA */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("flash.completedBy", { count: evt.participantCount })}
          </span>
          {evt.viewerJoined ? (
            <div className="text-end">
              <div className="font-mono text-xs text-green-400 uppercase tracking-widest">{t("flash.complete")}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{t("flash.completeDesc", { xp: evt.xpReward })}</div>
            </div>
          ) : (
            <Link href={actionLink}>
              <Button size="sm" className="font-mono rounded-none text-xs uppercase tracking-widest bg-orange-500 hover:bg-orange-400 text-black">
                {t("flash.goComplete")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Game Night Card ───────────────────────────────────────────────────────────
function GameNightCard({ evt, onJoin, joining }: { evt: GwhEvent; onJoin: () => void; joining: boolean }) {
  const { t } = useTranslation("events");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const title = isAr && evt.titleAr ? evt.titleAr : evt.title;
  const description = isAr && evt.descriptionAr ? evt.descriptionAr : evt.description;
  const remaining = useCountdown(evt.scheduledAt);
  const isFull = evt.maxParticipants != null && evt.participantCount >= evt.maxParticipants;
  const isFuture = evt.scheduledAt && new Date(evt.scheduledAt) > new Date();

  const dateLabel = evt.scheduledAt
    ? new Date(evt.scheduledAt).toLocaleString(isAr ? "ar-SA" : "en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="border border-border bg-card hover:border-primary/40 transition-colors">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center text-xl bg-muted border border-border">
              🎮
            </div>
            <div>
              <h3 className="font-mono font-bold text-sm leading-tight">{title}</h3>
              {evt.game && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Gamepad2 className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-primary">{evt.game}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="font-mono text-[10px] text-muted-foreground">{t("gameNight.participants", { count: evt.participantCount })}</div>
            {evt.maxParticipants && (
              <div className="font-mono text-[10px] text-muted-foreground">{t("gameNight.maxParticipants", { count: evt.maxParticipants })}</div>
            )}
          </div>
        </div>

        {description && <p className="font-mono text-xs text-muted-foreground">{description}</p>}

        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground">{dateLabel}</span>
          </div>
          {isFuture ? (
            evt.viewerJoined ? (
              <span className="font-mono text-[10px] uppercase text-green-400 tracking-widest">{t("gameNight.joined")}</span>
            ) : isFull ? (
              <span className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest">{t("gameNight.full")}</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="font-mono rounded-none text-xs uppercase tracking-widest"
                disabled={joining}
                onClick={onJoin}
              >
                <Users className="w-3 h-3 me-1" />
                {t("gameNight.join")}
              </Button>
            )
          ) : (
            <span className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest">{t("gameNight.started")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Game Night Form ────────────────────────────────────────────────────
function CreateGameNightDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation("events");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");

  const create = useMutation({
    mutationFn: () =>
      customFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title,
          game: game || undefined,
          description: description || undefined,
          scheduledAt,
          maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: t("createForm.successTitle"), description: t("createForm.successDesc") });
      setOpen(false);
      setTitle(""); setGame(""); setDescription(""); setScheduledAt(""); setMaxParticipants("");
      onCreated();
    },
    onError: (e: any) => {
      toast({ title: t("createForm.errorTitle"), description: e?.data?.error, variant: "destructive" });
    },
  });

  const isValid = title.trim().length > 0 && scheduledAt.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-mono rounded-none text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5 me-1.5" />
          {t("gameNight.create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border rounded-none sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest text-sm border-b border-border pb-3">
            🎮 {t("createForm.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("createForm.fieldTitle")} *</label>
            <Input
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="font-mono rounded-none bg-background border-border"
              placeholder="Friday Night Valorant"
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("createForm.fieldGame")}</label>
            <Input
              value={game} onChange={(e) => setGame(e.target.value)}
              className="font-mono rounded-none bg-background border-border"
              placeholder="Valorant, Apex Legends…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("createForm.fieldScheduledAt")} *</label>
            <Input
              type="datetime-local"
              value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
              className="font-mono rounded-none bg-background border-border"
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("createForm.fieldMaxParticipants")}</label>
            <Input
              type="number" min={2} max={500}
              value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)}
              className="font-mono rounded-none bg-background border-border"
              placeholder="20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("createForm.fieldDescription")}</label>
            <Textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="font-mono rounded-none bg-background border-border resize-none"
              rows={2}
              placeholder="Open for all ranks — bring your A-game"
            />
          </div>
          <Button
            className="w-full font-mono rounded-none uppercase tracking-widest"
            disabled={!isValid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t("createForm.submitting") : t("createForm.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Events() {
  const { t } = useTranslation("events");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const [tab, setTab] = useState<"flash" | "gameNight">("flash");
  const queryClient = useQueryClient();
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<GwhEvent[]>({
    queryKey: ["events"],
    queryFn: () => customFetch("/api/events?status=active"),
    refetchInterval: 30_000,
  });

  const { data: flashEvent } = useQuery<GwhEvent | null>({
    queryKey: ["flash-active"],
    queryFn: () => customFetch("/api/events/flash/active"),
    refetchInterval: 60_000,
  });

  const join = useMutation({
    mutationFn: (eventId: number) =>
      customFetch(`/api/events/${eventId}/join`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["flash-active"] });
      toast({ title: "Registered! 🎉" });
      setJoiningId(null);
    },
    onError: (e: any) => {
      toast({ title: e?.data?.error ?? "Failed to join", variant: "destructive" });
      setJoiningId(null);
    },
  });

  const handleJoin = (eventId: number) => {
    setJoiningId(eventId);
    join.mutate(eventId);
  };

  const flashEvents = useMemo(() => events?.filter((e) => e.type === "flash") ?? [], [events]);
  const gameNights  = useMemo(() => events?.filter((e) => e.type === "game_night") ?? [], [events]);

  // Show active flash event first if it's not already in the list
  const displayFlash = useMemo((): GwhEvent[] => {
    if (!flashEvent) return flashEvents;
    const inList = flashEvents.find((e) => e.id === flashEvent.id);
    return inList ? flashEvents : [flashEvent, ...flashEvents];
  }, [flashEvent, flashEvents]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Zap className="w-7 h-7 text-orange-400" />
            {t("page.title")}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("page.subtitle")}</p>
        </div>
        {tab === "gameNight" && (
          <CreateGameNightDialog
            onCreated={() => queryClient.invalidateQueries({ queryKey: ["events"] })}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["flash", "gameNight"] as const).map((k) => (
          <button
            key={k}
            className={`font-mono text-xs uppercase tracking-widest px-4 py-2 transition-colors border-b-2 -mb-px ${
              tab === k
                ? k === "flash"
                  ? "border-orange-400 text-orange-400"
                  : "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(k)}
          >
            {k === "flash" ? (
              <><Zap className="w-3 h-3 inline me-1.5" />{t("tabs.flash")}</>
            ) : (
              <><Calendar className="w-3 h-3 inline me-1.5" />{t("tabs.gameNight")}</>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="border border-border bg-card animate-pulse h-48" />
          ))}
        </div>
      ) : tab === "flash" ? (
        displayFlash.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border space-y-2">
            <div className="text-4xl">⚡</div>
            <p className="font-mono text-sm text-muted-foreground">{t("flash.noActive")}</p>
            <p className="font-mono text-xs text-muted-foreground/60">{t("flash.noActiveDesc")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayFlash.map((evt) => (
              <FlashEventCard
                key={evt.id}
                evt={evt}
                onJoin={() => handleJoin(evt.id)}
                joining={joiningId === evt.id}
              />
            ))}
          </div>
        )
      ) : gameNights.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border space-y-2">
          <div className="text-4xl">🎮</div>
          <p className="font-mono text-sm text-muted-foreground">{t("gameNight.empty")}</p>
          <div className="pt-2">
            <CreateGameNightDialog
              onCreated={() => queryClient.invalidateQueries({ queryKey: ["events"] })}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gameNights.map((evt) => (
            <GameNightCard
              key={evt.id}
              evt={evt}
              onJoin={() => handleJoin(evt.id)}
              joining={joiningId === evt.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
