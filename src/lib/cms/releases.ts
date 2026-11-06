import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentFetch } from "./content";
import type { Release } from "./types";
import { APK_CONTENT_TYPE, validateApkSelection } from "./apk";
import { uploadPresigned } from "@vercel/blob/client";
import { useEffect, useRef } from "react";
import { useAuth } from "../auth";
import { createGithubApkUploader, type GithubUploadReadiness } from "./github-apk-upload";

export type PublishedRelease = Pick<
  Release,
  "id" | "title" | "version" | "build" | "releaseDate" | "notes"
>;
export type ReleaseNotificationResult = {
  status: "queued" | "not-configured" | "unchanged";
  message: string;
};
export type ReleaseMutationResult = {
  success: boolean;
  notification?: ReleaseNotificationResult;
  cleanup?: { status: string; message: string; deletedFiles?: number };
};
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
  const { admin } = useAuth();
  const scope = useRef<string | null>(admin?.id ?? null);
  scope.current = admin?.id ?? null;
  const github = useRef<ReturnType<typeof createGithubApkUploader> | null>(null);
  if (!github.current) github.current = createGithubApkUploader(() => scope.current);
  useEffect(() => () => github.current?.dispose(), [admin?.id]);
  const query = useQuery({
    queryKey: ["releases", "admin"],
    queryFn: () =>
      contentFetch<{
        initialized: boolean;
        releases: Release[];
        emailNotifications?: ReleaseEmailReadiness;
        githubUploads?: GithubUploadReadiness;
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
    if (query.data?.githubUploads) {
      if (!query.data.githubUploads.configured)
        throw new Error(
          query.data.githubUploads.message ??
            "GitHub APK uploads need server setup before uploading.",
        );
      const finalized = await github.current!.upload<ReleaseMutationResult>(
        releaseId,
        file,
        onProgress,
      );
      await client.invalidateQueries({ queryKey: ["releases"] });
      return finalized;
    }
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
    const finalized = await contentFetch<ReleaseMutationResult>(
      "/api/admin/releases/apk/finalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: prepared.ticket }),
      },
    );
    await client.invalidateQueries({ queryKey: ["releases"] });
    return finalized;
  };
  return { ...query, mutate, uploadApk };
}
