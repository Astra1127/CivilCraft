import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  getPublicPolicy,
  getStoredPolicies,
  handleAdminPoliciesRequest,
  handlePublicPoliciesRequest,
  publishPolicy,
  savePolicyDraft,
} from "../src/lib/cms/policies.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";

const originalFetch = globalThis.fetch;
const origin = "https://civilcraft.test";
const generatedHash = await hashAdminPassword("test-password-12345");
const accounts = [
  { email: "staff@example.test", displayName: "Staff Admin", passwordHash: generatedHash },
];

const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_USERS_JSON: JSON.stringify(accounts),
  ADMIN_SESSION_SECRET: "test-session-credential-at-least-32-bytes",
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-only-privileged-canary",
};
const prior = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));

let titleInternalData = new Map<string, string>();

beforeEach(() => {
  titleInternalData.clear();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  globalThis.fetch = async (url, init) => {
    const op = String(url).split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (op === "GetTitleInternalData") {
      const keys = (body["Keys"] as string[]) ?? [];
      const result: Record<string, string> = {};
      for (const key of keys) {
        if (titleInternalData.has(key)) {
          result[key] = titleInternalData.get(key)!;
        }
      }
      return Response.json({ code: 200, data: { Data: result } });
    }

    if (op === "SetTitleInternalData") {
      const key = String(body["Key"] ?? "");
      const val = String(body["Value"] ?? "");
      titleInternalData.set(key, val);
      return Response.json({ code: 200, data: {} });
    }

    if (op === "GetAllSegments") {
      return Response.json({ code: 200, data: { Segments: [] } });
    }

    return Response.json({ code: 200, data: {} });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(prior)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("getStoredPolicies initializes with audited defaults on first access", async () => {
  const policies = await getStoredPolicies();
  assert.ok(policies.privacy);
  assert.ok(policies.terms);
  assert.equal(policies.privacy.title, "Privacy Policy");
  assert.equal(policies.terms.title, "Terms of Service");
  assert.equal(policies.privacy.version, "2026-11-10");
  assert.ok(policies.privacy.sections.length >= 10);
});

test("getPublicPolicy returns sanitized policy without draft or internal metadata", async () => {
  // Set up a policy with draft and internal staff info
  await savePolicyDraft({
    policyId: "privacy",
    sections: [{ id: "draft-sec", title: "Draft Title", content: "Draft Content" }],
    adminUser: "superadmin@secret.internal",
    changeSummary: "Draft changes",
  });

  const publicPolicy = await getPublicPolicy("privacy");
  assert.equal(publicPolicy.id, "privacy");
  assert.equal(publicPolicy.title, "Privacy Policy");
  assert.equal(publicPolicy.version, "2026-11-10");
  assert.ok(!("draft" in publicPolicy));
  assert.ok(!("publishedBy" in publicPolicy));
  // Sections should still reflect published sections, not draft sections
  assert.notEqual(publicPolicy.sections[0]?.id, "draft-sec");
});

test("savePolicyDraft saves draft without modifying published version or publishing", async () => {
  const updated = await savePolicyDraft({
    policyId: "terms",
    sections: [{ id: "terms-mod", title: "Modified Terms", content: "New terms content." }],
    adminUser: "staff@example.test",
    changeSummary: "WIP modifications",
  });

  assert.ok(updated.draft);
  assert.equal(updated.draft.sections[0]?.id, "terms-mod");
  assert.equal(updated.draft.savedBy, "staff@example.test");
  assert.equal(updated.version, "2026-11-10"); // Published version unchanged!
});

test("publishPolicy requires change summary of at least 5 characters", async () => {
  await assert.rejects(
    async () =>
      publishPolicy({
        policyId: "privacy",
        sections: [{ id: "sec-1", title: "Title", content: "Content" }],
        changeSummary: "fix",
        adminUser: "staff@example.test",
      }),
    (err: unknown) => err instanceof AdminApiError && err.status === 400,
  );
});

test("publishPolicy creates new version, updates published sections, archives revision, and clears draft", async () => {
  const initial = await getStoredPolicies();
  const initialVersion = initial.privacy.version;

  const { policy, job } = await publishPolicy({
    policyId: "privacy",
    sections: [
      { id: "p-sec-1", title: "Updated Privacy Title", content: "Updated content for testing." },
    ],
    changeSummary: "Updated policy for capstone compliance review",
    adminUser: "Staff Admin (staff@example.test)",
  });

  assert.notEqual(policy.version, initialVersion);
  assert.ok(policy.version.includes("-v"));
  assert.equal(policy.sections[0]?.id, "p-sec-1");
  assert.equal(policy.changeSummary, "Updated policy for capstone compliance review");
  assert.equal(policy.draft, null); // Draft cleared!
  assert.ok(policy.revisions.length >= 1);
  assert.equal(policy.revisions[0]?.version, initialVersion);
  assert.ok(job);
  assert.equal(job.policyId, "privacy");
});

test("handlePublicPoliciesRequest handles GET /api/policies", async () => {
  const req = new Request("https://civilcraft.test/api/policies?id=privacy");
  const res = await handlePublicPoliciesRequest(req);
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { id: string; title: string };
  assert.equal(data.id, "privacy");
});

test("handlePlayFabAdminRequest guards /api/admin/policies requiring staff authentication", async () => {
  // 1. Unauthenticated request should be rejected with 401
  const unauthReq = new Request("https://civilcraft.test/api/admin/policies", {
    method: "GET",
  });
  const unauthRes = await handlePlayFabAdminRequest(unauthReq);
  assert.ok(unauthRes);
  assert.equal(unauthRes.status, 401);

  // 2. Unauthenticated POST should be rejected with 401
  const unauthPost = new Request("https://civilcraft.test/api/admin/policies/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyId: "privacy", sections: [] }),
  });
  const unauthPostRes = await handlePlayFabAdminRequest(unauthPost);
  assert.ok(unauthPostRes);
  assert.equal(unauthPostRes.status, 401);

  // 3. Authenticated staff request should succeed
  const config = getAdminAuthConfig()!;
  const sessionToken = await issueAdminSession(config, config.users[0]!);
  const authReq = new Request("https://civilcraft.test/api/admin/policies", {
    method: "GET",
    headers: {
      Cookie: `${cookieName(config)}=${sessionToken}`,
    },
  });
  const authRes = await handlePlayFabAdminRequest(authReq);
  assert.ok(authRes);
  assert.equal(authRes.status, 200);
  const body = (await authRes.json()) as { policies: unknown; jobs: unknown };
  assert.ok(body.policies);
  assert.ok(body.jobs);
});

test("saving a draft does not create notification jobs or alter public policy", async () => {
  const initialJobsCount = Array.from(titleInternalData.keys()).filter((k) =>
    k.startsWith("civilcraft.website.v1.policy-job."),
  ).length;

  await savePolicyDraft({
    policyId: "privacy",
    sections: [{ id: "draft-secret", title: "Unpublished Draft", content: "Confidential changes" }],
    adminUser: "staff@example.test",
    changeSummary: "Draft only - no notifications",
  });

  // Verify no new notification jobs were created
  const postDraftJobsCount = Array.from(titleInternalData.keys()).filter((k) =>
    k.startsWith("civilcraft.website.v1.policy-job."),
  ).length;
  assert.equal(postDraftJobsCount, initialJobsCount);

  // Verify public policy remains uninfluenced by the draft
  const publicPolicy = await getPublicPolicy("privacy");
  assert.ok(!publicPolicy.sections.some((s) => s.id === "draft-secret"));
});

