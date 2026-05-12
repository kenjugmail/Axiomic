// Phase 1 (prototype migration) — RenameMoment.
// Modal port of moments.jsx:276-328. Focused input with 1-18 char
// validation and a centered preview of the pet (no cosmetics so the
// silhouette reads clean).

import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { PetAvatar } from "./PetAvatar";

interface Props {
  open: boolean;
  onClose: () => void;
  // Active pet identity. Cosmetics are intentionally NOT passed —
  // the rename moment focuses on the pet's silhouette + name.
  pet: { species: string; level: number; name: string; speciesLabel: string };
  onCommit: (name: string) => void | Promise<void>;
}

const MAX = 18;

export function RenameMomentModal({
  open,
  onClose,
  pet,
  onCommit,
}: Props): JSX.Element | null {
  const [name, setName] = useState(pet.name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset to current name + focus + select whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setName(pet.name);
    setSaving(false);
    // requestAnimationFrame so the input is mounted before focus.
    const t = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(t);
  }, [open, pet.name]);

  if (!open) return null;

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX;
  const unchanged = trimmed === pet.name;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || unchanged || saving) return;
    setSaving(true);
    try {
      await onCommit(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Rename your pet"
      description="You can rename anytime. No cost."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pet-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="pet-rename-form"
            className="pet-btn primary"
            disabled={!valid || unchanged || saving}
          >
            {saving ? "Saving…" : "Save name"}
          </button>
        </div>
      }
    >
      <form id="pet-rename-form" onSubmit={submit} className="px-6 py-7">
        <div className="flex justify-center mb-5">
          <PetAvatar
            species={pet.species}
            level={pet.level}
            equipped={{}}
            size={120}
            showCosmetics={false}
            ariaLabel={`${pet.name}, your ${pet.species}`}
          />
        </div>
        <div className="flex justify-center">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX + 2}
            placeholder={`Name your ${pet.speciesLabel.toLowerCase()}`}
            aria-label="Pet name"
            className="w-[280px] px-4 py-3 text-lg text-center rounded-xl border outline-none"
            style={{
              borderColor: "var(--line-strong)",
              background: "var(--bg-elev)",
              color: "var(--ink)",
              fontFamily: "var(--font-display)",
            }}
          />
        </div>
        <p
          className="text-center text-xs mt-2"
          style={{ color: "var(--ink-3)" }}
        >
          1–{MAX} characters. {trimmed.length}/{MAX}
        </p>
      </form>
    </Modal>
  );
}
