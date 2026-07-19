/**
 * GlobalChat — Real-time public chat embedded in the dashboard.
 *
 * Task #194 additions: channels (general/lfg/trading), cursor pagination,
 * local search, Pro perks (badge, name-animation, 400-char limit, GIF, pin),
 * VIP filter, system_announcement cards, pinned-message banner,
 * mention sound (Pro).
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Send, Smile, Zap, Users, UserPlus, UserCheck, ExternalLink,
  X, Reply, Flag, CornerUpLeft, Pin, Search, Filter,
  ChevronUp, ImageIcon, ArrowLeftRight,
} from "lucide-react";
import { ProBadge } from "@/components/pro-badge";

// ── Types ──────────────────────────────────────────────────────────────────────
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
  channel: string;
  messageType: "text" | "lfg_signal" | "gif" | "system_announcement" | "trade_offer";
  metadata: {
    nameColor?: string;
    textColor?: string;
    nameAnimation?: boolean;
    badge?: string;
    game?: string;
    platform?: string;
    rank?: string;
    slots?: number;
    lfgPostId?: number;
    gifUrl?: string;
    rank_position?: number;
    username?: string;
    offering?: string;
    seeking?: string;
    price?: string;
  };
  createdAt: string;
  author: ChatAuthor;
  reactions: ReactionCount[];
  replyTo: ReplyPreview | null;
}
interface PinnedMessage {
  messageId: number;
  content: string;
  messageType: string;
  metadata: Record<string, unknown>;
  pinnedUntil: string;
  author: ChatAuthor;
}
interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ["👍", "❤️", "😂", "💀", "🔥", "👏"];
const CHANNELS = [
  { id: "general", label: "#عام",    labelEn: "#General" },
  { id: "lfg",     label: "#LFG",    labelEn: "#LFG" },
  { id: "trading", label: "#تداول",  labelEn: "#Trading" },
] as const;
type ChannelId = "general" | "lfg" | "trading";

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

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function renderContent(text: string): React.ReactNode {
  if (!text.includes("@")) return text;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((p, i) =>
    /^@[a-zA-Z0-9_]+$/.test(p)
      ? <span key={i} className="gc-mention">{p}</span>
      : p,
  );
}

function getMentionQuery(text: string): string | null {
  const m = /@([a-zA-Z0-9_]*)$/.exec(text);
  return m ? m[1] : null;
}

function playMentionSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
    setTimeout(() => void ctx.close(), 600);
  } catch { /* ignore — AudioContext may be blocked by browser */ }
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
        background:  author.avatarUrl ? undefined : `hsl(${hue},70%,30%)`,
        borderColor: author.isPro ? "#FFD700" : "transparent",
      }}
      onClick={onClick}
    >
      {author.avatarUrl
        ? <img src={author.avatarUrl} alt={author.displayName} className="w-full h-full object-cover" />
        : initial}
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

// ── Trade Offer card ──────────────────────────────────────────────────────────
function TradeOfferCard({ msg, t }: { msg: ChatMessage; t: (k: string, o?: any) => string }) {
  const { offering, seeking, price } = msg.metadata;
  return (
    <div className="gc-trade-card">
      <div className="gc-trade-header">
        <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
        <span className="gc-trade-label-title">{t("chat.tradeOffer")}</span>
      </div>
      <div className="gc-trade-body">
        {msg.content && (
          <p className="gc-trade-note">{msg.content}</p>
        )}
        <div className="gc-trade-fields">
          {offering && (
            <div className="gc-trade-field">
              <span className="gc-trade-field-label">📦 {t("chat.offering")}</span>
              <span className="gc-trade-field-value">{offering}</span>
            </div>
          )}
          {seeking && (
            <div className="gc-trade-field">
              <span className="gc-trade-field-label">🔍 {t("chat.seeking")}</span>
              <span className="gc-trade-field-value">{seeking}</span>
            </div>
          )}
          {price && (
            <div className="gc-trade-field">
              <span className="gc-trade-field-label">💰 {t("chat.price")}</span>
              <span className="gc-trade-field-value gc-trade-price">{price}</span>
            </div>
          )}
        </div>
      </div>
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
      <Link href="/lfg" className="gc-lfg-btn">{t("chat.findParty")} →</Link>
    </div>
  );
}

// ── System Announcement card ──────────────────────────────────────────────────
function SystemAnnouncementCard({ msg, t }: { msg: ChatMessage; t: (k: string, o?: any) => string }) {
  const rank = msg.metadata.rank_position ?? "?";
  return (
    <div className="gc-announcement">
      <span className="gc-announcement-icon">🏆</span>
      <div className="gc-announcement-body">
        <span className="gc-announcement-name">{msg.content}</span>
        <span className="gc-announcement-sub">{t("chat.enteredTop10", { rank })}</span>
      </div>
      <span className="gc-announcement-rank">#{rank}</span>
    </div>
  );
}

// ── Pinned banner ─────────────────────────────────────────────────────────────
function PinnedBanner({
  pin, onClose, t,
}: {
  pin: PinnedMessage;
  onClose: () => void;
  t: (k: string, o?: any) => string;
}) {
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.floor((new Date(pin.pinnedUntil).getTime() - Date.now()) / 1000));
      setSecsLeft(left);
      if (left === 0) onClose();
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [pin.pinnedUntil, onClose]);

  const mins = Math.floor(secsLeft / 60);
  const secs = String(secsLeft % 60).padStart(2, "0");

  return (
    <div className="gc-pin-banner">
      <Pin className="w-3 h-3 shrink-0" style={{ color: "#FFD700" }} />
      <div className="gc-pin-content">
        <span className="gc-pin-author">{pin.author.displayName}</span>
        <span className="gc-pin-text">{pin.content.slice(0, 80)}</span>
      </div>
      <span className="gc-pin-timer">{mins}:{secs}</span>
      <button className="gc-pin-close" onClick={onClose} aria-label="Dismiss pin">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── GIF Picker ────────────────────────────────────────────────────────────────
function GifPicker({
  onSelect, onClose, t,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref     = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await customFetch(
          `/api/global-chat/gif-search?q=${encodeURIComponent(query)}`,
        ) as GifResult[];
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return (
    <div ref={ref} className="gc-gif-picker">
      <div className="gc-gif-search-row">
        <Search className="w-3.5 h-3.5 shrink-0 opacity-50" />
        <input
          className="gc-gif-input"
          placeholder={t("chat.gifSearch")}
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {loading && (
        <div className="gc-gif-loading">
          <span className="animate-pulse">…</span>
        </div>
      )}
      {results.length > 0 && (
        <div className="gc-gif-grid">
          {results.map(g => (
            <img
              key={g.id}
              src={g.previewUrl}
              className="gc-gif-item"
              onClick={() => onSelect(g.url)}
              loading="lazy"
            />
          ))}
        </div>
      )}
      {!loading && results.length === 0 && query.trim() && (
        <div className="gc-gif-empty">{t("chat.gifEmpty")}</div>
      )}
    </div>
  );
}

// ── Single message row ────────────────────────────────────────────────────────
function MessageRow({
  msg, meId, isPro, onUserClick, onReact, onReply, onReport, onPin, scrollToId, t,
}: {
  msg: ChatMessage;
  meId: number;
  isPro: boolean;
  onUserClick: (author: ChatAuthor, rect: DOMRect) => void;
  onReact:  (msgId: number, emoji: string) => void;
  onReply:  (msg: ChatMessage) => void;
  onReport: (msgId: number) => void;
  onPin:    (msgId: number) => void;
  scrollToId: (id: number) => void;
  t: (k: string, o?: any) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const isMe      = msg.author.id === meId;
  const nameColor = msg.metadata.nameColor ?? (msg.author.isPro ? "#FFD700" : undefined);
  const textColor = msg.metadata.textColor ?? undefined;
  const badge     = msg.metadata.badge;
  const animated  = msg.metadata.nameAnimation;

  // system_announcement — full-width card, skip the row structure
  if (msg.messageType === "system_announcement") {
    return <SystemAnnouncementCard msg={msg} t={t} />;
  }

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

        {/* Name row */}
        <div className="gc-msg-meta">
          {badge && <span className="gc-badge-tag">[{badge}]</span>}
          <span
            className={`gc-msg-name${!isMe ? " gc-msg-name--clickable" : ""}${animated ? " gc-name--animated" : ""}`}
            style={nameColor && !animated ? { color: nameColor } : undefined}
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
              {isMe && isPro && (
                <button
                  className="gc-toolbar-btn gc-toolbar-btn--pin"
                  onClick={() => onPin(msg.id)}
                  title={t("chat.pin")}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              )}
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
        {msg.messageType === "trade_offer" ? (
          <TradeOfferCard msg={msg} t={t} />
        ) : msg.messageType === "lfg_signal" ? (
          <LfgSignalCard msg={msg} t={t} />
        ) : msg.messageType === "gif" && msg.metadata.gifUrl ? (
          <img
            src={msg.metadata.gifUrl}
            className="gc-gif"
            alt="GIF"
            loading="lazy"
          />
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

// ── Pro colour + badge + animation strip ──────────────────────────────────────
function ProColorPanel({
  nameColor, textColor, badge, nameAnimation,
  setNameColor, setTextColor, setBadge, setNameAnimation,
  t,
}: {
  nameColor: string; textColor: string;
  badge: string; nameAnimation: boolean;
  setNameColor: (c: string) => void;
  setTextColor: (c: string) => void;
  setBadge: (v: string) => void;
  setNameAnimation: (v: boolean) => void;
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
      <div className="gc-color-row">
        <span className="gc-color-label">🏷️ {t("chat.badge")}</span>
        <input
          className="gc-badge-input"
          placeholder="MVP"
          maxLength={8}
          value={badge}
          onChange={e => setBadge(e.target.value)}
        />
        {badge.trim() && <span className="gc-badge-tag gc-badge-tag--preview">[{badge.trim()}]</span>}
      </div>
      <div className="gc-color-row">
        <span className="gc-color-label">✨ {t("chat.nameAnim")}</span>
        <button
          className={`gc-anim-toggle ${nameAnimation ? "gc-anim-toggle--on" : ""}`}
          onClick={() => setNameAnimation(!nameAnimation)}
        >
          {nameAnimation ? t("chat.animOn") : t("chat.animOff")}
        </button>
        {nameAnimation && (
          <span className="gc-name--animated gc-anim-preview">ABC</span>
        )}
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
            : <><UserPlus  className="w-3.5 h-3.5" /> {t("chat.addFriend")}</>
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
  const { t, i18n }  = useTranslation("dashboard");
  const { toast }    = useToast();
  const meId         = me?.id ?? -1;
  const isPro        = !!me?.isPro;
  const isRtl        = i18n.language === "ar";

  // ── Core state ─────────────────────────────────────────────────────────────
  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [channel,       setChannel]       = useState<ChannelId>("general");
  const [oldestId,      setOldestId]      = useState<number | null>(null);
  const [hasMore,       setHasMore]       = useState(true);
  const [loadingOlder,  setLoadingOlder]  = useState(false);

  const [input,         setInput]         = useState("");
  const [sending,       setSending]       = useState(false);

  const [showEmoji,     setShowEmoji]     = useState(false);
  const [showColors,    setShowColors]    = useState(false);
  const [showGif,       setShowGif]       = useState(false);

  // Pro customisation
  const [nameColor,     setNameColor]     = useState("");
  const [textColor,     setTextColor]     = useState("");
  const [badge,         setBadge]         = useState("");
  const [nameAnimation, setNameAnimation] = useState(false);

  // LFG mode
  const [lfgMode,       setLfgMode]       = useState(false);
  const [lfgGame,       setLfgGame]       = useState("");

  // Trade mode
  const [tradeMode,     setTradeMode]     = useState(false);
  const [tradeOffering, setTradeOffering] = useState("");
  const [tradeSeeking,  setTradeSeeking]  = useState("");
  const [tradePrice,    setTradePrice]    = useState("");

  // Interactions
  const [activeCard,    setActiveCard]    = useState<{ author: ChatAuthor; rect: DOMRect } | null>(null);
  const [addedIds,      setAddedIds]      = useState<Set<number>>(new Set());
  const [replyTo,       setReplyTo]       = useState<ChatMessage | null>(null);
  const [reportedIds,   setReportedIds]   = useState<Set<number>>(new Set());

  // Header features
  const [activeCount,   setActiveCount]   = useState(0);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [vipFilter,     setVipFilter]     = useState(false);

  // Pinned message
  const [pinnedMsg,     setPinnedMsg]     = useState<PinnedMessage | null>(null);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const msgRefs    = useRef<Map<number, HTMLDivElement>>(new Map());
  const inputRef   = useRef<HTMLInputElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  // Mention autocomplete
  const mentionQuery   = getMentionQuery(input);
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
  const showMention = mentionQuery !== null;

  // ── Load messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (ch: ChannelId, beforeId?: number) => {
    const url = `/api/global-chat/messages?channel=${ch}&limit=50${beforeId ? `&before=${beforeId}` : ""}`;
    try {
      const data = await customFetch(url) as ChatMessage[];
      if (!Array.isArray(data)) return;
      if (beforeId) {
        setMessages(prev => [...data, ...prev]);
        if (data.length > 0) setOldestId(data[0].id);
        if (data.length < 50) setHasMore(false);
        setLoadingOlder(false);
      } else {
        setMessages(data);
        setOldestId(data.length > 0 ? data[0].id : null);
        setHasMore(data.length >= 50);
      }
    } catch { setLoadingOlder(false); }
  }, []);

  // ── Load pinned ────────────────────────────────────────────────────────────
  const loadPinned = useCallback(async (ch: ChannelId) => {
    try {
      const data = await customFetch(`/api/global-chat/pinned?channel=${ch}`) as PinnedMessage | null;
      setPinnedMsg(data?.messageId ? data : null);
    } catch {}
  }, []);

  // ── Channel change: reload ─────────────────────────────────────────────────
  useEffect(() => {
    setMessages([]);
    setOldestId(null);
    setHasMore(true);
    setSearchQuery("");
    void loadMessages(channel);
    void loadPinned(channel);
  }, [channel, loadMessages, loadPinned]);

  // ── Active count (poll every 30 s) ─────────────────────────────────────────
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

  // ── Poll pinned every 60 s ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => void loadPinned(channel), 60_000);
    return () => clearInterval(id);
  }, [channel, loadPinned]);

  // ── WS: new message ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<ChatMessage>).detail;
      if (!msg?.id || msg.channel !== channel) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev.slice(-199), msg];
      });
    };
    window.addEventListener("gwh:global-chat", handler);
    return () => window.removeEventListener("gwh:global-chat", handler);
  }, [channel]);

  // ── WS: reaction update ────────────────────────────────────────────────────
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

  // ── WS: mention ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<any>).detail;
      if (!data?.fromDisplayName) return;
      toast({
        title:       t("chat.mentioned", { name: data.fromDisplayName }),
        description: data.content,
      });
      if (isPro) playMentionSound();
    };
    window.addEventListener("gwh:mention", handler);
    return () => window.removeEventListener("gwh:mention", handler);
  }, [t, toast, isPro]);

  // ── WS: pin update ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<any>).detail;
      if (!data?.channel || data.channel !== channel) return;
      setPinnedMsg(data.pin ?? null);
    };
    window.addEventListener("gwh:pin-update", handler);
    return () => window.removeEventListener("gwh:pin-update", handler);
  }, [channel]);

  // ── Auto-scroll (only when not searching) ─────────────────────────────────
  useEffect(() => {
    if (!searchQuery) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, searchQuery]);

  // ── Send text/lfg message ──────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && !tradeMode) return;
    if (tradeMode && !tradeOffering.trim() && !tradeSeeking.trim() && !text) return;
    if (sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = { content: text, channel };
      if (replyTo) body.replyToId = replyTo.id;
      if (tradeMode) {
        body.messageType = "trade_offer";
        body.metadata    = {
          offering: tradeOffering.trim() || undefined,
          seeking:  tradeSeeking.trim()  || undefined,
          price:    tradePrice.trim()    || undefined,
        };
      } else if (lfgMode) {
        body.messageType = "lfg_signal";
        body.metadata    = { game: lfgGame || undefined, slots: 5 };
      } else {
        body.messageType = "text";
        const meta: Record<string, unknown> = {};
        if (isPro && nameColor)     meta.nameColor     = nameColor;
        if (isPro && textColor)     meta.textColor     = textColor;
        if (isPro && badge.trim())  meta.badge         = badge.trim();
        if (isPro && nameAnimation) meta.nameAnimation = true;
        body.metadata = meta;
      }
      await customFetch("/api/global-chat/messages", { method: "POST", body: JSON.stringify(body) });
      setInput("");
      setReplyTo(null);
      if (lfgMode)   { setLfgMode(false);   setLfgGame(""); }
      if (tradeMode) { setTradeMode(false);  setTradeOffering(""); setTradeSeeking(""); setTradePrice(""); }
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [input, sending, replyTo, lfgMode, lfgGame, tradeMode, tradeOffering, tradeSeeking, tradePrice, isPro, nameColor, textColor, badge, nameAnimation, channel, t, toast]);

  // ── Send GIF ───────────────────────────────────────────────────────────────
  const sendGif = useCallback(async (gifUrl: string) => {
    setShowGif(false);
    setSending(true);
    try {
      await customFetch("/api/global-chat/messages", {
        method: "POST",
        body: JSON.stringify({
          content: "[GIF]", messageType: "gif", channel,
          metadata: { gifUrl },
        }),
      });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [channel, t, toast]);

  // ── React ──────────────────────────────────────────────────────────────────
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

  // ── Report ─────────────────────────────────────────────────────────────────
  const handleReport = useCallback(async (msgId: number) => {
    try {
      await customFetch(`/api/global-chat/messages/${msgId}/report`, { method: "POST" });
      setReportedIds(prev => new Set(prev).add(msgId));
      toast({ title: t("chat.reported") });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    }
  }, [t, toast]);

  // ── Pin ────────────────────────────────────────────────────────────────────
  const handlePin = useCallback(async (msgId: number) => {
    try {
      await customFetch(`/api/global-chat/messages/${msgId}/pin`, { method: "POST" });
      toast({ title: t("chat.pinned") });
    } catch (err: any) {
      toast({ title: err?.message ?? t("chat.sendError"), variant: "destructive" });
    }
  }, [t, toast]);

  // ── User card ──────────────────────────────────────────────────────────────
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

  // ── Scroll to quoted message ───────────────────────────────────────────────
  const scrollToId = useCallback((id: number) => {
    const el = msgRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // ── Mention complete ───────────────────────────────────────────────────────
  const completeMention = useCallback((username: string) => {
    setInput(prev => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    inputRef.current?.focus();
  }, []);

  // ── Load older ─────────────────────────────────────────────────────────────
  const loadOlder = useCallback(() => {
    if (!hasMore || loadingOlder || !oldestId) return;
    setLoadingOlder(true);
    void loadMessages(channel, oldestId);
  }, [hasMore, loadingOlder, oldestId, channel, loadMessages]);

  // ── Key handler ────────────────────────────────────────────────────────────
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
    if (e.key === "Escape") {
      if (replyTo)     setReplyTo(null);
      if (searchOpen)  { setSearchOpen(false); setSearchQuery(""); }
    }
  };

  // ── Visible messages ────────────────────────────────────────────────────────
  const visibleMessages = useMemo(() => {
    let result = messages;
    if (vipFilter)   result = result.filter(m => m.author.isPro || m.messageType === "system_announcement");
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result   = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.author.displayName.toLowerCase().includes(q),
      );
    }
    return result.filter(m => !reportedIds.has(m.id));
  }, [messages, vipFilter, searchQuery, reportedIds]);

  const maxLen = isPro ? 400 : 200;

  return (
    <div className="gc-root">
      {/* ── Channel tabs ──────────────────────────────────────────────────── */}
      <div className="gc-channels">
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            className={`gc-channel-tab ${channel === ch.id ? "gc-channel-tab--active" : ""}`}
            onClick={() => setChannel(ch.id)}
          >
            {isRtl ? ch.label : ch.labelEn}
          </button>
        ))}
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
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

        {/* Search toggle */}
        <button
          className={`gc-icon-btn gc-search-btn ${searchOpen ? "gc-icon-btn--active" : ""}`}
          onClick={() => {
            setSearchOpen(v => !v);
            if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
            else setSearchQuery("");
          }}
          title={t("chat.search")}
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {/* VIP filter (Pro only) */}
        {isPro && (
          <button
            className={`gc-icon-btn gc-vip-btn ${vipFilter ? "gc-icon-btn--active" : ""}`}
            onClick={() => setVipFilter(v => !v)}
            title={t("chat.vipFilter")}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Pro colour toggle */}
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

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      {searchOpen && (
        <div className="gc-search-bar">
          <Search className="w-3.5 h-3.5 shrink-0 opacity-40" />
          <input
            ref={searchRef}
            className="gc-search-input"
            placeholder={t("chat.searchPlaceholder")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="gc-search-clear" onClick={() => setSearchQuery("")}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Pro color panel ───────────────────────────────────────────────── */}
      {isPro && showColors && (
        <ProColorPanel
          nameColor={nameColor} textColor={textColor}
          badge={badge} nameAnimation={nameAnimation}
          setNameColor={setNameColor} setTextColor={setTextColor}
          setBadge={setBadge} setNameAnimation={setNameAnimation}
          t={t}
        />
      )}

      {/* ── Pinned message banner ─────────────────────────────────────────── */}
      {pinnedMsg && (
        <PinnedBanner
          pin={pinnedMsg}
          onClose={() => setPinnedMsg(null)}
          t={t}
        />
      )}

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <div className="gc-messages">
        {/* Load older button */}
        {hasMore && messages.length >= 50 && !searchQuery && (
          <button
            className="gc-load-older"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            <ChevronUp className="w-3 h-3" />
            {loadingOlder ? "…" : t("chat.loadOlder")}
          </button>
        )}

        {visibleMessages.length === 0 && (
          <p className="gc-empty">{t("chat.empty")}</p>
        )}

        {visibleMessages.map(msg => (
          <div
            key={msg.id}
            ref={el => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
          >
            <MessageRow
              msg={msg} meId={meId} isPro={isPro}
              onUserClick={handleUserClick}
              onReact={handleReact}
              onReply={setReplyTo}
              onReport={handleReport}
              onPin={handlePin}
              scrollToId={scrollToId}
              t={t}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Mention dropdown ──────────────────────────────────────────────── */}
      {showMention && (
        <MentionDropdown
          query={mentionQuery!}
          authors={mentionAuthors}
          onSelect={completeMention}
        />
      )}

      {/* ── Reply preview bar ─────────────────────────────────────────────── */}
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

      {/* ── LFG mode banner ───────────────────────────────────────────────── */}
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

      {/* ── Trade mode bar ────────────────────────────────────────────────── */}
      {tradeMode && (
        <div className="gc-trade-mode-bar">
          <div className="gc-trade-mode-header">
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" style={{ color: "#F59E0B" }} />
            <span className="gc-trade-mode-title">{t("chat.tradeOffer")}</span>
            <button className="gc-lfg-cancel" onClick={() => { setTradeMode(false); setTradeOffering(""); setTradeSeeking(""); setTradePrice(""); }}>✕</button>
          </div>
          <div className="gc-trade-mode-fields">
            <input
              className="gc-trade-field-input"
              placeholder={`📦 ${t("chat.offering")}…`}
              value={tradeOffering}
              onChange={e => setTradeOffering(e.target.value)}
              maxLength={80}
            />
            <input
              className="gc-trade-field-input"
              placeholder={`🔍 ${t("chat.seeking")}…`}
              value={tradeSeeking}
              onChange={e => setTradeSeeking(e.target.value)}
              maxLength={80}
            />
            <input
              className="gc-trade-field-input gc-trade-field-price"
              placeholder={`💰 ${t("chat.price")}…`}
              value={tradePrice}
              onChange={e => setTradePrice(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="gc-input-area">
        <div className="gc-input-row">
          {/* Emoji */}
          <div className="gc-emoji-wrap">
            <button
              className={`gc-icon-btn ${showEmoji ? "gc-icon-btn--active" : ""}`}
              onClick={() => { setShowEmoji(v => !v); setShowGif(false); }}
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

          {/* GIF (Pro only) */}
          {isPro && (
            <div className="gc-emoji-wrap">
              <button
                className={`gc-icon-btn gc-gif-btn ${showGif ? "gc-icon-btn--active" : ""}`}
                onClick={() => { setShowGif(v => !v); setShowEmoji(false); }}
                title={t("chat.gif")}
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              {showGif && (
                <GifPicker
                  onSelect={sendGif}
                  onClose={() => setShowGif(false)}
                  t={t}
                />
              )}
            </div>
          )}

          {/* LFG signal */}
          <button
            className={`gc-icon-btn ${lfgMode ? "gc-icon-btn--active" : ""}`}
            onClick={() => { setLfgMode(v => !v); setTradeMode(false); }}
            title={t("chat.lfgSignal")}
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Trade offer */}
          <button
            className={`gc-icon-btn ${tradeMode ? "gc-icon-btn--active" : ""}`}
            onClick={() => { setTradeMode(v => !v); setLfgMode(false); }}
            title={t("chat.tradeOffer")}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            className="gc-input"
            placeholder={tradeMode ? t("chat.tradePlaceholder") : lfgMode ? t("chat.lfgPlaceholder") : t("chat.placeholder")}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            maxLength={maxLen}
            style={textColor && isPro ? { color: textColor } : undefined}
          />

          {/* Send */}
          <button
            className="gc-send-btn"
            onClick={() => void send()}
            disabled={sending || (!input.trim() && !(tradeMode && (tradeOffering.trim() || tradeSeeking.trim())))}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Char counter */}
        {input.length > Math.floor(maxLen * 0.8) && (
          <div
            className="gc-char-count"
            style={{ color: input.length > maxLen - 10 ? "#EF4444" : "#94a3b8" }}
          >
            {maxLen - input.length}
          </div>
        )}
      </div>

      {/* ── User card popover ─────────────────────────────────────────────── */}
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
