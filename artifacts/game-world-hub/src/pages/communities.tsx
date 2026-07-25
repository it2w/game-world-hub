import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { customFetch, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { Globe, Lock, Plus, Users, Zap, Search, Hash, ExternalLink, Copy, UserPlus, Settings2, LogOut } from "lucide-react";

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
  bannerKey: string | null;
  ownerId: number;
  themeColor?: string | null;
  badgeFrame?: string | null;
}

const BADGE_FRAME_STYLES: Record<string, React.CSSProperties> = {
  circle:  { borderRadius: "50%", border: "3px solid currentColor" },
  rounded: { borderRadius: "12px", border: "3px solid currentColor" },
  ring:    { borderRadius: "50%", outline: "3px solid currentColor", outlineOffset: "2px" },
  glow:    { borderRadius: "50%", boxShadow: "0 0 0 3px currentColor, 0 0 12px 2px currentColor" },
  shield:  { borderRadius: "50% 50% 40% 40% / 50% 50% 60% 60%", border: "3px solid currentColor" },
  diamond: { transform: "rotate(45deg)", border: "3px solid currentColor" },
  hexagon: { clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)" },
};

function BadgeFramedIcon({ community }: { community: Community }) {
  const accent = community.themeColor ?? "#6366f1";
  const frameStyle = community.badgeFrame && community.badgeFrame !== "none"
    ? BADGE_FRAME_STYLES[community.badgeFrame] ?? {}
    : {};
  const isRotated = community.badgeFrame === "diamond";

  return (
    <div
      className="w-11 h-11 flex items-center justify-center text-primary font-bold text-base flex-shrink-0 overflow-hidden transition-all"
      style={{
        ...frameStyle,
        color: accent,
        background: community.iconKey ? undefined : `${accent}1a`,
        border: frameStyle.border as string | undefined,
      }}
    >
      {community.iconKey ? (
        <img
          src={community.iconKey}
          alt={community.name}
          className="w-full h-full object-cover"
          style={isRotated ? { transform: "rotate(-45deg)" } : {}}
        />
      ) : (
        <span style={isRotated ? { transform: "rotate(-45deg)", display: "block" } : {}}>
          {community.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function CommunityCard({
  community,
  currentUserId,
  isMember,
}: {
  community: Community;
  currentUserId: number | null;
  isMember: boolean;
}) {
  const { t } = useTranslation("communities");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isOwner = currentUserId === community.ownerId;

  const leaveMutation = useMutation({
    mutationFn: () => customFetch(`/api/communities/${community.id}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communities-mine"] });
      qc.invalidateQueries({ queryKey: ["communities"] });
      toast({ title: t("leave") + " ✓" });
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      customFetch<{ code: string }>(`/api/communities/${community.id}/member-invite`, { method: "POST" }),
    onSuccess: (data) => {
      const url = `${window.location.origin}/join/${data.code}`;
      navigator.clipboard.writeText(url).then(() => toast({ title: t("inviteCopied") })).catch(() => {});
    },
    onError: () => toast({ title: t("error"), variant: "destructive" }),
  });

  const copyLink = () => {
    const url = `${window.location.origin}/communities/${community.slug}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: t("inviteCopied") })).catch(() => {});
  };

  const cardContent = (
    <div
      className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-all cursor-pointer group"
      onClick={() => navigate(`/communities/${community.slug}`)}
    >
      {/* Banner image */}
      {community.bannerKey ? (
        <div className="h-20 overflow-hidden">
          <img src={community.bannerKey} alt={community.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className="h-1.5 bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30 group-hover:from-primary/60 group-hover:via-primary group-hover:to-primary/60 transition-all duration-300" />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon with optional badge frame */}
          <BadgeFramedIcon community={community} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground truncate">{community.name}</span>
              {community.boostLevel > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-mono text-yellow-400 border border-yellow-400/30 px-1 rounded">
                  <Zap className="w-2.5 h-2.5" />
                  {t("level", { level: community.boostLevel })}
                </span>
              )}
              {community.privacy === "invite_only" && (
                <Lock className="w-3 h-3 text-muted-foreground" />
              )}
            </div>

            {community.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{community.description}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {community.memberCount.toLocaleString()}
              </span>
              {community.gameTag && (
                <span className="text-xs font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                  {community.gameTag}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Community name header */}
        <ContextMenuLabel className="text-xs font-semibold truncate">{community.name}</ContextMenuLabel>
        <ContextMenuSeparator />

        {/* Navigation */}
        <ContextMenuItem onClick={() => navigate(`/communities/${community.slug}`)}>
          <ExternalLink className="w-3.5 h-3.5 me-2 text-muted-foreground" />
          {t("open")}
        </ContextMenuItem>
        <ContextMenuItem onClick={copyLink}>
          <Copy className="w-3.5 h-3.5 me-2 text-muted-foreground" />
          {t("copyLink")}
        </ContextMenuItem>

        {/* Member actions */}
        {isMember && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => inviteMutation.mutate()}>
              <UserPlus className="w-3.5 h-3.5 me-2 text-muted-foreground" />
              {t("invite")}
            </ContextMenuItem>
            {isOwner && (
              <ContextMenuItem onClick={() => navigate(`/communities/${community.slug}?settings=1`)}>
                <Settings2 className="w-3.5 h-3.5 me-2 text-muted-foreground" />
                {t("settings")}
              </ContextMenuItem>
            )}
          </>
        )}

        {/* Leave (members only, not owner) */}
        {isMember && !isOwner && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => leaveMutation.mutate()}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="w-3.5 h-3.5 me-2" />
              {t("leave")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("communities");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gameTag, setGameTag] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "invite_only">("public");

  const create = useMutation({
    mutationFn: () =>
      customFetch<Community>("/api/communities", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, gameTag: gameTag.trim() || undefined, privacy }),
      }),
    onSuccess: (community) => {
      toast({ title: t("created") });
      qc.invalidateQueries({ queryKey: ["communities"] });
      qc.invalidateQueries({ queryKey: ["communities-mine"] });
      onClose();
      navigate(`/communities/${community.slug}`);
    },
    onError: (e: any) => {
      toast({ title: e?.message ?? t("error"), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-widest">{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("createDesc")}</p>

        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>{t("communityName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("communityNamePlaceholder")}
              maxLength={100}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("gameTag")}</Label>
            <Input
              value={gameTag}
              onChange={(e) => setGameTag(e.target.value)}
              placeholder={t("gameTagPlaceholder")}
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("privacy")}</Label>
            <Select value={privacy} onValueChange={(v: any) => setPrivacy(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <span className="flex items-center gap-2">
                    <Globe className="w-3 h-3" /> {t("public")}
                  </span>
                </SelectItem>
                <SelectItem value="invite_only">
                  <span className="flex items-center gap-2">
                    <Lock className="w-3 h-3" /> {t("inviteOnly")}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("leave", { ns: "communities" })}</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "…" : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunitiesPage() {
  const { t } = useTranslation("communities");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const currentUserId: number | null = (me as { id?: number } | undefined)?.id ?? null;

  const { data: all = [], isLoading: loadingAll } = useQuery<Community[]>({
    queryKey: ["communities", search],
    queryFn: () => customFetch(`/api/communities?search=${encodeURIComponent(search)}&limit=50`),
    enabled: tab === "discover",
  });

  // Always fetch "mine" so we know membership state even on the discover tab
  const { data: mine = [], isLoading: loadingMine } = useQuery<Community[]>({
    queryKey: ["communities-mine"],
    queryFn: () => customFetch("/api/communities/mine"),
  });

  const memberIds = new Set(mine.map((c) => c.id));

  const list = tab === "mine" ? mine : all;
  const loading = tab === "mine" ? loadingMine : loadingAll;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-primary">{t("title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 me-1" />
            {t("create")}
          </Button>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="border-b border-border px-6 py-2 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
          <button
            onClick={() => setTab("discover")}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-colors ${tab === "discover" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("discoverLabel")}
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-colors ${tab === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("myCommunitiesLabel")}
          </button>
        </div>

        {tab === "discover" && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="ps-9 h-8 text-sm"
            />
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <Hash className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
              {t("noCommunitiesTitle")}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">{t("noCommunitiesDesc")}</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 me-1" />
              {t("create")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                currentUserId={currentUserId}
                isMember={memberIds.has(c.id) || c.ownerId === currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
