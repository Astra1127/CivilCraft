import { HardHat, Scissors, Shirt, ShieldCheck, Hand, Footprints, Wrench, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import chibiEngineer from "@/assets/chibi-engineer.png";
import type { CosmeticItem, CosmeticSlot, PlayerCharacter } from "@/lib/playfab";
import { cn } from "@/lib/utils";

export const SLOT_ORDER: CosmeticSlot[] = [
  "helmet",
  "hair",
  "top",
  "vest",
  "pants",
  "gloves",
  "shoes",
  "accessory",
];

export const SLOT_META: Record<CosmeticSlot, { label: string; icon: LucideIcon }> = {
  helmet: { label: "Head", icon: HardHat },
  hair: { label: "Hair", icon: Scissors },
  top: { label: "Top", icon: Shirt },
  vest: { label: "Vest", icon: ShieldCheck },
  pants: { label: "Pants", icon: Layers },
  gloves: { label: "Gloves", icon: Hand },
  shoes: { label: "Shoes", icon: Footprints },
  accessory: { label: "Accessory", icon: Wrench },
};

/**
 * Renders the player's Civil Craft character.
 *
 * Order of preference (the GAME is the source of truth):
 *   1. Character snapshot rendered by the game (`character.portraitUrl`)
 *   2. Pre-rendered image derived from equipped cosmetics (same field)
 *   3. Generic Civil Craft engineer silhouette (fallback below)
 *
 * The website never composes a 3D character itself.
 */
export function CharacterPreview({
  character,
  displayName,
  className,
}: {
  character?: PlayerCharacter | undefined;
  displayName: string;
  className?: string;
}) {
  const portrait = character?.portraitUrl;
  return (
    <div
      className={cn(
        "panel relative flex aspect-[3/4] w-full items-end justify-center overflow-hidden p-0",
        className,
      )}
    >
      <div className="blueprint absolute inset-0 bg-secondary/60" aria-hidden="true" />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gold/25 to-transparent"
        aria-hidden="true"
      />
      <img
        src={portrait ?? chibiEngineer}
        alt={
          portrait
            ? `${displayName}'s Civil Craft character with their equipped cosmetics`
            : "Generic Civil Craft engineer silhouette shown while no character snapshot is available"
        }
        className="relative z-10 h-[88%] w-auto object-contain drop-shadow-[0_10px_16px_rgba(74,52,40,0.35)]"
        loading="lazy"
      />
      {!portrait ? (
        <p className="absolute inset-x-3 top-3 z-10 rounded-lg border border-dashed border-gold/60 bg-gold/10 px-2 py-1 text-center text-[11px] font-semibold text-foreground/80">
          Awaiting character snapshot from the game
        </p>
      ) : null}
    </div>
  );
}

export function EquipmentSlot({ slot, item }: { slot: CosmeticSlot; item?: CosmeticItem }) {
  const meta = SLOT_META[slot];
  const Icon = meta.icon;
  return (
    <li className="panel flex flex-col items-center gap-2 p-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold">{meta.label}</p>
      <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border-2 border-border bg-secondary/70">
        {item?.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        ) : (
          <Icon className="h-6 w-6 text-taupe" aria-hidden="true" />
        )}
      </span>
      <p className="line-clamp-2 text-xs font-semibold leading-snug">{item?.name ?? "Empty"}</p>
    </li>
  );
}
