import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Mail, KeyRound, LogOut, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface OwnerSession {
  token: string;
  username: string;
  ownerId: number;
}

interface OwnerInfo {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
}

function getStoredSession(): OwnerSession | null {
  try {
    const raw = localStorage.getItem("gwh_owner_session");
    return raw ? (JSON.parse(raw) as OwnerSession) : null;
  } catch {
    return null;
  }
}

export default function Owner() {
  const { t } = useTranslation("owner");
  const { toast } = useToast();

  const [session, setSession] = useState<OwnerSession | null>(getStoredSession);
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [loading, setLoading] = useState(!!getStoredSession());
  const [mode, setMode] = useState<"dashboard" | "login" | "reset">(
    getStoredSession() ? "dashboard" : "login"
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem("gwh_owner_session");
    setSession(null);
    setOwnerInfo(null);
    setMode("login");
  }, []);

  const loadOwnerInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${getApiUrl()}owner/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        // Token expired — force re-login
        handleLogout();
        return;
      }
      if (!res.ok) return; // transient error — stay on current view, don't log out
      const data: OwnerInfo = await res.json();
      setOwnerInfo(data);
      setMode("dashboard");
    } catch {
      // network error — stay on current view
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (session) {
      loadOwnerInfo(session.token);
    } else {
      setLoading(false);
    }
  }, [session, loadOwnerInfo]);

  const handleLogin = (s: OwnerSession) => {
    localStorage.setItem("gwh_owner_session", JSON.stringify(s));
    setSession(s);
    setLoading(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md border border-primary/30 bg-card p-8 shadow-2xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold font-mono tracking-tighter uppercase">{t("title")}</h1>
        </div>

        {mode === "login" && (
          <LoginForm
            onLogin={handleLogin}
            onReset={() => setMode("reset")}
            t={t}
            toast={toast}
          />
        )}

        {mode === "reset" && (
          <ResetForm
            onBack={() => setMode("login")}
            t={t}
            toast={toast}
          />
        )}

        {mode === "dashboard" && session && ownerInfo && (
          <Dashboard
            session={session}
            ownerInfo={ownerInfo}
            onLogout={handleLogout}
            onEmailSaved={() => loadOwnerInfo(session.token)}
            t={t}
            toast={toast}
          />
        )}

        <div className="mt-6 text-center font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          {t("hiddenWarning")}
        </div>
      </div>
    </div>
  );
}

/* ─── Login ─────────────────────────────────────────────────────────────── */

function LoginForm({
  onLogin,
  onReset,
  t,
  toast,
}: {
  onLogin: (s: OwnerSession) => void;
  onReset: () => void;
  t: (k: string) => string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}owner/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("loginFailed"));
      const session: OwnerSession = {
        token: data.token,
        username: data.owner.username,
        ownerId: data.owner.id,
      };
      onLogin(session);
      toast({ title: t("loginSuccess") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="font-mono text-xs uppercase block mb-1.5">{t("username")}</label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="font-mono rounded-none border-border bg-background"
        />
      </div>
      <div>
        <label className="font-mono text-xs uppercase block mb-1.5">{t("password")}</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="font-mono rounded-none border-border bg-background"
        />
      </div>
      <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
        {t("login")}
      </Button>
      <Button type="button" variant="ghost" className="w-full rounded-none font-mono text-xs" onClick={onReset}>
        {t("forgotPassword")}
      </Button>
    </form>
  );
}

/* ─── Reset ──────────────────────────────────────────────────────────────── */

function ResetForm({
  onBack,
  t,
  toast,
}: {
  onBack: () => void;
  t: (k: string) => string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [loading, setLoading] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}owner/reset-password-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!res.ok) throw new Error(t("requestFailed"));
      setStep("confirm");
      toast({ title: t("codeSent") });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}owner/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("resetFailed"));
      toast({ title: t("resetSuccess") });
      onBack();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {step === "request" ? (
        <form onSubmit={requestReset} className="space-y-4">
          <div className="font-mono text-xs text-muted-foreground">{t("resetDesc")}</div>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("username")}
            className="font-mono rounded-none border-border bg-background"
          />
          <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
            <Mail className="w-4 h-4 me-2" /> {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("resetCode")}
            className="font-mono rounded-none border-border bg-background"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("newPassword")}
            autoComplete="new-password"
            className="font-mono rounded-none border-border bg-background"
          />
          <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
            <KeyRound className="w-4 h-4 me-2" /> {t("resetPassword")}
          </Button>
        </form>
      )}
      <Button type="button" variant="ghost" className="w-full rounded-none font-mono text-xs" onClick={onBack}>
        {t("backToLogin")}
      </Button>
    </div>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

function Dashboard({
  session,
  ownerInfo,
  onLogout,
  onEmailSaved,
  t,
  toast,
}: {
  session: OwnerSession;
  ownerInfo: OwnerInfo;
  onLogout: () => void;
  onEmailSaved: () => void;
  t: (k: string) => string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [email, setEmail] = useState(ownerInfo.email ?? "");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingPass, setLoadingPass] = useState(false);

  // Keep email field in sync if ownerInfo changes
  useEffect(() => {
    setEmail(ownerInfo.email ?? "");
  }, [ownerInfo.email]);

  const setOwnerEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingEmail(true);
    try {
      const res = await fetch(`${getApiUrl()}owner/set-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: t("emailSet") });
      onEmailSaved();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingEmail(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPass(true);
    try {
      const res = await fetch(`${getApiUrl()}owner/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: t("passwordChanged") });
      setCurrentPassword("");
      setNewPassword("");
      setShowChangePass(false);
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingPass(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Info card */}
      <div className="border border-primary/30 bg-background p-4 space-y-1">
        <div className="font-mono text-xs uppercase text-primary">{t("loggedInAs")}</div>
        <div className="font-mono text-sm font-semibold">{ownerInfo.username}</div>
        {ownerInfo.email ? (
          <div className="font-mono text-xs text-muted-foreground">{ownerInfo.email}</div>
        ) : (
          <div className="flex items-center gap-2 text-yellow-500 pt-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="font-mono text-[10px] uppercase">{t("noEmailWarning")}</span>
          </div>
        )}
      </div>

      {/* Email */}
      <form onSubmit={setOwnerEmail} className="space-y-2">
        <label className="font-mono text-xs uppercase text-primary flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> {t("emailLink")}
        </label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          className="font-mono rounded-none border-border bg-background"
        />
        <Button type="submit" variant="outline" className="w-full rounded-none font-mono" disabled={loadingEmail}>
          {loadingEmail ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
          {t("saveEmail")}
        </Button>
      </form>

      {/* Change password — collapsed by default */}
      <div className="border border-border/50">
        <button
          type="button"
          onClick={() => setShowChangePass((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" /> {t("changePassword")}
          </span>
          {showChangePass ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showChangePass && (
          <form onSubmit={changePassword} className="px-4 pb-4 space-y-2 border-t border-border/50">
            <div className="pt-3">
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("currentPassword")}
                autoComplete="current-password"
                className="font-mono rounded-none border-border bg-background mb-2"
              />
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("newPassword")}
                autoComplete="new-password"
                className="font-mono rounded-none border-border bg-background"
              />
            </div>
            <Button type="submit" className="w-full rounded-none font-mono" disabled={loadingPass}>
              {loadingPass ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
              {t("changePassword")}
            </Button>
          </form>
        )}
      </div>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full rounded-none font-mono text-destructive border-destructive/50 hover:bg-destructive/10"
        onClick={onLogout}
      >
        <LogOut className="w-4 h-4 me-2" /> {t("logout")}
      </Button>
    </div>
  );
}
