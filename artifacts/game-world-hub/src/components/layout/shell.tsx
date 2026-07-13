import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { VoicePanel } from "@/voice/components/voice-panel";
import { CallOverlays } from "@/voice/components/incoming-call-dialog";
import { Loader2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function Shell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary text-sm uppercase tracking-widest">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Initializing Core Systems...
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
      <VoicePanel />
      <CallOverlays />
    </SidebarProvider>
  );
}

function TopBar() {
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
        SYSTEM_ONLINE
      </div>
      
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="font-mono text-xs uppercase font-bold">Notifications</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary font-mono hover:text-primary/80 hover:bg-transparent" onClick={handleMarkAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <div className="max-h-[300px] overflow-auto">
              {!notifications || notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground font-mono">No new alerts</div>
              ) : (
                <div className="flex flex-col">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-3 border-b border-border last:border-0 flex gap-3 ${!n.isRead ? 'bg-primary/5' : ''}`}>
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-sm font-bold">{n.title}</span>
                        {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                        <span className="text-[10px] text-muted-foreground font-mono mt-1">{new Date(n.createdAt).toLocaleTimeString()}</span>
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
