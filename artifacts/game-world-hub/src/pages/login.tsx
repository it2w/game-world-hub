import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useLogin,
  useVerifyTwoFactorLogin,
  useRequestPasswordReset,
  useConfirmPasswordReset,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedLogo } from "@/components/animated-logo";

type LoginForm = { username: string; password: string };
type View = "credentials" | "twofa" | "reset_request" | "reset_confirm";

const inputClass = "font-mono bg-background border-border focus-visible:ring-primary rounded-none";

export default function Login() {
  const { t } = useTranslation("auth");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();

  const loginSchema = useMemo(
    () =>
      z.object({
        username: z.string().min(3, t("login.validation.usernameMin")),
        password: z.string().min(6, t("login.validation.passwordMin")),
      }),
    [t],
  );

  const loginMutation = useLogin();
  const verify2fa = useVerifyTwoFactorLogin();
  const requestReset = useRequestPasswordReset();
  const confirmReset = useConfirmPasswordReset();

  const [view, setView] = useState<View>("credentials");
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorMethod, setTwoFactorMethod] = useState<"email" | "totp" | null>(null);
  const [twofaCode, setTwofaCode] = useState("");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate({ data }, {
      onSuccess: (resp) => {
        if (resp.requiresTwoFactor && resp.challengeToken) {
          setChallengeToken(resp.challengeToken);
          setTwoFactorMethod(resp.twoFactorMethod ?? null);
          setTwofaCode("");
          setView("twofa");
          return;
        }
        if (resp.token) {
          login(resp.token);
          setLocation("/");
        }
      },
      onError: (err) => {
        toast({
          title: t("login.toasts.accessDenied"),
          description: (err.data as { error?: string })?.error || t("login.toasts.loginFailed"),
          variant: "destructive",
        });
      }
    });
  };

  const submitTwoFactor = (e: React.FormEvent) => {
    e.preventDefault();
    verify2fa.mutate({ data: { challengeToken, code: twofaCode.trim() } }, {
      onSuccess: (resp) => {
        if (resp.token) {
          login(resp.token);
          setLocation("/");
        }
      },
      onError: (err) => {
        toast({
          title: t("login.toasts.verificationFailed"),
          description: (err.data as { error?: string })?.error || t("login.toasts.invalidOrExpiredCode"),
          variant: "destructive",
        });
      },
    });
  };

  const submitResetRequest = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate({ data: { identifier: resetIdentifier.trim() } }, {
      onSuccess: () => {
        toast({
          title: t("login.toasts.requestSent"),
          description: t("login.toasts.requestSentDescription"),
        });
        setResetCode("");
        setResetPassword("");
        setView("reset_confirm");
      },
      onError: () => {
        toast({ title: t("login.toasts.requestFailed"), description: t("login.toasts.requestFailedDescription"), variant: "destructive" });
      },
    });
  };

  const submitResetConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    confirmReset.mutate(
      { data: { identifier: resetIdentifier.trim(), code: resetCode.trim(), newPassword: resetPassword } },
      {
        onSuccess: () => {
          toast({ title: t("login.toasts.accessCodeUpdated"), description: t("login.toasts.accessCodeUpdatedDescription") });
          setView("credentials");
        },
        onError: (err) => {
          toast({
            title: t("login.toasts.resetFailed"),
            description: (err.data as { error?: string })?.error || t("login.toasts.invalidOrExpiredCode"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const heading =
    view === "credentials" ? t("login.heading.credentials") :
    view === "twofa" ? t("login.heading.twofa") :
    view === "reset_request" ? t("login.heading.resetRequest") : t("login.heading.resetConfirm");

  const subheading =
    view === "credentials" ? t("login.subheading.credentials") :
    view === "twofa"
      ? (twoFactorMethod === "totp" ? t("login.subheading.twofaTotp") : t("login.subheading.twofaEmail"))
      : view === "reset_request" ? t("login.subheading.resetRequest") : t("login.subheading.resetConfirm");

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-border p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-14 bg-primary/10 border border-primary flex items-center justify-center mb-4 text-primary p-2">
            <AnimatedLogo className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-widest uppercase">{heading}</h1>
          <p className="text-muted-foreground text-sm font-mono mt-2">{subheading}</p>
        </div>

        {view === "credentials" && (
          <>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("login.form.username")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-username" className={inputClass} />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("login.form.password")}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} data-testid="input-password" className={inputClass} />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button type="submit" data-testid="button-submit" className="w-full rounded-none font-mono uppercase tracking-widest" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? t("login.buttons.authenticating") : t("login.buttons.initialize")}
                </Button>
              </form>
            </Form>

            <div className="mt-4 text-center">
              <button
                type="button"
                data-testid="link-forgot-password"
                onClick={() => setView("reset_request")}
                className="text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
              >
                {t("login.forgotPassword")}
              </button>
            </div>

            <div className="mt-6 text-center text-xs font-mono text-muted-foreground">
              {t("login.unregistered")} <Link href="/register" className="text-primary hover:underline">{t("login.createRecord")}</Link>
            </div>
          </>
        )}

        {view === "twofa" && (
          <form onSubmit={submitTwoFactor} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">{t("login.twofa.codeLabel")}</label>
              <Input
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                data-testid="input-2fa-code"
                className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
              />
            </div>
            <Button
              type="submit"
              data-testid="button-verify-2fa"
              className="w-full rounded-none font-mono uppercase tracking-widest"
              disabled={verify2fa.isPending || twofaCode.length !== 6}
            >
              {verify2fa.isPending ? t("login.buttons.verifying") : t("login.buttons.verify")}
            </Button>
            <button
              type="button"
              data-testid="link-back-login"
              onClick={() => setView("credentials")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              {t("login.twofa.backToLogin")}
            </button>
          </form>
        )}

        {view === "reset_request" && (
          <form onSubmit={submitResetRequest} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">{t("login.resetRequest.identifierLabel")}</label>
              <Input
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                autoFocus
                data-testid="input-reset-identifier"
                className={inputClass}
              />
              <p className="text-xs font-mono text-muted-foreground">
                {t("login.resetRequest.hint")}
              </p>
            </div>
            <Button
              type="submit"
              data-testid="button-request-reset"
              className="w-full rounded-none font-mono uppercase tracking-widest"
              disabled={requestReset.isPending || resetIdentifier.trim().length === 0}
            >
              {requestReset.isPending ? t("login.buttons.requesting") : t("login.buttons.sendResetCode")}
            </Button>
            <button
              type="button"
              data-testid="link-back-login-2"
              onClick={() => setView("credentials")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              {t("login.resetRequest.backToLogin")}
            </button>
          </form>
        )}

        {view === "reset_confirm" && (
          <form onSubmit={submitResetConfirm} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">{t("login.resetConfirm.codeLabel")}</label>
              <Input
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
                data-testid="input-reset-code"
                className={`${inputClass} text-center text-xl tracking-[0.4em]`}
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">{t("login.resetConfirm.newPasswordLabel")}</label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                data-testid="input-reset-password"
                className={inputClass}
              />
            </div>
            <Button
              type="submit"
              data-testid="button-confirm-reset"
              className="w-full rounded-none font-mono uppercase tracking-widest"
              disabled={confirmReset.isPending || resetCode.length !== 6 || resetPassword.length < 6}
            >
              {confirmReset.isPending ? t("login.buttons.updating") : t("login.buttons.setNewPassword")}
            </Button>
            <button
              type="button"
              data-testid="link-back-reset"
              onClick={() => setView("reset_request")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              {t("login.resetConfirm.resendCode")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
