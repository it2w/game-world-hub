import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Calendar, Zap, Users, Clock, Plus, Gamepad2, Trophy, X, ChevronLeft,
  ChevronRight, List, Star, MessageSquare, RotateCcw, CheckCircle2, HelpCircle,
  MinusCircle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import i18n from "@/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RsvpCounts { going: number; maybe: number; notGoing: number }

interface GwhEvent {
  id: number;
  type: "game_night" | "flash";
  title: string; titleAr: string | null;
  description: string | null; descriptionAr: string | null;
  game: string | null; questKey: string | null; icon: string;
  maxParticipants: number | null;
  scheduledAt: string | null; expiresAt: string | null;
  status: "active" | "completed" | "cancelled";
  xpReward: number; participantCount: number; viewerJoined: boolean;
  creatorId: number | null; createdAt: string;
  eventType: "casual" | "tournament" | "coaching" | "community" | null;
  bannerImageKey: string | null;
  recurringRule: { freq: string; count?: number; parentId?: number } | null;
  partyId: number | null;
  rsvpCounts: RsvpCounts;
  viewerRsvp: "going" | "maybe" | "not_going" | null;
  ratingAvg: number | null; ratingCount: number;
}

interface EventPost {
  id: number; body: string; createdAt: string;
  user: { id: number; displayName: string; avatarUrl: string | null };
}

interface RsvpMember {
  id: number; displayName: string; avatarUrl: string | null;
  status: "going" | "maybe" | "not_going"; respondedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const EVENT_TYPE_CONFIG = {
  casual:      { label: "Casual",      color: "#22C55E", bg: "#22C55E15", border: "#22C55E40" },
  tournament:  { label: "Tournament",  color: "#EF4444", bg: "#EF444415", border: "#EF444440" },
  coaching:    { label: "Coaching",    color: "#A855F7", bg: "#A855F715", border: "#A855F740" },
  community:   { label: "Community",   color: "#06B6D4", bg: "#06B6D415", border: "#06B6D440" },
};

function eventTypeConfig(type: string | null) {
  return type ? (EVENT_TYPE_CONFIG[type as keyof typeof EVENT_TYPE_CONFIG] ?? null) : null;
}

function locTitle(evt: GwhEvent) {
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  return isAr && evt.titleAr ? evt.titleAr : evt.title;
}
function locDesc(evt: GwhEvent) {
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  return isAr && evt.descriptionAr ? evt.descriptionAr : evt.description;
}
function fmtDate(iso: string) {
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  return new Date(iso).toLocaleString(isAr ? "ar-SA" : "en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtCountdown(ms: number) {
  if (ms <= 0) return "–";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(target: string | null | undefined) {
  const [ms, setMs] = useState(() => target ? Math.max(0, new Date(target).getTime() - Date.now()) : 0);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setMs(Math.max(0, new Date(target).getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);
  return ms;
}

// ── EventTypeTag ──────────────────────────────────────────────────────────────
function EventTypeTag({ type }: { type: string | null }) {
  const cfg = eventTypeConfig(type);
  if (!cfg) return null;
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.label}
    </span>
  );
}

// ── HeadcountRing ─────────────────────────────────────────────────────────────
function HeadcountRing({ counts, size = 56 }: { counts: RsvpCounts; size?: number }) {
  const total = counts.going + counts.maybe + counts.notGoing;
  if (total === 0) return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center">
      <svg viewBox="0 0 36 36" style={{ width: size, height: size }}>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#333" strokeWidth="3" />
      </svg>
      <span className="absolute font-mono text-[9px] text-muted-foreground">0</span>
    </div>
  );

  const r = 15.5;
  const circ = 2 * Math.PI * r;
  const segments = [
    { pct: counts.going / total,    color: "#22C55E" },
    { pct: counts.maybe / total,    color: "#F97316" },
    { pct: counts.notGoing / total, color: "#EF4444" },
  ];
  let offset = 0;
  const arcs = segments.map((s) => {
    const dash = s.pct * circ;
    const gap  = circ - dash;
    const el = (
      <circle key={s.color} cx="18" cy="18" r={r} fill="none"
        stroke={s.color} strokeWidth="3"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center shrink-0">
      <svg viewBox="0 0 36 36" style={{ width: size, height: size }}>{arcs}</svg>
      <span className="absolute font-mono text-[10px] font-bold text-foreground">{counts.going}</span>
    </div>
  );
}

// ── RsvpButtons ───────────────────────────────────────────────────────────────
function RsvpButtons({
  eventId, current, counts, onChange,
}: { eventId: number; current: string | null; counts: RsvpCounts; onChange: (counts: RsvpCounts, status: string | null) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const rsvp = async (status: "going" | "maybe" | "not_going") => {
    if (busy) return;
    setBusy(true);
    try {
      if (current === status) {
        await customFetch(`/api/events/${eventId}/rsvp`, { method: "DELETE" });
        onChange(counts, null);
      } else {
        const data = await customFetch<{ rsvpCounts: RsvpCounts }>(
          `/api/events/${eventId}/rsvp`, { method: "POST", body: JSON.stringify({ status }) },
        );
        onChange(data.rsvpCounts, status);
      }
    } catch (e: any) {
      toast({ title: e?.data?.error ?? "Failed to RSVP", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const BTN = [
    { key: "going"    as const, label: "Going",    Icon: CheckCircle2,  on: "#22C55E", off: "#333" },
    { key: "maybe"    as const, label: "Maybe",    Icon: HelpCircle,    on: "#F97316", off: "#333" },
    { key: "not_going"as const, label: "Can't Go", Icon: MinusCircle,   on: "#EF4444", off: "#333" },
  ];

  return (
    <div className="flex gap-2">
      {BTN.map(({ key, label, Icon, on, off }) => {
        const active = current === key;
        return (
          <button
            key={key}
            disabled={busy}
            onClick={() => rsvp(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border transition-all"
            style={{
              borderColor: active ? on : "#2a2a2a",
              color: active ? on : "#666",
              background: active ? `${on}15` : "transparent",
            }}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── DiscussionThread ──────────────────────────────────────────────────────────
function DiscussionThread({ eventId }: { eventId: number }) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const qc = useQueryClient();

  const { data: posts } = useQuery<EventPost[]>({
    queryKey: ["event-posts", eventId],
    queryFn: () => customFetch(`/api/events/${eventId}/posts`),
    refetchInterval: 15_000,
  });

  const post = useMutation({
    mutationFn: () => customFetch(`/api/events/${eventId}/posts`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["event-posts", eventId] }); },
    onError: (e: any) => toast({ title: e?.data?.error ?? "Failed to post", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <MessageSquare className="w-3 h-3 inline me-1.5" />Discussion
      </p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {(posts ?? []).length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground/60">No posts yet — start the conversation!</p>
        ) : (
          posts!.map((p) => (
            <div key={p.id} className="border border-border/50 bg-muted/10 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-mono text-[10px] font-bold text-primary">{p.user.displayName}</span>
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="font-mono text-xs">{p.body}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Post an update…"
          className="font-mono text-xs rounded-none bg-background border-border h-8"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (body.trim()) post.mutate(); } }}
        />
        <Button
          size="sm"
          className="font-mono rounded-none text-xs uppercase shrink-0"
          disabled={!body.trim() || post.isPending}
          onClick={() => post.mutate()}
        >
          Post
        </Button>
      </div>
    </div>
  );
}

// ── RatingWidget ──────────────────────────────────────────────────────────────
function RatingWidget({ eventId, existing }: { eventId: number; existing: number | null }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(existing !== null);
  const [hover, setHover] = useState(0);
  const [selected, setSelected] = useState(existing ?? 0);

  const rate = useMutation({
    mutationFn: (rating: number) =>
      customFetch(`/api/events/${eventId}/rate`, { method: "POST", body: JSON.stringify({ rating }) }),
    onSuccess: (_data, rating) => { setSelected(rating); setSubmitted(true); },
    onError: (e: any) => toast({ title: e?.data?.error ?? "Failed to rate", variant: "destructive" }),
  });

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Rate this Event</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            disabled={submitted}
            onMouseEnter={() => !submitted && setHover(n)}
            onMouseLeave={() => !submitted && setHover(0)}
            onClick={() => !submitted && rate.mutate(n)}
            className="transition-colors"
          >
            <Star
              className="w-5 h-5"
              style={{
                color: n <= (hover || selected) ? "#FFD700" : "#333",
                fill: n <= (hover || selected) ? "#FFD700" : "none",
              }}
            />
          </button>
        ))}
        {submitted && <span className="font-mono text-[10px] text-muted-foreground ms-2 self-center">Thanks!</span>}
      </div>
    </div>
  );
}

// ── EventDetailPanel ──────────────────────────────────────────────────────────
function EventDetailPanel({
  evt, open, onClose, onRsvpChange,
}: {
  evt: GwhEvent; open: boolean; onClose: () => void;
  onRsvpChange: (counts: RsvpCounts, status: string | null) => void;
}) {
  const [tab, setTab] = useState<"info" | "roster" | "discuss">("info");
  const title = locTitle(evt);
  const desc  = locDesc(evt);
  const cfg   = eventTypeConfig(evt.eventType);
  const remaining = useCountdown(evt.scheduledAt);

  const { data: roster } = useQuery<RsvpMember[]>({
    queryKey: ["event-rsvps", evt.id, tab],
    queryFn: () => customFetch(`/api/events/${evt.id}/rsvps`),
    enabled: open && tab === "roster",
    staleTime: 30_000,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border border-border flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {cfg && <div className="h-0.5" style={{ background: cfg.color }} />}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EventTypeTag type={evt.eventType} />
              {evt.recurringRule && (
                <span className="font-mono text-[9px] text-muted-foreground border border-border/50 px-1.5 py-0.5 flex items-center gap-1">
                  <RotateCcw className="w-2.5 h-2.5" />Recurring
                </span>
              )}
            </div>
            <h2 className="font-mono font-bold text-sm mt-1 leading-tight">{title}</h2>
            {evt.game && (
              <div className="flex items-center gap-1 mt-0.5">
                <Gamepad2 className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-[10px] text-primary">{evt.game}</span>
              </div>
            )}
          </div>
          <button className="text-muted-foreground hover:text-foreground ms-3 shrink-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["info", "roster", "discuss"] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 font-mono text-[10px] uppercase tracking-widest py-2 transition-colors border-b-2 -mb-px ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "info" ? "Info" : t === "roster" ? `Roster (${evt.rsvpCounts.going})` : "Discussion"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === "info" && (
            <>
              {/* RSVP Ring + counts */}
              <div className="flex items-center gap-4 border border-border/50 bg-muted/10 p-3">
                <HeadcountRing counts={evt.rsvpCounts} size={60} />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#22C55E" }} />
                    <span className="font-mono text-xs">{evt.rsvpCounts.going} Going</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#F97316" }} />
                    <span className="font-mono text-xs">{evt.rsvpCounts.maybe} Maybe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#EF4444" }} />
                    <span className="font-mono text-xs">{evt.rsvpCounts.notGoing} Can't Go</span>
                  </div>
                </div>
              </div>

              {/* Time */}
              {evt.scheduledAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-mono text-xs">{fmtDate(evt.scheduledAt)}</p>
                    {remaining > 0 && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Starts in {fmtCountdown(remaining)}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {evt.maxParticipants && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs">
                    Max {evt.maxParticipants} attendees
                    {evt.rsvpCounts.going >= evt.maxParticipants && (
                      <span className="text-red-400 ms-2">• Full</span>
                    )}
                  </span>
                </div>
              )}
              {desc && <p className="font-mono text-xs text-muted-foreground">{desc}</p>}

              {/* Party link */}
              {evt.partyId && (
                <Link href={`/party/${evt.partyId}`}>
                  <div className="border border-primary/30 bg-primary/5 p-3 hover:bg-primary/10 transition-colors cursor-pointer">
                    <p className="font-mono text-xs text-primary">🎮 Linked party — Join Now →</p>
                  </div>
                </Link>
              )}

              {/* RSVP buttons */}
              {evt.status === "active" && evt.scheduledAt && new Date(evt.scheduledAt) > new Date() && (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your RSVP</p>
                  <RsvpButtons
                    eventId={evt.id}
                    current={evt.viewerRsvp}
                    counts={evt.rsvpCounts}
                    onChange={onRsvpChange}
                  />
                </div>
              )}

              {/* Recap for completed events */}
              {evt.status === "completed" && (
                <div className="border border-border/50 bg-muted/10 p-3 space-y-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Event Recap</p>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="font-mono text-xl font-bold text-green-400">{evt.rsvpCounts.going}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">Attended</p>
                    </div>
                    {evt.ratingAvg && (
                      <div className="text-center">
                        <p className="font-mono text-xl font-bold text-yellow-400">
                          {evt.ratingAvg.toFixed(1)}⭐
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">{evt.ratingCount} ratings</p>
                      </div>
                    )}
                  </div>
                  {evt.viewerRsvp === "going" && !evt.ratingAvg && (
                    <RatingWidget eventId={evt.id} existing={null} />
                  )}
                </div>
              )}
            </>
          )}

          {tab === "roster" && (
            <div className="space-y-2">
              {(roster ?? []).length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground">No RSVPs yet.</p>
              ) : (
                roster!.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border border-border/30 p-2">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt={r.displayName} className="w-7 h-7 rounded-full object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                        <span className="font-mono text-[9px]">{r.displayName.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="font-mono text-xs truncate flex-1">{r.displayName}</span>
                    <span
                      className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0"
                      style={{
                        color: r.status === "going" ? "#22C55E" : r.status === "maybe" ? "#F97316" : "#EF4444",
                        borderColor: r.status === "going" ? "#22C55E40" : r.status === "maybe" ? "#F9731640" : "#EF444440",
                      }}
                    >
                      {r.status === "going" ? "Going" : r.status === "maybe" ? "Maybe" : "No"}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "discuss" && <DiscussionThread eventId={evt.id} />}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Month View ───────────────────────────────────────────────────────
function CalendarMonthView({ events, onEventClick }: { events: GwhEvent[]; onEventClick: (e: GwhEvent) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Build cell array (42 cells = 6 rows × 7 cols)
  const cells: Array<{ date: Date | null; events: GwhEvent[] }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ date: null, events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayEvents = events.filter((e) => {
      if (!e.scheduledAt) return false;
      const ed = new Date(e.scheduledAt);
      return ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === d;
    });
    cells.push({ date, events: dayEvents });
  }
  while (cells.length < 42) cells.push({ date: null, events: [] });

  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="p-1 text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-sm font-bold uppercase tracking-widest">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="p-1 text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-t border-s border-border">
        {DAYS.map((d) => (
          <div key={d} className="border-e border-b border-border p-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-muted/20">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const isToday = cell.date && cell.date.toDateString() === today.toDateString();
          return (
            <div
              key={i}
              className={`border-e border-b border-border min-h-[72px] p-1.5 ${
                cell.date ? "" : "bg-muted/5"
              } ${isToday ? "bg-primary/5" : ""}`}
            >
              {cell.date && (
                <>
                  <span className={`font-mono text-[10px] ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {cell.date.getDate()}
                  </span>
                  <div className="space-y-0.5 mt-0.5">
                    {cell.events.slice(0, 2).map((e) => {
                      const cfg = eventTypeConfig(e.eventType);
                      return (
                        <button
                          key={e.id}
                          onClick={() => onEventClick(e)}
                          className="w-full text-start font-mono text-[9px] truncate px-1 py-0.5 border transition-colors hover:opacity-80"
                          style={{
                            borderColor: cfg?.border ?? "#333",
                            background: cfg?.bg ?? "#22222230",
                            color: cfg?.color ?? "#888",
                          }}
                        >
                          {locTitle(e)}
                        </button>
                      );
                    })}
                    {cell.events.length > 2 && (
                      <span className="font-mono text-[9px] text-muted-foreground px-1">
                        +{cell.events.length - 2} more
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar Week View ────────────────────────────────────────────────────────
function CalendarWeekView({ events, onEventClick }: { events: GwhEvent[]; onEventClick: (e: GwhEvent) => void }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d;
  });
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekDates = DAYS.map((_, i) => new Date(weekStart.getTime() + i * 86_400_000));
  const today = new Date();

  const prev = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86_400_000));
  const next = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86_400_000));

  const label = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Map events to day/hour
  const eventsMap = new Map<string, GwhEvent[]>();
  events.forEach((e) => {
    if (!e.scheduledAt) return;
    const dt = new Date(e.scheduledAt);
    const key = `${dt.toDateString()}-${dt.getHours()}`;
    if (!eventsMap.has(key)) eventsMap.set(key, []);
    eventsMap.get(key)!.push(e);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={prev} className="p-1 text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs font-bold uppercase tracking-widest">{label}</span>
        <button onClick={next} className="p-1 text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-auto max-h-[480px] border border-border">
        <div className="grid" style={{ gridTemplateColumns: "40px repeat(7, 1fr)", minWidth: 520 }}>
          {/* Header row */}
          <div className="border-e border-b border-border bg-muted/20 p-1" />
          {weekDates.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={i} className={`border-e border-b border-border p-1.5 text-center ${isToday ? "bg-primary/10" : "bg-muted/20"}`}>
                <p className="font-mono text-[10px] text-muted-foreground">{DAYS[i]}</p>
                <p className={`font-mono text-xs font-bold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</p>
              </div>
            );
          })}

          {/* Hour rows */}
          {HOURS.map((h) => (
            <>
              <div key={`h${h}`} className="border-e border-b border-border p-1 text-right">
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  {h.toString().padStart(2, "0")}
                </span>
              </div>
              {weekDates.map((d, di) => {
                const key = `${d.toDateString()}-${h}`;
                const evts = eventsMap.get(key) ?? [];
                return (
                  <div key={`${h}-${di}`} className="border-e border-b border-border p-0.5 min-h-[28px]">
                    {evts.map((e) => {
                      const cfg = eventTypeConfig(e.eventType);
                      return (
                        <button
                          key={e.id}
                          onClick={() => onEventClick(e)}
                          className="w-full font-mono text-[9px] truncate px-1 py-0.5 border mb-0.5 hover:opacity-80 transition-opacity"
                          style={{ borderColor: cfg?.border ?? "#333", background: cfg?.bg ?? "#22222230", color: cfg?.color ?? "#888" }}
                        >
                          {locTitle(e)}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event Card (list view) ────────────────────────────────────────────────────
function EventListCard({ evt, onClick }: { evt: GwhEvent; onClick: () => void }) {
  const title = locTitle(evt);
  const desc  = locDesc(evt);
  const cfg   = eventTypeConfig(evt.eventType);
  const remaining = useCountdown(evt.scheduledAt);

  return (
    <div
      className="border border-border bg-card hover:border-primary/40 transition-colors cursor-pointer"
      style={cfg ? { borderLeftColor: cfg.color, borderLeftWidth: 3 } : {}}
      onClick={onClick}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <EventTypeTag type={evt.eventType} />
              {evt.recurringRule && (
                <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1">
                  <RotateCcw className="w-2.5 h-2.5" />Recurring
                </span>
              )}
            </div>
            <h3 className="font-mono font-bold text-sm leading-tight">{title}</h3>
            {evt.game && (
              <div className="flex items-center gap-1 mt-0.5">
                <Gamepad2 className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-[10px] text-primary">{evt.game}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 text-end space-y-1">
            <HeadcountRing counts={evt.rsvpCounts} size={44} />
          </div>
        </div>

        {desc && <p className="font-mono text-xs text-muted-foreground line-clamp-2">{desc}</p>}

        <div className="flex items-center justify-between border-t border-border/50 pt-2">
          <div className="flex items-center gap-3">
            {evt.scheduledAt && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {fmtDate(evt.scheduledAt)}
                </span>
              </div>
            )}
            {remaining > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  in {fmtCountdown(remaining)}
                </span>
              </div>
            )}
          </div>
          {evt.viewerRsvp && (
            <span
              className="font-mono text-[9px] uppercase px-1.5 py-0.5 border"
              style={{
                color: evt.viewerRsvp === "going" ? "#22C55E" : evt.viewerRsvp === "maybe" ? "#F97316" : "#EF4444",
                borderColor: evt.viewerRsvp === "going" ? "#22C55E40" : evt.viewerRsvp === "maybe" ? "#F9731640" : "#EF444440",
              }}
            >
              {evt.viewerRsvp === "going" ? "Going ✓" : evt.viewerRsvp === "maybe" ? "Maybe" : "Can't Go"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Flash Event Card ──────────────────────────────────────────────────────────
function FlashEventCard({ evt, onJoin, joining }: { evt: GwhEvent; onJoin: () => void; joining: boolean }) {
  const { t } = useTranslation("events");
  const isAr = i18n.resolvedLanguage?.startsWith("ar");
  const remaining = useCountdown(evt.expiresAt);
  const title = isAr && evt.titleAr ? evt.titleAr : evt.title;
  const description = isAr && evt.descriptionAr ? evt.descriptionAr : evt.description;
  const pct = remaining > 0 && evt.expiresAt ? Math.round((remaining / (48 * 3_600_000)) * 100) : 0;

  const HOW_TO_MAP: Record<string, string> = {
    post_lfg: "howToDesc_post_lfg", respond_lfg: "howToDesc_respond_lfg",
    send_messages: "howToDesc_send_messages", join_room: "howToDesc_join_room",
    add_friend: "howToDesc_add_friend",
  };
  const QUEST_LINKS: Record<string, string> = {
    post_lfg: "/lfg", respond_lfg: "/lfg", send_messages: "/chat", join_room: "/rooms", add_friend: "/friends",
  };
  const howToKey  = evt.questKey ? (HOW_TO_MAP[evt.questKey]  ?? "howToDesc_default") : "howToDesc_default";
  const actionLink = evt.questKey ? (QUEST_LINKS[evt.questKey] ?? "/") : "/";
  const countdown  = fmtCountdown(remaining);

  return (
    <div className="border border-orange-500/40 bg-card relative overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-yellow-400 to-orange-500 animate-pulse" />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center text-2xl bg-orange-500/10 border border-orange-500/30">
              {evt.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-0.5 border border-orange-500/30">⚡ FLASH</span>
                {evt.xpReward > 0 && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-2 py-0.5 border border-yellow-400/30">+{evt.xpReward} XP</span>
                )}
              </div>
              <h2 className="font-mono font-bold text-sm mt-1 leading-tight">{title}</h2>
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="font-mono text-[10px] text-muted-foreground uppercase">{t("flash.expiresIn")}</div>
            <div className={`font-mono font-bold text-sm tabular-nums ${remaining < 3_600_000 ? "text-red-400" : "text-orange-400"}`}>{countdown}</div>
          </div>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
        {description && <p className="font-mono text-xs text-muted-foreground">{description}</p>}
        <div className="border border-border/50 bg-muted/20 p-3 space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("flash.howTo")}</p>
          <p className="font-mono text-xs">{t(`flash.${howToKey}`)}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">{t("flash.completedBy", { count: evt.participantCount })}</span>
          {evt.viewerJoined ? (
            <div className="text-end">
              <div className="font-mono text-xs text-green-400 uppercase tracking-widest">{t("flash.complete")}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{t("flash.completeDesc", { xp: evt.xpReward })}</div>
            </div>
          ) : (
            <Link href={actionLink}>
              <Button size="sm" className="font-mono rounded-none text-xs uppercase tracking-widest bg-orange-500 hover:bg-orange-400 text-black">
                {t("flash.goComplete")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create Event Wizard ───────────────────────────────────────────────────────
function CreateEventWizard({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  // Form state
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<"casual" | "tournament" | "coaching" | "community" | "">("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurFreq, setRecurFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurCount, setRecurCount] = useState("4");
  const [maxParticipants, setMaxParticipants] = useState("");

  const reset = () => {
    setStep(1); setTitle(""); setGame(""); setDescription("");
    setEventType(""); setScheduledAt(""); setRecurring(false);
    setRecurFreq("weekly"); setRecurCount("4"); setMaxParticipants("");
  };

  const create = useMutation({
    mutationFn: () =>
      customFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          game: game || undefined,
          description: description || undefined,
          scheduledAt,
          maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
          eventType: eventType || undefined,
          recurringRule: recurring ? { freq: recurFreq, count: parseInt(recurCount) } : undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Event Created! 🎉", description: "Players can now RSVP." });
      setOpen(false); reset(); onCreated();
    },
    onError: (e: any) => toast({ title: "Failed to create", description: e?.data?.error, variant: "destructive" }),
  });

  const TYPE_OPTS = ["casual", "tournament", "coaching", "community"] as const;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="font-mono rounded-none text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5 me-1.5" />Host an Event
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border rounded-none sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest text-sm border-b border-border pb-3">
            🎮 New Event — Step {step} of 3
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-0.5 flex-1 transition-colors ${s <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Event Title *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                className="font-mono rounded-none bg-background border-border"
                placeholder="Friday Night Valorant" />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Game</label>
              <Input value={game} onChange={(e) => setGame(e.target.value)}
                className="font-mono rounded-none bg-background border-border"
                placeholder="Valorant, Apex Legends…" />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Event Type</label>
              <div className="grid grid-cols-4 gap-2">
                {TYPE_OPTS.map((t) => {
                  const cfg = EVENT_TYPE_CONFIG[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setEventType(t === eventType ? "" : t)}
                      className="py-2 font-mono text-[10px] uppercase tracking-widest border transition-all"
                      style={{
                        borderColor: eventType === t ? cfg.color : "#2a2a2a",
                        color: eventType === t ? cfg.color : "#666",
                        background: eventType === t ? cfg.bg : "transparent",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                className="font-mono rounded-none bg-background border-border resize-none" rows={2}
                placeholder="Open for all ranks — bring your A-game" />
            </div>
            <Button className="w-full font-mono rounded-none uppercase tracking-widest"
              disabled={!title.trim()} onClick={() => setStep(2)}>
              Next →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Date & Time *</label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="font-mono rounded-none bg-background border-border"
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} />
              <p className="font-mono text-[10px] text-muted-foreground">
                Your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="recurring" checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary" />
                <label htmlFor="recurring" className="font-mono text-xs cursor-pointer">
                  <RotateCcw className="w-3 h-3 inline me-1.5" />Recurring event
                </label>
              </div>
              {recurring && (
                <div className="flex gap-2 ps-5">
                  <select value={recurFreq} onChange={(e) => setRecurFreq(e.target.value as any)}
                    className="font-mono text-xs bg-background border border-border px-2 py-1 flex-1">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <Input type="number" min={1} max={24} value={recurCount}
                    onChange={(e) => setRecurCount(e.target.value)}
                    className="font-mono rounded-none bg-background border-border w-20 text-xs"
                    placeholder="# times" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground">Max Attendees (optional)</label>
              <Input type="number" min={2} max={500} value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                className="font-mono rounded-none bg-background border-border" placeholder="50" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 font-mono rounded-none uppercase tracking-widest"
                onClick={() => setStep(1)}>← Back</Button>
              <Button className="flex-1 font-mono rounded-none uppercase tracking-widest"
                disabled={!scheduledAt} onClick={() => setStep(3)}>Next →</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 pt-2">
            {/* Preview card */}
            <div className="border border-border/50 bg-muted/10 p-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Preview</p>
              <div className="flex items-center gap-2">
                <EventTypeTag type={eventType || null} />
                {recurring && <span className="font-mono text-[9px] text-muted-foreground flex items-center gap-1"><RotateCcw className="w-2.5 h-2.5" />Recurring</span>}
              </div>
              <p className="font-mono font-bold text-sm">{title || "Untitled"}</p>
              {game && <p className="font-mono text-[10px] text-primary"><Gamepad2 className="w-3 h-3 inline me-1" />{game}</p>}
              {scheduledAt && <p className="font-mono text-[10px] text-muted-foreground"><Calendar className="w-3 h-3 inline me-1" />{fmtDate(scheduledAt)}</p>}
              {maxParticipants && <p className="font-mono text-[10px] text-muted-foreground"><Users className="w-3 h-3 inline me-1" />Max {maxParticipants}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 font-mono rounded-none uppercase tracking-widest"
                onClick={() => setStep(2)}>← Back</Button>
              <Button className="flex-1 font-mono rounded-none uppercase tracking-widest"
                disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Launch Event 🚀"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Event Start Banner (WS-driven) ────────────────────────────────────────────
function EventStartBanner() {
  const [banner, setBanner] = useState<{ title: string; eventId: number; partyId: number | null } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { title: string; eventId: number; partyId: number | null };
      setBanner(detail);
      setTimeout(() => setBanner(null), 30_000);
    };
    window.addEventListener("gwh:event_started", handler);
    return () => window.removeEventListener("gwh:event_started", handler);
  }, []);

  if (!banner) return null;

  return (
    <div className="fixed bottom-4 end-4 z-50 max-w-sm border border-green-500/50 bg-card p-4 shadow-xl shadow-green-500/10 animate-in slide-in-from-bottom-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-mono text-[10px] text-green-400 uppercase tracking-widest">🟢 Event Started!</p>
          <p className="font-mono text-sm font-bold mt-0.5">{banner.title}</p>
        </div>
        <button onClick={() => setBanner(null)} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      {banner.partyId ? (
        <Link href={`/party/${banner.partyId}`}>
          <Button size="sm" className="w-full font-mono rounded-none text-xs uppercase tracking-widest mt-3 bg-green-600 hover:bg-green-500">
            Join Now →
          </Button>
        </Link>
      ) : (
        <Link href="/events">
          <Button size="sm" variant="outline" className="w-full font-mono rounded-none text-xs uppercase tracking-widest mt-3">
            View Event →
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Main Events Page ──────────────────────────────────────────────────────────
export default function Events() {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [view,      setView]      = useState<"calendar" | "week" | "list">("list");
  const [mainTab,   setMainTab]   = useState<"flash" | "scheduled">("scheduled");
  const [filterMine, setFilterMine] = useState(false);
  const [filterGame, setFilterGame] = useState("");
  const [filterType, setFilterType] = useState("");
  const [selectedEvt, setSelectedEvt] = useState<GwhEvent | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);

  // WS: refresh on flash events
  useEffect(() => {
    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["flash-active"] });
    };
    window.addEventListener("gwh:flash_event_new", onNew);
    window.addEventListener("gwh:flash_event_complete", onNew);
    return () => {
      window.removeEventListener("gwh:flash_event_new", onNew);
      window.removeEventListener("gwh:flash_event_complete", onNew);
    };
  }, [queryClient]);

  const { data: allEvents, isLoading } = useQuery<GwhEvent[]>({
    queryKey: ["events", filterGame, filterType],
    queryFn: () => {
      const params = new URLSearchParams({ status: "active" });
      if (filterGame) params.set("game", filterGame);
      if (filterType) params.set("eventType", filterType);
      return customFetch(`/api/events?${params}`);
    },
    refetchInterval: 30_000,
  });

  const { data: myEvents } = useQuery<GwhEvent[]>({
    queryKey: ["events-mine"],
    queryFn: () => customFetch("/api/events/mine"),
    enabled: filterMine,
    refetchInterval: 60_000,
  });

  const { data: flashEvent } = useQuery<GwhEvent | null>({
    queryKey: ["flash-active"],
    queryFn: () => customFetch("/api/events/flash/active"),
    refetchInterval: 60_000,
  });

  const join = useMutation({
    mutationFn: (id: number) => customFetch(`/api/events/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Registered! 🎉" });
      setJoiningId(null);
    },
    onError: (e: any) => {
      toast({ title: e?.data?.error ?? "Failed to join", variant: "destructive" });
      setJoiningId(null);
    },
  });

  // Merge selected event from fresh data so RSVP counts stay live
  const freshSelected = useMemo(() => {
    if (!selectedEvt) return null;
    return allEvents?.find((e) => e.id === selectedEvt.id) ?? selectedEvt;
  }, [selectedEvt, allEvents]);

  const scheduledEvents = useMemo(() => {
    const base = filterMine ? (myEvents ?? []) : (allEvents?.filter((e) => e.type === "game_night") ?? []);
    return base.sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime());
  }, [allEvents, myEvents, filterMine]);

  const flashEvents = useMemo(() => {
    const list = allEvents?.filter((e) => e.type === "flash") ?? [];
    if (flashEvent && !list.find((e) => e.id === flashEvent.id)) return [flashEvent, ...list];
    return list;
  }, [allEvents, flashEvent]);

  const handleRsvpChange = useCallback((counts: RsvpCounts, status: string | null) => {
    if (!selectedEvt) return;
    setSelectedEvt((prev) => prev ? { ...prev, rsvpCounts: counts, viewerRsvp: status as any } : null);
    queryClient.invalidateQueries({ queryKey: ["events"] });
    queryClient.invalidateQueries({ queryKey: ["events-mine"] });
  }, [selectedEvt, queryClient]);

  const EVENT_TYPES = ["casual", "tournament", "coaching", "community"] as const;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <EventStartBanner />

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono font-bold text-lg uppercase tracking-widest">Events</h1>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">Gaming sessions, community events & flash challenges</p>
        </div>
        <CreateEventWizard onCreated={() => queryClient.invalidateQueries({ queryKey: ["events"] })} />
      </div>

      {/* Main tab toggle */}
      <div className="flex gap-0 border-b border-border">
        {(["scheduled", "flash"] as const).map((k) => (
          <button
            key={k}
            className={`font-mono text-xs uppercase tracking-widest px-4 py-2 transition-colors border-b-2 -mb-px ${
              mainTab === k
                ? k === "flash" ? "border-orange-400 text-orange-400" : "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMainTab(k)}
          >
            {k === "flash" ? <><Zap className="w-3 h-3 inline me-1.5" />Flash Events</> : <><Calendar className="w-3 h-3 inline me-1.5" />Scheduled Events</>}
          </button>
        ))}
      </div>

      {mainTab === "flash" ? (
        /* Flash section */
        isLoading ? (
          <div className="border border-border bg-card animate-pulse h-48" />
        ) : flashEvents.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border space-y-2">
            <div className="text-4xl">⚡</div>
            <p className="font-mono text-sm text-muted-foreground">{t("flash.noActive")}</p>
            <p className="font-mono text-xs text-muted-foreground/60">{t("flash.noActiveDesc")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {flashEvents.map((evt) => (
              <FlashEventCard key={evt.id} evt={evt}
                onJoin={() => { setJoiningId(evt.id); join.mutate(evt.id); }}
                joining={joiningId === evt.id} />
            ))}
          </div>
        )
      ) : (
        /* Scheduled section */
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggle */}
            <div className="flex gap-0 border border-border">
              {(["list", "calendar", "week"] as const).map((v) => {
                const Icon = v === "list" ? List : v === "calendar" ? Calendar : Clock;
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`p-2 transition-colors ${view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    title={v.charAt(0).toUpperCase() + v.slice(1)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <button
              onClick={() => setFilterMine(!filterMine)}
              className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 border transition-all ${
                filterMine ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-3 h-3 inline me-1.5" />My Events
            </button>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="font-mono text-xs bg-background border border-border px-2 py-1.5 text-muted-foreground"
            >
              <option value="">All Types</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_CONFIG[t].label}</option>)}
            </select>

            <div className="flex items-center gap-1.5 flex-1 max-w-40">
              <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
              <Input
                value={filterGame}
                onChange={(e) => setFilterGame(e.target.value)}
                placeholder="Filter by game…"
                className="font-mono text-xs rounded-none bg-background border-border h-8"
              />
            </div>

            {(filterGame || filterType || filterMine) && (
              <button
                onClick={() => { setFilterGame(""); setFilterType(""); setFilterMine(false); }}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" />Clear
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="border border-border bg-card animate-pulse h-32" />)}
            </div>
          ) : scheduledEvents.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border space-y-2">
              <div className="text-4xl">🎮</div>
              <p className="font-mono text-sm text-muted-foreground">No events found</p>
              <div className="pt-2">
                <CreateEventWizard onCreated={() => queryClient.invalidateQueries({ queryKey: ["events"] })} />
              </div>
            </div>
          ) : view === "calendar" ? (
            <CalendarMonthView events={scheduledEvents} onEventClick={(e) => setSelectedEvt(e)} />
          ) : view === "week" ? (
            <CalendarWeekView events={scheduledEvents} onEventClick={(e) => setSelectedEvt(e)} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledEvents.map((evt) => (
                <EventListCard key={evt.id} evt={evt} onClick={() => setSelectedEvt(evt)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail panel */}
      {freshSelected && (
        <EventDetailPanel
          evt={freshSelected}
          open={!!selectedEvt}
          onClose={() => setSelectedEvt(null)}
          onRsvpChange={handleRsvpChange}
        />
      )}
    </div>
  );
}
