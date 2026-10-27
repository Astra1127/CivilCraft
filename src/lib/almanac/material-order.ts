// The opening timber sequence is confirmed by the game owner. Remaining IDs
// preserve their relative order in game-catalog.json; no later gameplay order
// is documented in the in-repo export. Keep presentation independent of discovery.
export const MATERIAL_ORDER = [
  "wood_beam",
  "wood_support",
  "wood_road",
  "concrete_road",
  "concrete_member",
  "rope",
] as const;

export function orderMaterials<T extends { id: string }>(materials: readonly T[]): T[] {
  const position = (id: string) => {
    const index = MATERIAL_ORDER.findIndex((known) => known === id);
    return index < 0 ? Infinity : index;
  };
  return [...materials].sort((a, b) => position(a.id) - position(b.id));
}
