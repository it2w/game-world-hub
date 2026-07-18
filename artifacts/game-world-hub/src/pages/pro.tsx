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
  return (
    <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3">
      <Crown className="w-7 h-7 text-yellow-400" />
      <p className="font-mono text-xs uppercase tracking-widest">يتطلب اشتراك Pro</p>
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
  if (!isPro) return null;
  return (
    <div className="relative overflow-hidden border border-primary/40 bg-card p-5">
      {/* scanline effect */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,hsl(var(--primary)/0.03) 3px,hsl(var(--primary)/0.03) 4px)"
      }} />
      {/* corner brackets */}
      <div style={{ position:"absolute",top:6,left:6,width:12,height:12,borderTop:"2px solid hsl(var(--primary)/0.6)",borderLeft:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",top:6,right:6,width:12,height:12,borderTop:"2px solid hsl(var(--primary)/0.6)",borderRight:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",bottom:6,left:6,width:12,height:12,borderBottom:"2px solid hsl(var(--primary)/0.6)",borderLeft:"2px solid hsl(var(--primary)/0.6)" }} />
      <div style={{ position:"absolute",bottom:6,right:6,width:12,height:12,borderBottom:"2px solid hsl(var(--primary)/0.6)",borderRight:"2px solid hsl(var(--primary)/0.6)" }} />

      <div className="flex items-center gap-3 relative">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <div>
          <p className="font-mono font-black text-sm uppercase tracking-widest text-primary">اشتراك Pro نشط</p>
          {expiresAt && (
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              ينتهي {new Date(expiresAt).toLocaleDateString("ar-SA")}
            </p>
          )}
        </div>
        <Sparkles className="w-4 h-4 text-yellow-400 ms-auto animate-pulse" />
      </div>
    </div>
  );
}

// ── Activation Code ────────────────────────────────────────────────────────────

function ActivationCard({ isPro }: { isPro: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const redeemCode = useRedeemActivationCode({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ تم تفعيل الاشتراك بنجاح!" });
        setCode("");
        void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (e: any) => {
        toast({ title: "كود غير صحيح أو منتهي الصلاحية", description: e?.data?.error, variant: "destructive" });
      },
    },
  });

  if (isPro) return null;

  return (
    <div className="bg-card border border-primary/30 p-6">
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="w-4 h-4 text-primary" />
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-primary">كود التفعيل</h2>
      </div>
      <p className="font-mono text-xs text-muted-foreground mb-4">لديك كود تفعيل Pro؟ أدخله هنا لتفعيل اشتراكك.</p>
      <form
        onSubmit={(e) => { e.preventDefault(); redeemCode.mutate({ data: { code: code.trim() } }); }}
        className="flex gap-2 max-w-sm"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="font-mono rounded-none border-border bg-background uppercase tracking-widest"
        />
        <Button
          type="submit"
          className="font-mono rounded-none"
          disabled={redeemCode.isPending || code.trim().length === 0}
        >
          {redeemCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "تفعيل"}
        </Button>
      </form>
    </div>
  );
}

// ── Pro Profile ────────────────────────────────────────────────────────────────

function ProProfileCard({ me, isPro, onSave }: { me: any; isPro: boolean; onSave: () => void }) {
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
      toast({ title: "تم حفظ التخصيص" });
      onSave();
    } catch {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-card border p-6 space-y-5 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <SectionHeader icon={Palette} title="ملف Pro المخصص" />

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

      {/* Background */}
      <div className="space-y-2">
        <label className="font-mono text-xs uppercase text-muted-foreground tracking-widest">خلفية الملف الشخصي</label>
        <input ref={bgFileRef} type="file" accept="image/*,image/gif,video/webm,video/mp4" className="hidden" onChange={handleBgUpload} />
        <div className="flex gap-2">
          <Input
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
            placeholder="رابط https://... أو ارفع من الجهاز"
            className="font-mono rounded-none border-border bg-background text-xs flex-1"
          />
          <Button type="button" variant="outline" size="sm" className="font-mono rounded-none shrink-0 gap-1" onClick={() => bgFileRef.current?.click()} disabled={isUploading}>
            <Upload className="w-3 h-3" />{isUploading ? "جاري..." : "رفع"}
          </Button>
          {bgUrl && (
            <Button type="button" variant="ghost" size="sm" className="font-mono rounded-none text-muted-foreground px-2 shrink-0" onClick={() => setBgUrl("")}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
        {bgUrl && (
          <div className="relative h-24 border border-border overflow-hidden bg-muted">
            <img src={displayImageUrl(bgUrl) ?? bgUrl} alt="معاينة" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
            <span className="absolute bottom-1 end-1 font-mono text-[10px] bg-black/60 text-white px-1">معاينة</span>
          </div>
        )}
      </div>

      <Button className="font-mono rounded-none" onClick={handleSave} disabled={saving || isUploading || !isPro}>
        {saving ? <><Loader2 className="w-4 h-4 animate-spin me-1" />جاري الحفظ...</> : "حفظ التخصيص"}
      </Button>
    </div>
  );
}

// ── Voice Room ─────────────────────────────────────────────────────────────────

function VoiceRoomCard({ isPro }: { isPro: boolean }) {
  const { t } = useTranslation("rooms");
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
                    <X className="w-3 h-3 me-1" />حذف
                  </Button>
                )}
              </div>
              {clearPassword && <p className="font-mono text-[10px] text-yellow-500 mt-1">كلمة المرور ستُحذف عند الحفظ</p>}
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
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓ تأكيد الحذف"}
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
    } finally { setSaving(false); }
  };

  const handleDisable = async () => {
    await customFetch("/api/lfg/bot", { method: "DELETE" });
    setEnabled(false);
    toast({ title: "تم تعطيل البوت" });
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <div className="flex items-center justify-between mb-2">
        <SectionHeader icon={Bot} title="بوت LFG التلقائي" />
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors -mt-4 ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
        </button>
      </div>
      <p className="font-mono text-xs text-muted-foreground -mt-2">ينشر بوت LFG منشورًا تلقائيًا بشكل دوري نيابةً عنك.</p>

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
          {([["30د", 30], ["ساعة", 60], ["ساعتين", 120], ["4 ساعات", 240]] as [string, number][]).map(([label, val]) => (
            <button key={val} onClick={() => setIntervalMinutes(val)}
              className={`flex-1 font-mono text-xs py-2 border transition-colors ${intervalMinutes === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="font-mono rounded-none flex-1" onClick={handleSave} disabled={saving || !isPro}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin me-1" />جاري...</> : "حفظ الإعدادات"}
        </Button>
        {botSettings?.enabled && (
          <Button variant="outline" className="font-mono rounded-none" onClick={handleDisable}>تعطيل البوت</Button>
        )}
      </div>
    </div>
  );
}

// ── Gift Pro ────────────────────────────────────────────────────────────────────

function GiftProCard({ me, isPro }: { me: any; isPro: boolean }) {
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
      toast({ title: `تم إهداء Pro لـ ${res.giftedTo.displayName} 🎁` });
      setOpen(false); setSelectedId(0);
    } catch (e: any) {
      toast({ title: "فشل الإهداء", description: e?.data?.error, variant: "destructive" });
    } finally { setGifting(false); }
  };

  return (
    <div className={`bg-card border p-6 space-y-4 relative ${isPro ? "border-primary/30" : "border-border opacity-70"}`}>
      {!isPro && <ProLock />}
      <SectionHeader icon={Gift} title="إهداء Pro" />
      <p className="font-mono text-xs text-muted-foreground -mt-2">أهدِ صديقًا شهرًا من Pro مجانًا — مرة واحدة كل 90 يومًا.</p>

      {lastGift && (
        <p className="font-mono text-xs text-muted-foreground">
          آخر إهداء: {new Date(lastGift.createdAt).toLocaleDateString("ar")} → {lastGift.toUser?.displayName}
          {!canGift && ` (متاح بعد ${daysUntilNext} يوم)`}
        </p>
      )}

      <Button className="font-mono rounded-none" onClick={() => setOpen(true)} disabled={!canGift || !isPro}>
        <Gift className="w-4 h-4 me-2" />
        {canGift ? "إهداء شهر Pro لصديق" : `متاح بعد ${daysUntilNext} يوم`}
      </Button>

      {open && (
        <div className="border border-border bg-background p-4 space-y-3 mt-2">
          <p className="font-mono text-xs uppercase text-muted-foreground tracking-widest">اختر صديقًا</p>
          <select value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full bg-background border border-border font-mono text-sm p-2 rounded-none">
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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProPage() {
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

      {/* Page header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-black font-mono tracking-tighter uppercase flex items-center gap-3">
          <Crown className="w-6 h-6 text-yellow-400" /> Pro
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">مميزات اشتراك Pro الحصرية</p>
      </div>

      {/* Status banner (Pro only) */}
      <ProStatusBanner isPro={isPro} expiresAt={expiresAt} />

      {/* Activation code (non-Pro only) */}
      <ActivationCard isPro={isPro} />

      {/* Feature cards */}
      <div className="space-y-4">
        <ProProfileCard me={me} isPro={isPro} onSave={refreshMe} />
        <VoiceRoomCard isPro={isPro} />
        <LfgBotCard isPro={isPro} />
        <GiftProCard me={me} isPro={isPro} />
      </div>
    </div>
  );
}
