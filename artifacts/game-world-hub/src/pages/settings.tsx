import { useGetMe, useUpdateProfile, useUpdateMyStatus, useLinkPlatform, useUnlinkPlatform, useGetUserPlatforms, getGetUserQueryKey, getGetMeQueryKey, getGetUserPlatformsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings2, User, Gamepad2, Link as LinkIcon, Trash2 } from "lucide-react";
import { useEffect } from "react";

const profileSchema = z.object({
  displayName: z.string().min(1).max(50),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().or(z.literal(""))
});

const statusSchema = z.object({
  status: z.enum(["online", "away", "busy", "offline"]),
  currentGame: z.string().optional()
});

const platformSchema = z.object({
  platform: z.enum(["steam", "xbox", "playstation", "epic", "battlenet", "nintendo"]),
  profileUrl: z.string().url(),
  username: z.string().optional()
});

export default function Settings() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: platforms } = useGetUserPlatforms(me?.id || 0, { query: { enabled: !!me?.id, queryKey: getGetUserPlatformsQueryKey(me?.id || 0) } });
  
  const updateProfile = useUpdateProfile();
  const updateStatus = useUpdateMyStatus();
  const linkPlatform = useLinkPlatform();
  const unlinkPlatform = useUnlinkPlatform();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: "", bio: "", avatarUrl: "" }
  });

  const statusForm = useForm<z.infer<typeof statusSchema>>({
    resolver: zodResolver(statusSchema),
    defaultValues: { status: "online", currentGame: "" }
  });

  const platformForm = useForm<z.infer<typeof platformSchema>>({
    resolver: zodResolver(platformSchema),
    defaultValues: { platform: "steam", profileUrl: "", username: "" }
  });

  useEffect(() => {
    if (me) {
      profileForm.reset({
        displayName: me.displayName,
        bio: me.bio || "",
        avatarUrl: me.avatarUrl || ""
      });
      statusForm.reset({
        status: me.status,
        currentGame: me.currentGame || ""
      });
    }
  }, [me, profileForm, statusForm]);

  const onProfileSubmit = (data: z.infer<typeof profileSchema>) => {
    if (!me) return;
    updateProfile.mutate(
      { userId: me.id, data },
      {
        onSuccess: () => {
          toast({ title: "Profile configuration saved" });
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
        }
      }
    );
  };

  const onStatusSubmit = (data: z.infer<typeof statusSchema>) => {
    updateStatus.mutate(
      { data },
      {
        onSuccess: () => toast({ title: "Status updated globally" })
      }
    );
  };

  const onPlatformSubmit = (data: z.infer<typeof platformSchema>) => {
    if (!me) return;
    linkPlatform.mutate(
      { userId: me.id, data },
      {
        onSuccess: () => {
          platformForm.reset();
          queryClient.invalidateQueries();
        }
      }
    );
  };

  const handleUnlink = (platformId: number) => {
    if (!me) return;
    unlinkPlatform.mutate(
      { userId: me.id, platformId },
      { onSuccess: () => queryClient.invalidateQueries() }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-primary" /> SYSTEM_CONFIG
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Identity Config */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <User className="w-4 h-4" /> IDENTITY_PARAMS
            </h2>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <FormField control={profileForm.control} name="displayName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">DISPLAY NAME</FormLabel>
                    <FormControl><Input {...field} className="font-mono rounded-none border-border bg-background" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={profileForm.control} name="avatarUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">AVATAR URL</FormLabel>
                    <FormControl><Input {...field} className="font-mono rounded-none border-border bg-background" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={profileForm.control} name="bio" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">BIOGRAPHY DATA</FormLabel>
                    <FormControl><Textarea {...field} className="font-mono rounded-none border-border bg-background resize-none" rows={3} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full font-mono rounded-none" disabled={updateProfile.isPending}>WRITE CONFIG</Button>
              </form>
            </Form>
          </div>

          {/* Status Override */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4" /> STATE_OVERRIDE
            </h2>
            <Form {...statusForm}>
              <form onSubmit={statusForm.handleSubmit(onStatusSubmit)} className="space-y-4">
                <FormField control={statusForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">PRESENCE</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="font-mono rounded-none border-border bg-background">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="font-mono rounded-none border-border bg-card">
                        <SelectItem value="online">ONLINE</SelectItem>
                        <SelectItem value="away">AWAY</SelectItem>
                        <SelectItem value="busy">DO NOT DISTURB</SelectItem>
                        <SelectItem value="offline">OFFLINE (STEALTH)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={statusForm.control} name="currentGame" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">ACTIVE PROCESS (GAME)</FormLabel>
                    <FormControl><Input {...field} className="font-mono rounded-none border-border bg-background" placeholder="None" /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={updateStatus.isPending}>BROADCAST STATE</Button>
              </form>
            </Form>
          </div>
        </div>

        {/* Platform Integration */}
        <div className="space-y-8">
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> NETWORK_LINKS
            </h2>
            
            <div className="space-y-4 mb-8">
              {platforms?.map(p => (
                <div key={p.id} className="p-3 border border-border bg-background flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm uppercase">{p.platform}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.username || 'Linked Account'}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => handleUnlink(p.id)} disabled={unlinkPlatform.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="font-mono text-xs mb-4">ESTABLISH NEW LINK</h3>
              <Form {...platformForm}>
                <form onSubmit={platformForm.handleSubmit(onPlatformSubmit)} className="space-y-4">
                  <FormField control={platformForm.control} name="platform" render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-mono rounded-none border-border bg-background">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="font-mono rounded-none border-border bg-card">
                          <SelectItem value="steam">Steam</SelectItem>
                          <SelectItem value="xbox">Xbox Live</SelectItem>
                          <SelectItem value="playstation">PSN</SelectItem>
                          <SelectItem value="epic">Epic Games</SelectItem>
                          <SelectItem value="battlenet">Battle.net</SelectItem>
                          <SelectItem value="nintendo">Nintendo</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={platformForm.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormControl><Input {...field} placeholder="Network ID (Username)" className="font-mono rounded-none border-border bg-background" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={platformForm.control} name="profileUrl" render={({ field }) => (
                    <FormItem>
                      <FormControl><Input {...field} placeholder="https://..." className="font-mono rounded-none border-border bg-background" /></FormControl>
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={linkPlatform.isPending}>EXECUTE LINK</Button>
                </form>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
