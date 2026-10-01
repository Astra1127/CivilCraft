import { useQueryClient } from "@tanstack/react-query";
import { validatePlayerSession, PlayFabError } from "@/lib/playfab/client";
import {
  currentSessionTicket,
  sessionEnded,
  subscribePlayerSession,
} from "@/lib/playfab/session-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  authService,
  type AuthScope,
  type LoginInput,
  type PlayerIdentity,
  type PlayerRole,
  type RegisterInput,
  type RegisterResult,
} from "@/lib/playfab";
import { getAdminSession } from "@/lib/admin-auth/functions";
import { ADMIN_AUTH_MESSAGES, type AdminUser } from "@/lib/admin-auth/types";

/** Player identity comes from PlayFab; staff identity is verified by the server cookie. */
interface AuthContextValue {
  player: PlayerIdentity | null;
  admin: AdminUser | null;
  ready: boolean;
  adminReady: boolean;
  playerSessionError: boolean;
  sessionExpired: boolean;
  retryPlayerSession: () => void;
  adminConfigured: boolean;
  adminSessionError: boolean;
  /** Player session only. */
  isAuthenticated: boolean;
  /** Server-verified staff session only. */
  isAdmin: boolean;
  role: PlayerRole | null;
  login: (input: Omit<LoginInput, "scope">) => Promise<PlayerIdentity>;
  loginAdmin: (input: { email: string; password: string }) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: (scope?: AuthScope) => Promise<void>;
}

// Reuse the context object across hot reloads.
const globalScope = globalThis as typeof globalThis & {
  __civilcraftAuthContext?: React.Context<AuthContextValue | null>;
};
const AuthContext =
  globalScope.__civilcraftAuthContext ?? createContext<AuthContextValue | null>(null);
globalScope.__civilcraftAuthContext = AuthContext;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);
  const [adminReady, setAdminReady] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState(false);
  const [adminSessionError, setAdminSessionError] = useState(false);
  const adminRequest = useRef(0);
  const playerRequest = useRef(0);
  const verifiedTicket = useRef<string | null>(null);
  const [playerSessionError, setPlayerSessionError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const retryRef = useRef<() => void>(() => {});
  const retryPlayerSession = useCallback(() => retryRef.current(), []);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    let pendingTicket: string | null = null;
    let observedTicket = currentSessionTicket();
    const refresh = async () => {
      const ticket = currentSessionTicket();
      if (observedTicket !== ticket) {
        observedTicket = ticket;
        ++playerRequest.current;
        pendingTicket = null;
        verifiedTicket.current = null;
        setPlayer(null);
        // Drop stale player data, including queries keyed only by feature name.
        const filter = {
          predicate: (q: { queryKey: readonly unknown[] }) =>
            !q.queryKey.some((k) => typeof k === "string" && k.includes("admin")),
        };
        void queryClient.cancelQueries(filter);
        queryClient.removeQueries(filter);
      }
      if (pendingTicket === ticket && ticket) return;
      const request = ++playerRequest.current;
      if (!ticket) {
        pendingTicket = null;
        verifiedTicket.current = null;
        setPlayer(null);
        setReady(true);
        setPlayerSessionError(false);
        setSessionExpired(sessionEnded());
        return;
      }
      if (verifiedTicket.current !== ticket) {
        setPlayer(null);
        setReady(false);
      }
      pendingTicket = ticket;
      try {
        const identity = await validatePlayerSession();
        if (!mounted || request !== playerRequest.current || currentSessionTicket() !== ticket)
          return;
        verifiedTicket.current = ticket;
        setPlayer(identity);
        setReady(true);
        setPlayerSessionError(false);
        setSessionExpired(false);
      } catch {
        if (!mounted || request !== playerRequest.current || currentSessionTicket() !== ticket)
          return;
        // A failed connection cannot revoke an already verified session. On startup,
        // retain storage and show a retry state without trusting the stored identity.
        setPlayerSessionError(true);
      } finally {
        if (pendingTicket === ticket) pendingTicket = null;
      }
    };
    const changed = () => {
      void refresh();
    };
    const unsubscribe = subscribePlayerSession(changed);
    retryRef.current = () => {
      void refresh();
    };
    void refresh();
    window.addEventListener("focus", retryRef.current);
    window.addEventListener("online", retryRef.current);
    const onFocus = retryRef.current;
    const timer = window.setInterval(onFocus, 60_000);
    try {
      window.localStorage.removeItem("civilcraft.session.admin.v1");
    } catch {
      /* legacy only */
    }
    return () => {
      mounted = false;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const request = ++adminRequest.current;
      try {
        const status = await getAdminSession();
        if (!mounted || request !== adminRequest.current) return;
        setAdmin(status.authenticated ? status.user : null);
        setAdminConfigured(status.configured);
        setAdminSessionError(false);
      } catch {
        if (!mounted || request !== adminRequest.current) return;
        setAdmin(null);
        setAdminSessionError(true);
      } finally {
        if (mounted && request === adminRequest.current) setAdminReady(true);
      }
    };
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, []);

  const login = useCallback(
    async (input: Omit<LoginInput, "scope">) => {
      const identity = await authService.login({ ...input, scope: "player" });
      const ticket = currentSessionTicket();
      if (!ticket)
        throw new PlayFabError("Your session expired. Please log in again.", "session_expired");
      ++playerRequest.current;
      verifiedTicket.current = ticket;
      setPlayer(identity);
      setReady(true);
      setPlayerSessionError(false);
      setSessionExpired(false);

      // Refresh player data after successful login
      if (typeof queryClient?.invalidateQueries === "function") {
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
        void queryClient.invalidateQueries({ queryKey: ["progress"] });
        void queryClient.invalidateQueries({ queryKey: ["character"] });
        void queryClient.invalidateQueries({ queryKey: ["achievements"] });
        void queryClient.invalidateQueries({ queryKey: ["almanac-journey"] });
        void queryClient.invalidateQueries({ queryKey: ["stats"] });
      }

      return identity;
    },
    [queryClient],
  );

  const register = useCallback(async (input: RegisterInput) => authService.register(input), []);
  const loginAdmin = useCallback(async (input: { email: string; password: string }) => {
    let response: Response;
    try {
      response = await fetch("/api/auth/admin/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(ADMIN_AUTH_MESSAGES.failed);
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const message = Object.values(ADMIN_AUTH_MESSAGES).find((value) => value === result?.error);
      throw new Error(message ?? ADMIN_AUTH_MESSAGES.failed);
    }
    // The HttpOnly cookie, rechecked by the server, is the source of admin state.
    const request = ++adminRequest.current;
    try {
      const status = await getAdminSession();
      if (request !== adminRequest.current || !status.authenticated || !status.user)
        throw new Error(ADMIN_AUTH_MESSAGES.failed);
      setAdmin(status.user);
      setAdminConfigured(status.configured);
      setAdminSessionError(false);
      setAdminReady(true);
    } catch {
      if (request === adminRequest.current) {
        setAdmin(null);
        setAdminSessionError(true);
      }
      throw new Error(ADMIN_AUTH_MESSAGES.failed);
    }
  }, []);
  const requestPasswordReset = useCallback(
    async (email: string) => authService.requestPasswordReset(email),
    [],
  );

  const logout = useCallback(async (scope: AuthScope = "player") => {
    if (scope === "admin") {
      const response = await fetch("/api/auth/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Administrator sign-out failed. Please try again.");
      ++adminRequest.current;
      setAdmin(null);
    } else {
      await authService.logout("player");
      setPlayer(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      player,
      admin,
      ready,
      adminReady,
      playerSessionError,
      sessionExpired,
      retryPlayerSession,
      adminConfigured,
      adminSessionError,
      isAuthenticated: !!player,
      isAdmin: !!admin,
      role: admin ? "admin" : player ? "player" : null,
      login,
      loginAdmin,
      register,
      requestPasswordReset,
      logout,
    }),
    [
      player,
      admin,
      ready,
      adminReady,
      playerSessionError,
      sessionExpired,
      retryPlayerSession,
      adminConfigured,
      adminSessionError,
      login,
      loginAdmin,
      register,
      requestPasswordReset,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
