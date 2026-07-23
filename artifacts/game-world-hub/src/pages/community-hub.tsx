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
  Image, X, Copy, Check, ChevronDown, ChevronRight, Video, Monitor,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Community {
  id: number; slug: string; name: string; description: string | null;
  gameTag: string | null; privacy: "public" | "invite_only";
  boostLevel: number; memberCount: number; iconKey: string | null;
  bannerKey: string | null; ownerId: number; isMember: boolean; isOwner: boolean;
  channels: Channel[];
}

interface Channel {
  id: number; name: string; type: "text" | "voice"; position: number; slowmodeSeconds: number;
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

function MessageRow({ msg, canDelete, canPin, onDelete, onPin }: {
  msg: Message; canDelete: boolean; canPin: boolean;
  onDelete: (id: number) => void; onPin: (id: number) => void;
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-1.5 hover:bg-muted/30 group rounded ${msg.isPinned ? "border-s-2 border-primary/40" : ""}`}>
      <Avatar name={msg.displayName} url={msg.avatarUrl} size={8} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{msg.displayName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {msg.isPinned && <Pin className="w-2.5 h-2.5 text-primary/60" />}
        </div>
        <p className="text-sm text-foreground/90 break-words">{msg.content}</p>
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!content) return;
    setText("");
    sendMutation.mutate(content);
  }, [text, sendMutation]);

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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            maxLength={4000}
          />
          <button onClick={handleSend} disabled={!text.trim() || sendMutation.isPending} className="text-primary disabled:text-muted-foreground">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Voice channel row ──────────────────────────────────────────────────────────

function VoiceChannelRow({ channel, communityId, communityName, isMember, participants }: {
  channel: Channel; communityId: number; communityName: string; isMember: boolean;
  participants: VoicePresenceUser[];
}) {
  const { t } = useTranslation("communities");
  const { activeRoom, joinCommunityVoice, leaveVoice } = useVoice();
  const { toast } = useToast();
  const isActive = activeRoom?.kind === "community" && activeRoom.channelId === channel.id;

  const handleClick = useCallback(async () => {
    if (!isMember) { toast({ title: t("notMember"), variant: "destructive" }); return; }
    if (isActive) { leaveVoice(); return; }
    try { await joinCommunityVoice(communityId, channel.id, `${communityName} › #${channel.name}`); }
    catch { toast({ title: t("error"), variant: "destructive" }); }
  }, [isMember, isActive, joinCommunityVoice, leaveVoice, communityId, channel, communityName, t, toast]);

  return (
    <div className="mb-0.5">
      {/* Channel row */}
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-start hover:bg-muted/50 transition-colors group ${isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
      >
        <Volume2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 truncate">{channel.name}</span>
        {participants.length > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">{participants.length}</span>
        )}
        {isActive
          ? <span className="text-[10px] font-mono text-primary">{t("inVoice")}</span>
          : <Mic className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      {/* Discord-style participant list */}
      {participants.length > 0 && (
        <div className="ms-4 mt-0.5 space-y-px">
          {participants.map((p) => (
            <div key={p.userId} className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-muted-foreground">
              {/* Mini avatar */}
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold overflow-hidden"
                style={{ background: p.avatarUrl ? "transparent" : `hsl(${Math.abs(p.displayName.charCodeAt(0) * 17) % 360},60%,35%)` }}
              >
                {p.avatarUrl
                  ? <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                  : p.displayName.charAt(0).toUpperCase()
                }
              </div>
              <Mic className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />
              <span className="truncate flex-1">{p.displayName}</span>
              {p.cameraEnabled && (
                <Video className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />
              )}
              {p.screenShareEnabled && (
                <Monitor className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
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

function ChannelSidebar({ community, activeChannelId, onSelectChannel, onAddChannel, onLeave, onBoost, onBannerEdit, onInvite, boostPending, voicePresence }: {
  community: Community; activeChannelId: number | null;
  onSelectChannel: (id: number) => void; onAddChannel: () => void;
  onLeave: () => void; onBoost: () => void; onBannerEdit: () => void; onInvite: () => void;
  boostPending: boolean; voicePresence: VoicePresenceMap;
}) {
  const { t } = useTranslation("communities");
  const textChannels = community.channels.filter((c) => c.type === "text");
  const voiceChannels = community.channels.filter((c) => c.type === "voice");
  const isOwnerOrMod = community.isOwner;

  return (
    <div className="w-56 border-e border-border flex flex-col bg-card/50 flex-shrink-0">
      {/* Banner */}
      {community.bannerKey && (
        <div className="relative h-20 overflow-hidden flex-shrink-0">
          <img src={community.bannerKey} alt={community.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/80" />
          {community.isOwner && (
            <button onClick={onBannerEdit} className="absolute top-1 end-1 bg-black/40 hover:bg-black/60 rounded p-1 text-white/80 transition-colors">
              <Image className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Community header */}
      <div className={`px-3 py-3 border-b border-border ${!community.bannerKey ? "" : ""}`}>
        <div className="flex items-center gap-2">
          {!community.bannerKey && community.isOwner && (
            <button onClick={onBannerEdit} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors" title={t("uploadBanner")}>
              <Image className="w-3 h-3" />
            </button>
          )}
          <div className="font-bold text-foreground text-sm truncate flex-1">{community.name}</div>
        </div>
        {community.boostLevel > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <Zap className="w-2.5 h-2.5 text-yellow-400" />
            <span className="text-[10px] font-mono text-yellow-400">{t("level", { level: community.boostLevel })}</span>
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
                participants={voicePresence[String(ch.id)] ?? []}
              />
            ))}
          </div>
        )}

        {/* Polls */}
        <PollsSection communityId={community.id} isOwnerOrMod={isOwnerOrMod} />
      </div>

      {/* Footer actions */}
      <div className="border-t border-border p-2 space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-primary/80 hover:text-primary hover:bg-primary/10" onClick={onInvite}>
          <Link2 className="w-3.5 h-3.5 me-1.5" />
          {t("inviteLinks")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10" onClick={onBoost} disabled={boostPending}>
          <Zap className="w-3.5 h-3.5 me-1.5" />
          {t("boost")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onLeave}>
          <LogOut className="w-3.5 h-3.5 me-1.5" />
          {t("leave")}
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

  const rankColors = ["text-yellow-400", "text-zinc-300", "text-amber-600"];
  const rankEmojis = ["🥇", "🥈", "🥉"];

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
          members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 group">
              <Avatar name={m.displayName} url={m.avatarUrl} size={6} />
              <span className="text-xs truncate flex-1 text-foreground/80">{m.displayName}</span>
              {m.userId === ownerId && <Crown className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
              {isOwner && m.userId !== ownerId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5">
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="left" align="start">
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
          ))
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

// ── Add channel dialog ─────────────────────────────────────────────────────────

function AddChannelDialog({ communityId, open, onClose }: { communityId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">("text");

  const create = useMutation({
    mutationFn: () =>
      customFetch(`/api/communities/${communityId}/channels`, {
        method: "POST", body: JSON.stringify({ name: name.trim(), type }),
      }),
    onSuccess: () => {
      toast({ title: t("addChannel") + " ✓" });
      qc.invalidateQueries({ queryKey: ["community-slug"] });
      setName(""); onClose();
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("channelName")} maxLength={100} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setType("text")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${type === "text" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              <Hash className="w-4 h-4" /> {t("text")}
            </button>
            <button onClick={() => setType("voice")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded border text-sm transition-colors ${type === "voice" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
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

// ── Main hub page ──────────────────────────────────────────────────────────────

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
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
              {activeChannel.type === "text" ? <Hash className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-muted-foreground" />}
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
            canMod={community.isOwner}
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
            ) : <p>{t("channels")}</p>}
          </div>
        )}
      </div>

      {/* Members / Leaderboard panel */}
      {showMembers && (
        <MembersPanel communityId={community.id} ownerId={community.ownerId} isOwner={community.isOwner} />
      )}

      {/* Dialogs */}
      <AddChannelDialog communityId={community.id} open={addChannelOpen} onClose={() => setAddChannelOpen(false)} />
      <InviteDialog communityId={community.id} isOwnerOrMod={community.isOwner} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {community.isOwner && <BannerDialog communityId={community.id} open={bannerOpen} onClose={() => setBannerOpen(false)} />}
    </div>
  );
}
