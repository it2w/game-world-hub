import { useState, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Trophy, BarChart2, Loader2 } from "lucide-react";

export const POLL_CONTENT_RE = /^__poll:(\d+)__$/;

export function isPollMessage(content: string): boolean {
  return POLL_CONTENT_RE.test(content);
}

export function parsePollId(content: string): number | null {
  const m = content.match(POLL_CONTENT_RE);
  return m ? parseInt(m[1], 10) : null;
}

interface PollOption {
  id: number;
  label: string;
  count: number;
  percent: number;
}

interface PollData {
  id: number;
  conversationId: number;
  creatorId: number;
  question: string;
  options: PollOption[];
  totalVotes: number;
  myVote: number | null;
  isClosed: boolean;
  closesAt: string | null;
  createdAt: string;
}

interface PollCardProps {
  conversationId: number;
  pollId: number;
  myId: number;
}

export function PollCard({ conversationId, pollId, myId }: PollCardProps) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await customFetch<PollData>(
        `/api/conversations/${conversationId}/polls/${pollId}`,
      );
      setPoll(data);
    } catch {
      /* poll not found or no access — render nothing */
    } finally {
      setLoading(false);
    }
  }, [conversationId, pollId]);

  useEffect(() => { void load(); }, [load]);

  const vote = async (optionId: number) => {
    if (!poll || poll.isClosed || voting) return;
    setVoting(true);
    try {
      if (poll.myVote === optionId) {
        // Toggle off
        const updated = await customFetch<PollData>(
          `/api/conversations/${conversationId}/polls/${pollId}/votes`,
          { method: "DELETE" },
        );
        setPoll(updated);
      } else {
        const updated = await customFetch<PollData>(
          `/api/conversations/${conversationId}/polls/${pollId}/votes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ optionId }),
          },
        );
        setPoll(updated);
      }
    } catch {}
    setVoting(false);
  };

  const closePoll = async () => {
    if (!poll || closing) return;
    setClosing(true);
    try {
      const updated = await customFetch<PollData>(
        `/api/conversations/${conversationId}/polls/${pollId}/close`,
        { method: "POST" },
      );
      setPoll(updated);
    } catch {}
    setClosing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading poll…
      </div>
    );
  }
  if (!poll) return null;

  const winnerOption =
    poll.isClosed && poll.totalVotes > 0
      ? poll.options.reduce((a, b) => (a.count >= b.count ? a : b))
      : null;

  return (
    <div className="mt-1 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden max-w-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <BarChart2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-semibold leading-snug">{poll.question}</span>
      </div>

      {/* Options */}
      <div className="px-3 pb-2 space-y-1.5">
        {poll.options.map((opt) => {
          const isWinner = winnerOption?.id === opt.id;
          const isMine = poll.myVote === opt.id;
          const hasVoted = poll.myVote !== null;
          const showBar = hasVoted || poll.isClosed;

          return (
            <button
              key={opt.id}
              onClick={() => vote(opt.id)}
              disabled={poll.isClosed || voting}
              className={`relative w-full text-start rounded-lg px-3 py-2 text-sm transition-all overflow-hidden
                ${poll.isClosed
                  ? "cursor-default"
                  : "hover:bg-muted/50 cursor-pointer"}
                ${isMine && !poll.isClosed
                  ? "ring-1 ring-primary/50 bg-primary/5"
                  : "border border-border/50"}
              `}
            >
              {/* Animated fill bar */}
              {showBar && (
                <span
                  className={`absolute inset-y-0 start-0 rounded-lg transition-all duration-700 ease-out
                    ${isWinner
                      ? "bg-primary/20"
                      : isMine
                      ? "bg-primary/10"
                      : "bg-muted/40"}`}
                  style={{ width: `${opt.percent}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  {isWinner && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {isMine && !isWinner && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />}
                  {opt.label}
                </span>
                {showBar && (
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {opt.percent}% · {opt.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-mono">
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}
          {poll.closesAt && !poll.isClosed && (
            <> · closes {new Date(poll.closesAt).toLocaleDateString()}</>
          )}
          {poll.isClosed && <> · closed</>}
        </span>
        {poll.creatorId === myId && !poll.isClosed && (
          <button
            onClick={closePoll}
            disabled={closing}
            className="text-[11px] font-mono text-muted-foreground hover:text-destructive transition-colors"
          >
            {closing ? "Closing…" : "Close poll"}
          </button>
        )}
      </div>
    </div>
  );
}
