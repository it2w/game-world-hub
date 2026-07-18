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
import { Gamepad2, Users, MessageSquare, Library, Settings, LogOut, Search, Activity, Bell, Radar, Trophy, Crown, BarChart2, Swords, Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isRtl } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe, useListNotifications, getGetMeQueryKey, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/animated-logo";
import { ProBadge } from "@/components/pro-badge";
import { Shield } from "lucide-react";

export function AppSidebar() {
  const { t, i18n } = useTranslation("common");
  const rtl = isRtl(i18n.language);
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const { data: notifications } = useListNotifications({
    query: { refetchInterval: 10000, queryKey: getListNotificationsQueryKey() }
  });
  
  const unreadMessageCount = notifications?.filter(n => !n.isRead && n.type === "message").length || 0;

  const isActive = (path: string) => location === path || location.startsWith(`${path}/`);

  return (
    <Sidebar side={rtl ? "right" : "left"} className="border-e border-border bg-sidebar h-screen">
      <SidebarHeader className="border-b border-border p-4 flex items-center gap-2 font-mono text-primary uppercase font-bold tracking-wider">
        <AnimatedLogo className="h-5 w-auto text-primary" />
        <span>{t("sidebar.header")}</span>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("sidebar.groupComms")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"}>
                  <Link href="/">
                    <Gamepad2 className="w-4 h-4" />
                    <span>{t("sidebar.dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/friends")}>
                  <Link href="/friends">
                    <Users className="w-4 h-4" />
                    <span>{t("sidebar.friends")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/chat")}>
                  <Link href="/chat">
                    <MessageSquare className="w-4 h-4" />
                    <span>{t("sidebar.chat")}</span>
                    {unreadMessageCount > 0 && (
                      <span className="ms-auto min-w-[1.25rem] h-5 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center font-bold px-1">
                        {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/parties")}>
                  <Link href="/parties">
                    <Activity className="w-4 h-4" />
                    <span>{t("sidebar.parties")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/lfg")}>
                  <Link href="/lfg">
                    <Radar className="w-4 h-4" />
                    <span>{t("sidebar.lfg")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ranks")}>
                  <Link href="/ranks">
                    <Trophy className="w-4 h-4" />
                    <span>{t("sidebar.ranks")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/stats")}>
                  <Link href="/stats">
                    <BarChart2 className="w-4 h-4" />
                    <span>{t("sidebar.stats")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/challenges")}>
                  <Link href="/challenges">
                    <Swords className="w-4 h-4" />
                    <span>{t("sidebar.challenges")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/rooms")}>
                  <Link href="/rooms">
                    <Mic className="w-4 h-4" />
                    <span>{t("sidebar.rooms")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/pro")}>
                  <Link href="/pro">
                    <Crown className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 font-bold">{t("sidebar.pro")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("sidebar.groupData")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/games")}>
                  <Link href="/games">
                    <Library className="w-4 h-4" />
                    <span>{t("sidebar.library")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")}>
                  <Link href="/settings">
                    <Settings className="w-4 h-4" />
                    <span>{t("sidebar.settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user?.isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <Link href="/admin">
                      <Shield className="w-4 h-4" />
                      <span>{t("sidebar.admin")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
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
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-sm object-cover border-2"
                    style={{ borderColor: (user as any).profileFrameColor ?? "hsl(var(--border))" }}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center border-2 font-mono text-xs"
                    style={{ borderColor: (user as any).profileFrameColor ?? "hsl(var(--border))" }}
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`absolute -bottom-1 -end-1 w-3 h-3 rounded-full border-2 border-sidebar ${
                  user.status === 'online' ? 'bg-green-500' :
                  user.status === 'away' ? 'bg-yellow-500' :
                  user.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'
                }`} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold leading-none text-foreground">{user.displayName}</span>
                  {user.isPro && <ProBadge size="icon" />}
                </div>
                <span className="text-xs text-muted-foreground font-mono leading-none mt-1">@{user.username}</span>
              </div>
            </Link>
            <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-destructive" title={t("sidebar.signOut")} aria-label={t("sidebar.signOut")}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
