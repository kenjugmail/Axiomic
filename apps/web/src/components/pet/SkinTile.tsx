// Phase L — SkinTile.
//
// Catalog tile for one skin. Shows a mini-PetAvatar preview with
// the skin applied (so the user sees the actual FX), name, rarity,
// and obtain hint. Click handler is wired by the parent — the tile
// is purely presentational beyond the button + aria-pressed state.

import type { PetSkinDef } from "@axiomic/types";
import { PetAvatar } from "./PetAvatar";

interface SkinTileProps {
  skin: PetSkinDef;
  // Owner's pet, used for the inline preview so the user sees how
  // it'd look on THEIR pet. Optional — if absent we render the
  // egg glyph at level 1.
  previewSpecies?: string;
  previewSpeciesEmoji?: string;
  previewLevel?: number;
  owned: boolean;
  equipped: boolean;
  // When owned + not equipped, click should equip. When unowned and
  // affordable (xpCost set), click should buy. The parent decides.
  onClick?: () => void;
  // Optional obtain-hint override (e.g. effective XP cost after a
  // shop discount; we keep this open even though Phase L's shop
  // doesn't yet feature skins).
  obtainHint?: string;
  disabled?: boolean;
}

export function SkinTile({
  skin,
  previewSpecies,
  previewSpeciesEmoji,
  previewLevel,
  owned,
  equipped,
  onClick,
  obtainHint,
  disabled,
}: SkinTileProps) {
  const defaultHint =
    skin.obtain === "default"
      ? "Default"
      : skin.obtain === "grant"
        ? "Instructor grant"
        : skin.obtain === "comp"
          ? "Competition prize"
          : skin.xpCost != null
            ? `${skin.xpCost.toLocaleString()} XP`
            : "Special";
  const hint = obtainHint ?? defaultHint;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={equipped}
      disabled={disabled}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-md border transition-colors text-center ${
        equipped ? "bg-emerald-500/5" : "bg-background"
      } ${disabled ? "opacity-50 cursor-not-allowed" : onClick ? "hover:bg-accent/40 cursor-pointer" : ""} ${
        !owned ? "opacity-70" : ""
      }`}
      style={{ borderColor: `var(--r-${skin.rarity})` }}
      title={skin.description}
    >
      <div className="shrink-0">
        <PetAvatar
          species={previewSpecies ?? "cat"}
          speciesEmoji={previewSpeciesEmoji}
          level={previewLevel ?? 1}
          skin={skin.fx}
          size={64}
          showCosmetics={false}
          ariaLabel={`${skin.name} preview`}
        />
      </div>
      <div className="min-w-0 w-full">
        <div className="text-sm font-medium truncate">{skin.name}</div>
        <div
          className="text-[10px] uppercase tracking-wider"
          style={{ color: `var(--r-${skin.rarity})` }}
        >
          {skin.rarity}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
          {hint}
          {equipped && (
            <span className="ml-1.5 text-emerald-600">· equipped</span>
          )}
          {!owned && !equipped && (
            <span className="ml-1.5 text-muted-foreground">· locked</span>
          )}
        </div>
      </div>
    </button>
  );
}
