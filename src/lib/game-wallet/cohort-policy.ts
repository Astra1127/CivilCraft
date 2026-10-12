/** Pure policy. Inputs must come from verified server records, never a browser/save. */
export type CoinAuthority = "legacy" | "shared";

export function verifiedTimestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    throw new Error("Invalid account cohort timestamp");
  const stamp = Date.parse(value);
  if (
    !Number.isSafeInteger(stamp) ||
    new Date(stamp).toISOString().slice(0, 19) !== value.slice(0, 19)
  )
    throw new Error("Invalid account cohort timestamp");
  return stamp;
}

export function classifyCoinAuthority(input: {
  walletReady: boolean;
  titleCreatedAt: unknown;
  cutoffAt: unknown;
  now: number;
}): CoinAuthority {
  // A migrated account can never be downgraded by cutoff/date changes.
  if (input.walletReady === true) return "shared";
  if (input.walletReady !== false || !Number.isSafeInteger(input.now))
    throw new Error("Unverified wallet state");
  const cutoff = verifiedTimestamp(input.cutoffAt);
  const created = verifiedTimestamp(input.titleCreatedAt);
  if (created > input.now || cutoff > input.now) throw new Error("Account cohort is not active");
  return created >= cutoff ? "shared" : "legacy";
}
