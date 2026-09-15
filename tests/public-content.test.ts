import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { contentRequest } from "../src/lib/cms/content.server.ts";
import { imageStorage, validateImage } from "../src/lib/cms/images.server.ts";
import { handlePlayFabAdminRequest } from "../src/lib/playfab/admin-api.server.ts";
import { getAdminAuthConfig } from "../src/lib/admin-auth/config.server.ts";
import { cookieName, issueAdminSession } from "../src/lib/admin-auth/session.server.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.server.ts";
import { maxImageBytes, isRealText } from "../src/lib/cms/content-types.ts";

const origin = "https://content.test";
const env = {
  ADMIN_AUTH_ORIGIN: origin,
  ADMIN_SESSION_SECRET: "content-test-session-secret-at-least-32-bytes",
  ADMIN_USERS_JSON: JSON.stringify([
    {
      email: "editor@example.test",
      displayName: "Editor",
      passwordHash: await hashAdminPassword(randomBytes(32).toString("hex")),
    },
  ]),
  VITE_PLAYFAB_TITLE_ID: "17FA03",
  PLAYFAB_SECRET_KEY: "test-only-content-canary",
};
const oldEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
const oldFetch = globalThis.fetch,
  oldStorage = { ...imageStorage };
let metadata: Record<string, string> = {},
  blobs = new Map<string, Uint8Array>(),
  writes = 0;
beforeEach(() => {
  Object.assign(process.env, env);
  metadata = {};
  blobs = new Map();
  writes = 0;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /^https:\/\/17FA03\.playfabapi\.com\/Admin\//);
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith("SetTitleInternalData")) {
      writes++;
      if (body.Value === null) delete metadata[body.Key];
      else metadata[body.Key] = body.Value;
    }
    return Response.json({ code: 200, data: { Data: { ...metadata } } });
  };
  imageStorage.write = async (path, bytes) => {
    blobs.set(path, bytes);
    return path;
  };
  imageStorage.remove = async (path) => {
    blobs.delete(path);
  };
  imageStorage.read = async (path) =>
    blobs.has(path)
      ? {
          statusCode: 200,
          stream: new Response(Buffer.from(blobs.get(path)!)).body!,
          headers: new Headers(),
          blob: {
            url: path,
            downloadUrl: path,
            pathname: path,
            contentType: "image/png",
            contentDisposition: "inline",
            cacheControl: "no-store",
            etag: "test",
            size: blobs.get(path)!.length,
            uploadedAt: new Date(),
          },
        }
      : null;
});
after(() => {
  globalThis.fetch = oldFetch;
  Object.assign(imageStorage, oldStorage);
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
async function cookie() {
  const config = getAdminAuthConfig()!;
  return cookieName(config) + "=" + (await issueAdminSession(config, config.users[0]!));
}
async function admin(
  path = "",
  body?: BodyInit,
  type?: string,
  auth = true,
  requestOrigin = origin,
) {
  const headers: Record<string, string> = { origin: requestOrigin };
  if (auth) headers["cookie"] = await cookie();
  if (type) headers["content-type"] = type;
  return (await handlePlayFabAdminRequest(
    new Request(origin + "/api/admin/content" + path, {
      method: body ? "POST" : "GET",
      headers,
      body: body ?? null,
    }),
  ))!;
}
const change = (path: string, body: unknown) =>
  admin(path, JSON.stringify(body), "application/json");
const publicRead = (path = "") => contentRequest(new Request(origin + "/api/content" + path));
async function upload(format: "png" | "jpeg" | "webp", visible = true) {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ccaa44" } })
    .toFormat(format)
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([bytes], "photo." + format, { type: "image/" + format }));
  form.set("caption", "Actual test upload");
  form.set("category", "Bridges");
  form.set("visible", String(visible));
  return admin("/upload", form);
}
for (const format of ["png", "jpeg", "webp"] as const) {
  test(`${format}: decoded upload persists independently of browser and only public metadata is returned`, async () => {
    const response = await upload(format);
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(blobs.size, 1);
    assert.equal(writes, 1);
    const browserA = await (await publicRead())!.json();
    const browserB = await (await publicRead())!.json();
    assert.deepEqual(browserA, browserB);
    assert.equal(browserA.gallery[0].id, item.id);
    assert.ok(!JSON.stringify(browserA).includes("storagePath"));
    assert.ok(!JSON.stringify(browserA).includes(env.PLAYFAB_SECRET_KEY));
    const image = await publicRead("/images/" + item.id);
    assert.equal(image!.status, 200);
    assert.equal(image!.headers.get("content-type"), "image/" + format);
    assert.ok((await image!.arrayBuffer()).byteLength > 0);
    assert.equal(image!.headers.get("cache-control"), "no-store, private");
  });
}
test("hidden uploads and subsequently hidden/deleted images cannot be read publicly", async () => {
  const item = await (await upload("png", false)).json();
  assert.equal((await (await publicRead())!.json()).gallery.length, 0);
  assert.equal((await publicRead("/images/" + item.id))!.status, 404);
  assert.equal((await admin("/images/" + item.id)).status, 200);
  assert.equal(
    (await change("/gallery", { id: item.id, action: "visibility", visible: true })).status,
    200,
  );
  assert.equal((await publicRead("/images/" + item.id))!.status, 200);
  await change("/gallery", { id: item.id, action: "visibility", visible: false });
  assert.equal((await publicRead("/images/" + item.id))!.status, 404);
  await change("/gallery", { id: item.id, action: "delete" });
  assert.equal(blobs.size, 0);
  assert.equal((await admin("/images/" + item.id)).status, 404);
});
test("all content administration endpoints reject guests and cross-origin writes", async () => {
  for (const path of ["", "/upload", "/gallery", "/updates", "/images/123"]) {
    assert.equal((await admin(path, undefined, undefined, false)).status, 401);
    assert.equal((await admin(path, "{}", "application/json", false)).status, 401);
    assert.equal(
      (await admin(path, "{}", "application/json", true, "https://attacker.test")).status,
      403,
    );
  }
  assert.equal(writes, 0);
  assert.equal(blobs.size, 0);
});
test("public content is read-only and empty storage produces no seed records", async () => {
  assert.deepEqual(await (await publicRead())!.json(), { gallery: [], updates: [] });
  assert.equal(
    (await contentRequest(
      new Request(origin + "/api/content/upload", { method: "POST", body: "{}" }),
    ))!.status,
    404,
  );
  assert.equal(writes, 0);
});
test("server rejects mismatched MIME, corrupt files, SVG and oversized uploads", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  await assert.rejects(validateImage(png, "image/jpeg"));
  await assert.rejects(validateImage(Buffer.from("<svg/>"), "image/png"));
  await assert.rejects(validateImage(Buffer.from("<svg/>"), "image/svg+xml"));
  await assert.rejects(validateImage(new Uint8Array(maxImageBytes + 1), "image/png"));
  const body = new FormData();
  body.set(
    "file",
    new File([new Uint8Array(maxImageBytes + 20_000)], "huge.png", { type: "image/png" }),
  );
  assert.equal((await admin("/upload", body)).status, 413);
  assert.equal(writes, 0);
  assert.equal(blobs.size, 0);
});
test("updates publish from shared storage; drafts stay private and slugs remain stable", async () => {
  const fields = {
    action: "save",
    title: "Prototype notes",
    category: "Development",
    excerpt: "Real notes",
    content: "Full article\n\nSecond paragraph",
    coverUrl: "",
    coverAlt: "",
    status: "draft",
    publishedAt: "2026-09-01T00:00:00.000Z",
  };
  const draft = await (await change("/updates", fields)).json();
  assert.equal((await (await publicRead())!.json()).updates.length, 0);
  const published = await (
    await change("/updates", {
      ...fields,
      id: draft.id,
      status: "published",
      title: "Renamed notes",
    })
  ).json();
  assert.equal(published.slug, draft.slug);
  const publicArticle = (await (await publicRead())!.json()).updates[0];
  assert.equal(publicArticle.content, fields.content);
  assert.equal(publicArticle.slug, draft.slug);
  await change("/updates", { action: "delete", id: draft.id });
  assert.equal((await (await publicRead())!.json()).updates.length, 0);
});
test("placeholder values are excluded without inventing replacements", () => {
  for (const value of [
    "",
    "[Team Member Name]",
    "[Project Role]",
    "[School / Institution]",
    "Not set",
    "Map placeholder",
  ])
    assert.equal(isRealText(value), false);
  assert.equal(isRealText("Civil Craft"), true);
});
