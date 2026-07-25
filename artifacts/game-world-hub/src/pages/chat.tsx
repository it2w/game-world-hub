import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  useGetMessages,
  useSendMessage,
  useGetMe,
  useDeleteMessage,
  useDeleteConversationFull,
  getGetMessagesQueryKey,
  getGetMeQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AnimatedLogo } from "@/components/animated-logo";
import {
  Send, Users, Shield, Trash2, X, EyeOff, Eye,
  Pin, PinOff, Search, Smile, Reply, Pencil, MoreHorizontal,
  Phone, PhoneOff, UserPlus, BarChart2, MessageSquare,
  Paperclip, Loader2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { PollCard, isPollMessage, parsePollId } from "./chat/PollCard";
import { ThreadPanel } from "./chat/ThreadPanel";
import { PollComposer } from "./chat/PollComposer";
import { format, isToday, isYesterday } from "date-fns";
import { useVoice } from "@/voice/voice-context";
import { VoiceStage } from "@/voice/components/voice-stage";

// ─── ConvMenu — simple popover, no Radix dependency ──────────────────────────

function ConvMenu({
  conv,
  isHidden,
  isActive,
  onHide,
  onRestore,
  onDelete,
}: {
  conv: any;
  isHidden: boolean;
  isActive: boolean;
  onHide: () => void;
  onRestore: () => void;
  /** onDelete fires only for direct conversations — caller shows confirm dialog */
  onDelete: () => void;
}) {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        className={`p-1.5 rounded-md hover:bg-black/20 transition-all ${
          isActive
            ? "text-foreground/60 hover:text-foreground opacity-100"
            : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
        }`}
        title={t("sidebar.options")}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1 z-[200] w-52 bg-popover border border-border rounded-xl shadow-2xl py-1.5 text-sm overflow-hidden">
          {isHidden ? (
            /* ── Hidden mode: restore ── */
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-start font-medium"
              onClick={() => { setOpen(false); onRestore(); }}
            >
              <Eye className="w-4 h-4 shrink-0 text-primary" />
              <span>{t("sidebar.restoreConversation")}</span>
            </button>
          ) : (
            /* ── Normal mode ── */
            <>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-start text-muted-foreground hover:text-foreground"
                onClick={() => { setOpen(false); onHide(); }}
              >
                <EyeOff className="w-4 h-4 shrink-0" />
                <span>{t("sidebar.hideConversation")}</span>
              </button>

              <div className="h-px bg-border mx-3 my-1" />
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-destructive/10 text-destructive transition-colors text-start"
                onClick={() => { setOpen(false); onDelete(); }}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>
                  {conv.type === "direct"
                    ? t("sidebar.deleteConversation")
                    : t("sidebar.leaveConversation")}
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MessageReaction = { emoji: string; count: number; mine: boolean };
type MessageReply = { id: number; sender: { displayName: string }; content: string; createdAt: string };
type Message = {
  id: number;
  conversationId: number;
  sender: { id: number; displayName: string; avatarUrl?: string | null };
  content: string;
  isPinned: boolean;
  editedAt: string | null;
  replyTo: MessageReply | null;
  reactions: MessageReaction[];
  createdAt: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const EMOJI_PALETTE = ["👍", "❤️", "😂", "😮", "😢", "😡", "🔥", "🎮"];

const EMOJI_GROUPS = [
  { id: "smileys", icon: "😀", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","😴","😷","🤒","🤕","🤢","🥵","🥶","😵","🤯","😎","🤓","🧐","😕","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👻","👽","🤖","💋","❤️","🔥","✨","💯"] },
  { id: "people", icon: "👋", emojis: ["👋","🤚","✋","🖖","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🤲","🙏","💪","🤝","👶","👦","👧","🧑","👱","👨","👩","🧓","👴","👵","🧙","🧚","🧛","🧜","🧝","💃","🕺","🏃","🚶","🧘","🏋️","🤸","🤼","🤺","⛹️","🤾","🏊","🚴","👮","🕵️","💂"] },
  { id: "animals", icon: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🕷","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🐘","🦛","🦏","🐪","🦒","🐃","🐄","🐎","🐖","🐏","🐑","🐕","🐩","🐈","🐓","🦃","🦚","🦜","🦢","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🐿","🦔"] },
  { id: "food", icon: "🍔", emojis: ["🍕","🍔","🍟","🌭","🍿","🧂","🥓","🥚","🍳","🧇","🥞","🍞","🥐","🧀","🥗","🌮","🌯","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍩","🍪","🍉","🍎","🍐","🍊","🍋","🍌","🍍","🥭","🍓","🫐","🍒","🍑","🥝","🍅","🥑","🥕","🌽","🌶️","🥦","🥜","🍵","☕","🧃","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧋","🥤","🧊"] },
  { id: "activities", icon: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🎯","🎮","🕹️","🎲","♟️","🎭","🎨","🎪","🎬","🎤","🎧","🎼","🎵","🎶","🎻","🎸","🥁","🎺","🎷","🎹","🎠","🎡","🎢","🎫","🎟️","🎗️","🎀","🎁","🎊","🎉","🎈","🎆","🎇","🧨","🏆","🥇","🥈","🥉","🏅","🚀","🌍","🌙","⭐","🌟","💫","⚡","🌈","❄️","☀️","🌊","🌸","🌺","🌻","🌹","🍀","🌿","🍁","🌾","🍄","🌱","🌳","🌴","🌵","🎋","🎍"] },
  { id: "symbols", icon: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","☯️","⚛️","🆔","⚠️","♻️","✅","❌","⭕","🛑","⛔","📛","🚫","💯","‼️","⁉️","❓","❔","❗","❕","🔅","🔆","🔱","⚜️","🔰","▶️","⏸","⏹","⏺","⏭","⏮","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↕️","↔️","🔀","🔁","🔂","🔄","➕","➖","➗","✖️","💲","©️","®️","™️","🔔","🔕","💬","💭","🗯","💤","🔑","🔒","🔓","⚙️","🔧","🔨","🔗","🧲","🔬","🔭","💡","💻","📱","☎️","📷","📸","📹","📅","📋","📊","📈","📉","💰","💳","💎","🔮","🧩","🎱","🎭","♠️","♥️","♦️","♣️"] },
];

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const segments = text.split(/(`[^`\n]+`)/g);
  return segments.flatMap((seg, si) => {
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
      return [
        <code key={si} className="bg-muted/60 px-1.5 py-0.5 rounded font-mono text-[0.8em] text-foreground">
          {seg.slice(1, -1)}
        </code>,
      ];
    }
    const spoilerParts = seg.split(/(\|\|[^|]+\|\|)/g);
    return spoilerParts.flatMap((sp, spi) => {
      if (sp.startsWith("||") && sp.endsWith("||") && sp.length > 4) {
        return [<Spoiler key={`${si}-${spi}`} text={sp.slice(2, -2)} />];
      }
      const boldParts = sp.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.flatMap((bp, bpi) => {
        if (bp.startsWith("**") && bp.endsWith("**") && bp.length > 4) {
          return [<strong key={`${si}-${spi}-${bpi}`}>{bp.slice(2, -2)}</strong>];
        }
        const italicParts = bp.split(/(\*[^*]+\*)/g);
        return italicParts.map((ip, ipi) => {
          if (ip.startsWith("*") && ip.endsWith("*") && ip.length > 2) {
            return <em key={`${si}-${spi}-${bpi}-${ipi}`}>{ip.slice(1, -1)}</em>;
          }
          return ip || null;
        });
      });
    });
  });
}

function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      className={`cursor-pointer rounded px-0.5 select-none transition-all ${revealed ? "" : "bg-foreground/80 text-transparent hover:bg-foreground/60"}`}
    >
      {text}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

/** Consistent distinct color per user, stable across renders. */
const AVATAR_PALETTE = [
  { bg: "#1a2e4a", border: "#2563eb44", text: "#60a5fa" }, // blue
  { bg: "#2d1b4e", border: "#7c3aed44", text: "#a78bfa" }, // violet
  { bg: "#1a3a2a", border: "#16a34a44", text: "#4ade80" }, // green
  { bg: "#3d1f0a", border: "#ea580c44", text: "#fb923c" }, // orange
  { bg: "#3a1a1a", border: "#dc262644", text: "#f87171" }, // red
  { bg: "#0f3040", border: "#0891b244", text: "#22d3ee" }, // cyan
  { bg: "#382a0a", border: "#d9770644", text: "#fbbf24" }, // amber
  { bg: "#1a1f40", border: "#4f46e544", text: "#818cf8" }, // indigo
  { bg: "#2d1435", border: "#a21caf44", text: "#e879f9" }, // pink
  { bg: "#0f3030", border: "#0d948044", text: "#2dd4bf" }, // teal
];

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";
  if (src) {
    return <img src={src} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  const color = AVATAR_PALETTE[nameHash(name) % AVATAR_PALETTE.length];
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
    >
      {nameInitials(name)}
    </div>
  );
}

// ─── Reaction bar ─────────────────────────────────────────────────────────────

function ReactionBar({
  reactions, messageId, conversationId, myId, onUpdate,
}: {
  reactions: MessageReaction[];
  messageId: number;
  conversationId: number;
  myId: number;
  onUpdate: (updated: MessageReaction[]) => void;
}) {
  const toggle = async (emoji: string, mine: boolean) => {
    try {
      const url = `/api/conversations/${conversationId}/messages/${messageId}/reactions`;
      if (mine) {
        const updated = await customFetch<MessageReaction[]>(`${url}/${encodeURIComponent(emoji)}`, { method: "DELETE" });
        onUpdate(updated);
      } else {
        const updated = await customFetch<MessageReaction[]>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) });
        onUpdate(updated);
      }
    } catch {}
  };

  if (reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggle(r.emoji, r.mine)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
            r.mine
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-muted/50 border-border hover:border-primary/30 hover:bg-primary/10"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-mono font-bold">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Emoji picker (reactions — 8 quick emojis) ───────────────────────────────

function ReactionEmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute z-50 bottom-full mb-1 bg-card border border-border rounded-lg shadow-xl p-2 flex gap-1">
      {EMOJI_PALETTE.map((e) => (
        <button
          key={e}
          onClick={() => { onPick(e); onClose(); }}
          className="text-lg hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded hover:bg-muted"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── Full emoji picker for message input ─────────────────────────────────────

function InputEmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(EMOJI_GROUPS[0].id);
  const active = EMOJI_GROUPS.find(g => g.id === tab) ?? EMOJI_GROUPS[0];
  return (
    <div className="flex flex-col w-72" onMouseDown={e => e.preventDefault()}>
      <div className="flex gap-0.5 px-2 pt-2 pb-1 border-b border-border">
        {EMOJI_GROUPS.map(g => (
          <button
            key={g.id}
            className={`flex-1 text-base py-1 rounded transition-colors ${tab === g.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-muted-foreground"}`}
            onClick={() => setTab(g.id)}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto">
        {active.emojis.map(em => (
          <button
            key={em}
            className="text-lg p-1 rounded hover:bg-muted/60 transition-colors leading-none"
            onClick={() => { onSelect(em); onClose(); }}
          >
            {em}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── GIF picker for message input ────────────────────────────────────────────

type GifResult = { id: string; title: string; url: string; preview: string; width: number; height: number };

function ChatGifPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val.trim()), 500);
  };

  const { data: trendingData, isLoading: loadingTrending } = useQuery<{ gifs: GifResult[] }>({
    queryKey: ["gif-trending"],
    queryFn: () => customFetch("/api/gif/trending"),
    staleTime: 5 * 60_000,
    enabled: !debouncedSearch,
  });

  const { data: searchData, isLoading: loadingSearch } = useQuery<{ gifs: GifResult[] }>({
    queryKey: ["gif-search", debouncedSearch],
    queryFn: () => customFetch(`/api/gif/search?q=${encodeURIComponent(debouncedSearch)}`),
    staleTime: 60_000,
    enabled: !!debouncedSearch,
  });

  const gifs = debouncedSearch ? (searchData?.gifs ?? []) : (trendingData?.gifs ?? []);
  const loading = debouncedSearch ? loadingSearch : loadingTrending;

  return (
    <div className="flex flex-col" style={{ width: 420 }}>
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full bg-muted/50 rounded-md ps-7 pe-3 py-1.5 text-sm outline-none border border-border focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
            placeholder="Search GIFs…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground text-sm">
            <span className="text-2xl">🎞️</span>
            {debouncedSearch ? "No GIFs found" : "Loading…"}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 p-2">
            {gifs.map(gif => (
              <button
                key={gif.id}
                className="rounded overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50"
                onClick={() => onSelect(gif.url)}
                title={gif.title}
              >
                <img
                  src={gif.preview || gif.url}
                  alt={gif.title}
                  className="w-full object-cover"
                  style={{ height: 100 }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
        {!debouncedSearch && !loading && gifs.length > 0 && (
          <p className="text-center text-[10px] text-muted-foreground pb-1 opacity-60">Powered by GIPHY</p>
        )}
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg, isMe, showHeader, myId, conversationId,
  onReply, onStartEdit, onDelete, onPin, onReactionUpdate, onOpenThread,
}: {
  msg: Message; isMe: boolean; showHeader: boolean; myId: number; conversationId: number;
  onReply: (msg: Message) => void; onStartEdit: (msg: Message) => void;
  onDelete: (msgId: number) => void; onPin: (msgId: number, isPinned: boolean) => void;
  onReactionUpdate: (msgId: number, reactions: MessageReaction[]) => void;
  onOpenThread: (msg: Message) => void;
}) {
  const { t } = useTranslation("chat");
  const [hovered, setHovered] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const addReaction = async (emoji: string) => {
    try {
      const updated = await customFetch<MessageReaction[]>(
        `/api/conversations/${conversationId}/messages/${msg.id}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }
      );
      onReactionUpdate(msg.id, updated);
    } catch {}
  };

  return (
    <div
      className="group flex gap-3 px-4 py-0.5 hover:bg-muted/20 relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowEmoji(false); }}
    >
      <div className="w-9 shrink-0 pt-0.5">
        {showHeader && <Avatar src={msg.sender.avatarUrl} name={msg.sender.displayName} />}
      </div>
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-sm text-foreground hover:underline cursor-pointer">{msg.sender.displayName}</span>
            <span className="text-[11px] text-muted-foreground font-mono">{formatTime(msg.createdAt)}</span>
          </div>
        )}
        {msg.replyTo && (
          <div className="flex items-start gap-2 mb-1 ms-1 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground">
            <span className="font-semibold text-primary/80 shrink-0">{msg.replyTo.sender.displayName}</span>
            <span className="truncate max-w-[300px]">{msg.replyTo.content}</span>
          </div>
        )}
        {isPollMessage(msg.content) ? (
          <PollCard
            conversationId={conversationId}
            pollId={parsePollId(msg.content)!}
            myId={myId}
          />
        ) : /^\/api\/images\/[0-9a-f-]{36}$/i.test(msg.content.trim()) || /^https?:\/\/media\d*\.giphy\.com\//i.test(msg.content.trim()) ? (
          <img
            src={msg.content.trim()}
            alt="media"
            className="max-w-xs max-h-52 rounded-xl mt-1 object-contain cursor-pointer"
            onClick={() => window.open(msg.content.trim(), "_blank")}
            loading="lazy"
          />
        ) : (
          <p className="text-sm leading-relaxed break-words">
            {renderMarkdown(msg.content)}
            {msg.editedAt && <span className="text-[10px] text-muted-foreground ms-1.5 font-mono">({t("msg.edited")})</span>}
          </p>
        )}
        <ReactionBar reactions={msg.reactions} messageId={msg.id} conversationId={conversationId} myId={myId} onUpdate={(u) => onReactionUpdate(msg.id, u)} />
      </div>
      {hovered && (
        <div className="absolute end-4 top-0 -translate-y-1/2 flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-lg px-1 py-0.5 z-10">
          <div className="relative">
            <button onClick={() => setShowEmoji((s) => !s)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title={t("reactions.addReaction")}>
              <Smile className="w-3.5 h-3.5" />
            </button>
            {showEmoji && <ReactionEmojiPicker onPick={addReaction} onClose={() => setShowEmoji(false)} />}
          </div>
          <button onClick={() => onReply(msg)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title={t("msg.reply")}>
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onOpenThread(msg)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title={t("msg.thread")}>
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          {isMe && (
            <button onClick={() => onStartEdit(msg)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title={t("msg.edit")}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onPin(msg.id, !msg.isPinned)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title={msg.isPinned ? t("msg.unpin") : t("msg.pin")}>
            {msg.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onDelete(msg.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors" title={t("msg.delete")}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

function formatDateDivider(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

function shouldShowDateDivider(prev: Message | undefined, cur: Message) {
  if (!prev) return true;
  return new Date(prev.createdAt).toDateString() !== new Date(cur.createdAt).toDateString();
}

function shouldShowHeader(prev: Message | undefined, cur: Message) {
  if (!prev) return true;
  if (cur.replyTo) return true;
  if (prev.sender.id !== cur.sender.id) return true;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Chat({ params }: { params: { conversationId?: string } }) {
  const { t } = useTranslation("chat");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [showHidden, setShowHidden] = useState(false);

  // Conversations query — supports showHidden toggle
  const convQueryKey = ["conversations", showHidden ? "hidden" : "visible"] as const;
  const { data: conversations } = useQuery({
    queryKey: convQueryKey,
    queryFn: () =>
      customFetch<any[]>(`/api/conversations${showHidden ? "?showHidden=true" : ""}`),
    refetchInterval: 8000,
  });

  const invalidateConvs = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations", "visible"] });
    queryClient.invalidateQueries({ queryKey: ["conversations", "hidden"] });
  };

  const conversationId = params.conversationId ? parseInt(params.conversationId) : null;
  const activeConversation = conversations?.find((c) => c.id === conversationId);

  const { data: rawMessages } = useGetMessages(conversationId!, {
    query: { enabled: !!conversationId, refetchInterval: 3000, queryKey: getGetMessagesQueryKey(conversationId!) },
  });

  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (rawMessages) setLocalMessages(rawMessages as unknown as Message[]);
  }, [rawMessages]);

  const sendMessage = useSendMessage();
  const deleteMessage = useDeleteMessage();
  const deleteConversationFull = useDeleteConversationFull();

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [activeThreadMsg, setActiveThreadMsg] = useState<Message | null>(null);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [automodError, setAutomodError] = useState<string | null>(null);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // ── Custom confirm dialog (replaces window.confirm) ──
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    description: string;
    onConfirm: () => void;
  }>({ open: false, description: "", onConfirm: () => {} });

  const openConfirm = (description: string, onConfirm: () => void) =>
    setConfirmDialog({ open: true, description, onConfirm });
  const closeConfirm = () => setConfirmDialog((d) => ({ ...d, open: false }));

  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const voice = useVoice();
  const [typingUsers, setTypingUsers] = useState<Map<number, { displayName: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const handleTyping = (e: CustomEvent) => {
      const { conversationId: cid, userId, displayName } = e.detail;
      if (cid !== conversationId || userId === me?.id) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const existing = next.get(userId);
        if (existing) clearTimeout(existing.timer);
        const timer = setTimeout(() => setTypingUsers((cur) => { const m = new Map(cur); m.delete(userId); return m; }), 3000);
        next.set(userId, { displayName, timer });
        return next;
      });
    };
    window.addEventListener("gwh:typing" as any, handleTyping as EventListener);
    return () => window.removeEventListener("gwh:typing" as any, handleTyping as EventListener);
  }, [conversationId, me?.id]);

  useEffect(() => {
    const handler = (e: CustomEvent) => window.dispatchEvent(new CustomEvent("gwh:ws-send", { detail: { type: "typing", conversationId: e.detail.conversationId } }));
    window.addEventListener("gwh:send-typing" as any, handler as EventListener);
    return () => window.removeEventListener("gwh:send-typing" as any, handler as EventListener);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [localMessages]);
  useEffect(() => { if (editingMsg) editRef.current?.focus(); }, [editingMsg]);
  useEffect(() => { setReplyTo(null); setEditingMsg(null); setSearchQuery(""); setShowSearch(false); setShowPinned(false); setActiveThreadMsg(null); setShowPollComposer(false); }, [conversationId]);

  // When the user opens a conversation, refresh both the conversations list (to clear
  // the unread badge) and the notifications (to clear the bell indicator).
  useEffect(() => {
    if (!conversationId) return;
    // Small delay so the GET messages request has time to mark things as read on the server
    const t = setTimeout(() => {
      invalidateConvs();
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    }, 600);
    return () => clearTimeout(t);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    window.dispatchEvent(new CustomEvent("gwh:send-typing", { detail: { conversationId } }));
  }, [conversationId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputRef.current?.value.trim();
    if (!content || !conversationId) return;
    sendMessage.mutate(
      { conversationId, data: { content, replyToId: replyTo?.id } as any },
      {
        onSuccess: () => {
          if (inputRef.current) inputRef.current.value = "";
          setReplyTo(null);
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
          invalidateConvs();
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "";
          if (err?.status === 429 || err?.data?.automod) {
            if (inputRef.current) inputRef.current.value = content ?? "";
            // Show AutoMod rejection in the typing area via a transient state
            setAutomodError(msg || t("automod.blocked"));
            setTimeout(() => setAutomodError(null), 4000);
          }
        },
      }
    );
  };

  /** Insert emoji at cursor in the uncontrolled input */
  const insertEmoji = useCallback((emoji: string) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    setShowInputEmoji(false);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  }, []);

  /** Send a GIF URL immediately as a message */
  const sendGif = useCallback((url: string) => {
    if (!conversationId) return;
    setShowGif(false);
    sendMessage.mutate(
      { conversationId, data: { content: url } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
          invalidateConvs();
        },
      }
    );
  }, [conversationId, sendMessage, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Upload an image and send its URL as a message */
  const handleImageUpload = useCallback(async (file: File) => {
    if (!conversationId) return;
    if (file.size > 8 * 1024 * 1024) { toast({ title: "Image too large (max 8 MB)", variant: "destructive" }); return; }
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("gwh_token");
      const res = await fetch("/api/images", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json() as { objectPath: string };
      sendMessage.mutate(
        { conversationId, data: { content: `/api${data.objectPath}` } as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
            invalidateConvs();
          },
        }
      );
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally { setImgUploading(false); }
  }, [conversationId, sendMessage, queryClient, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (msgId: number) => {
    if (!conversationId) return;
    deleteMessage.mutate({ conversationId, messageId: msgId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
        invalidateConvs();
      },
    });
  };

  const handleEdit = async () => {
    if (!editingMsg || !conversationId || !editContent.trim()) return;
    try {
      const updated = await customFetch<Message>(
        `/api/conversations/${conversationId}/messages/${editingMsg.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editContent.trim() }) }
      );
      setLocalMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {}
    setEditingMsg(null);
    setEditContent("");
  };

  const handlePin = async (msgId: number, isPinned: boolean) => {
    if (!conversationId) return;
    try {
      const updated = await customFetch<Message>(
        `/api/conversations/${conversationId}/messages/${msgId}/pin`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned }) }
      );
      setLocalMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {}
  };

  const handleReactionUpdate = (msgId: number, reactions: MessageReaction[]) =>
    setLocalMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions } : m)));

  const handleHide = async (convId: number) => {
    try {
      await customFetch(`/api/conversations/${convId}`, { method: "DELETE" });
      invalidateConvs();
      if (conversationId === convId) setLocation("/chat");
    } catch {}
  };

  const handleRestore = async (convId: number) => {
    try {
      await customFetch(`/api/conversations/${convId}/restore`, { method: "POST" });
      invalidateConvs();
    } catch {}
  };

  const handleDeleteConv = (convId: number) => {
    const conv = conversations?.find((c: any) => c.id === convId);
    const isDirect = conv?.type === "direct";
    openConfirm(
      isDirect ? t("sidebar.confirmDeletePrompt") : t("sidebar.confirmLeavePrompt"),
      () => {
        if (isDirect) {
          deleteConversationFull.mutate({ conversationId: convId }, {
            onSuccess: () => {
              invalidateConvs();
              if (conversationId === convId) setLocation("/chat");
            },
          });
        } else {
          customFetch(`/api/conversations/${convId}/leave`, { method: "POST" })
            .then(() => {
              invalidateConvs();
              if (conversationId === convId) setLocation("/chat");
            })
            .catch(() => {});
        }
      }
    );
  };

  const pinnedMessages = useMemo(() => localMessages.filter((m) => m.isPinned), [localMessages]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return localMessages;
    const q = searchQuery.toLowerCase();
    return localMessages.filter((m) => m.content.toLowerCase().includes(q) || m.sender.displayName.toLowerCase().includes(q));
  }, [localMessages, searchQuery]);

  const getConversationName = (conv: any) => {
    if (conv.name) return conv.name;
    if (conv.type === "direct" && me) {
      const other = conv.participants.find((p: any) => p.id !== me.id);
      return other ? other.displayName : t("conversation.directMessage");
    }
    return t("conversation.groupChat");
  };

  const typingNames = Array.from(typingUsers.values()).map((u) => u.displayName);

  const activeOther =
    activeConversation?.type === "direct" && me
      ? activeConversation.participants.find((p: any) => p.id !== me.id)
      : null;
  const activeRoom = voice.activeRoom;
  const callBelongsHere =
    !!activeOther &&
    activeRoom?.kind === "call" &&
    activeRoom.peer.userId === activeOther.id;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background">
      {/* ── Sidebar ── */}
      <div
        className="w-64 border-e border-border flex flex-col shrink-0"
        style={{ background: "linear-gradient(180deg, rgba(20,20,32,0.6) 0%, rgba(8,8,15,0.55) 100%)" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {showHidden ? t("sidebar.hiddenTitle") : t("sidebar.title")}
          </h2>
          {!showHidden && conversations?.length ? (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {conversations.length}
            </span>
          ) : null}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-auto py-1">
          {conversations?.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-8 px-4">
              {showHidden ? t("sidebar.noHidden") : t("sidebar.noConversations")}
            </div>
          )}
          {conversations?.map((conv) => {
            const isActive = conv.id === conversationId;
            const name = getConversationName(conv);
            const other = conv.type === "direct" && me ? conv.participants.find((p: any) => p.id !== me.id) : null;
            return (
              <div
                key={conv.id}
                className={`group relative flex items-center gap-2.5 px-2 py-1.5 mx-2 my-0.5 rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? "bg-primary/[0.08] text-foreground ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                } ${showHidden ? "opacity-60 hover:opacity-100" : ""}`}
                onClick={() => !showHidden && setLocation(`/chat/${conv.id}`)}
              >
                {isActive && (
                  <span className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-primary" />
                )}
                <div className="relative shrink-0">
                  <Avatar src={(other as any)?.avatarUrl} name={name} size="sm" />
                  {conv.type === "party" && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                      <Shield className="w-2 h-2 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-1">
                    <span className="text-sm font-medium truncate">{name}</span>
                    {!showHidden && conv.unreadCount ? (
                      <span className="shrink-0 min-w-[1.125rem] bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center font-bold px-1 h-4">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    ) : conv.lastMessage ? (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(conv.lastMessage.createdAt), "HH:mm")}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs truncate">
                    {conv.lastMessage
                      ? `${conv.lastMessage.sender.id === me?.id ? t("sidebar.you") : conv.lastMessage.sender.displayName}: ${conv.lastMessage.content}`
                      : t("sidebar.noMessages")}
                  </div>
                </div>

                {/* ⋯ menu */}
                <ConvMenu
                  conv={conv}
                  isHidden={showHidden}
                  isActive={isActive}
                  onHide={() => handleHide(conv.id)}
                  onRestore={() => handleRestore(conv.id)}
                  onDelete={() => handleDeleteConv(conv.id)}
                />
              </div>
            );
          })}
        </div>

        {/* Footer toggle — show hidden / show visible */}
        <button
          onClick={() => setShowHidden((s) => !s)}
          className={`flex items-center gap-2 px-4 py-3 border-t border-border text-xs font-medium transition-colors w-full text-start ${
            showHidden
              ? "text-primary bg-primary/5 hover:bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          {showHidden ? (
            <><Eye className="w-3.5 h-3.5" />{t("sidebar.showVisible")}</>
          ) : (
            <><EyeOff className="w-3.5 h-3.5" />{t("sidebar.showHidden")}</>
          )}
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId && !showHidden ? (
          <>
            {/* Header */}
            <div
              className="h-14 border-b border-border px-4 flex items-center justify-between shrink-0 backdrop-blur gap-3"
              style={{ background: "linear-gradient(180deg, rgba(20,20,32,0.7), rgba(8,8,15,0.4))" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {activeConversation && (
                  <Avatar
                    src={(activeOther as any)?.avatarUrl}
                    name={getConversationName(activeConversation)}
                    size="sm"
                  />
                )}
                <span className="font-semibold truncate">
                  {activeConversation ? getConversationName(activeConversation) : "…"}
                </span>
                {activeConversation?.type === "party" && (
                  <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                    {t("conversation.partyComms")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activeConversation?.type === "direct" && activeOther && (
                  callBelongsHere ? (
                    /* Already in a call with this person → leave button */
                    <button
                      onClick={voice.leaveVoice}
                      title={t("conversation.callActive")}
                      aria-label={t("conversation.callActive")}
                      className="p-1.5 rounded transition-colors"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }}
                    >
                      <PhoneOff className="w-4 h-4" />
                    </button>
                  ) : activeRoom?.kind === "call" ? (
                    /* In a call with someone else → offer to invite this person */
                    (() => {
                      const invState = voice.groupInviteStates[activeOther.id];
                      const invLabel =
                        invState === "ringing" ? "يرن..." :
                        invState === "joined"  ? "انضم ✓" :
                        invState === "declined" ? "رفض" :
                        "دعوة إلى المكالمة";
                      return (
                        <button
                          onClick={() =>
                            !invState && voice.inviteToCall({
                              userId: activeOther.id,
                              username: (activeOther as any).username ?? activeOther.displayName,
                              displayName: activeOther.displayName,
                              avatarUrl: activeOther.avatarUrl ?? null,
                            })
                          }
                          disabled={invState === "ringing" || invState === "joined"}
                          title={invLabel}
                          aria-label={invLabel}
                          className="p-1.5 rounded transition-colors disabled:opacity-50"
                          style={
                            invState === "joined"
                              ? { color: "hsl(var(--primary))" }
                              : invState === "declined"
                              ? { color: "hsl(var(--destructive))" }
                              : invState === "ringing"
                              ? { color: "hsl(var(--primary))", opacity: 0.6 }
                              : { color: "var(--muted-foreground)" }
                          }
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      );
                    })()
                  ) : (
                    /* No active call → start call button */
                    <button
                      onClick={() =>
                        voice.callUser({
                          userId: activeOther.id,
                          username: (activeOther as any).username ?? activeOther.displayName,
                          displayName: activeOther.displayName,
                          avatarUrl: activeOther.avatarUrl ?? null,
                        })
                      }
                      disabled={!!activeRoom}
                      title={activeRoom ? t("conversation.endCallFirst") : t("conversation.startCall")}
                      aria-label={activeRoom ? t("conversation.endCallFirst") : t("conversation.startCall")}
                      className="p-1.5 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  )
                )}
                {pinnedMessages.length > 0 && (
                  <button
                    onClick={() => setShowPinned((s) => !s)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showPinned ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                  >
                    <Pin className="w-3 h-3" />
                    <span className="font-mono">{pinnedMessages.length}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowSearch((s) => !s)}
                  className={`p-1.5 rounded transition-colors ${showSearch ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  <Search className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 border-l border-border">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-mono">{activeConversation?.participants.length ?? 0}</span>
                </div>
              </div>
            </div>

            {callBelongsHere && <VoiceStage />}

            {/* Pinned panel */}
            {showPinned && pinnedMessages.length > 0 && (
              <div className="border-b border-border bg-amber-500/5 px-4 py-2 max-h-40 overflow-auto">
                <div className="text-xs font-semibold text-amber-500 mb-1.5 flex items-center gap-1">
                  <Pin className="w-3 h-3" /> {t("conversation.pinnedMessages")}
                </div>
                <div className="space-y-1">
                  {pinnedMessages.map((m) => (
                    <div key={m.id} className="text-xs text-muted-foreground flex gap-2">
                      <span className="font-semibold text-foreground shrink-0">{m.sender.displayName}:</span>
                      <span className="truncate">{m.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search bar */}
            {showSearch && (
              <div className="border-b border-border px-4 py-2 bg-card/30">
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("search.placeholder")} className="h-8 text-sm" autoFocus />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto py-4">
              {filteredMessages.length === 0 && searchQuery ? (
                <div className="text-center text-muted-foreground text-sm py-8">{t("search.noResults")}</div>
              ) : (
                filteredMessages.map((msg, i) => {
                  const isMe = msg.sender.id === me?.id;
                  const prev = filteredMessages[i - 1];
                  const showDivider = shouldShowDateDivider(prev, msg);
                  const showHeader = shouldShowHeader(prev, msg);

                  if (editingMsg?.id === msg.id) {
                    return (
                      <div key={msg.id} className="px-4 py-1">
                        {showDivider && <DateDivider label={formatDateDivider(msg.createdAt)} />}
                        <div className="flex gap-3">
                          <div className="w-9 shrink-0" />
                          <div className="flex-1 bg-muted/40 rounded-md p-2 border border-border">
                            <div className="text-xs text-muted-foreground mb-1">{t("input.editingMessage")}</div>
                            <input
                              ref={editRef}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                                if (e.key === "Escape") { setEditingMsg(null); setEditContent(""); }
                              }}
                              className="w-full bg-transparent text-sm outline-none"
                            />
                            <div className="flex gap-2 mt-1.5 text-xs">
                              <button onClick={handleEdit} className="text-primary hover:underline">{t("input.saveEdit")}</button>
                              <button onClick={() => { setEditingMsg(null); setEditContent(""); }} className="text-muted-foreground hover:underline">{t("input.cancelEdit")}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id}>
                      {showDivider && <DateDivider label={formatDateDivider(msg.createdAt)} />}
                      <MessageBubble
                        msg={msg} isMe={isMe} showHeader={showHeader}
                        myId={me?.id ?? 0} conversationId={conversationId}
                        onReply={setReplyTo}
                        onStartEdit={(m) => { setEditingMsg(m); setEditContent(m.content); }}
                        onDelete={handleDelete} onPin={handlePin} onReactionUpdate={handleReactionUpdate}
                        onOpenThread={setActiveThreadMsg}
                      />
                    </div>
                  );
                })
              )}

              {typingNames.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground">
                  <span className="flex gap-0.5">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </span>
                  {typingNames.length === 1 ? t("typing.one", { name: typingNames[0] }) : t("typing.multiple", { count: typingNames.length })}
                </div>
              )}
              <div ref={bottomRef} className="h-4" />
            </div>

            {/* Input area */}
            <div className="px-4 pb-4 pt-0 shrink-0 relative">
              {showPollComposer && conversationId && (
                <PollComposer
                  conversationId={conversationId}
                  onClose={() => setShowPollComposer(false)}
                  onCreated={() => {
                    setShowPollComposer(false);
                    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
                    invalidateConvs();
                  }}
                />
              )}
              {replyTo && (
                <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-t-2xl px-3 py-1.5 text-xs mb-0 border-b-0">
                  <Reply className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-muted-foreground">{t("input.replyingTo", { name: replyTo.sender.displayName })}:</span>
                  <span className="truncate text-foreground/70">{replyTo.content}</span>
                  <button onClick={() => setReplyTo(null)} className="ms-auto shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {/* Hidden file input for image upload */}
              <input
                ref={imgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleImageUpload(f); e.target.value = ""; } }}
              />
              <form
                onSubmit={handleSend}
                className={`flex items-center gap-1.5 bg-muted/40 border border-border px-2 py-2 transition-shadow focus-within:border-primary/40 ${replyTo ? "rounded-b-2xl rounded-t-none" : "rounded-full"}`}
              >
                {/* Attachment */}
                <button
                  type="button"
                  onClick={() => imgFileRef.current?.click()}
                  disabled={imgUploading}
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 rounded-full hover:bg-muted/60"
                  title="Attach image"
                >
                  {imgUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>

                <input
                  ref={inputRef}
                  placeholder={activeConversation ? t("input.placeholder", { name: getConversationName(activeConversation) }) : t("input.placeholderGeneric")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0 px-1"
                  disabled={sendMessage.isPending}
                  onChange={() => {
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    sendTyping();
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                />

                {/* Poll */}
                <button
                  type="button"
                  onClick={() => setShowPollComposer((s) => !s)}
                  title={t("poll.create")}
                  className={`shrink-0 p-1.5 rounded-full transition-colors hover:bg-muted/60 ${showPollComposer ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <BarChart2 className="w-4 h-4" />
                </button>

                {/* GIF picker */}
                <Popover open={showGif} onOpenChange={setShowGif}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold tracking-wide transition-colors ${showGif ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
                      title="GIF"
                    >
                      GIF
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-auto p-0 overflow-hidden">
                    <ChatGifPicker onSelect={sendGif} />
                  </PopoverContent>
                </Popover>

                {/* Emoji picker */}
                <Popover open={showInputEmoji} onOpenChange={setShowInputEmoji}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`shrink-0 p-1.5 rounded-full transition-colors hover:bg-muted/60 ${showInputEmoji ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                      title="Emoji"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-auto p-0 overflow-hidden">
                    <InputEmojiPicker onSelect={insertEmoji} onClose={() => setShowInputEmoji(false)} />
                  </PopoverContent>
                </Popover>

                {/* Send */}
                <button type="submit" disabled={sendMessage.isPending} className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </form>
              {automodError && (
                <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-full px-3 py-1 mt-1 text-center font-mono">
                  {automodError}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1 px-1">
                <strong>**bold**</strong> · <em>*italic*</em> · <code className="bg-muted px-0.5">&#96;code&#96;</code> · <span className="opacity-60">||spoiler||</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              {showHidden ? <EyeOff className="w-7 h-7 opacity-40" /> : <Send className="w-7 h-7 opacity-40" />}
            </div>
            <div className="text-sm font-medium">
              {showHidden ? t("sidebar.selectHiddenHint") : t("empty.selectChannel")}
            </div>
          </div>
        )}
      </div>
      {activeThreadMsg && conversationId && (
        <ThreadPanel
          conversationId={conversationId}
          rootMessage={activeThreadMsg}
          myId={me?.id ?? 0}
          onClose={() => setActiveThreadMsg(null)}
        />
      )}
      </div>

      {/* ── Custom confirm dialog ── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirm()}>
        <AlertDialogContent className="max-w-sm text-center">
          <AlertDialogHeader className="items-center gap-3">
            <AnimatedLogo className="h-8 w-auto text-primary mx-auto" />
            <AlertDialogTitle className="text-base">{t("sidebar.deleteConversation")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 gap-2 sm:gap-2 flex-row justify-center">
            <AlertDialogCancel onClick={closeConfirm} className="flex-1">
              {t("sidebar.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmDialog.onConfirm(); closeConfirm(); }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("sidebar.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
