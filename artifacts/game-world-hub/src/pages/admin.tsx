import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
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
} from "@workspace/api-client-react";
import { ProBadge } from "@/components/pro-badge";

export default function Admin() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" /> {t("title")}
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-none bg-card border border-border p-0 h-auto">
          <TabsTrigger value="users" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-3.5 h-3.5 me-2" /> {t("tabs.users")}
          </TabsTrigger>
          <TabsTrigger value="codes" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ticket className="w-3.5 h-3.5 me-2" /> {t("tabs.codes")}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="rounded-none font-mono text-xs uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="w-3.5 h-3.5 me-2" /> {t("tabs.subscriptions")}
          </TabsTrigger>
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
      </Tabs>
    </div>
  );
}

function UsersPanel() {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading } = useListAdminUsers({
    q: debouncedSearch || undefined,
    limit: 50,
    offset: 0,
  });

  const activate = useAdminActivatePro();
  const deactivate = useAdminDeactivatePro();
  const promote = useAdminPromoteUser();

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
                    {u.isPro ? <ProBadge size="sm" /> : <span className="text-muted-foreground text-sm">-</span>}
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
                    <div className="flex items-center justify-end gap-2">
                      {u.isPro ? (
                        <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onDeactivate(u.id)}>
                          <Crown className="w-3 h-3 me-1" /> {t("users.deactivatePro")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onActivate(u.id)}>
                          <Crown className="w-3 h-3 me-1" /> {t("users.activatePro")}
                        </Button>
                      )}
                      {!u.isAdmin && (
                        <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-7" onClick={() => onPromote(u.id)}>
                          <UserCog className="w-3 h-3 me-1" /> {t("users.makeAdmin")}
                        </Button>
                      )}
                    </div>
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
