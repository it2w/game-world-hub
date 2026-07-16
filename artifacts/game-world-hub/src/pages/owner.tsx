import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Lock, Mail, KeyRound, AlertTriangle } from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface OwnerSession {
  token: string;
  username: string;
  ownerId: number;
}

export default function Owner() {
  const { t } = useTranslation("owner");
  const { toast } = useToast();
  const [session, setSession] = useState<OwnerSession | null>(() => {
    const raw = localStorage.getItem("gwh_owner_session");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OwnerSession;
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState<"login" | "reset" | "dashboard">(() =>
    localStorage.getItem("gwh_owner_session") ? "dashboard" : "login"
  );
  const [ownerInfo, setOwnerInfo] = useState<{ username: string; email: string | null; emailVerified: boolean } | null>(null);

  useEffect(() => {
    if (session) {
      setMode("dashboard");
      fetchOwnerInfo(session.token);
    }
  }, [session]);

  const fetchOwnerInfo = async (token: string) => {
    try {
      const res = await fetch(`${getApiUrl()}owner/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("session expired");
      const data = await res.json();
      setOwnerInfo(data);
    } catch {
      handleLogout();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gwh_owner_session");
    setSession(null);
    setOwnerInfo(null);
    setMode("login");
  };

  const apiCall = async (path: string, token: string, body: unknown) => {
    const res = await fetch(`${getApiUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md border border-primary/30 bg-card p-8 shadow-2xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold font-mono tracking-tighter uppercase">{t("title")}</h1>
        </div>
        {mode === "login" && <LoginForm onLogin={(s) => setSession(s)} onReset={() => setMode("reset")} t={t} toast={toast} />}
        {mode === "reset" && <ResetForm onBack={() => setMode("login")} t={t} toast={toast} />}
        {mode === "dashboard" && session && ownerInfo && (
          <Dashboard
            session={session}
            ownerInfo={ownerInfo}
            onLogout={handleLogout}
            onRefresh={() => fetchOwnerInfo(session.token)}
            apiCall={apiCall}
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

function LoginForm({ onLogin, onReset, t, toast }: { onLogin: (s: OwnerSession) => void; onReset: () => void; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"] }) {
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
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("loginFailed"));
      const session: OwnerSession = { token: data.token, username: data.owner.username, ownerId: data.owner.id };
      localStorage.setItem("gwh_owner_session", JSON.stringify(session));
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
        <Input value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono rounded-none border-border bg-background" />
      </div>
      <div>
        <label className="font-mono text-xs uppercase block mb-1.5">{t("password")}</label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono rounded-none border-border bg-background" />
      </div>
      <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
        <Lock className="w-4 h-4 me-2" /> {t("login")}
      </Button>
      <Button type="button" variant="ghost" className="w-full rounded-none font-mono text-xs" onClick={onReset}>
        {t("forgotPassword")}
      </Button>
    </form>
  );
}

function ResetForm({ onBack, t, toast }: { onBack: () => void; t: (k: string) => string; toast: ReturnType<typeof useToast>["toast"] }) {
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
        body: JSON.stringify({ username }),
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
        body: JSON.stringify({ username, code, newPassword }),
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
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("username")} className="font-mono rounded-none border-border bg-background" />
          <Button type="submit" className="w-full rounded-none font-mono" disabled={loading}>
            <Mail className="w-4 h-4 me-2" /> {t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirmReset} className="space-y-4">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("resetCode")} className="font-mono rounded-none border-border bg-background" />
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("newPassword")} className="font-mono rounded-none border-border bg-background" />
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

function Dashboard({ session, ownerInfo, onLogout, onRefresh, apiCall, t, toast }: {
  session: OwnerSession;
  ownerInfo: { username: string; email: string | null; emailVerified: boolean };
  onLogout: () => void;
  onRefresh: () => void;
  apiCall: (path: string, token: string, body: unknown) => Promise<unknown>;
  t: (k: string) => string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState(ownerInfo.email || "");
  const [loadingPass, setLoadingPass] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingPass(true);
    try {
      await apiCall("owner/change-password", session.token, { currentPassword, newPassword });
      toast({ title: t("passwordChanged") });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingPass(false);
    }
  };

  const setOwnerEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingEmail(true);
    try {
      await apiCall("owner/set-email", session.token, { email });
      toast({ title: t("emailSet") });
      onRefresh();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-primary/30 bg-background p-4">
        <div className="font-mono text-xs uppercase text-primary mb-2">{t("loggedInAs")}</div>
        <div className="font-mono text-sm">{ownerInfo.username}</div>
        {ownerInfo.email ? (
          <div className="font-mono text-xs text-muted-foreground mt-1">{ownerInfo.email}</div>
        ) : (
          <div className="flex items-center gap-2 mt-2 text-yellow-500">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-mono text-[10px] uppercase">{t("noEmailWarning")}</span>
          </div>
        )}
      </div>

      <form onSubmit={changePassword} className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-2">
          <Lock className="w-4 h-4" /> {t("changePassword")}
        </h2>
        <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t("currentPassword")} className="font-mono rounded-none border-border bg-background" />
        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("newPassword")} className="font-mono rounded-none border-border bg-background" />
        <Button type="submit" className="w-full rounded-none font-mono" disabled={loadingPass}>
          {t("changePassword")}
        </Button>
      </form>

      <form onSubmit={setOwnerEmail} className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-2">
          <Mail className="w-4 h-4" /> {t("emailLink")}
        </h2>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} className="font-mono rounded-none border-border bg-background" />
        <Button type="submit" className="w-full rounded-none font-mono" variant="outline" disabled={loadingEmail}>
          {t("saveEmail")}
        </Button>
      </form>

      <Button variant="outline" className="w-full rounded-none font-mono text-destructive border-destructive/50 hover:bg-destructive/10" onClick={onLogout}>
        {t("logout")}
      </Button>
    </div>
  );
}
