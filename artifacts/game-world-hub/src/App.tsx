import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { Shell } from '@/components/layout/shell';
import '@/lib/api';
import { useEffect } from 'react';

import Dashboard from '@/pages/dashboard';
import Login from '@/pages/login';
import Register from '@/pages/register';
import Friends from '@/pages/friends';
import Chat from '@/pages/chat';
import Parties from '@/pages/parties';
import PartyDetail from '@/pages/party-detail';
import Games from '@/pages/games';
import Profile from '@/pages/profile';
import Settings from '@/pages/settings';
import NotFound from '@/pages/not-found';

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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/">
        <Shell>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/friends" component={Friends} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/:conversationId" component={Chat} />
            <Route path="/parties" component={Parties} />
            <Route path="/party/:partyId" component={PartyDetail} />
            <Route path="/games" component={Games} />
            <Route path="/profile/:userId" component={Profile} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <ElectronNavigationBridge />
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
