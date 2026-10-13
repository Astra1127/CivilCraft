/** Android's supported package version-code range, independent of display labels. */
export const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

/** Blank/legacy metadata means unknown, never an inferred value from the build label. */
export function parseAndroidVersionCode(value: string | number | null | undefined): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const code = typeof value === "string" ? Number(value.trim()) : value;
  if (
    (typeof value === "string" && !/^\d+$/.test(value.trim())) ||
    !Number.isInteger(code) ||
    code < 1 ||
    code > MAX_ANDROID_VERSION_CODE
  )
    throw new Error(
      "Android version code must be a whole number from 1 to 2,100,000,000, or blank.",
    );
  return code;
}
