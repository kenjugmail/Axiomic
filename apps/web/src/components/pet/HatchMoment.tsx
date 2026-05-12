// Phase 2 (prototype migration) — HatchMoment.
// Port of moments.jsx:4-86. Three-phase egg → crack → reveal flow with
// an inline name input. We don't expose a "skip" + accept-default
// pathway because Axiomic auto-hatches on signup and pre-fills the
// species-label as the default name.

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "../ui/Modal";
import { PetAvatar } from "./PetAvatar";

type Phase = "egg" | "crack" | "reveal";

interface Props {
  open: boolean;
  onClose: () => void;
  pet: { species: string; level: number; name: string; speciesLabel: string };
  // If provided, called when the user commits a (possibly renamed)
  // name. The store dismiss is left to the caller.
  onCommit?: (name: string) => void | Promise<void>;
}

export function HatchMoment({ open, onClose, pet, onCommit }: Props): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>("egg");
  const [name, setName] = useState(pet.name);

  useEffect(() => {
    if (!open) {
      setPhase("egg");
      setName(pet.name);
      return;
    }
  }, [open, pet.name]);

  useEffect(() => {
    if (phase !== "crack") return;
    const t = window.setTimeout(() => setPhase("reveal"), 700);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (!open) return null;

  const headline =
    phase === "egg"
      ? "It's stirring."
      : phase === "crack"
        ? "Something's coming through."
        : "Meet your study pet.";
  const subhead =
    phase === "egg"
      ? "Your pet has hatched. Take a moment."
      : phase === "reveal"
        ? `A ${pet.speciesLabel.toLowerCase()}. Name it (or use the default).`
        : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={headline}
      description={subhead}
      footer={
        <div className="flex justify-end gap-2">
          {phase === "egg" && (
            <button
              type="button"
              className="pet-btn primary"
              onClick={() => setPhase("crack")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Hatch
            </button>
          )}
          {phase === "reveal" && (
            <>
              <button type="button" className="pet-btn ghost" onClick={onClose}>
                Later
              </button>
              <button
                type="button"
                className="pet-btn primary"
                onClick={() => {
                  const finalName = name.trim() || pet.name;
                  onCommit?.(finalName);
                  if (!onCommit) onClose();
                }}
              >
                Meet {name.trim() || pet.name}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="px-6 py-10 text-center">
        {phase !== "reveal" ? (
          <div
            className="inline-block"
            style={{
              animation:
                phase === "crack" ? "egg-shake .5s ease-in-out 2" : "none",
            }}
          >
            <PetAvatar
              size={160}
              equipped={{}}
              showCosmetics={false}
              ariaLabel="A pet egg, hatching"
            />
          </div>
        ) : (
          <div style={{ animation: "pop .35s cubic-bezier(.2,.9,.3,1.2)" }}>
            <PetAvatar
              species={pet.species}
              level={1}
              equipped={{}}
              size={160}
              showCosmetics={false}
              ariaLabel={`Your ${pet.speciesLabel}`}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Name your ${pet.speciesLabel.toLowerCase()}`}
              aria-label="Pet name"
              className="mt-5 w-[260px] px-4 py-2.5 rounded-lg border text-center outline-none"
              style={{
                borderColor: "var(--line-strong)",
                background: "var(--bg-elev)",
                color: "var(--ink)",
                fontSize: 16,
                fontFamily: "var(--font-display)",
              }}
            />
          </div>
        )}
        <p
          className="mt-6 text-sm mx-auto max-w-sm"
          style={{ color: "var(--ink-3)" }}
        >
          {phase === "egg" && "Hatching takes a moment. Take your time."}
          {phase === "crack" && "Almost."}
          {phase === "reveal" &&
            "Pets evolve as you earn more lifetime XP."}
        </p>
      </div>
      <style>{`
        @keyframes egg-shake {
          0%,100% { transform: rotate(0); }
          25% { transform: rotate(-4deg); }
          75% { transform: rotate(4deg); }
        }
        @keyframes pop {
          from { transform: scale(.92) translateY(8px); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Modal>
  );
}
