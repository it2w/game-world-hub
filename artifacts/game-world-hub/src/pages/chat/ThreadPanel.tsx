import { useState, useEffect, useCallback, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";
import { X, Send, MessageSquare, Loader2 } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

interface ThreadSender {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

interface ThreadMessage {
  id: number;
  sender: ThreadSender;
  content: string;
  createdAt: string;
}

interface ThreadData {
  exists: boolean;
  threadId: number | null;
  replyCount: number;
  messages: ThreadMessage[];
}

interface RootMessage {
  id: number;
  content: string;
  sender: { id: number; displayName: string };
  conversationId: number;
}

interface ThreadPanelProps {
  conversationId: number;
  rootMessage: RootMessage;
  myId: number;
  onClose: () => void;
}

const AVATAR_PALETTE = [
  { bg: "#1a2e4a", text: "#60a5fa" },
  { bg: "#2d1b4e", text: "#a78bfa" },
  { bg: "#1a3a2a", text: "#4ade80" },
  { bg: "#3d1f0a", text: "#fb923c" },
  { bg: "#3a1a1a", text: "#f87171" },
];

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function MiniAvatar({ src, name }: { src?: string | null; name: string }) {
  const color = AVATAR_PALETTE[nameHash(name) % AVATAR_PALETTE.length];
  if (src) return <img src={src} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />;
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ background: color.bg, color: color.text }}
    >
      {initials(name)}
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

export function ThreadPanel({ conversationId, rootMessage, myId, onClose }: ThreadPanelProps) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await customFetch<ThreadData>(
        `/api/conversations/${conversationId}/messages/${rootMessage.id}/thread`,
      );
      setThread(data);
    } catch {}
    setLoading(false);
  }, [conversationId, rootMessage.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread?.messages.length]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputRef.current?.value.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError("");
    try {
      const result = await customFetch<{
        id: number; threadId: number; replyCount: number;
        sender: ThreadSender; content: string; createdAt: string;
      }>(
        `/api/conversations/${conversationId}/messages/${rootMessage.id}/thread/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (inputRef.current) inputRef.current.value = "";
      setThread((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          exists: true,
          threadId: result.threadId,
          replyCount: result.replyCount,
          messages: [...prev.messages, {
            id: result.id,
            sender: result.sender,
            content: result.content,
            createdAt: result.createdAt,
          }],
        };
      });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; automod?: boolean }; status?: number };
      setSendError(e?.data?.error ?? "Failed to send reply");
    }
    setSending(false);
  };

  return (
    <div className="w-72 shrink-0 flex flex-col border-s border-border bg-background/50 backdrop-blur-sm">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center gap-2 px-3 shrink-0">
        <MessageSquare className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold flex-1 truncate">Thread</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Root message context */}
      <div className="px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-1">
          {rootMessage.sender.displayName}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {rootMessage.content.startsWith("__poll:")
            ? "🗳️ Poll"
            : rootMessage.content}
        </p>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-auto py-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : !thread?.messages.length ? (
          <div className="text-center text-muted-foreground text-xs py-6 px-4">
            No replies yet. Start the thread!
          </div>
        ) : (
          thread.messages.map((msg) => (
            <div key={msg.id} className="flex gap-2 px-3">
              <MiniAvatar src={msg.sender.avatarUrl} name={msg.sender.displayName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold text-foreground">
                    {msg.sender.displayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed break-words text-foreground/90">
                  {msg.content}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1 shrink-0 border-t border-border">
        {sendError && (
          <p className="text-[11px] text-destructive mb-1 px-1 leading-tight">{sendError}</p>
        )}
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 bg-muted/40 border border-border rounded-full px-3 py-1.5"
        >
          <input
            ref={inputRef}
            placeholder="Reply in thread…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
            }}
          />
          <button
            type="submit"
            disabled={sending}
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
