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

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30),
  displayName: z.string().min(1, "Display name is required").max(50),
  email: z.string().email("Enter a valid email").max(255).optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const registerMutation = useRegister();

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
    const email = data.email?.trim();
    const payload = { ...data, email: email ? email : undefined };
    registerMutation.mutate({ data: payload }, {
      onSuccess: (resp) => {
        if (resp.token) {
          login(resp.token);
        }
        if (payload.email) {
          toast({
            title: "Verification Code Sent",
            description: "Check your email, then verify it from Settings.",
          });
        }
        setLocation("/");
      },
      onError: (err) => {
        toast({
          title: "Registration Failed",
          description: (err.data as { error?: string })?.error || "Could not create account",
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
          <h1 className="text-2xl font-bold font-mono tracking-widest uppercase">NEW_RECORD</h1>
          <p className="text-muted-foreground text-sm font-mono mt-2">Establish system identity</p>
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
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">Display Name</FormLabel>
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
                  <FormLabel className="font-mono text-xs uppercase tracking-wider">Email (Optional — for account recovery)</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} data-testid="input-email" placeholder="you@domain.com" className="font-mono bg-background border-border focus-visible:ring-primary rounded-none" />
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
            <Button type="submit" data-testid="button-submit" className="w-full rounded-none font-mono uppercase tracking-widest" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "Creating..." : "Establish Identity"}
            </Button>
          </form>
        </Form>

        <div className="mt-8 text-center text-xs font-mono text-muted-foreground">
          ALREADY REGISTERED? <Link href="/login" className="text-primary hover:underline">RETURN TO LOGIN</Link>
        </div>
      </div>
    </div>
  );
}
