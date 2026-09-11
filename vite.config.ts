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
    ]) {
      if (process.env[key] === undefined && serverEnv[key] !== undefined)
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
