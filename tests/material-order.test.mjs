import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "../src/lib/almanac/game-catalog.json" with { type: "json" };
import { orderMaterials } from "../src/lib/almanac/material-order.ts";

test("canonical card order puts timber first and preserves the existing remaining catalog sequence", () => {
  const input = [...catalog.materials].reverse();
  const result = orderMaterials(input);
  assert.deepEqual(
    result.map((m) => m.id),
    [
      "wood_beam",
      "wood_support",
      "wood_road",
      "concrete_road",
      "concrete_member",
      "rope",
      "Concrete Pier",
    ],
  );
  assert.deepEqual(
    result.slice(0, 3).map((m) => m.name),
    ["Wood Beam", "Wood Pier", "Wood Road"],
  );
  for (const item of result)
    assert.equal(
      item,
      catalog.materials.find((m) => m.id === item.id),
    );
  assert.deepEqual(
    input,
    [...catalog.materials].reverse(),
    "Ordering does not mutate the shared catalog",
  );
  const discovered = ["rope", "wood_road", "wood_beam"];
  assert.deepEqual(
    result.filter((m) => discovered.includes(m.id)).map((m) => m.id),
    ["wood_beam", "wood_road", "rope"],
  );
});
