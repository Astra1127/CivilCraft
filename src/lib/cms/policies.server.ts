import { z } from "zod";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import { smallBody } from "../playfab/request-body.server.ts";
import { getDefaultPolicies } from "./policy-defaults.ts";
import {
  type PolicyRecord,
  type PolicySection,
  type PublicPolicy,
  policySectionSchema,
} from "./policy-types.ts";
import {
  createPolicyNotificationJob,
  getLatestPolicyNotificationJob,
  retryPolicyNotificationJob,
  type PolicyNotificationJob,
} from "../email/policy-notifications.server.ts";

const policiesKey = "civilcraft.website.v1.policies";

/**
 * Loads stored policies from PlayFab Title Internal Data.
 * Initializes with the audited default policies if no record exists yet.
 */
export async function getStoredPolicies(): Promise<{ privacy: PolicyRecord; terms: PolicyRecord }> {
  const rawData = object(
    (await playFabAdmin("Admin/GetTitleInternalData", { Keys: [policiesKey] }))["Data"],
  );
  const stored = rawData[policiesKey];

  if (!stored) {
    const defaults = getDefaultPolicies();
    try {
      await playFabAdmin("Admin/SetTitleInternalData", {
        Key: policiesKey,
        Value: JSON.stringify(defaults),
      });
    } catch {
      // non-fatal if concurrent write occurs
    }
    return defaults;
  }

  try {
    const parsed = JSON.parse(String(stored)) as { privacy: PolicyRecord; terms: PolicyRecord };
    if (parsed.privacy && parsed.terms) {
      return parsed;
    }
  } catch {
    // corrupted payload fallback
  }

  return getDefaultPolicies();
}

/**
 * Returns a public, sanitized version of the requested policy.
 * Draft content and administrative credentials are never returned.
 */
export async function getPublicPolicy(id: "privacy" | "terms"): Promise<PublicPolicy> {
  const policies = await getStoredPolicies();
  const policy = policies[id];

  return {
    id: policy.id,
    title: policy.title,
    version: policy.version,
    lastUpdated: policy.lastUpdated,
    publishedAt: policy.publishedAt,
    changeSummary: policy.changeSummary,
    sections: policy.sections,
  };
}

/**
 * Saves a policy draft in backend persistence without publishing it.
 * Does not notify players and does not update public pages.
 */
export async function savePolicyDraft(input: {
  policyId: "privacy" | "terms";
  sections: PolicySection[];
  adminUser: string;
  changeSummary?: string | undefined;
}): Promise<PolicyRecord> {
  const policies = await getStoredPolicies();
  const policy = policies[input.policyId];

  policy.draft = {
    sections: input.sections,
    changeSummary: input.changeSummary?.trim() || "",
    savedAt: new Date().toISOString(),
    savedBy: input.adminUser,
  };

  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: policiesKey,
    Value: JSON.stringify(policies),
  });

  return policy;
}

/**
 * Publishes an updated policy and triggers the player notification job.
 * Requires a change summary explaining the revision.
 */
export async function publishPolicy(input: {
  policyId: "privacy" | "terms";
  sections: PolicySection[];
  changeSummary: string;
  adminUser: string;
}): Promise<{ policy: PolicyRecord; job: PolicyNotificationJob }> {
  const summary = input.changeSummary.trim();
  if (summary.length < 5) {
    throw new AdminApiError(400, "Please provide a brief change summary of at least 5 characters.");
  }

  const policies = await getStoredPolicies();
  const policy = policies[input.policyId];
  const now = new Date();
  const nowISO = now.toISOString();
  const formattedDate = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Calculate new version string
  const dateTag = nowISO.slice(0, 10);
  const revisionCount = (policy.revisions?.length ?? 0) + 1;
  const newVersion = `${dateTag}-v${revisionCount}`;

  // Record old revision in history
  if (!policy.revisions) policy.revisions = [];
  policy.revisions.unshift({
    version: policy.version,
    publishedAt: policy.publishedAt,
    publishedBy: policy.publishedBy,
    changeSummary: policy.changeSummary,
  });

  // Update published policy
  policy.sections = input.sections;
  policy.version = newVersion;
  policy.lastUpdated = formattedDate;
  policy.publishedAt = nowISO;
  policy.publishedBy = input.adminUser;
  policy.changeSummary = summary;
  policy.draft = null; // Clear draft on successful publish

  // Persist published policy to Title Internal Data first
  await playFabAdmin("Admin/SetTitleInternalData", {
    Key: policiesKey,
    Value: JSON.stringify(policies),
  });

  // Create and dispatch notification job
  const job = await createPolicyNotificationJob({
    policyId: input.policyId,
    policyTitle: policy.title,
    policyVersion: newVersion,
    changeSummary: summary,
    publishedAt: nowISO,
    publishedBy: input.adminUser,
  });

  return { policy, job };
}

/**
 * Public policy endpoint handler for GET /api/policies.
 */
export async function handlePublicPoliciesRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path !== "/api/policies" && !path.startsWith("/api/policies/")) {
    return null;
  }

  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const idParam = (url.searchParams.get("id") || path.split("/").pop() || "").toLowerCase();
  const id = idParam === "terms" || idParam === "terms-of-service" ? "terms" : "privacy";

  try {
    const policy = await getPublicPolicy(id);
    return Response.json(policy, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof AdminApiError ? error.status : 503;
    const message = error instanceof AdminApiError ? error.message : "Policy unavailable.";
    return Response.json({ error: message }, { status });
  }
}

const draftInputSchema = z.object({
  policyId: z.enum(["privacy", "terms"]),
  sections: z.array(policySectionSchema),
  changeSummary: z.string().optional(),
});

const publishInputSchema = z.object({
  policyId: z.enum(["privacy", "terms"]),
  sections: z.array(policySectionSchema),
  changeSummary: z.string().min(5, "Change summary must be at least 5 characters"),
});

const retryInputSchema = z.object({
  policyId: z.enum(["privacy", "terms"]),
  version: z.string(),
});

/**
 * Privileged Admin policy endpoint handler for /api/admin/policies/*.
 * Called only after staff authorization and CSRF validation in admin-api.server.ts.
 */
export async function handleAdminPoliciesRequest(
  request: Request,
  adminUser: { email: string; displayName?: string },
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith("/api/admin/policies")) {
    return null;
  }

  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store, private",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });

  const adminIdentifier = adminUser.displayName
    ? `${adminUser.displayName} (${adminUser.email})`
    : adminUser.email;

  try {
    // GET /api/admin/policies
    if (path === "/api/admin/policies" && request.method === "GET") {
      const policies = await getStoredPolicies();
      const [privacyJob, termsJob] = await Promise.all([
        getLatestPolicyNotificationJob("privacy"),
        getLatestPolicyNotificationJob("terms"),
      ]);

      return json({
        policies,
        jobs: {
          privacy: privacyJob,
          terms: termsJob,
        },
      });
    }

    // POST /api/admin/policies/draft
    if (path === "/api/admin/policies/draft" && request.method === "POST") {
      const body = await smallBody(request);
      const parsed = draftInputSchema.parse(body);
      const updated = await savePolicyDraft({
        policyId: parsed.policyId,
        sections: parsed.sections,
        adminUser: adminIdentifier,
        ...(parsed.changeSummary ? { changeSummary: parsed.changeSummary } : {}),
      });
      return json({ success: true, policy: updated });
    }

    // POST /api/admin/policies/publish
    if (path === "/api/admin/policies/publish" && request.method === "POST") {
      const body = await smallBody(request);
      const parsed = publishInputSchema.parse(body);
      const result = await publishPolicy({
        policyId: parsed.policyId,
        sections: parsed.sections,
        changeSummary: parsed.changeSummary,
        adminUser: adminIdentifier,
      });
      return json({ success: true, policy: result.policy, job: result.job });
    }

    // POST /api/admin/policies/notifications/retry
    if (path === "/api/admin/policies/notifications/retry" && request.method === "POST") {
      const body = await smallBody(request);
      const parsed = retryInputSchema.parse(body);
      const job = await retryPolicyNotificationJob(parsed.policyId, parsed.version);
      return json({ success: true, job });
    }

    return json({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: error.issues[0]?.message || "Invalid input data." }, 400);
    }
    if (error instanceof AdminApiError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "Policy operation failed." }, 500);
  }
}
