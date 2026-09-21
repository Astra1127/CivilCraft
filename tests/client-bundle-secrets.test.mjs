import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadEnv } from "vite";

const assets = new URL("../.output/public/assets/", import.meta.url);
test(
  "production client bundles contain no configured credentials or Blob authentication code",
  {
    skip: !existsSync(assets) && "Run npm run build before the bundle secret scan",
  },
  () => {
    const env = loadEnv("development", process.cwd(), "");
    const secrets = Object.entries(env)
      .filter(
        ([key, value]) =>
          value &&
          !key.startsWith("VITE_") &&
          /SECRET|PASSWORD|TOKEN|SMTP|ADMIN_USERS_JSON/.test(key),
      )
      .map(([, value]) => value);
    try {
      for (const user of JSON.parse(env.ADMIN_USERS_JSON || "[]"))
        if (user.passwordHash) secrets.push(user.passwordHash);
    } catch {
      /* other configuration tests validate account syntax */
    }
    const files = readdirSync(assets).filter((name) => name.endsWith(".js"));
    assert.ok(files.length > 0, "Expected production JavaScript bundles");
    for (const name of files) {
      const source = readFileSync(new URL(name, assets), "utf8");
      assert.ok(
        !secrets.some((value) => value.length > 8 && source.includes(value)),
        "Server credential found in a client bundle",
      );
      assert.ok(
        !/x-vercel-blob-store-id|getVercelOidcToken|resolveBlobAuth|nodemailer/.test(source),
        "Server-only authentication implementation found in client bundle",
      );
    }
  },
);
