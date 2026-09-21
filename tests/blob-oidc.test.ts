import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { imageStorage } from "../src/lib/cms/images.server.ts";
import { integrationServices } from "../src/lib/playfab/integration-status.server.ts";

const names = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "BLOB_WEBHOOK_PUBLIC_KEY",
  "VERCEL_OIDC_TOKEN",
];
const previous = names.map((key) => process.env[key]);

const dispatcher = getGlobalDispatcher();
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
let requests: { method: string; headers: Headers; url: string }[] = [];
let rejectAccess = false;
agent
  .get("https://vercel.com")
  .intercept({ path: /\/api\/blob.*/, method: /GET|PUT|POST/ })
  .reply((options) => {
    const headers = new Headers(options.headers as Record<string, string>);
    const method = options.method || "GET";
    requests.push({ method, headers, url: "https://vercel.com" + options.path });
    if (rejectAccess)
      return {
        statusCode: 403,
        data: JSON.stringify({ error: { code: "forbidden", message: "private-token-canary" } }),
      };
    return {
      statusCode: 200,
      data: JSON.stringify(
        method === "PUT"
          ? {
              pathname: "civilcraft/gallery/test.png",
              url: "https://oidctest.private.blob.vercel-storage.com/civilcraft/gallery/test.png",
            }
          : { blobs: [], hasMore: false },
      ),
    };
  })
  .persist();
beforeEach(() => {
  delete process.env["BLOB_READ_WRITE_TOKEN"];
  process.env["BLOB_STORE_ID"] = "store_oidctest";
  process.env["VERCEL_OIDC_TOKEN"] = token;
  requests = [];
  rejectAccess = false;
});
after(async () => {
  setGlobalDispatcher(dispatcher);
  await agent.close();
  names.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  });
});

test("real Blob SDK uploads and deletes with OIDC and no legacy token", async () => {
  assert.equal(
    await imageStorage.write("civilcraft/gallery/test.png", new Uint8Array([1]), "image/png"),
    "civilcraft/gallery/test.png",
  );
  await imageStorage.remove("civilcraft/gallery/test.png");
  assert.deepEqual(
    requests.map((r) => r.method),
    ["PUT", "POST"],
  );
  for (const request of requests) {
    assert.equal(request.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(request.headers.get("x-vercel-blob-store-id"), "oidctest");
  }
  assert.equal(requests[0]!.headers.get("x-vercel-blob-access"), "private");
  assert.ok(requests[1]!.url.endsWith("/delete"));
});

test("private image read uses runtime OIDC on the private hostname", async () => {
  agent
    .get("https://oidctest.private.blob.vercel-storage.com")
    .intercept({
      path: "/civilcraft/gallery/test.png?cache=0",
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    })
    .reply(200, "private-image", { headers: { "content-type": "image/png" } });
  const result = await imageStorage.read("civilcraft/gallery/test.png");
  assert.equal(result?.statusCode, 200);
  assert.equal(await new Response(result!.stream).text(), "private-image");
});

test("status verifies access without mutation or exposing credentials", async () => {
  const services = await integrationServices();
  assert.equal(services.imageStorage, "Configured");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.method, "GET");
  assert.equal(new URL(requests[0]!.url).searchParams.get("limit"), "1");
  assert.equal(new URL(requests[0]!.url).searchParams.get("prefix"), "civilcraft/gallery/");
  assert.ok(!JSON.stringify(services).includes(token));
  rejectAccess = true;
  assert.equal((await integrationServices()).imageStorage, "Unavailable");
});

test("store metadata and webhook key cannot mask rejected OIDC credentials", async () => {
  // An explicitly unusable token cannot be replaced by metadata or a webhook key.
  process.env["BLOB_WEBHOOK_PUBLIC_KEY"] = "public-key-only";
  rejectAccess = true;
  assert.equal(await imageStorage.configuration(), "Unavailable");
});
