import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Plus, Users, Gamepad2, Calendar, Search, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TournamentSummary {
  id: number;
  name: string;
  game: string;
  description: string | null;
  maxParticipants: number;
  status: "upcoming" | "active" | "completed";
  startDate: string | null;
  createdAt: string;
  participantCount: number;
  isFull: boolean;
  hasJoined: boolean;
  isCreator: boolean;
  creator: { id: number; username: string; displayName: string; avatarUrl: string | null };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TournamentSummary["status"] }) {
  const { t } = useTranslation("tournaments");
  const cfg = {
    upcoming: "border-blue-500/40 text-blue-400 bg-blue-500/10",
    active:   "border-green-500/40 text-green-400 bg-green-500/10",
    completed:"border-muted-foreground/30 text-muted-foreground bg-muted/30",
  }[status];
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cfg}`}>
      {t(`status.${status}`)}
    </span>
  );
}

// ── Tournament card ───────────────────────────────────────────────────────────

function TournamentCard({
  t: tournament,
  myId,
  onJoin,
  onLeave,
  isJoining,
}: {
  t: TournamentSummary;
  myId: number | undefined;
  onJoin: (id: number) => void;
  onLeave: (id: number) => void;
  isJoining: boolean;
}) {
  const { t } = useTranslation("tournaments");

  return (
    <div className={`border bg-card flex flex-col transition-colors hover:border-primary/40 ${tournament.status === "completed" ? "opacity-75" : ""}`}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <StatusBadge status={tournament.status} />
            {tournament.isFull && tournament.status === "upcoming" && (
              <span className="border border-orange-500/40 text-orange-400 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">
                {t("card.full")}
              </span>
            )}
          </div>
          <Link href={`/tournaments/${tournament.id}`}>
            <h3 className="font-mono font-bold text-sm hover:text-primary transition-colors truncate">
              {tournament.name}
            </h3>
          </Link>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-muted-foreground">
            <Gamepad2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{tournament.game}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xs text-muted-foreground">
            <Users className="w-3 h-3 inline me-1" />
            {t("card.participants", { count: tournament.participantCount, max: tournament.maxParticipants })}
          </div>
          {tournament.startDate && (
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              <Calendar className="w-3 h-3 inline me-1" />
              {format(new Date(tournament.startDate), "MMM d")}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 flex items-center justify-between gap-3 mt-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-sm bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
            {tournament.creator.avatarUrl ? (
              <img src={tournament.creator.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono text-[8px] text-muted-foreground">{tournament.creator.displayName.charAt(0)}</span>
            )}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground truncate">
            {t("card.by")} {tournament.creator.displayName}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          {tournament.status !== "upcoming" ? (
            <Link href={`/tournaments/${tournament.id}`}>
              <Button variant="outline" size="sm" className="font-mono rounded-none text-xs h-7">
                {t("card.view")}
              </Button>
            </Link>
          ) : tournament.isCreator ? (
            <Link href={`/tournaments/${tournament.id}`}>
              <Button variant="outline" size="sm" className="font-mono rounded-none text-xs h-7">
                {t("card.view")}
              </Button>
            </Link>
          ) : tournament.hasJoined ? (
            <Button
              variant="outline"
              size="sm"
              className="font-mono rounded-none text-xs h-7 hover:text-destructive hover:border-destructive/50"
              onClick={() => onLeave(tournament.id)}
              disabled={isJoining}
            >
              {t("card.leave")}
            </Button>
          ) : (
            <Button
              size="sm"
              className="font-mono rounded-none text-xs h-7"
              onClick={() => onJoin(tournament.id)}
              disabled={isJoining || tournament.isFull || !myId}
            >
              {t("card.join")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Tournament Dialog ──────────────────────────────────────────────────

function CreateTournamentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation("tournaments");
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [desc, setDesc] = useState("");
  const [slots, setSlots] = useState<4 | 8 | 16 | 32>(8);
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setName(""); setGame(""); setDesc(""); setSlots(8); setStartDate(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !game.trim()) return;
    setSubmitting(true);
    try {
      await customFetch("/api/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), game: game.trim(), description: desc.trim() || undefined, maxParticipants: slots, startDate: startDate || undefined }),
      });
      toast({ title: t("toasts.created") });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      toast({ title: (err as { message?: string })?.message ?? t("toasts.createFailed"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-card border-border rounded-none max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest text-primary">{t("create.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-mono text-xs uppercase text-muted-foreground block mb-1.5">{t("create.nameLabel")}</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("create.namePlaceholder")} className="font-mono bg-background border-border rounded-none" maxLength={80} required />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-muted-foreground block mb-1.5">{t("create.gameLabel")}</label>
            <Input value={game} onChange={e => setGame(e.target.value)} placeholder={t("create.gamePlaceholder")} className="font-mono bg-background border-border rounded-none" maxLength={60} required />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-muted-foreground block mb-1.5">{t("create.slotsLabel")}</label>
            <div className="grid grid-cols-4 gap-2">
              {([4, 8, 16, 32] as const).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSlots(n)}
                  className={`border py-2 font-mono text-sm font-bold transition-colors ${slots === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-muted-foreground block mb-1.5">{t("create.startDateLabel")}</label>
            <Input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="font-mono bg-background border-border rounded-none" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-muted-foreground block mb-1.5">{t("create.descLabel")}</label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder={t("create.descPlaceholder")} className="font-mono bg-background border-border rounded-none resize-none" rows={3} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="submit" className="font-mono rounded-none w-full tracking-widest" disabled={submitting || !name.trim() || !game.trim()}>
              {submitting ? t("create.submitting") : t("create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Tournaments() {
  const { t } = useTranslation("tournaments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [statusFilter, setStatusFilter] = useState<"" | "upcoming" | "active" | "completed">("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery<{ tournaments: TournamentSummary[] }>({
    queryKey: ["tournaments", statusFilter],
    queryFn: () => customFetch(`/api/tournaments${statusFilter ? `?status=${statusFilter}` : ""}`),
    refetchInterval: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tournaments"] });

  const joinMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/tournaments/${id}/join`, { method: "POST" }),
    onSuccess: () => { toast({ title: t("toasts.joined") }); invalidate(); },
    onError: (err: unknown) => toast({ title: (err as { message?: string })?.message ?? t("toasts.joinFailed"), variant: "destructive" }),
  });

  const leaveMut = useMutation({
    mutationFn: (id: number) => customFetch(`/api/tournaments/${id}/join`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: t("toasts.left") }); invalidate(); },
    onError: (err: unknown) => toast({ title: (err as { message?: string })?.message ?? t("toasts.leaveFailed"), variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!data?.tournaments) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.tournaments;
    return data.tournaments.filter(t =>
      t.name.toLowerCase().includes(q) || t.game.toLowerCase().includes(q)
    );
  }, [data, search]);

  const STATUS_TABS = ["", "upcoming", "active", "completed"] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Trophy className="w-7 h-7 text-primary" /> {t("header.title")}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.subtitle")}</p>
        </div>
        {me && (
          <Button className="font-mono rounded-none" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 me-2" /> {t("header.createButton")}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex border border-border">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {s === "" ? t("filter.all") : t(`filter.${s}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("filter.searchPlaceholder")}
            className="font-mono bg-background border-border rounded-none ps-9 text-xs h-9"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-16 text-center font-mono text-sm text-muted-foreground animate-pulse">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tournament => (
            <TournamentCard
              key={tournament.id}
              t={tournament}
              myId={me?.id}
              onJoin={id => joinMut.mutate(id)}
              onLeave={id => leaveMut.mutate(id)}
              isJoining={joinMut.isPending || leaveMut.isPending}
            />
          ))}
        </div>
      )}

      <CreateTournamentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />
    </div>
  );
}
