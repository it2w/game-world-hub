import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRegister } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedLogo } from "@/components/animated-logo";

type RegisterForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
};

export default function Register() {
  const { t } = useTranslation("auth");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const registerMutation = useRegister();

  const registerSchema = useMemo(
    () =>
      z.object({
        username: z.string().min(3, t("register.validation.usernameMin")).max(30),
        displayName: z.string().min(1, t("register.validation.displayNameRequired")).max(50),
        email: z
          .string()
          .min(1, t("register.validation.emailRequired"))
          .email(t("register.validation.emailInvalid"))
          .max(255),
        password: z
          .string()
          .min(16, t("register.validation.passwordMin"))
          .regex(
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$%^&*)(_\-+=\\/؟!])/,
            t("register.validation.passwordComplexity"),
          ),
      }),
    [t],
  );

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      displayName: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: RegisterForm) => {
    const payload = { ...data, email: data.email.trim() };
    registerMutation.mutate({ data: payload }, {
      onSuccess: (resp) => {
        if (resp.token) {
          login(resp.token);
        }
        toast({
          title: t("register.toasts.verificationCodeSent"),
          description: t("register.toasts.verificationCodeSentDescription"),
        });
        setLocation("/");
      },
      onError: (err) => {
        toast({
          title: t("register.toasts.registrationFailed"),
          description: (err.data as { error?: string })?.error || t("register.toasts.couldNotCreateAccount"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="w-full max-w-md bg-card border border-border p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary/10 border border-primary flex items-center justify-center mb-4 text-primary p-2">
            <AnimatedLogo className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-widest uppercase">{t("register.heading")}</h1>
          <p className="text-muted-foreground text-sm font-mono mt-2">{t("register.subheading")}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("register.form.username")}</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-username" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
                  </FormControl>
                  <FormMessage className="font-mono text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("register.form.displayName")}</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-display-name" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
                  </FormControl>
                  <FormMessage className="font-mono text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("register.form.email")}</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} data-testid="input-email" placeholder={t("register.form.emailPlaceholder")} className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
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
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">{t("register.form.password")}</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} data-testid="input-password" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
                  </FormControl>
                  <FormMessage className="font-mono text-xs" />
                </FormItem>
              )}
            />
            <Button type="submit" data-testid="button-submit" className="w-full rounded-none font-mono uppercase tracking-widest" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? t("register.buttons.creating") : t("register.buttons.establishIdentity")}
            </Button>
          </form>
        </Form>

        <div className="mt-8 text-center text-xs font-mono text-muted-foreground">
          {t("register.alreadyRegistered")} <Link href="/login" className="text-primary hover:underline">{t("register.returnToLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
