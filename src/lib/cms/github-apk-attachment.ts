import { z } from "zod";

export const githubApkAttachmentSchema = z
  .object({
    tag: z.union([
      z.string().regex(/^cc-apk-[a-zA-Z0-9-]{1,64}-[0-9a-f-]{36}$/),
      z.literal("android-2026-10-29"),
    ]),
    githubReleaseId: z.number().int().positive(),
    assetId: z.number().int().positive(),
    fileName: z.string().regex(/^[a-zA-Z0-9._-]{1,110}\.apk$/i),
    fileSizeBytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    uploadedAt: z.string().datetime(),
    published: z.boolean(),
    url: z.string().max(1000),
  })
  .refine(
    (value) =>
      value.url ===
      `https://github.com/Astra1127/CivilCraft/releases/download/${value.tag}/${value.fileName}`,
    "Unexpected GitHub APK location.",
  )
  .refine(
    (value) =>
      value.tag !== "android-2026-10-29" ||
      (value.githubReleaseId === 436053811 &&
        value.assetId === 715709073 &&
        value.fileName === "CivilCraft_10-29-26.apk" &&
        value.fileSizeBytes === 128537911 &&
        value.sha256 === "86e57ece9dfcbed4763108f0d66f035c9060e31eb080e147cc186bfc9608025c" &&
        value.published),
    "The original APK delivery does not match the reviewed asset.",
  );

export type GithubApkAttachment = z.infer<typeof githubApkAttachmentSchema>;

export function githubAttachmentMatchesRelease(value: GithubApkAttachment, releaseId: string) {
  return value.tag === "android-2026-10-29"
    ? releaseId === "1db44dc0-eea1-43a1-8aeb-a4109fbf13e3"
    : value.tag.startsWith(`cc-apk-${releaseId}-`);
}
