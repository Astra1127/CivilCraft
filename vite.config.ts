import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Populate only the development server process, never the browser defines.
  if (command === "serve") {
    const serverEnv = loadEnv(mode, process.cwd(), "");
    for (const key of [
      "VITE_PLAYFAB_TITLE_ID",
      "PLAYFAB_SECRET_KEY",
      "ADMIN_USERS_JSON",
      "ADMIN_AUTH_ORIGIN",
      "ADMIN_SESSION_SECRET",
      "PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID",
      "PLAYFAB_RELEASE_EMAIL_TEMPLATE_ID",
      "PLAYFAB_CONTACT_ADMIN_PLAYER_ID",
      "PLAYFAB_CONTACT_ADMIN_EMAIL_TEMPLATE_ID",
      "PLAYFAB_CONTACT_REPLY_EMAIL_TEMPLATE_ID",
      "VERCEL_OIDC_TOKEN",
      "BLOB_STORE_ID",
      "BLOB_READ_WRITE_TOKEN",
      "CRON_SECRET",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_PASS",
      "SMTP_SECURE",
      "SMTP_FROM",
      "EMAIL_FROM",
      "GMAIL_SMTP_HOST",
      "GMAIL_SMTP_PORT",
      "GMAIL_SMTP_SECURE",
      "GMAIL_SMTP_USER",
      "GMAIL_SMTP_APP_PASSWORD",
      "RESEND_API_KEY",
      "ADMIN_EMAIL",
      "RESEND_FROM",
      "PUBLIC_SITE_URL",
      "SITE_URL",
      "PUBLIC_APP_URL",
      "PAYMONGO_SECRET_KEY",
      "PAYMONGO_PUBLIC_KEY",
      "PAYMONGO_WEBHOOK_SECRET",
      "PLAYFAB_COINS_CURRENCY_CODE",
      "COIN_RECEIPTS_STORAGE",
      "COIN_CHECKOUT_ENABLED",
      "CURRENCY_DATABASE_URL",
      "CURRENCY_DATABASE_ID",
      "CURRENCY_DATABASE_VERIFIED",
      "CURRENCY_DATABASE_VERIFIED_TITLE_ID",
      "CURRENCY_DATABASE_VERIFIED_CONFIG_SHA256",
      "PLAYFAB_COINS_RECEIPTS_VERIFIED",
      "PLAYFAB_COINS_VERIFIED_TITLE_ID",
      "PLAYFAB_COINS_VERIFIED_CONFIG_SHA256",
      "PLAYFAB_DIAMONDS_ENABLED",
      "PLAYFAB_DIAMONDS_STORAGE",
      "PLAYFAB_DIAMONDS_ITEM_ID",
      "PLAYFAB_DIAMONDS_RECEIPT_ITEM_ID",
      "PLAYFAB_DIAMONDS_VERIFIED_TITLE_ID",
      "PLAYFAB_DIAMONDS_VERIFIED_CONFIG_SHA256",
      "PLAYFAB_DIAMONDS_BOOTSTRAP_VERIFIED",
      "PLAYFAB_DIAMONDS_PLAYER_WRITES_DENIED",
      "PLAYFAB_DIAMONDS_CAPACITY_VERIFIED",
    ]) {
      if (!process.env[key]?.trim() && serverEnv[key] !== undefined)
        process.env[key] = serverEnv[key];
    }
  }
  return {
    // Keep public configuration available in both client and SSR builds.
    define: Object.fromEntries(
      Object.entries(loadEnv(mode, process.cwd(), "VITE_")).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(command === "build" ? [nitro()] : []),
      react(),
    ],
    css: { transformer: "lightningcss" },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
