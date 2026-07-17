import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { VoicePanel } from "@/voice/components/voice-panel";
import { useInlineStageActive } from "@/voice/inline-stage-store";
import { CallOverlays } from "@/voice/components/incoming-call-dialog";
import { Bell } from "lucide-react";
import { AnimatedLogo } from "@/components/animated-logo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey, useGetMe, getGetMeQueryKey, meHeartbeat, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useVoice } from "@/voice/voice-context";

// While a game is active, keep an open-tab heartbeat so the server's presence
// sweep does not clear currentGame. When the tab closes, heartbeats stop and
// the sweep clears the active game after a few minutes.
function useActivityHeartbeat(enabled: boolean) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled } });
  const hasActiveGame = enabled && !!me?.currentGame;

  React.useEffect(() => {
    if (!hasActiveGame) return;
    // Fire immediately, then keep alive. Not gated on document.hidden so a
    // backgrounded-but-open tab still counts as "playing".
    meHeartbeat().catch(() => {});
    const id = setInterval(() => {
      meHeartbeat().catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [hasActiveGame]);
}

/**
 * When a direct call becomes active (outgoing accepted or incoming accepted),
 * automatically navigate to the chat conversation for that peer so the full
 * layout — sidebar, inline VoiceStage, and messages — all appear at once.
 * Fires only once per call; does nothing again if the user navigates away.
 */
function useCallAutoNavigate() {
  const { activeRoom } = useVoice();
  const [, navigate] = useLocation();
  const handledPeerRef = useRef<number | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (activeRoom?.kind !== "call") {
      handledPeerRef.current = null;
      return;
    }
    const peerId = activeRoom.peer.userId;
    if (handledPeerRef.current === peerId) return; // already navigated for this call
    handledPeerRef.current = peerId;

    // Use the dedicated endpoint — finds OR creates the direct conversation
    customFetch<{ id: number }>(`/api/conversations/direct/${peerId}`)
      .then((conv) => {
        navigateRef.current(`/chat/${conv.id}`);
      })
      .catch(() => {});
  }, [activeRoom]);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const { isAuthenticated, isLoading } = useAuth();
  useActivityHeartbeat(isAuthenticated);
  const inlineStageActive = useInlineStageActive();
  useCallAutoNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 font-mono text-primary text-sm uppercase tracking-widest">
        <AnimatedLogo className="h-12 w-auto" />
        {t("shell.initializing")}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-background overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
      {!inlineStageActive && <VoicePanel />}
      <CallOverlays />
    </SidebarProvider>
  );
}

function TopBar() {
  const { t } = useTranslation("common");
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: 10000, queryKey: getListNotificationsQueryKey() }
  });
  const queryClient = useQueryClient();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur z-10 sticky top-0">
      <div className="font-mono text-xs text-muted-foreground flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        {t("topBar.systemOnline")}
      </div>
      
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 end-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="font-mono text-xs uppercase font-bold">{t("topBar.notifications")}</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary font-mono hover:text-primary/80 hover:bg-transparent" onClick={handleMarkAllRead}>
                  {t("topBar.markAllRead")}
                </Button>
              )}
            </div>
            <div className="max-h-[300px] overflow-auto">
              {!notifications || notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground font-mono">{t("topBar.noAlerts")}</div>
              ) : (
                <div className="flex flex-col">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-3 border-b border-border last:border-0 flex gap-3 ${!n.isRead ? 'bg-primary/5' : ''}`}>
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-sm font-bold">{n.title}</span>
                        {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                        <span className="text-[10px] text-muted-foreground font-mono mt-1">{new Date(n.createdAt).toLocaleTimeString(i18n.language)}</span>
                      </div>
                      {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
