import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  authService,
  type AuthScope,
  type LoginInput,
  type PlayerIdentity,
  type PlayerRole,
  type RegisterInput,
  type RegisterResult,
} from "@/lib/playfab";

/**
 * Session wrapper around the PlayFab auth service.
 *
 * Player and administrator sessions are completely SEPARATE: each portal has
 * its own stored session and its own role validation, so being signed in as a
 * player never grants admin access and vice-versa. Identity, roles,
 * registration and recovery always come from the service layer, so swapping
 * the mock for real PlayFab calls requires no component changes.
 */

interface AuthContextValue {
  /** Player-portal session (null when only an admin is signed in). */
  player: PlayerIdentity | null;
  /** Admin-portal session. */
  admin: PlayerIdentity | null;
  ready: boolean;
  /** True when a PLAYER session exists. */
  isAuthenticated: boolean;
  /** True when an ADMIN session exists. */
  isAdmin: boolean;
  role: PlayerRole | null;
  login: (input: Omit<LoginInput, "scope">) => Promise<PlayerIdentity>;
  loginAdmin: (input: Omit<LoginInput, "scope">) => Promise<PlayerIdentity>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: (scope?: AuthScope) => Promise<void>;
}

/**
 * Kept on globalThis so a hot-reload of this module reuses the SAME context
 * object; otherwise already-mounted consumers read a fresh, empty context and
 * throw "useAuth must be used inside <AuthProvider>" until a full refresh.
 */
const globalScope = globalThis as typeof globalThis & {
  __civilcraftAuthContext?: React.Context<AuthContextValue | null>;
};
const AuthContext =
  globalScope.__civilcraftAuthContext ?? createContext<AuthContextValue | null>(null);
globalScope.__civilcraftAuthContext = AuthContext;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [admin, setAdmin] = useState<PlayerIdentity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlayer(authService.getCurrentUser("player"));
    setAdmin(authService.getCurrentUser("admin"));
    setReady(true);
  }, []);

  const login = useCallback(async (input: Omit<LoginInput, "scope">) => {
    const identity = await authService.login({ ...input, scope: "player" });
    setPlayer(identity);
    return identity;
  }, []);

  /**
   * Administrator sign-in runs entirely server-side: the server verifies the
   * PlayFab credentials AND the admin role, then issues a signed admin token.
   * No client-side value (email prefix, username, localStorage) grants access.
   */
  const loginAdmin = useCallback(async (input: Omit<LoginInput, "scope">) => {
    const { adminLogin } = await import("@/lib/playfab/admin.functions");
    const result = await adminLogin({
      data: { identifier: input.email, password: input.password },
    });
    if (!result.ok) throw new Error(result.message);
    const identity: PlayerIdentity = {

      playFabId: result.playFabId,
      displayName: result.displayName,
      ...(result.email ? { email: result.email } : {}),
      role: "admin",
      isAdmin: true,
    };
    authService.storeAdminSession(identity, result.token);
    setAdmin(identity);
    return identity;
  }, []);


  /** Registration never grants a session — the backend owns verification. */
  const register = useCallback(
    async (input: RegisterInput) => authService.register(input),
    [],
  );

  const requestPasswordReset = useCallback(
    async (email: string) => authService.requestPasswordReset(email),
    [],
  );

  const logout = useCallback(async (scope: AuthScope = "player") => {
    await authService.logout(scope);
    if (scope === "admin") setAdmin(null);
    else setPlayer(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      player,
      admin,
      ready,
      isAuthenticated: !!player,
      isAdmin: !!admin,
      role: player ? "player" : admin ? "admin" : null,
      login,
      loginAdmin,
      register,
      requestPasswordReset,
      logout,
    }),
    [player, admin, ready, login, loginAdmin, register, requestPasswordReset, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
