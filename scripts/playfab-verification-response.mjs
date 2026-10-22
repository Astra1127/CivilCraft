// Keep denial evidence narrow: a failed request is not necessarily a policy denial.
// Official names: https://learn.microsoft.com/en-us/xbox/playfab/api-references/global-api-method-error-codes
const playerDenials = new Map([
  ["NotAuthorized", 1089],
  ["NotAuthorizedByTitle", 1191],
  ["APINotEnabledForGameClientAccess", 1082],
  // Retain existing compatibility names used by older mocked/provider responses.
  ["APINotEnabledForGameClient", 1082],
  ["ApiNotEnabledForGameClient", 1082],
  ["APIRequestNotAllowed", null],
]);

const diagnosticNames = new Set([
  ...playerDenials.keys(),
  "EntityProfileVersionMismatch",
  "ConcurrentEditError",
  "ServiceUnavailable",
  "DownstreamServiceUnavailable",
  "APIClientRequestRateLimitExceeded",
  "APIConcurrentRequestLimitExceeded",
  "InvalidParams",
  "InvalidRequest",
  "NotAuthenticated",
  "EntityTokenInvalid",
  "EntityTokenExpired",
  "EntityTokenRevoked",
  "InvalidEntityType",
  "APIRequestsDisabledForTitle",
  "OverLimit",
  "EntityObjectSizeExceeded",
  "TotalDataSizeExceeded",
  "DataLengthExceeded",
]);

export function isPlayerWriteDenial(response) {
  const payload = response?.payload;
  if (
    response?.ok !== false ||
    ![400, 403].includes(response.status) ||
    payload?.code !== response.status ||
    !playerDenials.has(payload?.error)
  )
    return false;
  if (payload.errorCode !== undefined) {
    if (!Number.isSafeInteger(payload.errorCode) || payload.errorCode <= 0) return false;
    const expected = playerDenials.get(payload.error);
    if (expected !== null && payload.errorCode !== expected) return false;
  }
  return true;
}

/** Never expose arbitrary upstream text, tokens, headers, or entire response bodies. */
export function describeVerificationResponse(response) {
  const status =
    Number.isSafeInteger(response?.status) && response.status >= 100 && response.status <= 599
      ? response.status
      : "unknown";
  if (response?.ok === true) return `HTTP ${status}; request succeeded`;
  const payload = response?.payload;
  const name = diagnosticNames.has(payload?.error) ? payload.error : "unrecognized error";
  const code =
    Number.isSafeInteger(payload?.errorCode) && payload.errorCode >= 0 && payload.errorCode <= 99999
      ? ` (${payload.errorCode})`
      : "";
  return `HTTP ${status}; PlayFab ${name}${code}`;
}
