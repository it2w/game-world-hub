import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Users,
  Ticket,
  Crown,
  Search,
  Plus,
  Trash2,
  UserCog,
  CreditCard,
  Copy,
  Check,
  Ban,
  CheckCircle,
  TrendingUp,
  Loader2,
  MessageSquareX,
  ChevronDown,
  ChevronUp,
  Star,
  Zap,
  ShieldAlert,
  Save,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  useListAdminUsers,
  useAdminActivatePro,
  useAdminDeactivatePro,
  useAdminPromoteUser,
  useListActivationCodes,
  useCreateActivationCode,
  useDisableActivationCode,
  useListAdminProSubscriptions,
  getListAdminUsersQueryKey,
  getListActivationCodesQueryKey,
  getListAdminProSubscriptionsQueryKey,
  getGetMeQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { ProBadge } from "@/components/pro-badge";

interface AdminMe {
  id: number;
  username: string;
  permissions: {
    can_manage_pro: boolean;
    can_suspend_users: boolean;
    can_delete_content: boolean;
    can_view_reports: boolean;
    can_manage_codes: boolean;
    can_broadcast: boolean;
    can_view_analytics: boolean;
    can_manage_admins: boolean;
  };
}

interface AnalyticsData {
  range: number;
  newUsers: { date: string; count: number }[];
  dau: { date: string; count: number }[];
  lfgPosts: { date: string; count: number }[];
  proActivations: { date: string; count: number }[];
  summary: { peakDau: number; proConvRate: number };
}

export default function Admin() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    customFetch<AdminMe>("/api/admin/me")
      .then(setAdminMe)
      .catch((err: unknown) => {
        const apiErr = err as { status?: number; data?: { error?: string } | null };
        if (apiErr?.status === 403 && apiErr?.data?.error === "suspended") {
          setIsSuspended(true);
        }
      });
  }, []);

  const canViewAnalytics = adminMe?.permissions.can_view_analytics ?? false;
  const canViewReports   = adminMe?.permissions.can_view_reports   ?? false;
  const canManagePro     = adminMe?.permissions.can_manage_pro     ?? false;

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
        <div className="max-w-sm w-full border border-destructive/40 bg-destructive/5 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
            <span className="text-destructive text-2xl">⊘</span>
          </div>
          <h2 className="font-mono font-bold text-lg uppercase tracking-widest text-destructive">
            {t("suspended")}
          </h2>
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            {t("suspendedDesc")}
          </p>
          <button
            className="font-mono rounded-none text-xs border border-border bg-background px-4 py-2 hover:bg-muted transition-colors"
            onClick={logout}
          >
            {t("suspendedLogout")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" /> {t("title")}
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-none bg-card border border-border p-0 h-auto flex-wrap">
          <TabsTrigger value="users" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-3.5 h-3.5 me-2" /> {t("tabs.users")}
          </TabsTrigger>
          <TabsTrigger value="codes" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ticket className="w-3.5 h-3.5 me-2" /> {t("tabs.codes")}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="w-3.5 h-3.5 me-2" /> {t("tabs.subscriptions")}
          </TabsTrigger>
          {canViewAnalytics && (
            <TabsTrigger value="analytics" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <TrendingUp className="w-3.5 h-3.5 me-2" /> {t("tabs.analytics")}
            </TabsTrigger>
          )}
          {canViewReports && (
            <TabsTrigger value="chatDeletions" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquareX className="w-3.5 h-3.5 me-2" /> {t("tabs.chatDeletions")}
            </TabsTrigger>
          )}
          {canManagePro && (
            <TabsTrigger value="xpEvents" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Zap className="w-3.5 h-3.5 me-2" /> {t("tabs.xpEvents")}
            </TabsTrigger>
          )}
          {canViewReports && (
            <TabsTrigger value="automod" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShieldAlert className="w-3.5 h-3.5 me-2" /> {t("tabs.automod")}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="codes" className="mt-6">
          <CodesPanel />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionsPanel />
        </TabsContent>
        {canViewAnalytics && (
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsPanel />
          </TabsContent>
        )}
        {canViewReports && (
          <TabsContent value="chatDeletions" className="mt-6">
            <ChatDeletionsPanel />
          </TabsContent>
        )}
        {canManagePro && (
          <TabsContent value="xpEvents" className="mt-6">
            <XpEventsPanel />
          </TabsContent>
        )}
        {canViewReports && (
          <TabsContent value="automod" className="mt-6">
            <AutoModPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─── Vouches panel ────────────────────────────────────────────────────────────

interface Vouch {
  id: number;
  tag: string;
  createdAt: string;
  giver: { id: number; username: string; displayName: string };
}

const TAG_EMOJI: Record<string, string> = {
  clutch: "🎯",
  team_player: "🤝",
  chill: "😎",
  leader: "👑",
  toxic: "☠️",
};

function UserVouchesPanel({ userId }: { userId: number }) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const [vouches, setVouches] = useState<Vouch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await customFetch<{ items: Vouch[] }>(`/api/admin/users/${userId}/vouches`);
      setVouches(result.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onRemove = async (vouchId: number) => {
    if (!window.confirm(t("vouches.confirmRemove"))) return;
    setRemoving(vouchId);
    try {
      await customFetch(`/api/admin/users/${userId}/vouches/${vouchId}`, { method: "DELETE" });
      toast({ title: t("toasts.vouchRemoved") });
      setVouches(prev => prev.filter(v => v.id !== vouchId));
    } catch {
      toast({ title: t("toasts.vouchRemoveFailed"), variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 font-mono text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3 px-4 font-mono text-xs text-destructive">
        {t("vouches.loadError")}
      </div>
    );
  }

  if (vouches.length === 0) {
    return (
      <div className="py-3 px-4 font-mono text-xs text-muted-foreground">
        {t("vouches.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="font-mono text-[10px] uppercase ps-4">{t("vouches.giver")}</TableHead>
            <TableHead className="font-mono text-[10px] uppercase">{t("vouches.tag")}</TableHead>
            <TableHead className="font-mono text-[10px] uppercase">{t("vouches.date")}</TableHead>
            <TableHead className="font-mono text-[10px] uppercase text-end pe-4">{t("users.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vouches.map(v => (
            <TableRow key={v.id} className="border-border">
              <TableCell className="ps-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold">{v.giver.displayName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">@{v.giver.username}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">
                  {TAG_EMOJI[v.tag] ?? "🏷️"} {v.tag}
                </span>
              </TableCell>
              <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(v.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-end pe-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none font-mono text-xs h-7 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  disabled={removing === v.id}
                  onClick={() => onRemove(v.id)}
                >
                  {removing === v.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <><Trash2 className="w-3 h-3 me-1" />{t("vouches.remove")}</>
                  }
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Users panel ──────────────────────────────────────────────────────────────

function UsersPanel() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedVouches, setExpandedVouches] = useState<number | null>(null);

  const { data, isLoading } = useListAdminUsers({
    q: debouncedSearch || undefined,
    limit: 50,
    offset: 0,
  });

  const activate = useAdminActivatePro();
  const deactivate = useAdminDeactivatePro();
  const promote = useAdminPromoteUser();
  const [suspendingId, setSuspendingId] = useState<number | null>(null);

  const toggleVouches = (userId: number) =>
    setExpandedVouches(prev => (prev === userId ? null : userId));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search.trim());
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminProSubscriptionsQueryKey() });
  };

  const onActivate = (userId: number) => {
    activate.mutate({ userId, data: { durationDays: 30 } }, {
      onSuccess: () => {
        toast({ title: t("toasts.proActivated") });
        refresh();
      },
      onError: () => toast({ title: t("toasts.proActivateFailed"), variant: "destructive" }),
    });
  };

  const onDeactivate = (userId: number) => {
    deactivate.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: t("toasts.proDeactivated") });
        refresh();
      },
      onError: () => toast({ title: t("toasts.proDeactivateFailed"), variant: "destructive" }),
    });
  };

  const onPromote = (userId: number) => {
    promote.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: t("toasts.adminPromoted") });
        refresh();
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => toast({ title: t("toasts.adminPromoteFailed"), variant: "destructive" }),
    });
  };

  const onSuspend = async (userId: number, isSuspended: boolean) => {
    setSuspendingId(userId);
    try {
      await customFetch(`/api/admin/users/${userId}/suspend`, {
        method: isSuspended ? "DELETE" : "POST",
      });
      toast({ title: isSuspended ? t("toasts.unsuspended") : t("toasts.suspended") });
      refresh();
    } catch {
      toast({ title: t("toasts.suspendFailed"), variant: "destructive" });
    } finally {
      setSuspendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("users.search")}
          className="font-mono rounded-none border-border bg-background max-w-md"
        />
        <Button type="submit" variant="outline" className="rounded-none font-mono">
          <Search className="w-4 h-4 me-2" /> {t("users.searchButton")}
        </Button>
      </form>

      <div className="border border-border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono text-xs uppercase">{t("users.user")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("users.status")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("users.tier")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("users.pro")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("users.admin")}</TableHead>
              <TableHead className="font-mono text-xs uppercase text-end">{t("users.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="font-mono text-sm text-center">{t("loading")}</TableCell></TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="font-mono text-sm text-center text-muted-foreground">{t("users.empty")}</TableCell></TableRow>
            ) : (
              data?.items.map((u) => (
                <>
                  <TableRow key={u.id} className="border-border">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.displayName} className="w-8 h-8 rounded-sm object-cover border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center border border-border font-mono text-xs">
                            {u.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{u.displayName}</span>
                          <span className="font-mono text-xs text-muted-foreground">@{u.username}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.status}</TableCell>
                    <TableCell className="font-mono text-xs">{u.tier ?? "-"}</TableCell>
                    <TableCell>
                      {u.isPro ? <ProBadge size="icon" /> : <span className="text-muted-foreground text-sm">-</span>}
                    </TableCell>
                    <TableCell>
                      {u.isAdmin ? (
                        <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase border-primary text-primary">
                          {t("users.adminYes")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className={`rounded-none font-mono text-xs h-7 ${expandedVouches === u.id ? "border-primary/50 text-primary" : ""}`}
                          onClick={() => toggleVouches(u.id)}
                        >
                          <Star className="w-3 h-3 me-1" />
                          {t("vouches.title")}
                          {expandedVouches === u.id
                            ? <ChevronUp className="w-3 h-3 ms-1" />
                            : <ChevronDown className="w-3 h-3 ms-1" />}
                        </Button>
                        {u.isPro ? (
                          <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onDeactivate(u.id)}>
                            <Crown className="w-3 h-3 me-1" /> {t("users.deactivatePro")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onActivate(u.id)}>
                            <Crown className="w-3 h-3 me-1" /> {t("users.activatePro")}
                          </Button>
                        )}
                        {(u.status as string) === "suspended" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-none font-mono text-xs h-7 border-green-500/50 text-green-400 hover:bg-green-500/10"
                            disabled={suspendingId === u.id}
                            onClick={() => onSuspend(u.id, true)}
                          >
                            <CheckCircle className="w-3 h-3 me-1" /> {t("users.unsuspend")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-none font-mono text-xs h-7 border-red-500/50 text-red-400 hover:bg-red-500/10"
                            disabled={suspendingId === u.id}
                            onClick={() => onSuspend(u.id, false)}
                          >
                            <Ban className="w-3 h-3 me-1" /> {t("users.suspend")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedVouches === u.id && (
                    <TableRow key={`vouches-${u.id}`} className="border-border bg-muted/20">
                      <TableCell colSpan={6} className="p-0">
                        <div className="border-t border-border/50">
                          <div className="px-4 py-2 font-mono text-[10px] uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                            <Star className="w-3 h-3" /> {t("vouches.title")} — @{u.username}
                          </div>
                          <UserVouchesPanel userId={u.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CodesPanel() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [maxUses, setMaxUses] = useState(1);
  const [copied, setCopied] = useState<number | null>(null);

  const { data, isLoading } = useListActivationCodes();
  const create = useCreateActivationCode();
  const disable = useDisableActivationCode();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListActivationCodesQueryKey() });

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { code: code || undefined, durationDays, maxUses } }, {
      onSuccess: (resp) => {
        toast({ title: t("toasts.codeCreated") });
        setCode("");
        refresh();
        navigator.clipboard.writeText(resp.code);
        setCopied(resp.id);
        setTimeout(() => setCopied(null), 2000);
      },
      onError: () => toast({ title: t("toasts.codeCreateFailed"), variant: "destructive" }),
    });
  };

  const onDisable = (codeId: number) => {
    disable.mutate({ codeId }, {
      onSuccess: () => {
        toast({ title: t("toasts.codeDisabled") });
        refresh();
      },
      onError: () => toast({ title: t("toasts.codeDisableFailed"), variant: "destructive" }),
    });
  };

  const copyCode = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="bg-card border border-border p-6 space-y-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t("codes.createTitle")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-mono text-xs text-muted-foreground block mb-1.5">{t("codes.codeLabel")}</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("codes.codePlaceholder")} className="font-mono rounded-none border-border bg-background" />
          </div>
          <div>
            <label className="font-mono text-xs text-muted-foreground block mb-1.5">{t("codes.durationDays")}</label>
            <Input type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} className="font-mono rounded-none border-border bg-background" />
          </div>
          <div>
            <label className="font-mono text-xs text-muted-foreground block mb-1.5">{t("codes.maxUses")}</label>
            <Input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className="font-mono rounded-none border-border bg-background" />
          </div>
        </div>
        <Button type="submit" className="rounded-none font-mono" disabled={create.isPending}>
          {t("codes.createButton")}
        </Button>
      </form>

      <div className="border border-border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono text-xs uppercase">{t("codes.code")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("codes.status")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("codes.duration")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("codes.uses")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("codes.expires")}</TableHead>
              <TableHead className="font-mono text-xs uppercase text-end">{t("codes.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="font-mono text-sm text-center">{t("loading")}</TableCell></TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="font-mono text-sm text-center text-muted-foreground">{t("codes.empty")}</TableCell></TableRow>
            ) : (
              data?.items.map((c) => (
                <TableRow key={c.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tracking-wider">{c.code}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyCode(c.code, c.id)}>
                        {copied === c.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "outline"} className="rounded-none font-mono text-[10px] uppercase">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.durationDays} {t("codes.days")}</TableCell>
                  <TableCell className="font-mono text-xs">{c.usedCount}/{c.maxUses}</TableCell>
                  <TableCell className="font-mono text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-end">
                    {c.status === "active" && (
                      <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onDisable(c.id)}>
                        <Trash2 className="w-3 h-3 me-1" /> {t("codes.disable")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SubscriptionsPanel() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useListAdminProSubscriptions();

  return (
    <div className="border border-border bg-card overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="font-mono text-xs uppercase">{t("subs.user")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.orderId")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.provider")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.status")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.amount")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.started")}</TableHead>
            <TableHead className="font-mono text-xs uppercase">{t("subs.expires")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="font-mono text-sm text-center">{t("loading")}</TableCell></TableRow>
          ) : data?.items.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="font-mono text-sm text-center text-muted-foreground">{t("subs.empty")}</TableCell></TableRow>
          ) : (
            data?.items.map((s) => (
              <TableRow key={s.id} className="border-border">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{s.displayName || "-"}</span>
                    <span className="font-mono text-xs text-muted-foreground">@{s.username || "-"}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.orderId}</TableCell>
                <TableCell className="font-mono text-xs uppercase">{s.provider}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "outline"} className="rounded-none font-mono text-[10px] uppercase">
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.amount && s.currency ? `${s.amount} ${s.currency}` : "-"}</TableCell>
                <TableCell className="font-mono text-xs">{s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "-"}</TableCell>
                <TableCell className="font-mono text-xs">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface ChatDeletion {
  id: number;
  messageId: number;
  originalContent: string;
  deletedAt: string;
  deletedBy: { id: number; username: string; displayName: string };
  originalAuthor: { id: number; username: string | null; displayName: string | null };
}

function ChatDeletionsPanel() {
  const { t } = useTranslation("admin");
  const [items, setItems] = useState<ChatDeletion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // Filter state
  const [moderatorId, setModeratorId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  // Applied filters (committed on submit)
  const [appliedFilters, setAppliedFilters] = useState({ moderatorId: "", since: "", until: "" });

  const load = useCallback(async (off: number, filters: typeof appliedFilters) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (filters.moderatorId) params.set("deletedBy", filters.moderatorId);
      if (filters.since)       params.set("since",     filters.since);
      if (filters.until)       params.set("until",     filters.until);
      const result = await customFetch<{ total: number; limit: number; offset: number; items: ChatDeletion[] }>(
        `/api/admin/chat-deletions?${params.toString()}`,
      );
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(offset, appliedFilters); }, [offset, appliedFilters, load]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setAppliedFilters({ moderatorId, since, until });
  };

  const handleClear = () => {
    setModeratorId("");
    setSince("");
    setUntil("");
    setOffset(0);
    setAppliedFilters({ moderatorId: "", since: "", until: "" });
  };

  const hasFilters = appliedFilters.moderatorId || appliedFilters.since || appliedFilters.until;

  if (error) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-6 text-center font-mono text-sm text-destructive">
        {t("chatDeletions.loadError")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <form onSubmit={handleFilter} className="bg-card border border-border p-4 space-y-3">
        <p className="font-mono text-[10px] uppercase text-muted-foreground tracking-widest">
          {t("chatDeletions.filterTitle")}
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-muted-foreground uppercase">
              {t("chatDeletions.filterModeratorId")}
            </label>
            <Input
              value={moderatorId}
              onChange={(e) => setModeratorId(e.target.value)}
              placeholder={t("chatDeletions.filterModeratorPlaceholder")}
              className="font-mono rounded-none border-border bg-background h-8 text-xs w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-muted-foreground uppercase">
              {t("chatDeletions.filterSince")}
            </label>
            <Input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="font-mono rounded-none border-border bg-background h-8 text-xs w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-muted-foreground uppercase">
              {t("chatDeletions.filterUntil")}
            </label>
            <Input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="font-mono rounded-none border-border bg-background h-8 text-xs w-36"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="outline" className="rounded-none font-mono text-xs h-8">
              <Search className="w-3 h-3 me-1.5" />{t("chatDeletions.filterApply")}
            </Button>
            {hasFilters && (
              <Button type="button" size="sm" variant="ghost" className="rounded-none font-mono text-xs h-8 text-muted-foreground" onClick={handleClear}>
                {t("chatDeletions.filterClear")}
              </Button>
            )}
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground uppercase">
          {total} {t("chatDeletions.totalLabel")}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-none font-mono text-xs h-7"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-none font-mono text-xs h-7"
            disabled={offset + LIMIT >= total || loading}
            onClick={() => setOffset(offset + LIMIT)}
          >
            →
          </Button>
        </div>
      </div>

      <div className="border border-border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono text-xs uppercase w-20">{t("chatDeletions.messageId")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("chatDeletions.originalAuthor")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("chatDeletions.content")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("chatDeletions.deletedBy")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("chatDeletions.deletedAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="font-mono text-sm text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline me-2" />{t("loading")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="font-mono text-sm text-center text-muted-foreground">
                  {t("chatDeletions.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((d) => (
                <TableRow key={d.id} className="border-border align-top">
                  <TableCell className="font-mono text-xs text-muted-foreground">#{d.messageId}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-xs">{d.originalAuthor.displayName ?? "-"}</span>
                      {d.originalAuthor.username && (
                        <span className="font-mono text-[10px] text-muted-foreground">@{d.originalAuthor.username}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-xs line-clamp-3 break-words">{d.originalContent}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-xs">{d.deletedBy.displayName}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">@{d.deletedBy.username}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(d.deletedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── XP Events Panel ───────────────────────────────────────────────────────────

interface XpEvent {
  id: number;
  label: string;
  multiplier: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

function XpEventsPanel() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const [events, setEvents] = useState<XpEvent[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [label, setLabel] = useState("");
  const [multiplier, setMultiplier] = useState("2");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [endingId, setEndingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await customFetch<{ items: XpEvent[] }>("/api/admin/battle-pass/xp-events");
      setEvents(data.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await customFetch("/api/admin/battle-pass/xp-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, multiplier: Number(multiplier), startsAt, endsAt }),
      });
      toast({ title: t("toasts.xpEventCreated") });
      setLabel(""); setMultiplier("2"); setStartsAt(""); setEndsAt("");
      await load();
    } catch {
      toast({ title: t("toasts.xpEventCreateFailed"), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (id: number) => {
    setEndingId(id);
    try {
      await customFetch(`/api/admin/battle-pass/xp-events/${id}`, { method: "DELETE" });
      toast({ title: t("toasts.xpEventEnded") });
      await load();
    } catch {
      toast({ title: t("toasts.xpEventEndFailed"), variant: "destructive" });
    } finally {
      setEndingId(null);
    }
  };

  const now = Date.now();
  const getStatus = (ev: XpEvent) => {
    const start = new Date(ev.startsAt).getTime();
    const end   = new Date(ev.endsAt).getTime();
    if (now >= start && now < end) return "active";
    if (now < start)              return "scheduled";
    return "ended";
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="border border-border p-4 space-y-3">
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> {t("xpEvents.createTitle")}
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1 lg:col-span-1">
            <label className="font-mono text-xs text-muted-foreground uppercase">{t("xpEvents.labelLabel")}</label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={t("xpEvents.labelPlaceholder")}
              required
              className="font-mono text-sm rounded-none"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground uppercase">{t("xpEvents.multiplierLabel")}</label>
            <Input
              type="number"
              step="0.25"
              min="1"
              max="10"
              value={multiplier}
              onChange={e => setMultiplier(e.target.value)}
              placeholder={t("xpEvents.multiplierPlaceholder")}
              required
              className="font-mono text-sm rounded-none"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground uppercase">{t("xpEvents.startsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
              required
              className="font-mono text-sm rounded-none"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-xs text-muted-foreground uppercase">{t("xpEvents.endsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              required
              className="font-mono text-sm rounded-none"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={creating} className="rounded-none font-mono text-xs uppercase w-full">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 me-1" />}
              {t("xpEvents.createButton")}
            </Button>
          </div>
        </form>
      </div>

      {/* Events table */}
      {loadError ? (
        <p className="font-mono text-xs text-destructive">{t("xpEvents.loadError")}</p>
      ) : events.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">{t("xpEvents.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.label")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.multiplier")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.starts")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.ends")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.status")}</TableHead>
              <TableHead className="font-mono text-xs uppercase">{t("xpEvents.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map(ev => {
              const status = getStatus(ev);
              return (
                <TableRow key={ev.id}>
                  <TableCell className="font-mono text-sm">{ev.label}</TableCell>
                  <TableCell className="font-mono text-sm font-bold text-primary">{ev.multiplier}×</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(ev.startsAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(ev.endsAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={status === "active" ? "default" : "secondary"}
                      className="font-mono text-xs rounded-none"
                    >
                      {status === "active" && <Zap className="w-3 h-3 me-1" />}
                      {t(`xpEvents.${status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {status !== "ended" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-none font-mono text-xs uppercase"
                        disabled={endingId === ev.id}
                        onClick={() => handleEnd(ev.id)}
                      >
                        {endingId === ev.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3 me-1" />
                        }
                        {t("xpEvents.end")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function AnalyticsPanel() {
  const { t } = useTranslation("admin");
  const [range, setRange] = useState<30 | 90>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (r: number) => {
    setLoading(true);
    setError(false);
    try {
      const result = await customFetch<AnalyticsData>(`/api/admin/analytics?range=${r}`);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const CHARTS: { key: keyof Pick<AnalyticsData, "newUsers" | "dau" | "lfgPosts" | "proActivations">; label: string; color: string }[] = [
    { key: "newUsers",       label: t("analytics.newUsers"),       color: "#4ade80" },
    { key: "dau",            label: t("analytics.dau"),            color: "#60a5fa" },
    { key: "lfgPosts",       label: t("analytics.lfgPosts"),       color: "#a78bfa" },
    { key: "proActivations", label: t("analytics.proActivations"), color: "#facc15" },
  ];

  const Skel = () => <div className="h-36 bg-border/30 animate-pulse" />;

  if (error) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-6 text-center font-mono text-sm text-destructive">
        {t("analytics.loadError")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center gap-1.5">
        {([30, 90] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
              range === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border/80"
            }`}
          >
            {r}d
          </button>
        ))}
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ms-2" />}
      </div>

      {/* Summary row */}
      {data && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: t("analytics.peakDau"),    value: data.summary.peakDau },
            { label: t("analytics.proConvRate"), value: `${data.summary.proConvRate}%` },
            { label: t("analytics.totalLfg"),    value: data.lfgPosts.reduce((s, r) => s + r.count, 0) },
          ].map(({ label, value }) => (
            <div key={label} className="border border-border bg-background px-3 py-2">
              <div className="font-mono text-[10px] text-muted-foreground uppercase">{label}</div>
              <div className="font-mono text-xl font-bold">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CHARTS.map(({ key, label, color }) => (
          <div key={key} className="border border-border bg-card p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
            {loading ? (
              <Skel />
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={data?.[key] ?? []} margin={{ top: 2, right: 2, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`ag-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fontFamily: "monospace" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 9, fontFamily: "monospace" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 11,
                      fontFamily: "monospace",
                      borderRadius: 0,
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#ag-${key})`}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AutoMod Panel ────────────────────────────────────────────────────────────

interface AutomodRuleData {
  slowmodeSeconds: number;
  maxLength: number;
  denylist: string[];
  enabled: boolean;
}

function AutoModPanel() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const [rule, setRule] = useState<AutomodRuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local form state
  const [enabled, setEnabled] = useState(false);
  const [slowmode, setSlowmode] = useState(0);
  const [maxLength, setMaxLength] = useState(2000);
  const [denylistText, setDenylistText] = useState(""); // one word per line

  useEffect(() => {
    customFetch<AutomodRuleData>("/api/admin/automod")
      .then((data) => {
        setRule(data);
        setEnabled(data.enabled);
        setSlowmode(data.slowmodeSeconds);
        setMaxLength(data.maxLength);
        setDenylistText(data.denylist.join("\n"));
      })
      .catch(() => {
        toast({ title: t("automod.loadError"), variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const words = denylistText
        .split(/\n+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      await customFetch("/api/admin/automod", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, slowmodeSeconds: slowmode, maxLength, denylist: words }),
      });
      toast({ title: t("toasts.automodSaved") });
    } catch {
      toast({ title: t("toasts.automodSaveFailed"), variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-mono">{t("automod.loading")}</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-mono text-lg font-bold uppercase tracking-widest flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" /> {t("automod.title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{t("automod.subtitle")}</p>
      </div>

      {/* Enabled toggle */}
      <div className="border border-border rounded-lg p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold font-mono">{t("automod.enabled")}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("automod.enabledDesc")}</div>
          </div>
          <button
            onClick={() => setEnabled((e) => !e)}
            className={`relative w-10 h-5 rounded-full transition-colors border ${enabled ? "bg-primary border-primary" : "bg-muted border-border"}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "start-5" : "start-0.5"}`}
            />
          </button>
        </div>
      </div>

      {/* Slowmode */}
      <div className="border border-border rounded-lg p-4 space-y-2">
        <label className="text-sm font-semibold font-mono">{t("automod.slowmode")}</label>
        <p className="text-xs text-muted-foreground">{t("automod.slowmodeDesc")}</p>
        <Input
          type="number"
          min={0}
          max={600}
          value={slowmode}
          onChange={(e) => setSlowmode(Math.max(0, Math.min(600, parseInt(e.target.value) || 0)))}
          className="font-mono w-32"
        />
      </div>

      {/* Max length */}
      <div className="border border-border rounded-lg p-4 space-y-2">
        <label className="text-sm font-semibold font-mono">{t("automod.maxLength")}</label>
        <p className="text-xs text-muted-foreground">{t("automod.maxLengthDesc")}</p>
        <Input
          type="number"
          min={1}
          max={4000}
          value={maxLength}
          onChange={(e) => setMaxLength(Math.max(1, Math.min(4000, parseInt(e.target.value) || 2000)))}
          className="font-mono w-32"
        />
      </div>

      {/* Denylist */}
      <div className="border border-border rounded-lg p-4 space-y-2">
        <label className="text-sm font-semibold font-mono">{t("automod.denylist")}</label>
        <p className="text-xs text-muted-foreground">{t("automod.denylistDesc")}</p>
        <textarea
          value={denylistText}
          onChange={(e) => setDenylistText(e.target.value)}
          placeholder={t("automod.denylistPlaceholder")}
          rows={8}
          className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-primary/50 transition-colors resize-y placeholder:text-muted-foreground"
        />
        <div className="text-[10px] text-muted-foreground font-mono">
          {denylistText.split(/\n+/).filter(w => w.trim()).length} / 200 entries
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 font-mono">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? t("automod.saving") : t("automod.save")}
      </Button>
    </div>
  );
}
