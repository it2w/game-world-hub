import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { customFetch } from "@workspace/api-client-react";
import { Loader2, Users, Tag, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InviteInfo {
  code: string;
  communityId: number;
  communityName: string;
  communitySlug: string;
  memberCount: number;
  gameTag: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

type Status = "loading" | "ready" | "joining" | "success" | "already" | "expired" | "full" | "banned" | "error";

export default function JoinCommunity() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { t } = useTranslation("communities");

  const [status, setStatus] = useState<Status>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const redirectSlug = useRef<string>("");

  // Fetch invite info on mount
  useEffect(() => {
    if (!code) { setStatus("error"); setErrorMsg(t("inviteNotFound")); return; }
    customFetch(`/api/communities/invite/${code}`)
      .then((data: InviteInfo) => { setInvite(data); setStatus("ready"); })
      .catch((err: { status?: number }) => {
        if (err?.status === 410) setStatus("expired");
        else if (err?.status === 404) { setStatus("error"); setErrorMsg(t("inviteNotFound")); }
        else { setStatus("error"); setErrorMsg(t("error")); }
      });
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-redirect after joining or when already a member
  useEffect(() => {
    if (status !== "success" && status !== "already") return;
    const timer = setTimeout(() => navigate(`/communities/${redirectSlug.current}`), 1200);
    return () => clearTimeout(timer);
  }, [status, navigate]);

  const handleJoin = async () => {
    if (!invite || status !== "ready") return;
    setStatus("joining");
    try {
      await customFetch(`/api/communities/invite/${code}/join`, { method: "POST" });
      redirectSlug.current = invite.communitySlug;
      setStatus("success");
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e?.status === 409) { redirectSlug.current = invite.communitySlug; setStatus("already"); }
      else if (e?.status === 410) setStatus("expired");
      else if (e?.status === 403) setStatus("banned");
      else { setStatus("error"); setErrorMsg(t("error")); }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border p-8 space-y-6 text-center">

        {/* Loading */}
        {status === "loading" && (
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        )}

        {/* Ready / Joining — show invite card */}
        {(status === "ready" || status === "joining") && invite && (
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                {t("inviteJoinHeading")}
              </p>
              <h1 className="text-2xl font-bold font-mono break-words">{invite.communityName}</h1>
            </div>

            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {t("membersCount", { count: invite.memberCount })}
              </span>
              {invite.gameTag && (
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  {invite.gameTag}
                </span>
              )}
            </div>

            {invite.maxUses !== null && (
              <p className="text-xs text-muted-foreground">
                {t("inviteUsesRemaining", { remaining: invite.maxUses - invite.uses, max: invite.maxUses })}
              </p>
            )}

            <Button className="w-full" onClick={handleJoin} disabled={status === "joining"}>
              {status === "joining" && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t("join")}
            </Button>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="space-y-3">
            <CheckCircle className="w-10 h-10 text-primary mx-auto" />
            <p className="font-mono font-bold">{t("inviteJoined")}</p>
            <p className="text-xs text-muted-foreground">{t("inviteRedirecting")}</p>
          </div>
        )}

        {/* Already a member */}
        {status === "already" && (
          <div className="space-y-3">
            <CheckCircle className="w-10 h-10 text-primary mx-auto" />
            <p className="font-mono font-bold">{t("inviteAlreadyMember")}</p>
            <p className="text-xs text-muted-foreground">{t("inviteRedirecting")}</p>
          </div>
        )}

        {/* Expired */}
        {status === "expired" && (
          <div className="space-y-3">
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="font-mono font-bold">{t("inviteExpired")}</p>
          </div>
        )}

        {/* Full */}
        {status === "full" && (
          <div className="space-y-3">
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="font-mono font-bold">{t("inviteFull")}</p>
          </div>
        )}

        {/* Banned */}
        {status === "banned" && (
          <div className="space-y-3">
            <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
            <p className="font-mono font-bold">{t("inviteBanned")}</p>
          </div>
        )}

        {/* Generic error */}
        {status === "error" && (
          <div className="space-y-3">
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="font-mono font-bold">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
