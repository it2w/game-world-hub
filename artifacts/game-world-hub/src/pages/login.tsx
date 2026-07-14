import { useState } from "react";
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

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type View = "credentials" | "twofa" | "reset_request" | "reset_confirm";

const inputClass = "font-mono bg-background border-border focus-visible:ring-primary rounded-none";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();

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
          title: "Access Denied",
          description: (err.data as { error?: string })?.error || "Login failed",
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
          title: "Verification Failed",
          description: (err.data as { error?: string })?.error || "Invalid or expired code",
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
          title: "Request Sent",
          description: "If that account has a verified email, a reset code is on its way.",
        });
        setResetCode("");
        setResetPassword("");
        setView("reset_confirm");
      },
      onError: () => {
        toast({ title: "Request Failed", description: "Try again in a moment", variant: "destructive" });
      },
    });
  };

  const submitResetConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    confirmReset.mutate(
      { data: { identifier: resetIdentifier.trim(), code: resetCode.trim(), newPassword: resetPassword } },
      {
        onSuccess: () => {
          toast({ title: "Access Code Updated", description: "Log in with your new password." });
          setView("credentials");
        },
        onError: (err) => {
          toast({
            title: "Reset Failed",
            description: (err.data as { error?: string })?.error || "Invalid or expired code",
            variant: "destructive",
          });
        },
      },
    );
  };

  const heading =
    view === "credentials" ? "SYS_LOGIN" :
    view === "twofa" ? "VERIFY_2FA" :
    view === "reset_request" ? "RESET_ACCESS" : "NEW_ACCESS_CODE";

  const subheading =
    view === "credentials" ? "Enter credentials to proceed" :
    view === "twofa"
      ? (twoFactorMethod === "totp" ? "Enter the code from your authenticator app" : "A login code was sent to your email")
      : view === "reset_request" ? "Enter your username or email" : "Enter the emailed code and a new password";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-border p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary/10 border border-primary flex items-center justify-center mb-4 text-primary p-2">
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
                      <FormLabel className="font-mono text-xs uppercase tracking-wider">Username</FormLabel>
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
                      <FormLabel className="font-mono text-xs uppercase tracking-wider">Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} data-testid="input-password" className={inputClass} />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button type="submit" data-testid="button-submit" className="w-full rounded-none font-mono uppercase tracking-widest" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Authenticating..." : "Initialize"}
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
                Forgot access code?
              </button>
            </div>

            <div className="mt-6 text-center text-xs font-mono text-muted-foreground">
              UNREGISTERED? <Link href="/register" className="text-primary hover:underline">CREATE RECORD</Link>
            </div>
          </>
        )}

        {view === "twofa" && (
          <form onSubmit={submitTwoFactor} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">6-Digit Code</label>
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
              {verify2fa.isPending ? "Verifying..." : "Verify"}
            </Button>
            <button
              type="button"
              data-testid="link-back-login"
              onClick={() => setView("credentials")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              ← Back to login
            </button>
          </form>
        )}

        {view === "reset_request" && (
          <form onSubmit={submitResetRequest} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">Username or Email</label>
              <Input
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                autoFocus
                data-testid="input-reset-identifier"
                className={inputClass}
              />
              <p className="text-xs font-mono text-muted-foreground">
                A reset code is emailed only to accounts with a verified email.
              </p>
            </div>
            <Button
              type="submit"
              data-testid="button-request-reset"
              className="w-full rounded-none font-mono uppercase tracking-widest"
              disabled={requestReset.isPending || resetIdentifier.trim().length === 0}
            >
              {requestReset.isPending ? "Requesting..." : "Send Reset Code"}
            </Button>
            <button
              type="button"
              data-testid="link-back-login-2"
              onClick={() => setView("credentials")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              ← Back to login
            </button>
          </form>
        )}

        {view === "reset_confirm" && (
          <form onSubmit={submitResetConfirm} className="space-y-6">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider">Reset Code</label>
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
              <label className="font-mono text-xs uppercase tracking-wider">New Password</label>
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
              {confirmReset.isPending ? "Updating..." : "Set New Password"}
            </Button>
            <button
              type="button"
              data-testid="link-back-reset"
              onClick={() => setView("reset_request")}
              className="w-full text-center text-xs font-mono text-muted-foreground hover:text-primary uppercase tracking-wider"
            >
              ← Re-send code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
