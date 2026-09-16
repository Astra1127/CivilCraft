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

const updateFields = {
  action: "save",
  title: "Civil Craft Prototype Version Released",
  category: "Announcements",
  excerpt: "A real release article",
  content: "Full release article.\n\nSecond paragraph.",
  coverUrl: "",
  coverAlt: "A bridge crossing the canyon",
  status: "draft",
  publishedAt: "2026-09-01T00:00:00.000Z",
};
async function saveHero(
  format: "png" | "jpeg" | "webp",
  fields: Record<string, unknown> = updateFields,
) {
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#aa6633" } })
    .toFormat(format)
    .toBuffer();
  const body = new FormData();
  body.set("article", JSON.stringify(fields));
  body.set(
    "file",
    new File([bytes], format === "jpeg" ? "hero.jpg" : `hero.${format}`, {
      type: `image/${format}`,
    }),
  );
  return admin("/updates", body);
}
for (const format of ["png", "jpeg", "webp"] as const) {
  test(`${format} update hero: draft preview, publish, replace, remove and delete preserve identity`, async () => {
    const created = await saveHero(format);
    assert.equal(created.status, 200);
    const draft = await created.json();
    assert.equal(blobs.size, 1);
    assert.equal((await (await publicRead())!.json()).updates.length, 0);
    assert.equal((await publicRead(`/update-images/${draft.id}`))!.status, 404);
    assert.equal((await admin(`/update-images/${draft.id}`)).status, 200);
    assert.equal(draft.coverAlt, updateFields.coverAlt);
    assert.ok(!JSON.stringify(draft).includes("storagePath"));
    const edited = await (
      await change("/updates", {
        ...draft,
        action: "save",
        title: "Edited draft",
        content: "Updated draft body",
      })
    ).json();
    assert.equal(edited.id, draft.id);
    assert.equal(edited.slug, draft.slug);
    assert.equal(blobs.size, 1);
    assert.equal((await (await publicRead())!.json()).updates.length, 0);
    await change("/updates", { ...edited, action: "save", status: "published" });
    const article = (await (await publicRead())!.json()).updates[0];
    assert.equal(article.id, draft.id);
    assert.match(article.coverUrl, /^\/api\/content\/update-images\//);
    const publicImage = (await publicRead(`/update-images/${draft.id}`))!;
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get("content-type"), `image/${format}`);
    const replaced = await (
      await saveHero(format, { ...article, action: "save", content: "Edited published body" })
    ).json();
    assert.notEqual(replaced.coverUrl.split("?v=")[1], article.coverUrl.split("?v=")[1]);
    assert.equal(blobs.size, 1);
    assert.equal(replaced.id, draft.id);
    assert.equal(replaced.slug, draft.slug);
    await change("/updates", { ...replaced, action: "save", coverUrl: "" });
    assert.equal(blobs.size, 0);
    assert.equal((await publicRead(`/update-images/${draft.id}`))!.status, 404);
    await saveHero(format, { ...replaced, action: "save" });
    assert.equal(blobs.size, 1);
    assert.equal((await change("/updates", { id: draft.id, action: "delete" })).status, 200);
    assert.equal(blobs.size, 0);
    assert.equal((await (await publicRead())!.json()).updates.length, 0);
  });
}
test("future publications and their hero images stay private, published lists sort newest first", async () => {
  const future = await (
    await saveHero("png", {
      ...updateFields,
      status: "published",
      publishedAt: "2099-01-01T00:00:00.000Z",
    })
  ).json();
  assert.equal((await (await publicRead())!.json()).updates.length, 0);
  assert.equal((await publicRead(`/update-images/${future.id}`))!.status, 404);
  assert.equal((await admin(`/update-images/${future.id}`)).status, 200);
  for (const publishedAt of [
    "2026-01-01T00:00:00.000Z",
    "2026-03-01T00:00:00.000Z",
    "2026-02-01T00:00:00.000Z",
  ])
    await change("/updates", { ...updateFields, status: "published", publishedAt });
  const articles = (await (await publicRead())!.json()).updates;
  assert.deepEqual(
    articles.map((a: { publishedAt: string }) => a.publishedAt.slice(5, 7)),
    ["03", "02", "01"],
  );
});
test("concurrent duplicate titles get distinct URL-safe slugs", async () => {
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => change("/updates", updateFields)),
  );
  const articles = await Promise.all(responses.map((r) => r.json()));
  assert.equal(new Set(articles.map((a) => a.slug)).size, 3);
  for (const article of articles)
    assert.match(article.slug, /^civil-craft-prototype-version-released-[a-f0-9-]+$/);
  assert.equal((await (await admin()).json()).updates.length, 3);
});
test("failed replacement preserves the saved article and draft image routes reject visitors", async () => {
  const article = await (await saveHero("png")).json();
  const body = new FormData();
  body.set("article", JSON.stringify({ ...article, action: "save" }));
  body.set("file", new File(["not an image"], "fake.png", { type: "image/png" }));
  assert.equal((await admin("/updates", body)).status, 400);
  assert.equal(blobs.size, 1);
  assert.equal((await (await admin()).json()).updates[0].coverUrl, article.coverUrl);
  assert.equal(
    (await admin(`/update-images/${article.id}`, undefined, undefined, false)).status,
    401,
  );
  assert.equal((await publicRead(`/update-images/${article.id}`))!.status, 404);
});
test("retired hero deletion failures are recorded and retried without exposing old images", async () => {
  const article = await (await saveHero("png")).json();
  const remove = imageStorage.remove;
  imageStorage.remove = async () => {
    throw new Error("storage offline");
  };
  const replaced = await (await saveHero("webp", { ...article, action: "save" })).json();
  assert.equal(blobs.size, 2);
  assert.ok(!JSON.stringify(replaced).includes("retiredHeroes"));
  imageStorage.remove = remove;
  await change("/updates", { ...replaced, action: "save" });
  assert.equal(blobs.size, 1);
});

test("slow hero cleanup cannot resurrect an article deleted by another administrator", async () => {
  const article = await (await saveHero("png")).json();
  const remove = imageStorage.remove;
  imageStorage.remove = async (path) => {
    delete metadata[`civilcraft.website.v1.updates.${article.id}`];
    await remove(path);
  };
  await saveHero("webp", { ...article, action: "save" });
  assert.equal((await (await admin()).json()).updates.length, 0);
});
