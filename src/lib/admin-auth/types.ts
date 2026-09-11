/** Safe staff identity; deliberately unrelated to a PlayFab player identity. */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
}

export type AdminSessionStatus = {
  configured: boolean;
  authenticated: boolean;
  user: AdminUser | null;
};

export const ADMIN_AUTH_MESSAGES = {
  not_configured: "Administrator authentication is not configured.",
  failed: "Unable to reach the Civil Craft authentication service.",
  invalid: "Invalid administrator email or password.",
  limited: "Too many administrator login attempts. Please try again later.",
  denied: "This account does not have administrator access to Civil Craft.",
  offline: "Unable to reach the Civil Craft authentication service.",
} as const;

export type AdminAuthError = keyof typeof ADMIN_AUTH_MESSAGES;
