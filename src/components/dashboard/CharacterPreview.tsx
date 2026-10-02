import {
  HardHat,
  Scissors,
  Shirt,
  ShieldCheck,
  Hand,
  Footprints,
  Wrench,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import chibiEngineer from "@/assets/chibi-engineer.png";
import type { CosmeticItem, CosmeticSlot, PlayerCharacter } from "@/lib/playfab";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useCharacterPortrait } from "./useCharacterPortrait";
import { portraitBounds } from "./portrait-bounds";
import type { PortraitBounds } from "./portrait-bounds";

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
 *   1. Authenticated Entity File portrait, independent of dashboard sync
 *   2. Existing CharacterPortraitUrl compatibility source
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
  const entityPortrait = useCharacterPortrait();
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string>();
  const [measurement, setMeasurement] = useState<{
    source: string;
    bounds: PortraitBounds;
    aspect: number;
  }>();
  const candidates = [entityPortrait, character?.portraitUrl];
  const portrait = candidates.find((url) => url && !failed.includes(url));
  const measured = measurement?.source === portrait ? measurement : undefined;
  const image = (
    <img
      src={portrait ?? chibiEngineer}
      onLoad={(event) => {
        setLoaded(portrait);
        if (portrait) {
          const bounds = portraitBounds(event.currentTarget);
          if (bounds)
            setMeasurement({
              source: portrait,
              bounds,
              aspect: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
            });
        }
      }}
      onError={() => {
        if (portrait) setFailed((urls) => [...urls, portrait]);
      }}
      alt={
        portrait
          ? `${displayName}'s Civil Craft character with their equipped cosmetics`
          : "Generic Civil Craft engineer silhouette shown while no character snapshot is available"
      }
      className={cn(
        "object-contain object-center drop-shadow-[0_10px_16px_rgba(74,52,40,0.35)]",
        measured ? "absolute left-1/2 top-1/2 max-w-none" : "h-full w-full",
      )}
      style={
        measured
          ? {
              width: `min(${100 / measured.bounds.width}cqw, ${(100 * measured.aspect) / measured.bounds.height}cqh)`,
              height: "auto",
              transform: `translate(${-100 * measured.bounds.centerX}%, ${-100 * measured.bounds.centerY}%)`,
            }
          : undefined
      }
      loading="lazy"
    />
  );
  return (
    <div className={cn("panel relative flex w-full flex-col overflow-hidden p-0", className)}>
      <div className="blueprint absolute inset-0 bg-secondary/60" aria-hidden="true" />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gold/25 to-transparent"
        aria-hidden="true"
      />
      {!portrait || loaded !== portrait ? (
        <p className="relative z-10 mx-2 mt-2 rounded-lg border border-dashed border-gold/60 bg-gold/10 px-2 py-1 text-center text-[11px] font-semibold text-foreground/80">
          Awaiting character snapshot from the game
        </p>
      ) : null}
      <div className={cn("relative z-10 aspect-[3/4] w-full", !portrait && "p-2")}>
        {portrait ? (
          <div className="absolute inset-[6%] [container-type:size]">{image}</div>
        ) : (
          image
        )}
      </div>
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
