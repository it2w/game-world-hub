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
import { TierBadge, DivisionBadge, TierPip, type TierName } from "@/components/tier-badge";
import { ProBadge } from "@/components/pro-badge";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { useImageUpload } from "@/hooks/use-image-upload";

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
      <div className="bg-card border border-border relative overflow-hidden">
        {user.bannerUrl ? (
          <div className="h-44 relative border-b border-border group">
            <img src={user.bannerUrl} alt="" className="w-full h-full object-cover" data-testid="img-profile-banner" />
            <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
            {isOwner && (
              <button
                onClick={handleDeleteBanner}
                disabled={deleteBanner.isPending}
                className="absolute top-2 end-2 p-1.5 bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                title={t("deleteBanner")}
                data-testid="button-delete-banner"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : isOwner ? (
          <div className="h-32 relative border-b border-border bg-gradient-to-br from-primary/10 via-muted/20 to-background flex items-center justify-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 select-none">
              {t("noBanner")}
            </span>
          </div>
        ) : null}
        <div className="p-8 relative flex flex-col md:flex-row gap-8 items-center md:items-start">
        <div className="absolute top-0 end-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 shrink-0">
          <div className="w-32 h-32 border-2 border-border bg-muted flex items-center justify-center relative group">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono text-5xl text-muted-foreground">{user.displayName.charAt(0)}</span>
            )}
            <div className="absolute -bottom-2 -end-2 p-1 bg-card">
              <StatusBadge status={user.status} className="w-5 h-5 border-[3px]" />
            </div>
            {isOwner && user.avatarUrl && (
              <button
                onClick={handleDeleteAvatar}
                disabled={deleteAvatar.isPending}
                className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-destructive"
                title={t("deleteAvatar")}
                data-testid="button-delete-avatar"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex-1 text-center md:text-start space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-4xl font-bold font-mono tracking-tighter uppercase">{user.displayName}</h1>
                {user.isPro && <ProBadge size="md" />}
              </div>
              <p className="text-primary font-mono text-sm mt-1">@{user.username}</p>
            </div>

            {friendStatus && friendStatus.state !== "self" && (
              <div className="shrink-0 flex items-center gap-2">
                {friendStatus.state === "blocked" ? (
                  <Button onClick={handleUnblock} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2">
                    <ShieldOff className="w-4 h-4" /> {t("friend.unblock")}
                  </Button>
                ) : (
                  <>
                    {friendStatus.state === "none" && (
                      <Button onClick={handleAdd} disabled={friendBusy} className="font-mono rounded-none gap-2">
                        <UserPlus className="w-4 h-4" /> {t("friend.add")}
                      </Button>
                    )}
                    {friendStatus.state === "request_sent" && (
                      <Button variant="outline" disabled className="font-mono rounded-none gap-2">
                        <Clock className="w-4 h-4" /> {t("friend.requestSent")}
                      </Button>
                    )}
                    {friendStatus.state === "request_received" && (
                      <Button onClick={handleAccept} disabled={friendBusy} className="font-mono rounded-none gap-2">
                        <Check className="w-4 h-4" /> {t("friend.acceptRequest")}
                      </Button>
                    )}
                    {friendStatus.state === "friends" && (
                      <Button onClick={handleRemove} disabled={friendBusy} variant="outline" className="font-mono rounded-none gap-2 group">
                        <UserCheck className="w-4 h-4 group-hover:hidden" />
                        <UserX className="w-4 h-4 hidden group-hover:block text-destructive" />
                        <span className="group-hover:hidden">{t("friend.friends")}</span>
                        <span className="hidden group-hover:inline text-destructive">{t("friend.remove")}</span>
                      </Button>
                    )}
                    <Button onClick={handleBlock} disabled={friendBusy} variant="ghost" size="icon" title={t("friend.blockUser")} className="text-muted-foreground hover:text-destructive rounded-none">
                      <Ban className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          
          {user.bio && (
            <p className="max-w-2xl text-muted-foreground border-s-2 border-border ps-4 italic">
              "{user.bio}"
            </p>
          )}

          {/* Auto-computed platform badges */}
          {"tier" in user && user.tier && (
            <div className="flex items-end gap-5 py-2 flex-wrap justify-center md:justify-start">
              <TierBadge
                tier={user.tier as TierName}
                level={user.tierLevel ?? 1}
                xpIntoLevel={user.xpIntoLevel ?? 0}
                xpForNext={user.xpForNext ?? 400}
                size="md"
                showXpBar
              />
              <DivisionBadge
                tier={user.tier as TierName}
                level={user.tierLevel ?? 1}
                size="md"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-2">
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5">
              <Gamepad2 className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground uppercase tracking-widest">{t("activeProcess")}</span>
              {user.currentGame ? (
                <span className="text-primary flex items-center gap-1"><Radio className="w-3 h-3 animate-pulse" />{user.currentGame}</span>
              ) : (
                <span className="text-muted-foreground">{t("none")}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-background border border-border px-3 py-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" /> 
              {t("init", { date: format(new Date(user.createdAt), "yyyy.MM.dd") })}
            </div>
          </div>

          {contentLinks && contentLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
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
        </div>
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