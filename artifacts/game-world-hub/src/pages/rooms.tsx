import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { customFetch, useGetMe, useGetMePro } from "@workspace/api-client-react";
import { Mic, Lock, Unlock, Crown, Loader2, LogIn, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useVoice } from "@/voice/voice-context";

interface RoomOwner { id: number; username: string; displayName: string; avatarUrl: string | null }
interface Room {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
  owner: RoomOwner;
}

function RoomCard({ room, myId, onJoin }: { room: Room; myId: number; onJoin: (room: Room) => void }) {
  const { t } = useTranslation("rooms");
  const { activeRoom, leaveVoice } = useVoice();
  const roomName = `proroom:${room.id}`;
  const isActive = activeRoom?.room === roomName;

  return (
    <div style={{ position: "relative" }}>
      {/* glow frame */}
      <div style={{ position: "absolute", inset: -1, background: isActive ? "linear-gradient(135deg,hsl(var(--primary)/0.5),transparent)" : "transparent" }} />
      <div style={{
        background: "hsl(var(--card))",
        border: `1px solid ${isActive ? "hsl(var(--primary)/0.6)" : "hsl(var(--border))"}`,
        padding: 16,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* corner brackets when active */}
        {isActive && (
          <>
            <div style={{ position: "absolute", top: 5, left: 5, width: 10, height: 10, borderTop: "2px solid hsl(var(--primary))", borderLeft: "2px solid hsl(var(--primary))" }} />
            <div style={{ position: "absolute", bottom: 5, right: 5, width: 10, height: 10, borderBottom: "2px solid hsl(var(--primary))", borderRight: "2px solid hsl(var(--primary))" }} />
          </>
        )}

        <div className="flex items-start gap-3">
          {/* room image or default */}
          <div style={{ width: 52, height: 52, flexShrink: 0, position: "relative" }}>
            {room.imageUrl ? (
              <img src={room.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid hsl(var(--border))" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mic style={{ width: 20, height: 20, color: "hsl(var(--muted-foreground))" }} />
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-sm truncate">{room.name}</span>
              {room.hasPassword
                ? <Lock style={{ width: 12, height: 12, color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                : <Unlock style={{ width: 12, height: 12, color: "hsl(var(--primary))", flexShrink: 0 }} />
              }
            </div>
            {room.description && (
              <p className="font-mono text-xs text-muted-foreground mb-1 truncate">{room.description}</p>
            )}
            <div className="flex items-center gap-1.5">
              {room.owner.avatarUrl
                ? <img src={room.owner.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover border border-border" />
                : <div className="w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center font-mono text-[9px]">{room.owner.displayName[0]}</div>
              }
              <span className="font-mono text-[10px] text-muted-foreground">{t("hosted")} {room.owner.displayName}</span>
            </div>
          </div>

          <Button
            size="sm"
            variant={isActive ? "destructive" : "default"}
            className="font-mono rounded-none h-8 text-xs shrink-0"
            onClick={() => isActive ? leaveVoice() : onJoin(room)}
          >
            {isActive ? (
              <><Users className="w-3 h-3 me-1" /> في الغرفة</>
            ) : (
              <><LogIn className="w-3 h-3 me-1" /> {t("join")}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RoomsPage() {
  const { t } = useTranslation("rooms");
  const { data: me } = useGetMe();
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;
  const { toast } = useToast();
  const { joinProRoom } = useVoice();

  const { data: rooms = [], isLoading } = useQuery<Room[]>({
    queryKey: ["rooms"],
    queryFn: () => customFetch("/api/rooms"),
    refetchInterval: 20_000,
  });

  const [joinTarget, setJoinTarget] = useState<Room | null>(null);
  const [password, setPassword] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoin = (room: Room) => {
    if (room.hasPassword) {
      setJoinTarget(room);
      setPassword("");
    } else {
      void joinProRoom(room.id, room.name);
    }
  };

  const handlePasswordJoin = async () => {
    if (!joinTarget) return;
    setJoining(true);
    try {
      await customFetch(`/api/rooms/${joinTarget.id}/verify-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
      });
      setJoinTarget(null);
      await joinProRoom(joinTarget.id, joinTarget.name);
    } catch {
      toast({ title: t("wrongPassword"), variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black font-mono tracking-tighter uppercase flex items-center gap-3">
            <Mic className="w-6 h-6 text-primary" /> {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">{t("subtitle")}</p>
        </div>
        {isPro && (
          <Button
            variant="outline"
            size="sm"
            className="font-mono rounded-none text-xs"
            onClick={() => window.location.href = "/settings#myroom"}
          >
            <Crown className="w-3 h-3 me-1 text-primary" /> {t("myRoom")}
          </Button>
        )}
      </div>

      {/* Pro upsell for non-pro */}
      {!isPro && (
        <div className="bg-card border border-primary/30 p-6 flex items-start gap-4">
          <Crown className="w-8 h-8 text-primary shrink-0 mt-1" />
          <div>
            <p className="font-mono font-bold text-primary text-sm uppercase tracking-widest mb-1">{t("proOnly")}</p>
            <p className="font-mono text-xs text-muted-foreground">{t("proOnlyDesc")}</p>
          </div>
        </div>
      )}

      {/* Rooms list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card border border-border animate-pulse" />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <Mic className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-mono text-sm text-muted-foreground uppercase">{t("noRooms")}</p>
          <p className="font-mono text-xs text-muted-foreground mt-1">{t("noRoomsDesc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <RoomCard key={room.id} room={room} myId={me?.id ?? 0} onJoin={handleJoin} />
          ))}
        </div>
      )}

      {/* Password dialog */}
      <Dialog open={!!joinTarget} onOpenChange={() => setJoinTarget(null)}>
        <DialogContent className="font-mono rounded-none border-border bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" /> {t("passwordRequired")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="font-mono text-xs text-muted-foreground">
              {joinTarget?.name}
            </p>
            <Input
              type="password"
              placeholder={t("enterPassword")}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePasswordJoin()}
              className="font-mono rounded-none border-border bg-background"
              autoFocus
            />
            <Button
              className="w-full font-mono rounded-none"
              onClick={handlePasswordJoin}
              disabled={joining || !password}
            >
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : t("join")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
