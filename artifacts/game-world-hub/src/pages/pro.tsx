import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  customFetch,
  useGetMe,
  useGetMePro,
  useRedeemActivationCode,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import {
  Crown, Palette, Bot, Gift, Mic,
  Lock, Unlock, Save, X, Loader2,
  Upload, Trash2, Ticket, CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useImageUpload } from "@/hooks/use-image-upload";
import { displayImageUrl } from "@/lib/image-url";

// ── Helpers ────────────────────────────────────────────────────────────────────

function ProLock() {
  const { t } = useTranslation("pro");
  return (
    <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3">
      <Crown className="w-7 h-7 text-yellow-400" />
      <p className="font-mono text-xs uppercase tracking-widest">{t("lock")}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-primary">{title}</h2>
      <Crown className="w-3 h-3 text-yellow-400 ms-1" />
    </div>
  );
}

// ── Pro Status Banner ──────────────────────────────────────────────────────────

function ProStatusBanner({ isPro, expiresAt }: { isPro: boolean; expiresAt: string | null }) {
  const { t, i18n } = useTranslation("pro");
  const locale = i18n.resolvedLanguage?.startsWith("ar") ? "ar-SA" : "en-US";

  if (!isPro) return null;
  return (
    <div className="relative overflow-hidden border border-primary/40 bg-card p-5">
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,hsl(var(--primary)/0.03) 3px,hsl(var(--primary)/0.03) 4px)"
      }} />
      <div style={{ position:"absolute",top:6,left:6,width:12,height:12,borderTop:"2px solid hsl(var(--primary)/0.6)",borderLeft:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",top:6,right:6,width:12,height:12,borderTop:"2px solid hsl(var(--primary)/0.6)",borderRight:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",bottom:6,left:6,width:12,height:12,borderBottom:"2px solid hsl(var(--primary)/0.6)",borderLeft:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",bottom:6,right:6,width:12,height:12,borderBottom:"2px solid hsl(var(--primary)/0.6)",borderRight:"2px solid hsl(var(--primary)/0.6)" }} />

      <div className="flex items-center gap-3 relative">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <div>
          <p className="font-mono font-black text-sm uppercase tracking-widest text-primary">{t("banner.active")}</p>
          {expiresAt && (
            <p className="font-mono text-xs font-semibold text-foreground/80 mt-1 tracking-wide">
              {t("banner.expires")} {new Date(expiresAt).toLocaleDateString(locale)}
            </p>
          )}
        </div>
        <Sparkles className="w-4 h-4 text-yellow-400 ms-auto animate-pulse" />
      </div>
    </div>
  );
}

// ── Activation Code ────────────────────────────────────────────────────────────

function ActivationCard() {
  const { t } = useTranslation("pro");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const redeemCode = useRedeemActivationCode({
    mutation: {
      onSuccess: () => {
        toast({ title: t("activation.success") });
        setCode("");
        void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (e: any) => {
        toast({ title: t("activation.invalid"), description: e?.data?.error, variant: "destructive" });
      },
    },
  });

  return (
    <div className="bg-card border border-primary/30 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="w-4 h-4 text-primary" />
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-primary">{t("activation.title")}</h2>
      </div>
      <p className="font-mono text-xs text-muted-foreground mb-4">{t("activation.description")}</p>
      <form
        onSubmit={(e) => { e.preventDefault(); redeemCode.mutate({ data: { code: code.trim() } }); }}
        className="flex gap-2 max-w-sm"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("activation.placeholder")}
          className="font-mono rounded-none border-border bg-background uppercase tracking-widest"
        />
        <Button
          type="submit"
          className="font-mono rounded-none"
          disabled={redeemCode.isPending || code.trim().length === 0}
        >
          {redeemCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("activation.submit")}
        </Button>
      </form>
    </div>
  );
}

// ── Pro Profile ────────────────────────────────────────────────────────────────

function ProProfileCard({ me, isPro, onSave }: { me: any; isPro: boolean; onSave: () => void }) {
  const { t } = useTranslation("pro");
  const { toast } = useToast();
  const [frameColor, setFrameColor] = useState<string>(me?.profileFrameColor ?? "");
  const [bgUrl, setBgUrl] = useState<string>(me?.profileBgUrl ?? "");
  const [saving, setSaving] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useImageUpload();

  const PRESET_COLORS = ["#EC4899","#F97316","#22C55E","#EF4444","#06B6D4","#A855F7","#FFD700"];

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = await upload(file);
      setBgUrl(path);
      toast({ title: t("profile.uploadSuccess") });
    } catch (err: any) {
      toast({ title: err?.message ?? t("profile.uploadFail"), variant: "destructive" });
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
      toast({ title: t("profile.saveSuccess") });
      onSave();
    } catch {
      toast({ title: t("profile.saveFail"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-card border p-6 space-y-5 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <SectionHeader icon={Palette} title={t("profile.title")} />

      <div className="space-y-2">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("profile.frameColor")}</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setFrameColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${frameColor === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <Input
            value={frameColor}
            onChange={(e) => setFrameColor(e.target.value)}
            placeholder="#hex"
            className="font-mono rounded-none border-border bg-background w-24 text-xs"
          />
          {frameColor && <div className="w-9 h-9 rounded-full border-4 bg-muted" style={{ borderColor: frameColor }} />}
        </div>
      </div>

      <div className="space-y-2">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("profile.background")}</label>
        <input ref={bgFileRef} type="file" accept="image/*,image/gif,video/webm,video/mp4" className="hidden" onChange={handleBgUpload} />
        <div className="flex gap-2">
          <Input
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
            placeholder={t("profile.bgPlaceholder")}
            className="font-mono rounded-none border-border bg-background text-xs flex-1"
          />
          <Button type="button" variant="outline" size="sm" className="font-mono rounded-none shrink-0 gap-1" onClick={() => bgFileRef.current?.click()} disabled={isUploading}>
            <Upload className="w-3 h-3" />{isUploading ? t("profile.uploading") : t("profile.upload")}
          </Button>
          {bgUrl && (
            <Button type="button" variant="ghost" size="sm" className="font-mono rounded-none text-muted-foreground px-2 shrink-0" onClick={() => setBgUrl("")}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
        {bgUrl && (
          <div className="relative h-24 border border-border overflow-hidden bg-muted">
            <img src={displayImageUrl(bgUrl) ?? bgUrl} alt={t("profile.preview")} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            <span className="absolute bottom-1 end-1 font-mono text-[10px] bg-black/60 text-white px-1">{t("profile.preview")}</span>
          </div>
        )}
      </div>

      <Button className="font-mono rounded-none" onClick={handleSave} disabled={saving || isUploading || !isPro}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin me-1" />{t("profile.saving")}</>
          : t("profile.save")}
      </Button>
    </div>
  );
}

// ── Voice Room ─────────────────────────────────────────────────────────────────

function VoiceRoomCard({ isPro }: { isPro: boolean }) {
  const { t } = useTranslation("rooms");
  const { t: tPro } = useTranslation("pro");
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

  useEffect(() => {
    if (myRoom) {
      setName(myRoom.name ?? "");
      setDescription(myRoom.description ?? "");
    }
  }, [myRoom?.id]);

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
      setPassword(""); setClearPassword(false);
    } catch { toast({ title: t("error"), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteRoom = async () => {
    setDeleting(true);
    try {
      await customFetch("/api/rooms/mine", { method: "DELETE" });
      toast({ title: t("deleted") });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setName(""); setDescription(""); setPassword(""); setConfirmDelete(false);
    } catch { toast({ title: t("error"), variant: "destructive" }); }
    finally { setDeleting(false); }
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <SectionHeader icon={Mic} title={t("myRoomSection")} />
      <p className="font-mono text-xs text-muted-foreground -mt-2">{t("myRoomDesc")}</p>

      {isLoading ? (
        <div className="h-16 bg-muted animate-pulse" />
      ) : (
        <div className="space-y-3">
          {myRoom ? (
            <div className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-2">
              {myRoom.hasPassword ? <Lock className="w-3 h-3 text-muted-foreground" /> : <Unlock className="w-3 h-3 text-primary" />}
              <span className="font-mono text-xs font-bold">{myRoom.name}</span>
              <span className="font-mono text-xs text-muted-foreground ms-auto">{myRoom.hasPassword ? t("protected") : t("open")}</span>
            </div>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">{t("noRoomYet")}</p>
          )}

          <div className="space-y-3">
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("roomName")}</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("roomNamePlaceholder")} className="font-mono rounded-none border-border bg-background text-sm" maxLength={40} />
            </div>
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("description")}</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} className="font-mono rounded-none border-border bg-background text-sm" maxLength={100} />
            </div>
            <div>
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest block mb-1">{t("password")}</label>
              <div className="flex gap-2">
                <Input type="password" value={password} onChange={e => { setPassword(e.target.value); setClearPassword(false); }} placeholder={t("passwordPlaceholder")} className="font-mono rounded-none border-border bg-background text-sm" />
                {myRoom?.hasPassword && (
                  <Button size="sm" variant="outline" className="font-mono rounded-none text-xs shrink-0" onClick={() => { setClearPassword(true); setPassword(""); }} type="button">
                    <X className="w-3 h-3 me-1" />{tPro("room.clearPassword")}
                  </Button>
                )}
              </div>
              {clearPassword && <p className="font-mono text-[10px] text-yellow-500 mt-1">{tPro("room.passwordWillClear")}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="font-mono rounded-none text-xs flex-1" onClick={saveRoom} disabled={saving || !name.trim() || !isPro}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-3 h-3 me-1" />{t("saveChanges")}</>}
              </Button>
              {myRoom && !confirmDelete && (
                <Button variant="outline" className="font-mono rounded-none text-xs text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                  {t("deleteRoom")}
                </Button>
              )}
              {confirmDelete && (
                <Button variant="destructive" className="font-mono rounded-none text-xs" onClick={deleteRoom} disabled={deleting}>
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : tPro("room.confirmDeleteBtn")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LFG Bot ────────────────────────────────────────────────────────────────────

function LfgBotCard({ isPro }: { isPro: boolean }) {
  const { t } = useTranslation("pro");
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
    if (!game || !description) { toast({ title: t("lfg.required"), variant: "destructive" }); return; }
    setSaving(true);
    try {
      await customFetch("/api/lfg/bot", {
        method: "PUT",
        body: JSON.stringify({ game, platform: platform || undefined, description, intervalMinutes, enabled }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: enabled ? t("lfg.enabled") : t("lfg.saved") });
    } catch (e: any) {
      toast({ title: t("lfg.saveFail"), description: e?.data?.error, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDisable = async () => {
    await customFetch("/api/lfg/bot", { method: "DELETE" });
    setEnabled(false);
    toast({ title: t("lfg.disabled") });
  };

  const intervals: [string, number][] = [
    [t("lfg.30min"), 30],
    [t("lfg.1hour"), 60],
    [t("lfg.2hours"), 120],
    [t("lfg.4hours"), 240],
  ];

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <div className="flex items-center justify-between mb-2">
        <SectionHeader icon={Bot} title={t("lfg.title")} />
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors -mt-4 ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
        </button>
      </div>
      <p className="font-mono text-xs text-muted-foreground -mt-2">{t("lfg.description")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("lfg.game")}</label>
          <Input value={game} onChange={(e) => setGame(e.target.value)} className="font-mono rounded-none border-border bg-background" placeholder="Valorant" />
        </div>
        <div className="space-y-1">
          <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("lfg.platform")}</label>
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} className="font-mono rounded-none border-border bg-background" placeholder="PC" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("lfg.descriptionField")}</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="font-mono rounded-none border-border bg-background resize-none" rows={2} maxLength={500} />
      </div>

      <div className="space-y-1">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("lfg.interval")}</label>
        <div className="flex gap-0">
          {intervals.map(([label, val]) => (
            <button key={val} onClick={() => setIntervalMinutes(val)}
              className={`flex-1 font-mono text-xs py-2 border transition-colors ${intervalMinutes === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="font-mono rounded-none flex-1" onClick={handleSave} disabled={saving || !isPro}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin me-1" />{t("lfg.saving")}</> : t("lfg.save")}
        </Button>
        {botSettings?.enabled && (
          <Button variant="outline" className="font-mono rounded-none" onClick={handleDisable}>{t("lfg.disable")}</Button>
        )}
      </div>
    </div>
  );
}

// ── Gift Pro ────────────────────────────────────────────────────────────────────

function GiftProCard({ me, isPro }: { me: any; isPro: boolean }) {
  const { t, i18n } = useTranslation("pro");
  const locale = i18n.resolvedLanguage?.startsWith("ar") ? "ar" : "en";
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
  const daysUntilNext = lastGift ? Math.ceil(90 - (now - new Date(lastGift.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
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
      toast({ title: t("gift.success", { name: res.giftedTo.displayName }) });
      setOpen(false); setSelectedId(0);
    } catch (e: any) {
      toast({ title: t("gift.fail"), description: e?.data?.error, variant: "destructive" });
    } finally { setGifting(false); }
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <SectionHeader icon={Gift} title={t("gift.title")} />
      <p className="font-mono text-xs text-muted-foreground -mt-2">{t("gift.description")}</p>

      {lastGift && (
        <p className="font-mono text-xs text-muted-foreground">
          {t("gift.lastGift")} {new Date(lastGift.createdAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")} → {lastGift.toUser?.displayName}
          {!canGift && ` (${t("gift.availableIn", { days: daysUntilNext })})`}
        </p>
      )}

      <Button className="font-mono rounded-none" onClick={() => setOpen(true)} disabled={!canGift || !isPro}>
        <Gift className="w-4 h-4 me-2" />
        {canGift ? t("gift.button") : t("gift.availableIn", { days: daysUntilNext })}
      </Button>

      {open && (
        <div className="border border-border bg-background p-4 space-y-3 mt-2">
          <p className="font-mono text-xs uppercase text-muted-foreground tracking-widest">{t("gift.choose")}</p>
          <select value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full bg-background border border-border font-mono text-sm p-2 rounded-none">
            <option value={0}>{t("gift.chooseOption")}</option>
            {(friends ?? []).map((f: any) => (
              <option key={f.id} value={f.id}>{f.displayName} (@{f.username})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button className="font-mono rounded-none flex-1" onClick={handleGift} disabled={gifting || !selectedId}>
              {gifting ? t("gift.gifting") : t("gift.confirm")}
            </Button>
            <Button variant="outline" className="font-mono rounded-none" onClick={() => setOpen(false)}>{t("gift.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProPage() {
  const { t } = useTranslation("pro");
  const { data: me } = useGetMe();
  const { data: proStatus } = useGetMePro();
  const qc = useQueryClient();
  const isPro = !!proStatus?.isPro;
  const expiresAt = proStatus?.expiresAt ?? null;

  const refreshMe = () => {
    void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-black font-mono tracking-tighter uppercase flex items-center gap-3">
          <Crown className="w-6 h-6 text-yellow-400" /> {t("page.title")}
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">{t("page.subtitle")}</p>
      </div>

      <ProStatusBanner isPro={isPro} expiresAt={expiresAt} />
      <ActivationCard />

      <div className="space-y-4">
        <ProProfileCard me={me} isPro={isPro} onSave={refreshMe} />
        <VoiceRoomCard isPro={isPro} />
        <LfgBotCard isPro={isPro} />
        <GiftProCard me={me} isPro={isPro} />
      </div>
    </div>
  );
}
