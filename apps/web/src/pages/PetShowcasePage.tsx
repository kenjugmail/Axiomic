// S97 — Public pet showcase / explore page.
//
// Two sections:
//   - mostDecorated: top users by equipped cosmetic count, full
//     PetAvatar with cosmetics on display.
//   - recentTopLevel: most recent users to evolve to level 2 or 3.
//     Pet-only (no cosmetic decoration on this list — keep it
//     focused on the evolution glow-up).
//
// Public — no auth gate. Encourages aspiration: see what other
// people have built and link out to their profiles.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Award, ChevronRight } from "lucide-react";
import type { PetShowcaseResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";
import { PetAvatar } from "../components/pet/PetAvatar";

export function PetShowcasePage() {
  const [data, setData] = useState<PetShowcaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.pet
      .showcase()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Pet showcase
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        See what other people are up to. Earn cosmetics + level up to make the cut.
      </p>

      <Section
        title="Most decorated"
        icon={<Sparkles className="w-4 h-4 text-amber-500" />}
        description="Equipped cosmetic count"
      >
        {data.mostDecorated.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No decorated pets yet. Be the first to equip something.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.mostDecorated.map((entry) => (
              <li key={entry.userId}>
                <Link
                  to={`/u/${entry.username}`}
                  className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
                >
                  <PetAvatar
                    species={entry.pet.species}
                    level={entry.pet.level}
                    equipped={{
                      head: entry.pet.equipped.find((x) => x.slot === "head") ?? null,
                      eyes: entry.pet.equipped.find((x) => x.slot === "eyes") ?? null,
                      acc: entry.pet.equipped.find((x) => x.slot === "accessory") ?? null,
                    }}
                    size={56}
                    ariaLabel={`${entry.displayName || entry.username}'s pet`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {entry.displayName || entry.username}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {entry.equippedCount} equipped · Lv {entry.pet.level}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Recently leveled up"
        icon={<Award className="w-4 h-4 text-violet-500" />}
        description="Pets that hit level 2 or 3"
      >
        {data.recentTopLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nobody's leveled up yet — earn 250 XP to be first.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.recentTopLevel.map((entry) => (
              <li key={entry.userId}>
                <Link
                  to={`/u/${entry.username}`}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors text-center"
                >
                  <PetAvatar
                    species={entry.pet.species}
                    level={entry.pet.level}
                    equipped={{
                      head: entry.pet.equipped.find((x) => x.slot === "head") ?? null,
                      eyes: entry.pet.equipped.find((x) => x.slot === "eyes") ?? null,
                      acc: entry.pet.equipped.find((x) => x.slot === "accessory") ?? null,
                    }}
                    size={80}
                    hero
                    ariaLabel={`${entry.displayName || entry.username}'s pet`}
                  />
                  <div className="text-sm font-medium truncate w-full">
                    {entry.displayName || entry.username}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Lv {entry.pet.level}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {description}
        </span>
      </div>
      {children}
    </section>
  );
}
