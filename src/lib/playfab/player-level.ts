/** Actual CurrentLevel only; never inferred from score, rank or contract progress. */
export function parsePlayerLevel(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const level = Number(value);
  return Number.isSafeInteger(level) && level >= 0 ? level : null;
}
