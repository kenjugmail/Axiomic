// Phase 2 (prototype migration) — GrantMoment.
// Celebratory modal for a granted cosmetic. Port of moments.jsx:177-209.
// Renders the cosmetic glyph at a hero scale + name + rarity + obtain
// callout. Two-button footer: Thanks (close) / Equip now (caller wires).

import { Modal } from "../../components/ui/Modal";
import { CosmeticGlyphSVG, type Rarity } from "./CosmeticGlyphSVG";
import { RarityBadge } from "./RarityBadge";
import { ObtainabilityCallout } from "./ObtainabilityCallout";

interface Props {
  open: boolean;
  onClose: () => void;
  // Equip-now CTA; if omitted, only the Thanks button shows.
  onEquip?: () => void;
  item: {
    slug: string;
    name: string;
    rarity: Rarity;
    description?: string | null;
  };
  fromName: string;
}

export function GrantMoment({
  open,
  onClose,
  onEquip,
  item,
  fromName,
}: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showClose={false}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pet-btn ghost" onClick={onClose}>
            Thanks
          </button>
          {onEquip && (
            <button type="button" className="pet-btn primary" onClick={onEquip}>
              Equip now
            </button>
          )}
        </div>
      }
    >
      <div className="px-7 py-8 text-center">
        <div
          className="mx-auto mb-4 grid place-items-center"
          style={{
            width: 88,
            height: 88,
            borderRadius: 18,
            background: "var(--accent-soft)",
            animation: "pop .35s cubic-bezier(.2,.9,.3,1.2)",
          }}
        >
          <CosmeticGlyphSVG slug={item.slug} rarity={item.rarity} size={56} />
        </div>
        <h3 className="text-lg font-semibold mb-1">A new item arrived.</h3>
        <div
          className="text-base"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink-2)" }}
        >
          {fromName} sent you the <strong>{item.name}</strong>.
        </div>
        <div className="flex justify-center gap-2 mt-3.5 flex-wrap">
          <RarityBadge rarity={item.rarity} />
          <ObtainabilityCallout obtain="grant" />
        </div>
        {item.description && (
          <p
            className="mt-4 text-[13px] italic mx-auto max-w-xs"
            style={{ color: "var(--ink-3)" }}
          >
            “{item.description}”
          </p>
        )}
      </div>
      <style>{`
        @keyframes pop {
          from { transform: scale(.92) translateY(8px); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Modal>
  );
}
