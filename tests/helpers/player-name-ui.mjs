import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as playerNames from "../../src/lib/player-name.ts";

const require = createRequire(import.meta.url);
const exports = {};
const source = ts.transpileModule(
  readFileSync(new URL("../../src/components/common/PlayerName.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
runInNewContext(source, {
  exports,
  require: (name) => (name === "@/lib/player-name" ? playerNames : require(name)),
});

export const PlayerName = exports.PlayerName;
export const playerNameDependencies = {
  "@/lib/player-name": playerNames,
  "@/components/common/PlayerName": exports,
};
