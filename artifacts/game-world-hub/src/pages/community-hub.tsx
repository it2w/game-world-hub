import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useVoice } from "@/voice/voice-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Hash,
  Volume2,
  Settings,
  Users,
  Plus,
  Send,
  MoreVertical,
  Trash2,
  Zap,
  LogOut,
  Crown,
  UserMinus,
  Ban,
  ChevronDown,
  ChevronRight,
  Mic,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Community {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  gameTag: string | null;
  privacy: "public" | "invite_only";
  boostLevel: number;
  memberCount: number;
  iconKey: string | null;
  ownerId: number;
  isMember: boolean;
  isOwner: boolean;
  channels: Channel[];
}

interface Channel {
  id: number;
  name: string;
  type: "text" | "voice";
  position: number;
  slowmodeSeconds: number;
}

interface Message {
  id: number;
  channelId: number;
  content: string;
  createdAt: string;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Member {
  memberId: number;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  canDelete,
  onDelete,
}: {
  msg: Message;
  canDelete: boolean;
  onDelete: (id: number) => void;
}) {
  const initials = msg.displayName.slice(0, 2).toUpperCase();
  const colorHues = [240, 270, 300, 180, 210, 330];
  const hue = colorHues[msg.userId % colorHues.length];

  return (
    <div className="flex items-start gap-3 px-4 py-1.5 hover:bg-muted/30 group rounded">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
        style={{ background: `hsl(${hue} 70% 40%)` }}
      >
        {msg.avatarUrl ? (
          <img src={msg.avatarUrl} alt={msg.displayName} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{msg.displayName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="text-sm text-foreground/90 break-words">{msg.content}</p>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(msg.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Text channel panel ────────────────────────────────────────────────────────

function TextChannelPanel({
  communityId,
  channel,
  isOwner,
  myUserId,
}: {
  communityId: number;
  channel: Channel;
  isOwner: boolean;
  myUserId: number;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["community-messages", communityId, channel.id],
    queryFn: () => customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages`),
    refetchInterval: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-messages", communityId, channel.id] });
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: number) =>
      customFetch(`/api/communities/${communityId}/channels/${channel.id}/messages/${msgId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-messages", communityId, channel.id] });
    },
  });

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content) return;
    setText("");
    sendMutation.mutate(content);
  }, [text, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
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
              canDelete={isOwner || msg.userId === myUserId}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border focus-within:border-primary/50 transition-colors">
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={t("typeMessage", { channel: channel.name })}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={4000}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Voice channel row ─────────────────────────────────────────────────────────

function VoiceChannelRow({
  channel,
  communityId,
  communityName,
  isMember,
}: {
  channel: Channel;
  communityId: number;
  communityName: string;
  isMember: boolean;
}) {
  const { t } = useTranslation("communities");
  const { activeRoom, joinCommunityVoice, leaveVoice } = useVoice();
  const { toast } = useToast();

  const isActive = activeRoom?.kind === "community" && activeRoom.channelId === channel.id;

  const handleClick = useCallback(async () => {
    if (!isMember) {
      toast({ title: t("notMember"), variant: "destructive" });
      return;
    }
    if (isActive) {
      leaveVoice();
      return;
    }
    try {
      await joinCommunityVoice(communityId, channel.id, `${communityName} › #${channel.name}`);
    } catch {
      toast({ title: t("error"), variant: "destructive" });
    }
  }, [isMember, isActive, joinCommunityVoice, leaveVoice, communityId, channel, communityName, t, toast]);

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-start hover:bg-muted/50 transition-colors group ${isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Volume2 className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 truncate">{channel.name}</span>
      {isActive ? (
        <span className="text-[10px] font-mono text-primary">{t("inVoice")}</span>
      ) : (
        <Mic className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

// ── Channel list (left sidebar) ───────────────────────────────────────────────

function ChannelSidebar({
  community,
  activeChannelId,
  onSelectChannel,
  onAddChannel,
  onLeave,
  onBoost,
  boostPending,
}: {
  community: Community;
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
  onAddChannel: () => void;
  onLeave: () => void;
  onBoost: () => void;
  boostPending: boolean;
}) {
  const { t } = useTranslation("communities");
  const textChannels = community.channels.filter((c) => c.type === "text");
  const voiceChannels = community.channels.filter((c) => c.type === "voice");

  return (
    <div className="w-56 border-e border-border flex flex-col bg-card/50 flex-shrink-0">
      {/* Community header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="font-bold text-foreground text-sm truncate">{community.name}</div>
        {community.boostLevel > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Zap className="w-2.5 h-2.5 text-yellow-400" />
            <span className="text-[10px] font-mono text-yellow-400">
              {t("level", { level: community.boostLevel })}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          <Users className="w-2.5 h-2.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{community.memberCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-3">
        {/* Text channels */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{t("channels")}</span>
            {community.isOwner && (
              <button onClick={onAddChannel} className="text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
          {textChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-start hover:bg-muted/50 transition-colors ${activeChannelId === ch.id ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Hash className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>

        {/* Voice channels */}
        {voiceChannels.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{t("voiceChannel")}</span>
            </div>
            {voiceChannels.map((ch) => (
              <VoiceChannelRow
                key={ch.id}
                channel={ch}
                communityId={community.id}
                communityName={community.name}
                isMember={community.isMember}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
          onClick={onBoost}
          disabled={boostPending}
        >
          <Zap className="w-3.5 h-3.5 me-1.5" />
          {t("boost")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onLeave}
        >
          <LogOut className="w-3.5 h-3.5 me-1.5" />
          {t("leave")}
        </Button>
      </div>
    </div>
  );
}

// ── Members panel ─────────────────────────────────────────────────────────────

function MembersPanel({
  communityId,
  ownerId,
  isOwner,
}: {
  communityId: number;
  ownerId: number;
  isOwner: boolean;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["community-members", communityId],
    queryFn: () => customFetch(`/api/communities/${communityId}/members?limit=100`),
    refetchInterval: 30000,
  });

  const kickMutation = useMutation({
    mutationFn: (userId: number) =>
      customFetch(`/api/communities/${communityId}/kick/${userId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-members", communityId] });
      toast({ title: t("kick") + " ✓" });
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: (userId: number) =>
      customFetch(`/api/communities/${communityId}/ban/${userId}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-members", communityId] });
      toast({ title: t("ban") + " ✓" });
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  return (
    <div className="w-48 border-s border-border flex flex-col flex-shrink-0 bg-card/50">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {t("members")} · {members.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 group">
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                ) : (
                  m.displayName.charAt(0).toUpperCase()
                )}
              </div>
            </div>
            <span className="text-xs truncate flex-1 text-foreground/80">{m.displayName}</span>
            {m.userId === ownerId && (
              <Crown className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />
            )}
            {isOwner && m.userId !== ownerId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5">
                    <MoreVertical className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="left" align="start">
                  <DropdownMenuItem
                    onClick={() => kickMutation.mutate(m.userId)}
                    className="text-destructive"
                  >
                    <UserMinus className="w-3 h-3 me-2" />
                    {t("kick")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => banMutation.mutate(m.userId)}
                    className="text-destructive"
                  >
                    <Ban className="w-3 h-3 me-2" />
                    {t("ban")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Add channel dialog ────────────────────────────────────────────────────────

function AddChannelDialog({
  communityId,
  open,
  onClose,
}: {
  communityId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/communities/${communityId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type }),
      }),
    onSuccess: () => {
      toast({ title: t("addChannel") + " ✓" });
      qc.invalidateQueries({ queryKey: ["community", communityId] });
      qc.invalidateQueries({ queryKey: ["community-slug"] });
      setName("");
      onClose();
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest">{t("addChannel")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("channelName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("channelName")}
              maxLength={100}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setType("text")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${type === "text" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
            >
              <Hash className="w-4 h-4" /> {t("text")}
            </button>
            <button
              onClick={() => setType("voice")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${type === "voice" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
            >
              <Volume2 className="w-4 h-4" /> {t("voice")}
            </button>
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

// ── Main hub page ─────────────────────────────────────────────────────────────

export default function CommunityHub() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { user } = useAuth() as any;
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  const { data: community, isLoading, error } = useQuery<Community>({
    queryKey: ["community-slug", slug],
    queryFn: () => customFetch(`/api/communities/${slug}`),
    enabled: !!slug && isAuthenticated,
  });

  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  // Auto-select first text channel
  useEffect(() => {
    if (community && !activeChannelId) {
      const first = community.channels.find((c) => c.type === "text");
      if (first) setActiveChannelId(first.id);
    }
  }, [community, activeChannelId]);

  const joinMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/join`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("joined") });
      qc.invalidateQueries({ queryKey: ["community-slug", slug] });
      qc.invalidateQueries({ queryKey: ["communities-mine"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/leave`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: t("deleted") });
      qc.invalidateQueries({ queryKey: ["communities-mine"] });
      navigate("/communities");
    },
    onError: (e: any) => toast({ title: e?.message ?? t("error"), variant: "destructive" }),
  });

  const boostMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community!.id}/boost`, { method: "POST" }),
    onSuccess: (data: any) => {
      toast({ title: t("boosted") + (data?.boostLevel ? ` · Level ${data.boostLevel}` : "") });
      qc.invalidateQueries({ queryKey: ["community-slug", slug] });
    },
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
        {/* Header */}
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
            <p className="text-xs text-muted-foreground mt-2">{community.memberCount.toLocaleString()} members</p>
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
        boostPending={boostMutation.isPending}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={() => navigate("/communities")} className="text-muted-foreground hover:text-foreground me-1 text-sm">←</button>
          {activeChannel ? (
            <>
              {activeChannel.type === "text" ? (
                <Hash className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="font-semibold text-sm">{activeChannel.name}</span>
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
        {activeChannel?.type === "text" ? (
          <TextChannelPanel
            communityId={community.id}
            channel={activeChannel}
            isOwner={community.isOwner}
            myUserId={myUserId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {activeChannel ? (
              <div className="text-center space-y-2">
                <Volume2 className="w-8 h-8 mx-auto opacity-30" />
                <p>{t("voiceChannel")}</p>
                <p className="text-xs">Use the sidebar to join #{activeChannel.name}</p>
              </div>
            ) : (
              <p>{t("channels")}</p>
            )}
          </div>
        )}
      </div>

      {/* Members panel */}
      {showMembers && (
        <MembersPanel
          communityId={community.id}
          ownerId={community.ownerId}
          isOwner={community.isOwner}
        />
      )}

      {/* Dialogs */}
      <AddChannelDialog
        communityId={community.id}
        open={addChannelOpen}
        onClose={() => setAddChannelOpen(false)}
      />
    </div>
  );
}
