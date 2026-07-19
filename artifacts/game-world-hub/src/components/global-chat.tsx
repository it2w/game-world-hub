/**
 * GlobalChat — Real-time public chat embedded in the dashboard.
 *
 * Features:
 * - Reactions (6 emoji, toggle, live broadcast via WS)
 * - Threaded replies (preview bar + quoted reference in messages)
 * - @Mention autocomplete (dropdown from active participants, push notification)
 * - Active-user count (users active in last 5 min, polled every 30s)
 * - Reports (hide message locally, send to backend)
 * - LFG signal cards
 * - Pro name/text colour customisation
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Send, Smile, Zap, Users, UserPlus, UserCheck, ExternalLink,
  X, Reply, Flag, CornerUpLeft,
} from "lucide-react";
import { ProBadge } from "@/components/pro-badge";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatAuthor {
  id: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isPro: boolean;
}
interface ReactionCount {
  emoji: string;
  count: number;
  hasMe: boolean;
}
interface ReplyPreview {
  id: number;
  content: string;
  authorName: string;
}
interface ChatMessage {
  id: number;
  userId: number;
  content: string;
  messageType: "text" | "lfg_signal";
  metadata: {
    nameColor?: string;
    textColor?: string;
    game?: string;
    platform?: string;
    rank?: string;
    slots?: number;
    lfgPostId?: number;
  };
  createdAt: string;
  author: ChatAuthor;
  reactions: ReactionCount[];
  replyTo: ReplyPreview | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ["👍","❤️","😂","💀","🔥","👏"];

const FREE_EMOJIS = [
  "🎮","🔥","⚡","💥","🏆","⭐","🎯","💀",
  "🛡️","⚔️","🎲","💪","🚀","😎","😈","🤝",
  "👊","🔝","🌟","🎖️","💯","🦁","🎁","🏅",
  "💫","🤖","🦊","🐉","😂","🤣",
];
const PRO_EXTRA_EMOJIS = [
  "👑","💎","🌈","✨","🦋","🔮","🌙","🔱",
  "🎭","🎨","🎵","💜","💖","🌸","🦄","🎊",
  "🎉","🦅","🐺","⚜️","🌊","🏰","🌺","💫",
  "🎪","🦸","🧙","🐲","🌠","🎆","🏮","⭐",
];

const NAME_COLORS = [
  "#FF4655","#A855F7","#FFD700","#22C55E",
  "#06B6D4","#F97316","#EC4899","#38BDF8",
];
const TEXT_COLORS = [
  "#FFFFFF","#E2E8F0","#A855F7","#22C55E",
  "#FFD700","#F97316","#EC4899","#06B6D4",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Highlight @mentions in message content */
function renderContent(text: string): React.ReactNode {
  if (!text.includes("@")) return text;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((p, i) =>
    /^@[a-zA-Z0-9_]+$/.test(p)
      ? <span key={i} className="gc-mention">{p}</span>
      : p,
  );
}

/** Extract @partial from end of text for autocomplete */
function getMentionQuery(text: string): string | null {
  const m = /@([a-zA-Z0-9_]*)$/.exec(text);
  return m ? m[1] : null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  author, onClick,
}: {
  author: ChatAuthor;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const initial = author.displayName?.[0]?.toUpperCase() ?? "?";
  const hue = (author.id * 47) % 360;
  return (
    <div
      className={`w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold border${onClick ? " cursor-pointer" : ""}`}
      style={{
        background:   author.avatarUrl ? undefined : `hsl(${hue},70%,30%)`,
        borderColor:  author.isPro ? "#FFD700" : "transparent",
      }}
      onClick={onClick}
    >
      {author.avatarUrl
        ? <img src={author.avatarUrl} alt={author.displayName} className="w-full h-full object-cover" />
        : initial
      }
    </div>
  );
}

// ── Reaction bar ──────────────────────────────────────────────────────────────
function ReactionBar({
  reactions, onReact,
}: {
  reactions?: ReactionCount[];
  onReact: (emoji: string) => void;
}) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className="gc-reactions">
      {reactions.map(r => (
        <button
          key={r.emoji}
          className={`gc-reaction ${r.hasMe ? "gc-reaction--me" : ""}`}
          onClick={() => onReact(r.emoji)}
          title={String(r.count)}
        >
          {r.emoji} <span className="gc-reaction-count">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── LFG Signal card ───────────────────────────────────────────────────────────
function LfgSignalCard({ msg, t }: { msg: ChatMessage; t: (k: string, o?: any) => string }) {
  const { game, platform, rank, slots } = msg.metadata;
  return (
    <div className="gc-lfg-card">
      <div className="gc-lfg-top">
        <Zap className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
        <span className="gc-lfg-label">{t("chat.lfgSignal")}</span>
        {game     && <span className="gc-lfg-game">{game}</span>}
        {platform && <span className="gc-lfg-meta">{platform}</span>}
        {rank     && <span className="gc-lfg-meta gc-lfg-meta--rank">{rank}</span>}
        {slots && (
          <span className="gc-lfg-slots">
            <Users className="w-3 h-3" /> {slots} {t("chat.slots")}
          </span>
        )}
      </div>
      <p className="gc-lfg-content">{msg.content}</p>
      <Link href="/lfg" className="gc-lfg-btn">
        {t("chat.findParty")} →
      </Link>
    </div>
  );
}

// ── Single message row ────────────────────────────────────────────────────────
function MessageRow({
  msg, meId, onUserClick, onReact, onReply, onReport, scrollToId, t,
}: {
  msg: ChatMessage;
  meId: number;
  onUserClick: (author: ChatAuthor, rect: DOMRect) => void;
  onReact: (msgId: number, emoji: string) => void;
  onReply: (msg: ChatMessage) => void;
  onReport: (msgId: number) => void;
  scrollToId: (id: number) => void;
  t: (k: string, o?: any) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const isMe       = msg.author.id === meId;
  const nameColor  = msg.metadata.nameColor ?? (msg.author.isPro ? "#FFD700" : undefined);
  const textColor  = msg.metadata.textColor ?? undefined;

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (isMe) return;
    onUserClick(msg.author, (e.currentTarget as HTMLElement).getBoundingClientRect());
  };

  return (
    <div
      className={`gc-msg-row ${isMe ? "gc-msg-row--me" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isMe && <Avatar author={msg.author} onClick={handleAvatarClick} />}

      <div className="gc-msg-body">
        {/* Reply quote */}
        {msg.replyTo && (
          <button
            className="gc-reply-quote"
            onClick={() => scrollToId(msg.replyTo!.id)}
          >
            <CornerUpLeft className="w-3 h-3 shrink-0 opacity-60" />
            <span className="gc-reply-quote-author">{msg.replyTo.authorName}</span>
            <span className="gc-reply-quote-text">{msg.replyTo.content}</span>
          </button>
        )}

        {/* Name + toolbar */}
        <div className="gc-msg-meta">
          <span
            className={`gc-msg-name${!isMe ? " gc-msg-name--clickable" : ""}`}
            style={nameColor ? { color: nameColor } : undefined}
            onClick={!isMe ? handleAvatarClick : undefined}
          >
            {msg.author.displayName}
          </span>
          {msg.author.isPro && <ProBadge size="icon" className="w-4 h-4" />}
          <span className="gc-msg-time">{timeAgo(msg.createdAt)}</span>

          {/* Hover action toolbar */}
          {hovered && (
            <div className={`gc-hover-toolbar ${isMe ? "gc-hover-toolbar--me" : ""}`}>
              {QUICK_REACTIONS.map(em => (
                <button
                  key={em}
                  className="gc-react-btn"
                  onClick={() => onReact(msg.id, em)}
                  title={em}
                >
                  {em}
                </button>
              ))}
              <button
                className="gc-toolbar-btn"
                onClick={() => onReply(msg)}
                title={t("chat.reply")}
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
              {!isMe && (
                <button
                  className="gc-toolbar-btn gc-toolbar-btn--report"
                  onClick={() => onReport(msg.id)}
                  title={t("chat.report")}
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {msg.messageType === "lfg_signal" ? (
          <LfgSignalCard msg={msg} t={t} />
        ) : (
          <p
            className={`gc-msg-text ${isMe ? "gc-msg-text--me" : ""}`}
            style={textColor ? { color: textColor } : undefined}
          >
            {renderContent(msg.content)}
          </p>
        )}

        {/* Reactions */}
        <ReactionBar
          reactions={msg.reactions}
          onReact={emoji => onReact(msg.id, emoji)}
        />
      </div>

      {isMe && <Avatar author={msg.author} />}
    </div>
  );
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────
function EmojiPicker({
  isPro, onPick, onClose,
}: {
  isPro: boolean;
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const all = isPro ? [...FREE_EMOJIS, ...PRO_EXTRA_EMOJIS] : FREE_EMOJIS;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="gc-emoji-picker">
      {isPro && (
        <div className="gc-emoji-pro-label">
          <ProBadge size="icon" className="w-3.5 h-3.5" />
          <span>{t("chat.proEmoji")}</span>
        </div>
      )}
      <div className="gc-emoji-grid">
        {all.map((em, i) => (
          <button key={i} className="gc-emoji-btn" onClick={() => { onPick(em); onClose(); }}>
            {em}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pro colour strip ──────────────────────────────────────────────────────────
function ProColorPanel({
  nameColor, textColor, setNameColor, setTextColor, t,
}: {
  nameColor: string; textColor: string;
  setNameColor: (c: string) => void;
  setTextColor: (c: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="gc-pro-colors">
      <div className="gc-color-row">
        <span className="gc-color-label"><ProBadge size="icon" className="w-3 h-3" /> {t("chat.nameColor")}</span>
        <div className="gc-color-swatches">
          {NAME_COLORS.map(c => (
            <button
              key={c}
              className={`gc-swatch ${nameColor === c ? "gc-swatch--active" : ""}`}
              style={{ background: c }}
              onClick={() => setNameColor(nameColor === c ? "" : c)}
            />
          ))}
        </div>
      </div>
      <div className="gc-color-row">
        <span className="gc-color-label">✏️ {t("chat.textColor")}</span>
        <div className="gc-color-swatches">
          {TEXT_COLORS.map(c => (
            <button
              key={c}
              className={`gc-swatch ${textColor === c ? "gc-swatch--active" : ""}`}
              style={{ background: c, border: c === "#FFFFFF" ? "1px solid #555" : undefined }}
              onClick={() => setTextColor(textColor === c ? "" : c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Chat User Card popover ────────────────────────────────────────────────────
function ChatUserCard({
  author, anchorRect, added, onAdd, onClose, t,
}: {
  author: ChatAuthor; anchorRect: DOMRect;
  added: boolean; onAdd: () => void; onClose: () => void;
  t: (k: string) => string;
}) {
  const ref     = useRef<HTMLDivElement>(null);
  const initial = author.displayName?.[0]?.toUpperCase() ?? "?";
  const hue     = (author.id * 47) % 360;

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown",   onKey);
    };
  }, [onClose]);

  const cardHeight = 180;
  const cardWidth  = 210;
  const spaceAbove = anchorRect.top;
  const top  = spaceAbove >= cardHeight + 8 ? anchorRect.top - cardHeight - 8 : anchorRect.bottom + 8;
  const left = Math.min(
    Math.max(8, anchorRect.left - cardWidth / 2 + anchorRect.width / 2),
    window.innerWidth - cardWidth - 8,
  );

  return (
    <div ref={ref} className="gc-user-card" style={{ top, left }}>
      <button className="gc-uc-close" onClick={onClose} aria-label="Close">
        <X className="w-3 h-3" />
      </button>
      <div className="gc-uc-avatar" style={{ background: author.avatarUrl ? undefined : `hsl(${hue},70%,30%)` }}>
        {author.avatarUrl
          ? <img src={author.avatarUrl} alt={author.displayName} className="w-full h-full object-cover" />
          : initial}
      </div>
      <div className="gc-uc-info">
        <div className="gc-uc-name">
          {author.displayName}
          {author.isPro && <ProBadge size="icon" className="w-3.5 h-3.5" />}
        </div>
        <div className="gc-uc-username">@{author.username}</div>
      </div>
      <div className="gc-uc-actions">
        <button
          className={`gc-uc-btn ${added ? "gc-uc-btn--sent" : "gc-uc-btn--add"}`}
          onClick={added ? undefined : onAdd}
          disabled={added}
        >
          {added
            ? <><UserCheck className="w-3.5 h-3.5" /> {t("chat.requestSent")}</>
            : <><UserPlus className="w-3.5 h-3.5" /> {t("chat.addFriend")}</>
          }
        </button>
        <Link href={`/profile/${author.username}`} className="gc-uc-btn gc-uc-btn--profile" onClick={onClose}>
          <ExternalLink className="w-3.5 h-3.5" /> {t("chat.viewProfile")}
        </Link>
      </div>
    </div>
  );
}

// ── Mention Dropdown ──────────────────────────────────────────────────────────
function MentionDropdown({
  query, authors, onSelect,
}: {
  query: string;
  authors: ChatAuthor[];
  onSelect: (username: string) => void;
}) {
  const filtered = authors.filter(a =>
    a.username.toLowerCase().startsWith(query.toLowerCase()) ||
    a.displayName.toLowerCase().startsWith(query.toLowerCase()),
  ).slice(0, 6);

  if (filtered.length === 0) return null;

  return (
    <div className="gc-mention-list">
      {filtered.map(a => {
        const hue = (a.id * 47) % 360;
        return (
          <button
            key={a.id}
            className="gc-mention-item"
            onMouseDown={e => { e.preventDefault(); onSelect(a.username); }}
          >
            <div
              className="gc-mention-av"
              style={{ background: a.avatarUrl ? undefined : `hsl(${hue},70%,30%)` }}
            >
              {a.avatarUrl
                ? <img src={a.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                : a.displayName[0]?.toUpperCase()}
            </div>
            <span className="gc-mention-name">{a.displayName}</span>
            <span className="gc-mention-username">@{a.username}</span>
            {a.isPro && <ProBadge size="icon" className="w-3 h-3" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function GlobalChat({ me }: { me: any }) {
  const { t }    = useTranslation("dashboard");
  const { toast } = useToast();
  const meId     = me?.id ?? -1;

  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [input,       setInput]       = useState("");
  const [sending,     setSending]     = useState(false);
  const [showEmoji,   setShowEmoji]   = useState(false);
  const [showColors,  setShowColors]  = useState(false);
  const [nameColor,   setNameColor]   = useState("");
  const [textColor,   setTextColor]   = useState("");
  const [lfgMode,     setLfgMode]     = useState(false);
  const [lfgGame,     setLfgGame]     = useState("");
  const [activeCard,  setActiveCard]  = useState<{ author: ChatAuthor; rect: DOMRect } | null>(null);
  const [addedIds,    setAddedIds]    = useState<Set<number>>(new Set());
  const [replyTo,     setReplyTo]     = useState<ChatMessage | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<number>>(new Set());
  const [activeCount, setActiveCount] = useState<number>(0);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const msgRefs    = useRef<Map<number, HTMLDivElement>>(new Map());
  const inputRef   = useRef<HTMLInputElement>(null);
  const isPro      = !!me?.isPro;

  // Mention autocomplete
  const mentionQuery = getMentionQuery(input);
  const mentionAuthors = useMemo(() => {
    const seen = new Set<number>();
    const out: ChatAuthor[] = [];
    for (const m of messages) {
      if (!seen.has(m.author.id) && m.author.id !== meId) {
        seen.add(m.author.id);
        out.push(m.author);
      }
    }
    return out;
  }, [messages, meId]);
  const showMention = mentionQuery !== null && mentionQuery.length >= 0;

  // ── Load history ────────────────────────────────────────────────────────────
  useEffect(() => {
    customFetch("/api/global-chat/messages?limit=50")
      .then((data: any) => { if (Array.isArray(data)) setMessages(data); })
      .catch(() => {});
  }, []);

  // ── Active count (poll every 30 s) ──────────────────────────────────────────
  useEffect(() => {
    const fetch = () => {
      customFetch("/api/global-chat/active-count")
        .then((d: any) => { if (typeof d?.count === "number") setActiveCount(d.count); })
        .catch(() => {});
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── WS: new message ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<ChatMessage>).detail;
      if (!msg?.id) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev.slice(-199), msg];
      });
    };
    window.addEventListener("gwh:global-chat", handler);
    return () => window.removeEventListener("gwh:global-chat", handler);
  }, []);

  // ── WS: reaction update ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<any>).detail;
      if (!data?.messageId) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== data.messageId) return m;
        const newReactions: ReactionCount[] = data.reactions.map((r: { emoji: string; count: number }) => {
          if (r.emoji === data.emoji && data.actorId === meId) {
            return { ...r, hasMe: data.delta === 1 };
          }
          const existing = (m.reactions ?? []).find(x => x.emoji === r.emoji);
          return { ...r, hasMe: existing?.hasMe ?? false };
        });
        return { ...m, reactions: newReactions };
      }));
    };
    window.addEventListener("gwh:reaction-update", handler);
    return () => window.removeEventListener("gwh:reaction-update", handler);
  }, [meId]);

  // ── WS: mention ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<any>).detail;
      if (!data?.fromDisplayName) return;
      toast({
        title: t("chat.mentioned", { name: data.fromDisplayName }),
        description: data.content,
      });
    };
    window.addEventListener("gwh:mention", handler);
    return () => window.removeEventListener("gwh:mention", handler);
  }, [t, toast]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = { content: text };
      if (replyTo) body.replyToId = replyTo.id;
      if (lfgMode) {
        body.messageType = "lfg_signal";
        body.metadata    = { game: lfgGame || undefined, slots: 5 };
      } else {
        body.messageType = "text";
        const meta: Record<string, unknown> = {};
        if (isPro && nameColor) meta.nameColor = nameColor;
        if (isPro && textColor) meta.textColor = textColor;
        body.metadata = meta;
      }
      await customFetch("/api/global-chat/messages", { method: "POST", body: JSON.stringify(body) });
      setInput("");
      setReplyTo(null);
      if (lfgMode) { setLfgMode(false); setLfgGame(""); }
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [input, sending, replyTo, lfgMode, lfgGame, isPro, nameColor, textColor, t, toast]);

  // ── React to a message ──────────────────────────────────────────────────────
  const handleReact = useCallback(async (msgId: number, emoji: string) => {
    try {
      await customFetch(`/api/global-chat/messages/${msgId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    }
  }, [t, toast]);

  // ── Report ──────────────────────────────────────────────────────────────────
  const handleReport = useCallback(async (msgId: number) => {
    try {
      await customFetch(`/api/global-chat/messages/${msgId}/report`, { method: "POST" });
      setReportedIds(prev => new Set(prev).add(msgId));
      toast({ title: t("chat.reported") });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    }
  }, [t, toast]);

  // ── User card ───────────────────────────────────────────────────────────────
  const handleUserClick = useCallback((author: ChatAuthor, rect: DOMRect) => {
    setActiveCard(prev => (prev?.author.id === author.id ? null : { author, rect }));
  }, []);

  const addFriend = useCallback(async () => {
    if (!activeCard) return;
    const { author } = activeCard;
    try {
      await customFetch("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ toUserId: author.id }),
      });
      setAddedIds(prev => new Set(prev).add(author.id));
      toast({ title: t("chat.requestSent") });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    }
  }, [activeCard, t, toast]);

  // ── Scroll to quoted message ─────────────────────────────────────────────────
  const scrollToId = useCallback((id: number) => {
    const el = msgRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // ── Mention complete ─────────────────────────────────────────────────────────
  const completeMention = useCallback((username: string) => {
    setInput(prev => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    inputRef.current?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
    if (e.key === "Escape" && replyTo) setReplyTo(null);
  };

  const visibleMessages = messages.filter(m => !reportedIds.has(m.id));

  return (
    <div className="gc-root">
      {/* Header */}
      <div className="gc-header">
        <span className="gc-header-dot" />
        <h2 className="gc-header-title">{t("chat.title")}</h2>
        <span className="gc-header-count">{messages.length}</span>
        {activeCount > 0 && (
          <span className="gc-header-active" title={t("chat.activeHint")}>
            <span className="gc-active-dot" />
            {activeCount}
          </span>
        )}
        {isPro && (
          <button
            className={`gc-pro-toggle ${showColors ? "gc-pro-toggle--active" : ""}`}
            onClick={() => setShowColors(v => !v)}
            title={t("chat.proColors")}
          >
            <ProBadge size="icon" className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Pro color panel */}
      {isPro && showColors && (
        <ProColorPanel
          nameColor={nameColor} textColor={textColor}
          setNameColor={setNameColor} setTextColor={setTextColor}
          t={t}
        />
      )}

      {/* Message list */}
      <div className="gc-messages">
        {visibleMessages.length === 0 && (
          <p className="gc-empty">{t("chat.empty")}</p>
        )}
        {visibleMessages.map(msg => (
          <div
            key={msg.id}
            ref={el => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
          >
            <MessageRow
              msg={msg} meId={meId}
              onUserClick={handleUserClick}
              onReact={handleReact}
              onReply={setReplyTo}
              onReport={handleReport}
              scrollToId={scrollToId}
              t={t}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Mention dropdown */}
      {showMention && (
        <MentionDropdown
          query={mentionQuery!}
          authors={mentionAuthors}
          onSelect={completeMention}
        />
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="gc-reply-bar">
          <Reply className="w-3.5 h-3.5 shrink-0 opacity-60" />
          <span className="gc-reply-bar-to">{t("chat.replyingTo")} <strong>{replyTo.author.displayName}</strong></span>
          <span className="gc-reply-bar-preview">{replyTo.content}</span>
          <button className="gc-reply-bar-cancel" onClick={() => setReplyTo(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LFG mode banner */}
      {lfgMode && (
        <div className="gc-lfg-mode-bar">
          <Zap className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
          <span>{t("chat.lfgMode")}</span>
          <input
            className="gc-lfg-game-input"
            placeholder={t("chat.lfgGamePlaceholder")}
            value={lfgGame}
            onChange={e => setLfgGame(e.target.value)}
            maxLength={40}
          />
          <button className="gc-lfg-cancel" onClick={() => { setLfgMode(false); setLfgGame(""); }}>✕</button>
        </div>
      )}

      {/* Input area */}
      <div className="gc-input-area">
        <div className="gc-input-row">
          {/* Emoji button */}
          <div className="gc-emoji-wrap">
            <button
              className={`gc-icon-btn ${showEmoji ? "gc-icon-btn--active" : ""}`}
              onClick={() => setShowEmoji(v => !v)}
              title={t("chat.emoji")}
            >
              <Smile className="w-4 h-4" />
            </button>
            {showEmoji && (
              <EmojiPicker
                isPro={isPro}
                onPick={e => setInput(v => v + e)}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>

          {/* LFG signal button */}
          <button
            className={`gc-icon-btn ${lfgMode ? "gc-icon-btn--active" : ""}`}
            onClick={() => setLfgMode(v => !v)}
            title={t("chat.lfgSignal")}
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            className="gc-input"
            placeholder={lfgMode ? t("chat.lfgPlaceholder") : t("chat.placeholder")}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            maxLength={200}
            style={textColor && isPro ? { color: textColor } : undefined}
          />

          {/* Send */}
          <button
            className="gc-send-btn"
            onClick={() => void send()}
            disabled={!input.trim() || sending}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Char counter */}
        {input.length > 160 && (
          <div className="gc-char-count" style={{ color: input.length > 190 ? "#EF4444" : "#94a3b8" }}>
            {200 - input.length}
          </div>
        )}
      </div>

      {/* User card popover */}
      {activeCard && (
        <ChatUserCard
          author={activeCard.author}
          anchorRect={activeCard.rect}
          added={addedIds.has(activeCard.author.id)}
          onAdd={() => void addFriend()}
          onClose={() => setActiveCard(null)}
          t={t}
        />
      )}
    </div>
  );
}
