import assert from "node:assert/strict";
import { after, beforeEach, test, type TestContext } from "node:test";
import { get, presignUrl, type IssuedSignedToken } from "@vercel/blob";
import { uploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { apkStorage } from "../src/lib/cms/apk-storage.server.ts";
import { APK_CONTENT_TYPE } from "../src/lib/cms/apk.ts";
import type { ApkUploadTicket } from "../src/lib/cms/apk-ticket.server.ts";
import { AdminApiError } from "../src/lib/playfab/admin-client.server.ts";

const path = "civilcraft/releases/r1/00000000-0000-4000-8000-000000000001/civilcraft.apk";
const privateOrigin = "https://apktest.private.blob.vercel-storage.com";
const signingToken = "apk-test-client-signing-token";
const callbackUrl = "https://unexpected-callback.example.test/complete";
const oidcToken = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.apk-test-signature`;
const envNames = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "BLOB_WEBHOOK_PUBLIC_KEY",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_BLOB_API_URL",
  "NEXT_PUBLIC_VERCEL_BLOB_API_URL",
  "VERCEL_BLOB_CALLBACK_URL",
  "VERCEL_BLOB_RETRIES",
];
const previousEnv = envNames.map((name) => process.env[name]);
const originalDispatcher = getGlobalDispatcher();
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

type Scope = {
  storeId: string;
  pathname: string;
  operations: string[];
  validUntil: number;
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
};
type RecordedRequest = {
  method: string;
  url: URL;
  headers: Headers;
  body?: Omit<Scope, "storeId">;
};
let requests: RecordedRequest[] = [];
let issuedTokens: IssuedSignedToken[] = [];

agent
  .get("https://vercel.com")
  .intercept({ path: "/api/blob/signed-token", method: "POST" })
  .reply((options) => {
    const body = JSON.parse(String(options.body)) as Omit<Scope, "storeId">;
    requests.push({
      method: options.method,
      url: new URL(options.path, "https://vercel.com"),
      headers: new Headers(options.headers as Record<string, string>),
      body,
    });
    // Only the provider response is mocked: scope parsing and signing use the installed SDK.
    const issued = {
      delegationToken: `${Buffer.from(JSON.stringify({ storeId: "store_apktest", ...body })).toString("base64url")}.test-signature`,
      clientSigningToken: signingToken,
      validUntil: body.validUntil,
    };
    issuedTokens.push(issued);
    return { statusCode: 200, data: JSON.stringify(issued) };
  })
  .persist();

beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  process.env["BLOB_STORE_ID"] = "store_apktest";
  process.env["BLOB_WEBHOOK_PUBLIC_KEY"] = "apk-test-webhook-public-key";
  process.env["VERCEL_OIDC_TOKEN"] = oidcToken;
  process.env["VERCEL_BLOB_CALLBACK_URL"] = callbackUrl;
  process.env["VERCEL_BLOB_RETRIES"] = "0";
  requests = [];
  issuedTokens = [];
});

after(async () => {
  setGlobalDispatcher(originalDispatcher);
  await agent.close();
  envNames.forEach((name, index) => {
    const value = previousEnv[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

function decodeScope(value: string): Scope {
  return JSON.parse(Buffer.from(value.split(".")[0]!, "base64url").toString("utf8"));
}

function ticket(): ApkUploadTicket {
  return {
    releaseId: "r1",
    staffId: "a".repeat(64),
    fileName: "civilcraft.apk",
    fileSizeBytes: 4,
    storagePath: path,
    previousStoragePath: null,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
}

function uploadBody(pathname = path): HandleUploadPresignedBody {
  return {
    type: "blob.generate-presigned-url",
    payload: { pathname, clientPayload: "apk-test-upload-ticket", multipart: false },
  };
}

function assertOidcRequest(request: RecordedRequest) {
  assert.equal(request.headers.get("authorization"), `Bearer ${oidcToken}`);
  assert.equal(request.headers.get("x-vercel-blob-store-id"), "apktest");
  assert.equal(process.env["BLOB_READ_WRITE_TOKEN"], undefined);
}

function assertNoServerSecrets(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const secret of [oidcToken, signingToken, "vercel_blob_rw_", "clientSigningToken"])
    assert.ok(
      !serialized.includes(secret),
      "The browser response must not expose server credentials",
    );
}

function rangeResponse(statusCode: number, bytes: Buffer, contentRange?: string) {
  agent
    .get(privateOrigin)
    .intercept({ path: `/${path}?cache=0`, method: "GET" })
    .reply((options) => {
      requests.push({
        method: options.method,
        url: new URL(options.path, privateOrigin),
        headers: new Headers(options.headers as Record<string, string>),
      });
      return {
        statusCode,
        data: bytes,
        responseOptions: {
          headers: {
            "content-type": APK_CONTENT_TYPE,
            "content-length": String(bytes.length),
            ...(contentRange === undefined ? {} : { "content-range": contentRange }),
          },
        },
      };
    });
}

function observeRangeReads(context: TestContext) {
  const metrics = { reads: 0, cancels: 0 };
  const getReader = ReadableStream.prototype.getReader;
  context.mock.method(ReadableStream.prototype, "getReader", function (this: ReadableStream) {
    const reader = Reflect.apply(getReader, this, []) as ReadableStreamDefaultReader<Uint8Array>;
    const read = reader.read.bind(reader);
    const cancel = reader.cancel.bind(reader);
    context.mock.method(reader, "read", () => {
      metrics.reads++;
      return read();
    });
    context.mock.method(reader, "cancel", () => {
      metrics.cancels++;
      return cancel();
    });
    return reader;
  });
  return metrics;
}

test("private APK download uses OIDC to issue an exact-path GET-only URL for five minutes", async () => {
  const started = Date.now();
  const url = new URL(await apkStorage.downloadUrl(path));
  const finished = Date.now();
  assert.equal(requests.length, 1);
  const issuedRequest = requests[0]!;
  assert.equal(issuedRequest.method, "POST");
  assert.equal(issuedRequest.url.pathname, "/api/blob/signed-token");
  assertOidcRequest(issuedRequest);
  assert.deepEqual(issuedRequest.body?.operations, ["get"]);
  assert.equal(issuedRequest.body?.pathname, path);
  assert.ok(issuedRequest.body!.validUntil >= started + 5 * 60 * 1000);
  assert.ok(issuedRequest.body!.validUntil <= finished + 5 * 60 * 1000);
  assert.equal(url.origin, privateOrigin);
  assert.equal(decodeURIComponent(url.pathname), `/${path}`);
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.searchParams.get("download"), "1");
  assert.match(url.searchParams.get("vercel-blob-signature")!, /^[a-zA-Z0-9_-]+$/);
  assert.deepEqual(decodeScope(url.searchParams.get("vercel-blob-delegation")!), {
    storeId: "store_apktest",
    pathname: path,
    operations: ["get"],
    validUntil: issuedRequest.body!.validUntil,
  });
  assertNoServerSecrets(url.href);
  for (const options of [
    { operation: "head", pathname: path, access: "private" },
    { operation: "put", pathname: path, access: "private" },
    { operation: "delete", pathname: path, access: "private" },
  ] as const)
    await assert.rejects(presignUrl(issuedTokens[0]!, options), /not valid/);
  await assert.rejects(
    presignUrl(issuedTokens[0]!, {
      operation: "get",
      pathname: `${path}.other`,
      access: "private",
    }),
    /does not match the signed token scope/,
  );
});

test("real SDK upload returns only a narrow PUT payload with APK size and MIME constraints", async () => {
  const claim = ticket();
  const result = await apkStorage.upload(
    new Request("https://apk-storage.test/api/admin/blob-upload", { method: "POST" }),
    uploadBody(),
    claim,
  );
  assert.equal(result.type, "blob.generate-presigned-url");
  assert.ok("presignedUrlPayload" in result);
  assert.equal(requests.length, 1);
  assertOidcRequest(requests[0]!);
  const expectedScope = {
    pathname: path,
    operations: ["put"],
    validUntil: claim.expiresAt,
    maximumSizeInBytes: claim.fileSizeBytes,
    allowedContentTypes: [APK_CONTENT_TYPE],
  };
  assert.deepEqual(requests[0]!.body, expectedScope);
  assert.deepEqual(decodeScope(result.presignedUrlPayload.delegationToken), {
    storeId: "store_apktest",
    ...expectedScope,
  });
  assert.deepEqual(result.presignedUrlPayload.params, {
    "vercel-blob-allowed-content-types": APK_CONTENT_TYPE,
    "vercel-blob-maximum-size-in-bytes": String(claim.fileSizeBytes),
    "vercel-blob-add-random-suffix": "false",
    "vercel-blob-allow-overwrite": "false",
  });
  assert.match(result.presignedUrlPayload.signature, /^[a-zA-Z0-9_-]+$/);
  assertNoServerSecrets(result);
  assert.ok(!JSON.stringify(result).includes(callbackUrl));
  assert.ok(!JSON.stringify(result).includes("apk-test-upload-ticket"));
  for (const options of [
    { operation: "get", pathname: path, access: "private" },
    { operation: "head", pathname: path, access: "private" },
    { operation: "delete", pathname: path, access: "private" },
  ] as const)
    await assert.rejects(presignUrl(issuedTokens[0]!, options), /not valid/);
  await assert.rejects(
    presignUrl(issuedTokens[0]!, {
      operation: "put",
      pathname: `${path}.other`,
      access: "private",
    }),
    /does not match the signed token scope/,
  );

  // Exercise the installed browser SDK with the returned payload and no bearer credential.
  agent
    .get("https://apk-storage.test")
    .intercept({ path: "/api/admin/blob-upload", method: "POST" })
    .reply(200, JSON.stringify(result));
  agent
    .get("https://vercel.com")
    .intercept({ path: /^\/api\/blob\/\?pathname=/, method: "PUT" })
    .reply((options) => {
      requests.push({
        method: options.method,
        url: new URL(options.path, "https://vercel.com"),
        headers: new Headers(options.headers as Record<string, string>),
      });
      return {
        statusCode: 200,
        data: JSON.stringify({
          pathname: path,
          url: `${privateOrigin}/${path}`,
          downloadUrl: `${privateOrigin}/${path}?download=1`,
          contentType: APK_CONTENT_TYPE,
          contentDisposition: "attachment",
          etag: "apk-test-etag",
        }),
      };
    });
  const uploaded = await uploadPresigned(path, Buffer.from([1, 2, 3, 4]), {
    access: "private",
    contentType: APK_CONTENT_TYPE,
    handleUploadUrl: "https://apk-storage.test/api/admin/blob-upload",
    multipart: false,
  });
  assert.equal(uploaded.pathname, path);
  assert.equal(requests.length, 2);
  const putRequest = requests[1]!;
  assert.equal(putRequest.method, "PUT");
  assert.equal(putRequest.headers.get("authorization"), null);
  assert.equal(putRequest.headers.get("x-vercel-blob-store-id"), "apktest");
  assert.equal(putRequest.headers.get("x-vercel-blob-access"), "private");
  assert.equal(putRequest.headers.get("x-content-type"), APK_CONTENT_TYPE);
  assert.equal(putRequest.url.searchParams.get("pathname"), path);
  assert.equal(
    putRequest.url.searchParams.get("vercel-blob-delegation"),
    result.presignedUrlPayload.delegationToken,
  );
  for (const [name, value] of Object.entries(result.presignedUrlPayload.params))
    assert.equal(putRequest.url.searchParams.get(name), value);
  assert.equal(putRequest.url.searchParams.get("vercel-blob-callback-url"), null);
  assert.equal(putRequest.url.searchParams.get("vercel-blob-callback-token-payload"), null);
  assertNoServerSecrets(putRequest.url.href);
});

test("upload rejects another path before issuing a Blob delegation", async () => {
  await assert.rejects(
    apkStorage.upload(
      new Request("https://apk-storage.test/upload"),
      uploadBody(`${path}.other`),
      ticket(),
    ),
    (error: unknown) => error instanceof AdminApiError && error.status === 400,
  );
  assert.equal(requests.length, 0);
});

test("upload requires the connected store webhook key before issuing a delegation", async () => {
  delete process.env["BLOB_WEBHOOK_PUBLIC_KEY"];
  await assert.rejects(
    apkStorage.upload(new Request("https://apk-storage.test/upload"), uploadBody(), ticket()),
    (error: unknown) => error instanceof AdminApiError && error.status === 503,
  );
  assert.equal(requests.length, 0);
});

test("real SDK preserves Content-Range while normalizing a genuine 206 response to 200", async () => {
  rangeResponse(206, Buffer.from([7, 8, 9, 10]), "bytes 7-10/128");
  const result = await get(path, {
    access: "private",
    useCache: false,
    headers: { Range: "bytes=7-10" },
  });
  assert.ok(result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers.get("content-range"), "bytes 7-10/128");
  assert.ok(result.stream);
  await result.stream.cancel();
  assert.equal(requests[0]!.headers.get("range"), "bytes=7-10");
  assert.equal(requests[0]!.headers.get("authorization"), `Bearer ${oidcToken}`);
  assert.equal(requests[0]!.url.origin, privateOrigin);
});

test("APK verification reads exactly the requested inclusive 206 boundaries", async (context) => {
  rangeResponse(206, Buffer.from([7, 8, 9, 10]), "bytes 7-10/128");
  const metrics = observeRangeReads(context);
  assert.deepEqual(await apkStorage.readRange(path, 7, 10), Buffer.from([7, 8, 9, 10]));
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.headers.get("range"), "bytes=7-10");
  assert.equal(requests[0]!.headers.get("authorization"), `Bearer ${oidcToken}`);
  assert.equal(requests[0]!.url.origin, privateOrigin);
  assert.equal(requests[0]!.url.searchParams.get("cache"), "0");
  assert.equal(metrics.cancels, 1);
});

test("APK verification rejects a range ignored by storage before reading its full body", async (context) => {
  rangeResponse(200, Buffer.alloc(4096));
  const metrics = observeRangeReads(context);
  await assert.rejects(apkStorage.readRange(path, 7, 10), /does not support bounded verification/);
  assert.equal(metrics.reads, 0);
  assert.equal(metrics.cancels, 1);
});

test("APK verification rejects incorrect Content-Range boundaries before reading", async (context) => {
  rangeResponse(206, Buffer.from([6, 7, 8, 9]), "bytes 6-9/128");
  const metrics = observeRangeReads(context);
  await assert.rejects(apkStorage.readRange(path, 7, 10), /does not support bounded verification/);
  assert.equal(metrics.reads, 0);
  assert.equal(metrics.cancels, 1);
});

test("APK verification stops and cancels an oversized range response on its first chunk", async (context) => {
  rangeResponse(206, Buffer.alloc(4096), "bytes 7-10/128");
  const metrics = observeRangeReads(context);
  await assert.rejects(apkStorage.readRange(path, 7, 10), /could not be inspected safely/);
  assert.equal(metrics.reads, 1);
  assert.equal(metrics.cancels, 1);
});

test("APK verification rejects and cancels an incomplete bounded response", async (context) => {
  rangeResponse(206, Buffer.from([7, 8, 9]), "bytes 7-10/128");
  const metrics = observeRangeReads(context);
  await assert.rejects(apkStorage.readRange(path, 7, 10), /read was incomplete/);
  assert.equal(metrics.reads, 2);
  assert.equal(metrics.cancels, 1);
});
