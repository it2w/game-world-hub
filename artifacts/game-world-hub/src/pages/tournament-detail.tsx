import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Gamepad2, Calendar, Crown, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface BracketMatch {
  id: number;
  position: number;
  player1: UserSummary | null;
  player2: UserSummary | null;
  winner: UserSummary | null;
}

interface BracketRound {
  round: number;
  matches: BracketMatch[];
}

interface TournamentDetail {
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
  creator: UserSummary;
  participants: Array<{
    userId: number;
    seedNumber: number | null;
    joinedAt: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
}

interface BracketData {
  rounds: BracketRound[];
  champion: UserSummary | null;
}

// ── Bracket visualization ─────────────────────────────────────────────────────

function PlayerSlot({
  player,
  isWinner,
  isBye,
  onClick,
  clickable,
}: {
  player: UserSummary | null;
  isWinner: boolean;
  isBye: boolean;
  onClick?: () => void;
  clickable: boolean;
}) {
  const { t } = useTranslation("tournaments");

  if (isBye) {
    return (
      <div className="h-9 flex items-center px-2.5 border border-dashed border-border/40 bg-muted/10 font-mono text-xs text-muted-foreground/50 italic">
        {t("detail.bye")}
      </div>
    );
  }

  if (!player) {
    return (
      <div className="h-9 flex items-center px-2.5 border border-dashed border-border/40 bg-muted/5 font-mono text-xs text-muted-foreground/30 italic">
        TBD
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={`h-9 w-full flex items-center gap-2 px-2.5 border transition-all text-start ${
        isWinner
          ? "border-primary/60 bg-primary/10 text-primary font-bold"
          : clickable
            ? "border-border hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
            : "border-border bg-transparent cursor-default"
      }`}
    >
      <div className="w-5 h-5 rounded-sm bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-[8px] text-muted-foreground">{player.displayName.charAt(0)}</span>
        )}
      </div>
      <span className="font-mono text-xs truncate flex-1">{player.displayName}</span>
      {isWinner && <Check className="w-3 h-3 text-primary shrink-0" />}
    </button>
  );
}

function MatchCard({
  match,
  isCreator,
  isTournamentActive,
  onSetWinner,
}: {
  match: BracketMatch;
  isCreator: boolean;
  isTournamentActive: boolean;
  onSetWinner: (matchId: number, player: UserSummary) => void;
}) {
  const { t } = useTranslation("tournaments");
  const isDone = match.winner !== null;
  const canEdit = isCreator && isTournamentActive && !isDone;

  // BYE: one player is null, the other should auto-advance (creator sets the winner)
  const p1Bye = match.player1 === null && match.player2 !== null;
  const p2Bye = match.player2 === null && match.player1 !== null;

  return (
    <div className={`border bg-card ${isDone ? "border-border/40" : "border-border"} min-w-[160px] max-w-[200px]`}>
      <div className="p-1 space-y-0.5">
        <PlayerSlot
          player={match.player1}
          isWinner={match.winner?.id === match.player1?.id}
          isBye={p1Bye}
          clickable={canEdit && !!match.player1 && !p1Bye}
          onClick={() => match.player1 && onSetWinner(match.id, match.player1)}
        />
        <div className="text-center font-mono text-[9px] text-muted-foreground/50 py-0.5">{t("detail.vs")}</div>
        <PlayerSlot
          player={match.player2}
          isWinner={match.winner?.id === match.player2?.id}
          isBye={p2Bye}
          clickable={canEdit && !!match.player2 && !p2Bye}
          onClick={() => match.player2 && onSetWinner(match.id, match.player2)}
        />
      </div>
      {isDone && (
        <div className="px-2 pb-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center border-t border-border/30 mt-0.5 pt-1">
          {t("detail.matchComplete")}
        </div>
      )}
      {canEdit && match.player1 && match.player2 && (
        <div className="px-2 pb-1.5 font-mono text-[9px] uppercase tracking-widest text-primary/70 text-center border-t border-border/30 mt-0.5 pt-1">
          {t("detail.setWinner")}
        </div>
      )}
    </div>
  );
}

function BracketView({
  bracket,
  isCreator,
  isTournamentActive,
  totalParticipants,
  onSetWinner,
}: {
  bracket: BracketData;
  isCreator: boolean;
  isTournamentActive: boolean;
  totalParticipants: number;
  onSetWinner: (matchId: number, player: UserSummary) => void;
}) {
  const { t } = useTranslation("tournaments");
  const totalRounds = bracket.rounds.length;

  const getRoundLabel = (round: number) => {
    const fromEnd = totalRounds - round;
    if (fromEnd === 0) return t("detail.finalLabel");
    if (fromEnd === 1) return t("detail.semifinalLabel");
    if (fromEnd === 2) return t("detail.quarterLabel");
    return t("detail.roundLabel", { n: round });
  };

  if (bracket.rounds.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-0 min-w-max">
        {bracket.rounds.map((round, ri) => {
          const isLast = ri === bracket.rounds.length - 1;
          return (
            <div key={round.round} className="flex flex-col">
              {/* Round header */}
              <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-center border-b border-border bg-muted/10 min-w-[208px]">
                {getRoundLabel(round.round)}
              </div>
              {/* Matches column */}
              <div className="flex flex-col justify-around flex-1 px-3 py-4 gap-3 border-e border-border/50 last:border-e-0">
                {round.matches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    isCreator={isCreator}
                    isTournamentActive={isTournamentActive}
                    onSetWinner={onSetWinner}
                  />
                ))}
              </div>
              {/* Champion banner after final */}
              {isLast && bracket.champion && (
                <div className="px-3 pt-0 pb-3">
                  <div className="border border-primary/40 bg-primary/5 p-3 text-center min-w-[160px] max-w-[200px] mx-auto">
                    <Crown className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="font-mono text-[10px] uppercase tracking-widest text-primary/70 mb-1">{t("detail.champion")}</div>
                    <div className="font-mono text-sm font-bold text-primary">{bracket.champion.displayName}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Set Winner Confirm Dialog ─────────────────────────────────────────────────

function SetWinnerDialog({
  matchId,
  player,
  onConfirm,
  onCancel,
  isLoading,
}: {
  matchId: number;
  player: UserSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation("tournaments");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-card border border-border p-6 max-w-xs w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-mono text-sm uppercase tracking-widest mb-1">{t("detail.selectWinner")}</h3>
        <div className="flex items-center gap-3 my-4">
          <div className="w-10 h-10 rounded-sm bg-muted border border-border overflow-hidden flex items-center justify-center">
            {player.avatarUrl ? (
              <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono text-sm">{player.displayName.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="font-mono font-bold">{player.displayName}</div>
            <div className="font-mono text-xs text-muted-foreground">@{player.username}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 font-mono rounded-none" onClick={onCancel} disabled={isLoading}>
            {t("detail.cancel")}
          </Button>
          <Button className="flex-1 font-mono rounded-none" onClick={onConfirm} disabled={isLoading}>
            {t("detail.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TournamentDetail() {
  const { t } = useTranslation("tournaments");
  const { toast } = useToast();
  const [, params] = useRoute("/tournaments/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const [pendingWinner, setPendingWinner] = useState<{ matchId: number; player: UserSummary } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const detailKey = ["tournament-detail", id];
  const bracketKey = ["tournament-bracket", id];

  const { data: tournament, isLoading } = useQuery<TournamentDetail>({
    queryKey: detailKey,
    queryFn: () => customFetch(`/api/tournaments/${id}`),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  const { data: bracket } = useQuery<BracketData>({
    queryKey: bracketKey,
    queryFn: () => customFetch(`/api/tournaments/${id}/bracket`),
    enabled: !!id && tournament?.status !== "upcoming",
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: bracketKey });
  };

  const handleJoin = async () => {
    setActionPending(true);
    try {
      await customFetch(`/api/tournaments/${id}/join`, { method: "POST" });
      toast({ title: t("toasts.joined") });
      invalidate();
    } catch (err: unknown) {
      toast({ title: (err as { message?: string })?.message ?? t("toasts.joinFailed"), variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  const handleLeave = async () => {
    setActionPending(true);
    try {
      await customFetch(`/api/tournaments/${id}/join`, { method: "DELETE" });
      toast({ title: t("toasts.left") });
      invalidate();
    } catch (err: unknown) {
      toast({ title: (err as { message?: string })?.message ?? t("toasts.leaveFailed"), variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  const handleStart = async () => {
    setActionPending(true);
    try {
      await customFetch(`/api/tournaments/${id}/start`, { method: "POST" });
      toast({ title: t("toasts.started") });
      invalidate();
    } catch (err: unknown) {
      toast({ title: (err as { message?: string })?.message ?? t("toasts.startFailed"), variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  const handleSetWinner = async () => {
    if (!pendingWinner) return;
    setActionPending(true);
    try {
      await customFetch(`/api/tournaments/${id}/matches/${pendingWinner.matchId}/result`, {
        method: "POST",
        body: JSON.stringify({ winnerId: pendingWinner.player.id }),
      });
      toast({ title: t("toasts.resultSaved") });
      setPendingWinner(null);
      invalidate();
    } catch (err: unknown) {
      toast({ title: (err as { message?: string })?.message ?? t("toasts.resultFailed"), variant: "destructive" });
    } finally {
      setActionPending(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center font-mono text-muted-foreground animate-pulse">Loading...</div>;
  }
  if (!tournament) {
    return <div className="p-12 text-center font-mono text-destructive">Tournament not found</div>;
  }

  const isCreator = tournament.isCreator || me?.id === tournament.creator.id;
  const isActive = tournament.status === "active";
  const isCompleted = tournament.status === "completed";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/tournaments" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary transition-colors">
        {t("detail.backToList")}
      </Link>

      {/* Header card */}
      <div className="bg-card border border-border p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className={`inline-flex items-center border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
                isCompleted ? "border-muted-foreground/30 text-muted-foreground" :
                isActive ? "border-green-500/40 text-green-400 bg-green-500/10" :
                "border-blue-500/40 text-blue-400 bg-blue-500/10"
              }`}>
                {t(`status.${tournament.status}`)}
              </span>
              {tournament.startDate && (
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(tournament.startDate), "MMM d, yyyy HH:mm")}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-mono font-bold tracking-tighter uppercase mb-1">{tournament.name}</h1>
            <div className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground mb-2">
              <Gamepad2 className="w-4 h-4" /> {tournament.game}
            </div>
            {tournament.description && (
              <p className="font-mono text-sm text-muted-foreground border-s-2 border-border ps-3 italic leading-relaxed">
                {tournament.description}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 shrink-0">
            {tournament.status === "upcoming" && !isCreator && !tournament.hasJoined && (
              <Button className="font-mono rounded-none" onClick={handleJoin} disabled={actionPending || tournament.isFull}>
                {t("card.join")}
              </Button>
            )}
            {tournament.status === "upcoming" && !isCreator && tournament.hasJoined && (
              <Button variant="outline" className="font-mono rounded-none hover:text-destructive hover:border-destructive/50" onClick={handleLeave} disabled={actionPending}>
                {t("card.leave")}
              </Button>
            )}
            {tournament.status === "upcoming" && isCreator && tournament.participantCount >= 2 && (
              <Button className="font-mono rounded-none" onClick={handleStart} disabled={actionPending}>
                {actionPending ? t("detail.starting") : t("detail.startTournament")}
              </Button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{t("card.participants", { count: tournament.participantCount, max: tournament.maxParticipants })}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{t("card.by")}</span>
            <Link href={`/profile/${tournament.creator.id}`} className="hover:text-primary transition-colors">
              {tournament.creator.displayName}
            </Link>
          </div>
        </div>
      </div>

      {/* Bracket + Participants layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        {/* Bracket */}
        <div className="bg-card border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary">{t("detail.bracketTitle")}</h2>
          </div>
          {tournament.status === "upcoming" ? (
            <div className="p-8 text-center font-mono text-sm text-muted-foreground">
              {isCreator ? t("detail.notStarted") : t("detail.waitingForStart")}
            </div>
          ) : bracket && bracket.rounds.length > 0 ? (
            <BracketView
              bracket={bracket}
              isCreator={isCreator}
              isTournamentActive={isActive}
              totalParticipants={tournament.maxParticipants}
              onSetWinner={(matchId, player) => setPendingWinner({ matchId, player })}
            />
          ) : (
            <div className="p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">Loading bracket...</div>
          )}
        </div>

        {/* Participants sidebar */}
        <div className="bg-card border border-border">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
              <Users className="w-4 h-4" /> {t("detail.participantsTitle")}
            </h2>
          </div>
          <div className="divide-y divide-border/50 max-h-[480px] overflow-y-auto">
            {tournament.participants.map(p => (
              <Link key={p.userId} href={`/profile/${p.userId}`}>
                <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <div className="w-7 h-7 rounded-sm bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-mono text-[9px] text-muted-foreground">{p.displayName.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-bold truncate">{p.displayName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">@{p.username}</div>
                  </div>
                  {p.seedNumber && (
                    <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 shrink-0">
                      #{p.seedNumber}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Set Winner confirmation dialog */}
      {pendingWinner && (
        <SetWinnerDialog
          matchId={pendingWinner.matchId}
          player={pendingWinner.player}
          onConfirm={handleSetWinner}
          onCancel={() => setPendingWinner(null)}
          isLoading={actionPending}
        />
      )}
    </div>
  );
}
