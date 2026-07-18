import { useGetMe, useGetMePro, useUpdateProfile, useUpdateMyStatus, useLinkPlatform, useUnlinkPlatform, useGetUserPlatforms, useGetUserContentLinks, useLinkContent, useUnlinkContent, useSetMyEmail, useVerifyMyEmail, useSetupTwoFactor, useEnableTwoFactor, useDisableTwoFactor, useRedeemActivationCode, getGetUserQueryKey, getGetMeQueryKey, getGetUserPlatformsQueryKey, getGetUserContentLinksQueryKey, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings2, User, Gamepad2, Link as LinkIcon, Trash2, Monitor, Radio, Mail, ShieldCheck, KeyRound, Upload, MessageSquare, Globe, Trophy, Ticket, Crown, Gift, Bot, Palette, Mic, Lock, Unlock, Save, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_PLATFORMS, CONTENT_PLATFORM_KEYS, contentMeta } from "@/lib/content-platforms";
import { QRCodeSVG } from "qrcode.react";
import { useImageUpload } from "@/hooks/use-image-upload";
import { displayImageUrl } from "@/lib/image-url";

const makeImageRefSchema = (msg: string) => z
  .string()
  .max(500)
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("/objects/") ||
      v.startsWith("/api/storage/objects/"),
    msg,
  );

const displayNameSchema = z.object({ displayName: z.string().min(1).max(50) });
const bioSchema = z.object({ bio: z.string().max(500).optional() });
// avatarUrl / bannerUrl forms are defined inside the component (need imageRefSchema)

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
  handle: z.string().min(1).max(100)
});

export default function Settings() {
  const { t } = useTranslation("settings");
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

  // ── Account security (email + 2FA) ─────────────────────────────
  const setMyEmail = useSetMyEmail();
  const verifyMyEmail = useVerifyMyEmail();
  const setupTwoFactor = useSetupTwoFactor();
  const enableTwoFactor = useEnableTwoFactor();
  const disableTwoFactor = useDisableTwoFactor();
  const redeemCode = useRedeemActivationCode();
  const { upload, isUploading } = useImageUpload();

  const [emailInput, setEmailInput] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [twofaPanel, setTwofaPanel] = useState<"totp" | "email" | null>(null);
  const [totpInfo, setTotpInfo] = useState<{ secret?: string; otpauthUrl?: string }>({});
  const [twofaCode, setTwofaCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  const errText = (err: unknown, fallback: string) =>
    (err as { data?: { error?: string } })?.data?.error || fallback;

  const handleSetEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    setMyEmail.mutate({ data: { email } }, {
      onSuccess: () => {
        toast({ title: t("toasts.verificationCodeSent"), description: t("toasts.verificationCodeSentDesc") });
        setEmailInput("");
        setEmailCode("");
        refreshMe();
      },
      onError: (err) => toast({ title: t("toasts.couldntSetEmail"), description: errText(err, t("toasts.couldntSetEmailDesc")), variant: "destructive" }),
    });
  };

  const handleResendCode = () => {
    if (!me?.email) return;
    setMyEmail.mutate({ data: { email: me.email } }, {
      onSuccess: () => toast({ title: t("toasts.codeResent"), description: t("toasts.codeResentDesc") }),
      onError: (err) => toast({ title: t("toasts.couldntResendCode"), description: errText(err, t("toasts.couldntResendCodeDesc")), variant: "destructive" }),
    });
  };

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    verifyMyEmail.mutate({ data: { code: emailCode.trim() } }, {
      onSuccess: () => {
        toast({ title: t("toasts.emailVerified") });
        setEmailCode("");
        refreshMe();
      },
      onError: (err) => toast({ title: t("toasts.verificationFailed"), description: errText(err, t("toasts.verificationFailedDesc")), variant: "destructive" }),
    });
  };

  const handleSetup2fa = (method: "totp" | "email") => {
    setupTwoFactor.mutate({ data: { method } }, {
      onSuccess: (resp) => {
        setTwofaPanel(method);
        setTwofaCode("");
        setTotpInfo({ secret: resp.secret, otpauthUrl: resp.otpauthUrl });
        if (method === "email") toast({ title: t("toasts.setupCodeSent"), description: t("toasts.setupCodeSentDesc") });
      },
      onError: (err) => toast({ title: t("toasts.setupFailed"), description: errText(err, t("toasts.setupFailedDesc")), variant: "destructive" }),
    });
  };

  const handleEnable2fa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!twofaPanel) return;
    enableTwoFactor.mutate({ data: { method: twofaPanel, code: twofaCode.trim() } }, {
      onSuccess: () => {
        toast({ title: t("toasts.twoFactorEnabled") });
        setTwofaPanel(null);
        setTotpInfo({});
        setTwofaCode("");
        refreshMe();
      },
      onError: (err) => toast({ title: t("toasts.couldntEnable2fa"), description: errText(err, t("toasts.couldntEnable2faDesc")), variant: "destructive" }),
    });
  };

  const handleDisable2fa = (e: React.FormEvent) => {
    e.preventDefault();
    disableTwoFactor.mutate({ data: { password: disablePassword } }, {
      onSuccess: () => {
        toast({ title: t("toasts.twoFactorDisabled") });
        setDisablePassword("");
        refreshMe();
      },
      onError: (err) => toast({ title: t("toasts.couldntDisable2fa"), description: errText(err, t("toasts.couldntDisable2faDesc")), variant: "destructive" }),
    });
  };

  const handleRedeemCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = activationCode.trim();
    if (!code) return;
    redeemCode.mutate({ data: { code } }, {
      onSuccess: (resp) => {
        toast({ title: t("toasts.codeRedeemed", { durationDays: resp.durationDays }) });
        setActivationCode("");
        refreshMe();
      },
      onError: (err) => toast({ title: t("toasts.codeRedeemFailed"), description: errText(err, t("toasts.codeRedeemFailedDesc")), variant: "destructive" }),
    });
  };

  const handleImageUpload = async (file: File, field: "avatarUrl" | "bannerUrl") => {
    try {
      const path = await upload(file);
      if (!me) return;
      // Save immediately; the form re-syncs from the refreshed profile, and the
      // image only becomes publicly servable once it is saved (ACL is set then).
      updateProfile.mutate(
        { userId: me.id, data: { [field]: path } },
        {
          onSuccess: () => {
            toast({ title: field === "avatarUrl" ? t("toasts.avatarUpdated") : t("toasts.bannerUpdated") });
            refreshMe();
            queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
          },
          onError: (err) => toast({ title: t("toasts.couldntSaveImage"), description: errText(err, t("toasts.couldntSaveImageDesc")), variant: "destructive" }),
        },
      );
    } catch (err) {
      toast({ title: t("toasts.uploadFailed"), description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const wallEnabled = me?.allowProfileComments !== false;
  const handleToggleWall = () => {
    if (!me) return;
    updateProfile.mutate(
      { userId: me.id, data: { allowProfileComments: !wallEnabled } },
      {
        onSuccess: () => {
          toast({ title: !wallEnabled ? t("toasts.profileWallEnabled") : t("toasts.profileWallDisabled") });
          refreshMe();
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
        },
      },
    );
  };

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
      toast({ title: result.openAtLogin ? t("toasts.willLaunchOnStartup") : t("toasts.startupLaunchDisabled") });
    } catch {
      toast({ title: t("toasts.failedToUpdateStartup"), variant: 'destructive' });
    } finally {
      setStartupLoading(false);
    }
  };

  const imageRefResolverSchema = useMemo(() => makeImageRefSchema(t("validation.imageRef")), [t]);
  const avatarSchema = useMemo(() => z.object({ avatarUrl: imageRefResolverSchema.optional() }), [imageRefResolverSchema]);
  const bannerSchema = useMemo(() => z.object({ bannerUrl: imageRefResolverSchema.optional() }), [imageRefResolverSchema]);

  const contentResolverSchema = useMemo(() => z.object({
    platform: z.enum(["twitch", "youtube", "tiktok", "kick"]),
    handle: z.string().min(1, t("validation.required")).max(100)
  }), [t]);

  // Four independent identity forms
  const displayNameForm = useForm<z.infer<typeof displayNameSchema>>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: "" }
  });
  const avatarForm = useForm<{ avatarUrl?: string }>({
    resolver: zodResolver(avatarSchema),
    defaultValues: { avatarUrl: "" }
  });
  const bannerForm = useForm<{ bannerUrl?: string }>({
    resolver: zodResolver(bannerSchema),
    defaultValues: { bannerUrl: "" }
  });
  const bioForm = useForm<z.infer<typeof bioSchema>>({
    resolver: zodResolver(bioSchema),
    defaultValues: { bio: "" }
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
    resolver: zodResolver(contentResolverSchema),
    defaultValues: { platform: "twitch", handle: "" }
  });

  useEffect(() => {
    if (me) {
      if (!displayNameForm.formState.isDirty) displayNameForm.reset({ displayName: me.displayName });
      if (!avatarForm.formState.isDirty)     avatarForm.reset({ avatarUrl: me.avatarUrl || "" });
      if (!bannerForm.formState.isDirty)     bannerForm.reset({ bannerUrl: me.bannerUrl || "" });
      if (!bioForm.formState.isDirty)        bioForm.reset({ bio: me.bio || "" });
      if (!statusForm.formState.isDirty)     statusForm.reset({ status: me.status, currentGame: me.currentGame || "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const saveField = (data: Record<string, unknown>, onReset: () => void) => {
    if (!me) return;
    updateProfile.mutate(
      { userId: me.id, data },
      {
        onSuccess: () => {
          toast({ title: t("toasts.profileSaved") });
          onReset();
          refreshMe();
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
        }
      }
    );
  };

  const onStatusSubmit = (data: z.infer<typeof statusSchema>) => {
    updateStatus.mutate(
      { data },
      {
        onSuccess: () => {
          // Going offline clears the active game server-side, so refresh /me
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: t("toasts.statusUpdated") });
        }
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
          toast({ title: t("toasts.channelLinked", { platform: contentMeta(data.platform)?.label ?? data.platform }) });
          queryClient.invalidateQueries({ queryKey: getGetUserContentLinksQueryKey(me.id) });
        },
        onError: () => toast({ title: t("toasts.failedToLinkChannel"), variant: "destructive" }),
      }
    );
  };

  const handleUnlinkContent = (linkId: number) => {
    if (!me) return;
    unlinkContent.mutate(
      { userId: me.id, linkId },
      {
        onSuccess: () => {
          toast({ title: t("toasts.channelUnlinked") });
          queryClient.invalidateQueries({ queryKey: getGetUserContentLinksQueryKey(me.id) });
        },
        onError: () => toast({ title: t("toasts.failedToUnlinkChannel"), variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-primary" /> {t("header.title")}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* Language */}
          <LanguageCard />

          {/* Identity Config — each field is its own independent form */}
          <div className="bg-card border border-border p-6 space-y-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
              <User className="w-4 h-4" /> {t("identity.title")}
            </h2>

            {/* Display name */}
            <Form {...displayNameForm}>
              <form onSubmit={displayNameForm.handleSubmit((d) => saveField(d, () => displayNameForm.reset(d)))} className="space-y-2">
                <FormField control={displayNameForm.control} name="displayName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("identity.displayName")}</FormLabel>
                    <div className="flex gap-2">
                      <FormControl><Input {...field} className="font-mono rounded-none border-border bg-background" /></FormControl>
                      <Button type="submit" variant="outline" className="font-mono rounded-none shrink-0" disabled={updateProfile.isPending || !displayNameForm.formState.isDirty}>{t("identity.writeConfig")}</Button>
                    </div>
                    <FormMessage className="font-mono text-xs" />
                  </FormItem>
                )} />
              </form>
            </Form>

            {/* Avatar */}
            <Form {...avatarForm}>
              <form onSubmit={avatarForm.handleSubmit((d) => saveField(d, () => avatarForm.reset(d)))} className="space-y-2">
                <FormField control={avatarForm.control} name="avatarUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("identity.avatar")}</FormLabel>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 border border-border bg-background shrink-0 overflow-hidden flex items-center justify-center">
                        {field.value ? (
                          <img src={displayImageUrl(field.value)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">--</span>
                        )}
                      </div>
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder={t("identity.urlOrUpload")} className="font-mono rounded-none border-border bg-background" /></FormControl>
                      <Button type="button" variant="outline" size="icon" className="rounded-none shrink-0" onClick={() => avatarFileRef.current?.click()} disabled={isUploading} data-testid="button-upload-avatar" title={t("identity.uploadImage")}>
                        <Upload className="w-4 h-4" />
                      </Button>
                      <Button type="submit" variant="outline" className="font-mono rounded-none shrink-0" disabled={updateProfile.isPending || !avatarForm.formState.isDirty}>{t("identity.writeConfig")}</Button>
                    </div>
                    <FormMessage className="font-mono text-xs" />
                  </FormItem>
                )} />
              </form>
            </Form>
            <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImageUpload(f, "avatarUrl"); }} data-testid="input-avatar-file" />

            {/* Banner */}
            <Form {...bannerForm}>
              <form onSubmit={bannerForm.handleSubmit((d) => saveField(d, () => bannerForm.reset(d)))} className="space-y-2">
                <FormField control={bannerForm.control} name="bannerUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("identity.banner")}</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input {...field} value={field.value ?? ""} placeholder={t("identity.urlOrUpload")} className="font-mono rounded-none border-border bg-background" /></FormControl>
                      <Button type="button" variant="outline" size="icon" className="rounded-none shrink-0" onClick={() => bannerFileRef.current?.click()} disabled={isUploading} data-testid="button-upload-banner" title={t("identity.uploadImage")}>
                        <Upload className="w-4 h-4" />
                      </Button>
                      <Button type="submit" variant="outline" className="font-mono rounded-none shrink-0" disabled={updateProfile.isPending || !bannerForm.formState.isDirty}>{t("identity.writeConfig")}</Button>
                    </div>
                    {field.value ? (
                      <div className="h-16 border border-border bg-background overflow-hidden">
                        <img src={displayImageUrl(field.value)} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : null}
                    <FormMessage className="font-mono text-xs" />
                  </FormItem>
                )} />
              </form>
            </Form>
            <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImageUpload(f, "bannerUrl"); }} data-testid="input-banner-file" />

            {/* Bio */}
            <Form {...bioForm}>
              <form onSubmit={bioForm.handleSubmit((d) => saveField(d, () => bioForm.reset(d)))} className="space-y-2">
                <FormField control={bioForm.control} name="bio" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("identity.biography")}</FormLabel>
                    <FormControl><Textarea {...field} value={field.value ?? ""} className="font-mono rounded-none border-border bg-background resize-none" rows={3} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full font-mono rounded-none" disabled={updateProfile.isPending || !bioForm.formState.isDirty}>{t("identity.writeConfig")}</Button>
              </form>
            </Form>
          </div>

          {/* Profile Wall */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> {t("wall.title")}
            </h2>
            <div className="flex items-center justify-between p-3 border border-border bg-background">
              <div>
                <div className="font-mono text-sm">{t("wall.visitorComments")}</div>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">
                  {t("wall.description")}
                </div>
              </div>
              <Button
                variant={wallEnabled ? "default" : "outline"}
                size="sm"
                className="font-mono rounded-none text-xs h-8 min-w-[80px]"
                onClick={handleToggleWall}
                disabled={updateProfile.isPending || !me}
                data-testid="button-toggle-wall"
              >
                {wallEnabled ? t("wall.enabled") : t("wall.disabled")}
              </Button>
            </div>
          </div>

          {/* Status Override */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4" /> {t("status.title")}
            </h2>
            <Form {...statusForm}>
              <form onSubmit={statusForm.handleSubmit(onStatusSubmit)} className="space-y-4">
                <FormField control={statusForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("status.presence")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="font-mono rounded-none border-border bg-background">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="font-mono rounded-none border-border bg-card">
                        <SelectItem value="online">{t("status.online")}</SelectItem>
                        <SelectItem value="away">{t("status.away")}</SelectItem>
                        <SelectItem value="busy">{t("status.busy")}</SelectItem>
                        <SelectItem value="offline">{t("status.offline")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={statusForm.control} name="currentGame" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">{t("status.activeProcess")}</FormLabel>
                    <FormControl><Input {...field} className="font-mono rounded-none border-border bg-background" placeholder={t("status.activeProcessPlaceholder")} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={updateStatus.isPending}>{t("status.broadcast")}</Button>
              </form>
            </Form>
          </div>
        </div>

        {/* Platform Integration + Desktop */}
        <div className="space-y-8">
          {/* Account Security */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> {t("security.title")}
            </h2>

            {/* Email */}
            <div className="space-y-3 mb-6">
              <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> {t("security.emailLink")}
              </div>
              {me?.email && (
                <div className="p-3 border border-border bg-background space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm truncate" data-testid="text-current-email">{me.email}</span>
                    {me.emailVerified ? (
                      <span className="font-mono text-[10px] px-2 py-0.5 border border-primary text-primary uppercase shrink-0" data-testid="badge-email-verified">{t("security.verified")}</span>
                    ) : (
                      <span className="font-mono text-[10px] px-2 py-0.5 border border-yellow-500 text-yellow-500 uppercase shrink-0" data-testid="badge-email-unverified">{t("security.unverified")}</span>
                    )}
                  </div>
                  {!me.emailVerified && (
                    <form onSubmit={handleVerifyEmail} className="flex gap-2">
                      <Input
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                        inputMode="numeric"
                        placeholder={t("security.codePlaceholder")}
                        data-testid="input-email-code"
                        className="font-mono rounded-none border-border bg-card text-center"
                      />
                      <Button type="submit" size="sm" className="font-mono rounded-none h-9" disabled={verifyMyEmail.isPending || emailCode.length !== 6} data-testid="button-verify-email">{t("security.verify")}</Button>
                      <Button type="button" size="sm" variant="outline" className="font-mono rounded-none h-9" onClick={handleResendCode} disabled={setMyEmail.isPending} data-testid="button-resend-code">{t("security.resend")}</Button>
                    </form>
                  )}
                </div>
              )}
              <form onSubmit={handleSetEmail} className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  type="email"
                  placeholder={me?.email ? t("security.newAddressPlaceholder") : t("security.addressPlaceholder")}
                  disabled={me?.twoFactorMethod === "email"}
                  data-testid="input-set-email"
                  className="font-mono rounded-none border-border bg-background"
                />
                <Button type="submit" variant="outline" className="font-mono rounded-none" disabled={setMyEmail.isPending || emailInput.trim().length === 0 || me?.twoFactorMethod === "email"} data-testid="button-set-email">
                  {me?.email ? t("security.update") : t("security.set")}
                </Button>
              </form>
              {me?.twoFactorMethod === "email" && (
                <p className="font-mono text-[11px] text-muted-foreground">{t("security.emailTwofaNote")}</p>
              )}
            </div>

            {/* Two-factor auth */}
            <div className="border-t border-border pt-5 space-y-3">
              <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5" /> {t("security.twoFactorAuth")}
              </div>

              {me?.twoFactorMethod && me.twoFactorMethod !== "none" ? (
                <div className="p-3 border border-primary/40 bg-background space-y-3">
                  <div className="font-mono text-sm flex items-center justify-between">
                    <span className="uppercase">{me.twoFactorMethod === "totp" ? t("security.authenticatorApp") : t("security.emailCodes")}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 border border-primary text-primary uppercase" data-testid="badge-2fa-active">{t("security.active")}</span>
                  </div>
                  <form onSubmit={handleDisable2fa} className="flex gap-2">
                    <Input
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder={t("security.confirmPassword")}
                      data-testid="input-disable-password"
                      className="font-mono rounded-none border-border bg-card"
                    />
                    <Button type="submit" variant="outline" className="font-mono rounded-none text-destructive border-destructive/50 hover:bg-destructive/10" disabled={disableTwoFactor.isPending || disablePassword.length === 0} data-testid="button-disable-2fa">
                      {t("security.disable")}
                    </Button>
                  </form>
                </div>
              ) : twofaPanel === null ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button variant="outline" className="font-mono rounded-none text-xs" onClick={() => handleSetup2fa("totp")} disabled={setupTwoFactor.isPending} data-testid="button-setup-totp">
                    {t("security.authAppTotp")}
                  </Button>
                  <Button variant="outline" className="font-mono rounded-none text-xs" onClick={() => handleSetup2fa("email")} disabled={setupTwoFactor.isPending || !me?.emailVerified} data-testid="button-setup-email-2fa">
                    {t("security.emailCodesButton")}
                  </Button>
                  {!me?.emailVerified && (
                    <p className="font-mono text-[11px] text-muted-foreground sm:col-span-2">{t("security.emailCodesRequireVerified")}</p>
                  )}
                </div>
              ) : (
                <div className="p-3 border border-border bg-background space-y-4">
                  {twofaPanel === "totp" ? (
                    <>
                      <p className="font-mono text-xs text-muted-foreground">{t("security.totpInstructions")}</p>
                      {totpInfo.otpauthUrl && (
                        <div className="flex justify-center">
                          <div className="bg-white p-3" data-testid="qr-totp">
                            <QRCodeSVG value={totpInfo.otpauthUrl} size={148} />
                          </div>
                        </div>
                      )}
                      {totpInfo.secret && (
                        <p className="font-mono text-[11px] text-muted-foreground break-all text-center">{t("security.key", { secret: totpInfo.secret })}</p>
                      )}
                    </>
                  ) : (
                    <p className="font-mono text-xs text-muted-foreground">{t("security.setupCodeSentToEmail")}</p>
                  )}
                  <form onSubmit={handleEnable2fa} className="flex gap-2">
                    <Input
                      value={twofaCode}
                      onChange={(e) => setTwofaCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder={t("security.codePlaceholder")}
                      data-testid="input-2fa-setup-code"
                      className="font-mono rounded-none border-border bg-card text-center"
                    />
                    <Button type="submit" className="font-mono rounded-none" disabled={enableTwoFactor.isPending || twofaCode.length !== 6} data-testid="button-enable-2fa">
                      {t("security.activate")}
                    </Button>
                  </form>
                  <button
                    type="button"
                    className="font-mono text-[11px] text-muted-foreground hover:text-primary uppercase tracking-wider"
                    onClick={() => { setTwofaPanel(null); setTotpInfo({}); }}
                    data-testid="button-cancel-2fa-setup"
                  >
                    {t("security.cancelSetup")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Desktop-only: launch at startup */}
          {isElectron && (
            <div className="bg-card border border-border p-6">
              <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                <Monitor className="w-4 h-4" /> {t("desktop.title")}
              </h2>
              <div className="flex items-center justify-between p-3 border border-border bg-background">
                <div>
                  <div className="font-mono text-sm">{t("desktop.launchOnStartup")}</div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5">
                    {t("desktop.description")}
                  </div>
                </div>
                <Button
                  variant={openAtLogin ? "default" : "outline"}
                  size="sm"
                  className="font-mono rounded-none text-xs h-8 min-w-[80px]"
                  onClick={handleToggleStartup}
                  disabled={startupLoading}
                >
                  {openAtLogin ? t("desktop.enabled") : t("desktop.disabled")}
                </Button>
              </div>
            </div>
          )}

          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> {t("networkLinks.title")}
            </h2>
            
            <div className="space-y-4 mb-8">
              {platforms?.map(p => (
                <div key={p.id} className="p-3 border border-border bg-background flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm uppercase">{p.platform}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.username || t("networkLinks.linkedAccount")}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => handleUnlink(p.id)} disabled={unlinkPlatform.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="font-mono text-xs mb-4">{t("networkLinks.establishNewLink")}</h3>
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
                          <SelectItem value="steam">{t("networkLinks.steam")}</SelectItem>
                          <SelectItem value="xbox">{t("networkLinks.xbox")}</SelectItem>
                          <SelectItem value="playstation">{t("networkLinks.playstation")}</SelectItem>
                          <SelectItem value="epic">{t("networkLinks.epic")}</SelectItem>
                          <SelectItem value="battlenet">{t("networkLinks.battlenet")}</SelectItem>
                          <SelectItem value="nintendo">{t("networkLinks.nintendo")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={platformForm.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormControl><Input {...field} placeholder={t("networkLinks.usernamePlaceholder")} className="font-mono rounded-none border-border bg-background" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={platformForm.control} name="profileUrl" render={({ field }) => (
                    <FormItem>
                      <FormControl><Input {...field} placeholder={t("networkLinks.profileUrlPlaceholder")} className="font-mono rounded-none border-border bg-background" /></FormControl>
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={linkPlatform.isPending}>{t("networkLinks.executeLink")}</Button>
                </form>
              </Form>
            </div>
          </div>

          {/* Content Channels */}
          <div className="bg-card border border-border p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Radio className="w-4 h-4" /> {t("content.title")}
            </h2>

            <div className="space-y-3 mb-8">
              {!contentLinks || contentLinks.length === 0 ? (
                <div className="text-sm font-mono text-muted-foreground italic">{t("content.noChannels")}</div>
              ) : (
                contentLinks.map(c => {
                  const meta = contentMeta(c.platform);
                  const Icon = meta?.icon ?? Radio;
                  return (
                    <div key={c.id} className="p-3 border border-border bg-background flex items-center justify-between" style={{ borderInlineStart: `3px solid ${meta?.color ?? "var(--border)"}` }}>
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
              <h3 className="font-mono text-xs mb-4">{t("content.goLive")}</h3>
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
                  <Button type="submit" className="w-full font-mono rounded-none" variant="outline" disabled={linkContent.isPending}>{t("content.linkChannel")}</Button>
                </form>
              </Form>
            </div>
          </div>
        </div>
      </div>

      {/* Activation Code */}
      <div className="bg-card border border-border p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
          <Ticket className="w-4 h-4" /> {t("activationCode.title")}
        </h2>
        <p className="font-mono text-xs text-muted-foreground mb-4">{t("activationCode.description")}</p>
        <form onSubmit={handleRedeemCode} className="flex gap-2 max-w-md">
          <Input
            value={activationCode}
            onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
            placeholder={t("activationCode.placeholder")}
            className="font-mono rounded-none border-border bg-background uppercase"
          />
          <Button type="submit" className="font-mono rounded-none" disabled={redeemCode.isPending || activationCode.trim().length === 0}>
            {t("activationCode.redeem")}
          </Button>
        </form>
      </div>

      {/* ── Pro sections (visible to all; locked for non-Pro) ─────────────── */}
      <ProProfileSection me={me} onSave={refreshMe} />
      <MyRoomSection />
      <LfgBotSection me={me} />
      <GiftProSection me={me} />
    </div>
  );
}

// ── Pro Profile ────────────────────────────────────────────────────────────────

function ProProfileSection({ me, onSave }: { me: any; onSave: () => void }) {
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;
  const { toast } = useToast();
  const [frameColor, setFrameColor] = useState<string>(me?.profileFrameColor ?? "");
  const [bgUrl, setBgUrl] = useState<string>(me?.profileBgUrl ?? "");
  const [saving, setSaving] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useImageUpload();

  const PRESET_COLORS = ["#FFD700", "#A855F7", "#06B6D4", "#EF4444", "#22C55E", "#F97316", "#EC4899"];

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = await upload(file);
      setBgUrl(path);
      toast({ title: "تم رفع الصورة — اضغط حفظ لتطبيقها" });
    } catch (err: any) {
      toast({ title: err?.message ?? "فشل رفع الصورة", variant: "destructive" });
    } finally {
      if (bgFileRef.current) bgFileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!isPro) return;
    setSaving(true);
    try {
      await customFetch(`/api/users/${me.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({ profileFrameColor: frameColor || null, profileBgUrl: bgUrl || null }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "تم حفظ بيانات الملف الشخصي" });
      onSave();
    } catch {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-80"}`}>
      {!isPro && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" />
          <p className="font-mono text-xs uppercase tracking-widest text-foreground">يتطلب اشتراك Pro</p>
        </div>
      )}
      <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
        <Palette className="w-4 h-4" /> ملف Pro المخصص <Crown className="w-3 h-3 text-yellow-400" />
      </h2>

      {/* Frame Color */}
      <div className="space-y-2">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">لون إطار الصورة</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setFrameColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${frameColor === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }}
              title={c}
            />
          ))}
          <Input
            value={frameColor}
            onChange={(e) => setFrameColor(e.target.value)}
            placeholder="#hex"
            className="font-mono rounded-none border-border bg-background w-24 text-xs"
          />
          {frameColor && (
            <div
              className="w-9 h-9 rounded-full border-4 bg-muted"
              style={{ borderColor: frameColor }}
            />
          )}
        </div>
      </div>

      {/* Background — URL or upload from device */}
      <div className="space-y-2">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">
          خلفية الملف الشخصي
        </label>

        {/* Upload button */}
        <input
          ref={bgFileRef}
          type="file"
          accept="image/*,image/gif,video/webm,video/mp4"
          className="hidden"
          onChange={handleBgUpload}
        />
        <div className="flex gap-2">
          <Input
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
            placeholder="رابط خارجي  https://... أو ارفع من الجهاز"
            className="font-mono rounded-none border-border bg-background text-xs flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono rounded-none shrink-0 gap-1"
            onClick={() => bgFileRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="w-3 h-3" />
            {isUploading ? "جاري..." : "رفع"}
          </Button>
          {bgUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="font-mono rounded-none text-muted-foreground px-2 shrink-0"
              onClick={() => setBgUrl("")}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Preview */}
        {bgUrl && (
          <div className="relative h-24 border border-border overflow-hidden bg-muted">
            <img
              src={displayImageUrl(bgUrl) ?? bgUrl}
              alt="معاينة الخلفية"
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <span className="absolute bottom-1 end-1 font-mono text-[10px] bg-black/60 text-white px-1">معاينة</span>
          </div>
        )}
      </div>

      <Button className="font-mono rounded-none" onClick={handleSave} disabled={saving || isUploading}>
        {saving ? "جاري الحفظ..." : "حفظ التخصيص"}
      </Button>
    </div>
  );
}

// ── LFG Bot ────────────────────────────────────────────────────────────────────

function LfgBotSection({ me }: { me: any }) {
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { data: botSettings } = useQuery<any>({
    queryKey: ["lfg-bot-settings"],
    queryFn: () => customFetch("/api/lfg/bot"),
  });

  const [enabled, setEnabled] = useState(false);
  const [game, setGame] = useState("");
  const [platform, setPlatform] = useState("");
  const [description, setDescription] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);

  useEffect(() => {
    if (botSettings) {
      setEnabled(botSettings.enabled ?? false);
      setGame(botSettings.game ?? "");
      setPlatform(botSettings.platform ?? "");
      setDescription(botSettings.description ?? "");
      setIntervalMinutes(botSettings.intervalMinutes ?? 60);
    }
  }, [botSettings]);

  const handleSave = async () => {
    if (!game || !description) { toast({ title: "اللعبة والوصف مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await customFetch("/api/lfg/bot", {
        method: "PUT",
        body: JSON.stringify({ game, platform: platform || undefined, description, intervalMinutes, enabled }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: enabled ? "تم تفعيل بوت LFG" : "تم حفظ إعدادات البوت" });
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e?.data?.error, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    await customFetch("/api/lfg/bot", { method: "DELETE" });
    setEnabled(false);
    toast({ title: "تم تعطيل البوت" });
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-80"}`}>
      {!isPro && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" />
          <p className="font-mono text-xs uppercase tracking-widest text-foreground">يتطلب اشتراك Pro</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
          <Bot className="w-4 h-4" /> بوت LFG التلقائي <Crown className="w-3 h-3 text-yellow-400" />
        </h2>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
        </button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">ينشر بوت LFG منشورًا تلقائيًا بشكل دوري نيابةً عنك.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">اللعبة</label>
          <Input value={game} onChange={(e) => setGame(e.target.value)} className="font-mono rounded-none border-border bg-background" placeholder="Valorant" />
        </div>
        <div className="space-y-1">
          <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">المنصة</label>
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} className="font-mono rounded-none border-border bg-background" placeholder="PC" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">الوصف</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="font-mono rounded-none border-border bg-background resize-none" rows={2} maxLength={500} />
      </div>

      <div className="space-y-1">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">فترة النشر</label>
        <div className="flex gap-0">
          {([["30", 30], ["60", 60], ["120", 120], ["240", 240]] as [string, number][]).map(([label, val]) => (
            <button
              key={val}
              onClick={() => setIntervalMinutes(val)}
              className={`flex-1 font-mono text-xs py-2 border transition-colors ${intervalMinutes === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}
            >
              {label === "30" ? "30د" : label === "60" ? "ساعة" : label === "120" ? "ساعتين" : "4س"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="font-mono rounded-none flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
        {botSettings?.enabled && (
          <Button variant="outline" className="font-mono rounded-none" onClick={handleDisable}>
            تعطيل البوت
          </Button>
        )}
      </div>
    </div>
  );
}

// ── My Voice Room ──────────────────────────────────────────────────────────────

function MyRoomSection() {
  const { t } = useTranslation("rooms");
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: myRoom, isLoading } = useQuery<any | null>({
    queryKey: ["rooms", "mine"],
    queryFn: () => customFetch("/api/rooms/mine"),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Populate form when room loads
  const populated = !!myRoom;
  useState(() => {
    if (myRoom) {
      setName(myRoom.name ?? "");
      setDescription(myRoom.description ?? "");
    }
  });

  const saveRoom = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (myRoom) {
        await customFetch("/api/rooms/mine", {
          method: "PATCH",
          body: JSON.stringify({ name, description, password: password || undefined, clearPassword: clearPassword || undefined }),
          headers: { "Content-Type": "application/json" },
        });
        toast({ title: t("updated") });
      } else {
        await customFetch("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ name, description, password: password || undefined }),
          headers: { "Content-Type": "application/json" },
        });
        toast({ title: t("created") });
      }
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setPassword("");
      setClearPassword(false);
    } catch {
      toast({ title: t("error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteRoom = async () => {
    setDeleting(true);
    try {
      await customFetch("/api/rooms/mine", { method: "DELETE" });
      toast({ title: t("deleted") });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setName(""); setDescription(""); setPassword(""); setConfirmDelete(false);
    } catch {
      toast({ title: t("error"), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div id="myroom" className="bg-card border border-border p-6 space-y-4">
      {/* header */}
      <div className="flex items-center gap-2 mb-1">
        <Mic className="w-4 h-4 text-primary" />
        <h3 className="font-mono font-bold text-sm uppercase tracking-widest text-primary">{t("myRoomSection")}</h3>
        {!isPro && <span className="ms-auto"><Crown className="w-4 h-4 text-primary" /></span>}
      </div>
      <p className="font-mono text-xs text-muted-foreground">{t("myRoomDesc")}</p>

      {!isPro ? (
        <p className="font-mono text-xs text-muted-foreground border border-border px-4 py-3 bg-background">{t("proOnlyDesc")}</p>
      ) : isLoading ? (
        <div className="h-20 bg-muted animate-pulse" />
      ) : (
        <div className="space-y-3">
          {/* current room status */}
          {myRoom ? (
            <div className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-2">
              {myRoom.hasPassword
                ? <Lock className="w-3 h-3 text-muted-foreground" />
                : <Unlock className="w-3 h-3 text-primary" />
              }
              <span className="font-mono text-xs font-bold">{myRoom.name}</span>
              <span className="font-mono text-xs text-muted-foreground ms-auto">{myRoom.hasPassword ? t("protected") : t("open")}</span>
            </div>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">{t("noRoomYet")}</p>
          )}

          {/* form */}
          <div className="space-y-3">
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("roomName")}</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t("roomNamePlaceholder")}
                className="font-mono rounded-none border-border bg-background text-sm"
                maxLength={40}
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("description")}</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                className="font-mono rounded-none border-border bg-background text-sm"
                maxLength={100}
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("password")}</label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setClearPassword(false); }}
                  placeholder={t("passwordPlaceholder")}
                  className="font-mono rounded-none border-border bg-background text-sm"
                />
                {myRoom?.hasPassword && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono rounded-none text-xs shrink-0"
                    onClick={() => { setClearPassword(true); setPassword(""); }}
                    type="button"
                  >
                    <X className="w-3 h-3 me-1" /> {t("clearPassword", { defaultValue: "Clear" })}
                  </Button>
                )}
              </div>
              {clearPassword && <p className="font-mono text-[10px] text-yellow-500 mt-1">كلمة المرور ستُحذف عند الحفظ</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                className="font-mono rounded-none text-xs flex-1"
                onClick={saveRoom}
                disabled={saving || !name.trim()}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-3 h-3 me-1" />{t("saveChanges")}</>}
              </Button>
              {myRoom && !confirmDelete && (
                <Button
                  variant="outline"
                  className="font-mono rounded-none text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("deleteRoom")}
                </Button>
              )}
              {confirmDelete && (
                <Button
                  variant="destructive"
                  className="font-mono rounded-none text-xs"
                  onClick={deleteRoom}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓ " + t("confirmDelete", { defaultValue: "Confirm" })}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gift Pro ───────────────────────────────────────────────────────────────────

function GiftProSection({ me }: { me: any }) {
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(0);
  const [gifting, setGifting] = useState(false);

  const { data: friends } = useQuery<any[]>({
    queryKey: ["gift-pro-friends"],
    queryFn: () => customFetch("/api/friends"),
    enabled: !!me?.id,
  });

  const { data: gifts } = useQuery<{ sent: any[]; received: any[] }>({
    queryKey: ["pro-gifts"],
    queryFn: () => customFetch("/api/pro/gifts"),
  });

  const lastGift = gifts?.sent?.[0];
  const now = Date.now();
  const daysUntilNext = lastGift
    ? Math.ceil(90 - (now - new Date(lastGift.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const canGift = !lastGift || daysUntilNext <= 0;

  const handleGift = async () => {
    if (!selectedId) return;
    setGifting(true);
    try {
      const res = await customFetch<{ success: boolean; giftedTo: any }>("/api/pro/gift", {
        method: "POST",
        body: JSON.stringify({ toUserId: selectedId }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: `تم إهداء Pro لـ ${res.giftedTo.displayName} 🎁` });
      setOpen(false);
      setSelectedId(0);
    } catch (e: any) {
      toast({ title: "فشل الإهداء", description: e?.data?.error, variant: "destructive" });
    } finally {
      setGifting(false);
    }
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-80"}`}>
      {!isPro && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" />
          <p className="font-mono text-xs uppercase tracking-widest text-foreground">يتطلب اشتراك Pro</p>
        </div>
      )}
      <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
        <Gift className="w-4 h-4" /> إهداء Pro <Crown className="w-3 h-3 text-yellow-400" />
      </h2>
      <p className="font-mono text-xs text-muted-foreground">أهدِ صديقًا شهرًا من Pro مجانًا — مرة واحدة كل 90 يومًا.</p>

      {lastGift ? (
        <p className="font-mono text-xs text-muted-foreground">
          آخر إهداء: {new Date(lastGift.createdAt).toLocaleDateString("ar")} → {lastGift.toUser?.displayName}
          {!canGift && ` (متاح بعد ${daysUntilNext} يوم)`}
        </p>
      ) : null}

      <Button
        className="font-mono rounded-none"
        onClick={() => setOpen(true)}
        disabled={!canGift}
      >
        <Gift className="w-4 h-4 me-2" />
        {canGift ? "إهداء شهر Pro لصديق" : `متاح بعد ${daysUntilNext} يوم`}
      </Button>

      {/* Gift Dialog */}
      {open && (
        <div className="border border-border bg-background p-4 space-y-3 mt-2">
          <p className="font-mono text-xs uppercase text-muted-foreground tracking-widest">اختر صديقًا</p>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full bg-background border border-border font-mono text-sm p-2 rounded-none"
          >
            <option value={0}>-- اختر --</option>
            {(friends ?? []).map((f: any) => (
              <option key={f.id} value={f.id}>{f.displayName} (@{f.username})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button className="font-mono rounded-none flex-1" onClick={handleGift} disabled={gifting || !selectedId}>
              {gifting ? "جاري الإهداء..." : "تأكيد الإهداء 🎁"}
            </Button>
            <Button variant="outline" className="font-mono rounded-none" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageCard() {
  const { t, i18n } = useTranslation("common");
  const current = i18n.resolvedLanguage?.startsWith("ar") ? "ar" : "en";

  return (
    <div className="bg-card border border-border p-6">
      <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
        <Globe className="w-4 h-4" /> {t("language.title")}
      </h2>
      <p className="font-mono text-xs text-muted-foreground mb-4">{t("language.description")}</p>
      <div className="flex gap-2">
        <Button
          variant={current === "ar" ? "default" : "outline"}
          className="flex-1 font-mono rounded-none"
          onClick={() => { void i18n.changeLanguage("ar"); }}
          data-testid="button-lang-ar"
        >
          {t("language.arabic")}
        </Button>
        <Button
          variant={current === "en" ? "default" : "outline"}
          className="flex-1 font-mono rounded-none"
          onClick={() => { void i18n.changeLanguage("en"); }}
          data-testid="button-lang-en"
        >
          {t("language.english")}
        </Button>
      </div>
    </div>
  );
}
