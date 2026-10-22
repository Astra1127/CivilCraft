import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

// Reads game assets only. --export prints JSON; neither mode edits either repository.
const rootArg = process.argv.indexOf("--unity-root");
if (rootArg < 0 || !process.argv[rootArg + 1]) {
  throw new Error("Usage: node scripts/verify-game-catalog.mjs --unity-root <project> [--export]");
}
const root = path.resolve(process.argv[rootArg + 1]);
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );
const assets = walk(path.join(root, "Assets/BridgeBuilder/Data"))
  .filter((file) => file.endsWith(".asset"))
  .map((file) => ({
    file,
    raw: readFileSync(file, "utf8"),
    guid: existsSync(file + ".meta")
      ? readFileSync(file + ".meta", "utf8").match(/^guid: (\w+)/m)?.[1]
      : null,
  }));
const field = (asset, key) =>
  asset.raw.match(new RegExp("^  " + key + ": *(.*)$", "m"))?.[1]?.trim() || "";
const materials = assets
  .filter((asset) => /^  unlockCost:/m.test(asset.raw))
  .map((asset) => ({
    id: field(asset, "materialId") || field(asset, "m_Name"),
    name: field(asset, "m_Name"),
    price: Number(field(asset, "unlockCost")),
    guid: asset.guid,
  }));
const items = assets
  .filter((asset) => field(asset, "itemId"))
  .flatMap((asset) => {
    const guid = field(asset, "cosmeticDefinition").match(/guid: (\w+)/)?.[1];
    const cosmetic = assets.find((candidate) => candidate.guid === guid);
    if (!cosmetic) return []; // Deliberately exclude the unlinked placeholder.
    assert.equal(field(asset, "canPurchaseMultipleTimes"), "0");
    return [
      {
        itemId: field(asset, "itemId"),
        cosmeticId: field(cosmetic, "permanentID"),
        price: Number(field(asset, "price")),
        name: field(asset, "itemName"),
      },
    ];
  });
// Explicit playable reward allowlist. Do not include dormant/placeholder contracts
// merely because the player's achievement database references every asset.
const ids = new Set([
  "ShopKeeper",
  "TUT_CONTRACT1",
  "TUT_CONTRACT2",
  "ReedsContract",
  "ReedSideInspection",
  "VancesContract",
  "VanceSideRealignment",
  "SilasMainContract",
  "MainContractSilas",
]);
const contracts = assets
  .filter((asset) => ids.has(field(asset, "contractID")))
  .map((asset) => {
    assert.notEqual(field(asset, "hideFromLeaderboard"), "1");
    const id = field(asset, "contractID");
    const name = field(asset, "m_Name");
    return {
      id,
      aliases: name === id ? [] : [name],
      budget: Number(field(asset, "budget")),
      baseGold: Number(field(asset, "goldReward")),
      isTutorial: field(asset, "isTutorialContract") === "1",
      allowedMaterialIds: [...asset.raw.matchAll(/material: \{fileID: \d+, guid: (\w+)/g)].map(
        (match) => {
          const material = materials.find((candidate) => candidate.guid === match[1]);
          assert.ok(material, "Contract material is missing from the canonical export");
          return material.id;
        },
      ),
    };
  });
assert.equal(contracts.length, ids.size);
const achievements = assets
  .filter((asset) => field(asset, "achievementID"))
  .map((asset) => ({
    id: field(asset, "achievementID"),
    bonusGold: Number(field(asset, "bonusGold")),
  }));
const catalog = {
  version: 1,
  goldPenaltyPerFail: 50,
  items,
  contracts,
  materials: materials.map(({ guid, ...material }) => material),
  achievements,
};
const normalize = (value) => ({
  ...value,
  items: [...value.items].sort((a, b) => a.itemId.localeCompare(b.itemId)),
  contracts: [...value.contracts].sort((a, b) => a.id.localeCompare(b.id)),
  materials: [...value.materials].sort((a, b) => a.id.localeCompare(b.id)),
  achievements: [...value.achievements].sort((a, b) => a.id.localeCompare(b.id)),
});
if (process.argv.includes("--export")) console.log(JSON.stringify(normalize(catalog), null, 2));
else {
  const stored = JSON.parse(
    readFileSync(new URL("../src/lib/game-wallet/catalog.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    normalize(stored),
    normalize(catalog),
    "Website/game catalog drift: review and export before rollout",
  );
  console.log(
    `PASS: ${items.length} cosmetics, ${contracts.length} contracts, ${materials.length} materials, ${achievements.length} achievements match the game assets.`,
  );
}
