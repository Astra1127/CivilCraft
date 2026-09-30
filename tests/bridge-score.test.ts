import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bridgeStatistic,
  decodeBridgeScore,
} from "../src/lib/playfab/leaderboard-config.server.ts";
import { mapLeaderboard } from "../src/lib/playfab/leaderboard.server.ts";

test("Revision 4 codec decodes known runs and inclusive bounds in both modes", () => {
  assert.deepEqual(decodeBridgeScore(2135125720, "efficient"), { cost: 12345, peakStress: 58.2 });
  assert.deepEqual(decodeBridgeScore(1565470720, "strongest"), { cost: 12345, peakStress: 58.2 });
  for (const mode of ["efficient", "strongest"] as const) {
    assert.deepEqual(decodeBridgeScore(2147483647, mode), { cost: 0, peakStress: 0 });
    assert.deepEqual(decodeBridgeScore(1146482647, mode), { cost: 1000000, peakStress: 100 });
    for (const score of [0, -1, 2147483648, 1146482646, 1.5, NaN, Infinity])
      assert.throws(() => decodeBridgeScore(score, mode));
  }
});

test("contract and mode validation rejects arbitrary names and prototype properties", () => {
  for (const contract of ["TotalScore", "__proto__", "constructor", "123", "ShopKeeper "])
    assert.throws(() => bridgeStatistic(contract, "efficient"));
  for (const mode of ["CC_E_24A0506A7A79A0DB", "Efficient", "weekly", "__proto__"])
    assert.throws(() => bridgeStatistic("ShopKeeper", mode));
});

test("backend positions and ordering are preserved, even for identical scores", () => {
  const rows = mapLeaderboard(
    [
      { PlayFabId: "B", Position: 9, StatValue: 2135125720 },
      { PlayFabId: "A", Position: 10, StatValue: 2135125720 },
    ],
    "efficient",
  );
  assert.deepEqual(
    rows.map((r) => [r.playFabId, r.rank, r.cost, r.peakStress]),
    [
      ["B", 10, 12345, 58.2],
      ["A", 11, 12345, 58.2],
    ],
  );
});
