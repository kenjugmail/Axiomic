// S86 — "My pet" — pet preview at the top, inventory grid below.
// Click a cosmetic to equip; another click unequips. Rename input
// is inline with the pet preview.

import { useEffect, useState } from "react";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { Link } from "react-router-dom";
import { Pencil, Egg, Sparkles, BarChart3 } from "lucide-react";
import type { CosmeticSlot, MyPetResponse, PetInventoryItem, PetSkinDef, SkinShopResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { Skeleton } from "../components/ui";
import { PetAvatar } from "../components/pet/PetAvatar";
import { PetSilhouetteSVG } from "../components/pet/PetSilhouetteSVG";
import { PetSwapStrip } from "../components/pet/PetSwapStrip";
import { EvolutionChain } from "../components/pet/EvolutionChain";
import { CosmeticChip } from "../components/pet/CosmeticChip";
import { SkinTile } from "../components/pet/SkinTile";
import { toast } from "../stores/toast";

export function MyPetPage() {
  const { user } = useAuthStore();
  const rhythmicGrid = useThemeStore((s) => s.rhythmicGrid);
  const [data, setData] = useState<MyPetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  // Phase L — skin shop list (everything available, owned + unowned).
  // The catalog read is public so we don't gate it on auth, and the
  // skin shop response includes owned/affordable flags computed
  // server-side.
  const [skinShop, setSkinShop] = useState<SkinShopResponse | null>(null);
  // Phase M — one-shot hatch-burst flag, toggled by the WebSocket
  // pet_hatched notification. The CSS keyframe runs for 800ms;
  // we clear the flag at 900ms so a second hatch can fire it again.
  const [hatchBurst, setHatchBurst] = useState(false);
  // Phase N — which pet the skin grid is editing. Defaults to the
  // active pet; users with 2+ pets can switch via the per-pet tab strip
  // above the skin grid. Null means "no pet selected yet" (pre-hatch).
  const [skinTargetPetId, setSkinTargetPetId] = useState<string | null>(null);
  // Per-tab in-flight set, keyed by pet id, to prevent overlapping
  // mutations from desyncing the optimistic activeSkinSlug state.
  const [skinBusyPetId, setSkinBusyPetId] = useState<string | null>(null);

  // Phase M — listen for pet_hatched notifications and pop the burst.
  // Other notification kinds are ignored at this surface.
  useLiveEvents({
    onEvent: (e) => {
      if (e.kind !== "notification") return;
      if (e.notification.kind !== "pet_hatched") return;
      setHatchBurst(true);
      // Reload to surface the new pet (when a SECOND pet hatches the
      // server emits this; the active-pet UI updates).
      void reload();
      window.setTimeout(() => setHatchBurst(false), 900);
    },
  });

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
      // First load: snap the skin-equip target to the active pet.
      // Subsequent reloads keep whatever the user picked, unless
      // the previously-selected pet was deleted.
      setSkinTargetPetId((prev) => {
        if (prev && r.pets.some((p) => p.id === prev)) return prev;
        return r.pet?.id ?? null;
      });
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
  // Phase N — equip targets `skinTargetPetId` so users with multiple
  // pets can dress each one independently. We disable while a per-pet
  // mutation is in flight so back-to-back clicks don't desync.
  const handleSkinClick = async (skin: PetSkinDef) => {
    if (!data?.pet || !skinTargetPetId) return;
    const targetPet = data.pets.find((p) => p.id === skinTargetPetId);
    if (!targetPet) return;
    if (skinBusyPetId === skinTargetPetId) return;
    const owned = data.ownedSkins.some((s) => s.slug === skin.slug);
    const isEquippedOnTarget = targetPet.activeSkinSlug === skin.slug;
    setSkinBusyPetId(skinTargetPetId);
    try {
      if (isEquippedOnTarget) {
        if (skin.slug === "default") return; // can't unequip default
        await api.pet.skinUnequip(skinTargetPetId);
        await reload();
        return;
      }
      if (owned) {
        await api.pet.skinEquip(skin.slug, skinTargetPetId);
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
      await api.pet.skinEquip(skin.slug, skinTargetPetId);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSkinBusyPetId(null);
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

      {/* Pet preview / hatching prompt — Phase M adopts the pet-hero-split
          layout from the design (1.1fr / 1fr two-column at desktop, collapses
          to single column on mobile via pet-tokens.css). */}
      {data.pet ? (
        <div className="pet-hero-split mb-8">
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PetAvatar
              species={data.pet.species}
              level={data.pet.level}
              equipped={equippedObj}
              skin={data.activeSkin?.fx ?? null}
              size={128}
              hero
              ring={highestEquippedRarity || false}
              aboutToEvolve={
                data.pet.nextLevelXp != null &&
                data.totalXp >= 0.85 * data.pet.nextLevelXp
              }
              hatchBurst={hatchBurst}
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
                  className="pet-btn primary"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName(data.pet?.name ?? "");
                    setEditingName(false);
                  }}
                  className="pet-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-semibold">{data.pet.name}</h2>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {/* Phase M — skin-pill shows the active skin's name next to the
                    pet name. Adopts the design's .skin-pill styling. */}
                {data.activeSkin && data.activeSkin.slug !== "default" && (
                  <span className="skin-pill">{data.activeSkin.name}</span>
                )}
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
        // Phase X — auto-hatch on signup means data.pet is normally
        // non-null. This is a defensive fallback if hatching didn't
        // complete server-side (e.g., transient DB error); a reload
        // usually fixes it.
        <div className="rounded-lg border border-dashed border-border p-6 mb-8 text-center">
          <Egg className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Hatching your pet…</p>
          <p className="text-xs text-muted-foreground mt-1">
            Refresh if your pet doesn't appear in a moment.
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
          no pet yet (skin only makes sense once something's hatched).
          Phase N — tabs above the grid let users with 2+ pets pick
          which one they're equipping. The "equipped" pip on each tile
          resolves against the *selected* pet, not the user's active. */}
      {data.pet && (() => {
        const targetPet = data.pets.find((p) => p.id === skinTargetPetId)
          ?? data.pets.find((p) => p.isActive)
          ?? data.pets[0];
        if (!targetPet) return null;
        const ownedSlugs = new Set(data.ownedSkins.map((s) => s.slug));
        const activeSlug = targetPet.activeSkinSlug || "default";
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
        const showPetTabs = data.pets.length >= 2;
        return (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold">
                Skins ({data.ownedSkins.length} owned)
              </h2>
              {skinShop && (
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                >
                  Balance: {skinShop.balance.toLocaleString()} XP
                </span>
              )}
            </div>
            {showPetTabs && (
              <div
                role="tablist"
                aria-label="Equip skin on pet"
                className="flex flex-wrap gap-2 mb-3"
              >
                {data.pets.map((p) => {
                  const active = p.id === targetPet.id;
                  const busy = skinBusyPetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={`skin-pet-tab-${p.id}`}
                      onClick={() => setSkinTargetPetId(p.id)}
                      disabled={busy}
                      className="pet-btn"
                      style={{
                        borderRadius: 999,
                        fontSize: 11,
                        padding: "4px 10px",
                        borderColor: active ? "var(--accent)" : "var(--line)",
                        background: active ? "var(--accent-soft)" : "var(--bg-elev)",
                        color: active ? "var(--ink)" : "var(--ink-3)",
                      }}
                    >
                      <span
                        className="inline-block"
                        style={{ width: 20, height: 20 }}
                      >
                        <PetSilhouetteSVG species={p.species} level={p.level} />
                      </span>
                      <span className="font-medium">
                        {p.name || p.speciesLabel}
                      </span>
                      {p.isActive && (
                        <span className="text-[9px] uppercase tracking-wider text-primary">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="skin-grid">
              {allTiles.map((skin) => (
                <SkinTile
                  key={skin.slug}
                  skin={skin}
                  previewSpecies={targetPet.species}
                  previewLevel={targetPet.level}
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
                {/* Phase M — .cos-grid.rhythmic lets legendary tiles span 2x2
                    and epic span 2x1 (design's masonry behavior).
                    Phase N — toggleable via Settings → Design preferences. */}
                <div className={`cos-grid${rhythmicGrid ? " rhythmic" : ""}`}>
                  {items.map((item) => (
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
