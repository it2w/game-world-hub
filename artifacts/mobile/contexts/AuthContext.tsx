import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { setToken } from '@/lib/auth-token';

const TOKEN_KEY = '@gwh_jwt';

interface LoginResult {
  requiresTwoFactor?: boolean;
  challengeToken?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyToken = useCallback((t: string | null) => {
    setToken(t);
  }, []);

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      return await customFetch<User>('/api/auth/me');
    } catch {
      return null;
    }
  }, []);

  // Load persisted token on mount
  useEffect(() => {
    async function init() {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          applyToken(stored);
          const me = await fetchMe();
          if (me) {
            setUser(me);
          } else {
            // Token expired or invalid
            applyToken(null);
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    void init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const res = await customFetch<
        | { token: string; user: User }
        | { requiresTwoFactor: true; challengeToken: string }
      >('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if ('requiresTwoFactor' in res && res.requiresTwoFactor) {
        return { requiresTwoFactor: true, challengeToken: res.challengeToken };
      }

      const authRes = res as { token: string; user: User };
      applyToken(authRes.token);
      await AsyncStorage.setItem(TOKEN_KEY, authRes.token);
      setUser(authRes.user);
      return {};
    },
    [applyToken],
  );

  const logout = useCallback(async () => {
    try {
      await customFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
    applyToken(null);
    setUser(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }, [applyToken]);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    if (me) setUser(me);
  }, [fetchMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
