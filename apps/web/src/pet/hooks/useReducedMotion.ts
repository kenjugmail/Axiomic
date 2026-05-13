// Phase 11B — useReducedMotion hook.
//
// Reads the user's prefers-reduced-motion preference live (updates
// if the user flips the system setting). Used by moment modals
// (LevelUpMoment, SkinRevealMoment) which apply transitions via
// inline styles — those bypass the global @media reduced-motion
// blanket rule in pet-tokens.css, so they need an explicit check.

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) =>
      setReduce(e.matches);
    // Older Safari (< 14) uses addListener; modern browsers use
    // addEventListener. Cover both.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    } else {
      // Legacy fallback.
      mq.addListener(onChange as (e: MediaQueryListEvent) => void);
      return () =>
        mq.removeListener(onChange as (e: MediaQueryListEvent) => void);
    }
  }, []);

  return reduce;
}
