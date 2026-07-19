import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useGetMe, getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Zap, Search, Plus, Clock, Users, ChevronRight, X, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { TierPip } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";

// ── Types ────────────────────────────────────────────────────────────────────

type BountyStatus = "open" | "in_progress" | "completed" | "expired" | "cancelled";

type Bounty = {
  id: number;
  game: string;
  title: string;
  description: string;
  xpReward: number;
  status: BountyStatus;
  expiresAt: string;
  timeLeft: string | null;
  applicantCount: number;
  createdAt: string;
  isCreator: boolean;
  myApplication: { id: number; status: string } | null;
  creator: { id: number; username: string; displayName: string; avatarUrl: string | null };
};

type Application = {
  id: number;
  bountyId: number;
  message: string;
  status: string;
  createdAt: string;
  applicant: { id: number; username: string; displayName: string; avatarUrl: string | null };
};

type BountyDetail = Bounty & {
  xpEscrow: number;
  applications: Application[];
};

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<BountyStatus, string> = {
  open:        "bg-primary/10 text-primary border border-primary/30",
  in_progress: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
  completed:   "bg-green-500/10 text-green-400 border border-green-500/30",
  expired:     "bg-muted text-muted-foreground border border-border",
  cancelled:   "bg-destructive/10 text-destructive border border-destructive/30",
};

function StatusBadge({ status, t }: { status: BountyStatus; t: (k: string) => string }) {
  const key = status === "open" ? "card.open"
    : status === "in_progress" ? "card.in_progress"
    : status === "completed"   ? "card.completed"
    : status === "expired"     ? "card.expired_badge"
    : "card.cancelled";
  return (
    <span className={`px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${STATUS_STYLES[status] ?? STATUS_STYLES.expired}`}>
      {t(key)}
    </span>
  );
}

// ── Avatar cell ───────────────────────────────────────────────────────────────

function Avatar({ user, size = 8 }: { user: { displayName: string; avatarUrl: string | null }; size?: number }) {
  const cls = `w-${size} h-${size} rounded-sm bg-muted flex items-center justify-center font-mono text-xs overflow-hidden border border-border shrink-0`;
  return (
    <div className={cls}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        : user.displayName.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Post Bounty Dialog ────────────────────────────────────────────────────────

function PostBountyDialog({
  open, onClose, onPosted, meXp,
}: {
  open: boolean; onClose: () => void; onPosted: () => void; meXp: number;
}) {
  const { t } = useTranslation("bounties");
  const { toast } = useToast();
  const [game, setGame] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState("100");
  const [durationHours, setDurationHours] = useState("24");

  const post = useMutation({
    mutationFn: (body: object) => customFetch("/api/bounties", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t("toast.posted", { cost: 50 }) });
      setGame(""); setTitle(""); setDescription(""); setXpReward("100"); setDurationHours("24");
      onPosted();
      onClose();
    },
    onError: (err: { message?: string }) =>
      toast({ title: err.message ?? t("toast.postFailed"), variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    post.mutate({ game: game.trim(), title: title.trim(), description: description.trim(), xpReward: Number(xpReward), durationHours: Number(durationHours) });
  };

  const ESCROW = 50;
  const canPost = meXp >= ESCROW;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="border-border bg-card rounded-none sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
            {t("dialog.title")}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground pt-1">
            {t("dialog.subtitle", { cost: ESCROW })}
          </DialogDescription>
        </DialogHeader>

        {!canPost ? (
          <div className="py-6 text-center font-mono text-sm text-destructive">
            {t("insufficientXp", { min: ESCROW, current: meXp })}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-mono text-xs uppercase text-muted-foreground">{t("dialog.game")}</label>
                <Input value={game} onChange={e => setGame(e.target.value)} placeholder={t("dialog.gamePlaceholder")}
                  className="font-mono bg-background border-border rounded-none focus-visible:ring-primary text-xs" required maxLength={60} />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs uppercase text-muted-foreground">{t("dialog.xpReward")}</label>
                <Select value={xpReward} onValueChange={setXpReward}>
                  <SelectTrigger className="font-mono bg-background border-border rounded-none text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-none font-mono">
                    {[50, 100, 150, 200, 300, 500].map(v => (
                      <SelectItem key={v} value={String(v)}>{v} XP</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-muted-foreground">{t("dialog.titleLabel")}</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("dialog.titlePlaceholder")}
                className="font-mono bg-background border-border rounded-none focus-visible:ring-primary text-xs" required maxLength={120} />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-muted-foreground">{t("dialog.description")}</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                placeholder={t("dialog.descriptionPlaceholder")}
                className="font-mono bg-background border-border rounded-none focus-visible:ring-primary resize-none text-xs" required maxLength={1000} />
              <p className="font-mono text-[9px] text-muted-foreground/60 text-right">{description.length}/1000</p>
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-muted-foreground">{t("dialog.duration")}</label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger className="font-mono bg-background border-border rounded-none text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border rounded-none font-mono">
                  <SelectItem value="24">{t("dialog.duration24h")}</SelectItem>
                  <SelectItem value="48">{t("dialog.duration48h")}</SelectItem>
                  <SelectItem value="72">{t("dialog.duration72h")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="font-mono rounded-none" disabled={post.isPending}>
                Cancel
              </Button>
              <Button type="submit" className="font-mono rounded-none" disabled={post.isPending}>
                {post.isPending ? t("dialog.submitting") : t("dialog.submit", { cost: ESCROW })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Apply Dialog ──────────────────────────────────────────────────────────────

function ApplyDialog({
  bounty, onClose, onApplied,
}: {
  bounty: Bounty; onClose: () => void; onApplied: () => void;
}) {
  const { t } = useTranslation("bounties");
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const apply = useMutation({
    mutationFn: (body: object) =>
      customFetch(`/api/bounties/${bounty.id}/apply`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: t("toast.applied") });
      onApplied();
      onClose();
    },
    onError: (err: { message?: string }) =>
      toast({ title: err.message ?? t("toast.applyFailed"), variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="border-border bg-card rounded-none sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
            {t("apply.title")}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground pt-1">
            {t("apply.bountyTitle", { title: bounty.title })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); apply.mutate({ message: message.trim() }); }} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="font-mono text-xs uppercase text-muted-foreground">{t("apply.message")}</label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
              placeholder={t("apply.messagePlaceholder")}
              className="font-mono bg-background border-border rounded-none focus-visible:ring-primary resize-none text-xs" required maxLength={500} />
            <p className="font-mono text-[9px] text-muted-foreground/60 text-right">{message.length}/500</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="font-mono rounded-none" disabled={apply.isPending}>Cancel</Button>
            <Button type="submit" className="font-mono rounded-none" disabled={apply.isPending || message.trim().length < 5}>
              {apply.isPending ? t("apply.submitting") : t("apply.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Bounty Detail Panel ───────────────────────────────────────────────────────

function BountyDetailPanel({
  bountyId, meId, onClose, onRefresh,
}: {
  bountyId: number; meId: number; onClose: () => void; onRefresh: () => void;
}) {
  const { t } = useTranslation("bounties");
  const { toast } = useToast();

  const { data: bounty, refetch } = useQuery<BountyDetail>({
    queryKey: ["bounty-detail", bountyId],
    queryFn: () => customFetch(`/api/bounties/${bountyId}`),
    staleTime: 5_000,
  });

  const acceptApp = useMutation({
    mutationFn: (appId: number) =>
      customFetch(`/api/bounties/${bountyId}/applications/${appId}/accept`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("toast.accepted") });
      refetch(); onRefresh();
    },
    onError: (err: { message?: string }) =>
      toast({ title: err.message ?? t("toast.acceptFailed"), variant: "destructive" }),
  });

  const completeBounty = useMutation({
    mutationFn: () => customFetch(`/api/bounties/${bountyId}/complete`, { method: "POST" }),
    onSuccess: (data: { xpAwarded: number }) => {
      toast({ title: t("toast.completed", { xp: data.xpAwarded }) });
      refetch(); onRefresh();
    },
    onError: (err: { message?: string }) =>
      toast({ title: err.message ?? t("toast.completeFailed"), variant: "destructive" }),
  });

  const cancelBounty = useMutation({
    mutationFn: () => customFetch(`/api/bounties/${bountyId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: t("toast.cancelled") });
      refetch(); onRefresh(); onClose();
    },
    onError: (err: { message?: string }) =>
      toast({ title: err.message ?? t("toast.cancelFailed"), variant: "destructive" }),
  });

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!bounty) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-full max-w-lg bg-card border border-border p-8 font-mono text-sm text-muted-foreground text-center animate-pulse">
          Loading…
        </div>
      </div>
    );
  }

  const isCreator = bounty.isCreator;
  const acceptedApp = bounty.applications.find(a => a.status === "accepted");
  const pendingApps = bounty.applications.filter(a => a.status === "pending");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 h-full w-full max-w-md bg-card border-s border-border overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-start gap-3 z-10">
          <div className="flex-1 min-w-0">
            <StatusBadge status={bounty.status as BountyStatus} t={t} />
            <h2 className="font-mono font-bold text-sm uppercase tracking-widest mt-1 leading-tight">{bounty.title}</h2>
            <p className="font-mono text-xs text-primary mt-0.5">{bounty.game}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Reward + time */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 border border-primary/30 bg-primary/5 px-3 py-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-sm font-bold text-primary">{bounty.xpReward} XP</span>
            </div>
            {bounty.timeLeft && (
              <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Clock className="w-3 h-3" /> {bounty.timeLeft}
              </span>
            )}
          </div>

          {/* Creator */}
          <div className="flex items-center gap-2">
            <Avatar user={bounty.creator} size={7} />
            <Link href={`/profile/${bounty.creator.id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
              @{bounty.creator.username}
            </Link>
          </div>

          {/* Description */}
          <p className="font-mono text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{bounty.description}</p>

          {/* ── APPLICANTS (creator view) ── */}
          {isCreator && (
            <div className="space-y-3">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                {t("detail.applicants")} ({bounty.applications.length})
              </h3>

              {bounty.applications.length === 0 && (
                <p className="font-mono text-xs text-muted-foreground">{t("detail.noApplicants")}</p>
              )}

              {bounty.applications.map(app => (
                <div key={app.id} className={`border p-3 space-y-2 ${app.status === "accepted" ? "border-green-500/40 bg-green-500/5" : "border-border"}`}>
                  <div className="flex items-center gap-2">
                    <Avatar user={app.applicant} size={6} />
                    <Link href={`/profile/${app.applicant.id}`} className="font-mono text-xs hover:text-primary">
                      @{app.applicant.username}
                    </Link>
                    {app.status === "accepted" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ms-auto" />
                    )}
                    {app.status === "rejected" && (
                      <span className="font-mono text-[9px] text-muted-foreground ms-auto uppercase">rejected</span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-foreground/70 leading-relaxed">{app.message}</p>
                  {bounty.status === "open" && app.status === "pending" && (
                    <Button
                      size="sm"
                      className="font-mono rounded-none text-xs w-full"
                      onClick={() => acceptApp.mutate(app.id)}
                      disabled={acceptApp.isPending}
                    >
                      {acceptApp.isPending ? t("detail.accepting") : t("detail.accept")}
                    </Button>
                  )}
                </div>
              ))}

              {/* Complete button — in_progress, creator has accepted someone */}
              {bounty.status === "in_progress" && acceptedApp && (
                <div className="pt-2 space-y-2">
                  {!confirmComplete ? (
                    <Button
                      className="font-mono rounded-none w-full text-xs bg-green-600 hover:bg-green-500"
                      onClick={() => setConfirmComplete(true)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 me-2" /> {t("detail.confirmComplete")}
                    </Button>
                  ) : (
                    <div className="border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                      <p className="font-mono text-xs text-green-400">
                        {t("detail.completeDesc", { xp: bounty.xpReward, escrow: bounty.xpEscrow })}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="font-mono rounded-none text-xs" onClick={() => setConfirmComplete(false)}>Cancel</Button>
                        <Button size="sm" className="font-mono rounded-none text-xs bg-green-600 hover:bg-green-500 flex-1"
                          onClick={() => completeBounty.mutate()} disabled={completeBounty.isPending}>
                          {completeBounty.isPending ? t("detail.completing") : t("detail.confirmComplete")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cancel button — open only */}
              {bounty.status === "open" && pendingApps.length === 0 && (
                <div className="pt-2">
                  {!confirmCancel ? (
                    <Button variant="outline" size="sm" className="font-mono rounded-none text-xs text-destructive border-destructive/30 hover:bg-destructive/10 w-full"
                      onClick={() => setConfirmCancel(true)}>
                      {t("detail.cancelBounty")}
                    </Button>
                  ) : (
                    <div className="border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="font-mono text-xs text-destructive">
                        {t("detail.cancelConfirm", { escrow: bounty.xpEscrow })}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="font-mono rounded-none text-xs" onClick={() => setConfirmCancel(false)}>Back</Button>
                        <Button size="sm" variant="destructive" className="font-mono rounded-none text-xs flex-1"
                          onClick={() => cancelBounty.mutate()} disabled={cancelBounty.isPending}>
                          {cancelBounty.isPending ? t("detail.cancelling") : t("detail.confirmCancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── APPLICANT's own status (non-creator) ── */}
          {!isCreator && bounty.myApplication && (
            <div className={`border p-3 font-mono text-xs space-y-1 ${bounty.myApplication.status === "accepted" ? "border-green-500/40 bg-green-500/5" : bounty.myApplication.status === "rejected" ? "border-border bg-muted/20" : "border-primary/30 bg-primary/5"}`}>
              <p className="uppercase tracking-widest text-[9px] text-muted-foreground">Your application</p>
              <p className={`font-bold ${bounty.myApplication.status === "accepted" ? "text-green-400" : bounty.myApplication.status === "rejected" ? "text-muted-foreground" : "text-primary"}`}>
                {bounty.myApplication.status === "accepted" ? "✓ Accepted — get to work!" : bounty.myApplication.status === "rejected" ? "Not selected" : "Pending review…"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bounty Card ───────────────────────────────────────────────────────────────

function BountyCard({
  bounty, onSelect, onApply,
}: {
  bounty: Bounty; onSelect: (b: Bounty) => void; onApply: (b: Bounty) => void;
}) {
  const { t } = useTranslation("bounties");
  const isActive = bounty.status === "open" || bounty.status === "in_progress";

  return (
    <div className={`border flex flex-col transition-colors ${isActive ? "bg-card border-border hover:border-primary/50" : "bg-muted/20 border-border opacity-60"}`}>
      {/* Card head */}
      <div className="p-4 border-b border-border flex items-start gap-3 bg-muted/10">
        <Avatar user={bounty.creator} size={9} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-primary truncate">{bounty.game}</span>
            <StatusBadge status={bounty.status as BountyStatus} t={t} />
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">@{bounty.creator.username}</p>
        </div>
        {bounty.timeLeft && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" /> {bounty.timeLeft}
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <h3 className="font-mono text-sm font-bold leading-snug line-clamp-2">{bounty.title}</h3>
        <p className="font-mono text-xs text-muted-foreground leading-relaxed line-clamp-3">{bounty.description}</p>

        <div className="flex items-center gap-3 mt-auto pt-2">
          <div className="flex items-center gap-1 border border-primary/30 bg-primary/5 px-2 py-1">
            <Zap className="w-3 h-3 text-primary" />
            <span className="font-mono text-xs font-bold text-primary">{bounty.xpReward} XP</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <Users className="w-3 h-3" />
            {t("card.applicants", { count: bounty.applicantCount })}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="font-mono rounded-none text-xs flex-1"
          onClick={() => onSelect(bounty)}
        >
          {t("card.viewDetails")} <ChevronRight className="w-3 h-3 ms-1" />
        </Button>
        {!bounty.isCreator && bounty.status === "open" && !bounty.myApplication && (
          <Button
            size="sm"
            className="font-mono rounded-none text-xs"
            onClick={() => onApply(bounty)}
          >
            {t("card.apply")}
          </Button>
        )}
        {!bounty.isCreator && bounty.myApplication && (
          <span className="flex items-center gap-1 font-mono text-xs text-primary border border-primary/30 px-3">
            <CheckCircle2 className="w-3 h-3" /> {t("card.applied")}
          </span>
        )}
        {bounty.isCreator && (
          <span className="flex items-center font-mono text-[10px] text-muted-foreground border border-border px-2">
            {t("card.yourBounty")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Bounties() {
  const { t } = useTranslation("bounties");
  const queryClient = useQueryClient();

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const meXp = (me as { totalXp?: number })?.totalXp ?? 0;

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [gameSearch, setGameSearch] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [applyBounty, setApplyBounty] = useState<Bounty | null>(null);

  const bountyQueryKey = ["bounties", statusFilter, gameSearch];
  const { data: bounties, isLoading } = useQuery<Bounty[]>({
    queryKey: bountyQueryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (gameSearch.trim()) params.set("game", gameSearch.trim());
      return customFetch(`/api/bounties?${params.toString()}`);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bounties"] });

  const TABS: Array<{ key: string; label: string }> = [
    { key: "open",        label: t("tabs.open") },
    { key: "in_progress", label: t("tabs.in_progress") },
    { key: "completed",   label: t("tabs.completed") },
    { key: "all",         label: t("tabs.all") },
  ];

  const debouncedSearch = useMemo(() => gameSearch, [gameSearch]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Zap className="w-7 h-7 text-primary" /> {t("header.title")}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.subtitle")}</p>
        </div>
        <Button className="font-mono rounded-none" onClick={() => setPostOpen(true)}>
          <Plus className="w-4 h-4 me-2" /> {t("header.postBounty")}
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              statusFilter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={gameSearch}
          onChange={e => setGameSearch(e.target.value)}
          placeholder={t("filter.searchPlaceholder")}
          className="font-mono bg-background border-border rounded-none ps-10 focus-visible:ring-primary text-xs uppercase tracking-wider"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center font-mono text-sm text-muted-foreground animate-pulse">
            {t("loading")}
          </div>
        ) : !bounties || bounties.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          bounties.map(b => (
            <BountyCard
              key={b.id}
              bounty={b}
              onSelect={setSelectedBounty}
              onApply={setApplyBounty}
            />
          ))
        )}
      </div>

      {/* Post dialog */}
      <PostBountyDialog
        open={postOpen}
        onClose={() => setPostOpen(false)}
        onPosted={invalidate}
        meXp={meXp}
      />

      {/* Apply dialog */}
      {applyBounty && (
        <ApplyDialog
          bounty={applyBounty}
          onClose={() => setApplyBounty(null)}
          onApplied={invalidate}
        />
      )}

      {/* Detail panel */}
      {selectedBounty && me && (
        <BountyDetailPanel
          bountyId={selectedBounty.id}
          meId={me.id}
          onClose={() => setSelectedBounty(null)}
          onRefresh={invalidate}
        />
      )}
    </div>
  );
}
