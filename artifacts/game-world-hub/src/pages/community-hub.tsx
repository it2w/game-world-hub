import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useVoice, PeerUiState } from "@/voice/voice-context";
import { acquireInlineStage } from "@/voice/inline-stage-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Hash, Volume2, Settings, Users, Plus, Send, MoreVertical, Trash2, Zap, LogOut,
  Crown, UserMinus, Ban, Mic, Loader2, BarChart3, Link2, Pin, PinOff, Trophy,
  Image, X, Copy, Check, ChevronDown, ChevronRight, Video, Monitor, PhoneOff,
  MicOff, Radio, Headphones, VolumeX, MessageSquare, ChevronUp, Shield,
  Lock, Megaphone, Hand, Clock, Bell, Mic2, AlertCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Community {
  id: number; slug: string; name: string; description: string | null;
  gameTag: string | null; privacy: "public" | "invite_only";
  boostLevel: number; memberCount: number; iconKey: string | null;
  bannerKey: string | null; ownerId: number; isMember: boolean; isOwner: boolean; isMod: boolean;
  channels: Channel[];
}

interface Channel {
  id: number; name: string; type: "text" | "voice" | "announcement" | "stage"; position: number;
  slowmodeSeconds: number; isPrivate?: boolean;
}

/** Icon for a channel type, with optional lock overlay for private channels */
function ChannelIcon({ channel, size = 4, className = "" }: { channel: Channel; size?: number; className?: string }) {
  const base = `w-${size} h-${size} flex-shrink-0 ${className}`;
  if (channel.type === "announcement") return <Megaphone className={base} />;
  if (channel.type === "stage") return <Mic2 className={base} />;
  if (channel.type === "voice") return <Volume2 className={base} />;
  return <Hash className={base} />;
}

interface Message {
  id: number; channelId: number; content: string; createdAt: string;
  userId: number; username: string; displayName: string; avatarUrl: string | null;
  isPinned?: boolean;
}

interface Member {
  memberId: number; userId: number; username: string; displayName: string;
  avatarUrl: string | null; joinedAt: string;
}

interface VoicePresenceUser {
  userId: number; username: string; displayName: string; avatarUrl: string | null;
  cameraEnabled?: boolean;
  screenShareEnabled?: boolean;
}

/** channelId (as string key) → VoicePresenceUser[] */
type VoicePresenceMap = Record<string, VoicePresenceUser[]>;

interface LeaderboardEntry {
  rank: number; userId: number; username: string; displayName: string;
  avatarUrl: string | null; messageCount: number; joinedAt: string;
}

interface Poll {
  id: number; question: string; options: Array<{ text: string }>;
  voteCounts: number[]; myVote: number | null; totalVotes: number;
  is_closed: boolean; ends_at: string | null; created_at: string;
}

interface Invite {
  code: string; uses: number; max_uses: number | null;
  expires_at: string | null; creator_username: string; created_at: string;
}

interface Role {
  id: number; communityId: number; name: string; color: string; position: number;
  permissions: Record<string, boolean>; displaySeparately: boolean;
  mentionable: boolean; isDefault: boolean; createdAt: string;
}

type MemberRolesMap = Record<number, Array<{ id: number; name: string; color: string; position: number; displaySeparately: boolean }>>;

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 8 }: { name: string; url?: string | null; size?: number }) {
  const colorHues = [240, 270, 300, 180, 210, 330];
  const hue = colorHues[name.charCodeAt(0) % colorHues.length];
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden`;
  if (url) return <img src={url} alt={name} className={`${cls} object-cover`} style={{ width: `${size * 4}px`, height: `${size * 4}px` }} />;
  return (
    <div className={cls} style={{ background: `hsl(${hue} 70% 40%)`, width: `${size * 4}px`, height: `${size * 4}px`, fontSize: `${size * 1.5}px` }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Poll Card ─────────────────────────────────────────────────────────────────

function PollCard({ poll, communityId, onVoted }: { poll: Poll; communityId: number; onVoted: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const isClosed = poll.is_closed || (!!poll.ends_at && new Date(poll.ends_at) < new Date());

  const voteMutation = useMutation({
    mutationFn: (optionIndex: number) =>
      customFetch(`/api/communities/${communityId}/polls/${poll.id}/vote`, {
        method: "POST", body: JSON.stringify({ optionIndex }),
      }),
    onSuccess: () => { onVoted(); },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  return (
    <div className="bg-card/60 border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug">{poll.question}</p>
        {isClosed && (
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded flex-shrink-0">
            {t("pollClosed")}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const count = poll.voteCounts[i] ?? 0;
          const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
          const isMyVote = poll.myVote === i;
          const hasVoted = poll.myVote !== null;
          return (
            <button
              key={i}
              onClick={() => !isClosed && !voteMutation.isPending && voteMutation.mutate(i)}
              disabled={isClosed || voteMutation.isPending}
              className={`w-full text-start rounded-md border transition-all overflow-hidden ${
                isMyVote ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/30 bg-muted/30"
              } ${isClosed || hasVoted ? "cursor-default" : "cursor-pointer"}`}
            >
              <div className="px-3 py-2 relative">
                {hasVoted && (
                  <div
                    className={`absolute inset-0 rounded-md transition-all ${isMyVote ? "bg-primary/15" : "bg-muted/40"}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground flex items-center gap-1.5">
                    {isMyVote && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                    {opt.text}
                  </span>
                  {hasVoted && (
                    <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{pct}%</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {poll.totalVotes} {t("votesCount")}
        {poll.ends_at && !isClosed && ` · ${t("pollEnds")} ${new Date(poll.ends_at).toLocaleDateString()}`}
      </p>
    </div>
  );
}

// ── Create Poll Dialog ────────────────────────────────────────────────────────

function CreatePollDialog({ communityId, open, onClose }: { communityId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/communities/${communityId}/polls`, {
        method: "POST",
        body: JSON.stringify({ question: question.trim(), options: options.filter(o => o.trim()) }),
      }),
    onSuccess: () => {
      toast({ title: t("pollCreated") });
      qc.invalidateQueries({ queryKey: ["community-polls", communityId] });
      setQuestion(""); setOptions(["", ""]); onClose();
    },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const validOptions = options.filter(o => o.trim()).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t("createPoll")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("pollQuestion")}</Label>
            <Textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder={t("pollQuestionPlaceholder")} rows={2} maxLength={500} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("pollOptions")}</Label>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={e => { const o = [...options]; o[i] = e.target.value; setOptions(o); }}
                    placeholder={`${t("pollOption")} ${i + 1}`}
                    maxLength={100}
                    className="flex-1 h-8 text-xs"
                  />
                  {options.length > 2 && (
                    <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button
                  onClick={() => setOptions([...options, ""])}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-1"
                >
                  <Plus className="w-3 h-3" /> {t("addOption")}
                </button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("leave")}</Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={!question.trim() || validOptions < 2 || create.isPending}>
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("createPoll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invite Dialog ─────────────────────────────────────────────────────────────

function InviteDialog({ communityId, isOwnerOrMod, open, onClose }: {
  communityId: number; isOwnerOrMod: boolean; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: invites = [], isLoading } = useQuery<Invite[]>({
    queryKey: ["community-invites", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/invites`),
    enabled: open && isOwnerOrMod,
  });

  const generate = useMutation({
    mutationFn: () => customFetch(`/api/communities/${communityId}/invites`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-invites", communityId] }),
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (code: string) => customFetch(`/api/communities/${communityId}/invites/${code}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-invites", communityId] }),
  });

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            {t("inviteLinks")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isOwnerOrMod && (
            <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending} className="w-full">
              {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : <Plus className="w-3.5 h-3.5 me-1.5" />}
              {t("generateInvite")}
            </Button>
          )}
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : invites.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("noInvites")}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {invites.map(inv => (
                <div key={inv.code} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-foreground truncate">{window.location.origin}/join/{inv.code}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ""} {t("uses")}
                      {inv.expires_at && ` · ${t("expires")} ${new Date(inv.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button onClick={() => copyLink(inv.code)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                    {copied === inv.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {isOwnerOrMod && (
                    <button onClick={() => revoke.mutate(inv.code)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("leave")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Banner Upload Dialog ───────────────────────────────────────────────────────

function BannerDialog({ communityId, open, onClose }: { communityId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) { toast({ title: t("bannerTooLarge"), variant: "destructive" }); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = e => resolve(e.target!.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      await customFetch(`/api/communities/${communityId}/banner`, {
        method: "POST", body: JSON.stringify({ data: base64, mimeType: file.type }),
      });
      toast({ title: t("bannerUploaded") });
      qc.invalidateQueries({ queryKey: ["community-slug"] });
      onClose();
    } catch (e: any) {
      toast({ title: e?.message ?? t("error"), variant: "destructive" });
    } finally { setUploading(false); }
  };

  const remove = useMutation({
    mutationFn: () => customFetch(`/api/communities/${communityId}/banner`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community-slug"] }); onClose(); },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest flex items-center gap-2">
            <Image className="w-4 h-4 text-primary" />
            {t("uploadBanner")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("bannerHint")}</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Image className="w-4 h-4 me-2" />}
            {t("chooseBanner")}
          </Button>
          <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending} className="w-full text-destructive hover:text-destructive">
            {t("removeBanner")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

/** Parse message content and render @[RoleName] mentions in role colour. */
function renderMessageContent(content: string, roles: Role[]) {
  const roleByName = new Map(roles.map(r => [r.name.toLowerCase(), r]));
  // Match @[RoleName] pattern
  const parts = content.split(/(@\[[^\]]+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("@[") && part.endsWith("]")) {
      const roleName = part.slice(2, -1);
      const role = roleByName.get(roleName.toLowerCase());
      if (role) {
        return (
          <span key={i} className="font-semibold rounded px-0.5" style={{ color: role.color, background: `${role.color}22` }}>
            @{roleName}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

function MessageRow({ msg, canDelete, canPin, onDelete, onPin, roleColor, roles }: {
  msg: Message; canDelete: boolean; canPin: boolean;
  onDelete: (id: number) => void; onPin: (id: number) => void;
  roleColor?: string; roles?: Role[];
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-1.5 hover:bg-muted/30 group rounded ${msg.isPinned ? "border-s-2 border-primary/40" : ""}`}>
      <Avatar name={msg.displayName} url={msg.avatarUrl} size={8} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className="text-sm font-semibold"
            style={roleColor ? { color: roleColor } : undefined}
          >
            {msg.displayName}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {msg.isPinned && <Pin className="w-2.5 h-2.5 text-primary/60" />}
        </div>
        <p className="text-sm text-foreground/90 break-words leading-relaxed">
          {roles && roles.length > 0 ? renderMessageContent(msg.content, roles) : msg.content}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
        {canPin && (
          <button onClick={() => onPin(msg.id)} className="text-muted-foreground hover:text-primary p-1 rounded">
            {msg.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </button>
        )}
        {canDelete && (
          <button onClick={() => onDelete(msg.id)} className="text-muted-foreground hover:text-destructive p-1 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Text channel panel ─────────────────────────────────────────────────────────

function TextChannelPanel({ communityId, channel, isOwner, canMod, myUserId }: {
  communityId: number; channel: Channel; isOwner: boolean; canMod: boolean; myUserId: number;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [slowmodeLeft, setSlowmodeLeft] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Slowmode countdown tick
  useEffect(() => {
    if (slowmodeLeft <= 0) return;
    const t = setTimeout(() => setSlowmodeLeft(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(t);
  }, [slowmodeLeft]);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["community-messages", communityId, channel.id],
    queryFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages`),
    refetchInterval: 5000,
  });

  const { data: pins = [] } = useQuery<Message[]>({
    queryKey: ["community-pins", communityId, channel.id],
    queryFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}/pins`),
    enabled: showPins,
  });

  // Role colour map (userId → hex) and roles list (for mention rendering + autocomplete)
  const { data: roleColorMap = {} } = useQuery<Record<number, string>>({
    queryKey: ["community-role-colors", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/role-colors`),
    staleTime: 60_000,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["community-roles", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/roles`),
    staleTime: 60_000,
  });

  const mentionableRoles = useMemo(
    () => roles.filter(r => r.mentionable && !r.isDefault),
    [roles]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages`, {
        method: "POST", body: JSON.stringify({ content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-messages", communityId, channel.id] }),
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: number) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages/${msgId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-messages", communityId, channel.id] }),
  });

  const pinMutation = useMutation({
    mutationFn: (msgId: number) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages/${msgId}/pin`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-messages", communityId, channel.id] });
      qc.invalidateQueries({ queryKey: ["community-pins", communityId, channel.id] });
    },
  });

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || slowmodeLeft > 0) return;
    setText("");
    setMentionSearch(null);
    sendMutation.mutate(content, {
      onSuccess: () => {
        if (channel.slowmodeSeconds > 0 && !canMod && !isOwner) {
          setSlowmodeLeft(channel.slowmodeSeconds);
        }
      },
      onError: (err: any) => {
        if (err?.retryAfter) setSlowmodeLeft(err.retryAfter);
      },
    });
  }, [text, sendMutation, slowmodeLeft, channel.slowmodeSeconds, canMod, isOwner]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    // Detect @mention trigger: find last @ and see if there's a non-space word after it
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) {
        setMentionSearch(after.toLowerCase());
        return;
      }
    }
    setMentionSearch(null);
  }, []);

  const insertRoleMention = useCallback((role: Role) => {
    const lastAt = text.lastIndexOf("@");
    const newText = (lastAt >= 0 ? text.slice(0, lastAt) : text) + `@[${role.name}] `;
    setText(newText);
    setMentionSearch(null);
    inputRef.current?.focus();
  }, [text]);

  const filteredMentions = mentionSearch !== null
    ? mentionableRoles.filter(r => r.name.toLowerCase().includes(mentionSearch))
    : [];

  const pinnedCount = messages.filter(m => m.isPinned).length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pinned bar */}
      {pinnedCount > 0 && (
        <button
          onClick={() => setShowPins(v => !v)}
          className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-primary/20 hover:bg-primary/10 transition-colors text-start w-full"
        >
          <Pin className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="text-xs text-primary font-medium">{pinnedCount} {t("pinnedMessage", { count: pinnedCount })}</span>
          <ChevronRight className={`w-3 h-3 text-primary ms-auto transition-transform ${showPins ? "rotate-90" : ""}`} />
        </button>
      )}

      {/* Pinned messages dropdown */}
      {showPins && (
        <div className="border-b border-border bg-card/50 max-h-40 overflow-y-auto">
          {pins.map(msg => (
            <div key={msg.id} className="flex items-start gap-2 px-4 py-2 hover:bg-muted/30">
              <Pin className="w-2.5 h-2.5 text-primary flex-shrink-0 mt-1" />
              <div>
                <span className="text-xs font-semibold text-foreground">{msg.displayName}</span>
                <p className="text-xs text-muted-foreground line-clamp-2">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
            <Hash className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
            <p className="text-xs text-muted-foreground">{t("noMessagesDesc", { channel: channel.name })}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              canDelete={isOwner || canMod || msg.userId === myUserId}
              canPin={canMod || isOwner}
              onDelete={(id) => deleteMutation.mutate(id)}
              onPin={(id) => pinMutation.mutate(id)}
              roleColor={(roleColorMap as Record<number, string>)[msg.userId]}
              roles={roles}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — announcement restriction or normal input */}
      {(channel.type !== "announcement" || isOwner || canMod) ? (
        <div className="border-t border-border px-4 py-3 relative">
          {/* @mention autocomplete dropdown */}
          {mentionSearch !== null && filteredMentions.length > 0 && (
            <div className="absolute bottom-full start-4 end-4 mb-2 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-border">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Roles</span>
              </div>
              {filteredMentions.map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => insertRoleMention(role)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-start"
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                  <span className="text-sm font-medium" style={{ color: role.color }}>@{role.name}</span>
                  <span className="text-xs text-muted-foreground ms-auto">mentionable</span>
                </button>
              ))}
            </div>
          )}
          {slowmodeLeft > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-500/80 mb-2">
              <Clock className="w-3 h-3" />
              <span>Slow mode — wait {slowmodeLeft}s before sending</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border focus-within:border-primary/50 transition-colors">
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
              placeholder={slowmodeLeft > 0 ? `Slow mode — ${slowmodeLeft}s remaining` : t("typeMessage", { channel: channel.name })}
              value={text}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setMentionSearch(null); return; }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              maxLength={4000}
              disabled={slowmodeLeft > 0}
            />
            <button onClick={handleSend} disabled={!text.trim() || sendMutation.isPending || slowmodeLeft > 0} className="text-primary disabled:text-muted-foreground">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3 flex items-center gap-2.5 text-muted-foreground bg-muted/20 flex-shrink-0">
          <Megaphone className="w-4 h-4 text-amber-500/70 flex-shrink-0" />
          <span className="text-sm">This is an announcement channel — only moderators can post here.</span>
        </div>
      )}
    </div>
  );
}

// ── Voice channel row (sidebar) ────────────────────────────────────────────────

function VoiceChannelRow({ channel, communityId, communityName, isMember, participants, isSelected, onSelect }: {
  channel: Channel; communityId: number; communityName: string; isMember: boolean;
  participants: VoicePresenceUser[]; isSelected?: boolean; onSelect?: () => void;
}) {
  const { activeRoom, joinCommunityVoice } = useVoice();
  const { toast } = useToast();
  const { t } = useTranslation("communities");
  const isActive = activeRoom?.kind === "community" && activeRoom.channelId === channel.id;

  const handleClick = useCallback(async () => {
    if (onSelect) onSelect();
    if (!isMember || isActive) return;
    try { await joinCommunityVoice(communityId, channel.id, `${communityName} › #${channel.name}`); }
    catch { toast({ title: t("error"), variant: "destructive" }); }
  }, [isMember, isActive, joinCommunityVoice, communityId, channel, communityName, t, toast, onSelect]);

  const highlighted = isSelected || isActive;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-start transition-all duration-150 group ${
          highlighted
            ? "bg-accent/70 text-foreground"
            : "text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground"
        }`}
      >
        <Volume2 className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-green-400" : ""}`} />
        <span className="flex-1 truncate font-medium text-[13px]">{channel.name}</span>
        {participants.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{participants.length}</span>
        )}
        {isActive && <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 animate-pulse" />}
      </button>

      {/* Participants beneath the channel (Discord style) */}
      {participants.length > 0 && (
        <div className="ms-5 mt-0.5 mb-1 space-y-px">
          {participants.map((p) => (
            <div key={p.userId} className="flex items-center gap-2 px-2 py-[3px] rounded-sm text-xs text-muted-foreground hover:bg-accent/20 transition-colors">
              <div
                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold overflow-hidden ring-1 ring-border/50"
                style={{ background: p.avatarUrl ? "transparent" : `hsl(${Math.abs(p.displayName.charCodeAt(0) * 17) % 360},55%,35%)` }}
              >
                {p.avatarUrl
                  ? <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                  : p.displayName.charAt(0).toUpperCase()}
              </div>
              <span className="truncate flex-1 text-foreground/70">{p.displayName}</span>
              <div className="flex items-center gap-1">
                <Mic className="w-2.5 h-2.5 text-green-400" />
                {p.cameraEnabled && <Video className="w-2.5 h-2.5 text-blue-400" />}
                {p.screenShareEnabled && <Monitor className="w-2.5 h-2.5 text-purple-400" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Video element helper ───────────────────────────────────────────────────────

function VideoEl({ stream, muted: mutedProp = false, className = "" }: {
  stream: MediaStream; muted?: boolean; className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={mutedProp} className={className} />;
}

// ── Single participant tile in the voice stage ─────────────────────────────────

function VoiceStageTile({
  p, speaking, cameraStream, isLocal,
}: {
  p: VoicePresenceUser;
  speaking?: boolean;
  cameraStream?: MediaStream | null;
  isLocal?: boolean;
}) {
  const hue = Math.abs((p.displayName.charCodeAt(0) * 17 + (p.displayName.charCodeAt(1) || 0) * 31) % 360);
  const hasCam = !!cameraStream;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {hasCam ? (
          /* Camera tile */
          <div
            className={`rounded-2xl overflow-hidden transition-all ${speaking ? "ring-2 ring-green-400" : "ring-1 ring-white/10"}`}
            style={{ width: 160, height: 120 }}
          >
            <VideoEl stream={cameraStream!} muted={isLocal} className="w-full h-full object-cover" />
            {/* Name overlay */}
            <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
              <span className="text-[11px] text-white/90 font-medium truncate block">{p.displayName}</span>
            </div>
          </div>
        ) : (
          /* Avatar circle */
          <div className="relative w-24 h-24">
            {/* Ping ring when speaking */}
            {speaking && (
              <span
                className="absolute inset-0 rounded-full border-[3px] border-green-400 animate-ping"
                style={{ animationDuration: "1.2s", opacity: 0.7 }}
              />
            )}
            <div
              className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center font-bold text-xl select-none transition-all ${speaking ? "ring-2 ring-green-400" : "ring-1 ring-white/[0.08]"}`}
              style={{
                background: p.avatarUrl ? "transparent" : `hsl(${hue},50%,28%)`,
                color: `hsl(${hue},70%,75%)`,
              }}
            >
              {p.avatarUrl
                ? <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                : p.displayName.slice(0, 2).toUpperCase()}
            </div>
            {/* Status mini-badges */}
            <div className="absolute -bottom-1 -end-1 flex gap-0.5">
              {p.cameraEnabled && (
                <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center border border-[#111214]">
                  <Video className="w-2 h-2 text-white" />
                </div>
              )}
              {p.screenShareEnabled && (
                <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center border border-[#111214]">
                  <Monitor className="w-2 h-2 text-white" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Name + speaking dot */}
      {!hasCam && (
        <div className="flex items-center gap-1.5">
          {speaking && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
          <span className="text-[13px] font-medium text-white/65 max-w-[120px] truncate">{p.displayName}</span>
        </div>
      )}
    </div>
  );
}

// ── Community Voice Stage (Discord-style: avatars centered, controls at bottom) ─

function CommunityVoiceStage({ channel, communityId, communityName, participants, isMember, textChannels, myUserId, isOwner }: {
  channel: Channel; communityId: number; communityName: string;
  participants: VoicePresenceUser[]; isMember: boolean;
  textChannels: Channel[]; myUserId: number; isOwner: boolean;
}) {
  const {
    activeRoom, joinCommunityVoice, leaveVoice,
    muted, toggleMute, cameraEnabled, toggleCamera,
    sharing, startScreenShare, stopScreenShare,
    deafened, toggleDeafen,
    speaking: localSpeaking,
    peers,
    localCameraStream, localScreenStream,
  } = useVoice();
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const isInChannel = activeRoom?.kind === "community" && activeRoom.channelId === channel.id;
  const [showChat, setShowChat] = useState(false);
  const firstTextChannel = textChannels[0] ?? null;

  // Suppress the floating VoicePanel while connected
  useEffect(() => {
    if (!isInChannel) return;
    return acquireInlineStage();
  }, [isInChannel]);

  // Auto-close chat when leaving voice
  useEffect(() => {
    if (!isInChannel) setShowChat(false);
  }, [isInChannel]);

  // Build peer lookup map: userId → PeerUiState (for speaking + streams)
  const peerMap = useMemo(() => {
    const m = new Map<number, PeerUiState>();
    for (const p of peers) m.set(p.userId, p);
    return m;
  }, [peers]);

  // Find active screen share (local first, then remote)
  const activeScreenShare = useMemo(() => {
    if (localScreenStream) return { stream: localScreenStream, label: "Your screen" };
    for (const p of peers) {
      if (p.screenStream) return { stream: p.screenStream, label: `${p.displayName}'s screen` };
    }
    return null;
  }, [localScreenStream, peers]);

  const handleJoin = useCallback(async () => {
    if (!isMember) { toast({ title: "Join the community first", variant: "destructive" }); return; }
    try { await joinCommunityVoice(communityId, channel.id, `${communityName} › #${channel.name}`); }
    catch { toast({ title: "Failed to join voice", variant: "destructive" }); }
  }, [isMember, joinCommunityVoice, communityId, channel, communityName, toast]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#111214" }}>

      {/* ── Main stage area (+ optional chat panel side-by-side) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Stage */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">

          {/* Screen share — full width prominent view */}
          {activeScreenShare && (
            <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-black">
              <VideoEl
                stream={activeScreenShare.stream}
                muted={!!localScreenStream}
                className="max-w-full max-h-full object-contain"
              />
              <div
                className="absolute bottom-3 start-3 text-[11px] text-white/60 bg-black/50 px-2 py-0.5 rounded-full"
              >
                {activeScreenShare.label}
              </div>
            </div>
          )}

          {/* Participant tiles */}
          <div
            className={`flex items-center justify-center overflow-auto ${activeScreenShare ? "py-3 flex-shrink-0 border-t border-white/5" : "flex-1"}`}
            style={activeScreenShare ? { maxHeight: 140 } : {}}
          >
            {participants.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-7 px-8 py-4">
                {participants.map((p) => {
                  const peer = peerMap.get(p.userId);
                  const isLocal = p.userId === (user?.id ?? -1);
                  const isSpeaking = isLocal ? localSpeaking : (peer?.speaking ?? false);
                  const camStream = isLocal ? localCameraStream : (peer?.cameraStream ?? null);
                  return (
                    <VoiceStageTile
                      key={p.userId}
                      p={p}
                      speaking={isSpeaking}
                      cameraStream={camStream}
                      isLocal={isLocal}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center select-none py-8">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                  <Volume2 className="w-10 h-10 text-white/15" />
                </div>
                <div>
                  <p className="text-white/60 font-medium">No one's in here yet</p>
                  <p className="text-white/30 text-sm mt-1">Be the first to join</p>
                </div>
                {isMember && !isInChannel && (
                  <Button onClick={handleJoin} className="gap-2 bg-green-600 hover:bg-green-500 text-white rounded-xl">
                    <Mic className="w-4 h-4" /> Join Voice
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Text chat overlay panel */}
        {showChat && firstTextChannel && (
          <div
            className="w-80 flex flex-col flex-shrink-0 border-s border-white/10 overflow-hidden"
            style={{ background: "#1a1b1e" }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
              <span className="text-[12px] font-semibold text-white/60 uppercase tracking-wider">
                # {firstTextChannel.name}
              </span>
              <button
                onClick={() => setShowChat(false)}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <TextChannelPanel
              communityId={communityId}
              channel={firstTextChannel}
              isOwner={isOwner}
              canMod={isOwner}
              myUserId={myUserId}
            />
          </div>
        )}
      </div>

      {/* ── Discord-style controls bar ── */}
      {isInChannel ? (
        <div
          className="flex items-center justify-center gap-2.5 py-4 px-6 flex-shrink-0"
          style={{ background: "#1e1f22", borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Mute */}
          <button
            onClick={toggleMute}
            title={muted ? "Unmute" : "Mute"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${muted ? "bg-red-600 hover:bg-red-500" : "bg-white/10 hover:bg-white/20"}`}
          >
            {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
          </button>

          {/* Deafen */}
          <button
            onClick={toggleDeafen}
            title={deafened ? "Undeafen" : "Deafen"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${deafened ? "bg-red-600 hover:bg-red-500" : "bg-white/10 hover:bg-white/20"}`}
          >
            {deafened ? <VolumeX className="w-5 h-5 text-white" /> : <Headphones className="w-5 h-5 text-white/80" />}
          </button>

          {/* Camera */}
          <button
            onClick={toggleCamera}
            title={cameraEnabled ? "Stop Camera" : "Start Camera"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${cameraEnabled ? "bg-blue-600 hover:bg-blue-500" : "bg-white/10 hover:bg-white/20"}`}
          >
            <Video className={`w-5 h-5 ${cameraEnabled ? "text-white" : "text-white/70"}`} />
          </button>

          {/* Screen share */}
          <button
            onClick={() => sharing ? stopScreenShare() : void startScreenShare()}
            title={sharing ? "Stop Sharing" : "Share Screen"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${sharing ? "bg-green-600 hover:bg-green-500" : "bg-white/10 hover:bg-white/20"}`}
          >
            <Monitor className={`w-5 h-5 ${sharing ? "text-white" : "text-white/70"}`} />
          </button>

          {/* Chat toggle */}
          {firstTextChannel && (
            <button
              onClick={() => setShowChat(v => !v)}
              title="Text Chat"
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${showChat ? "bg-primary/80 hover:bg-primary" : "bg-white/10 hover:bg-white/20"}`}
            >
              <MessageSquare className={`w-5 h-5 ${showChat ? "text-white" : "text-white/70"}`} />
            </button>
          )}

          {/* Disconnect */}
          <button
            onClick={leaveVoice}
            title="Disconnect"
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 transition-colors"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
        </div>
      ) : (
        (participants.length > 0 || !isMember) ? null : (
          <div
            className="flex items-center justify-center py-4 flex-shrink-0"
            style={{ background: "#1e1f22", borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <Button onClick={handleJoin} className="gap-2 bg-green-600 hover:bg-green-500 text-white rounded-xl px-8">
              <Mic className="w-4 h-4" /> Join Voice
            </Button>
          </div>
        )
      )}
    </div>
  );
}

// ── Stage Channel Panel ───────────────────────────────────────────────────────

function StageChannelPanel({ communityId, channel, participants, isOwner, myUserId }: {
  communityId: number; channel: Channel; participants: VoicePresenceUser[];
  isOwner: boolean; myUserId: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [speakers, setSpeakers] = useState<number[]>([]);
  const [hands, setHands] = useState<{ userId: number; displayName: string }[]>([]);
  const [myHandRaised, setMyHandRaised] = useState(false);

  const { data: stageData, refetch: refetchHands } = useQuery<{
    hands: { userId: number; displayName: string }[]; speakers: number[];
  }>({
    queryKey: ["stage-hands", communityId, channel.id],
    queryFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}/stage/hands`),
    enabled: isOwner,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (stageData) {
      setHands(stageData.hands ?? []);
      setSpeakers(stageData.speakers ?? []);
    }
  }, [stageData]);

  // Real-time WS stage events
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.channelId !== channel.id) return;
      if (msg.type === "stage-speaker-approved") {
        setSpeakers(prev => prev.includes(msg.userId) ? prev : [...prev, msg.userId]);
        setHands(prev => prev.filter(h => h.userId !== msg.userId));
        if (msg.userId === myUserId) setMyHandRaised(false);
      } else if (msg.type === "stage-speaker-removed") {
        setSpeakers(prev => prev.filter(uid => uid !== msg.userId));
      } else if (msg.type === "stage-raise-hand" && isOwner) {
        setHands(prev => prev.some(h => h.userId === msg.userId) ? prev : [...prev, { userId: msg.userId, displayName: msg.displayName }]);
      }
    };
    ["gwh:stage-speaker-approved", "gwh:stage-speaker-removed", "gwh:stage-raise-hand"].forEach(ev =>
      window.addEventListener(ev, handler)
    );
    return () => {
      ["gwh:stage-speaker-approved", "gwh:stage-speaker-removed", "gwh:stage-raise-hand"].forEach(ev =>
        window.removeEventListener(ev, handler)
      );
    };
  }, [channel.id, myUserId, isOwner]);

  const speakerParticipants = participants.filter(p => speakers.includes(p.userId) || (isOwner && p.userId === myUserId));
  const audienceParticipants = participants.filter(p => !speakerParticipants.some(s => s.userId === p.userId));
  const iAmSpeaker = speakers.includes(myUserId) || isOwner;

  const raiseHand = async () => {
    try {
      await customFetch(`/api/communities/${communityId}/channels/${channel.id}/stage/raise-hand`, { method: "POST" });
      setMyHandRaised(true);
      toast({ title: "Hand raised — waiting for host approval" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const lowerHand = async () => {
    try {
      await customFetch(`/api/communities/${communityId}/channels/${channel.id}/stage/lower-hand`, { method: "POST" });
      setMyHandRaised(false);
    } catch { /* no-op */ }
  };

  const approveHand = async (uid: number) => {
    try {
      await customFetch(`/api/communities/${communityId}/channels/${channel.id}/stage/approve/${uid}`, { method: "POST" });
      if (isOwner) refetchHands();
    } catch { toast({ title: "Failed to approve", variant: "destructive" }); }
  };

  const removeSpeaker = async (uid: number) => {
    try {
      await customFetch(`/api/communities/${communityId}/channels/${channel.id}/stage/speakers/${uid}`, { method: "DELETE" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#111214" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/20 flex-shrink-0">
        <Mic2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-white/80">#{channel.name}</span>
        <span className="ms-auto text-[10px] font-mono uppercase tracking-widest text-white/30 border border-white/10 rounded px-1.5 py-0.5">STAGE</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Speakers */}
        <div className="px-6 pt-6 pb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-4">
            Speakers — {speakerParticipants.length}
          </p>
          {speakerParticipants.length === 0 ? (
            <p className="text-white/25 text-sm">No speakers yet</p>
          ) : (
            <div className="flex flex-wrap gap-6">
              {speakerParticipants.map(p => (
                <div key={p.userId} className="flex flex-col items-center gap-2 relative">
                  <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-primary/50 flex-shrink-0">
                    {p.avatarUrl
                      ? <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary font-bold text-lg">{p.displayName.slice(0, 2).toUpperCase()}</div>}
                  </div>
                  <span className="text-xs text-white/70 max-w-[80px] truncate text-center">{p.displayName}</span>
                  {isOwner && p.userId !== myUserId && (
                    <button
                      onClick={() => removeSpeaker(p.userId)}
                      className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center hover:scale-110 transition-transform"
                      title="Move to audience"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/5 mx-4" />

        {/* Audience */}
        <div className="px-6 pt-4 pb-6">
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-3">
            Audience — {audienceParticipants.length}
          </p>
          {audienceParticipants.length === 0 && !isOwner && (
            <p className="text-white/25 text-sm">No audience members yet</p>
          )}
          <div className="flex flex-wrap gap-4">
            {audienceParticipants.map(p => (
              <div key={p.userId} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/10">
                  {p.avatarUrl
                    ? <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/60 text-xs font-bold">{p.displayName.slice(0, 2).toUpperCase()}</div>}
                </div>
                <span className="text-[10px] text-white/40 max-w-[60px] truncate text-center">{p.displayName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hand queue — owner only */}
        {isOwner && hands.length > 0 && (
          <div className="mx-4 mb-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-yellow-400/70 mb-2 flex items-center gap-1">
              <Hand className="w-3 h-3" /> Raised Hands — {hands.length}
            </p>
            <div className="space-y-1.5">
              {hands.map(h => (
                <div key={h.userId} className="flex items-center gap-2">
                  <span className="text-xs text-white/70 flex-1">{h.displayName}</span>
                  <button onClick={() => approveHand(h.userId)} className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded transition-colors">
                    Allow
                  </button>
                  <button onClick={() => setHands(prev => prev.filter(x => x.userId !== h.userId))} className="text-xs text-white/40 hover:text-white/60 px-1">
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 bg-[#1e1f22] flex items-center justify-center gap-3">
        {!iAmSpeaker && (
          myHandRaised ? (
            <button
              onClick={lowerHand}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-600/15 border border-yellow-500/30 text-yellow-400 text-sm hover:bg-yellow-600/25 transition-colors"
            >
              <Hand className="w-4 h-4" /> Lower Hand
            </button>
          ) : (
            <button
              onClick={raiseHand}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm hover:bg-primary/20 transition-colors"
            >
              <Hand className="w-4 h-4" /> ✋ Request to Speak
            </button>
          )
        )}
        {iAmSpeaker && (
          <p className="text-xs text-green-400/80 flex items-center gap-1.5 font-medium">
            <Mic2 className="w-3.5 h-3.5" /> You are speaking
          </p>
        )}
      </div>
    </div>
  );
}

// ── Polls sidebar section ──────────────────────────────────────────────────────

function PollsSection({ communityId, isOwnerOrMod }: { communityId: number; isOwnerOrMod: boolean }) {
  const { t } = useTranslation("communities");
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const { data: polls = [], isLoading } = useQuery<Poll[]>({
    queryKey: ["community-polls", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/polls`),
    refetchInterval: 30_000,
  });

  const active = polls.filter(p => !p.is_closed);

  return (
    <div className="border-t border-border pt-2 pb-1">
      <div className="flex items-center justify-between px-2 mb-1">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className={`w-2.5 h-2.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          <BarChart3 className="w-2.5 h-2.5" />
          {t("polls")} {active.length > 0 && `· ${active.length}`}
        </button>
        {isOwnerOrMod && (
          <button onClick={() => setCreateOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-2 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-2"><Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /></div>
          ) : active.length === 0 ? (
            <p className="text-[10px] text-muted-foreground px-1 py-1">{t("noPollsYet")}</p>
          ) : (
            active.slice(0, 3).map(poll => (
              <PollCard
                key={poll.id}
                poll={poll}
                communityId={communityId}
                onVoted={() => qc.invalidateQueries({ queryKey: ["community-polls", communityId] })}
              />
            ))
          )}
        </div>
      )}
      <CreatePollDialog communityId={communityId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ── Channel list (left sidebar) ────────────────────────────────────────────────

function ChannelSidebar({ community, activeChannelId, onSelectChannel, onAddChannel, onLeave, onBoost, onBannerEdit, onInvite, onSettings, onChannelSettings, boostPending, voicePresence }: {
  community: Community; activeChannelId: number | null;
  onSelectChannel: (id: number) => void; onAddChannel: () => void;
  onLeave: () => void; onBoost: () => void; onBannerEdit: () => void; onInvite: () => void;
  onSettings: () => void; onChannelSettings: (ch: Channel) => void;
  boostPending: boolean; voicePresence: VoicePresenceMap;
}) {
  const { t } = useTranslation("communities");
  const textChannels = community.channels.filter((c) => c.type === "text" || c.type === "announcement");
  const voiceChannels = community.channels.filter((c) => c.type === "voice" || c.type === "stage");
  const isOwnerOrMod = community.isMod ?? community.isOwner;

  return (
    <div className="w-60 flex flex-col flex-shrink-0 bg-card border-e border-border/60 overflow-hidden">
      {/* Banner / Community header */}
      <div className="flex-shrink-0 relative">
        {community.bannerKey ? (
          <div className="relative h-24 overflow-hidden">
            <img src={community.bannerKey} alt={community.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/60" />
            {community.isOwner && (
              <button onClick={onBannerEdit} className="absolute top-2 end-2 bg-black/50 hover:bg-black/70 rounded-md p-1.5 text-white/80 transition-colors backdrop-blur-sm">
                <Image className="w-3 h-3" />
              </button>
            )}
            {/* Overlay name */}
            <div className="absolute bottom-0 inset-x-0 px-3 pb-2">
              <div className="font-bold text-white text-sm truncate drop-shadow">{community.name}</div>
              {community.boostLevel > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Zap className="w-2.5 h-2.5 text-yellow-300" />
                  <span className="text-[10px] text-yellow-300 font-semibold">Level {community.boostLevel}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 shadow-sm">
            <div className="font-bold text-foreground text-[14px] truncate flex-1">{community.name}</div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {community.boostLevel > 0 && (
                <span className="flex items-center gap-0.5 text-yellow-400">
                  <Zap className="w-3 h-3" />
                  <span className="text-[10px] font-bold">{community.boostLevel}</span>
                </span>
              )}
              {community.isOwner && (
                <button onClick={onBannerEdit} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors ms-1">
                  <Image className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
        {community.bannerKey && <div className="border-b border-border/40" />}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4 px-2">

        {/* TEXT CHANNELS */}
        {textChannels.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1 group/section">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 select-none">
                Text Channels
              </span>
              {isOwnerOrMod && (
                <button
                  onClick={onAddChannel}
                  className="opacity-0 group-hover/section:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {textChannels.map((ch) => (
                <div
                  key={ch.id}
                  className={`flex items-center rounded-md group/ch transition-all duration-100 ${
                    activeChannelId === ch.id ? "bg-accent/80" : "hover:bg-accent/40"
                  }`}
                >
                  <button
                    onClick={() => onSelectChannel(ch.id)}
                    className={`flex-1 flex items-center gap-2 px-2.5 py-[7px] text-[13px] font-medium text-start ${
                      activeChannelId === ch.id ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground"
                    }`}
                  >
                    <ChannelIcon channel={ch} size={4} className="opacity-80 flex-shrink-0" />
                    <span className="truncate flex-1">{ch.name}</span>
                    {ch.isPrivate && <Lock className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />}
                  </button>
                  {isOwnerOrMod && (
                    <button
                      onClick={() => onChannelSettings(ch)}
                      className="opacity-0 group-hover/ch:opacity-100 transition-opacity p-1 me-1 text-muted-foreground hover:text-foreground"
                      title="Channel Settings"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VOICE / STAGE CHANNELS */}
        {voiceChannels.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1 group/section">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 select-none flex-1">
                Voice Channels
              </span>
              {isOwnerOrMod && (
                <button onClick={onAddChannel} className="opacity-0 group-hover/section:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {voiceChannels.map((ch) => (
                ch.type === "stage" ? (
                  /* Stage channel row */
                  <div key={ch.id} className={`flex items-center rounded-md group/ch transition-all ${activeChannelId === ch.id ? "bg-accent/80" : "hover:bg-accent/40"}`}>
                    <button
                      onClick={() => onSelectChannel(ch.id)}
                      className={`flex-1 flex items-center gap-2 px-2.5 py-[7px] text-[13px] font-medium text-start ${activeChannelId === ch.id ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground"}`}
                    >
                      <Mic2 className="w-4 h-4 flex-shrink-0 opacity-80" />
                      <span className="flex-1 truncate">{ch.name}</span>
                      {ch.isPrivate && <Lock className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />}
                    </button>
                    {isOwnerOrMod && (
                      <button onClick={() => onChannelSettings(ch)} className="opacity-0 group-hover/ch:opacity-100 transition-opacity p-1 me-1 text-muted-foreground hover:text-foreground">
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  /* Voice channel row */
                  <div key={ch.id} className={`relative group/ch ${isOwnerOrMod ? "pe-7" : ""}`}>
                    <VoiceChannelRow
                      channel={ch}
                      communityId={community.id}
                      communityName={community.name}
                      isMember={community.isMember}
                      participants={voicePresence[String(ch.id)] ?? []}
                      isSelected={activeChannelId === ch.id}
                      onSelect={() => onSelectChannel(ch.id)}
                    />
                    {isOwnerOrMod && (
                      <button onClick={() => onChannelSettings(ch)} className="absolute top-1.5 end-1 opacity-0 group-hover/ch:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground">
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Polls */}
        <PollsSection communityId={community.id} isOwnerOrMod={isOwnerOrMod} />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border/40 p-2 space-y-0.5">
        <Button variant="ghost" size="sm" className="w-full justify-start text-[12px] text-primary/70 hover:text-primary hover:bg-primary/10 h-8 rounded-md" onClick={onInvite}>
          <Link2 className="w-3.5 h-3.5 me-2 opacity-80" />{t("inviteLinks")}
        </Button>
        {community.isOwner && (
          <Button variant="ghost" size="sm" className="w-full justify-start text-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 h-8 rounded-md" onClick={onSettings}>
            <Settings className="w-3.5 h-3.5 me-2 opacity-80" />Server Settings
          </Button>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-[12px] text-yellow-500/80 hover:text-yellow-400 hover:bg-yellow-400/10 h-8 rounded-md" onClick={onBoost} disabled={boostPending}>
          <Zap className="w-3.5 h-3.5 me-2 opacity-80" />{t("boost")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-[12px] text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 h-8 rounded-md" onClick={onLeave}>
          <LogOut className="w-3.5 h-3.5 me-2 opacity-80" />{t("leave")}
        </Button>
      </div>
    </div>
  );
}

// ── Members + Leaderboard panel ────────────────────────────────────────────────

function MembersPanel({ communityId, ownerId, isOwner }: {
  communityId: number; ownerId: number; isOwner: boolean;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"members" | "leaderboard">("members");
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null);

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["community-members", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/members?limit=100`),
    refetchInterval: 30000,
    enabled: tab === "members",
  });

  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["community-leaderboard", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/leaderboard`),
    staleTime: 60_000,
    enabled: tab === "leaderboard",
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["community-roles", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/roles`),
    staleTime: 60_000,
    enabled: tab === "members",
  });

  const { data: memberRolesMap = {} } = useQuery<MemberRolesMap>({
    queryKey: ["community-all-member-roles", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/all-member-roles`),
    staleTime: 30_000,
    enabled: tab === "members",
  });

  const kickMutation = useMutation({
    mutationFn: (userId: number) => customFetch(`/api/communities/${communityId}/kick/${userId}`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community-members", communityId] }); toast({ title: t("kick") + " ✓" }); },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: (userId: number) => customFetch(`/api/communities/${communityId}/ban/${userId}`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community-members", communityId] }); toast({ title: t("ban") + " ✓" }); },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      customFetch(`/api/communities/${communityId}/members/${userId}/roles/${roleId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-all-member-roles", communityId] });
      setAssigningUserId(null);
    },
    onError: () => toast({ title: "Failed to assign role", variant: "destructive" }),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      customFetch(`/api/communities/${communityId}/members/${userId}/roles/${roleId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-all-member-roles", communityId] }),
    onError: () => toast({ title: "Failed to remove role", variant: "destructive" }),
  });

  const rankColors = ["text-yellow-400", "text-zinc-300", "text-amber-600"];
  const rankEmojis = ["🥇", "🥈", "🥉"];

  // Group members: members with displaySeparately roles first, then the rest
  const separateRoles = useMemo(() =>
    [...roles].filter(r => r.displaySeparately && !r.isDefault).sort((a, b) => b.position - a.position),
    [roles]
  );

  const memberGroups = useMemo(() => {
    if (tab !== "members" || separateRoles.length === 0) return null;
    const groups: { role: Role; members: Member[] }[] = [];
    const ungrouped: Member[] = [];

    for (const role of separateRoles) {
      const roleMembers = members.filter(m => {
        const mRoles = (memberRolesMap as MemberRolesMap)[m.userId] ?? [];
        return mRoles.some(r => r.id === role.id);
      });
      if (roleMembers.length > 0) groups.push({ role, members: roleMembers });
    }
    const groupedIds = new Set(groups.flatMap(g => g.members.map(m => m.userId)));
    for (const m of members) if (!groupedIds.has(m.userId)) ungrouped.push(m);
    return { groups, ungrouped };
  }, [members, memberRolesMap, separateRoles, tab]);

  const getTopRoleColor = (userId: number) => {
    const mRoles = (memberRolesMap as MemberRolesMap)[userId] ?? [];
    const top = mRoles.find(r => !roles.find(role => role.id === r.id)?.isDefault);
    return top?.color;
  };

  const assignableRoles = roles.filter(r => !r.isDefault);

  const MemberRow = ({ m }: { m: Member }) => {
    const topColor = getTopRoleColor(m.userId);
    const mRoleIds = new Set(((memberRolesMap as MemberRolesMap)[m.userId] ?? []).map(r => r.id));
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 group">
        <Avatar name={m.displayName} url={m.avatarUrl} size={6} />
        <span className="text-xs truncate flex-1" style={topColor ? { color: topColor } : { color: "hsl(var(--foreground)/0.8)" }}>
          {m.displayName}
        </span>
        {m.userId === ownerId && <Crown className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
        {isOwner && m.userId !== ownerId && (
          <DropdownMenu open={assigningUserId === m.userId} onOpenChange={o => setAssigningUserId(o ? m.userId : null)}>
            <DropdownMenuTrigger asChild>
              <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5">
                <MoreVertical className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start" className="w-48">
              {assignableRoles.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground tracking-widest">Roles</div>
                  {assignableRoles.map(role => {
                    const has = mRoleIds.has(role.id);
                    return (
                      <DropdownMenuItem
                        key={role.id}
                        onClick={() => has
                          ? removeRoleMutation.mutate({ userId: m.userId, roleId: role.id })
                          : assignRoleMutation.mutate({ userId: m.userId, roleId: role.id })
                        }
                        className="gap-2"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: role.color }} />
                        <span className="flex-1 text-xs">{role.name}</span>
                        {has && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <div className="border-t border-border my-1" />
                </>
              )}
              <DropdownMenuItem onClick={() => kickMutation.mutate(m.userId)} className="text-destructive">
                <UserMinus className="w-3 h-3 me-2" />{t("kick")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => banMutation.mutate(m.userId)} className="text-destructive">
                <Ban className="w-3 h-3 me-2" />{t("ban")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className="w-52 border-s border-border flex flex-col flex-shrink-0 bg-card/50">
      {/* Tab header */}
      <div className="px-2 py-2 border-b border-border flex items-center gap-1 p-0.5 bg-muted/30">
        <button
          onClick={() => setTab("members")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors ${tab === "members" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="w-2.5 h-2.5" />
          {t("members")}
        </button>
        <button
          onClick={() => setTab("leaderboard")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors ${tab === "leaderboard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Trophy className="w-2.5 h-2.5" />
          {t("leaderboard")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {tab === "members" ? (
          memberGroups ? (
            <>
              {memberGroups.groups.map(({ role, members: gMembers }) => (
                <div key={role.id}>
                  <div className="flex items-center gap-1.5 px-2 py-1 mt-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: role.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: role.color }}>
                      {role.name} — {gMembers.length}
                    </span>
                  </div>
                  {gMembers.map(m => <MemberRow key={m.userId} m={m} />)}
                </div>
              ))}
              {memberGroups.ungrouped.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Members — {memberGroups.ungrouped.length}
                    </span>
                  </div>
                  {memberGroups.ungrouped.map(m => <MemberRow key={m.userId} m={m} />)}
                </div>
              )}
            </>
          ) : (
            members.map(m => <MemberRow key={m.userId} m={m} />)
          )
        ) : (
          leaderboard.map((entry) => (
            <div key={entry.userId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30">
              <span className={`text-xs font-mono w-5 text-center flex-shrink-0 ${rankColors[entry.rank - 1] ?? "text-muted-foreground"}`}>
                {entry.rank <= 3 ? rankEmojis[entry.rank - 1] : entry.rank}
              </span>
              <Avatar name={entry.displayName} url={entry.avatarUrl} size={6} />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate text-foreground/80">{entry.displayName}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{entry.messageCount} {t("messages")}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Permission definitions ────────────────────────────────────────────────────

const PERMISSIONS: { key: string; label: string; description: string; category: string }[] = [
  { key: "is_admin",           label: "Administrator",      description: "Full control over this community (except deletion)",  category: "Advanced" },
  { key: "can_kick",           label: "Kick Members",       description: "Remove members from the community",                  category: "Moderation" },
  { key: "can_ban",            label: "Ban Members",        description: "Permanently ban members",                            category: "Moderation" },
  { key: "can_mute_voice",     label: "Mute in Voice",      description: "Server-mute members in voice channels",             category: "Moderation" },
  { key: "can_pin_messages",   label: "Pin Messages",       description: "Pin and unpin messages in any channel",             category: "Moderation" },
  { key: "can_manage_channels",label: "Manage Channels",   description: "Create, edit, and delete channels",                  category: "Management" },
  { key: "can_manage_roles",   label: "Manage Roles",       description: "Create and assign roles below their own",           category: "Management" },
  { key: "can_invite",         label: "Create Invites",     description: "Generate invite links",                             category: "Management" },
  { key: "can_manage_polls",   label: "Manage Polls",       description: "Create and manage community polls",                 category: "Management" },
  { key: "can_change_banner",  label: "Change Banner",      description: "Upload or remove the community banner",             category: "Management" },
  { key: "can_manage_events",  label: "Manage Events",      description: "Create and manage community events",                category: "Management" },
  { key: "can_post",           label: "Send Messages",      description: "Post messages in text channels",                    category: "General" },
  { key: "can_send_media",     label: "Attach Media",       description: "Send images and files in messages",                 category: "General" },
];

// ── PermToggle ────────────────────────────────────────────────────────────────

function PermToggle({ label, description, checked, onToggle, disabled = false }: {
  label: string; description: string; checked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-3 py-2.5 rounded-lg border transition-colors ${checked ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"} ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-checked={checked}
        className={`flex-shrink-0 w-9 h-5 rounded-full relative transition-colors duration-150 focus:outline-none ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-150 ${checked ? "start-[18px]" : "start-0.5"}`} />
      </button>
    </div>
  );
}

// ── RoleEditor ────────────────────────────────────────────────────────────────

function RoleEditor({ role, onSave, onDelete, isSaving, isDeleting }: {
  role: Role; onSave: (updates: Partial<Role>) => void;
  onDelete: () => void; isSaving: boolean; isDeleting: boolean;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [displaySeparately, setDisplaySeparately] = useState(role.displaySeparately);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [permissions, setPermissions] = useState<Record<string, boolean>>(role.permissions ?? {});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setName(role.name); setColor(role.color);
    setDisplaySeparately(role.displaySeparately); setMentionable(role.mentionable);
    setPermissions(role.permissions ?? {}); setShowDeleteConfirm(false);
  }, [role.id]);

  const isDirty = name !== role.name || color !== role.color ||
    displaySeparately !== role.displaySeparately || mentionable !== role.mentionable ||
    JSON.stringify(permissions) !== JSON.stringify(role.permissions ?? {});

  const categories = ["Advanced", "Moderation", "Management", "General"];
  const byCategory = PERMISSIONS.reduce<Record<string, typeof PERMISSIONS>>((acc, p) => {
    (acc[p.category] = acc[p.category] ?? []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      {/* Name + Color */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Role Name & Colour</p>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer flex-shrink-0" title="Pick colour">
            <div
              className="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center overflow-hidden"
              style={{ background: color }}
            />
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="sr-only" />
          </label>
          <Input
            value={name} onChange={e => setName(e.target.value)}
            maxLength={80} placeholder="Role name"
            disabled={role.isDefault} className="flex-1"
          />
        </div>
      </div>

      {/* Display settings */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Display</p>
        <div className="space-y-2">
          <PermToggle label="Show separately in member list" description="Members appear under this role's heading in the sidebar" checked={displaySeparately} onToggle={() => setDisplaySeparately(v => !v)} />
          <PermToggle label="Allow @mentions" description="Anyone can ping this role to notify all its members" checked={mentionable} onToggle={() => setMentionable(v => !v)} />
        </div>
      </div>

      {/* Permissions */}
      {categories.map(cat => byCategory[cat] ? (
        <div key={cat}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{cat}</p>
          <div className="space-y-2">
            {byCategory[cat].map(perm => (
              <PermToggle
                key={perm.key}
                label={perm.label}
                description={perm.description}
                checked={!!permissions[perm.key]}
                onToggle={() => setPermissions(prev => ({ ...prev, [perm.key]: !prev[perm.key] }))}
                disabled={!!(permissions.is_admin && perm.key !== "is_admin")}
              />
            ))}
          </div>
        </div>
      ) : null)}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border sticky bottom-0 bg-background pb-1">
        <div>
          {!role.isDefault && (showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive">Delete this role?</span>
              <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="w-3.5 h-3.5 me-1.5" /> Delete Role
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => onSave({ name, color, displaySeparately, mentionable, permissions })} disabled={!isDirty || isSaving}>
          {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ── ServerSettingsDialog ───────────────────────────────────────────────────────

function ServerSettingsDialog({ community, open, onClose }: {
  community: Community; open: boolean; onClose: () => void;
}) {
  const [activeTab] = useState<"roles">("roles");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["community-roles", community.id],
    queryFn: () => customFetch(`/api/communities/${community.id}/roles`),
    enabled: open,
  });

  // Auto-select first non-default role (or @everyone if only that exists)
  useEffect(() => {
    if (!open || roles.length === 0) return;
    if (!selectedRoleId || !roles.find(r => r.id === selectedRoleId)) {
      const first = roles.find(r => !r.isDefault) ?? roles[0];
      setSelectedRoleId(first?.id ?? null);
    }
  }, [open, roles]);

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null;

  const nonDefaultSorted = useMemo(() =>
    [...roles].filter(r => !r.isDefault).sort((a, b) => b.position - a.position),
    [roles]
  );
  const defaultRoles = roles.filter(r => r.isDefault);

  const createRole = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community.id}/roles`, {
      method: "POST", body: JSON.stringify({ name: "New Role", color: "#6366f1" }),
    }),
    onSuccess: (role: Role) => {
      qc.invalidateQueries({ queryKey: ["community-roles", community.id] });
      setSelectedRoleId(role.id);
    },
    onError: () => toast({ title: "Failed to create role", variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: ({ rid, updates }: { rid: number; updates: Partial<Role> }) =>
      customFetch(`/api/communities/${community.id}/roles/${rid}`, {
        method: "PATCH", body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-roles", community.id] });
      toast({ title: "Role saved" });
    },
    onError: () => toast({ title: "Failed to save role", variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: (rid: number) =>
      customFetch(`/api/communities/${community.id}/roles/${rid}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-roles", community.id] });
      setSelectedRoleId(null);
      toast({ title: "Role deleted" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to delete", variant: "destructive" }),
  });

  const reorder = useMutation({
    mutationFn: (order: { id: number; position: number }[]) =>
      customFetch(`/api/communities/${community.id}/roles/reorder`, {
        method: "PATCH", body: JSON.stringify({ order }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-roles", community.id] }),
  });

  const moveRole = (role: Role, direction: "up" | "down") => {
    const idx = nonDefaultSorted.findIndex(r => r.id === role.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= nonDefaultSorted.length) return;
    reorder.mutate([
      { id: nonDefaultSorted[idx].id, position: nonDefaultSorted[swapIdx].position },
      { id: nonDefaultSorted[swapIdx].id, position: nonDefaultSorted[idx].position },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden h-[680px] flex flex-col">
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — settings nav */}
          <div className="w-52 bg-muted/20 border-e border-border flex flex-col py-4 flex-shrink-0 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 mb-3 truncate">
              {community.name}
            </p>
            <button
              className={`flex items-center gap-2.5 px-4 py-2 text-sm text-start transition-colors font-medium bg-accent text-foreground`}
            >
              <Shield className="w-4 h-4" />
              Roles
            </button>
          </div>

          {/* Role list */}
          <div className="w-52 border-e border-border flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {roles.length} role{roles.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => createRole.mutate()}
                disabled={createRole.isPending}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Create role"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {nonDefaultSorted.map((role, i) => (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                    selectedRoleId === role.id ? "bg-accent/70 text-foreground" : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                  <span className="text-sm truncate flex-1">{role.name}</span>
                  <div className="flex flex-col gap-px opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {i > 0 && (
                      <button type="button" onClick={e => { e.stopPropagation(); moveRole(role, "up"); }} className="hover:text-foreground">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    )}
                    {i < nonDefaultSorted.length - 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); moveRole(role, "down"); }} className="hover:text-foreground">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {defaultRoles.map(role => (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    selectedRoleId === role.id ? "bg-accent/70 text-foreground" : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                  <span className="text-sm truncate flex-1">{role.name}</span>
                  <span className="text-[9px] text-muted-foreground font-mono flex-shrink-0">base</span>
                </div>
              ))}
            </div>
          </div>

          {/* Role editor */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {selectedRole ? (
              <RoleEditor
                role={selectedRole}
                onSave={updates => updateRole.mutate({ rid: selectedRole.id, updates })}
                onDelete={() => deleteRole.mutate(selectedRole.id)}
                isSaving={updateRole.isPending}
                isDeleting={deleteRole.isPending}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a role to edit
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add channel dialog ─────────────────────────────────────────────────────────

// ── Channel Settings Dialog ────────────────────────────────────────────────────

function ChannelSettingsDialog({ communityId, channel, open, onClose }: {
  communityId: number; channel: Channel; open: boolean; onClose: () => void;
}) {
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["community-roles", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/roles`),
    enabled: open,
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(channel.name);
  const [slowmode, setSlowmode] = useState(channel.slowmodeSeconds);
  const [isPrivate, setIsPrivate] = useState(!!channel.isPrivate);
  const SLOWMODE_OPTIONS = [0, 5, 30, 60, 300, 3600];

  useEffect(() => {
    setName(channel.name);
    setSlowmode(channel.slowmodeSeconds);
    setIsPrivate(!!channel.isPrivate);
  }, [channel.id, channel.name, channel.slowmodeSeconds, channel.isPrivate]);

  const { data: channelPerms = [] } = useQuery<{ role_id: number; allow: Record<string, boolean>; deny: Record<string, boolean> }[]>({
    queryKey: ["channel-perms", communityId, channel.id],
    queryFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}/permissions`),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, slowmodeSeconds: slowmode, isPrivate }),
    }),
    onSuccess: () => {
      toast({ title: "Channel updated" });
      qc.invalidateQueries({ queryKey: ["community-slug"] });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const savePermission = useMutation({
    mutationFn: ({ roleId, allow, deny }: { roleId: number; allow: Record<string, boolean>; deny: Record<string, boolean> }) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/permissions`, {
        method: "PUT", body: JSON.stringify({ roleId, allow, deny }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-perms", communityId, channel.id] }),
  });

  const slowmodeLabel = (s: number) => s === 0 ? "Off" : s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`;
  const getPermForRole = (roleId: number) => channelPerms.find((p: any) => p.role_id === roleId) ?? { allow: {}, deny: {} };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            # {channel.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Channel Name</Label>
            <Input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} maxLength={100} />
          </div>
          {/* Slow mode */}
          {(channel.type === "text" || channel.type === "announcement") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Slow Mode
                </Label>
                <span className="text-xs font-mono text-primary">{slowmodeLabel(slowmode)}</span>
              </div>
              <Slider
                value={[Math.max(0, SLOWMODE_OPTIONS.indexOf(slowmode))]}
                onValueChange={([i]) => setSlowmode(SLOWMODE_OPTIONS[i] ?? 0)}
                min={0} max={SLOWMODE_OPTIONS.length - 1} step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                {SLOWMODE_OPTIONS.map(s => <span key={s}>{slowmodeLabel(s)}</span>)}
              </div>
            </div>
          )}
          {/* Private toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private Channel</p>
              <p className="text-xs text-muted-foreground mt-0.5">Only members with allowed roles can view this channel</p>
            </div>
            <button
              onClick={() => setIsPrivate(v => !v)}
              className={`w-9 h-5 rounded-full relative transition-colors ${isPrivate ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${isPrivate ? "start-[18px]" : "start-0.5"}`} />
            </button>
          </div>
          {/* Role Permissions */}
          {roles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Role Permissions</Label>
              <div className="rounded-lg border border-border overflow-hidden text-sm">
                <div className="grid grid-cols-[1fr_64px_64px_72px] text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30 px-3 py-1.5 gap-1">
                  <span>Role</span>
                  <span className="text-center">View</span>
                  <span className="text-center">Post</span>
                  <span className="text-center">Media</span>
                </div>
                {roles.map(role => {
                  const perm = getPermForRole(role.id);
                  const getState = (key: string): "allow" | "deny" | "inherit" => {
                    if ((perm.allow as any)?.[key]) return "allow";
                    if ((perm.deny as any)?.[key]) return "deny";
                    return "inherit";
                  };
                  const togglePerm = (key: string) => {
                    const next = getState(key) === "inherit" ? "allow" : getState(key) === "allow" ? "deny" : "inherit";
                    const newAllow = { ...(perm.allow ?? {}) };
                    const newDeny = { ...(perm.deny ?? {}) };
                    delete newAllow[key]; delete newDeny[key];
                    if (next === "allow") newAllow[key] = true;
                    if (next === "deny") newDeny[key] = true;
                    savePermission.mutate({ roleId: role.id, allow: newAllow, deny: newDeny });
                  };
                  const colors = { allow: "text-green-500 font-bold", deny: "text-red-500 font-bold", inherit: "text-muted-foreground/40" };
                  const labels = { allow: "✓", deny: "✗", inherit: "—" };
                  return (
                    <div key={role.id} className="grid grid-cols-[1fr_64px_64px_72px] items-center px-3 py-2 gap-1 border-t border-border/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: role.color }} />
                        <span className="text-xs truncate">{role.name}</span>
                      </div>
                      {(["can_view", "can_post", "can_send_media"] as const).map(key => (
                        <button key={key} onClick={() => togglePerm(key)} className={`text-center transition-colors ${colors[getState(key)]}`} title={`${getState(key)} — click to cycle`}>
                          {labels[getState(key)]}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">✓ Allow · ✗ Deny · — Inherit. Click to cycle.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add channel dialog ─────────────────────────────────────────────────────────

function AddChannelDialog({ communityId, open, onClose }: { communityId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice" | "announcement" | "stage">("text");
  const [isPrivate, setIsPrivate] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/communities/${communityId}/channels`, {
        method: "POST", body: JSON.stringify({ name: name.trim(), type, isPrivate }),
      }),
    onSuccess: () => {
      toast({ title: t("addChannel") + " ✓" });
      qc.invalidateQueries({ queryKey: ["community-slug"] });
      setName(""); setIsPrivate(false); setType("text"); onClose();
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const TYPE_OPTIONS = [
    { value: "text",         icon: <Hash className="w-4 h-4" />,     label: "Text",         desc: "Send messages and media" },
    { value: "announcement", icon: <Megaphone className="w-4 h-4" />,label: "Announcement", desc: "Only mods can post" },
    { value: "voice",        icon: <Volume2 className="w-4 h-4" />,  label: "Voice",        desc: "Voice & video calls" },
    { value: "stage",        icon: <Mic2 className="w-4 h-4" />,     label: "Stage",        desc: "Speakers & audience" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest">{t("addChannel")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("channelName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("channelName")} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-start transition-colors ${
                  type === opt.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                }`}
              >
                <div className={`flex items-center gap-1.5 ${type === opt.value ? "text-primary" : "text-muted-foreground"}`}>
                  {opt.icon}
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-snug">{opt.desc}</span>
              </button>
            ))}
          </div>
          {/* Private toggle */}
          <div
            onClick={() => setIsPrivate(v => !v)}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isPrivate ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30"}`}
          >
            <Lock className={`w-4 h-4 flex-shrink-0 ${isPrivate ? "text-primary" : "text-muted-foreground"}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">Private Channel</p>
              <p className="text-xs text-muted-foreground">Only members with allowed roles can see this</p>
            </div>
            <div className={`w-8 h-4.5 rounded-full relative transition-colors ${isPrivate ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${isPrivate ? "start-[17px]" : "start-0.5"}`} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("leave")}</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("addChannel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main hub page ──────────────────────────────────────────────────────────────

export default function CommunityHub() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { user } = useAuth() as any;
  const { activeRoom } = useVoice();

  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);
  const [voicePresence, setVoicePresence] = useState<VoicePresenceMap>({});

  const { data: community, isLoading, error } = useQuery<Community>({
    queryKey: ["community-slug", slug],
    queryFn: () => customFetch(`/api/communities/${slug}`),
    enabled: !!slug && isAuthenticated,
  });

  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  useEffect(() => {
    if (community && !activeChannelId) {
      const first = community.channels.find((c) => c.type === "text");
      if (first) setActiveChannelId(first.id);
    }
  }, [community, activeChannelId]);

  // Auto-navigate to voice channel in sidebar when user joins one
  useEffect(() => {
    if (activeRoom?.kind === "community" && community && activeRoom.communityId === community.id) {
      setActiveChannelId(activeRoom.channelId);
    }
  }, [activeRoom, community?.id]);

  // Fetch initial voice presence snapshot when community loads
  useEffect(() => {
    if (!community?.id) return;
    customFetch<VoicePresenceMap>(`/api/communities/${community.id}/voice-presence`)
      .then((data) => setVoicePresence(data))
      .catch(() => {});
  }, [community?.id]);

  // Listen to real-time voice join/leave events
  useEffect(() => {
    if (!community?.id) return;
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg.communityId !== community.id) return;
      const key = String(msg.channelId);
      if (msg.action === "join") {
        const newUser: VoicePresenceUser = {
          userId: msg.userId,
          username: msg.username ?? "",
          displayName: msg.displayName ?? "",
          avatarUrl: msg.avatarUrl ?? null,
        };
        setVoicePresence((prev) => ({
          ...prev,
          [key]: [
            ...(prev[key] ?? []).filter((p) => p.userId !== msg.userId),
            newUser,
          ],
        }));
      } else if (msg.action === "leave") {
        setVoicePresence((prev) => {
          const updated = (prev[key] ?? []).filter((p) => p.userId !== msg.userId);
          const next = { ...prev };
          if (updated.length > 0) next[key] = updated;
          else delete next[key];
          return next;
        });
      } else if (msg.action === "camera") {
        setVoicePresence((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).map((p) =>
            p.userId === msg.userId ? { ...p, cameraEnabled: msg.cameraEnabled } : p,
          ),
        }));
      } else if (msg.action === "screenshare") {
        setVoicePresence((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).map((p) =>
            p.userId === msg.userId ? { ...p, screenShareEnabled: msg.screenShareEnabled } : p,
          ),
        }));
      }
    };
    window.addEventListener("gwh:community-voice-update", handler);
    return () => window.removeEventListener("gwh:community-voice-update", handler);
  }, [community?.id]);

  const joinMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/join`, { method: "POST" }),
    onSuccess: () => { toast({ title: t("joined") }); qc.invalidateQueries({ queryKey: ["community-slug", slug] }); qc.invalidateQueries({ queryKey: ["communities-mine"] }); },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/leave`, { method: "POST" }),
    onSuccess: () => { toast({ title: t("deleted") }); qc.invalidateQueries({ queryKey: ["communities-mine"] }); navigate("/communities"); },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const boostMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/boost`, { method: "POST" }),
    onSuccess: (data: any) => { toast({ title: t("boosted") + (data?.boostLevel ? ` · Level ${data.boostLevel}` : "") }); qc.invalidateQueries({ queryKey: ["community-slug", slug] }); },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <Hash className="w-10 h-10 text-muted-foreground/40" />
        <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">Community not found</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/communities")}>← Back</Button>
      </div>
    );
  }

  const myUserId = user?.id ?? 0;
  const activeChannel = community.channels.find((c) => c.id === activeChannelId) ?? null;

  // Gate: invite-only communities show a join gate for non-members
  if (!community.isMember && !community.isOwner) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Banner */}
        {community.bannerKey && (
          <div className="h-32 overflow-hidden">
            <img src={community.bannerKey} alt={community.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="border-b border-border px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/communities")}>←</Button>
          <h1 className="font-bold text-lg text-foreground">{community.name}</h1>
          {community.boostLevel > 0 && (
            <span className="text-[10px] font-mono text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" /> Level {community.boostLevel}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl font-bold">
            {community.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-bold text-xl">{community.name}</h2>
            {community.description && <p className="text-sm text-muted-foreground mt-1 max-w-xs">{community.description}</p>}
            <p className="text-xs text-muted-foreground mt-2">{community.memberCount.toLocaleString()} {t("members")}</p>
          </div>
          {community.privacy === "invite_only" ? (
            <p className="text-sm text-muted-foreground">{t("privateNote")}</p>
          ) : (
            <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
              {joinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("join")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Channel sidebar */}
      <ChannelSidebar
        community={community}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
        onAddChannel={() => setAddChannelOpen(true)}
        onLeave={() => leaveMutation.mutate()}
        onBoost={() => boostMutation.mutate()}
        onBannerEdit={() => setBannerOpen(true)}
        onInvite={() => setInviteOpen(true)}
        onSettings={() => setServerSettingsOpen(true)}
        onChannelSettings={(ch) => setChannelSettingsChannel(ch)}
        boostPending={boostMutation.isPending}
        voicePresence={voicePresence}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Banner (full-width in main area) */}
        {community.bannerKey && (
          <div className="relative h-24 overflow-hidden flex-shrink-0">
            <img src={community.bannerKey} alt={community.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
          </div>
        )}

        {/* Channel header */}
        <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate("/communities")} className="text-muted-foreground hover:text-foreground me-1 text-sm">←</button>
          {activeChannel ? (
            <>
              <ChannelIcon channel={activeChannel} size={4} className="text-muted-foreground" />
              <span className="font-semibold text-sm">{activeChannel.name}</span>
              {activeChannel.isPrivate && <Lock className="w-3 h-3 text-muted-foreground/60 ms-0.5" />}
            </>
          ) : (
            <span className="text-muted-foreground text-sm">{t("channels")}</span>
          )}
          <div className="ms-auto flex items-center gap-1">
            <button
              onClick={() => setShowMembers((v) => !v)}
              className={`p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${showMembers ? "text-foreground bg-muted" : ""}`}
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel content */}
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <p>{t("channels")}</p>
          </div>
        ) : (activeChannel.type === "text" || activeChannel.type === "announcement") ? (
          <TextChannelPanel
            communityId={community.id}
            channel={activeChannel}
            isOwner={community.isOwner}
            canMod={community.isMod ?? community.isOwner}
            myUserId={myUserId}
          />
        ) : activeChannel.type === "stage" ? (
          <StageChannelPanel
            communityId={community.id}
            channel={activeChannel}
            participants={voicePresence[String(activeChannel.id)] ?? []}
            isOwner={community.isMod ?? community.isOwner}
            myUserId={myUserId}
          />
        ) : (
          <CommunityVoiceStage
            channel={activeChannel}
            communityId={community.id}
            communityName={community.name}
            participants={voicePresence[String(activeChannel.id)] ?? []}
            isMember={community.isMember || community.isOwner}
            textChannels={community.channels.filter(c => c.type === "text")}
            myUserId={myUserId}
            isOwner={community.isMod ?? community.isOwner}
          />
        )}
      </div>

      {/* Members / Leaderboard panel */}
      {showMembers && (
        <MembersPanel communityId={community.id} ownerId={community.ownerId} isOwner={community.isOwner} />
      )}

      {/* Dialogs */}
      <AddChannelDialog communityId={community.id} open={addChannelOpen} onClose={() => setAddChannelOpen(false)} />
      <InviteDialog communityId={community.id} isOwnerOrMod={community.isMod ?? community.isOwner} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {community.isOwner && <BannerDialog communityId={community.id} open={bannerOpen} onClose={() => setBannerOpen(false)} />}
      {community.isOwner && (
        <ServerSettingsDialog community={community} open={serverSettingsOpen} onClose={() => setServerSettingsOpen(false)} />
      )}
      {channelSettingsChannel && (community.isMod ?? community.isOwner) && (
        <ChannelSettingsDialog
          communityId={community.id}
          channel={channelSettingsChannel}
          open={!!channelSettingsChannel}
          onClose={() => setChannelSettingsChannel(null)}
        />
      )}
    </div>
  );
}
