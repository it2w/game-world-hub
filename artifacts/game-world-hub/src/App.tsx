import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { VoiceProvider } from '@/voice/voice-context';
import { Shell } from '@/components/layout/shell';
import '@/lib/api';
import { useEffect, type ReactNode } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { useTranslation } from 'react-i18next';
import { isRtl } from '@/i18n';

import Dashboard from '@/pages/dashboard';
import Login from '@/pages/login';
import Register from '@/pages/register';
import Friends from '@/pages/friends';
import Chat from '@/pages/chat';
import Parties from '@/pages/parties';
import PartyDetail from '@/pages/party-detail';
import Lfg from '@/pages/lfg';
import Achievements from '@/pages/achievements';
import LibraryPage from '@/pages/library';
import Profile from '@/pages/profile';
import Settings from '@/pages/settings';
import Stats from '@/pages/stats';
import Challenges from '@/pages/challenges';
import Rooms from '@/pages/rooms';
import Admin from '@/pages/admin';
import Owner from '@/pages/owner';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Registers a listener for Electron deep-link / tray navigation events.
 * Only active when running inside the desktop shell (window.electronAPI defined).
 */
function ElectronNavigationBridge() {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!window.electronAPI) return;

    // Main process sends 'navigate' IPC messages for deep links and tray clicks
    const unsubscribe = window.electronAPI.onNavigate((path: string) => {
      navigate(path);
    });

    return unsubscribe;
  }, [navigate]);

  return null;
}

/**
 * "/" is public: guests see the marketing landing page, signed-in users get
 * their dashboard. Shell renders bare children for unauthenticated visitors,
 * so the landing page controls the full viewport.
 */
function HomeRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Dashboard /> : <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/owner" component={Owner} />

      {/* Any non-auth route renders inside the authenticated Shell layout.
          A pathless <Route> matches everything not already handled above, so
          the inner <Switch> resolves the actual page against the same location. */}
      <Route>
        <Shell>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/friends" component={Friends} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/:conversationId" component={Chat} />
            <Route path="/parties" component={Parties} />
            <Route path="/party/:partyId" component={PartyDetail} />
            <Route path="/lfg" component={Lfg} />
            <Route path="/ranks" component={Achievements} />
            <Route path="/games" component={LibraryPage} />
            <Route path="/profile/:userId" component={Profile} />
            <Route path="/settings" component={Settings} />
            <Route path="/stats" component={Stats} />
            <Route path="/challenges" component={Challenges} />
            <Route path="/rooms" component={Rooms} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Route>
    </Switch>
  );
}

/**
 * Applies the active language to <html> (lang + dir) so CSS and the whole
 * layout follow it, and feeds the direction to Radix components.
 */
function LocaleShell({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const lang = isRtl(i18n.resolvedLanguage) ? 'ar' : 'en';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleShell>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider>
              <VoiceProvider>
                <ElectronNavigationBridge />
                <Router />
              </VoiceProvider>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LocaleShell>
    </QueryClientProvider>
  );
}

export default App;
