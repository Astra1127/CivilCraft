import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { Release } from "./types";
import { APK_CONTENT_TYPE, validateApkSelection } from "./apk";
import { uploadPresigned } from "@vercel/blob/client";

export type PublishedRelease = Pick<
  Release,
  "id" | "title" | "version" | "build" | "releaseDate" | "notes"
>;
export type ReleaseNotificationResult = {
  status: "queued" | "not-configured" | "unchanged";
  message: string;
};
export type ReleaseMutationResult = { success: boolean; notification?: ReleaseNotificationResult };
export type ReleaseEmailReadiness = { configured: boolean; provider: string; message: string };
export function useReleasePosts() {
  return useQuery({
    queryKey: ["releases", "public"],
    queryFn: () =>
      contentFetch<{
        initialized: boolean;
        current: Release | null;
        latest: PublishedRelease | null;
      }>("/api/releases"),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
export function useAdminReleases() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["releases", "admin"],
    queryFn: () =>
      contentFetch<{
        initialized: boolean;
        releases: Release[];
        emailNotifications?: ReleaseEmailReadiness;
      }>("/api/admin/releases"),
    staleTime: 0,
  });
  const mutate = async (body: unknown) => {
    const result = await contentFetch<ReleaseMutationResult>("/api/admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await client.invalidateQueries({ queryKey: ["releases"] });
    return result;
  };
  const uploadApk = async (
    releaseId: string,
    file: File,
    onProgress?: (percentage: number) => void,
  ) => {
    validateApkSelection(file);
    const prepared = await contentFetch<{ ticket: string; pathname: string }>(
      "/api/admin/releases/apk/prepare",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, fileName: file.name, fileSizeBytes: file.size }),
      },
    );
    onProgress?.(0);
    const result = await uploadPresigned(prepared.pathname, file, {
      access: "private",
      contentType: APK_CONTENT_TYPE,
      multipart: true,
      handleUploadUrl: "/api/admin/releases/apk/upload",
      clientPayload: prepared.ticket,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage),
    });
    if (result.pathname !== prepared.pathname)
      throw new Error("Upload did not match the selected build.");
    onProgress?.(100);
    await contentFetch("/api/admin/releases/apk/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: prepared.ticket }),
    });
    await client.invalidateQueries({ queryKey: ["releases"] });
  };
  return { ...query, mutate, uploadApk };
}
