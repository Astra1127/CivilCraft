import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCoinAuthority, verifiedTimestamp } from "../src/lib/game-wallet/cohort-policy.ts";
const cutoffAt = "2026-10-12T00:00:00.000Z";
const now = Date.parse(cutoffAt) + 60_000;
test("cutoff is inclusive and old unmigrated players remain legacy", () => {
  for (const [created, expected] of [
    [-1, "legacy"],
    [0, "shared"],
    [1, "shared"],
  ] as const)
    assert.equal(
      classifyCoinAuthority({
        walletReady: false,
        cutoffAt,
        now,
        titleCreatedAt: new Date(Date.parse(cutoffAt) + created).toISOString(),
      }),
      expected,
    );
});
test("already migrated players never downgrade", () => {
  assert.equal(
    classifyCoinAuthority({ walletReady: true, cutoffAt: null, titleCreatedAt: null, now }),
    "shared",
  );
});
test("missing, malformed and future evidence never falls back to legacy", () => {
  for (const titleCreatedAt of [
    null,
    undefined,
    "",
    0,
    "2026-02-30T00:00:00Z",
    "2026-10-12",
    "2026-10-12T00:02:00Z",
  ])
    assert.throws(() =>
      classifyCoinAuthority({ walletReady: false, cutoffAt, now, titleCreatedAt }),
    );
  assert.throws(() =>
    classifyCoinAuthority({
      walletReady: false,
      cutoffAt: "2027-01-01T00:00:00Z",
      now,
      titleCreatedAt: cutoffAt,
    }),
  );
  assert.equal(verifiedTimestamp("2026-10-12T00:00:00Z"), Date.parse(cutoffAt));
});
