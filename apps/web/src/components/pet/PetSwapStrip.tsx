// S104 — Pet swap strip.
//
// Horizontal row of the user's pets. The active pet is ringed in
// primary; clicking any other pet calls /me/pet/activate to switch.
// A "+ Hatch new" button at the right end is enabled when lifetime
// XP meets the next threshold; disabled (with "Need N more XP")
// otherwise. Hidden entirely when the cap is reached.

import { useState } from "react";
import { Plus, Lock } from "lucide-react";
import type { MyPetResponse } from "@axiomic/types";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../stores/toast";

interface PetSwapStripProps {
  pets: MyPetResponse["pets"];
  totalXp: number;
  petCap: number;
  nextHatchXp: number | null;
  onChanged: () => void;
}

export function PetSwapStrip({ pets, totalXp, petCap, nextHatchXp, onChanged }: PetSwapStripProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const switchTo = async (petId: string) => {
    setBusy(petId);
    try {
      await api.pet.activate(petId);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const hatchAnother = async () => {
    if (nextHatchXp == null || totalXp < nextHatchXp) return;
    if (!confirm("Hatch a new pet? Random species. (Free — no XP cost.)")) return;
    setBusy("hatch");
    try {
      const r = await api.pet.hatchAnother();
      toast.success(`A ${r.pet.name} hatched!`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Hatch failed");
    } finally {
      setBusy(null);
    }
  };

  // Pre-hatch (no pets yet) — the page already shows an egg-progress
  // card so we render nothing here.
  if (pets.length === 0) return null;

  const atCap = pets.length >= petCap;
  const canHatch = !atCap && nextHatchXp != null && totalXp >= nextHatchXp;
  const xpToGo = nextHatchXp != null ? Math.max(0, nextHatchXp - totalXp) : 0;

  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
        Pets
      </span>
      <ul className="flex items-center gap-2 flex-wrap">
        {pets.map((p) => {
          const isActive = p.isActive;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => !isActive && switchTo(p.id)}
                disabled={isActive || busy !== null}
                title={`${p.speciesLabel} · Lv ${p.level}`}
                className={`w-12 h-12 rounded-md border flex items-center justify-center text-2xl transition-colors ${
                  isActive
                    ? "ring-2 ring-primary border-primary bg-primary/5 cursor-default"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                {p.speciesEmoji}
              </button>
            </li>
          );
        })}
        {!atCap && (
          <li>
            <button
              type="button"
              onClick={hatchAnother}
              disabled={!canHatch || busy !== null}
              title={
                canHatch
                  ? "Hatch a new pet"
                  : `Need ${xpToGo} more XP to hatch another pet`
              }
              className={`w-12 h-12 rounded-md border border-dashed flex items-center justify-center transition-colors ${
                canHatch
                  ? "border-primary text-primary hover:bg-primary/5"
                  : "border-border text-muted-foreground"
              }`}
            >
              {canHatch ? <Plus className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
            </button>
          </li>
        )}
      </ul>
      {!atCap && !canHatch && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {xpToGo} XP to next
        </span>
      )}
      {atCap && (
        <span className="text-[10px] text-muted-foreground">
          {petCap}/{petCap}
        </span>
      )}
    </div>
  );
}
