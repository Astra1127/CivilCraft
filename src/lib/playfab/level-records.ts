import type { AlmanacLevel } from "./types.ts";

// StoryDialogue_Bhan_to_Shopkeeper.md documents these three authored contracts in this order.
// Tutorials precede Story Mode but do not consume numbered story stages.
const openingStages: Record<string, number> = {
  ShopKeeper: 1,
  ShopKeeperContract: 1,
};

export function tutorialNumber(levelId: string): number | undefined {
  return levelId === "TUT_CONTRACT1" ? 1 : levelId === "TUT_CONTRACT2" ? 2 : undefined;
}

export function canonicalStageOrder(levelId: string): number | undefined {
  return Object.hasOwn(openingStages, levelId) ? openingStages[levelId] : undefined;
}

export function sortStoryLevels(levels: AlmanacLevel[]): AlmanacLevel[] {
  // Unknown stages keep their incoming relative order; no speculative numbering.
  const position = (level: AlmanacLevel) => {
    const tutorial = tutorialNumber(level.levelId);
    return tutorial
      ? tutorial - 3
      : (canonicalStageOrder(level.levelId) ?? level.stageOrder ?? Infinity);
  };
  return [...levels].sort((a, b) => position(a) - position(b));
}

/** Completion objects alone are not evidence: Unity may serialize empty nested objects. */
export function verifiedLevelCompletion(level: AlmanacLevel, playerId?: string): boolean {
  const c = level.completion;
  return !!(
    level.stableId !== false &&
    level.levelId.trim() &&
    level.regionId.trim() &&
    level.status === "completed" &&
    c &&
    c.status === "success" &&
    c.levelId === level.levelId &&
    c.regionId === level.regionId &&
    (!playerId || !c.playerId || c.playerId === playerId)
  );
}

/** Exported `order` is an internal catalog position, not a story-stage number. */
export function levelStageLabel(level: AlmanacLevel): string {
  const tutorial = tutorialNumber(level.levelId);
  if (tutorial) return `Tutorial ${tutorial}`;
  const stage = canonicalStageOrder(level.levelId) ?? level.stageOrder;
  return stage ? `Level ${String(stage).padStart(2, "0")}` : "Contract";
}

export function completionDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) && Number.isFinite(Date.parse(value)) ? value : "";
}
