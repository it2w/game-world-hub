import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Mail, KeyRound, LogOut, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, Users, BarChart3,
  Tag, CreditCard, Settings, Copy, Ban, Crown,
  CheckCircle2, XCircle, RefreshCw, Plus, Search,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface OwnerSession { token: string; username: string; ownerId: number }
interface OwnerInfo    { id: number; username: string; email: string | null; emailVerified: boolean }

interface Stats {
  totalUsers: number; proUsers: number; adminUsers: number;
  activeCodes: number; totalSubscriptions: number;
}

interface UserRow {
  id: number; username: string; displayName: string; email: string | null;
  isPro: boolean; proExpiresAt: string | null; isAdmin: boolean;
  status: string; createdAt: string;
}

interface CodeRow {
  id: number; code: string; status: "active" | "inactive" | "expired";
  durationDays: number; maxUses: number; usedCount: number;
  expiresAt: string | null; createdAt: string;
}

interface SubRow {
  id: number; userId: number; username: string | null; displayName: string | null;
  orderId: string; provider: string; status: string;
  amount: string | null; currency: string | null;
  startedAt: string | null; expiresAt: string | null; createdAt: string | null;
}

type Tab = "stats" | "users" | "codes" | "subs" | "account";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getStoredSession(): OwnerSession | null {
  try { const r = localStorage.getItem("gwh_owner_session"); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

async function ownerFetch<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...opts,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

/* ─── Root ───────────────────────────────────────────────────────────────── */

export default function Owner() {
  const { t } = useTranslation("owner");
  const { toast } = useToast();

  const [session,   setSession]   = useState<OwnerSession | null>(getStoredSession);
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [loading,   setLoading]   = useState(!!getStoredSession());
  const [mode,      setMode]      = useState<"login" | "reset" | "dashboard">(
    getStoredSession() ? "dashboard" : "login",
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem("gwh_owner_session");
    setSession(null); setOwnerInfo(null); setMode("login");
  }, []);

  const loadMe = useCallback(async (tok: string) => {
    try {
      const data = await ownerFetch<OwnerInfo>("owner/me", tok);
      setOwnerInfo(data); setMode("dashboard");
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (err.message?.includes("401") || err.message?.toLowerCase().includes("not found") || err.message?.toLowerCase().includes("expired")) {
        handleLogout();
      }
      // other errors (network) — stay on current view
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (session) { loadMe(session.token); }
    else { setLoading(false); }
  }, [session, loadMe]);

  const handleLogin = (s: OwnerSession) => {
    localStorage.setItem("gwh_owner_session", JSON.stringify(s));
    setSession(s); setLoading(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 md:p-8">
      <div className={`w-full ${mode === "dashboard" ? "max-w-4xl" : "max-w-md"} border border-primary/30 bg-card shadow-2xl`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-mono text-sm font-bold uppercase tracking-widest">{t("title")}</span>
          </div>
          {mode === "dashboard" && session && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground hidden sm:block">
                {t("loggedInAs")} <span className="text-primary">{session.username}</span>
              </span>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 px-2" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="p-6">
          {mode === "login" && (
            <LoginForm onLogin={handleLogin} onReset={() => setMode("reset")} t={t} toast={toast} />
          )}
          {mode === "reset" && (
            <ResetForm onBack={() => setMode("login")} t={t} toast={toast} />
          )}
          {mode === "dashboard" && session && ownerInfo && (
            <Dashboard session={session} ownerInfo={ownerInfo} onRefreshMe={() => loadMe(session.token)} t={t} toast={toast} />
          )}
        </div>

        <div className="px-6 pb-4 text-center font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          {t("hiddenWarning")}
        </div>
      </div>
    </div>
  );
}

/* ─── Login ──────────────────────────────────────────────────────────────── */

function LoginForm({ onLogin, onReset, t, toast }: {
  onLogin: (s: OwnerSession) => void; onReset: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const data = await ownerFetch<{ token: string; owner: { id: number; username: string } }>(
        "owner/login", "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password }) }
      );
      onLogin({ token: data.token, username: data.owner.username, ownerId: data.owner.id });
      toast({ title: t("loginSuccess") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="font-mono text-xs uppercase block mb-1.5">{t("username")}</label>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="font-mono rounded-none" />
      </div>
      <div>
        <label className="font-mono text-xs uppercase block mb-1.5">{t("password")}</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="font-mono rounded-none" />
      </div>
      <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
        {loading && <Loader2 className="w-4 h-4 me-2 animate-spin" />} {t("login")}
      </Button>
      <Button type="button" variant="ghost" className="w-full rounded-none font-mono text-xs" onClick={onReset}>
        {t("forgotPassword")}
      </Button>
    </form>
  );
}

/* ─── Reset ──────────────────────────────────────────────────────────────── */

function ResetForm({ onBack, t, toast }: {
  onBack: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [username,    setUsername]    = useState("");
  const [code,        setCode]        = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step,        setStep]        = useState<"request" | "confirm">("request");
  const [loading,     setLoading]     = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await ownerFetch("owner/reset-password-request", "", { method: "POST", body: JSON.stringify({ username: username.trim() }) });
      setStep("confirm"); toast({ title: t("codeSent") });
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await ownerFetch("owner/reset-password", "", { method: "POST", body: JSON.stringify({ username: username.trim(), code, newPassword }) });
      toast({ title: t("resetSuccess") }); onBack();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      {step === "request" ? (
        <form onSubmit={requestReset} className="space-y-4">
          <p className="font-mono text-xs text-muted-foreground">{t("resetDesc")}</p>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("username")} className="font-mono rounded-none" />
          <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
            <Mail className="w-4 h-4 me-2" /> {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-3">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("resetCode")} className="font-mono rounded-none" />
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("newPassword")} autoComplete="new-password" className="font-mono rounded-none" />
          <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
            <KeyRound className="w-4 h-4 me-2" /> {t("resetPassword")}
          </Button>
        </form>
      )}
      <Button type="button" variant="ghost" className="w-full rounded-none font-mono text-xs" onClick={onBack}>{t("backToLogin")}</Button>
    </div>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

const TABS: { id: Tab; icon: React.ReactNode; key: string }[] = [
  { id: "stats",   icon: <BarChart3 className="w-4 h-4" />, key: "tabs.stats"   },
  { id: "users",   icon: <Users     className="w-4 h-4" />, key: "tabs.users"   },
  { id: "codes",   icon: <Tag       className="w-4 h-4" />, key: "tabs.codes"   },
  { id: "subs",    icon: <CreditCard className="w-4 h-4" />, key: "tabs.subs"  },
  { id: "account", icon: <Settings  className="w-4 h-4" />, key: "tabs.account" },
];

function Dashboard({ session, ownerInfo, onRefreshMe, t, toast }: {
  session: OwnerSession; ownerInfo: OwnerInfo;
  onRefreshMe: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [tab, setTab] = useState<Tab>("stats");

  return (
    <div className="space-y-4">
      {/* No-email warning */}
      {!ownerInfo.email && (
        <div className="flex items-center gap-2 text-yellow-500 border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[11px] uppercase">{t("noEmailWarning")}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map(({ id, icon, key }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-mono text-xs uppercase whitespace-nowrap border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {icon} {t(key)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "stats"   && <StatsTab   session={session} t={t} />}
      {tab === "users"   && <UsersTab   session={session} t={t} toast={toast} />}
      {tab === "codes"   && <CodesTab   session={session} t={t} toast={toast} />}
      {tab === "subs"    && <SubsTab    session={session} t={t} />}
      {tab === "account" && <AccountTab session={session} ownerInfo={ownerInfo} onRefreshMe={onRefreshMe} t={t} toast={toast} />}
    </div>
  );
}

/* ─── Stats Tab ──────────────────────────────────────────────────────────── */

function StatsTab({ session, t }: { session: OwnerSession; t: (k: string) => string }) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await ownerFetch<Stats>("owner/stats", session.token)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const cards = [
    { label: t("stats.totalUsers"), value: stats?.totalUsers, icon: <Users    className="w-5 h-5 text-blue-400"   /> },
    { label: t("stats.proUsers"),   value: stats?.proUsers,   icon: <Crown    className="w-5 h-5 text-yellow-400" /> },
    { label: t("stats.admins"),     value: stats?.adminUsers, icon: <Shield   className="w-5 h-5 text-purple-400" /> },
    { label: t("stats.activeCodes"),value: stats?.activeCodes,icon: <Tag      className="w-5 h-5 text-green-400"  /> },
    { label: t("stats.totalSubs"),  value: stats?.totalSubscriptions, icon: <CreditCard className="w-5 h-5 text-pink-400" /> },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" variant="ghost" onClick={load} className="h-7 px-2 font-mono text-xs">
          <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(({ label, value, icon }) => (
          <div key={label} className="border border-border bg-background p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">{icon}<span className="font-mono text-xs text-muted-foreground uppercase">{label}</span></div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (value ?? "—")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Users Tab ──────────────────────────────────────────────────────────── */

function UsersTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [query,   setQuery]   = useState("");
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [loading, setLoading] = useState(false);
  const [acting,  setActing]  = useState<number | null>(null);
  const [proDays, setProDays] = useState<Record<number, string>>({});
  const LIMIT = 20;

  const load = useCallback(async (q: string, off: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (q) params.set("q", q);
      const data = await ownerFetch<{ total: number; items: UserRow[] }>(`owner/users?${params}`, session.token);
      setTotal(data.total);
      setUsers((prev) => append ? [...prev, ...data.items] : data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { setOffset(0); load(query, 0); }, [query, load]);

  const togglePro = async (u: UserRow) => {
    setActing(u.id);
    try {
      if (u.isPro) {
        await ownerFetch(`owner/users/${u.id}/pro`, session.token, { method: "DELETE" });
        toast({ title: t("users.proDeactivated") });
      } else {
        const days = Number(proDays[u.id]) || 30;
        await ownerFetch(`owner/users/${u.id}/pro`, session.token, { method: "POST", body: JSON.stringify({ durationDays: days }) });
        toast({ title: t("users.proActivated") });
      }
      await load(query, 0);
      setOffset(0);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const toggleAdmin = async (u: UserRow) => {
    setActing(u.id);
    try {
      await ownerFetch(`owner/users/${u.id}/admin`, session.token, { method: "POST", body: JSON.stringify({ isAdmin: !u.isAdmin }) });
      toast({ title: t("users.adminSet") });
      await load(query, 0); setOffset(0);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(query, next, true); };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("users.search")}
          className="font-mono rounded-none ps-9 text-sm"
        />
      </div>

      {users.length === 0 && !loading ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("users.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="border border-border bg-background p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-mono text-sm font-semibold flex items-center gap-2">
                    {u.displayName || u.username}
                    {u.isPro   && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">PRO</Badge>}
                    {u.isAdmin && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-purple-500/60 text-purple-400">ADMIN</Badge>}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">@{u.username} {u.email ? `· ${u.email}` : ""}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{t("users.joined")}: {fmtDate(u.createdAt)}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Pro toggle */}
                  {!u.isPro && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1} max={3650}
                        value={proDays[u.id] ?? "30"}
                        onChange={(e) => setProDays((p) => ({ ...p, [u.id]: e.target.value }))}
                        className="w-16 h-7 text-xs font-mono rounded-none px-2"
                        title={t("users.durationDays")}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">{t("users.durationDays")}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={u.isPro ? "destructive" : "outline"}
                    className="h-7 px-2 font-mono text-xs rounded-none"
                    onClick={() => togglePro(u)}
                    disabled={acting === u.id}
                  >
                    {acting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : u.isPro ? <XCircle className="w-3 h-3 me-1" /> : <Crown className="w-3 h-3 me-1" />}
                    {u.isPro ? t("users.deactivatePro") : t("users.activatePro")}
                  </Button>
                  <Button
                    size="sm"
                    variant={u.isAdmin ? "destructive" : "secondary"}
                    className="h-7 px-2 font-mono text-xs rounded-none"
                    onClick={() => toggleAdmin(u)}
                    disabled={acting === u.id}
                  >
                    {u.isAdmin ? t("users.removeAdmin") : t("users.makeAdmin")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>}
          {!loading && users.length < total && (
            <Button variant="outline" className="w-full rounded-none font-mono text-xs" onClick={loadMore}>
              {t("users.loadMore")} ({users.length}/{total})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Codes Tab ──────────────────────────────────────────────────────────── */

function CodesTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [codes,       setCodes]       = useState<CodeRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [customCode,  setCustomCode]  = useState("");
  const [duration,    setDuration]    = useState("30");
  const [maxUses,     setMaxUses]     = useState("1");
  const [expiresAt,   setExpiresAt]   = useState("");
  const [creating,    setCreating]    = useState(false);
  const [disabling,   setDisabling]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCodes((await ownerFetch<{ items: CodeRow[] }>("owner/activation-codes", session.token)).items); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      await ownerFetch("owner/activation-codes", session.token, {
        method: "POST",
        body: JSON.stringify({
          code: customCode.trim() || undefined,
          durationDays: Number(duration) || 30,
          maxUses: Number(maxUses) || 1,
          expiresAt: expiresAt || undefined,
        }),
      });
      toast({ title: t("codes.created") });
      setCustomCode(""); setDuration("30"); setMaxUses("1"); setExpiresAt("");
      setShowCreate(false);
      await load();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const disableCode = async (id: number) => {
    setDisabling(id);
    try {
      await ownerFetch(`owner/activation-codes/${id}`, session.token, { method: "DELETE" });
      toast({ title: t("codes.disabled") });
      await load();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setDisabling(null); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: t("codes.copied") });
  };

  const statusBadge = (s: CodeRow["status"]) => {
    if (s === "active")   return <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500/60  text-green-400">{t("codes.active")}</Badge>;
    if (s === "inactive") return <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-500/60    text-red-400">{t("codes.inactive")}</Badge>;
    return                       <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">{t("codes.expired")}</Badge>;
  };

  return (
    <div className="space-y-3">
      {/* Create toggle */}
      <div className="flex justify-between items-center">
        <Button size="sm" variant="outline" className="rounded-none font-mono text-xs h-8" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-3.5 h-3.5 me-1.5" /> {t("codes.create")}
          {showCreate ? <ChevronUp className="w-3 h-3 ms-1.5" /> : <ChevronDown className="w-3 h-3 ms-1.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={load}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={createCode} className="border border-border bg-background p-4 space-y-3">
          <Input value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder={t("codes.customCode")} className="font-mono rounded-none text-sm uppercase" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground block mb-1">{t("codes.duration")}</label>
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className="font-mono rounded-none" />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase text-muted-foreground block mb-1">{t("codes.maxUses")}</label>
              <Input type="number" min={1} value={maxUses}  onChange={(e) => setMaxUses(e.target.value)} className="font-mono rounded-none" />
            </div>
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase text-muted-foreground block mb-1">{t("codes.expires")}</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="font-mono rounded-none" />
          </div>
          <Button type="submit" className="w-full rounded-none font-mono" disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Plus className="w-4 h-4 me-2" />}
            {t("codes.generate")}
          </Button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : codes.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("codes.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.id} className="border border-border bg-background p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold tracking-wider">{c.code}</span>
                  {statusBadge(c.status)}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {c.durationDays}d · {c.usedCount}/{c.maxUses} {t("codes.used")} · {fmtDate(c.createdAt)}
                  {c.expiresAt ? ` · exp ${fmtDate(c.expiresAt)}` : ""}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 px-2 rounded-none font-mono text-xs" onClick={() => copyCode(c.code)}>
                  <Copy className="w-3 h-3 me-1" /> {t("codes.copy")}
                </Button>
                {c.status === "active" && (
                  <Button size="sm" variant="destructive" className="h-7 px-2 rounded-none font-mono text-xs" onClick={() => disableCode(c.id)} disabled={disabling === c.id}>
                    {disabling === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3 me-1" />}
                    {t("codes.disable")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Subs Tab ───────────────────────────────────────────────────────────── */

function SubsTab({ session, t }: { session: OwnerSession; t: (k: string) => string }) {
  const [subs,    setSubs]    = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs((await ownerFetch<{ items: SubRow[] }>("owner/pro-subscriptions", session.token)).items); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) => {
    if (s === "active")   return "text-green-400";
    if (s === "expired")  return "text-yellow-400";
    if (s === "cancelled"|| s === "refunded") return "text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={load}>
          <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : subs.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("subs.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <div key={s.id} className="border border-border bg-background p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="space-y-0.5">
                <div className="font-mono text-sm font-semibold">{s.displayName || s.username || `User #${s.userId}`}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {s.provider} · <span className={`${statusColor(s.status)} uppercase`}>{s.status}</span>
                  {s.amount ? ` · ${s.amount} ${s.currency ?? ""}` : ""}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {fmtDate(s.startedAt)} → {fmtDate(s.expiresAt)}
                </div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground text-end">#{s.orderId.slice(0, 12)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Account Tab ────────────────────────────────────────────────────────── */

function AccountTab({ session, ownerInfo, onRefreshMe, t, toast }: {
  session: OwnerSession; ownerInfo: OwnerInfo; onRefreshMe: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [email,           setEmail]           = useState(ownerInfo.email ?? "");
  const [loadingEmail,    setLoadingEmail]    = useState(false);
  const [showChangePass,  setShowChangePass]  = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [loadingPass,     setLoadingPass]     = useState(false);

  useEffect(() => { setEmail(ownerInfo.email ?? ""); }, [ownerInfo.email]);

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setLoadingEmail(true);
    try {
      await ownerFetch("owner/set-email", session.token, { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      toast({ title: t("emailSet") }); onRefreshMe();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setLoadingEmail(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setLoadingPass(true);
    try {
      await ownerFetch("owner/change-password", session.token, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      toast({ title: t("passwordChanged") });
      setCurrentPassword(""); setNewPassword(""); setShowChangePass(false);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setLoadingPass(false); }
  };

  return (
    <div className="space-y-5">
      {/* Email */}
      <form onSubmit={saveEmail} className="space-y-2">
        <label className="font-mono text-xs uppercase text-primary flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> {t("emailLink")}
        </label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} autoComplete="email" className="font-mono rounded-none" />
        <Button type="submit" variant="outline" className="w-full rounded-none font-mono" disabled={loadingEmail}>
          {loadingEmail && <Loader2 className="w-4 h-4 me-2 animate-spin" />} {t("saveEmail")}
        </Button>
      </form>

      {/* Change password */}
      <div className="border border-border/50">
        <button
          type="button"
          onClick={() => setShowChangePass((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> {t("changePassword")}</span>
          {showChangePass ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showChangePass && (
          <form onSubmit={changePassword} className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t("currentPassword")} autoComplete="current-password" className="font-mono rounded-none" />
            <Input type="password" value={newPassword}     onChange={(e) => setNewPassword(e.target.value)}     placeholder={t("newPassword")}     autoComplete="new-password"     className="font-mono rounded-none" />
            <Button type="submit" className="w-full rounded-none font-mono" disabled={loadingPass}>
              {loadingPass && <Loader2 className="w-4 h-4 me-2 animate-spin" />} {t("changePassword")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
