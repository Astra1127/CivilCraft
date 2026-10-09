/** Shared file-picker limits; the server independently verifies the uploaded object. */
export const MAX_APK_BYTES = 512 * 1024 * 1024;
export const APK_CONTENT_TYPE = "application/vnd.android.package-archive";

export function validateApkSelection(file: { name: string; size: number }): string {
  const name = file.name.normalize("NFKC").trim();
  if (
    !name ||
    name.length > 255 ||
    name.includes("/") ||
    name.includes("\\") ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
    !/\.apk$/i.test(name)
  )
    throw new Error("Choose one Android .apk file, not a ZIP, AAB or installer link.");
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_APK_BYTES)
    throw new Error("Choose an APK between 1 byte and 512 MB.");
  const stem = name
    .slice(0, -4)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "");
  return `${(stem || "civilcraft").slice(0, 110)}.apk`;
}
