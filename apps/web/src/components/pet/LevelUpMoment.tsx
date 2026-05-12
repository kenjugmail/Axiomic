// Phase 1 (prototype migration) — LevelUpMoment.
// Modal port of moments.jsx:88-175. 3-beat reveal:
//   - "before"  (old silhouette alone) — 350ms
//   - "compare" (old + arrow + new side-by-side) — 750ms
//   - "after"   (new silhouette alone, settled)
// On reduced motion the phases still advance but the transitions
// collapse to ~1ms (handled globally by pet-tokens.css).

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Check } from "lucide-react";
import { PetAvatar } from "./PetAvatar";

interface Props {
  open: boolean;
  onClose: () => void;
  pet: {
    species: string;
    level: number;
    maxLevel: number;
    name: string;
  };
}

const QUOTES = [
  "Look at you.",
  "Quiet progress is still progress.",
  "A study partner with opinions, now.",
];

const NEXT_THRESHOLD_COPY: Record<number, string> = {
  2: "New evolution unlocked at 2,000 lifetime XP.",
  3: "New evolution unlocked at 6,000 lifetime XP.",
};

type Phase = "before" | "compare" | "after";

export function LevelUpMoment({ open, onClose, pet }: Props): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>("before");
  const atMax = pet.level >= pet.maxLevel;
  const newLevel = Math.min(pet.maxLevel, pet.level + 1);

  useEffect(() => {
    if (!open) {
      setPhase("before");
      return;
    }
    const t1 = window.setTimeout(() => setPhase("compare"), 350);
    const t2 = window.setTimeout(() => setPhase("after"), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${pet.name} is leveling up.`}
      description={
        atMax
          ? `Final form. Level ${pet.level}.`
          : `Level ${pet.level} → Level ${newLevel}`
      }
      footer={
        <div className="flex justify-end">
          <button type="button" className="pet-btn primary" onClick={onClose}>
            <Check className="w-3.5 h-3.5" />
            Looks good
          </button>
        </div>
      }
    >
      <div className="px-6 py-10 text-center" style={{ minHeight: 280 }}>
        <div
          className="inline-flex items-center justify-center"
          style={{
            gap: phase === "compare" ? 28 : 0,
            transition: "gap .35s cubic-bezier(.2,.8,.3,1)",
          }}
        >
          {/* Current form — visible during before+compare, fades during after */}
          <div
            style={{
              opacity: phase === "after" ? 0 : 1,
              transform:
                phase === "after"
                  ? "scale(.88) translateX(-12px)"
                  : "scale(1)",
              transition: "opacity .35s, transform .35s",
              width: phase === "after" ? 0 : 160,
              overflow: "visible",
            }}
          >
            <PetAvatar
              species={pet.species}
              level={pet.level}
              equipped={{}}
              size={160}
              showCosmetics={false}
              ariaLabel={`${pet.name}, current level ${pet.level}`}
            />
            {phase === "compare" && (
              <div
                className="mt-1 font-mono text-[10.5px] tracking-wider"
                style={{ color: "var(--ink-4)" }}
              >
                LVL {pet.level}
              </div>
            )}
          </div>

          {/* Arrow — only during compare */}
          {phase === "compare" && !atMax && (
            <svg
              width="28"
              height="20"
              viewBox="0 0 28 20"
              style={{ animation: "lvl-arrow .35s ease-out", flex: "none" }}
              aria-hidden="true"
            >
              <path
                d="M2 10h22M18 4l6 6-6 6"
                fill="none"
                stroke="var(--ink-3)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Next form — appears during compare, settles for after.
              At max level, we collapse this whole branch. */}
          {!atMax && (
            <div
              style={{
                opacity: phase === "before" ? 0 : 1,
                transform: phase === "before" ? "scale(.92)" : "scale(1)",
                transition: "opacity .35s, transform .35s",
                width: phase === "before" ? 0 : 160,
              }}
            >
              <PetAvatar
                species={pet.species}
                level={newLevel}
                equipped={{}}
                size={160}
                showCosmetics={false}
                ariaLabel={`${pet.name}, level ${newLevel}`}
              />
              {phase === "compare" && (
                <div
                  className="mt-1 font-mono text-[10.5px] tracking-wider font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  LVL {newLevel}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="mt-6 text-lg"
          style={{ fontFamily: "var(--font-display)" }}
        >
          “{QUOTES[Math.min(newLevel, QUOTES.length) - 1] ?? QUOTES[0]}”
        </div>
        <div className="text-[13px] mt-2" style={{ color: "var(--ink-3)" }}>
          {atMax
            ? "Final form. Lifetime XP keeps climbing, but the silhouette is set."
            : (NEXT_THRESHOLD_COPY[newLevel] ??
              "Keep earning XP to unlock the next evolution.")}
        </div>
      </div>

      <style>{`
        @keyframes lvl-arrow {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </Modal>
  );
}
