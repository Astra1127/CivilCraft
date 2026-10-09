import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getAdminAuthConfig } from "../admin-auth/config.server.ts";
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { MAX_APK_BYTES, validateApkSelection } from "./apk.ts";

export const apkPathSchema = z
  .string()
  .regex(/^civilcraft\/releases\/[a-zA-Z0-9-]{1,64}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,114}\.apk$/);
const ticketSchema = z
  .object({
    releaseId: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    staffId: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z.string().min(5).max(114),
    fileSizeBytes: z.number().int().positive().max(MAX_APK_BYTES),
    storagePath: apkPathSchema,
    previousStoragePath: apkPathSchema.nullable(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type ApkUploadTicket = z.infer<typeof ticketSchema>;

function key(staffId: string) {
  const config = getAdminAuthConfig();
  const account = config?.users.find((user) => user.id === staffId);
  if (!config || !account) throw new AdminApiError(401, "Administrator sign-in is required.");
  return createHmac("sha256", config.sessionSecret)
    .update("civilcraft-apk-upload:v1:")
    .update(account.id)
    .update(account.passwordHash)
    .digest();
}
export function createApkUploadTicket(input: {
  releaseId: string;
  fileName: string;
  fileSizeBytes: number;
  previousStoragePath: string | null;
  staffId: string;
}) {
  let fileName: string;
  try {
    fileName = validateApkSelection({ name: input.fileName, size: input.fileSizeBytes });
  } catch {
    throw new AdminApiError(400, "Choose one .apk file between 1 byte and 512 MB.");
  }
  const claim = ticketSchema.parse({
    ...input,
    fileName,
    storagePath: `civilcraft/releases/${input.releaseId}/${randomUUID()}/${fileName}`,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signature = createHmac("sha256", key(input.staffId)).update(payload).digest("hex");
  return { ticket: `${payload}.${signature}`, claim };
}
export function readApkUploadTicket(value: unknown, staffId: string): ApkUploadTicket {
  const fail = () =>
    new AdminApiError(400, "Upload authorization expired or is invalid. Select the APK again.");
  if (typeof value !== "string" || value.length > 4096) throw fail();
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9_-]+$/.test(parts[0]!) ||
    !/^[a-f0-9]{64}$/.test(parts[1]!)
  )
    throw fail();
  const expected = createHmac("sha256", key(staffId)).update(parts[0]!).digest();
  if (!timingSafeEqual(expected, Buffer.from(parts[1]!, "hex"))) throw fail();
  try {
    const claim = ticketSchema.parse(
      JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")),
    );
    if (
      claim.staffId !== staffId ||
      claim.expiresAt <= Date.now() ||
      claim.expiresAt > Date.now() + 30 * 60 * 1000 + 5000 ||
      !claim.storagePath.startsWith(`civilcraft/releases/${claim.releaseId}/`) ||
      !claim.storagePath.endsWith(`/${claim.fileName}`)
    )
      throw fail();
    return claim;
  } catch {
    throw fail();
  }
}
