import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Gamepad2, Users, MessageSquare, Library, Settings, LogOut, Search, Activity, Bell, Radar, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe, useListNotifications, getGetMeQueryKey, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";

export function AppSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: 10000, queryKey: getListNotificationsQueryKey() }
  });
  
  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const isActive = (path: string) => location === path || location.startsWith(`${path}/`);

  return (
    <Sidebar className="border-r border-border bg-sidebar h-screen">
      <SidebarHeader className="border-b border-border p-4 flex items-center gap-2 font-mono text-primary uppercase font-bold tracking-wider">
        <AnimatedLogo className="w-5 h-5 text-primary" />
        <span>GWH_OS</span>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Comms</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"}>
                  <Link href="/">
                    <Gamepad2 className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/friends")}>
                  <Link href="/friends">
                    <Users className="w-4 h-4" />
                    <span>Friends</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/chat")}>
                  <Link href="/chat">
                    <MessageSquare className="w-4 h-4" />
                    <span>Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/parties")}>
                  <Link href="/parties">
                    <Activity className="w-4 h-4" />
                    <span>Parties</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/lfg")}>
                  <Link href="/lfg">
                    <Radar className="w-4 h-4" />
                    <span>LFG</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ranks")}>
                  <Link href="/ranks">
                    <Trophy className="w-4 h-4" />
                    <span>Ranks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Data</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/games")}>
                  <Link href="/games">
                    <Library className="w-4 h-4" />
                    <span>Library</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")}>
                  <Link href="/settings">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        {user ? (
          <div className="flex items-center justify-between">
            <Link href={`/profile/${user.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="relative">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-8 h-8 rounded-sm object-cover border border-border" />
                ) : (
                  <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center border border-border font-mono text-xs">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-sidebar ${
                  user.status === 'online' ? 'bg-green-500' :
                  user.status === 'away' ? 'bg-yellow-500' :
                  user.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'
                }`} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-none text-foreground">{user.displayName}</span>
                <span className="text-xs text-muted-foreground font-mono leading-none mt-1">@{user.username}</span>
              </div>
            </Link>
            <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
