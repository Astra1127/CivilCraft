import type { UserRole } from '../types';

const PLAYFAB_TITLE_ID = import.meta.env.VITE_PLAYFAB_TITLE_ID as string | undefined;

/* ------------------------------------------------------------------ */
/*  Shared PlayFab data keys (used by BOTH website and Unity game)    */
/*  These keys must match what your Unity game reads/writes.          */
/* ------------------------------------------------------------------ */
export const PLAYFAB_DATA_KEYS = {
  ROLE: 'role',
  HAS_SECTION: 'hasSection',
  SECTION_CODE: 'sectionCode',
  DISPLAY_NAME: 'displayName',
  ONBOARDING_PENDING: 'onboardingPendingPasswordChange',
} as const;

const INFO_REQUEST_PARAMETERS = {
  GetUserAccountInfo: true,
  GetPlayerProfile: true,
  GetUserData: true,
  GetPlayerStatistics: true,
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlayFabEnvelope<T> {
  code: number;
  status: string;
  data?: T;
  error?: string;
  errorMessage?: string;
  errorDetails?: Record<string, string[]>;
}

interface PlayFabUserDataValue {
  Value: string;
  LastUpdated?: string;
  Permission?: string;
}

interface PlayFabLoginData {
  SessionTicket: string;
  PlayFabId: string;
  NewlyCreated?: boolean;
  InfoResultPayload?: {
    AccountInfo?: {
      Username?: string;
      TitleInfo?: {
        DisplayName?: string;
      };
      PrivateInfo?: {
        Email?: string;
      };
    };
    PlayerProfile?: {
      DisplayName?: string;
      PlayerId?: string;
    };
    UserData?: Record<string, PlayFabUserDataValue>;
    PlayerStatistics?: Array<{ StatisticName: string; Value: number }>;
  };
}

export interface PlayFabLoginResult {
  playFabId: string;
  sessionTicket: string;
  displayName: string;
  email: string;
  role: UserRole;
  hasSection: boolean;
  sectionCode?: string;
  statistics?: Record<string, number>;
  onboardingPending?: boolean;
}

export interface PlayFabRegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

interface PlayFabRegisterData {
  PlayFabId: string;
  SessionTicket?: string;
}

export interface PlayFabProvisionInput {
  name: string;
  email: string;
  username: string;
  role: UserRole;
  defaultPassword: string;
}

export interface PlayFabProvisionResult {
  playFabId: string;
  username: string;
  email: string;
  role: UserRole;
  defaultPassword: string;
}

/* ------------------------------------------------------------------ */
/*  Session ticket management                                         */
/*  Stored so other pages can make authenticated PlayFab API calls    */
/* ------------------------------------------------------------------ */

const SESSION_STORAGE_KEY = 'civilcraft-playfab-session';

export function storeSessionTicket(ticket: string) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, ticket);
}

export function getStoredSessionTicket(): string | null {
  return sessionStorage.getItem(SESSION_STORAGE_KEY);
}

export function clearSessionTicket() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function isPlayFabConfigured(): boolean {
  return Boolean(PLAYFAB_TITLE_ID && PLAYFAB_TITLE_ID !== 'YOUR_PLAYFAB_TITLE_ID');
}

export function getPlayFabTitleId(): string | undefined {
  return PLAYFAB_TITLE_ID;
}

function parseTruthyString(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

export function resolveRegistrationRole(email: string): UserRole {
  const normalized = email.trim().toLowerCase();
  return normalized.includes('edu.ph') ? 'professor' : 'student';
}

function inferRoleFromIdentifier(identifier: string, preferAdmin: boolean): UserRole {
  const key = identifier.toLowerCase();
  if (preferAdmin || key.includes('super') || key.includes('root')) return 'super_admin';
  if (key.includes('admin')) return 'admin';
  if (key.includes('prof') || key.includes('teacher') || key.includes('instructor')) return 'professor';
  if (key.includes('edu.ph')) return 'professor';
  return 'student';
}

function resolveRole(rawRole: string | undefined, identifier: string, preferAdmin: boolean): UserRole {
  if (!rawRole) return inferRoleFromIdentifier(identifier, preferAdmin);
  const normalized = rawRole.trim().toLowerCase();
  if (normalized === 'super_admin' || normalized === 'superadmin' || normalized === 'super admin' || normalized === 'root') {
    return 'super_admin';
  }
  if (normalized === 'admin') return 'admin';
  if (normalized === 'professor' || normalized === 'teacher' || normalized === 'instructor') return 'professor';
  return 'student';
}

function getPlayFabApiUrl(endpoint: string) {
  if (!PLAYFAB_TITLE_ID) {
    throw new Error('PlayFab is not configured. Add VITE_PLAYFAB_TITLE_ID to your .env file.');
  }
  return `https://${PLAYFAB_TITLE_ID}.playfabapi.com/${endpoint}`;
}

function formatPlayFabError(body: PlayFabEnvelope<unknown>): string {
  let msg = body.errorMessage || body.error || 'PlayFab request failed.';
  if (body.errorDetails) {
    const details = Object.entries(body.errorDetails)
      .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
      .join('; ');
    msg += ` (${details})`;
  }
  return msg;
}

async function postToPlayFab<TResponse, TPayload>(
  endpoint: string,
  payload: TPayload,
  headers: Record<string, string> = {},
) {
  const url = getPlayFabApiUrl(endpoint);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as PlayFabEnvelope<TResponse>;

  if (!response.ok || body.error) {
    throw new Error(formatPlayFabError(body));
  }

  if (!body.data) {
    throw new Error('PlayFab response did not include a data payload.');
  }

  return body.data;
}

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/*  Supports both email and username login                             */
/*  The same PlayFab Title ID is shared with the Unity game            */
/* ------------------------------------------------------------------ */

export async function loginWithPlayFab(params: {
  identifier: string;
  password: string;
  preferAdminRole: boolean;
}): Promise<PlayFabLoginResult> {
  const { identifier, password, preferAdminRole } = params;

  const isEmail = identifier.includes('@');
  const endpoint = isEmail ? 'Client/LoginWithEmailAddress' : 'Client/LoginWithPlayFab';
  const payload = isEmail
    ? {
        TitleId: PLAYFAB_TITLE_ID,
        Email: identifier,
        Password: password,
        InfoRequestParameters: INFO_REQUEST_PARAMETERS,
      }
    : {
        TitleId: PLAYFAB_TITLE_ID,
        Username: identifier,
        Password: password,
        InfoRequestParameters: INFO_REQUEST_PARAMETERS,
      };

  const login = await postToPlayFab<PlayFabLoginData, typeof payload>(endpoint, payload);

  const userData = login.InfoResultPayload?.UserData ?? {};
  const role = resolveRole(userData[PLAYFAB_DATA_KEYS.ROLE]?.Value, identifier, preferAdminRole);
  const hasSection =
    parseTruthyString(userData[PLAYFAB_DATA_KEYS.HAS_SECTION]?.Value) || role !== 'student';
  const sectionCode = userData[PLAYFAB_DATA_KEYS.SECTION_CODE]?.Value;
  const onboardingPending = parseTruthyString(userData[PLAYFAB_DATA_KEYS.ONBOARDING_PENDING]?.Value);
  const displayName =
    login.InfoResultPayload?.PlayerProfile?.DisplayName ||
    login.InfoResultPayload?.AccountInfo?.TitleInfo?.DisplayName ||
    login.InfoResultPayload?.AccountInfo?.Username ||
    identifier;

  // Parse statistics from game (score, level, etc.)
  const statistics: Record<string, number> = {};
  if (login.InfoResultPayload?.PlayerStatistics) {
    for (const stat of login.InfoResultPayload.PlayerStatistics) {
      statistics[stat.StatisticName] = stat.Value;
    }
  }

  // Store session ticket for subsequent API calls
  storeSessionTicket(login.SessionTicket);

  return {
    playFabId: login.PlayFabId,
    sessionTicket: login.SessionTicket,
    displayName,
    email: login.InfoResultPayload?.AccountInfo?.PrivateInfo?.Email || identifier,
    role,
    hasSection,
    sectionCode,
    statistics,
    onboardingPending,
  };
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/*  Creates account in PlayFab so it works on BOTH website and game   */
/*  Username + Email + Password = shared credentials                  */
/* ------------------------------------------------------------------ */

export async function registerWithPlayFab(input: PlayFabRegisterInput) {
  const data = await postToPlayFab<PlayFabRegisterData, Record<string, unknown>>(
    'Client/RegisterPlayFabUser',
    {
      TitleId: PLAYFAB_TITLE_ID,
      Username: input.username,
      Email: input.email,
      Password: input.password,
      DisplayName: input.displayName ?? input.username,
      RequireBothUsernameAndEmail: true,
    },
  );

  // Store session ticket from registration
  if (data.SessionTicket) {
    storeSessionTicket(data.SessionTicket);
  }

  return data;
}

/* ------------------------------------------------------------------ */
/*  Update Player Data                                                 */
/*  Sets role, section, etc. - readable by both website and game      */
/* ------------------------------------------------------------------ */

export async function updateCurrentPlayerData(
  sessionTicket: string,
  data: Record<string, string>,
) {
  return postToPlayFab<{ DataVersion: number }, { Data: Record<string, string> }>(
    'Client/UpdateUserData',
    { Data: data },
    { 'X-Authorization': sessionTicket },
  );
}

/* ------------------------------------------------------------------ */
/*  Get Player Data (for reading player info via session)             */
/* ------------------------------------------------------------------ */

export async function getPlayerData(sessionTicket: string, keys?: string[]) {
  return postToPlayFab<
    { Data: Record<string, PlayFabUserDataValue> },
    { Keys?: string[] }
  >(
    'Client/GetUserData',
    { Keys: keys },
    { 'X-Authorization': sessionTicket },
  );
}

/* ------------------------------------------------------------------ */
/*  Update Display Name                                                */
/* ------------------------------------------------------------------ */

export async function updateDisplayName(sessionTicket: string, displayName: string) {
  return postToPlayFab<{ DisplayName: string }, { DisplayName: string }>(
    'Client/UpdateUserTitleDisplayName',
    { DisplayName: displayName },
    { 'X-Authorization': sessionTicket },
  );
}

/* ------------------------------------------------------------------ */
/*  Change Password (for onboarding users who need to reset)          */
/* ------------------------------------------------------------------ */

export async function addGenericServiceId(
  sessionTicket: string,
  serviceId: string,
  userId: string,
) {
  return postToPlayFab<
    Record<string, never>,
    { GenericId: { ServiceName: string; UserId: string } }
  >(
    'Client/AddGenericID',
    { GenericId: { ServiceName: serviceId, UserId: userId } },
    { 'X-Authorization': sessionTicket },
  );
}

/* ------------------------------------------------------------------ */
/*  Assign Section to Player                                           */
/*  Updates player data so both website and game know the section     */
/* ------------------------------------------------------------------ */

export async function assignSectionToPlayer(
  sessionTicket: string,
  sectionCode: string,
) {
  return updateCurrentPlayerData(sessionTicket, {
    [PLAYFAB_DATA_KEYS.HAS_SECTION]: 'true',
    [PLAYFAB_DATA_KEYS.SECTION_CODE]: sectionCode,
  });
}

/* ------------------------------------------------------------------ */
/*  Remove Section from Player                                         */
/* ------------------------------------------------------------------ */

export async function removeSectionFromPlayer(sessionTicket: string) {
  return updateCurrentPlayerData(sessionTicket, {
    [PLAYFAB_DATA_KEYS.HAS_SECTION]: 'false',
    [PLAYFAB_DATA_KEYS.SECTION_CODE]: '',
  });
}

/* ------------------------------------------------------------------ */
/*  Update Player Role                                                 */
/* ------------------------------------------------------------------ */

export async function updatePlayerRole(
  sessionTicket: string,
  role: UserRole,
) {
  return updateCurrentPlayerData(sessionTicket, {
    [PLAYFAB_DATA_KEYS.ROLE]: role,
  });
}

/* ------------------------------------------------------------------ */
/*  Get Player Combined Info (used for session validation)            */
/* ------------------------------------------------------------------ */

export async function getPlayerCombinedInfo(sessionTicket: string) {
  return postToPlayFab<
    {
      InfoResultPayload?: {
        AccountInfo?: {
          Username?: string;
          PlayFabId?: string;
          TitleInfo?: { DisplayName?: string };
          PrivateInfo?: { Email?: string };
        };
        UserData?: Record<string, PlayFabUserDataValue>;
        PlayerStatistics?: Array<{ StatisticName: string; Value: number }>;
      };
    },
    { InfoRequestParameters: typeof INFO_REQUEST_PARAMETERS }
  >(
    'Client/GetPlayerCombinedInfo',
    { InfoRequestParameters: INFO_REQUEST_PARAMETERS },
    { 'X-Authorization': sessionTicket },
  );
}

/* ------------------------------------------------------------------ */
/*  Bulk provisioning (admin use)                                      */
/*  Creates account + writes role data so game recognizes the user    */
/* ------------------------------------------------------------------ */

export async function provisionPlayFabPlayer(input: PlayFabProvisionInput) {
  const registration = await registerWithPlayFab({
    username: input.username,
    email: input.email,
    password: input.defaultPassword,
    displayName: input.name,
  });

  if (registration.SessionTicket) {
    await updateCurrentPlayerData(registration.SessionTicket, {
      [PLAYFAB_DATA_KEYS.ROLE]: input.role,
      [PLAYFAB_DATA_KEYS.HAS_SECTION]: input.role === 'student' ? 'false' : 'true',
      [PLAYFAB_DATA_KEYS.ONBOARDING_PENDING]: 'true',
      [PLAYFAB_DATA_KEYS.DISPLAY_NAME]: input.name,
    });
  }

  return {
    playFabId: registration.PlayFabId,
    username: input.username,
    email: input.email,
    role: input.role,
    defaultPassword: input.defaultPassword,
  } as PlayFabProvisionResult;
}

/* ------------------------------------------------------------------ */
/*  Validate session (check if stored ticket is still valid)          */
/* ------------------------------------------------------------------ */

export async function validateSession(sessionTicket: string): Promise<boolean> {
  try {
    await getPlayerCombinedInfo(sessionTicket);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Refresh user data from PlayFab (re-read role, section, etc.)      */
/*  Useful after admin assigns a section or changes role              */
/* ------------------------------------------------------------------ */

export async function refreshUserFromPlayFab(sessionTicket: string): Promise<PlayFabLoginResult | null> {
  try {
    const info = await getPlayerCombinedInfo(sessionTicket);
    const payload = info.InfoResultPayload;
    if (!payload) return null;

    const userData = payload.UserData ?? {};
    const accountInfo = payload.AccountInfo;

    const identifier = accountInfo?.Username || accountInfo?.PrivateInfo?.Email || '';
    const role = resolveRole(userData[PLAYFAB_DATA_KEYS.ROLE]?.Value, identifier, false);
    const hasSection = parseTruthyString(userData[PLAYFAB_DATA_KEYS.HAS_SECTION]?.Value) || role !== 'student';
    const sectionCode = userData[PLAYFAB_DATA_KEYS.SECTION_CODE]?.Value;
    const onboardingPending = parseTruthyString(userData[PLAYFAB_DATA_KEYS.ONBOARDING_PENDING]?.Value);
    const displayName =
      accountInfo?.TitleInfo?.DisplayName ||
      userData[PLAYFAB_DATA_KEYS.DISPLAY_NAME]?.Value ||
      accountInfo?.Username ||
      '';

    const statistics: Record<string, number> = {};
    if (payload.PlayerStatistics) {
      for (const stat of payload.PlayerStatistics) {
        statistics[stat.StatisticName] = stat.Value;
      }
    }

    return {
      playFabId: accountInfo?.PlayFabId || '',
      sessionTicket,
      displayName,
      email: accountInfo?.PrivateInfo?.Email || '',
      role,
      hasSection,
      sectionCode,
      statistics,
      onboardingPending,
    };
  } catch {
    return null;
  }
}
