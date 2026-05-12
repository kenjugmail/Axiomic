// Phase 8E — dev-only "force species" override for PetAvatar.
//
// When TweaksPanel sets a non-null species, every PetAvatar on the
// page renders that species instead of the user's actual pet. The
// override is in-memory only (doesn't persist to localStorage, doesn't
// hit the server) — purely a visual debugging aid.
//
// Read via `useDevSpeciesOverride()`. The PetAvatar consumes this
// and falls back to its prop value when null.

import { createContext, useContext, useMemo, useState } from "react";

interface DevSpeciesAPI {
  override: string | null;
  setOverride: (s: string | null) => void;
}

const Ctx = createContext<DevSpeciesAPI>({
  override: null,
  setOverride: () => {
    /* no-op when provider absent */
  },
});

export function DevSpeciesProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevSpeciesOverride(): string | null {
  return useContext(Ctx).override;
}

export function useDevSpeciesSet(): (s: string | null) => void {
  return useContext(Ctx).setOverride;
}
