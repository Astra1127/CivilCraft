import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
test("legacy CMS neither hydrates nor persists contact details while preserving unrelated settings", () => {
  const fields = ["siteName", "supportEmail", "phone", "address", "officeHours", "social"];
  const seedState = {
    settings: {
      siteName: "",
      supportEmail: "",
      phone: "",
      address: "",
      officeHours: "",
      social: {},
      installSteps: [],
    },
    releases: [],
    news: [],
    gallery: [],
  };
  let storage = JSON.stringify({
    ...seedState,
    settings: {
      ...seedState.settings,
      siteName: "Browser-only name",
      supportEmail: "old@example.test",
      phone: "old phone",
      address: "old address",
      officeHours: "old hours",
      social: { discord: "https://old.example.test" },
      installSteps: ["Keep installation steps"],
    },
    releases: [{ id: "existing-release" }],
  });
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL("../src/lib/cms/store.ts", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: (name) => (name === "./seed" ? { seedState } : require(name)),
      window: {
        localStorage: {
          getItem: () => storage,
          setItem: (_key, value) => {
            storage = value;
          },
        },
      },
    },
  );
  assert.equal(exports.getCmsState().settings.supportEmail, "");
  assert.equal(exports.getCmsState().settings.siteName, "");
  exports.setCmsState((state) => ({
    ...state,
    settings: { ...state.settings, supportEmail: "must-not-persist@example.test" },
  }));
  const saved = JSON.parse(storage);
  for (const field of fields) assert.equal(Object.hasOwn(saved.settings, field), false);
  assert.deepEqual(saved.settings.installSteps, ["Keep installation steps"]);
  assert.deepEqual(saved.releases, [{ id: "existing-release" }]);
});
