// S86 — "My pet" — pet preview at the top, inventory grid below.
// Click a cosmetic to equip; another click unequips. Rename input
// is inline with the pet preview.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Egg, Sparkles, BarChart3 } from "lucide-react";
import type { CosmeticSlot, MyPetResponse, PetInventoryItem, PetSkinDef, SkinShopResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { PetAvatar } from "../components/pet/PetAvatar";
import { PetSwapStrip } from "../components/pet/PetSwapStrip";
import { EvolutionChain } from "../components/pet/EvolutionChain";
import { CosmeticChip } from "../components/pet/CosmeticChip";
import { SkinTile } from "../components/pet/SkinTile";
import { toast } from "../stores/toast";

export function MyPetPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<MyPetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  // Phase L — skin shop list (everything available, owned + unowned).
  // The catalog read is public so we don't gate it on auth, and the
  // skin shop response includes owned/affordable flags computed
  // server-side.
  const [skinShop, setSkinShop] = useState<SkinShopResponse | null>(null);

  const reload = async () => {
    const r = await api.pet.me();
    setData(r);
    if (r.pet) setName(r.pet.name);
    try {
      const shop = await api.pet.skinShop();
      setSkinShop(shop);
    } catch {
      // shop is optional; the owned-skins grid still renders without it
    }
  };

  useEffect(() => {
    if (!user) return;
    api.pet.me().then((r) => {
      setData(r);
      if (r.pet) setName(r.pet.name);
    }).catch((e) => setError(e?.message ?? "Failed to load"));
    api.pet.skinShop().then(setSkinShop).catch(() => {
      // ignore — section just hides the locked tiles
    });
  }, [user]);

  const toggleEquip = async (item: PetInventoryItem) => {
    try {
      if (item.equipped) {
        await api.pet.unequip(item.slug);
      } else {
        await api.pet.equip(item.slug);
      }
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  // Phase L — skin equip/buy. Owned + not equipped → equip. Owned +
  // equipped → unequip (reset to default). Not owned + affordable
  // → buy (with optimistic balance). Not owned + not affordable
  // → tooltip-only; the tile shows "locked".
  const handleSkinClick = async (skin: PetSkinDef) => {
    if (!data?.pet) return;
    const owned = data.ownedSkins.some((s) => s.slug === skin.slug);
    const isEquipped = data.activeSkin?.slug === skin.slug;
    try {
      if (isEquipped) {
        if (skin.slug === "default") return; // can't unequip default
        await api.pet.skinUnequip();
        await reload();
        return;
      }
      if (owned) {
        await api.pet.skinEquip(skin.slug);
        await reload();
        return;
      }
      // Not owned. Find in shop for affordability check.
      const shopItem = skinShop?.items.find((i) => i.slug === skin.slug);
      if (!shopItem) {
        toast.error("This skin is not for sale");
        return;
      }
      if (!shopItem.affordable) {
        toast.error(`Need ${shopItem.xpCost} XP to buy this skin`);
        return;
      }
      await api.pet.buySkin(skin.slug);
      await api.pet.skinEquip(skin.slug);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await api.pet.rename(name.trim());
      setEditingName(false);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to see your pet.</p>
        <Link to="/login?redirect=/me/pet" className="text-sm text-primary hover:underline mt-4 inline-block">
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-48 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  // Group inventory by slot for the rendering grid.
  const grouped: Record<CosmeticSlot, PetInventoryItem[]> = {
    head: [],
    eyes: [],
    accessory: [],
  };
  for (const item of data.inventory) {
    grouped[item.slot]?.push(item);
  }
  const equippedItems = data.inventory.filter((i) => i.equipped);
  // Phase L — PetAvatar takes a slot-keyed object. Build it from the
  // equipped subset. Carries `rarity` through so the SVG-fallback
  // disc gets the right tint when emoji is null.
  const equippedObj = {
    head: equippedItems.find((i) => i.slot === "head") ?? null,
    eyes: equippedItems.find((i) => i.slot === "eyes") ?? null,
    acc: equippedItems.find((i) => i.slot === "accessory") ?? null,
  };
  // Phase L — pick the "highest equipped rarity" for the hero ring.
  // Empty / common-only ring renders as a subtle line; epic/legendary
  // make the avatar pop on ProfilePage / MyPetPage.
  const RARITY_ORDER = ["common", "rare", "epic", "legendary"] as const;
  const highestEquippedRarity = equippedItems.reduce<typeof RARITY_ORDER[number] | null>(
    (acc, i) => {
      const r = (i.rarity ?? "common") as typeof RARITY_ORDER[number];
      if (acc === null) return r;
      return RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(acc) ? r : acc;
    },
    null,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">My pet</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Hatched at {data.hatchThresholdXp} XP. Earn more XP by completing class tasks
        and platform engagement (lessons, quizzes, code questions).
      </p>

      {/* S104 — multi-pet strip. Renders above the hero so the
          user sees their whole roster + the next-hatch affordance
          at a glance. Hides itself pre-hatch. */}
      {data.pet && (
        <PetSwapStrip
          pets={data.pets}
          totalXp={data.totalXp}
          petCap={data.petCap}
          nextHatchXp={data.nextHatchXp}
          onChanged={() => reload()}
        />
      )}

      {/* Pet preview / hatching prompt */}
      {data.pet ? (
        <div className="rounded-lg border border-border p-6 mb-8 flex items-center gap-6 flex-wrap">
          <div>
            <PetAvatar
              species={data.pet.species}
              speciesEmoji={data.pet.levelEmoji}
              level={data.pet.level}
              equipped={equippedObj}
              skin={data.activeSkin?.fx ?? null}
              size={128}
              hero
              ring={highestEquippedRarity || false}
              ariaLabel={`${data.pet.name || data.pet.speciesLabel}, level ${data.pet.level}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {data.pet.speciesLabel}
            </div>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold px-2 py-1 rounded-md border border-border bg-background"
                />
                <button
                  type="button"
                  onClick={saveName}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName(data.pet?.name ?? "");
                    setEditingName(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">{data.pet.name}</h2>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              Level {data.pet.level} of {data.pet.maxLevel} · {data.totalXp} XP earned ·
              hatched {formatDate(data.pet.hatchedAt)}
            </div>
            {/* S90 — XP-to-next-level bar. Hidden at max level. */}
            {data.pet.nextLevelXp != null && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {Math.max(0, data.pet.nextLevelXp - data.totalXp)} XP to level {data.pet.level + 1}
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.round((data.totalXp / data.pet.nextLevelXp) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {/* S89 — link to the XP shop. Lives next to the pet
                preview so spending XP is one click away from
                seeing the pet you're dressing up.
                S94 — also link to /me/progress for the dashboard. */}
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Link
                to="/shop"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Browse shop
              </Link>
              <Link
                to="/me/progress"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <BarChart3 className="w-3 h-3" />
                My progress
              </Link>
              <Link
                to="/explore/pets"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                See others' pets
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 mb-8 text-center">
          <Egg className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Your pet is still in its egg.</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.totalXp} / {data.hatchThresholdXp} XP — earn{" "}
            {Math.max(0, data.hatchThresholdXp - data.totalXp)} more XP to hatch.
          </p>
        </div>
      )}

      {/* S100 — evolution chain preview. Renders only after hatch
          since pre-hatch users see the egg-to-hatch progress bar
          above instead. */}
      {data.pet && (
        <div className="mb-8">
          <EvolutionChain pet={data.pet} totalXp={data.totalXp} />
        </div>
      )}

      {/* Phase L — Skins. Owned-first, then shop. Hidden when there's
          no pet yet (skin only makes sense once something's hatched). */}
      {data.pet && (() => {
        // Build the full ordered list: owned skins first (with the
        // equipped one bubbled to the front), then shop skins the user
        // doesn't yet own. Keeps the equipped state immediately visible.
        const ownedSlugs = new Set(data.ownedSkins.map((s) => s.slug));
        const activeSlug = data.activeSkin?.slug ?? "default";
        const owned = [...data.ownedSkins].sort((a, b) => {
          if (a.slug === activeSlug) return -1;
          if (b.slug === activeSlug) return 1;
          return 0;
        });
        const unowned = (skinShop?.items ?? [])
          .filter((it) => !ownedSlugs.has(it.slug))
          .map<PetSkinDef>((it) => ({
            slug: it.slug,
            name: it.name,
            rarity: it.rarity,
            obtain: "xp",
            xpCost: it.xpCost,
            description: it.description,
            fx: it.fx,
          }));
        const allTiles = [...owned, ...unowned];
        if (allTiles.length === 0) return null;
        return (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Skins ({data.ownedSkins.length} owned)</h2>
              {skinShop && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Balance: {skinShop.balance.toLocaleString()} XP
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allTiles.map((skin) => (
                <SkinTile
                  key={skin.slug}
                  skin={skin}
                  previewSpecies={data.pet?.species}
                  previewSpeciesEmoji={data.pet?.levelEmoji}
                  previewLevel={data.pet?.level}
                  owned={ownedSlugs.has(skin.slug)}
                  equipped={skin.slug === activeSlug}
                  onClick={() => handleSkinClick(skin)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Inventory by slot */}
      <h2 className="text-sm font-semibold mb-3">Inventory ({data.inventory.length})</h2>
      {data.inventory.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cosmetics yet. Professors and TAs can grant cosmetics to recognize good work.
        </p>
      ) : (
        <div className="space-y-5">
          {(["head", "eyes", "accessory"] as CosmeticSlot[]).map((slot) => {
            const items = grouped[slot];
            if (items.length === 0) return null;
            return (
              <section key={slot}>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  {slot}
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <CosmeticChip
                      key={item.id}
                      slug={item.slug}
                      name={item.name}
                      emoji={item.emoji}
                      slot={item.slot}
                      rarity={item.rarity}
                      description={
                        item.grantedNote
                          ? `“${item.grantedNote}” — ${item.description}`
                          : item.description
                      }
                      equipped={item.equipped}
                      onClick={data.pet ? () => toggleEquip(item) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
