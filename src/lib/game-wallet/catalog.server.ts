import { createHash } from "node:crypto";
import source from "./catalog.json" with { type: "json" };
import { AdminApiError } from "../playfab/admin-client.server.ts";
import { MAX_GAME_COINS } from "./types.ts";

export const gameCatalog = source;
export const catalogFingerprint = createHash("sha256").update(JSON.stringify(source)).digest("hex");
export const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function boundedInteger(value: unknown, maximum = MAX_GAME_COINS): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new AdminApiError(400, "Amount is invalid.");
  return value;
}
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 160 ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new AdminApiError(400, "Catalog identifier is invalid.");
  return value.trim();
}
export function contract(value: unknown) {
  const id = identifier(value);
  const match = source.contracts.find((entry) => entry.id === id || entry.aliases.includes(id));
  if (!match) throw new AdminApiError(400, "Contract is not in the active game catalog.");
  return match;
}
export function achievement(value: unknown) {
  const id = identifier(value);
  const match = source.achievements.find((entry) => entry.id === id);
  if (!match) throw new AdminApiError(400, "Achievement is not in the game catalog.");
  return match;
}
export function cosmetic(value: unknown) {
  const id = identifier(value);
  const match = source.items.find((entry) => entry.itemId === id);
  if (!match) throw new AdminApiError(400, "Item is not in the game catalog.");
  return match;
}
export function material(value: unknown, contractId: unknown) {
  const id = identifier(value);
  const owner = contract(contractId);
  const match = source.materials.find((entry) => entry.id === id);
  if (!match || (owner.allowedMaterialIds.length > 0 && !owner.allowedMaterialIds.includes(id)))
    throw new AdminApiError(400, "Material is not allowed for this contract.");
  return { ...match, contractId: owner.id, saveKey: `${owner.id}_${match.id}` };
}
export function purchaseTarget(kind: unknown, id: unknown, contractId?: unknown) {
  if (kind === "cosmetic") {
    const item = cosmetic(id);
    return {
      kind: "cosmetic" as const,
      targetKey: item.itemId,
      price: boundedInteger(item.price),
      payload: { itemId: item.itemId, cosmeticId: item.cosmeticId },
    };
  }
  if (kind === "material") {
    const item = material(id, contractId);
    return {
      kind: "material" as const,
      targetKey: item.saveKey,
      price: boundedInteger(item.price),
      payload: { contractId: item.contractId, materialId: item.id, saveKey: item.saveKey },
    };
  }
  throw new AdminApiError(400, "Purchase type is invalid.");
}
/** Mathf.RoundToInt uses nearest even at an exact midpoint. */
export function bankersRound(value: number): number {
  const base = Math.floor(value);
  const fraction = value - base;
  return fraction === 0.5 ? (base % 2 === 0 ? base : base + 1) : Math.round(value);
}
export function rewardEvent(input: Record<string, unknown>) {
  const kind = input["kind"];
  const entry =
    kind === "contract"
      ? contract(input["sourceId"])
      : kind === "achievement"
        ? achievement(input["sourceId"])
        : null;
  if (!entry) throw new AdminApiError(400, "Reward type is invalid.");
  const key = `${kind}:${entry.id}`;
  if (input["eventId"] !== key)
    throw new AdminApiError(400, "Reward event ID must match its canonical source.");
  let amount: number;
  let evidence: Record<string, unknown> = {};
  if (kind === "achievement")
    amount = boundedInteger((entry as ReturnType<typeof achievement>).bonusGold);
  else {
    const c = entry as ReturnType<typeof contract>;
    const raw = input["evidence"];
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new AdminApiError(400, "Contract reward evidence is required.");
    evidence = raw as Record<string, unknown>;
    const cost = evidence["finalCost"];
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > MAX_GAME_COINS)
      throw new AdminApiError(400, "Contract cost is invalid.");
    const failures = boundedInteger(evidence["failureCount"], 1_000_000);
    if (evidence["tutorial"] !== undefined && typeof evidence["tutorial"] !== "boolean")
      throw new AdminApiError(400, "Tutorial evidence is invalid.");
    // Contract asset tutorial flags describe gameplay/achievement categorization.
    // Only an actual tutorial objective suppresses its reward.
    const tutorial = evidence["tutorial"] === true;
    // Match Unity float arithmetic before nearest-even rounding.
    const delta = Math.fround(Math.fround(c.budget) - Math.fround(cost));
    const bonus =
      delta >= 0
        ? bankersRound(Math.fround(delta * Math.fround(0.2)))
        : -bankersRound(Math.fround(-delta * Math.fround(0.5)));
    amount = tutorial
      ? 0
      : boundedInteger(Math.max(0, c.baseGold + bonus - failures * source.goldPenaltyPerFail));
    if (
      evidence["quotedAmount"] !== undefined &&
      boundedInteger(evidence["quotedAmount"]) !== amount
    )
      throw new AdminApiError(400, "Reward quote does not match the server catalog formula.");
    evidence = { finalCost: cost, failureCount: failures, tutorial };
  }
  if (input["amount"] !== undefined && boundedInteger(input["amount"]) !== amount)
    throw new AdminApiError(400, "Reward amount does not match the server catalog.");
  return {
    key,
    amount,
    payload: { kind, sourceId: entry.id, evidence, catalogVersion: source.version },
    fingerprint: digest({ key, amount, evidence, catalogFingerprint }),
  };
}

export function importCatalogState(body: Record<string, unknown>) {
  const list = (key: string): string[] => {
    const value = body[key] ?? [];
    if (
      !Array.isArray(value) ||
      value.length > 10_000 ||
      value.some((id) => typeof id !== "string")
    )
      throw new AdminApiError(400, "Legacy save catalog data is invalid.");
    return [...new Set(value as string[])];
  };
  // Old inactive IDs may remain in saves; retain local progress, but never mint unknown server rewards/items.
  const rewards: Array<{ key: string; fingerprint: string }> = [];
  for (const id of list("completedContracts")) {
    const entry = source.contracts.find((c) => c.id === id || c.aliases.includes(id));
    if (entry)
      rewards.push({
        key: `contract:${entry.id}`,
        fingerprint: digest({ migration: true, kind: "contract", id: entry.id }),
      });
  }
  for (const id of list("unlockedAchievements")) {
    if (source.achievements.some((a) => a.id === id))
      rewards.push({
        key: `achievement:${id}`,
        fingerprint: digest({ migration: true, kind: "achievement", id }),
      });
  }
  const entitlements: Array<{
    kind: "cosmetic" | "material";
    targetKey: string;
    payload: Record<string, string>;
  }> = [];
  const ownedShop = new Set(list("purchasedShopItemIds"));
  const ownedCosmetics = new Set(list("unlockedCosmeticIDs"));
  for (const item of source.items) {
    if (ownedShop.has(item.itemId) || ownedCosmetics.has(item.cosmeticId))
      entitlements.push({
        kind: "cosmetic",
        targetKey: item.itemId,
        payload: { itemId: item.itemId, cosmeticId: item.cosmeticId },
      });
  }
  const unlocked = new Set(list("unlockedContractMaterials"));
  for (const c of source.contracts)
    for (const m of source.materials) {
      if (c.allowedMaterialIds.length > 0 && !c.allowedMaterialIds.includes(m.id)) continue;
      const saveKey = `${c.id}_${m.id}`;
      if (unlocked.has(saveKey) || c.aliases.some((alias) => unlocked.has(`${alias}_${m.id}`)))
        entitlements.push({
          kind: "material",
          targetKey: saveKey,
          payload: { contractId: c.id, materialId: m.id, saveKey },
        });
    }
  return { rewards, entitlements };
}
