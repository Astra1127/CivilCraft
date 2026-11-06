import { randomUUID } from "node:crypto";
import { AdminApiError, object } from "../playfab/admin-client.server.ts";
import { githubApi, githubConfig, githubJson } from "./github-releases-api.server.ts";

const controlTag = "civilcraft-admin-control-v1";
const uploadId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const unavailable =
  "Release editing is busy or held for review. Retry shortly; if it remains held, ask a site administrator to review the GitHub release lock. The active APK has not been replaced by this request.";

async function run<T>(name: string, task: () => Promise<T>): Promise<T> {
  const config = githubConfig();
  let assetId: number;
  try {
    const control = object(
      await githubApi(`/repos/${config.repository}/releases/${config.controlReleaseId}`),
    );
    if (
      control["id"] !== config.controlReleaseId ||
      control["draft"] !== true ||
      control["tag_name"] !== controlTag
    )
      throw new Error("Unexpected release control identity");
    const body = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        owner: randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    );
    // Asset names are unique within a release. GitHub rejects a conflicting
    // create; do not retry or take over a stale/uncertain owner's asset.
    const target = new URL(
      `https://uploads.github.com/repos/${config.repository}/releases/${config.controlReleaseId}/assets`,
    );
    target.searchParams.set("name", name);
    const response = await fetch(target, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "CivilCraft-APK-Admin",
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      },
      body,
    });
    const created = object(await githubJson(response));
    if (
      response.status !== 201 ||
      !Number.isSafeInteger(created["id"]) ||
      Number(created["id"]) <= 0 ||
      created["name"] !== name ||
      created["state"] !== "uploaded" ||
      created["size"] !== body.length
    )
      throw new Error("Uncertain lock creation");
    assetId = Number(created["id"]);
  } catch {
    throw new AdminApiError(503, unavailable);
  }
  try {
    return await task();
  } finally {
    // An immutable asset ID identifies this owner even if another request later
    // acquires the same filename. Never delete by name, or retry an uncertain delete.
    await githubApi(`/repos/${config.repository}/releases/assets/${assetId}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }
}

export const githubReleaseWriteLock = {
  run<T>(task: () => Promise<T>): Promise<T> {
    return run("cc-release-write-lock-v1.json", task);
  },
  runNamed<T>(id: string, task: () => Promise<T>): Promise<T> {
    if (!uploadId.test(id)) throw new AdminApiError(400, "Choose a valid APK upload operation.");
    return run(`cc-upload-${id}-lock.json`, task);
  },
};
