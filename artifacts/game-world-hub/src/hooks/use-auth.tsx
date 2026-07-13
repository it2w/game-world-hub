import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem("gwh_token"));
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  const isAuthenticated = !!user;

  useEffect(() => {
    const publicPaths = ["/login", "/register"];
    if (publicPaths.includes(location)) return;

    if (!token) {
      setLocation("/login");
    } else if (isError) {
      localStorage.removeItem("gwh_token");
      setToken(null);
      setLocation("/login");
    }
  }, [token, isError, location, setLocation]);

  // Keep Electron's main process in sync with the current user status
  useEffect(() => {
    if (user && window.electronAPI) {
      window.electronAPI.setStatus(user.status);
    }
  }, [user?.status]);

  const login = (newToken: string) => {
    localStorage.setItem("gwh_token", newToken);
    setToken(newToken);
    // Give main process the JWT so it can poll notifications
    window.electronAPI?.setAuthToken(newToken);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const logout = () => {
    localStorage.removeItem("gwh_token");
    setToken(null);
    window.electronAPI?.clearAuthToken();
    queryClient.clear();
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading: isLoading && !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
