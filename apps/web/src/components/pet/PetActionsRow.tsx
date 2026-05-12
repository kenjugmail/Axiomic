// Phase 1 (prototype migration) — action button row for the pet hero.
// Renders Pat/Wiggle/Twirl/Hop/Sniff buttons that set a one-shot action
// on the PetAvatar via parent state. The avatar's CSS keyframes
// (pet-tokens.css ~509-538) play for ~1s; we clear after 1.2s so
// back-to-back clicks restart the animation.

import { useEffect, useRef, useState } from "react";
import type { PetAction } from "./PetAvatar";

const ACTIONS: ReadonlyArray<{ id: PetAction; label: string }> = [
  { id: "pat", label: "Pat" },
  { id: "wiggle", label: "Wiggle" },
  { id: "twirl", label: "Twirl" },
  { id: "hop", label: "Hop" },
  { id: "sniff", label: "Sniff" },
];

interface Props {
  onAction: (a: PetAction) => void;
  disabled?: boolean;
}

export function PetActionsRow({ onAction, disabled }: Props): JSX.Element {
  return (
    <>
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          className="pet-btn ghost"
          onClick={() => onAction(a.id)}
          disabled={disabled}
          aria-label={`${a.label} your pet`}
          data-testid={`pet-action-${a.id}`}
        >
          {a.label}
        </button>
      ))}
    </>
  );
}

// Helper hook — parent calls `trigger(action)` to set the action and
// auto-clear after 1200ms (matches the longest keyframe duration in
// pet-tokens.css). Restarting an action mid-flight cancels the
// previous timeout so the new keyframe runs cleanly.
export function usePetAction(): [PetAction | null, (a: PetAction) => void] {
  const [action, setAction] = useState<PetAction | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const trigger = (a: PetAction) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    // Two-tick reset so the CSS keyframe restarts even when clicking
    // the same action button twice in a row.
    setAction(null);
    window.requestAnimationFrame(() => setAction(a));
    timerRef.current = window.setTimeout(() => {
      setAction(null);
      timerRef.current = null;
    }, 1200);
  };
  return [action, trigger];
}
