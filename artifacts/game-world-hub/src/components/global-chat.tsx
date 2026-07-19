/**
 * GlobalChat — Real-time public chat embedded in the dashboard.
 *
 * - All authenticated users can read and send messages.
 * - Pro users unlock extended emoji set + name/text colour customisation.
 * - LFG signals are styled as actionable cards with a "Find Party" CTA.
 * - Real-time delivery via the existing WS connection in VoiceContext
 *   (voice-context dispatches CustomEvent "gwh:global-chat" on new messages).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Send, Smile, Zap, Users, UserPlus, UserCheck, ExternalLink } from "lucide-react";
import { ProBadge } from "@/components/pro-badge";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatAuthor {
  id: number;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isPro: boolean;
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
    slots?: number;
    lfgPostId?: number;
  };
  createdAt: string;
  author: ChatAuthor;
}

// ── Emoji sets ────────────────────────────────────────────────────────────────
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

// ── Pro colour palettes ───────────────────────────────────────────────────────
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
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  author,
  onClick,
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
        background: author.avatarUrl ? undefined : `hsl(${hue},70%,30%)`,
        borderColor: author.isPro ? "#FFD700" : "transparent",
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

// ── LFG Signal card ───────────────────────────────────────────────────────────
function LfgSignalCard({ msg, t }: { msg: ChatMessage; t: (k: string, o?: any) => string }) {
  const { game, slots } = msg.metadata;
  return (
    <div className="gc-lfg-card">
      <div className="gc-lfg-top">
        <Zap className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
        <span className="gc-lfg-label">{t("chat.lfgSignal")}</span>
        {game && <span className="gc-lfg-game">{game}</span>}
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
  msg,
  meId,
  onUserClick,
  t,
}: {
  msg: ChatMessage;
  meId: number;
  onUserClick: (author: ChatAuthor, rect: DOMRect) => void;
  t: (k: string, o?: any) => string;
}) {
  const isMe = msg.author.id === meId;
  const nameColor = msg.metadata.nameColor ?? (msg.author.isPro ? "#FFD700" : undefined);
  const textColor = msg.metadata.textColor ?? undefined;

  const handleClick = (e: React.MouseEvent) => {
    if (isMe) return;
    onUserClick(msg.author, (e.currentTarget as HTMLElement).getBoundingClientRect());
  };

  return (
    <div className={`gc-msg-row ${isMe ? "gc-msg-row--me" : ""}`}>
      {!isMe && (
        <Avatar author={msg.author} onClick={handleClick} />
      )}
      <div className="gc-msg-body">
        {/* Name row */}
        <div className="gc-msg-meta">
          <span
            className={`gc-msg-name${!isMe ? " gc-msg-name--clickable" : ""}`}
            style={nameColor ? { color: nameColor } : undefined}
            onClick={!isMe ? handleClick : undefined}
          >
            {msg.author.displayName}
          </span>
          {msg.author.isPro && <ProBadge size="icon" className="w-4 h-4" />}
          <span className="gc-msg-time">{timeAgo(msg.createdAt)}</span>
        </div>
        {/* Content */}
        {msg.messageType === "lfg_signal" ? (
          <LfgSignalCard msg={msg} t={t} />
        ) : (
          <p
            className={`gc-msg-text ${isMe ? "gc-msg-text--me" : ""}`}
            style={textColor ? { color: textColor } : undefined}
          >
            {msg.content}
          </p>
        )}
      </div>
      {isMe && <Avatar author={msg.author} />}
    </div>
  );
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────
function EmojiPicker({
  isPro,
  onPick,
  onClose,
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
  nameColor,
  textColor,
  setNameColor,
  setTextColor,
  t,
}: {
  nameColor: string;
  textColor: string;
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

// ── Main component ─────────────────────────────────────────────────────────────
export function GlobalChat({ me }: { me: any }) {
  const { t } = useTranslation("dashboard");
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [nameColor, setNameColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const [lfgMode, setLfgMode] = useState(false);
  const [lfgGame, setLfgGame] = useState("");
  const [activeCard, setActiveCard] = useState<{ author: ChatAuthor; rect: DOMRect } | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const isPro = !!me?.isPro;

  // ── Load history ─────────────────────────────────────────────────────────
  useEffect(() => {
    customFetch("/api/global-chat/messages?limit=50")
      .then((data: any) => { if (Array.isArray(data)) setMessages(data); })
      .catch(() => {});
  }, []);

  // ── Real-time WS ─────────────────────────────────────────────────────────
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

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const body: Record<string, unknown> = { content: text };
      if (lfgMode) {
        body.messageType = "lfg_signal";
        body.metadata = { game: lfgGame || undefined, slots: 5 };
      } else {
        body.messageType = "text";
        const meta: Record<string, unknown> = {};
        if (isPro && nameColor) meta.nameColor = nameColor;
        if (isPro && textColor) meta.textColor = textColor;
        body.metadata = meta;
      }

      await customFetch("/api/global-chat/messages", { method: "POST", body: JSON.stringify(body) });
      setInput("");
      if (lfgMode) { setLfgMode(false); setLfgGame(""); }
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [input, sending, lfgMode, lfgGame, isPro, nameColor, textColor, t, toast]);

  // ── User card ─────────────────────────────────────────────────────────────
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

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  return (
    <div className="gc-root">
      {/* Header */}
      <div className="gc-header">
        <span className="gc-header-dot" />
        <h2 className="gc-header-title">{t("chat.title")}</h2>
        <span className="gc-header-count">{messages.length}</span>
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
          nameColor={nameColor}
          textColor={textColor}
          setNameColor={setNameColor}
          setTextColor={setTextColor}
          t={t}
        />
      )}

      {/* Message list */}
      <div className="gc-messages">
        {messages.length === 0 && (
          <p className="gc-empty">{t("chat.empty")}</p>
        )}
        {messages.map(msg => (
          <MessageRow key={msg.id} msg={msg} meId={me?.id ?? -1} onUserClick={handleUserClick} t={t} />
        ))}
        <div ref={bottomRef} />
      </div>

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

        {/* Char counter when near limit */}
        {input.length > 160 && (
          <div className="gc-char-count" style={{ color: input.length > 190 ? "#EF4444" : "#94a3b8" }}>
            {200 - input.length}
          </div>
        )}
      </div>

      {/* User card popover — rendered outside scroll container so it's never clipped */}
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
