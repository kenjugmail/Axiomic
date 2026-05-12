// Phase 1 (prototype migration) — "Where your pet appears" preview card.
// Renders the active pet at the five sizes it appears throughout the
// app, with context labels matching the prototype (surfaces.jsx:92-126).
// Below 32px cosmetics drop so the silhouette stays scannable in dense
// lists — PetAvatar already enforces this internally.

import type { Rarity } from "./CosmeticGlyphSVG";
import { PetAvatar, type PetAvatarCosmetic, type PetSkinFx } from "./PetAvatar";

interface Props {
  species: string;
  level: number;
  equipped: {
    head?: PetAvatarCosmetic | null;
    eyes?: PetAvatarCosmetic | null;
    acc?: PetAvatarCosmetic | null;
  };
  skin?: PetSkinFx | null;
  ring?: Rarity | false;
}

const SIZES: ReadonlyArray<{ sz: number; ctx: string }> = [
  { sz: 24, ctx: "Nav · comment thread" },
  { sz: 32, ctx: "Sidebar · roster" },
  { sz: 40, ctx: "Inline replies" },
  { sz: 56, ctx: "Profile chip" },
  { sz: 80, ctx: "Hero card" },
];

export function PetWhereCard({
  species,
  level,
  equipped,
  skin,
  ring,
}: Props): JSX.Element {
  return (
    <section
      className="rounded-2xl border bg-card mb-8"
      style={{ borderColor: "var(--line)" }}
    >
      <header
        className="px-6 py-4 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <h3 className="text-base font-semibold">Where your pet appears</h3>
        <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
          Live preview of your build at every size on Axiomic. Cosmetics drop
          below 32px so the silhouette reads in dense lists.
        </p>
      </header>
      <div className="px-6 py-6">
        <div className="flex flex-wrap items-end gap-7">
          {SIZES.map(({ sz, ctx }) => (
            <div key={sz} className="flex flex-col items-center gap-2">
              <PetAvatar
                species={species}
                level={level}
                equipped={equipped}
                skin={skin ?? null}
                size={sz}
                ring={sz >= 32 ? (ring ?? false) : false}
                showCosmetics={sz >= 32}
                ariaLabel={`Pet preview at ${sz} pixels (${ctx})`}
              />
              <div className="flex flex-col items-center gap-px">
                <span
                  className="text-[10.5px] font-mono tabular-nums"
                  style={{ color: "var(--ink-4)" }}
                >
                  {sz}px
                </span>
                <span
                  className="text-[10.5px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  {ctx}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
