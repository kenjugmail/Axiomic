// Phase M — SkinTile (design spec).
//
// 96px preview circle inside a tile with rarity-tinted radial-gradient
// background. Skin name in the display font, rarity glyph in mono at
// the top-right corner, uppercase letterspaced obtain hint below the
// name. Owned/unowned/equipped states match the design system.
//
// The preview hosts a mini-PetAvatar with the tile's skin applied so
// the user sees how the FX would look on THEIR pet (species + level
// passed from the parent).

import type { PetSkinDef } from "@axiomic/types";
import { PetAvatar } from "./PetAvatar";
import { ObtainabilityCallout } from "./ObtainabilityCallout";

interface SkinTileProps {
  skin: PetSkinDef;
  // Owner's pet — used so the preview reflects how the skin looks
  // on the user's actual species + level. Optional; falls back to
  // the egg silhouette.
  previewSpecies?: string;
  previewLevel?: number;
  owned: boolean;
  equipped: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function SkinTile({
  skin,
  previewSpecies,
  previewLevel,
  owned,
  equipped,
  onClick,
  disabled,
}: SkinTileProps) {
  const classes = [
    "skin-tile",
    skin.rarity,
    owned ? "owned" : "unowned",
    equipped ? "equipped" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Rarity corner uses a Unicode lozenge (no emoji).
  const cornerGlyph =
    skin.rarity === "legendary" ? "★" : skin.rarity === "epic" ? "⬥" : "◆";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes}
      aria-pressed={equipped}
      title={skin.description}
    >
      <span className="skin-corner" aria-hidden="true">
        {cornerGlyph}
      </span>
      <span className="skin-preview">
        <PetAvatar
          species={previewSpecies ?? "cat"}
          level={previewLevel ?? 1}
          skin={skin.fx}
          size={80}
          showCosmetics={false}
          ariaLabel={`${skin.name} preview`}
        />
      </span>
      <span className="skin-nm">{skin.name}</span>
      <span className="skin-meta">
        {equipped
          ? "Equipped"
          : owned
            ? "Owned"
            : skin.obtain === "default"
              ? "Default"
              : null}
      </span>
      {!owned && skin.obtain !== "default" && (
        <ObtainabilityCallout obtain={skin.obtain} cost={skin.xpCost ?? null} />
      )}
    </button>
  );
}
