import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { UserRole } from '../types';
import {
  isPlayFabConfigured,
  loginWithPlayFab,
  registerWithPlayFab,
  resolveRegistrationRole,
  updateCurrentPlayerData,
  refreshUserFromPlayFab,
  storeSessionTicket,
  clearSessionTicket,
  getStoredSessionTicket,
  PLAYFAB_DATA_KEYS,
} from '../services/playfab';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  initials: string;
  hasSection: boolean;
  sectionCode?: string;
  sessionTicket?: string;
  statistics?: Record<string, number>;
}

interface RegisterInput {
  name: string;
  email: string;
  username: string;
  password: string;
}

interface DemoRegisteredUser extends AuthUser {
  username: string;
  password: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string, isAdmin: boolean) => Promise<{ ok: boolean; error?: string }>;
  register: (input: RegisterInput) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isPlayFabEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/*  Storage keys                                                       */
/* ------------------------------------------------------------------ */

const AUTH_STORAGE_KEY = 'civilcraft-user';
const REGISTERED_USERS_STORAGE_KEY = 'civilcraft-registered-users';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextType | null>(null);

/* ------------------------------------------------------------------ */
/*  Demo users (fallback when PlayFab is not configured)              */
/* ------------------------------------------------------------------ */

const DEMO_USERS: Record<string, AuthUser> = {
  admin: {
    name: 'Dr. Alex Morgan',
    email: 'admin@civilcraft.edu',
    role: 'super_admin',
    initials: 'AM',
    hasSection: true,
  },
  professor: {
    name: 'Prof. Sarah Chen',
    email: 'sarah.chen@civilcraft.edu',
    role: 'professor',
    initials: 'SC',
    hasSection: true,
  },
  student: {
    name: 'James Rivera',
    email: 'j.rivera@civilcraft.edu',
    role: 'student',
    initials: 'JR',
    hasSection: false,
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CC'
  );
}

function loadRegisteredUsers(): DemoRegisteredUser[] {
  const cached = localStorage.getItem(REGISTERED_USERS_STORAGE_KEY);
  if (!cached) return [];
  try {
    return JSON.parse(cached) as DemoRegisteredUser[];
  } catch {
    localStorage.removeItem(REGISTERED_USERS_STORAGE_KEY);
    return [];
  }
}

function saveRegisteredUsers(users: DemoRegisteredUser[]) {
  localStorage.setItem(REGISTERED_USERS_STORAGE_KEY, JSON.stringify(users));
}

function buildAuthUserFromRegistration(input: RegisterInput, role: UserRole): AuthUser {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role,
    initials: getInitials(input.name),
    hasSection: role !== 'student',
  };
}

function persistUser(user: AuthUser) {
  // Don't persist session ticket to localStorage (it's in sessionStorage)
  const { sessionTicket: _st, ...safe } = user;
  void _st;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safe));
}

function loadPersistedUser(): AuthUser | null {
  const cached = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!cached) return null;
  try {
    const user = JSON.parse(cached) as AuthUser;
    // Restore session ticket from sessionStorage
    const ticket = getStoredSessionTicket();
    if (ticket) user.sessionTicket = ticket;
    return user;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadPersistedUser());

  // Sync tab visibility - validate session when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlayFabConfigured()) {
        const ticket = getStoredSessionTicket();
        if (user && !ticket) {
          // Session ticket was cleared (browser restart, etc.)
          // Keep user logged in but without API access until next login
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  /* ---------------------------------------------------------------- */
  /*  Refresh User (re-read data from PlayFab)                         */
  /*  Call this after admin assigns section or changes role             */
  /* ---------------------------------------------------------------- */

  const refreshUser = useCallback(async () => {
    if (!isPlayFabConfigured() || !user) return;

    const ticket = getStoredSessionTicket();
    if (!ticket) return;

    try {
      const refreshed = await refreshUserFromPlayFab(ticket);
      if (refreshed) {
        const updatedUser: AuthUser = {
          id: refreshed.playFabId,
          name: refreshed.displayName,
          email: refreshed.email,
          role: refreshed.role,
          initials: getInitials(refreshed.displayName),
          hasSection: refreshed.hasSection,
          sectionCode: refreshed.sectionCode,
          sessionTicket: refreshed.sessionTicket,
          statistics: refreshed.statistics,
        };
        setUser(updatedUser);
        persistUser(updatedUser);
      }
    } catch {
      // Silently fail - user can still use cached data
    }
  }, [user]);

  /* ---------------------------------------------------------------- */
  /*  Login                                                            */
  /* ---------------------------------------------------------------- */

  const login = async (
    username: string,
    password: string,
    isAdmin: boolean,
  ): Promise<{ ok: boolean; error?: string }> => {
    /* --- PlayFab login --- */
    if (isPlayFabConfigured()) {
      try {
        const pfUser = await loginWithPlayFab({
          identifier: username,
          password,
          preferAdminRole: isAdmin,
        });

        const authUser: AuthUser = {
          id: pfUser.playFabId,
          name: pfUser.displayName,
          email: pfUser.email,
          role: pfUser.role,
          initials: getInitials(pfUser.displayName),
          hasSection: pfUser.hasSection,
          sectionCode: pfUser.sectionCode,
          sessionTicket: pfUser.sessionTicket,
          statistics: pfUser.statistics,
        };

        setUser(authUser);
        persistUser(authUser);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'PlayFab authentication failed.',
        };
      }
    }

    /* --- Demo login --- */
    const normalizedIdentifier = username.trim().toLowerCase();

    // Check registered demo users first
    const registeredUsers = loadRegisteredUsers();
    const matchedRegisteredUser = registeredUsers.find(
      (entry) =>
        (entry.username.toLowerCase() === normalizedIdentifier ||
          entry.email.toLowerCase() === normalizedIdentifier) &&
        entry.password === password,
    );

    if (matchedRegisteredUser) {
      const demoRegisteredAuthUser: AuthUser = {
        id: matchedRegisteredUser.id,
        name: matchedRegisteredUser.name,
        email: matchedRegisteredUser.email,
        role: matchedRegisteredUser.role,
        initials: matchedRegisteredUser.initials,
        hasSection: matchedRegisteredUser.hasSection,
      };

      setUser(demoRegisteredAuthUser);
      persistUser(demoRegisteredAuthUser);
      return { ok: true };
    }

    // Fallback demo users
    const u = normalizedIdentifier;
    let demoUser: AuthUser;
    if (isAdmin) {
      demoUser = DEMO_USERS.admin;
    } else if (u.includes('super') || u.includes('root') || u.includes('admin')) {
      demoUser = DEMO_USERS.admin;
    } else if (
      u.includes('prof') ||
      u.includes('teacher') ||
      u.includes('instructor') ||
      u.includes('edu.ph')
    ) {
      demoUser = DEMO_USERS.professor;
    } else if (u.includes('student') || u.includes('james') || u.includes('jr')) {
      demoUser = DEMO_USERS.student;
    } else {
      demoUser = { ...DEMO_USERS.student, hasSection: true };
    }

    setUser(demoUser);
    persistUser(demoUser);
    return { ok: true };
  };

  /* ---------------------------------------------------------------- */
  /*  Register                                                         */
  /*  Creates a PlayFab account so the same credentials work in the   */
  /*  Unity game. The shared Title ID connects both platforms.        */
  /* ---------------------------------------------------------------- */

  const register = async (
    input: RegisterInput,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmedInput: RegisterInput = {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      username: input.username.trim(),
      password: input.password,
    };

    if (
      !trimmedInput.name ||
      !trimmedInput.email ||
      !trimmedInput.username ||
      !trimmedInput.password
    ) {
      return { ok: false, error: 'Please complete all registration fields.' };
    }

    if (trimmedInput.password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    if (trimmedInput.username.length < 3 || trimmedInput.username.length > 20) {
      return { ok: false, error: 'Username must be 3-20 characters.' };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedInput.email)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }

    // Auto-detect role from email
    const role = resolveRegistrationRole(trimmedInput.email);

    /* --- PlayFab registration --- */
    if (isPlayFabConfigured()) {
      try {
        const registration = await registerWithPlayFab({
          username: trimmedInput.username,
          email: trimmedInput.email,
          password: trimmedInput.password,
          displayName: trimmedInput.name,
        });

        // Write user data so the game can read the role
        if (registration.SessionTicket) {
          storeSessionTicket(registration.SessionTicket);
          await updateCurrentPlayerData(registration.SessionTicket, {
            [PLAYFAB_DATA_KEYS.ROLE]: role,
            [PLAYFAB_DATA_KEYS.HAS_SECTION]: role === 'student' ? 'false' : 'true',
            [PLAYFAB_DATA_KEYS.ONBOARDING_PENDING]: 'false',
            [PLAYFAB_DATA_KEYS.DISPLAY_NAME]: trimmedInput.name,
          });
        }

        const authUser: AuthUser = {
          id: registration.PlayFabId,
          sessionTicket: registration.SessionTicket,
          ...buildAuthUserFromRegistration(trimmedInput, role),
        };

        setUser(authUser);
        persistUser(authUser);
        return { ok: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Registration failed.';
        // Provide friendly error messages
        if (msg.includes('Username not available')) {
          return { ok: false, error: 'That username is already taken. Please choose another.' };
        }
        if (msg.includes('Email address already exists') || msg.includes('Email address not available')) {
          return { ok: false, error: 'An account with that email already exists. Try logging in instead.' };
        }
        return { ok: false, error: msg };
      }
    }

    /* --- Demo registration --- */
    const registeredUsers = loadRegisteredUsers();

    const usernameTaken = registeredUsers.some(
      (entry) => entry.username.toLowerCase() === trimmedInput.username.toLowerCase(),
    );
    const emailTaken = registeredUsers.some(
      (entry) => entry.email.toLowerCase() === trimmedInput.email.toLowerCase(),
    );

    if (usernameTaken) {
      return { ok: false, error: 'That username is already in use.' };
    }
    if (emailTaken) {
      return { ok: false, error: 'That email is already registered.' };
    }

    const demoRegisteredUser: DemoRegisteredUser = {
      id: `demo-${Date.now()}`,
      username: trimmedInput.username,
      password: trimmedInput.password,
      ...buildAuthUserFromRegistration(trimmedInput, role),
    };

    saveRegisteredUsers([...registeredUsers, demoRegisteredUser]);

    const authUser: AuthUser = {
      id: demoRegisteredUser.id,
      name: demoRegisteredUser.name,
      email: demoRegisteredUser.email,
      role: demoRegisteredUser.role,
      initials: demoRegisteredUser.initials,
      hasSection: demoRegisteredUser.hasSection,
    };

    setUser(authUser);
    persistUser(authUser);
    return { ok: true };
  };

  /* ---------------------------------------------------------------- */
  /*  Logout                                                           */
  /* ---------------------------------------------------------------- */

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    clearSessionTicket();
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        refreshUser,
        isAuthenticated: !!user,
        isPlayFabEnabled: isPlayFabConfigured(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
