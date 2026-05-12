// S100 — Pet evolution chain.
//
// Aspirational widget: shows all 3 forms of the user's species
// horizontally. Past + current forms render full color; unreached
// forms are grayed with a "X XP to unlock" caption underneath.
// Phase M — switched to mini-PetSilhouetteSVG per level (no emoji).

import { ChevronRight } from "lucide-react";
import type { MyPetResponse } from "@axiomic/types";
import { PetSilhouetteSVG } from "./PetSilhouetteSVG";

type Pet = NonNullable<MyPetResponse["pet"]>;

interface EvolutionChainProps {
  pet: Pet;
  totalXp: number;
}

export function EvolutionChain({ pet, totalXp }: EvolutionChainProps) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Evolution chain
      </div>
      <div className="flex items-center justify-around gap-2">
        {pet.evolutionChain.map((entry, i) => {
          const reached = pet.level >= entry.level;
          const isCurrent = pet.level === entry.level;
          const xpToGo = Math.max(0, entry.threshold - totalXp);
          return (
            <div key={entry.level} className="contents">
              <div className="flex flex-col items-center gap-1 text-center min-w-0">
                <div
                  className={`${reached ? "" : "opacity-30 grayscale"} ${
                    isCurrent ? "scale-110" : ""
                  }`}
                  style={{ width: 48, height: 48 }}
                  title={`Level ${entry.level}`}
                >
                  <PetSilhouetteSVG species={pet.species} level={entry.level} />
                </div>
                <div className={`text-[10px] uppercase tracking-wider ${
                  isCurrent ? "text-primary font-semibold" : "text-muted-foreground"
                }`}>
                  Lv {entry.level}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {reached ? "unlocked" : `${xpToGo} XP to go`}
                </div>
              </div>
              {i < pet.evolutionChain.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
