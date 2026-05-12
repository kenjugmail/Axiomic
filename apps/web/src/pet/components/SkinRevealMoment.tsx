// Phase 2 (prototype migration) — SkinRevealMoment.
// Port of extras.jsx:442-495. Shows a before → after of the pet with
// the new skin applied. Fires the first time a non-default skin is
// equipped (caller's responsibility — there's no server event).

import { useEffect, useState } from "react";
import type { PetSkinDef } from "@axiomic/types";
import { Modal } from "../../components/ui/Modal";
import { PetAvatar, type PetAvatarCosmetic } from "./PetAvatar";
import { RarityBadge } from "./RarityBadge";

interface Props {
  open: boolean;
  onClose: () => void;
  pet: { species: string; level: number };
  equipped: {
    head?: PetAvatarCosmetic | null;
    eyes?: PetAvatarCosmetic | null;
    acc?: PetAvatarCosmetic | null;
  };
  skin: PetSkinDef;
}

export function SkinRevealMoment({
  open,
  onClose,
  pet,
  equipped,
  skin,
}: Props): JSX.Element | null {
  const [phase, setPhase] = useState<"before" | "after">("before");

  useEffect(() => {
    if (!open) {
      setPhase("before");
      return;
    }
    const t = window.setTimeout(() => setPhase("after"), 350);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showClose={false}
      footer={
        <div className="flex justify-end">
          <button type="button" className="pet-btn primary" onClick={onClose}>
            Looks good
          </button>
        </div>
      }
    >
      <div className="px-9 py-9 text-center">
        <div
          className="font-mono uppercase tracking-widest text-[11px] mb-3.5"
          style={{ color: "var(--ink-4)" }}
        >
          New skin equipped
        </div>
        <div
          className="mx-auto relative grid place-items-center"
          style={{ width: 200, height: 200 }}
        >
          <div
            style={{
              transition: "opacity .5s, transform .5s",
              opacity: phase === "before" ? 1 : 0,
              transform: phase === "before" ? "scale(1)" : "scale(.92)",
              position: "absolute",
              inset: 0,
            }}
          >
            <PetAvatar
              species={pet.species}
              level={pet.level}
              equipped={equipped}
              skin={null}
              size={200}
              showCosmetics={false}
              ariaLabel="Pet before skin"
            />
          </div>
          <div
            style={{
              transition: "opacity .7s, transform .7s",
              opacity: phase === "before" ? 0 : 1,
              transform: phase === "before" ? "scale(1.05)" : "scale(1)",
              position: "absolute",
              inset: 0,
            }}
          >
            <PetAvatar
              species={pet.species}
              level={pet.level}
              equipped={equipped}
              skin={skin.fx ?? null}
              size={200}
              showCosmetics={false}
              ariaLabel={`Pet with the ${skin.name} skin`}
            />
          </div>
        </div>
        <h2
          className="mt-5 text-2xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {skin.name}
        </h2>
        <div className="flex justify-center gap-2 mt-2">
          <RarityBadge rarity={skin.rarity} />
        </div>
        {skin.description && (
          <p
            className="text-sm mt-3 italic leading-relaxed"
            style={{ color: "var(--ink-3)" }}
          >
            “{skin.description}”
          </p>
        )}
      </div>
    </Modal>
  );
}
