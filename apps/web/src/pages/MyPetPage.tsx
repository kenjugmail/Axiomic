// S86 — "My pet". Phase 1 of the prototype migration:
// hero matches the design with chips, action buttons, and modal-driven
// Rename + Switch + Preview level-up. Skins + inventory sections from
// Phase L–N are preserved below the hero.

import { useEffect, useState } from "react";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { Link } from "react-router-dom";
import { Egg, Sparkles } from "lucide-react";
import type { MyPetResponse, PetInventoryItem, PetSkinDef, SkinShopResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import {
  PetAvatar,
  PetSilhouetteSVG,
  PetSVG,
  EvolutionChain,
  SkinTile,
  PetActionsRow,
  usePetAction,
  PetWhereCard,
  RenameMomentModal,
  SwitchPetModal,
  CosmeticChip,
  petMoments,
} from "../pet";
import { toast } from "../stores/toast";

export function MyPetPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<MyPetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skinShop, setSkinShop] = useState<SkinShopResponse | null>(null);
  // Phase M — one-shot hatch-burst flag, toggled by the WebSocket
  // pet_hatched notification. The CSS keyframe runs for 800ms;
  // we clear the flag at 900ms so a second hatch can fire it again.
  const [hatchBurst, setHatchBurst] = useState(false);
  // Phase N — which pet the skin grid is editing. Defaults to the
  // active pet; users with 2+ pets can switch via the per-pet tab strip.
  const [skinTargetPetId, setSkinTargetPetId] = useState<string | null>(null);
  const [skinBusyPetId, setSkinBusyPetId] = useState<string | null>(null);

  // Phase 1 — pet action animation + modal control.
  const [petAction, triggerAction] = usePetAction();
  const [renameOpen, setRenameOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [hatchingAnother, setHatchingAnother] = useState(false);

  // Phase M — listen for pet_hatched notifications and pop the burst.
  useLiveEvents({
    onEvent: (e) => {
      if (e.kind !== "notification") return;
      if (e.notification.kind !== "pet_hatched") return;
      setHatchBurst(true);
      void reload();
      window.setTimeout(() => setHatchBurst(false), 900);
    },
  });

  const reload = async () => {
    const r = await api.pet.me();
    setData(r);
    try {
      const shop = await api.pet.skinShop();
      setSkinShop(shop);
    } catch {
      // shop is optional; the owned-skins grid still renders without it
    }
  };

  // Phase 9 — inline cosmetic picker: click a tile to equip; click
  // Phase 11E — single-pet users see the "Hatch another" CTA in
  // the action row; this handler fires the hatch + reload.
  const hatchAnotherPet = async () => {
    if (hatchingAnother) return;
    setHatchingAnother(true);
    try {
      const r = await api.pet.hatchAnother();
      toast.success(`Hatched a ${r.pet?.species ?? "new pet"}!`);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't hatch");
    } finally {
      setHatchingAnother(false);
    }
  };

  // an already-equipped tile to take it off. Reload after each
  // mutation so the pet hero updates immediately.
  const toggleEquip = async (item: PetInventoryItem) => {
    try {
      if (item.equipped) {
        await api.pet.unequip(item.slug);
        toast.info(`Removed ${item.name}`);
      } else {
        await api.pet.equip(item.slug);
        toast.success(`Equipped ${item.name}`);
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update");
    }
  };

  useEffect(() => {
    if (!user) return;
    api.pet.me().then((r) => {
      setData(r);
      setSkinTargetPetId((prev) => {
        if (prev && r.pets.some((p) => p.id === prev)) return prev;
        return r.pet?.id ?? null;
      });
    }).catch((e) => setError(e?.message ?? "Failed to load"));
    api.pet.skinShop().then(setSkinShop).catch(() => {
      // ignore — section just hides the locked tiles
    });
  }, [user]);

  // Phase L — skin equip/buy.
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
        if (skin.slug === "default") return;
        await api.pet.skinUnequip(skinTargetPetId);
        await reload();
        return;
      }
      if (owned) {
        await api.pet.skinEquip(skin.slug, skinTargetPetId);
        await reload();
        return;
      }
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
      // First non-default equip → reveal moment. The store animates
      // default → just-equipped for visual closure.
      if (skin.slug !== "default" && data.pet) {
        const equippedNow = buildEquippedFromInventory(data.inventory);
        petMoments.show({
          kind: "skin-reveal",
          pet: {
            species: targetPet.species,
            level: targetPet.level,
            maxLevel: data.pet.maxLevel,
            name: targetPet.name || targetPet.speciesLabel,
            speciesLabel: targetPet.speciesLabel,
          },
          equipped: equippedNow,
          skin,
        });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSkinBusyPetId(null);
    }
  };

  const commitRename = async (name: string) => {
    try {
      await api.pet.rename(name);
      setRenameOpen(false);
      toast.success(`Renamed to ${name}.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  const commitSwitch = async (petId: string) => {
    try {
      await api.pet.activate(petId);
      setSwitchOpen(false);
      const newActive = data?.pets.find((p) => p.id === petId);
      if (newActive) toast.success(`Switched to your ${newActive.name || newActive.speciesLabel}.`);
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

  const equippedItems = data.inventory.filter((i) => i.equipped);
  const equippedObj = {
    head: equippedItems.find((i) => i.slot === "head") ?? null,
    eyes: equippedItems.find((i) => i.slot === "eyes") ?? null,
    acc: equippedItems.find((i) => i.slot === "accessory") ?? null,
  };
  const RARITY_ORDER = ["common", "rare", "epic", "legendary"] as const;
  const highestEquippedRarity = equippedItems.reduce<typeof RARITY_ORDER[number] | null>(
    (acc, i) => {
      const r = (i.rarity ?? "common") as typeof RARITY_ORDER[number];
      if (acc === null) return r;
      return RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(acc) ? r : acc;
    },
    null,
  );

  // Phase 1 — XP progress bar. Compute progress within the current level
  // band (prev → next threshold) rather than absolute totalXp / nextLevelXp,
  // which gives a misleading pct on higher levels.
  const pet = data.pet;
  const atMaxLevel = pet ? pet.level >= pet.maxLevel : false;
  const prevThreshold = (() => {
    if (!pet) return 0;
    const entry = pet.evolutionChain.find((e) => e.level === pet.level);
    return entry?.threshold ?? 0;
  })();
  const nextThreshold = pet?.nextLevelXp ?? null;
  const xpInBand = Math.max(0, data.totalXp - prevThreshold);
  const xpBandSize = nextThreshold != null ? Math.max(1, nextThreshold - prevThreshold) : 1;
  const xpPct = nextThreshold != null
    ? Math.min(100, Math.round((xpInBand / xpBandSize) * 100))
    : 100;
  const xpToNext = nextThreshold != null
    ? Math.max(0, nextThreshold - data.totalXp)
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header — crumb + title + sub (matches the prototype's main-hd pattern). */}
      <div className="mb-6">
        <div
          className="text-[11px] font-semibold tracking-widest uppercase mb-1"
          style={{ color: "var(--ink-3)" }}
        >
          My Pet
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">My Pet</h1>
        <p
          className="mt-2 text-sm max-w-xl"
          style={{ color: "var(--ink-3)" }}
        >
          Identity, evolution progress, and the equip surface for your active pet.
        </p>
      </div>

      {/* Hero card */}
      {pet ? (
        <section
          className="rounded-2xl border mb-8 overflow-hidden"
          style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
        >
          <div className="flex flex-col md:flex-row gap-8 p-8 items-center">
            <div className="flex-shrink-0 flex justify-center">
              <PetAvatar
                species={pet.species}
                level={pet.level}
                equipped={equippedObj}
                skin={data.activeSkin?.fx ?? null}
                size={180}
                hero
                ring={highestEquippedRarity || false}
                action={petAction}
                aboutToEvolve={
                  pet.nextLevelXp != null &&
                  data.totalXp >= 0.85 * pet.nextLevelXp
                }
                hatchBurst={hatchBurst}
                ariaLabel={`${pet.name || pet.speciesLabel}, level ${pet.level}`}
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <div>
                <div
                  className="text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--ink-4)" }}
                >
                  Active pet
                </div>
                <h2
                  className="font-display text-3xl font-semibold mt-1 truncate"
                  style={{ letterSpacing: "-0.015em" }}
                  title={pet.name || pet.speciesLabel}
                >
                  {pet.name || pet.speciesLabel}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Chip>{pet.speciesLabel}</Chip>
                  <Chip>
                    <Sparkles className="w-3 h-3" />
                    Level {pet.level}
                    {atMaxLevel ? " · Final form" : ""}
                  </Chip>
                  <Chip mono>{data.totalXp.toLocaleString()} XP lifetime</Chip>
                  {data.activeSkin && data.activeSkin.slug !== "default" && (
                    <span className="skin-pill">{data.activeSkin.name}</span>
                  )}
                </div>
              </div>

              {nextThreshold != null ? (
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span
                      className="text-[12.5px] font-medium"
                      style={{ color: "var(--ink-3)" }}
                    >
                      Progress to level {pet.level + 1}
                    </span>
                    <span
                      className="text-[12.5px] font-mono tabular-nums"
                      style={{ color: "var(--ink-3)" }}
                    >
                      {xpInBand.toLocaleString()} / {xpBandSize.toLocaleString()} XP
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden border"
                    style={{
                      background: "var(--bg-sunk)",
                      borderColor: "var(--line)",
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${xpPct}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <div
                    className="text-[11.5px] mt-1.5"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {xpToNext.toLocaleString()} XP until the next evolution.
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    className="text-[12.5px] font-medium"
                    style={{ color: "var(--ink-3)" }}
                  >
                    Final evolution reached
                  </div>
                  <div
                    className="text-[11.5px] mt-1"
                    style={{ color: "var(--ink-4)" }}
                  >
                    Your pet is at its final form. Lifetime XP keeps climbing.
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  className="pet-btn"
                  onClick={() =>
                    petMoments.show({
                      kind: "level-up",
                      pet: {
                        species: pet.species,
                        level: pet.level,
                        maxLevel: pet.maxLevel,
                        name: pet.name || pet.speciesLabel,
                        speciesLabel: pet.speciesLabel,
                      },
                    })
                  }
                  disabled={atMaxLevel}
                  title={atMaxLevel ? "At final form" : "Preview the next evolution"}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Preview level-up
                </button>
                <PetActionsRow onAction={triggerAction} disabled={petAction !== null} />
                <button
                  type="button"
                  className="pet-btn ghost"
                  onClick={() => setRenameOpen(true)}
                >
                  Rename pet
                </button>
                <button
                  type="button"
                  className="pet-btn ghost"
                  onClick={() => {
                    // Phase 11E — for single-pet users this button
                    // triggers the hatch-another flow directly
                    // rather than opening the (empty) switch modal.
                    if (data.pets.length < 2) {
                      hatchAnotherPet();
                    } else {
                      setSwitchOpen(true);
                    }
                  }}
                  disabled={hatchingAnother}
                  title={
                    data.pets.length < 2
                      ? "Hatch another pet (costs nothing — pets share your XP)"
                      : "Switch which pet is active"
                  }
                >
                  {data.pets.length < 2 ? "Hatch another" : "Switch active pet"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        // Phase 11C — aspirational first-run state. Replaces the
        // bare "Hatching..." fallback with a welcome card that gives
        // new users somewhere to go while the auto-hatch finishes.
        <section
          className="rounded-2xl border mb-8 overflow-hidden"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg-elev)",
          }}
        >
          <div className="px-8 py-10 grid items-center gap-8 sm:grid-cols-[auto_1fr]">
            <div
              className="pet-stage"
              style={{ width: 140, height: 140 }}
              role="img"
              aria-label="Your egg, about to hatch"
            >
              <div className="pet" style={{ width: 110, height: 110 }}>
                <PetSVG species={undefined} level={1} size={110} />
              </div>
            </div>
            <div className="min-w-0">
              <div
                className="text-[11px] font-semibold tracking-widest uppercase mb-1"
                style={{ color: "var(--ink-3)" }}
              >
                Welcome
              </div>
              <h2 className="font-display text-2xl font-semibold leading-tight">
                Your egg is almost ready
              </h2>
              <p
                className="mt-2 text-sm max-w-md"
                style={{ color: "var(--ink-2)" }}
              >
                Pets auto-hatch a moment after signup. If you don't see
                yours yet, refresh in a few seconds — sometimes the egg
                takes its time.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/paths" className="pet-btn primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  Earn your first XP
                </Link>
                <Link to="/explore/pets" className="pet-btn ghost">
                  See community pets
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Where your pet appears — sizes preview. */}
      {pet && (
        <PetWhereCard
          species={pet.species}
          level={pet.level}
          equipped={equippedObj}
          skin={data.activeSkin?.fx ?? null}
          ring={highestEquippedRarity || false}
        />
      )}

      {/* Phase 9 — inline cosmetic picker. Lives right under the hero
          so users immediately see they can equip / unequip. Group
          inventory by slot; click a tile to equip; click the equipped
          tile to take it off. */}
      <section
        className="rounded-2xl border overflow-hidden mb-8"
        style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
      >
        <header
          className="px-6 py-4 flex items-baseline justify-between gap-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Cosmetics</h2>
            <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
              One item per slot. Click a tile to equip; click the equipped
              tile again to take it off.
            </p>
          </div>
          <Link
            to="/me/inventory"
            className="text-xs underline whitespace-nowrap"
            style={{ color: "var(--ink-3)" }}
          >
            Full inventory ({data.inventory.length}) →
          </Link>
        </header>
        <div className="px-6 py-5">
          {(["head", "eyes", "accessory"] as const).map((slotKey) => {
            const items = data.inventory.filter((i) => i.slot === slotKey);
            const label =
              slotKey === "head"
                ? "Head"
                : slotKey === "eyes"
                  ? "Eyes"
                  : "Accessory";
            const help =
              slotKey === "head"
                ? "Worn on top — caps, crowns, wreaths."
                : slotKey === "eyes"
                  ? "Glasses, monocles, eye effects."
                  : "Held or worn beside — books, mugs, trophies.";
            const equippedHere = items.find((i) => i.equipped) ?? null;
            return (
              <div key={slotKey} className="mb-6 last:mb-0">
                <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
                  <h3
                    className="text-[11px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {label} · {items.length}
                  </h3>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--ink-4)" }}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {equippedHere ? `Equipped: ${equippedHere.name}` : "Nothing equipped"}
                  </span>
                </div>
                <p className="text-[11.5px] mb-3" style={{ color: "var(--ink-4)" }}>
                  {help}
                </p>
                {items.length === 0 ? (
                  <div
                    className="text-xs px-3 py-3 rounded-lg border border-dashed flex items-center justify-between gap-3 flex-wrap"
                    style={{ borderColor: "var(--line)", color: "var(--ink-4)" }}
                  >
                    <span>No {label.toLowerCase()} items yet — earn via XP or instructor grant.</span>
                    <Link
                      to="/shop"
                      className="pet-btn ghost text-xs whitespace-nowrap"
                    >
                      Browse shop →
                    </Link>
                  </div>
                ) : (
                  <div className="cos-grid">
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
                        onClick={() => toggleEquip(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Evolution chain (existing Phase S100 surface, kept for the
          past/future-forms timeline). */}
      {pet && (
        <div className="mb-8">
          <EvolutionChain pet={pet} totalXp={data.totalXp} />
        </div>
      )}

      {/* Phase L/N — Skins section (existing). */}
      {pet && (() => {
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
        const ownsOnlyDefault =
          data.ownedSkins.length <= 1 &&
          data.ownedSkins.every((s) => s.slug === "default");
        return (
          <div className="mb-8">
            {/* Phase 10C — primary header pill now surfaces the active
                skin's name + rarity inline so the user sees what's on
                their pet without scrolling the grid. */}
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-sm font-semibold">
                  Skins ({data.ownedSkins.length} owned)
                </h2>
                {data.activeSkin && data.activeSkin.slug !== "default" && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      border: "1px solid color-mix(in oklab, var(--accent) 25%, var(--line))",
                    }}
                  >
                    Active: {data.activeSkin.name}
                    {data.activeSkin.rarity && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: `var(--r-${data.activeSkin.rarity})`,
                          display: "inline-block",
                        }}
                      />
                    )}
                  </span>
                )}
              </div>
              {skinShop && (
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                >
                  Balance: {skinShop.balance.toLocaleString()} XP
                </span>
              )}
            </div>
            {ownsOnlyDefault && (
              <div
                className="text-xs px-3 py-2 mb-3 rounded-lg border border-dashed flex items-center justify-between gap-3 flex-wrap"
                style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
              >
                <span>
                  You're on the Original skin. First color shift from 220 XP.
                </span>
                <Link
                  to="/skins"
                  className="pet-btn ghost text-xs whitespace-nowrap"
                >
                  Browse all skins →
                </Link>
              </div>
            )}
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
                      <span
                        className="font-medium truncate"
                        style={{ maxWidth: 110 }}
                        title={p.name || p.speciesLabel}
                      >
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

      {/* Modals */}
      {pet && (
        <>
          <RenameMomentModal
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            pet={{
              species: pet.species,
              level: pet.level,
              name: pet.name,
              speciesLabel: pet.speciesLabel,
            }}
            onCommit={commitRename}
          />
          <SwitchPetModal
            open={switchOpen}
            onClose={() => setSwitchOpen(false)}
            pets={data.pets.map((p) => ({
              id: p.id,
              species: p.species,
              speciesLabel: p.speciesLabel,
              level: p.level,
              name: p.name,
              isActive: p.isActive,
            }))}
            activePetId={pet.id}
            onCommit={commitSwitch}
          />
        </>
      )}
    </div>
  );
}

// Used by handleSkinClick to build the equipped triple at the moment
// the user clicks; this is needed because the SkinRevealMoment shows
// the *currently-equipped cosmetics* over the new skin.
function buildEquippedFromInventory(inventory: PetInventoryItem[]) {
  const equippedItems = inventory.filter((i) => i.equipped);
  return {
    head: equippedItems.find((i) => i.slot === "head") ?? null,
    eyes: equippedItems.find((i) => i.slot === "eyes") ?? null,
    acc: equippedItems.find((i) => i.slot === "accessory") ?? null,
  };
}

// Small chip primitive matching the prototype's `.chip` (rounded
// pill, muted bg, scoped via the pet tokens). Inline so we don't
// have to add another file for a 10-line component.
function Chip({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
      style={{
        background: "var(--bg-sunk)",
        color: "var(--ink-2)",
        borderColor: "var(--line)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}
