import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlayerLevel } from "../src/lib/playfab/player-level.ts";

test("shared CurrentLevel parser preserves actual zero and valid levels, rejects unavailable/malformed data", () => {
  for (const [input, expected] of [
    ["12", 12],
    [" 3 ", 3],
    [0, 0],
    ["0", 0],
  ] as const)
    assert.equal(parsePlayerLevel(input), expected);
  for (const value of [
    undefined,
    null,
    "",
    " ",
    {},
    [],
    true,
    -1,
    "-1",
    1.5,
    Infinity,
    "NaN",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(parsePlayerLevel(value), null);
});
