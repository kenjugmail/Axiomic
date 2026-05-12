// Phase 2 (prototype migration) — CompetitionTeaser.
// Explainer modal for a competition-locked cosmetic. Surfaces what
// the prize is, how it's obtained, and when results post — without
// any leaderboard pressure or countdown. Port of moments.jsx:211-248.

import { Modal } from "../ui/Modal";
import { CosmeticGlyphSVG, type Rarity } from "./CosmeticGlyphSVG";
import { RarityBadge } from "./RarityBadge";
import { ObtainabilityCallout } from "./ObtainabilityCallout";

interface Props {
  open: boolean;
  onClose: () => void;
  item: {
    slug: string;
    name: string;
    rarity: Rarity;
    description?: string | null;
  };
}

export function CompetitionTeaser({ open, onClose, item }: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Competition prize"
      description="Can't be bought. Has to be earned."
      footer={
        <div className="flex justify-end">
          <button type="button" className="pet-btn" onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      <div className="px-6 py-7 text-center">
        <div
          className="mx-auto mb-4 grid place-items-center"
          style={{
            width: 96,
            height: 96,
            borderRadius: 18,
            background: "var(--bg-sunk)",
            border: "1px dashed var(--line-strong)",
          }}
        >
          <CosmeticGlyphSVG
            slug={item.slug}
            rarity={item.rarity}
            size={56}
            tone="muted"
          />
        </div>
        <h3
          className="text-xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {item.name}
        </h3>
        <div className="flex justify-center gap-2 mt-3">
          <RarityBadge rarity={item.rarity} />
          <ObtainabilityCallout obtain="comp" />
        </div>
        <p
          className="mt-5 text-sm mx-auto max-w-sm"
          style={{ color: "var(--ink-2)" }}
        >
          {item.description ||
            "Top finishers in the term competition take this home."}
        </p>
      </div>
    </Modal>
  );
}
