import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLogin } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const loginMutation = useLogin();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate({ data }, {
      onSuccess: (resp) => {
        login(resp.token);
        setLocation("/");
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="w-full max-w-md bg-card border border-border p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary/10 border border-primary flex items-center justify-center mb-4 text-primary">
            <Activity className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-widest uppercase">SYS_LOGIN</h1>
          <p className="text-muted-foreground text-sm font-mono mt-2">Enter credentials to proceed</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">Username</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-username" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
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
                    <Input type="password" {...field} data-testid="input-password" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
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

        <div className="mt-8 text-center text-xs font-mono text-muted-foreground">
          UNREGISTERED? <Link href="/register" className="text-primary hover:underline">CREATE RECORD</Link>
        </div>
      </div>
    </div>
  );
}
