import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useGetUser, useGetUserPlatforms, useGetUserContentLinks, useGetFriendStatus, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriend, useBlockUser, useUnblockUser, useGetLibrary, useGetMe, useUpdateMyStatus, useListProfilePhotos, useAddProfilePhoto, useDeleteProfilePhoto, useListProfileComments, useCreateProfileComment, useDeleteProfileComment, useDeleteMyAvatar, useDeleteMyBanner, getGetUserQueryKey, getGetUserPlatformsQueryKey, getGetUserContentLinksQueryKey, getGetFriendStatusQueryKey, getGetLibraryQueryKey, getGetMeQueryKey, getListProfilePhotosQueryKey, getListProfileCommentsQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { contentMeta } from "@/lib/content-platforms";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Gamepad2, Calendar, Monitor, Link as LinkIcon, Radio, ExternalLink, UserPlus, UserCheck, UserX, Clock, Check, Ban, ShieldOff, ImagePlus, MessageSquareText, Send, Trash2, Upload, X } from "lucide-react";
import { TierBadge, DivisionBadge, TierPip, getDivision, TIER_CONFIG, type TierName } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { useImageUpload } from "@/hooks/use-image-upload";
import { displayImageUrl } from "@/lib/image-url";

export default function Profile() {
  const { t } = useTranslation("profile");
  const [, params] = useRoute("/profile/:userId");
  const userId = params?.userId ? parseInt(params.userId) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetUser(userId, {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId) }
  });

  const { data: platforms } = useGetUserPlatforms(userId, {
    query: { enabled: !!userId, queryKey: getGetUserPlatformsQueryKey(userId) }
  });

  const { data: contentLinks } = useGetUserContentLinks(userId, {
    query: { enabled: !!userId, queryKey: getGetUserContentLinksQueryKey(userId) }
  });

  const { data: friendStatus } = useGetFriendStatus(userId, {
    query: { enabled: !!userId, queryKey: getGetFriendStatusQueryKey(userId) }
  });

  const { data: library } = useGetLibrary(userId, {
    query: { enabled: !!userId, queryKey: getGetLibraryQueryKey(userId) }
  });

  const { data: me } = useGetMe();
  const updateStatus = useUpdateMyStatus();
  const deleteAvatar = useDeleteMyAvatar();
  const deleteBanner = useDeleteMyBanner();
  const isOwner = !!me && me.id === userId;

  const refreshUser = () => {
    queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const handleDeleteAvatar = () => {
    deleteAvatar.mutate(undefined, {
      onSuccess: () => { toast({ title: t("toasts.avatarDeleted") }); refreshUser(); },
      onError: () => toast({ title: t("toasts.deleteFailed"), variant: "destructive" }),
    });
  };

  const handleDeleteBanner = () => {
    deleteBanner.mutate(undefined, {
      onSuccess: () => { toast({ title: t("toasts.bannerDeleted") }); refreshUser(); },
      onError: () => toast({ title: t("toasts.deleteFailed"), variant: "destructive" }),
    });
  };

  // ── Visual log (photo gallery) + comms wall ────────────────────
  const { data: photos } = useListProfilePhotos(userId, {
    query: { enabled: !!userId, queryKey: getListProfilePhotosQueryKey(userId) },
  });
  const { data: wall } = useListProfileComments(userId, {
    query: { enabled: !!userId, queryKey: getListProfileCommentsQueryKey(userId) },
  });
  const addPhoto = useAddProfilePhoto();
  const deletePhoto = useDeleteProfilePhoto();
  const createComment = useCreateProfileComment();
  const deleteComment = useDeleteProfileComment();
  const { upload, isUploading } = useImageUpload();
  const [commentText, setCommentText] = useState("");
  const photoFileRef = useRef<HTMLInputElement>(null);

  const refreshPhotos = () => queryClient.invalidateQueries({ queryKey: getListProfilePhotosQueryKey(userId) });
  const refreshWall = () => queryClient.invalidateQueries({ queryKey: getListProfileCommentsQueryKey(userId) });

  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const objectPath = await upload(file);
      addPhoto.mutate({ data: { objectPath } }, {
        onSuccess: () => { toast({ title: t("toasts.imageAdded") }); refreshPhotos(); },
        onError: (err) => toast({ title: t("toasts.imageAddFailed"), description: (err.data as { error?: string })?.error, variant: "destructive" }),
      });
    } catch (err) {
      toast({ title: t("toasts.uploadFailed"), description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    createComment.mutate({ userId, data: { body } }, {
      onSuccess: () => { setCommentText(""); refreshWall(); },
      onError: (err) => toast({ title: t("toasts.postFailed"), description: (err.data as { error?: string })?.error || t("toasts.postNotAllowed"), variant: "destructive" }),
    });
  };

  const handleLaunch = (launchUri: string | null | undefined, name: string) => {
    if (!launchUri) {
      toast({ title: t("toasts.noLaunchTitle"), description: t("toasts.noLaunchDesc", { name }) });
      return;
    }
    // Protocol deep-link: opens the platform client if installed on the device.
    window.location.href = launchUri;
    toast({ title: t("toasts.launchingTitle", { name }), description: t("toasts.launchingDesc") });
    // Reflect the launch as our active presence ("ACTIVE PROCESS").
    updateStatus.mutate(
      { data: { currentGame: name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          if (me?.id) queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(me.id) });
        },
      },
    );
  };

  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();

  const refreshRelationship = () => {
    queryClient.invalidateQueries({ queryKey: getGetFriendStatusQueryKey(userId) });
    queryClient.invalidateQueries();
  };

  const handleAdd = () => {
    sendRequest.mutate({ data: { toUserId: userId } }, {
      onSuccess: () => { toast({ title: t("toasts.requestSent") }); refreshRelationship(); },
      onError: () => toast({ title: t("toasts.requestSentFailed"), variant: "destructive" }),
    });
  };

  const handleAccept = () => {
    if (!friendStatus?.requestId) return;
    acceptRequest.mutate({ requestId: friendStatus.requestId }, {
      onSuccess: () => { toast({ title: t("toasts.requestAccepted") }); refreshRelationship(); },
      onError: () => toast({ title: t("toasts.requestAcceptFailed"), variant: "destructive" }),
    });
  };

  const handleRemove = () => {
    removeFriend.mutate({ friendId: userId }, {
      onSuccess: () => { toast({ title: t("toasts.friendRemoved") }); refreshRelationship(); },
      onError: () => toast({ title: t("toasts.friendRemoveFailed"), variant: "destructive" }),
    });
  };

  const handleBlock = () => {
    blockUser.mutate({ userId }, {
      onSuccess: () => { toast({ title: t("toasts.userBlocked") }); refreshRelationship(); },
      onError: () => toast({ title: t("toasts.userBlockFailed"), variant: "destructive" }),
    });
  };

  const handleUnblock = () => {
    unblockUser.mutate({ userId }, {
      onSuccess: () => { toast({ title: t("toasts.userUnblocked") }); refreshRelationship(); },
      onError: () => toast({ title: t("toasts.userUnblockFailed"), variant: "destructive" }),
    });
  };

  const friendBusy = sendRequest.isPending || acceptRequest.isPending || removeFriend.isPending || blockUser.isPending || unblockUser.isPending;

  if (isLoading) return <div className="p-12 text-center font-mono text-muted-foreground animate-pulse">{t("loading")}</div>;
  if (!user) return <div className="p-12 text-center font-mono text-destructive">{t("notFound")}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ── PROFILE CARD ─────────────────────────────────────── */}
      <div className="bg-card border border-border overflow-hidden">

        {/* BANNER — tall, identity anchored to bottom */}
        <div className="relative h-52 overflow-hidden group">
          {/* Pro profile background (behind banner) */}
          {user.profileBgUrl && (
            <img
              src={displayImageUrl(user.profileBgUrl) ?? user.profileBgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt="" className="w-full h-full object-cover relative z-[1]" data-testid="img-profile-banner" />
          ) : (
            !user.profileBgUrl && <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted/20 to-background" />
          )}
          {/* gradient layers */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-card/70 via-transparent to-transparent" />

          {/* Delete banner (owner only, on hover) */}
          {isOwner && user.bannerUrl && (
            <button
              onClick={handleDeleteBanner}
              disabled={deleteBanner.isPending}
              className="absolute top-2 end-2 p-1.5 bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive z-10"
              title={t("deleteBanner")}
              data-testid="button-delete-banner"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Friend action buttons — top-right, non-owner only */}
          {friendStatus && friendStatus.state !== "self" && (
            <div className="absolute top-4 end-4 flex items-center gap-2 z-10">
              {friendStatus.state === "blocked" ? (
                <Button onClick={handleUnblock} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2 bg-background/90">
                  <ShieldOff className="w-4 h-4" /> {t("friend.unblock")}
                </Button>
              ) : (
                <>
                  {friendStatus.state === "none" && (
                    <Button onClick={handleAdd} disabled={friendBusy} className="font-mono rounded-none gap-2 shadow-lg">
                      <UserPlus className="w-4 h-4" /> {t("friend.add")}
                    </Button>
                  )}
                  {friendStatus.state === "request_sent" && (
                    <Button variant="outline" disabled className="font-mono rounded-none gap-2 bg-background/90">
                      <Clock className="w-4 h-4" /> {t("friend.requestSent")}
                    </Button>
                  )}
                  {friendStatus.state === "request_received" && (
                    <Button onClick={handleAccept} disabled={friendBusy} className="font-mono rounded-none gap-2 shadow-lg">
                      <Check className="w-4 h-4" /> {t("friend.acceptRequest")}
                    </Button>
                  )}
                  {friendStatus.state === "friends" && (
                    <Button onClick={handleRemove} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2 bg-background/90 group/btn">
                      <UserCheck className="w-4 h-4 group-hover/btn:hidden" />
                      <UserX className="w-4 h-4 hidden group-hover/btn:block text-destructive" />
                      <span className="group-hover/btn:hidden">{t("friend.friends")}</span>
                      <span className="hidden group-hover/btn:inline text-destructive">{t("friend.remove")}</span>
                    </Button>
                  )}
                  <Button onClick={handleBlock} disabled={friendBusy} variant="outline" size="icon" title={t("friend.blockUser")} className="text-muted-foreground hover:text-destructive rounded-none bg-background/90">
                    <Ban className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          )}

        </div>

        {/* AVATAR + IDENTITY ROW — overlaps banner */}
        <div className="px-6 -mt-14 relative z-10 flex items-end gap-5">
          <div className="relative shrink-0 group">
            {/* Avatar circle — Pro frame color or default card border */}
            <div
              className="w-28 h-28 rounded-full border-4 bg-muted overflow-hidden flex items-center justify-center"
              style={{ borderColor: user.profileFrameColor ?? undefined }}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-4xl text-muted-foreground select-none">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              )}
              {/* Delete avatar (owner, on hover) */}
              {isOwner && user.avatarUrl && (
                <button
                  onClick={handleDeleteAvatar}
                  disabled={deleteAvatar.isPending}
                  className="absolute inset-0 rounded-full bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-destructive"
                  title={t("deleteAvatar")}
                  data-testid="button-delete-avatar"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            {/* Status pill — fully OUTSIDE the avatar, below it */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card border border-border px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
              <StatusBadge status={user.status} className="w-2 h-2 shrink-0" />
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                {user.status}
              </span>
            </div>
          </div>

          {/* Identity — beside the avatar */}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase leading-tight">
                {user.displayName}
              </h1>
              {user.isPro && <ProBadge size="icon" className="w-5 h-5" />}
            </div>
            <p className="text-primary font-mono text-sm mt-1">@{user.username}</p>
          </div>
        </div>

        {/* BODY */}
        <div className="px-6 pt-8 pb-6 space-y-4">

          {/* Bio */}
          {user.bio && (
            <p className="text-muted-foreground border-s-2 border-border ps-4 italic font-mono text-sm leading-relaxed">
              "{user.bio}"
            </p>
          )}

          {/* Rank + XP block — Design 4 holographic style */}
          {"tier" in user && user.tier && (() => {
            const t2 = user.tier as TierName;
            const cfg2 = TIER_CONFIG[t2] ?? TIER_CONFIG["INITIATE"];
            const C1 = cfg2.color1, C2 = cfg2.color2, BR = cfg2.border;
            const lv = user.tierLevel ?? 1;
            const xpIn = user.xpIntoLevel ?? 0;
            const xpNx = user.xpForNext ?? 400;
            const pct = xpNx > 0 ? Math.min(100, Math.round((xpIn / xpNx) * 100)) : 0;
            const div = getDivision(t2, lv);
            return (
              <div style={{ position: "relative" }}>
                {/* outer glow frame */}
                <div style={{ position:"absolute", inset:-1, background:`linear-gradient(135deg,${C1}55,${C2}22,transparent,${C1}33)` }} />
                <div style={{ position:"relative", background:"hsl(var(--card))", overflow:"hidden" }}>
                  {/* scanlines */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none", opacity:0.018, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.6) 2px,rgba(255,255,255,0.6) 3px)" }} />
                  {/* corner brackets */}
                  {(["tl","tr","bl","br"] as const).map(pos => (
                    <div key={pos} style={{
                      position:"absolute",
                      top: pos.startsWith("t") ? 6 : undefined,
                      bottom: pos.startsWith("b") ? 6 : undefined,
                      left: pos.endsWith("l") ? 6 : undefined,
                      right: pos.endsWith("r") ? 6 : undefined,
                      width:10, height:10,
                      borderColor:"rgba(255,255,255,0.55)", borderStyle:"solid",
                      borderTopWidth:    pos.startsWith("t") ? 2 : 0,
                      borderBottomWidth: pos.startsWith("b") ? 2 : 0,
                      borderLeftWidth:   pos.endsWith("l")   ? 2 : 0,
                      borderRightWidth:  pos.endsWith("r")   ? 2 : 0,
                    }} />
                  ))}
                  {/* header bar */}
                  <div style={{ borderBottom:`1px solid ${C1}66`, padding:"5px 16px", display:"flex", justifyContent:"space-between", background:"rgba(0,0,0,0.2)" }}>
                    <span style={{ fontFamily:"monospace", fontSize:8, color:`${C1}99`, letterSpacing:"0.3em" }}>// RANK //</span>
                    <span style={{ fontFamily:"monospace", fontSize:8, color:`${C1}99`, letterSpacing:"0.2em" }}>S01</span>
                  </div>
                  {/* body */}
                  <div style={{ display:"flex", alignItems:"center", gap:0 }}>
                    {/* badge */}
                    <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:8, borderInlineEnd:`1px solid ${C1}66`, background:"rgba(0,0,0,0.12)", flexShrink:0, position:"relative" }}>
                      <div style={{ position:"absolute", width:100, height:100, borderRadius:"50%", border:`1px solid ${C1}44`, pointerEvents:"none" }} />
                      <div style={{ position:"absolute", width:80,  height:80,  borderRadius:"50%", border:`1px solid ${C1}66`, pointerEvents:"none" }} />
                      <TierBadge tier={t2} level={lv} xpIntoLevel={xpIn} xpForNext={xpNx} size="sm" showXpBar={false} />
                      <div style={{ border:`1px solid ${C1}99`, padding:"2px 10px", fontFamily:"monospace", fontSize:8, color:C1, letterSpacing:"0.2em", textAlign:"center", boxShadow:`0 0 8px ${C1}22 inset` }}>
                        DIV {div}
                      </div>
                    </div>
                    {/* info */}
                    <div style={{ flex:1, padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                      <div>
                        <div style={{ fontFamily:"monospace", fontSize:8, color:`${C1}cc`, letterSpacing:"0.3em", marginBottom:3 }}>[ الرتبة ]</div>
                        <svg height="36" style={{ display:"block", overflow:"visible", filter:`drop-shadow(0 0 10px ${C1}77)` }}>
                          <defs>
                            <linearGradient id={`pg-${t2}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor="#ffffff" />
                              <stop offset="55%"  stopColor={BR} />
                              <stop offset="100%" stopColor={C1} />
                            </linearGradient>
                          </defs>
                          <text x="0" y="31" fill={`url(#pg-${t2})`} fontSize="32" fontWeight="900" fontFamily="Arial Black, sans-serif">
                            {cfg2.labelAr}
                          </text>
                        </svg>
                        <div style={{ fontFamily:"monospace", fontSize:8, color:`${C1}99`, letterSpacing:"0.25em", marginTop:2 }}>{cfg2.label} // LVL {lv}</div>
                      </div>
                      {/* divider */}
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ flex:1, height:1, background:`linear-gradient(90deg,transparent,${C1}cc)` }} />
                        <span style={{ color:C1, fontSize:10 }}>⚔</span>
                        <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${C1}cc,transparent)` }} />
                      </div>
                      {/* XP bar */}
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:8, marginBottom:4 }}>
                          <span style={{ color:BR }}>█ {xpIn} XP</span>
                          <span style={{ color:"rgba(255,255,255,0.3)" }}>{xpNx} XP ▓</span>
                        </div>
                        <div style={{ height:6, background:"rgba(0,0,0,0.4)", border:`1px solid ${C1}88`, position:"relative", overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg,${C2},${C1},${BR})`, boxShadow:`0 0 10px ${C1}99`, transition:"width 0.7s ease" }} />
                          <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(90deg,transparent,transparent 4px,rgba(0,0,0,0.25) 4px,rgba(0,0,0,0.25) 5px)" }} />
                        </div>
                        <div style={{ fontFamily:"monospace", fontSize:8, color:`${C1}aa`, marginTop:3 }}>
                          {xpNx - xpIn} XP → LVL {lv + 1}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stats row */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5">
              <Gamepad2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground uppercase tracking-widest">{t("activeProcess")}</span>
              {user.currentGame ? (
                <span className="text-primary flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />{user.currentGame}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("none")}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4 shrink-0" />
              {t("init", { date: format(new Date(user.createdAt), "yyyy.MM.dd") })}
            </div>
          </div>

          {/* Content / social links */}
          {contentLinks && contentLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contentLinks.map(c => {
                const meta = contentMeta(c.platform);
                const Icon = meta?.icon ?? Radio;
                return (
                  <a
                    key={c.id}
                    href={c.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs font-mono bg-background border px-3 py-1.5 hover:bg-muted/30 transition-colors group"
                    style={{ borderColor: meta?.color ?? "var(--border)" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: meta?.color }} />
                    <span>{c.handle}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom accent line */}
        <div className="h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Linked Platforms */}
        <div className="bg-card border border-border p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" /> {t("linkedSystems.title")}
          </h2>
          
          <div className="space-y-3">
            {!platforms || platforms.length === 0 ? (
              <div className="text-sm font-mono text-muted-foreground italic">{t("linkedSystems.empty")}</div>
            ) : (
              platforms.map(p => (
                <a key={p.id} href={p.profileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 border border-border hover:border-primary/50 bg-background transition-colors group">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-bold text-sm capitalize">{p.platform}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{p.username || t("linkedSystems.linked")}</span>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Library Preview */}
        <div className="bg-card border border-border p-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
            <Library className="w-4 h-4" /> {t("library.title")} {library && library.length > 0 ? `(${library.length})` : ""}
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {library?.slice(0, 9).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleLaunch(g.launchUri, g.name)}
                title={g.launchUri ? t("library.launchTitle", { name: g.name }) : g.name}
                className="aspect-[3/4] bg-background border border-border relative group overflow-hidden text-start"
              >
                {g.coverUrl ? (
                  <img src={g.coverUrl} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-xs text-center p-1 text-muted-foreground">
                    {g.name.substring(0, 3).toUpperCase()}
                  </div>
                )}
                {g.launchUri && (
                  <span className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-5 h-5 text-primary" />
                  </span>
                )}
              </button>
            ))}
            {(!library || library.length === 0) && (
              <div className="col-span-full text-sm font-mono text-muted-foreground italic">{t("library.empty")}</div>
            )}
          </div>
        </div>
      </div>

      {/* Visual Log (photo gallery) */}
      <div className="bg-card border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
            <ImagePlus className="w-4 h-4" /> {t("visualLog.title")} {photos ? `(${photos.length}/12)` : ""}
          </h2>
          {isOwner && (photos?.length ?? 0) < 12 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="font-mono rounded-none text-xs gap-2"
                onClick={() => photoFileRef.current?.click()}
                disabled={isUploading || addPhoto.isPending}
                data-testid="button-add-photo"
              >
                <Upload className="w-3.5 h-3.5" /> {isUploading ? t("visualLog.uploading") : t("visualLog.addImage")}
              </Button>
              <input ref={photoFileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} data-testid="input-photo-file" />
            </>
          )}
        </div>
        {!photos || photos.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground italic">{t("visualLog.empty")}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="aspect-square bg-background border border-border relative group overflow-hidden" data-testid={`photo-${p.id}`}>
                <img src={p.objectPath} alt={p.caption ?? ""} title={p.caption ?? undefined} className="w-full h-full object-cover" loading="lazy" />
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => deletePhoto.mutate({ photoId: p.id }, { onSuccess: refreshPhotos })}
                    className="absolute top-1 end-1 p-1.5 bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    title={t("visualLog.deleteImage")}
                    data-testid={`button-delete-photo-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comms Wall (profile comments) */}
      <div className="bg-card border border-border p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
          <MessageSquareText className="w-4 h-4" /> {t("commsWall.title")}
          {wall && !wall.enabled && <span className="text-muted-foreground text-xs">{t("commsWall.offline")}</span>}
        </h2>

        {wall && !wall.enabled && !isOwner ? (
          <div className="text-sm font-mono text-muted-foreground italic" data-testid="text-wall-disabled">
            {t("commsWall.disabled")}
          </div>
        ) : (
          <div className="space-y-6">
            {(wall?.enabled || isOwner) && (
              <form onSubmit={submitComment} className="space-y-2">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={isOwner ? t("commsWall.placeholderOwn") : t("commsWall.placeholderOther", { name: user.displayName })}
                  className="font-mono rounded-none border-border bg-background resize-none"
                  data-testid="input-comment"
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">{commentText.length}/500</span>
                  <Button
                    type="submit"
                    size="sm"
                    className="font-mono rounded-none text-xs gap-2"
                    disabled={createComment.isPending || commentText.trim().length === 0}
                    data-testid="button-post-comment"
                  >
                    <Send className="w-3.5 h-3.5" /> {t("commsWall.post")}
                  </Button>
                </div>
              </form>
            )}

            {!wall || wall.comments.length === 0 ? (
              <div className="text-sm font-mono text-muted-foreground italic">{t("commsWall.empty")}</div>
            ) : (
              <div className="space-y-3">
                {wall.comments.map((c) => (
                  <div key={c.id} className="p-3 border border-border bg-background flex gap-3 group" data-testid={`comment-${c.id}`}>
                    <Link href={`/profile/${c.author.id}`} className="shrink-0">
                      <div className="w-9 h-9 border border-border bg-muted overflow-hidden flex items-center justify-center">
                        {c.author.avatarUrl ? (
                          <img src={c.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-mono text-sm text-muted-foreground">{c.author.displayName.charAt(0)}</span>
                        )}
                      </div>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/profile/${c.author.id}`} className="font-bold text-sm hover:text-primary truncate">
                          {c.author.displayName}
                        </Link>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                          {format(new Date(c.createdAt), "yyyy.MM.dd HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words mt-1">{c.body}</p>
                    </div>
                    {(isOwner || me?.id === c.author.id) && (
                      <button
                        type="button"
                        onClick={() => deleteComment.mutate({ userId, commentId: c.id }, { onSuccess: refreshWall })}
                        className="shrink-0 self-start p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        title={t("commsWall.deleteComment")}
                        data-testid={`button-delete-comment-${c.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Needed to fix import error above
import { Library, Play } from "lucide-react";