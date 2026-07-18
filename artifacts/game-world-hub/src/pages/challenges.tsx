import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Swords, Plus, Trophy, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ChallengeUser { id: number; username: string; displayName: string; avatarUrl: string | null }
interface Challenge {
  id: number;
  challenger: ChallengeUser;
  challenged: ChallengeUser;
  type: "most_hours" | "first_rank";
  detail: string | null;
  status: "pending" | "active" | "declined" | "completed" | "cancelled";
  winnerId: number | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

function timeLeft(endsAt: string, endedLabel: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return endedLabel;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

function TypeLabel({ type }: { type: string }) {
  const { t } = useTranslation("challenges");
  return (
    <span className={`font-mono text-xs uppercase px-2 py-0.5 border ${type === "most_hours" ? "border-yellow-500/40 text-yellow-400" : "border-blue-500/40 text-blue-400"}`}>
      {t(`types.${type}`)}
    </span>
  );
}

function StatusBadge({ status, winnerId, myId }: { status: string; winnerId: number | null; myId: number }) {
  const { t } = useTranslation("challenges");
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: t("status.pending"),   cls: "text-yellow-400 border-yellow-500/30" },
    active:    { label: t("status.active"),    cls: "text-green-400 border-green-500/30" },
    declined:  { label: t("status.declined"),  cls: "text-red-400 border-red-500/30" },
    completed: { label: winnerId === myId ? t("status.won") : t("status.lost"), cls: winnerId === myId ? "text-yellow-400 border-yellow-500/30" : "text-muted-foreground border-border" },
    cancelled: { label: t("status.cancelled"), cls: "text-muted-foreground border-border" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "border-border text-muted-foreground" };
  return <span className={`font-mono text-xs uppercase px-2 py-0.5 border ${cls}`}>{label}</span>;
}

function ChallengeCard({ c, myId, onAction }: { c: Challenge; myId: number; onAction: () => void }) {
  const { t } = useTranslation("challenges");
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutate = async (path: string, body?: object) => {
    await customFetch(`/api/challenges/${c.id}/${path}`, { method: "PATCH", body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } });
    qc.invalidateQueries({ queryKey: ["challenges"] });
    toast({ title: t("toasts.done") });
  };

  const isChallenged = c.challenged.id === myId;
  const isChallenger = c.challenger.id === myId;

  return (
    <div className="bg-card border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {c.challenger.avatarUrl ? (
              <img src={c.challenger.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center font-mono text-xs">{c.challenger.displayName[0]}</div>
            )}
            <span className="font-mono text-sm font-bold">{c.challenger.displayName}</span>
          </div>
          <Swords className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            {c.challenged.avatarUrl ? (
              <img src={c.challenged.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center font-mono text-xs">{c.challenged.displayName[0]}</div>
            )}
            <span className="font-mono text-sm font-bold">{c.challenged.displayName}</span>
          </div>
        </div>
        <StatusBadge status={c.status} winnerId={c.winnerId} myId={myId} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <TypeLabel type={c.type} />
        {c.status === "active" && (
          <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {timeLeft(c.endsAt, t("ended"))}
          </span>
        )}
      </div>

      {c.detail && <p className="font-mono text-xs text-muted-foreground">{c.detail}</p>}

      {c.status === "pending" && isChallenged && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="font-mono rounded-none h-7 text-xs" onClick={() => mutate("accept")}>
            <CheckCircle className="w-3 h-3 me-1" /> {t("actions.accept")}
          </Button>
          <Button size="sm" variant="outline" className="font-mono rounded-none h-7 text-xs" onClick={() => mutate("decline")}>
            <XCircle className="w-3 h-3 me-1" /> {t("actions.decline")}
          </Button>
        </div>
      )}

      {c.status === "active" && (
        <Button size="sm" variant="outline" className="font-mono rounded-none h-7 text-xs w-full" onClick={onAction}>
          <Trophy className="w-3 h-3 me-1" /> {t("actions.recordWinner")}
        </Button>
      )}

      {c.status === "pending" && isChallenger && (
        <Button size="sm" variant="ghost" className="font-mono rounded-none h-7 text-xs text-muted-foreground" onClick={async () => {
          await customFetch(`/api/challenges/${c.id}`, { method: "DELETE" });
          qc.invalidateQueries({ queryKey: ["challenges"] });
        }}>
          {t("actions.cancelChallenge")}
        </Button>
      )}
    </div>
  );
}

export default function ChallengesPage() {
  const { t } = useTranslation("challenges");
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const myId = me?.id ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: challenges, isLoading } = useQuery<Challenge[]>({
    queryKey: ["challenges"],
    queryFn: () => customFetch("/api/challenges"),
    refetchInterval: 15000,
  });

  // /api/friends returns { id (friendship id), since, friend: { id, username, displayName, ... } }
  // We need friend.id (user ID) for the challenge POST, not the friendship record id.
  const { data: friendsRaw } = useQuery<any[]>({
    queryKey: ["friends-list"],
    queryFn: () => customFetch("/api/friends"),
    enabled: !!myId,
  });
  const friends = (friendsRaw ?? []).map((f: any) => f.friend ?? f);

  const [tab, setTab] = useState<"active" | "pending" | "completed">("active");
  const [newOpen, setNewOpen] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState<Challenge | null>(null);

  const [friendId, setFriendId] = useState<number>(0);
  const [type, setType] = useState<"most_hours" | "first_rank">("most_hours");
  const [detail, setDetail] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [winnerId, setWinnerId] = useState<number>(0);
  const [completing, setCompleting] = useState(false);

  const createChallenge = async () => {
    if (!friendId || !endsAt) return;
    setCreating(true);
    try {
      await customFetch("/api/challenges", {
        method: "POST",
        body: JSON.stringify({ friendId, type, detail: detail || undefined, endsAt }),
        headers: { "Content-Type": "application/json" },
      });
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast({ title: t("toasts.sent") });
      setNewOpen(false);
      setFriendId(0); setType("most_hours"); setDetail(""); setEndsAt("");
    } catch (e: any) {
      toast({ title: t("toasts.error"), description: e?.data?.error ?? t("toasts.failedSend"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const completeChallenge = async () => {
    if (!winnerOpen || !winnerId) return;
    setCompleting(true);
    try {
      await customFetch(`/api/challenges/${winnerOpen.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({ winnerId }),
        headers: { "Content-Type": "application/json" },
      });
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast({ title: t("toasts.resultRecorded") });
      setWinnerOpen(null);
    } catch {
      toast({ title: t("toasts.error"), variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const filtered = (challenges ?? []).filter((c) => {
    if (tab === "active") return c.status === "active";
    if (tab === "pending") return c.status === "pending";
    return c.status === "completed" || c.status === "declined" || c.status === "cancelled";
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Swords className="w-8 h-8 text-primary" /> {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
            {t("subtitle")}
          </p>
        </div>
        <Button className="font-mono rounded-none" onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4 me-1" /> {t("newChallenge")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border border-border overflow-hidden">
        {(["active", "pending", "completed"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 font-mono text-xs uppercase py-2 px-3 transition-colors ${tab === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-card border border-border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <Swords className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground uppercase">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <ChallengeCard key={c.id} c={c} myId={myId} onAction={() => { setWinnerOpen(c); setWinnerId(0); }} />
          ))}
        </div>
      )}

      {/* New Challenge Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="font-mono rounded-none border-border bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm">{t("newChallenge")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("form.chooseFriend")}</label>
              <select
                value={friendId}
                onChange={(e) => setFriendId(Number(e.target.value))}
                className="w-full bg-background border border-border font-mono text-sm p-2 rounded-none"
              >
                <option value={0}>{t("form.chooseDefault")}</option>
                {(friends ?? []).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.displayName} (@{f.username})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("form.challengeType")}</label>
              <div className="flex gap-0">
                {(["most_hours", "first_rank"] as const).map((val) => (
                  <button
                    key={val}
                    onClick={() => setType(val)}
                    className={`flex-1 font-mono text-xs py-2 border transition-colors ${type === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {t(`types.${val}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("form.endDate")}</label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="font-mono rounded-none border-border bg-background"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("form.details")}</label>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="font-mono rounded-none border-border bg-background resize-none"
                rows={2}
                placeholder={t("form.detailsPlaceholder")}
              />
            </div>
            <Button className="w-full font-mono rounded-none" onClick={createChallenge} disabled={creating || !friendId || !endsAt}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : t("actions.sendChallenge")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete / Winner Dialog */}
      <Dialog open={!!winnerOpen} onOpenChange={() => setWinnerOpen(null)}>
        <DialogContent className="font-mono rounded-none border-border bg-card max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm">{t("actions.whoWon")}</DialogTitle>
          </DialogHeader>
          {winnerOpen && (
            <div className="space-y-3 pt-2">
              {[winnerOpen.challenger, winnerOpen.challenged].map((u) => (
                <button
                  key={u.id}
                  onClick={() => setWinnerId(u.id)}
                  className={`w-full flex items-center gap-3 p-3 border transition-colors ${winnerId === u.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">{u.displayName[0]}</div>
                  )}
                  <span className="font-mono text-sm">{u.displayName}</span>
                  {winnerId === u.id && <Trophy className="w-4 h-4 text-yellow-400 ms-auto" />}
                </button>
              ))}
              <Button className="w-full font-mono rounded-none" onClick={completeChallenge} disabled={completing || !winnerId}>
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : t("actions.confirmWinner")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
