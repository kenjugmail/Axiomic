// Phase 3 (prototype migration) — Inventory page.
// Standalone /me/inventory route showing every cosmetic the user owns.
// Search + sort + filter chips (slot, rarity, source). Skins live
// under the "Skins" slot filter and route to the same detail UX via
// the inventory tile click.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CosmeticSlot, MyPetResponse, PetInventoryItem, PetSkinDef } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { Skeleton } from "../components/ui";
import { CosmeticChip } from "../components/pet/CosmeticChip";
import { SkinTile } from "../components/pet/SkinTile";
import { FilterChips } from "../components/pet/FilterChips";
import { CosmeticDetailSheet } from "../components/pet/CosmeticDetailSheet";
import { EmptyState } from "../components/ui/EmptyState";
import { toast } from "../stores/toast";

type SlotFilter = "all" | "head" | "eyes" | "accessory" | "skin";
type RarityFilter = "all" | "common" | "rare" | "epic" | "legendary";
type SourceFilter = "all" | "xp" | "grant";
type SortBy = "rarity" | "name";

const RARITY_ORDER: Record<string, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

export function InventoryPage(): JSX.Element {
  const { user } = useAuthStore();
  const rhythmicGrid = useThemeStore((s) => s.rhythmicGrid);
  const [data, setData] = useState<MyPetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotFilter>("all");
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortBy>("rarity");
  const [activeItem, setActiveItem] = useState<PetInventoryItem | null>(null);

  useEffect(() => {
    if (!user) return;
    api.pet.me()
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load"));
  }, [user]);

  const reload = async () => {
    try {
      const r = await api.pet.me();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reload");
    }
  };

  const toggleEquip = async (item: PetInventoryItem) => {
    try {
      if (item.equipped) {
        await api.pet.unequip(item.slug);
      } else {
        await api.pet.equip(item.slug);
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  const filtered = useMemo<PetInventoryItem[]>(() => {
    if (!data) return [];
    return data.inventory
      .filter((c) => {
        if (slot === "all") return true;
        if (slot === "skin") return false;
        return c.slot === slot;
      })
      .filter((c) => (rarity === "all" ? true : c.rarity === rarity))
      .filter((c) => {
        if (source === "all") return true;
        if (source === "grant") return c.grantedNote != null;
        if (source === "xp") return c.grantedNote == null;
        return true;
      })
      .filter((c) => (q ? c.name.toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      });
  }, [data, slot, rarity, source, q, sort]);

  const filteredSkins = useMemo<PetSkinDef[]>(() => {
    if (!data || slot !== "skin") return [];
    return [...data.ownedSkins]
      .filter((sk) => (rarity === "all" ? true : sk.rarity === rarity))
      .filter((sk) => {
        if (source === "all") return true;
        // PetSkinDef.obtain is "default" | "xp" | "grant" | "comp"; we
        // bucket "default" with "xp" for filter purposes since both
        // are non-grant-only.
        if (source === "grant") return sk.obtain === "grant";
        if (source === "xp") return sk.obtain === "xp" || sk.obtain === "default";
        return true;
      })
      .filter((sk) => (q ? sk.name.toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      });
  }, [data, slot, rarity, source, q, sort]);

  const equippedItems = useMemo(() => {
    if (!data) return [];
    return data.inventory.filter((i) => i.equipped);
  }, [data]);
  const equippedObj = useMemo(() => {
    return {
      head: equippedItems.find((i) => i.slot === "head") ?? null,
      eyes: equippedItems.find((i) => i.slot === "eyes") ?? null,
      acc: equippedItems.find((i) => i.slot === "accessory") ?? null,
    };
  }, [equippedItems]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to see your inventory.</p>
        <Link to="/login?redirect=/me/inventory" className="text-sm text-primary hover:underline mt-4 inline-block">
          Sign in
        </Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-3">
        <Skeleton variant="card" className="h-12" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  const showingSkins = slot === "skin";
  const ownedTotal = data.inventory.length;
  const ownedSkinsTotal = data.ownedSkins.length;
  const visibleCount = showingSkins ? filteredSkins.length : filtered.length;
  const total = showingSkins ? ownedSkinsTotal : ownedTotal;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div
          className="text-[11px] font-semibold tracking-widest uppercase mb-1"
          style={{ color: "var(--ink-3)" }}
        >
          Inventory
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--ink-3)" }}>
          Everything you own. Filter by slot, rarity, or how you got it.
        </p>
      </div>

      <div className="flex gap-2 items-center mb-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search inventory…"
          aria-label="Search inventory"
          className="flex-1 max-w-xs px-3 py-2 rounded-lg border outline-none text-sm"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink)",
          }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortBy)}
          aria-label="Sort by"
          className="px-3 py-2 rounded-lg border text-sm"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg-elev)",
            color: "var(--ink)",
          }}
        >
          <option value="rarity">Sort: Rarity</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <FilterChips<SlotFilter>
        label="Slot"
        value={slot}
        onChange={setSlot}
        options={[
          { value: "all", label: "All" },
          { value: "head", label: "Head" },
          { value: "eyes", label: "Eyes" },
          { value: "accessory", label: "Accessory" },
          { value: "skin", label: "Skins" },
        ]}
      />
      <FilterChips<RarityFilter>
        label="Rarity"
        value={rarity}
        onChange={setRarity}
        options={[
          { value: "all", label: "All" },
          { value: "common", label: "Common" },
          { value: "rare", label: "Rare" },
          { value: "epic", label: "Epic" },
          { value: "legendary", label: "Legendary" },
        ]}
      />
      <FilterChips<SourceFilter>
        label="Source"
        value={source}
        onChange={setSource}
        options={[
          { value: "all", label: "All" },
          { value: "xp", label: "XP shop" },
          { value: "grant", label: "Granted" },
        ]}
      />

      <div
        className="text-xs my-3"
        style={{ color: "var(--ink-3)" }}
      >
        Showing {visibleCount} of {total} {showingSkins ? "skins" : "owned"}
      </div>

      {showingSkins ? (
        filteredSkins.length === 0 ? (
          <EmptyState
            title="No skins match"
            description="Try clearing a filter or your search."
          />
        ) : (
          <div className="skin-grid">
            {filteredSkins.map((sk) => {
              const activeOnPet = data.pet?.activeSkinSlug === sk.slug;
              return (
                <SkinTile
                  key={sk.slug}
                  skin={sk}
                  previewSpecies={data.pet?.species ?? "fox"}
                  previewLevel={data.pet?.level ?? 1}
                  owned
                  equipped={activeOnPet}
                />
              );
            })}
          </div>
        )
      ) : ownedTotal === 0 ? (
        <EmptyState
          title="No items yet"
          description="Cosmetics arrive through XP purchases and instructor grants. Earn XP by completing class tasks and platform engagement."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try clearing a filter or your search."
        />
      ) : (
        <div className={`cos-grid${rhythmicGrid ? " rhythmic" : ""}`}>
          {filtered.map((item) => (
            <CosmeticChip
              key={item.id}
              slug={item.slug}
              name={item.name}
              slot={item.slot}
              rarity={item.rarity}
              description={
                item.grantedNote
                  ? `“${item.grantedNote}” — ${item.description}`
                  : item.description
              }
              equipped={item.equipped}
              onClick={() => setActiveItem(item)}
            />
          ))}
        </div>
      )}

      <CosmeticDetailSheet
        open={activeItem != null}
        onClose={() => setActiveItem(null)}
        item={activeItem}
        petSpecies={data.pet?.species ?? "fox"}
        petLevel={data.pet?.level ?? 1}
        equipped={equippedObj}
        onToggleEquip={toggleEquip}
      />
    </div>
  );
}

// Slot type used by the inventory grouping. Re-exported here so the
// page is self-contained; same shape as in @axiomic/types.
export type { CosmeticSlot };
