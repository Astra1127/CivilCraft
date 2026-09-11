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

  useEffect(() => {
    setPlayer(authService.getCurrentUser("player"));
    // Discard obsolete staff credentials; browser storage never grants admin access.
    try {
      window.localStorage.removeItem("civilcraft.session.admin.v1");
    } catch {
      /* storage unavailable */
    }
    setReady(true);
  }, []);

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

  const login = useCallback(async (input: Omit<LoginInput, "scope">) => {
    const identity = await authService.login({ ...input, scope: "player" });
    setPlayer(identity);
    return identity;
  }, []);

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
