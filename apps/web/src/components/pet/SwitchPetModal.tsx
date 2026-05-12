// Phase 1 (prototype migration) — SwitchPetModal.
// Modal port of moments.jsx:331-408. Grid of the user's pets with the
// currently-active one labelled; clicking selects, confirm activates.
// We don't show a "hatch another" affordance here — PetSwapStrip
// keeps that role on MyPetPage / settings.

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { PetAvatar } from "./PetAvatar";

interface PetItem {
  id: string;
  species: string;
  speciesLabel: string;
  level: number;
  name: string;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  pets: PetItem[];
  activePetId: string | null;
  onCommit: (petId: string) => void | Promise<void>;
}

export function SwitchPetModal({
  open,
  onClose,
  pets,
  activePetId,
  onCommit,
}: Props): JSX.Element | null {
  const [picked, setPicked] = useState<string | null>(activePetId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(activePetId);
      setBusy(false);
    }
  }, [open, activePetId]);

  if (!open) return null;

  const selected = pets.find((p) => p.id === picked) ?? null;
  const isSameAsActive = !selected || selected.id === activePetId;

  const confirm = async () => {
    if (!selected || isSameAsActive || busy) return;
    setBusy(true);
    try {
      await onCommit(selected.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Switch active pet"
      description="Only one pet can be active. Others keep their XP."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pet-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pet-btn primary"
            disabled={isSameAsActive || busy}
            onClick={confirm}
          >
            {busy
              ? "Switching…"
              : isSameAsActive
                ? "Already active"
                : `Make ${selected?.name || selected?.speciesLabel} active`}
          </button>
        </div>
      }
    >
      <div className="px-6 py-5">
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          }}
        >
          {pets.map((p) => {
            const on = picked === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPicked(p.id)}
                aria-pressed={on}
                className="relative text-center rounded-xl px-2.5 pt-3.5 pb-2.5 cursor-pointer transition-colors"
                style={{
                  border: on
                    ? "2px solid var(--accent)"
                    : "1px solid var(--line)",
                  background: on ? "var(--accent-soft)" : "var(--bg-elev)",
                  // Keep height stable across selected/unselected so the
                  // 1px → 2px border swap doesn't shift the grid.
                  padding: on ? "13px 9px 9px" : "14px 10px 10px",
                }}
              >
                {p.isActive && (
                  <span
                    className="absolute top-1.5 right-1.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "var(--ink-2)",
                      color: "var(--bg)",
                      padding: "2px 6px",
                      borderRadius: 999,
                    }}
                  >
                    Active
                  </span>
                )}
                <div className="flex justify-center">
                  <PetAvatar
                    species={p.species}
                    level={p.level}
                    equipped={{}}
                    size={64}
                    showCosmetics={false}
                    ariaLabel={`${p.name}, ${p.speciesLabel} level ${p.level}`}
                  />
                </div>
                <div
                  className="mt-1.5 text-sm"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {p.name || p.speciesLabel}
                </div>
                <div
                  className="text-[11.5px] capitalize"
                  style={{ color: "var(--ink-3)" }}
                >
                  {p.speciesLabel} · Lvl {p.level}
                </div>
              </button>
            );
          })}
        </div>
        {pets.length === 0 && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: "var(--ink-3)" }}
          >
            No other pets yet. Earn more XP to hatch another.
          </p>
        )}
      </div>
    </Modal>
  );
}
