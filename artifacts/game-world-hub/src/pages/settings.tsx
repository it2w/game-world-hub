import { useGetMe, useUpdateProfile, useUpdateMyStatus, useLinkPlatform, useUnlinkPlatform, useGetUserPlatforms, useGetUserContentLinks, useLinkContent, useUnlinkContent, getGetUserQueryKey, getGetMeQueryKey, getGetUserPlatformsQueryKey, getGetUserContentLinksQueryKey } from "@workspace/api-client-react";
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
import { Settings2, User, Gamepad2, Link as LinkIcon, Trash2, Monitor, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { CONTENT_PLATFORMS, CONTENT_PLATFORM_KEYS, contentMeta } from "@/lib/content-platforms";

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

const contentSchema = z.object({
  platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
  handle: z.string().min(1, "Required").max(100)
});

export default function Settings() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: platforms } = useGetUserPlatforms(me?.id || 0, { query: { enabled: !!me?.id, queryKey: getGetUserPlatformsQueryKey(me?.id || 0) } });
  
  const updateProfile = useUpdateProfile();
  const updateStatus = useUpdateMyStatus();
  const linkPlatform = useLinkPlatform();
  const unlinkPlatform = useUnlinkPlatform();

  const { data: contentLinks } = useGetUserContentLinks(me?.id || 0, { query: { enabled: !!me?.id, queryKey: getGetUserContentLinksQueryKey(me?.id || 0) } });
  const linkContent = useLinkContent();
  const unlinkContent = useUnlinkContent();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Desktop-only: launch at startup state
  const isElectron = !!window.electronAPI;
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [startupLoading, setStartupLoading] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.getLoginItemSettings().then(s => setOpenAtLogin(s.openAtLogin)).catch(() => {});
  }, [isElectron]);

  const handleToggleStartup = async () => {
    if (!isElectron) return;
    setStartupLoading(true);
    try {
      const result = await window.electronAPI!.setLoginItem(!openAtLogin);
      setOpenAtLogin(result.openAtLogin);
      toast({ title: result.openAtLogin ? 'Will launch on startup' : 'Startup launch disabled' });
    } catch {
      toast({ title: 'Failed to update startup setting', variant: 'destructive' });
    } finally {
      setStartupLoading(false);
    }
  };

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

  const contentForm = useForm<z.infer<typeof contentSchema>>({
    resolver: zodResolver(contentSchema),
    defaultValues: { platform: "twitch", handle: "" }
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

  const onContentSubmit = (data: z.infer<typeof contentSchema>) => {
    if (!me) return;
    linkContent.mutate(
      { userId: me.id, data },
      {
        onSuccess: () => {
          contentForm.reset({ platform: data.platform, handle: "" });
          toast({ title: `${contentMeta(data.platform)?.label ?? data.platform} channel linked` });
          queryClient.invalidateQueries({ queryKey: getGetUserContentLinksQueryKey(me.id) });
        },
        onError: () => toast({ title: "Failed to link channel", variant: "destructive" }),
      }
    );
  };

  const handleUnlinkContent = (linkId: number) => {
    if (!me) return;
    unlinkContent.mutate(
      { userId: me.id, linkId },
      {
        onSuccess: () => {
          toast({ title: "Channel unlinked" });
          queryClient.invalidateQueries({ queryKey: getGetUserContentLinksQueryKey(me.id) });
        },
        onError: () => toast({ title: "Failed to unlink channel", variant: "destructive" }),
      }
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

        {/* Platform Integration + Desktop */}
        <div className="space-y-8">
          {/* Desktop-only: launch at startup */}
          {isElectron && (
            <div className="bg-card border border-border p-6">
              <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                <Monitor className="w-4 h-4" /> DESKTOP_OPTIONS
              </h2>
              <div className="flex items-center justify-between p-3 border border-border bg-background">
                <div>
                  <div className="font-mono text-sm">LAUNCH ON STARTUP</div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5">
                    Start Game World Hub automatically when Windows boots
                  </div>
                </div>
                <Button
                  variant={openAtLogin ? "default" : "outline"}
                  size="sm"
                  className="font-mono rounded-none text-xs h-8 min-w-[80px]"
                  onClick={handleToggleStartup}
                  disabled={startupLoading}
                >
                  {openAtLogin ? 'ENABLED' : 'DISABLED'}
                </Button>
              </div>
            </div>
          )}

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

          {/* Content Channels */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Radio className="w-4 h-4" /> CONTENT_CHANNELS
            </h2>

            <div className="space-y-3 mb-8">
              {!contentLinks || contentLinks.length === 0 ? (
                <div className="text-sm font-mono text-muted-foreground italic">NO CHANNELS BROADCASTING</div>
              ) : (
                contentLinks.map(c => {
                  const meta = contentMeta(c.platform);
                  const Icon = meta?.icon ?? Radio;
                  return (
                    <div key={c.id} className="p-3 border border-border bg-background flex items-center justify-between" style={{ borderLeft: `3px solid ${meta?.color ?? "var(--border)"}` }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" style={{ color: meta?.color }} />
                        <div className="min-w-0">
                          <div className="font-bold text-sm">{meta?.label ?? c.platform}</div>
                          <a href={c.channelUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-primary truncate block">{c.handle}</a>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0" onClick={() => handleUnlinkContent(c.id)} disabled={unlinkContent.isPending}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="font-mono text-xs mb-4">GO LIVE // LINK A CHANNEL</h3>
              <Form {...contentForm}>
                <form onSubmit={contentForm.handleSubmit(onContentSubmit)} className="space-y-4">
                  <FormField control={contentForm.control} name="platform" render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-mono rounded-none border-border bg-background">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="font-mono rounded-none border-border bg-card">
                          {CONTENT_PLATFORM_KEYS.map(key => (
                            <SelectItem key={key} value={key}>{CONTENT_PLATFORMS[key].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={contentForm.control} name="handle" render={({ field }) => (
                    <FormItem>
                      <FormControl><Input {...field} placeholder={CONTENT_PLATFORMS[contentForm.watch("platform")].placeholder} className="font-mono rounded-none border-border bg-background" /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={linkContent.isPending}>LINK CHANNEL</Button>
                </form>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
