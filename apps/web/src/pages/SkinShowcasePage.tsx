// Phase N — Public skin showcase at /skins.
//
// Renders every pet skin with its rarity, source ("Earn at 4,000 XP" /
// "Awarded for 30-day streak" / "Competition prize" / "Starter") and,
// for signed-in users, owned + per-pet equipped state. Locked tiles
// open a modal with how to obtain the skin.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  PetSkinDef,
  PetSkinRarity,
  PetSkinShowcaseEntry,
  PetSkinShowcaseResponse,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { SkinTile } from "../components/pet/SkinTile";
import { Modal } from "../components/ui/Modal";
import { Skeleton } from "../components/ui";

type FilterKey = "all" | "owned" | "locked" | PetSkinRarity;

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "owned", label: "Owned" },
  { key: "locked", label: "Locked" },
  { key: "rare", label: "Rare" },
  { key: "epic", label: "Epic" },
  { key: "legendary", label: "Legendary" },
];

export function SkinShowcasePage() {
  const { user } = useAuthStore();
  const rhythmicGrid = useThemeStore((s) => s.rhythmicGrid);
  const [data, setData] = useState<PetSkinShowcaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [modalSkin, setModalSkin] = useState<PetSkinShowcaseEntry | null>(null);

  useEffect(() => {
    api.pet
      .skinShowcase()
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load"));
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.skins.filter((s) => {
      if (filter === "all") return true;
      if (filter === "owned") return s.owned === true;
      if (filter === "locked") return s.owned === false;
      return s.rarity === filter;
    });
  }, [data, filter]);

  const ownedCount = data?.skins.filter((s) => s.owned === true).length ?? 0;
  const totalCount = data?.skins.length ?? 0;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
          All skins
        </h1>
        <p className="text-sm text-muted-foreground">
          {data
            ? data.authenticated
              ? `${ownedCount} of ${totalCount} owned. Click a locked skin to see how to earn it.`
              : `${totalCount} skins. Sign in to track which ones you own.`
            : "Loading the catalog…"}
        </p>
      </div>

      {data && data.authenticated && (
        <div
          className="flex flex-wrap gap-2 mb-5"
          role="tablist"
          aria-label="Filter skins"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                data-testid={`filter-${f.key}`}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {!data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No skins match this filter yet.
        </p>
      ) : (
        // Phase N — same `cos-grid.rhythmic` toggle the cosmetic grids
        // honor. Mixed rarities make this look the most striking here.
        <div className={`skin-grid${rhythmicGrid ? " rhythmic" : ""}`}>
          {filtered.map((entry) => (
            <ShowcaseTile
              key={entry.slug}
              entry={entry}
              onClick={() => {
                if (entry.owned !== true) setModalSkin(entry);
              }}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalSkin !== null}
        onClose={() => setModalSkin(null)}
        title={modalSkin?.displayName}
        size="md"
      >
        {modalSkin && <ObtainHelp entry={modalSkin} />}
      </Modal>
    </div>
  );
}

function ShowcaseTile({
  entry,
  onClick,
}: {
  entry: PetSkinShowcaseEntry;
  onClick: () => void;
}) {
  // Synthesize a PetSkinDef so we can reuse <SkinTile> at full size.
  const skinDef: PetSkinDef = {
    slug: entry.slug,
    name: entry.displayName,
    rarity: entry.rarity,
    obtain:
      entry.source === "xp"
        ? "xp"
        : entry.source === "competition"
          ? "comp"
          : entry.source === "achievement"
            ? "grant"
            : "default",
    xpCost: entry.sourceDetail?.xpCost ?? null,
    description: entry.description,
    fx: entry.fx,
  };
  const owned = entry.owned === true;
  const equipped = entry.equippedOnPetIds.length > 0;
  return (
    <div data-testid={`showcase-tile-${entry.slug}`}>
      <SkinTile
        skin={skinDef}
        owned={owned}
        equipped={equipped}
        onClick={onClick}
      />
      <div className="mt-2 px-1 text-[11px] text-muted-foreground space-y-0.5">
        <div>{sourceLine(entry)}</div>
        {equipped && (
          <div className="text-primary font-medium">
            Equipped on {entry.equippedOnPetIds.length}{" "}
            {entry.equippedOnPetIds.length === 1 ? "pet" : "pets"}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceLine(entry: PetSkinShowcaseEntry): string {
  switch (entry.source) {
    case "starter":
      return "Starter — every pet has it";
    case "xp":
      return entry.sourceDetail?.xpCost != null
        ? `Buy for ${entry.sourceDetail.xpCost.toLocaleString()} XP`
        : "Buy with XP";
    case "achievement":
      return entry.sourceDetail?.achievementLabel
        ? `Awarded for: ${entry.sourceDetail.achievementLabel}`
        : "Awarded by grant";
    case "competition":
      return "Competition prize";
  }
}

function ObtainHelp({ entry }: { entry: PetSkinShowcaseEntry }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{entry.description}</p>
      <div className="rounded-md border border-input p-3 text-sm">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          How to earn
        </div>
        <div>{sourceLine(entry)}</div>
        {entry.source === "xp" && (
          <Link
            to="/shop"
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            Open the XP shop →
          </Link>
        )}
        {entry.source === "achievement" && (
          <Link
            to="/me/progress"
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            View achievements →
          </Link>
        )}
        {entry.source === "competition" && (
          <Link
            to="/explore/pets"
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            Browse competitions →
          </Link>
        )}
      </div>
    </div>
  );
}
