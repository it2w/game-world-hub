import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Shield, Mail, KeyRound, LogOut, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, Users, BarChart3,
  Tag, CreditCard, Settings, Copy, Ban, Crown,
  XCircle, RefreshCw, Plus, Search,
  Activity, UserX, UserCheck, TrendingUp, Clock,
  FileText, Zap, MessageSquare, Swords, Megaphone,
  Trophy, Filter, Flag, Lock, Power, SlidersHorizontal, Trash2, Check,
  Download, Layers,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getApiUrl } from "@/lib/api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface OwnerSession  { token: string; username: string; ownerId: number }
interface OwnerInfo     { id: number; username: string; email: string | null; emailVerified: boolean }

interface Stats {
  totalUsers: number; proUsers: number; adminUsers: number;
  newToday: number; newWeek: number; activeToday: number;
  onlineNow: number; suspended: number;
  activeCodes: number; totalSubscriptions: number;
  openLfgPosts: number; totalLfgPosts: number;
  totalMessages: number; activeParties: number;
  recentSignups: { id: number; username: string; displayName: string; isPro: boolean; isAdmin: boolean; createdAt: string }[];
  topPlayers: { id: number; username: string; displayName: string; isPro: boolean; status: string; lfgCount: number }[];
}

interface UserRow {
  id: number; username: string; displayName: string; email: string | null;
  isPro: boolean; proExpiresAt: string | null; isAdmin: boolean;
  status: string; createdAt: string; lastActiveAt: string | null;
}

interface AdminRow {
  id: number; username: string; displayName: string; email: string | null;
  status: string; isPro: boolean; createdAt: string; lastActiveAt: string | null;
  lfgCount: number;
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

interface LogRow {
  id: number; action: string; targetId: number | null; targetName: string | null;
  detail: string | null; ownerId: number; ownerName: string; createdAt: string;
}

type Tab = "stats" | "users" | "admins" | "codes" | "subs" | "log" | "reports" | "denylist" | "settings" | "account" | "analytics" | "content";

interface AdminNote    { id: number; author_id: number; author_name: string | null; body: string; created_at: string }
interface UserDetail   {
  id: number; username: string; displayName: string; email: string | null; status: string;
  avatarUrl: string | null; isPro: boolean; isAdmin: boolean; proExpiresAt: string | null;
  createdAt: string; lastActiveAt: string | null;
  progress: { level: number; xp: number; xpForNext: number } | null;
  proHistory: { id: number; provider: string; status: string; started_at: string | null; expires_at: string | null }[];
  notes: AdminNote[]; reportCount: number;
}
interface AnalyticsData {
  range: number;
  newUsers: { date: string; count: number }[];
  dau:      { date: string; count: number }[];
  lfgPosts: { date: string; count: number }[];
  proActivations: { date: string; count: number }[];
  summary: { peakDau: number; proConvRate: number };
}
interface ContentLfg   { id: number; game: string; description: string; status: string; author_id: number; author_username: string | null; response_count: number; created_at: string }
interface ContentParty { id: number; name: string; game: string | null; leader_id: number; leader_username: string | null; member_count: number; max_size: number; created_at: string }

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
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Request failed"), { status: res.status });
  return data as T;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_LABELS: Record<string, string> = {
  activate_pro:         "Activated Pro",
  deactivate_pro:       "Deactivated Pro",
  grant_admin:          "Granted Admin",
  revoke_admin:         "Revoked Admin",
  suspend_user:         "Suspended User",
  unsuspend_user:       "Unsuspended User",
  create_code:          "Created Code",
  disable_code:         "Disabled Code",
  force_logout:         "Force Logout",
  set_permissions:      "Set Permissions",
  denylist_add:         "Denylist — Added",
  denylist_remove:      "Denylist — Removed",
  update_settings:      "Updated Settings",
  broadcast:            "Broadcast",
  delete_content:       "Deleted Content",
  bulk_activate_pro:    "Bulk — Activated Pro",
  bulk_deactivate_pro:  "Bulk — Deactivated Pro",
  bulk_suspend:         "Bulk — Suspended",
  bulk_unsuspend:       "Bulk — Unsuspended",
  bulk_force_logout:    "Bulk — Force Logout",
};

const ACTION_COLOR: Record<string, string> = {
  activate_pro:    "text-yellow-400",
  deactivate_pro:  "text-orange-400",
  grant_admin:     "text-purple-400",
  revoke_admin:    "text-red-400",
  suspend_user:    "text-red-400",
  unsuspend_user:  "text-green-400",
  create_code:     "text-blue-400",
  disable_code:    "text-muted-foreground",
  force_logout:    "text-orange-400",
  set_permissions: "text-violet-400",
  denylist_add:    "text-red-400",
  denylist_remove: "text-green-400",
  update_settings: "text-cyan-400",
  broadcast:       "text-primary",
};

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
      const err = e as { status?: number; message?: string };
      if (err.status === 401 || err.message?.toLowerCase().includes("not found") || err.message?.toLowerCase().includes("expired")) {
        handleLogout();
      }
    } finally { setLoading(false); }
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
      <div className={`w-full ${mode === "dashboard" ? "max-w-6xl" : "max-w-md"} border border-primary/30 bg-card shadow-2xl`}>
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

        <div className={mode === "dashboard" ? "" : "p-6"}>
          {mode === "login"     && <LoginForm onLogin={handleLogin} onReset={() => setMode("reset")} t={t} toast={toast} />}
          {mode === "reset"     && <ResetForm onBack={() => setMode("login")} t={t} toast={toast} />}
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
  const [devCode,     setDevCode]     = useState<string | null>(null);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const result = await ownerFetch<{ ok: boolean; devCode?: string }>(
        "owner/reset-password-request", "",
        { method: "POST", body: JSON.stringify({ username: username.trim() }) }
      );
      if (result.devCode) {
        setDevCode(result.devCode);
        setCode(result.devCode); // pre-fill the code field
      }
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
          {/* Dev-mode code banner — only shown when the API returns devCode */}
          {devCode && (
            <div className="rounded-none border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-yellow-400">
                ⚠ DEV MODE — الكود ظاهر هنا بدلاً من الإيميل
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-yellow-300 tracking-widest">{devCode}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(devCode); }}
                  className="text-yellow-500 hover:text-yellow-300 transition-colors"
                  title="نسخ"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
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

/* Navigation structure — grouped for sidebar */
const NAV_GROUPS: { labelKey: string; items: { id: Tab; icon: React.ReactNode; key: string }[] }[] = [
  {
    labelKey: "nav.overview",
    items: [
      { id: "stats",     icon: <BarChart3  className="w-3.5 h-3.5" />, key: "tabs.stats"     },
      { id: "analytics", icon: <TrendingUp className="w-3.5 h-3.5" />, key: "tabs.analytics" },
    ],
  },
  {
    labelKey: "nav.users",
    items: [
      { id: "users",   icon: <Users  className="w-3.5 h-3.5" />, key: "tabs.users"   },
      { id: "admins",  icon: <Shield className="w-3.5 h-3.5" />, key: "tabs.admins"  },
      { id: "reports", icon: <Flag   className="w-3.5 h-3.5" />, key: "tabs.reports" },
    ],
  },
  {
    labelKey: "nav.commerce",
    items: [
      { id: "subs",  icon: <CreditCard className="w-3.5 h-3.5" />, key: "tabs.subs"  },
      { id: "codes", icon: <Tag        className="w-3.5 h-3.5" />, key: "tabs.codes" },
    ],
  },
  {
    labelKey: "nav.platform",
    items: [
      { id: "content",  icon: <Layers   className="w-3.5 h-3.5" />, key: "tabs.content"  },
      { id: "denylist", icon: <Ban      className="w-3.5 h-3.5" />, key: "tabs.denylist" },
      { id: "log",      icon: <Activity className="w-3.5 h-3.5" />, key: "tabs.log"      },
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      { id: "settings", icon: <SlidersHorizontal className="w-3.5 h-3.5" />, key: "tabs.settings" },
      { id: "account",  icon: <Settings          className="w-3.5 h-3.5" />, key: "tabs.account"  },
    ],
  },
];

const FLAT_TABS = NAV_GROUPS.flatMap((g) => g.items);

function TabContent({ tab, session, ownerInfo, onRefreshMe, t, toast }: {
  tab: Tab; session: OwnerSession; ownerInfo: OwnerInfo; onRefreshMe: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  return (
    <>
      {tab === "stats"     && <StatsTab     session={session} t={t} />}
      {tab === "users"     && <UsersTab     session={session} t={t} toast={toast} />}
      {tab === "admins"    && <AdminsTab    session={session} t={t} toast={toast} />}
      {tab === "codes"     && <CodesTab     session={session} t={t} toast={toast} />}
      {tab === "subs"      && <SubsTab      session={session} t={t} />}
      {tab === "analytics" && <AnalyticsTab session={session} t={t} />}
      {tab === "content"   && <ContentTab   session={session} t={t} toast={toast} />}
      {tab === "log"       && <LogTab       session={session} t={t} />}
      {tab === "reports"   && <ReportsTab   session={session} t={t} toast={toast} />}
      {tab === "denylist"  && <DenylistTab  session={session} t={t} toast={toast} />}
      {tab === "settings"  && <SettingsTab  session={session} t={t} toast={toast} />}
      {tab === "account"   && <AccountTab   session={session} ownerInfo={ownerInfo} onRefreshMe={onRefreshMe} t={t} toast={toast} />}
    </>
  );
}

function Dashboard({ session, ownerInfo, onRefreshMe, t, toast }: {
  session: OwnerSession; ownerInfo: OwnerInfo; onRefreshMe: () => void;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [tab, setTab] = useState<Tab>("stats");
  const activeItem = FLAT_TABS.find((i) => i.id === tab);

  return (
    /* dir=ltr so sidebar is always on the left regardless of app locale */
    <div className="flex flex-col md:flex-row min-h-[640px]" dir="ltr">

      {/* ── Left sidebar (desktop only) ── */}
      <aside className="hidden md:flex flex-col w-44 shrink-0 border-r border-border">
        {!ownerInfo.email && (
          <div className="flex items-start gap-1.5 text-yellow-500 border-b border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="font-mono text-[9px] uppercase leading-tight">{t("noEmailWarning")}</span>
          </div>
        )}

        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey} className="mb-2">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 px-4 pt-3 pb-1.5 select-none">
                {t(group.labelKey)}
              </p>
              {group.items.map(({ id, icon, key }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-[7px] font-mono text-[11px] transition-all border-l-2 text-start ${
                    tab === id
                      ? "border-l-primary text-primary bg-primary/[0.07]"
                      : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="shrink-0">{icon}</span>
                  <span className="truncate">{t(key)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Mobile compact tab strip ── */}
      <div className="md:hidden flex-col flex">
        {!ownerInfo.email && (
          <div className="flex items-center gap-2 text-yellow-500 border-b border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="font-mono text-[9px] uppercase">{t("noEmailWarning")}</span>
          </div>
        )}
        <div className="flex border-b border-border overflow-x-auto shrink-0">
          {FLAT_TABS.map(({ id, icon, key }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 font-mono text-[10px] uppercase whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {icon} {t(key)}
            </button>
          ))}
        </div>
        <div className="p-4 flex-1">
          <TabContent tab={tab} session={session} ownerInfo={ownerInfo} onRefreshMe={onRefreshMe} t={t} toast={toast} />
        </div>
      </div>

      {/* ── Desktop content area ── */}
      <main className="hidden md:block flex-1 p-6 overflow-x-hidden min-w-0">
        {/* Page header row */}
        <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-border/50">
          <span className="text-primary/60">{activeItem?.icon}</span>
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-foreground/60">
            {activeItem ? t(activeItem.key) : ""}
          </h2>
        </div>

        <TabContent tab={tab} session={session} ownerInfo={ownerInfo} onRefreshMe={onRefreshMe} t={t} toast={toast} />
      </main>
    </div>
  );
}

/* ─── Stats Tab ──────────────────────────────────────────────────────────── */

function StatsTab({ session, t }: { session: OwnerSession; t: (k: string) => string }) {
  const { toast } = useToast();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await ownerFetch<Stats>("owner/stats", session.token)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody,  setBcBody]  = useState("");
  const [sending, setSending] = useState(false);

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true);
    try {
      const { sent } = await ownerFetch<{ sent: number }>("owner/broadcast", session.token, {
        method: "POST", body: JSON.stringify({ title: bcTitle.trim(), body: bcBody.trim() || undefined }),
      });
      toast({ title: `${t("stats.broadcastSent")} (${sent})` });
      setBcTitle(""); setBcBody(""); setShowBroadcast(false);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  const mainCards = [
    { label: t("stats.onlineNow"),   value: stats?.onlineNow,   icon: <span className="relative flex"><span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-green-400 opacity-75"/><Zap className="w-5 h-5 text-green-400 relative"/></span>, sub: null, highlight: true },
    { label: t("stats.totalUsers"),  value: stats?.totalUsers,  icon: <Users      className="w-5 h-5 text-blue-400"   />, sub: null, highlight: false },
    { label: t("stats.proUsers"),    value: stats?.proUsers,    icon: <Crown      className="w-5 h-5 text-yellow-400" />, sub: null, highlight: false },
    { label: t("stats.admins"),      value: stats?.adminUsers,  icon: <Shield     className="w-5 h-5 text-purple-400" />, sub: null, highlight: false },
    { label: t("stats.activeToday"), value: stats?.activeToday, icon: <Zap        className="w-5 h-5 text-cyan-400"   />, sub: null, highlight: false },
    { label: t("stats.newToday"),    value: stats?.newToday,    icon: <TrendingUp className="w-5 h-5 text-emerald-400"/>, sub: stats ? `+${stats.newWeek} ${t("stats.thisWeek")}` : null, highlight: false },
    { label: t("stats.suspended"),   value: stats?.suspended,   icon: <UserX      className="w-5 h-5 text-red-400"    />, sub: null, highlight: false },
    { label: t("stats.totalMessages"),value:stats?.totalMessages,icon: <MessageSquare className="w-5 h-5 text-sky-400"/>, sub: null, highlight: false },
    { label: t("stats.activeParties"),value:stats?.activeParties,icon: <Swords    className="w-5 h-5 text-orange-400" />, sub: null, highlight: false },
    { label: t("stats.activeCodes"), value: stats?.activeCodes, icon: <Tag        className="w-5 h-5 text-violet-400" />, sub: null, highlight: false },
    { label: t("stats.totalSubs"),   value: stats?.totalSubscriptions, icon: <CreditCard className="w-5 h-5 text-pink-400" />, sub: null, highlight: false },
    { label: t("stats.openLfg"),     value: stats?.openLfgPosts, icon: <FileText  className="w-5 h-5 text-indigo-400" />, sub: stats ? `${stats.totalLfgPosts} ${t("stats.total")}` : null, highlight: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none border-primary/50 text-primary hover:bg-primary/10"
          onClick={() => setShowBroadcast((v) => !v)}>
          <Megaphone className="w-3.5 h-3.5 me-1.5" /> {t("stats.broadcast")}
        </Button>
        <Button size="sm" variant="ghost" onClick={load} className="h-7 px-2 font-mono text-xs">
          <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
        </Button>
      </div>

      {/* Broadcast panel */}
      {showBroadcast && (
        <form onSubmit={sendBroadcast} className="border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs uppercase text-primary font-bold">{t("stats.broadcastTitle")}</span>
          </div>
          <Input
            value={bcTitle} onChange={(e) => setBcTitle(e.target.value)}
            placeholder={t("stats.broadcastTitlePlaceholder")}
            className="font-mono rounded-none text-sm"
            required
          />
          <textarea
            value={bcBody} onChange={(e) => setBcBody(e.target.value)}
            placeholder={t("stats.broadcastBodyPlaceholder")}
            className="w-full font-mono text-sm bg-background border border-input rounded-none px-3 py-2 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button type="submit" className="rounded-none font-mono text-xs h-8" disabled={sending || !bcTitle.trim()}>
              {sending ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5 me-1.5" />}
              {t("stats.broadcastSend")}
            </Button>
            <Button type="button" variant="ghost" className="rounded-none font-mono text-xs h-8"
              onClick={() => setShowBroadcast(false)}>{t("stats.broadcastCancel")}</Button>
          </div>
        </form>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {mainCards.map(({ label, value, icon, sub, highlight }) => (
          <div key={label} className={`border bg-background p-4 flex flex-col gap-1.5 ${highlight ? "border-green-500/40 bg-green-500/5" : "border-border"}`}>
            <div className="flex items-center gap-2">{icon}<span className="font-mono text-[10px] text-muted-foreground uppercase">{label}</span></div>
            <div className={`font-mono text-2xl font-bold ${highlight ? "text-green-400" : "text-foreground"}`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (value ?? "—")}
            </div>
            {sub && !loading && <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Recent signups */}
        {(stats?.recentSignups?.length ?? 0) > 0 && (
          <div className="border border-border bg-background p-4">
            <div className="font-mono text-xs uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> {t("stats.recentSignups")}
            </div>
            <div className="space-y-2">
              {(stats?.recentSignups ?? []).map((u) => (
                <div key={u.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm truncate">{u.displayName || u.username}</span>
                    {u.isPro   && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-yellow-500/60 text-yellow-400 shrink-0">PRO</Badge>}
                    {u.isAdmin && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-purple-500/60 text-purple-400 shrink-0">ADM</Badge>}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 ms-2">{timeAgo(u.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top players */}
        {(stats?.topPlayers?.length ?? 0) > 0 && (
          <div className="border border-border bg-background p-4">
            <div className="font-mono text-xs uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-yellow-400" /> {t("stats.topPlayers")}
            </div>
            <div className="space-y-2">
              {(stats?.topPlayers ?? []).map((u, i) => (
                <div key={u.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-mono text-xs font-bold w-5 shrink-0 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-400" : "text-muted-foreground"}`}>
                      #{i + 1}
                    </span>
                    <span className="font-mono text-sm truncate">{u.displayName || u.username}</span>
                    {u.isPro && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-yellow-500/60 text-yellow-400 shrink-0">PRO</Badge>}
                  </div>
                  <span className="font-mono text-xs text-primary font-bold shrink-0 ms-2">{u.lfgCount} {t("stats.posts")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Users Tab ──────────────────────────────────────────────────────────── */

function UsersTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [query,    setQuery]    = useState("");
  const [filterBy, setFilterBy] = useState<"all"|"pro"|"admin"|"suspended"|"online">("all");
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [acting,   setActing]   = useState<number | null>(null);
  const [proDays,     setProDays]     = useState<Record<number, string>>({});
  const [checked,     setChecked]     = useState<Set<number>>(new Set());
  const [detailUser,  setDetailUser]  = useState<UserRow | null>(null);
  const [bulkAction,  setBulkAction]  = useState("suspend");
  const [bulkDays,    setBulkDays]    = useState("30");
  const [bulkRunning, setBulkRunning] = useState(false);
  const LIMIT = 20;

  const load = useCallback(async (q: string, fb: string, off: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off), filterBy: fb });
      if (q) params.set("q", q);
      const data = await ownerFetch<{ total: number; items: UserRow[] }>(`owner/users?${params}`, session.token);
      setTotal(data.total);
      setUsers((prev) => append ? [...prev, ...data.items] : data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { setOffset(0); load(query, filterBy, 0); }, [query, filterBy, load]);

  const reload = () => { setOffset(0); load(query, filterBy, 0); };

  const forceLogout = async (u: UserRow) => {
    if (!confirm(t("users.forceLogoutConfirm"))) return;
    setActing(u.id);
    try {
      await ownerFetch(`owner/users/${u.id}/force-logout`, session.token, { method: "POST" });
      toast({ title: t("users.forceLoggedOut") });
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

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
      reload();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const toggleAdmin = async (u: UserRow) => {
    setActing(u.id);
    try {
      await ownerFetch(`owner/users/${u.id}/admin`, session.token, { method: "POST", body: JSON.stringify({ isAdmin: !u.isAdmin }) });
      toast({ title: t("users.adminSet") });
      reload();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const toggleSuspend = async (u: UserRow) => {
    setActing(u.id);
    const isSuspended = u.status === "suspended";
    try {
      await ownerFetch(`owner/users/${u.id}/suspend`, session.token, { method: isSuspended ? "DELETE" : "POST" });
      toast({ title: isSuspended ? t("users.unsuspended") : t("users.suspended") });
      reload();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(query, filterBy, next, true); };

  const toggleCheck = (id: number) => setChecked((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const runBulkAction = async () => {
    if (!checked.size || bulkRunning) return;
    setBulkRunning(true);
    try {
      const { succeeded, failed } = await ownerFetch<{ succeeded: number[]; failed: number[] }>(
        "owner/users/bulk", session.token,
        { method: "POST", body: JSON.stringify({ userIds: [...checked], action: bulkAction, durationDays: Number(bulkDays) }) },
      );
      toast({ title: `${succeeded.length} ${t("users.bulkOk")}${failed.length ? `, ${failed.length} ${t("users.bulkFailed")}` : ""}` });
      setChecked(new Set()); reload();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setBulkRunning(false); }
  };

  const statusDot = (s: string) => {
    const map: Record<string, string> = { online: "bg-green-400", away: "bg-yellow-400", busy: "bg-red-400", suspended: "bg-red-600", offline: "bg-muted" };
    return <span className={`inline-block w-2 h-2 rounded-full ${map[s] ?? "bg-muted"}`} title={s} />;
  };

  const FILTERS: { id: typeof filterBy; label: string; color?: string }[] = [
    { id: "all",       label: t("users.filterAll") },
    { id: "online",    label: t("users.filterOnline"),    color: "text-green-400 border-green-500/50" },
    { id: "pro",       label: t("users.filterPro"),       color: "text-yellow-400 border-yellow-500/50" },
    { id: "admin",     label: t("users.filterAdmin"),     color: "text-purple-400 border-purple-500/50" },
    { id: "suspended", label: t("users.filterSuspended"), color: "text-red-400 border-red-500/50" },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("users.search")} className="font-mono rounded-none ps-9 text-sm" />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterBy(f.id)}
            className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
              filterBy === f.id
                ? `border-primary bg-primary/10 text-primary`
                : `border-border text-muted-foreground hover:border-border/80 ${f.color ?? ""}`
            }`}
          >
            {f.label}
          </button>
        ))}
        {total > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground ms-1">{total} {t("users.results")}</span>
        )}
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="border border-primary/40 bg-primary/5 px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-primary shrink-0">{checked.size} {t("users.selected")}</span>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}
            className="font-mono text-xs bg-background border border-border rounded-none px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="suspend">{t("users.bulk.suspend")}</option>
            <option value="unsuspend">{t("users.bulk.unsuspend")}</option>
            <option value="force_logout">{t("users.bulk.forceLogout")}</option>
            <option value="activate_pro">{t("users.bulk.activatePro")}</option>
            <option value="deactivate_pro">{t("users.bulk.deactivatePro")}</option>
          </select>
          {bulkAction === "activate_pro" && (
            <Input type="number" min={1} max={3650} value={bulkDays} onChange={(e) => setBulkDays(e.target.value)}
              className="w-16 h-7 text-xs font-mono rounded-none px-2" title={t("users.durationDays")} />
          )}
          <Button size="sm" className="h-7 px-2 font-mono text-xs rounded-none" onClick={runBulkAction} disabled={bulkRunning}>
            {bulkRunning && <Loader2 className="w-3 h-3 animate-spin me-1" />}
            {t("users.bulk.run")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs rounded-none text-muted-foreground"
            onClick={() => setChecked(new Set())}>{t("users.bulk.clear")}</Button>
        </div>
      )}

      {users.length === 0 && !loading ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("users.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className={`border bg-background p-3 ${u.status === "suspended" ? "border-red-500/40" : "border-border"}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1.5 shrink-0 accent-primary cursor-pointer" checked={checked.has(u.id)} onChange={() => toggleCheck(u.id)} aria-label={`Select ${u.username}`} />
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <button type="button" className="font-mono text-sm font-semibold flex items-center gap-2 flex-wrap hover:text-primary transition-colors text-start" onClick={() => setDetailUser(u)}>
                        {statusDot(u.status)}
                        {u.displayName || u.username}
                        {u.isPro   && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">PRO</Badge>}
                        {u.isAdmin && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-purple-500/60 text-purple-400">ADMIN</Badge>}
                        {u.status === "suspended" && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-500/60 text-red-400">SUSPENDED</Badge>}
                      </button>
                      <div className="font-mono text-[11px] text-muted-foreground">@{u.username} {u.email ? `· ${u.email}` : ""}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {t("users.joined")}: {fmtDate(u.createdAt)}
                        {u.lastActiveAt ? ` · ${t("users.lastSeen")}: ${timeAgo(u.lastActiveAt)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!u.isPro && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number" min={1} max={3650}
                            value={proDays[u.id] ?? "30"}
                            onChange={(e) => setProDays((p) => ({ ...p, [u.id]: e.target.value }))}
                            className="w-14 h-7 text-xs font-mono rounded-none px-2"
                            title={t("users.durationDays")}
                          />
                          <span className="font-mono text-[9px] text-muted-foreground">{t("users.days")}</span>
                        </div>
                      )}
                      <Button size="sm" variant={u.isPro ? "destructive" : "outline"} className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => togglePro(u)} disabled={acting === u.id}>
                        {acting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : u.isPro ? <XCircle className="w-3 h-3 me-1" /> : <Crown className="w-3 h-3 me-1" />}
                        {u.isPro ? t("users.deactivatePro") : t("users.activatePro")}
                      </Button>
                      <Button size="sm" variant={u.isAdmin ? "destructive" : "secondary"} className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => toggleAdmin(u)} disabled={acting === u.id}>
                        {u.isAdmin ? t("users.removeAdmin") : t("users.makeAdmin")}
                      </Button>
                      <Button size="sm" variant={u.status === "suspended" ? "outline" : "destructive"} className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => toggleSuspend(u)} disabled={acting === u.id}>
                        {u.status === "suspended" ? <><UserCheck className="w-3 h-3 me-1" />{t("users.unsuspend")}</> : <><UserX className="w-3 h-3 me-1" />{t("users.suspend")}</>}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none border-orange-500/50 text-orange-400 hover:bg-orange-500/10" onClick={() => forceLogout(u)} disabled={acting === u.id} title={t("users.forceLogout")}>
                        <Power className="w-3 h-3 me-1" />{t("users.forceLogout")}
                      </Button>
                    </div>
                  </div>
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

      {detailUser && (
        <UserDetailDrawer user={detailUser} session={session} t={t} toast={toast} onClose={() => setDetailUser(null)} />
      )}
    </div>
  );
}

/* ─── Admins Tab ─────────────────────────────────────────────────────────── */

type AdminPermsRow = {
  user_id: number;
  can_manage_pro: boolean; can_suspend_users: boolean; can_delete_content: boolean;
  can_view_reports: boolean; can_manage_codes: boolean; can_broadcast: boolean;
  can_view_analytics: boolean; can_manage_admins: boolean;
};

const PERM_FLAGS: (keyof Omit<AdminPermsRow, "user_id">)[] = [
  "can_manage_pro", "can_suspend_users", "can_delete_content",
  "can_view_reports", "can_manage_codes", "can_broadcast",
  "can_view_analytics", "can_manage_admins",
];

const PERM_I18N: Record<keyof Omit<AdminPermsRow, "user_id">, string> = {
  can_manage_pro:     "admins.perms.canManagePro",
  can_suspend_users:  "admins.perms.canSuspendUsers",
  can_delete_content: "admins.perms.canDeleteContent",
  can_view_reports:   "admins.perms.canViewReports",
  can_manage_codes:   "admins.perms.canManageCodes",
  can_broadcast:      "admins.perms.canBroadcast",
  can_view_analytics: "admins.perms.canViewAnalytics",
  can_manage_admins:  "admins.perms.canManageAdmins",
};

const EMPTY_PERMS = (userId: number): AdminPermsRow => ({
  user_id: userId, can_manage_pro: false, can_suspend_users: false, can_delete_content: false,
  can_view_reports: false, can_manage_codes: false, can_broadcast: false,
  can_view_analytics: false, can_manage_admins: false,
});

function AdminsTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [admins,      setAdmins]      = useState<AdminRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<number | null>(null);
  const [permsOpen,   setPermsOpen]   = useState<Set<number>>(new Set());
  const [permsData,   setPermsData]   = useState<Record<number, AdminPermsRow>>({});
  const [savingPerms, setSavingPerms] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAdmins((await ownerFetch<{ items: AdminRow[] }>("owner/admins", session.token)).items); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const removeAdmin = async (a: AdminRow) => {
    setActing(a.id);
    try {
      await ownerFetch(`owner/users/${a.id}/admin`, session.token, { method: "POST", body: JSON.stringify({ isAdmin: false }) });
      toast({ title: t("admins.removed") });
      await load();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const togglePerms = async (adminId: number) => {
    const next = new Set(permsOpen);
    if (next.has(adminId)) { next.delete(adminId); setPermsOpen(next); return; }
    next.add(adminId); setPermsOpen(next);
    if (!permsData[adminId]) {
      try {
        const data = await ownerFetch<AdminPermsRow>(`owner/admins/${adminId}/permissions`, session.token);
        setPermsData((p) => ({ ...p, [adminId]: data }));
      } catch { setPermsData((p) => ({ ...p, [adminId]: EMPTY_PERMS(adminId) })); }
    }
  };

  const toggleFlag = (adminId: number, flag: keyof Omit<AdminPermsRow, "user_id">) => {
    setPermsData((p) => {
      const curr = p[adminId] ?? EMPTY_PERMS(adminId);
      return { ...p, [adminId]: { ...curr, [flag]: !curr[flag] } };
    });
  };

  const savePerms = async (adminId: number) => {
    const perms = permsData[adminId]; if (!perms) return;
    setSavingPerms(adminId);
    try {
      await ownerFetch(`owner/admins/${adminId}/permissions`, session.token, {
        method: "PUT",
        body: JSON.stringify({
          canManagePro: perms.can_manage_pro, canSuspendUsers: perms.can_suspend_users,
          canDeleteContent: perms.can_delete_content, canViewReports: perms.can_view_reports,
          canManageCodes: perms.can_manage_codes, canBroadcast: perms.can_broadcast,
          canViewAnalytics: perms.can_view_analytics,
          canManageAdmins:  perms.can_manage_admins,
        }),
      });
      toast({ title: t("admins.permsSaved") });
    } catch { toast({ title: t("admins.permsSaveFailed"), variant: "destructive" }); }
    finally { setSavingPerms(null); }
  };

  const statusBadge = (s: string) => {
    const color: Record<string, string> = { online: "border-green-500/60 text-green-400", away: "border-yellow-500/60 text-yellow-400", busy: "border-red-500/60 text-red-400", offline: "border-border text-muted-foreground", suspended: "border-red-700/60 text-red-500" };
    return <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${color[s] ?? "border-border text-muted-foreground"}`}>{s.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-xs text-muted-foreground">{loading ? "…" : `${admins.length} ${t("admins.count")}`}</p>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={load}>
          <RefreshCw className={`w-3.5 h-3.5 me-1 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : admins.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("admins.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {admins.map((a) => (
            <div key={a.id} className="border border-border bg-background">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Left: identity */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold">{a.displayName || a.username}</span>
                      {statusBadge(a.status)}
                      {a.isPro && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">PRO</Badge>}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">@{a.username}{a.email ? ` · ${a.email}` : ""}</div>
                    <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap pt-0.5">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t("admins.joined")}: {fmtDate(a.createdAt)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {t("admins.lastSeen")}: {timeAgo(a.lastActiveAt)}</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {t("admins.lfgPosts")}: <strong className="text-foreground">{a.lfgCount}</strong></span>
                    </div>
                  </div>
                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none border-violet-500/50 text-violet-400 hover:bg-violet-500/10" onClick={() => togglePerms(a.id)}>
                      <Lock className="w-3 h-3 me-1" />{t("admins.permissions")}
                      {permsOpen.has(a.id) ? <ChevronUp className="w-3 h-3 ms-1" /> : <ChevronDown className="w-3 h-3 ms-1" />}
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => removeAdmin(a)} disabled={acting === a.id}>
                      {acting === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 me-1" />}
                      {t("admins.remove")}
                    </Button>
                  </div>
                </div>
              </div>
              {/* Permissions panel */}
              {permsOpen.has(a.id) && (
                <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
                  {!permsData[a.id] ? (
                    <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin" /></div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {PERM_FLAGS.map((flag) => {
                          const isOn = permsData[a.id]?.[flag] ?? false;
                          return (
                            <button key={flag} onClick={() => toggleFlag(a.id, flag)}
                              className={`flex items-center gap-2 px-2.5 py-1.5 border font-mono text-[11px] transition-colors text-start ${
                                isOn ? "border-violet-500/60 bg-violet-500/10 text-violet-300" : "border-border text-muted-foreground hover:border-muted-foreground/60"
                              }`}
                            >
                              {isOn ? <Check className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 shrink-0 border border-current/40 rounded-sm inline-block" />}
                              {t(PERM_I18N[flag])}
                            </button>
                          );
                        })}
                      </div>
                      <Button size="sm" className="h-7 px-3 font-mono text-xs rounded-none" onClick={() => savePerms(a.id)} disabled={savingPerms === a.id}>
                        {savingPerms === a.id ? <Loader2 className="w-3 h-3 me-1.5 animate-spin" /> : <Check className="w-3 h-3 me-1.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Codes Tab ──────────────────────────────────────────────────────────── */

function CodesTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [codes,      setCodes]      = useState<CodeRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [duration,   setDuration]   = useState("30");
  const [maxUses,    setMaxUses]    = useState("1");
  const [expiresAt,  setExpiresAt]  = useState("");
  const [creating,   setCreating]   = useState(false);
  const [disabling,  setDisabling]  = useState<number | null>(null);

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
        body: JSON.stringify({ code: customCode.trim() || undefined, durationDays: Number(duration) || 30, maxUses: Number(maxUses) || 1, expiresAt: expiresAt || undefined }),
      });
      toast({ title: t("codes.created") });
      setCustomCode(""); setDuration("30"); setMaxUses("1"); setExpiresAt(""); setShowCreate(false);
      await load();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setCreating(false); }
  };

  const disableCode = async (id: number) => {
    setDisabling(id);
    try {
      await ownerFetch(`owner/activation-codes/${id}`, session.token, { method: "DELETE" });
      toast({ title: t("codes.disabled") }); await load();
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setDisabling(null); }
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code).catch(() => {}); toast({ title: t("codes.copied") }); };

  const statusBadge = (s: CodeRow["status"]) => {
    if (s === "active")   return <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-500/60  text-green-400">{t("codes.active")}</Badge>;
    if (s === "inactive") return <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-500/60    text-red-400">{t("codes.inactive")}</Badge>;
    return                       <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">{t("codes.expired")}</Badge>;
  };

  const pct = (c: CodeRow) => c.maxUses > 0 ? Math.round((c.usedCount / c.maxUses) * 100) : 0;

  return (
    <div className="space-y-3">
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
              <Input type="number" min={1} value={maxUses}  onChange={(e) => setMaxUses(e.target.value)}  className="font-mono rounded-none" />
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

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : codes.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("codes.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.id} className="border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold tracking-wider">{c.code}</span>
                    {statusBadge(c.status)}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {c.durationDays}d · {fmtDate(c.createdAt)}{c.expiresAt ? ` · exp ${fmtDate(c.expiresAt)}` : ""}
                  </div>
                  {/* Usage bar */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct(c)}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.usedCount}/{c.maxUses} {t("codes.used")}</span>
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
    if (s === "active")                         return "text-green-400";
    if (s === "expired")                        return "text-yellow-400";
    if (s === "cancelled" || s === "refunded")  return "text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={load}>
          <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
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
                <div className="font-mono text-[10px] text-muted-foreground">{fmtDate(s.startedAt)} → {fmtDate(s.expiresAt)}</div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground text-end">#{s.orderId.slice(0, 12)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Log Tab ────────────────────────────────────────────────────────────── */

function LogTab({ session, t }: { session: OwnerSession; t: (k: string) => string }) {
  const [logs,    setLogs]    = useState<LogRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 50;

  const load = useCallback(async (off: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      const data = await ownerFetch<{ total: number; items: LogRow[] }>(`owner/activity-log?${params}`, session.token);
      setTotal(data.total);
      setLogs((prev) => append ? [...prev, ...data.items] : data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(0); }, [load]);

  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(next, true); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">{loading ? "…" : `${total} ${t("log.total")}`}</p>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={() => { setOffset(0); load(0); }}>
          <RefreshCw className={`w-3.5 h-3.5 me-1 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
        </Button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("log.noResults")}</p>
      ) : (
        <div className="space-y-1">
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 border border-border/50 bg-background px-3 py-2.5 hover:border-border transition-colors">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/60" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono text-xs font-semibold ${ACTION_COLOR[l.action] ?? "text-foreground"}`}>
                    {ACTION_LABELS[l.action] ?? l.action}
                  </span>
                  {l.targetName && (
                    <span className="font-mono text-[11px] text-muted-foreground">→ @{l.targetName}</span>
                  )}
                  {l.detail && (
                    <span className="font-mono text-[10px] text-muted-foreground/70 border border-border/50 px-1.5 py-0.5">{l.detail}</span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {t("log.by")} {l.ownerName} · {fmtDateTime(l.createdAt)}
                </div>
              </div>
            </div>
          ))}
          {!loading && logs.length < total && (
            <Button variant="outline" className="w-full rounded-none font-mono text-xs mt-2" onClick={loadMore}>
              {t("log.loadMore")} ({logs.length}/{total})
            </Button>
          )}
          {loading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>}
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
  const [email,          setEmail]          = useState(ownerInfo.email ?? "");
  const [loadingEmail,   setLoadingEmail]   = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass,    setCurrentPass]    = useState("");
  const [newPass,        setNewPass]        = useState("");
  const [loadingPass,    setLoadingPass]    = useState(false);

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
      await ownerFetch("owner/change-password", session.token, { method: "POST", body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }) });
      toast({ title: t("passwordChanged") });
      setCurrentPass(""); setNewPass(""); setShowChangePass(false);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setLoadingPass(false); }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={saveEmail} className="space-y-2">
        <label className="font-mono text-xs uppercase text-primary flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> {t("emailLink")}
        </label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} autoComplete="email" className="font-mono rounded-none" />
        <Button type="submit" variant="outline" className="w-full rounded-none font-mono" disabled={loadingEmail}>
          {loadingEmail && <Loader2 className="w-4 h-4 me-2 animate-spin" />} {t("saveEmail")}
        </Button>
      </form>

      <div className="border border-border/50">
        <button type="button" onClick={() => setShowChangePass((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
          <span className="flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> {t("changePassword")}</span>
          {showChangePass ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showChangePass && (
          <form onSubmit={changePassword} className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
            <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} placeholder={t("currentPassword")} autoComplete="current-password" className="font-mono rounded-none" />
            <Input type="password" value={newPass}     onChange={(e) => setNewPass(e.target.value)}     placeholder={t("newPassword")}     autoComplete="new-password"     className="font-mono rounded-none" />
            <Button type="submit" className="w-full rounded-none font-mono" disabled={loadingPass}>
              {loadingPass && <Loader2 className="w-4 h-4 me-2 animate-spin" />} {t("changePassword")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Reports Tab ────────────────────────────────────────────────────────── */

type ReportItem = {
  id: number; reporter_id: number; reporter_username: string | null; reporter_name: string | null;
  target_type: string; target_id: number; target_name: string | null;
  reason: string; status: string; reviewed_by: number | null; reviewed_at: string | null; created_at: string;
};

function ReportsTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [items,   setItems]   = useState<ReportItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<number | null>(null);
  const [filter,  setFilter]  = useState("pending");

  const load = useCallback(async (f = filter) => {
    setLoading(true);
    try {
      const data = await ownerFetch<{ total: number; items: ReportItem[] }>(`owner/reports?status=${f}&limit=50`, session.token);
      setItems(data.items); setTotal(data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token, filter]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = (f: string) => { setFilter(f); load(f); };

  const act = async (id: number, status: "reviewed" | "actioned") => {
    setActing(id);
    try {
      await ownerFetch(`owner/reports/${id}`, session.token, { method: "PUT", body: JSON.stringify({ status }) });
      toast({ title: status === "reviewed" ? t("reports.dismissed") : t("reports.markedActioned") });
      load(filter);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const TYPE_LABEL: Record<string, string> = { user: t("reports.typeUser"), lfg: t("reports.typeLfg"), party: t("reports.typeParty") };
  const STATUS_COLOR: Record<string, string> = { pending: "border-yellow-500/60 text-yellow-400", reviewed: "border-green-500/60 text-green-400", actioned: "border-blue-500/60 text-blue-400" };

  const FILTERS = [
    { id: "pending",  label: t("reports.filterPending") },
    { id: "reviewed", label: t("reports.filterReviewed") },
    { id: "actioned", label: t("reports.filterActioned") },
    { id: "all",      label: t("reports.filterAll") },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => applyFilter(f.id)}
              className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
                filter === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/60"
              }`}
            >{f.label}</button>
          ))}
          <span className="font-mono text-[10px] text-muted-foreground self-center ms-1">{total}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={() => load()}>
          <RefreshCw className={`w-3.5 h-3.5 me-1 ${loading ? "animate-spin" : ""}`} />{t("refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("reports.noResults")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="border border-border bg-background p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-muted-foreground/40 text-muted-foreground">
                      {TYPE_LABEL[r.target_type] ?? r.target_type}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${STATUS_COLOR[r.status] ?? "border-border"}`}>
                      {r.status.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
                  </div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">{t("reports.reporter")}: </span>
                    <span>@{r.reporter_username ?? r.reporter_id}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span className="text-muted-foreground">{t("reports.target")}: </span>
                    <span>{r.target_name ?? `#${r.target_id}`}</span>
                  </div>
                  <p className="font-mono text-[11px] text-foreground/80 line-clamp-2">{r.reason}</p>
                </div>
                {r.status === "pending" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => act(r.id, "reviewed")} disabled={acting === r.id}>
                      {acting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 me-1" />}{t("reports.dismiss")}
                    </Button>
                    <Button size="sm" className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => act(r.id, "actioned")} disabled={acting === r.id}>
                      {acting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3 me-1" />}{t("reports.actioned")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Denylist Tab ───────────────────────────────────────────────────────── */

type DenylistItem = { id: number; type: string; value: string; reason: string | null; added_by: number | null; created_at: string };

function DenylistTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [items,   setItems]   = useState<DenylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<number | null>(null);
  const [type,    setType]    = useState<"email" | "domain" | "username">("email");
  const [value,   setValue]   = useState("");
  const [reason,  setReason]  = useState("");
  const [adding,  setAdding]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await ownerFetch<{ items: DenylistItem[] }>("owner/denylist", session.token)).items); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setAdding(true);
    try {
      await ownerFetch("owner/denylist", session.token, { method: "POST", body: JSON.stringify({ type, value: value.trim(), reason: reason.trim() || undefined }) });
      toast({ title: t("denylist.added") });
      setValue(""); setReason(""); await load();
    } catch (err) {
      const msg = (err as Error).message;
      toast({ title: msg.includes("already exists") ? t("denylist.duplicate") : t("denylist.addFailed"), variant: "destructive" });
    }
    finally { setAdding(false); }
  };

  const remove = async (id: number) => {
    setActing(id);
    try {
      await ownerFetch(`owner/denylist/${id}`, session.token, { method: "DELETE" });
      toast({ title: t("denylist.removed") });
      setItems((p) => p.filter((i) => i.id !== id));
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setActing(null); }
  };

  const TYPE_OPTS: { value: "email" | "domain" | "username"; label: string }[] = [
    { value: "email",    label: t("denylist.typeEmail") },
    { value: "domain",   label: t("denylist.typeDomain") },
    { value: "username", label: t("denylist.typeUsername") },
  ];
  const TYPE_COLOR: Record<string, string> = { email: "border-blue-500/60 text-blue-400", domain: "border-orange-500/60 text-orange-400", username: "border-red-500/60 text-red-400" };

  const PLACEHOLDER: Record<string, string> = {
    email:    t("denylist.valuePlaceholder.email"),
    domain:   t("denylist.valuePlaceholder.domain"),
    username: t("denylist.valuePlaceholder.username"),
  };

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-muted-foreground">{t("denylist.desc")}</p>

      {/* Add form */}
      <form onSubmit={addEntry} className="border border-border bg-background p-4 space-y-2">
        <p className="font-mono text-xs font-semibold uppercase text-muted-foreground mb-2">{t("denylist.add")}</p>
        <div className="flex gap-1.5">
          {TYPE_OPTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setType(o.value)}
              className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
                type === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/60"
              }`}
            >{o.label}</button>
          ))}
        </div>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDER[type]} className="font-mono rounded-none text-sm" required />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("denylist.reason")} className="font-mono rounded-none text-sm" />
        <Button type="submit" size="sm" className="rounded-none font-mono text-xs" disabled={adding}>
          {adding ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 me-1.5" />}{t("denylist.add")}
        </Button>
      </form>

      {/* List */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{items.length} entries</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={load}>
          <RefreshCw className={`w-3.5 h-3.5 me-1 ${loading ? "animate-spin" : ""}`} />{t("refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-6">{t("denylist.noResults")}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 ${TYPE_COLOR[item.type] ?? "border-border"}`}>{item.type.toUpperCase()}</Badge>
                <span className="font-mono text-xs truncate">{item.value}</span>
                {item.reason && <span className="font-mono text-[10px] text-muted-foreground truncate hidden sm:block">— {item.reason}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-muted-foreground hidden sm:block">{timeAgo(item.created_at)}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(item.id)} disabled={acting === item.id}>
                  {acting === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Settings Tab ───────────────────────────────────────────────────────── */

type PlatformSettings = { registrations_enabled: string; maintenance_mode: string; maintenance_message: string };

function SettingsTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [settings,  setSettings]  = useState<PlatformSettings>({ registrations_enabled: "true", maintenance_mode: "false", maintenance_message: "" });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await ownerFetch<PlatformSettings>("owner/settings", session.token)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await ownerFetch("owner/settings", session.token, { method: "PUT", body: JSON.stringify(settings) });
      toast({ title: t("settings.saved") });
    } catch { toast({ title: t("settings.saveFailed"), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggle = (key: "registrations_enabled" | "maintenance_mode") => {
    setSettings((p) => ({ ...p, [key]: p[key] === "true" ? "false" : "true" }));
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const ToggleRow = ({ k, labelKey, descKey }: { k: "registrations_enabled" | "maintenance_mode"; labelKey: string; descKey: string }) => {
    const isOn = settings[k] === "true";
    return (
      <div className="flex items-center justify-between gap-4 border border-border bg-background px-4 py-3">
        <div>
          <p className="font-mono text-sm">{t(labelKey)}</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{t(descKey)}</p>
        </div>
        <button onClick={() => toggle(k)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isOn ? "bg-primary" : "bg-muted"}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform ${isOn ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <ToggleRow k="registrations_enabled"  labelKey="settings.registrationsEnabled" descKey="settings.registrationsDesc" />
      <ToggleRow k="maintenance_mode"        labelKey="settings.maintenanceMode"       descKey="settings.maintenanceDesc" />

      <div className="border border-border bg-background px-4 py-3 space-y-1.5">
        <p className="font-mono text-sm">{t("settings.maintenanceMessage")}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{t("settings.maintenanceMessageDesc")}</p>
        <textarea
          value={settings.maintenance_message}
          onChange={(e) => setSettings((p) => ({ ...p, maintenance_message: e.target.value }))}
          rows={2}
          className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <Button onClick={save} className="rounded-none font-mono text-xs" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Check className="w-4 h-4 me-2" />}
        {t("settings.save")}
      </Button>
    </div>
  );
}

/* ─── User Detail Drawer ─────────────────────────────────────────────────── */

function UserDetailDrawer({ user, session, t, toast, onClose }: {
  user: UserRow; session: OwnerSession;
  t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
  onClose: () => void;
}) {
  const [detail,       setDetail]       = useState<UserDetail | null>(null);
  const [loadingDetail,setLoadingDetail] = useState(true);
  const [noteBody,     setNoteBody]     = useState("");
  const [addingNote,   setAddingNote]   = useState(false);
  const [deletingNote, setDeletingNote] = useState<number | null>(null);

  useEffect(() => {
    setLoadingDetail(true);
    ownerFetch<UserDetail>(`owner/users/${user.id}/detail`, session.token)
      .then((d) => setDetail(d))
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [user.id, session.token]);

  const addNote = async () => {
    if (!noteBody.trim() || addingNote) return;
    setAddingNote(true);
    try {
      const note = await ownerFetch<AdminNote>(`owner/users/${user.id}/notes`, session.token, {
        method: "POST", body: JSON.stringify({ body: noteBody.trim() }),
      });
      setDetail((d) => d ? { ...d, notes: [note, ...d.notes] } : d);
      setNoteBody("");
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setAddingNote(false); }
  };

  const deleteNote = async (noteId: number) => {
    setDeletingNote(noteId);
    try {
      await ownerFetch(`owner/notes/${noteId}`, session.token, { method: "DELETE" });
      setDetail((d) => d ? { ...d, notes: d.notes.filter((n) => n.id !== noteId) } : d);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setDeletingNote(null); }
  };

  const initials = (d: UserDetail) => (d.displayName || d.username).slice(0, 2).toUpperCase();
  const dot = (s: string) => {
    const m: Record<string, string> = { online: "bg-green-400", away: "bg-yellow-400", busy: "bg-red-400", suspended: "bg-red-600", offline: "bg-muted" };
    return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${m[s] ?? "bg-muted"}`} />;
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-background border-l border-primary/20 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="font-mono text-sm uppercase flex items-center gap-2">
            <Users className="w-4 h-4" /> {t("detail.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 py-4">
          {loadingDetail ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !detail ? (
            <p className="font-mono text-xs text-muted-foreground py-8 text-center">{t("detail.notFound")}</p>
          ) : (
            <div className="space-y-5">
              {/* Avatar + identity */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-mono text-xl font-bold text-primary shrink-0">
                  {initials(detail)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {dot(detail.status)}
                    <span className="font-mono text-base font-semibold truncate">{detail.displayName || detail.username}</span>
                    {detail.isPro   && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-yellow-500/60 text-yellow-400">PRO</Badge>}
                    {detail.isAdmin && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-purple-500/60 text-purple-400">ADMIN</Badge>}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">@{detail.username}</div>
                  {detail.email && <div className="font-mono text-[11px] text-muted-foreground">{detail.email}</div>}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div className="font-mono text-[11px]">
                  <div className="text-[10px] uppercase text-muted-foreground">{t("detail.joined")}</div>
                  <div>{fmtDate(detail.createdAt)}</div>
                </div>
                <div className="font-mono text-[11px]">
                  <div className="text-[10px] uppercase text-muted-foreground">{t("detail.lastSeen")}</div>
                  <div>{detail.lastActiveAt ? timeAgo(detail.lastActiveAt) : "—"}</div>
                </div>
                {detail.isPro && detail.proExpiresAt && (
                  <div className="col-span-2 font-mono text-[11px]">
                    <div className="text-[10px] uppercase text-yellow-400">{t("detail.proExpires")}</div>
                    <div>{fmtDate(detail.proExpiresAt)}</div>
                  </div>
                )}
              </div>

              {/* XP bar */}
              {detail.progress && (
                <div className="border border-border bg-background px-4 py-3 space-y-1.5">
                  <div className="flex justify-between font-mono text-xs">
                    <span className="text-[10px] uppercase text-muted-foreground">{t("detail.level")} {detail.progress.level}</span>
                    <span className="text-muted-foreground">{detail.progress.xp} / {detail.progress.xpForNext} XP</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((detail.progress.xp / Math.max(detail.progress.xpForNext, 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Reports badge */}
              {detail.reportCount > 0 && (
                <div className="flex items-center gap-2 border border-orange-500/30 bg-orange-500/5 px-3 py-2">
                  <Flag className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="font-mono text-xs text-orange-400">{detail.reportCount} {t("detail.reports")}</span>
                </div>
              )}

              {/* Pro history */}
              {detail.proHistory.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">{t("detail.proHistory")}</p>
                  {detail.proHistory.map((h) => (
                    <div key={h.id} className="font-mono text-[11px] border border-border bg-background px-2 py-1.5 flex justify-between gap-2">
                      <span className="text-muted-foreground">{h.provider}</span>
                      <span className={h.status === "active" ? "text-green-400" : "text-muted-foreground"}>{h.status}</span>
                      <span>{fmtDate(h.expires_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Admin notes */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> {t("detail.notes")} ({detail.notes.length})
                </p>

                <div className="flex gap-1.5">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
                    placeholder={t("detail.notePlaceholder")}
                    rows={2}
                    className="flex-1 bg-background border border-border rounded-none px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button size="sm" className="h-auto rounded-none font-mono text-xs px-2.5 self-stretch" onClick={addNote} disabled={addingNote || !noteBody.trim()}>
                    {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </Button>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {detail.notes.length === 0 ? (
                    <p className="font-mono text-[10px] text-muted-foreground text-center py-2">{t("detail.noNotes")}</p>
                  ) : detail.notes.map((n) => (
                    <div key={n.id} className="border border-border bg-background px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">@{n.author_name ?? "owner"} · {timeAgo(n.created_at)}</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteNote(n.id)} disabled={deletingNote === n.id}>
                          {deletingNote === n.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                        </Button>
                      </div>
                      <p className="font-mono text-xs whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Analytics Tab ──────────────────────────────────────────────────────── */

function AnalyticsTab({ session, t }: { session: OwnerSession; t: (k: string) => string }) {
  const [range,   setRange]   = useState<30 | 90>(30);
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: number) => {
    setLoading(true);
    try { setData(await ownerFetch<AnalyticsData>(`owner/analytics?range=${r}`, session.token)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(range); }, [range, load]);

  const exportCsv = async (type: "users" | "log") => {
    try {
      const res = await fetch(`${getApiUrl()}owner/export/${type}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const CHARTS: { key: keyof Pick<AnalyticsData, "newUsers" | "dau" | "lfgPosts" | "proActivations">; label: string; color: string }[] = [
    { key: "newUsers",       label: t("analytics.newUsers"),       color: "#4ade80" },
    { key: "dau",            label: t("analytics.dau"),            color: "#60a5fa" },
    { key: "lfgPosts",       label: t("analytics.lfgPosts"),       color: "#a78bfa" },
    { key: "proActivations", label: t("analytics.proActivations"), color: "#facc15" },
  ];

  const Skel = () => <div className="h-36 bg-border/30 animate-pulse" />;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {([30, 90] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
                range === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}>
              {r}d
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => exportCsv("users")}>
            <Download className="w-3 h-3 me-1" /> {t("analytics.exportUsers")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-xs rounded-none" onClick={() => exportCsv("log")}>
            <Download className="w-3 h-3 me-1" /> {t("analytics.exportLog")}
          </Button>
        </div>
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
          <div key={key} className="border border-border bg-background p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
            {loading ? <Skel /> : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={data?.[key] ?? []} margin={{ top: 2, right: 2, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: "monospace" }}
                    tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fontFamily: "monospace" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "monospace", borderRadius: 0 }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  />
                  <Area type="monotone" dataKey="count" stroke={color} strokeWidth={1.5} fill={`url(#g-${key})`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Content Tab ────────────────────────────────────────────────────────── */

function ContentTab({ session, t, toast }: {
  session: OwnerSession; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [subTab,   setSubTab]   = useState<"lfg" | "party">("lfg");
  const [items,    setItems]    = useState<(ContentLfg | ContentParty)[]>([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const LIMIT = 20;

  const load = useCallback(async (type: "lfg" | "party", off: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, limit: String(LIMIT), offset: String(off) });
      const data   = await ownerFetch<{ total: number; items: (ContentLfg | ContentParty)[] }>(`owner/content?${params}`, session.token);
      setTotal(data.total);
      setItems((p) => append ? [...p, ...data.items] : data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { setOffset(0); load(subTab, 0); }, [subTab, load]);

  const deleteItem = async (id: number) => {
    if (!confirm(t("content.deleteConfirm"))) return;
    setDeleting(id);
    try {
      await ownerFetch(`owner/content/${subTab}/${id}`, session.token, { method: "DELETE" });
      toast({ title: t("content.deleted") });
      setItems((p) => p.filter((i) => i.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) { toast({ title: (err as Error).message, variant: "destructive" }); }
    finally { setDeleting(null); }
  };

  const loadMore = () => { const next = offset + LIMIT; setOffset(next); load(subTab, next, true); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {(["lfg", "party"] as const).map((s) => (
            <button key={s} onClick={() => setSubTab(s)}
              className={`font-mono text-[11px] px-2.5 py-1 border rounded-none transition-colors ${
                subTab === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}>
              {s === "lfg" ? t("content.lfg") : t("content.party")}
            </button>
          ))}
          <span className="font-mono text-[10px] text-muted-foreground self-center ms-1">{total}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" onClick={() => { setOffset(0); load(subTab, 0); }}>
          <RefreshCw className={`w-3.5 h-3.5 me-1 ${loading ? "animate-spin" : ""}`} />{t("refresh")}
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground py-8">{t("content.noResults")}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="border border-border bg-background px-3 py-2.5 flex items-start justify-between gap-2">
              {subTab === "lfg" ? (() => {
                const p = item as ContentLfg;
                return (
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">{p.game}</Badge>
                      <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${p.status === "open" ? "text-green-400 border-green-500/60" : "text-muted-foreground"}`}>
                        {p.status}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.response_count} responses · {timeAgo(p.created_at)}</span>
                    </div>
                    <p className="font-mono text-xs line-clamp-2 text-foreground/80">{p.description}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">@{p.author_username ?? p.author_id}</p>
                  </div>
                );
              })() : (() => {
                const p = item as ContentParty;
                return (
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{p.name}</span>
                      {p.game && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{p.game}</Badge>}
                      <span className="font-mono text-[10px] text-muted-foreground">{p.member_count}/{p.max_size} · {timeAgo(p.created_at)}</span>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">@{p.leader_username ?? p.leader_id}</p>
                  </div>
                );
              })()}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                onClick={() => deleteItem(item.id)} disabled={deleting === item.id}>
                {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ))}
          {!loading && items.length < total && (
            <Button variant="outline" className="w-full rounded-none font-mono text-xs mt-2" onClick={loadMore}>
              {t("content.loadMore")} ({items.length}/{total})
            </Button>
          )}
          {loading && <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>}
        </div>
      )}
    </div>
  );
}
