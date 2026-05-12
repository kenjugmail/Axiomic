// S89 / Phase 5 — XP shop, redesigned to match the prototype.
//
// Spend lifetime XP on cosmetics and skins. Featured/discount logic
// preserved; lifetime XP never decreases. The page is now organized
// as a balance card + one card per slot (Head/Eyes/Accessory/Skins),
// each holding ShopRow components instead of the prior tile grid.
//
// Backed by the existing /me/pet/shop and /me/pet/skin-shop endpoints.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Check, Sparkles } from "lucide-react";
import type {
  CosmeticSlot,
  MyPetResponse,
  ShopItem,
  ShopResponse,
  SkinShopItem,
  SkinShopResponse,
} from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";
import { CosmeticGlyphSVG } from "../components/pet/CosmeticGlyphSVG";
import { PetAvatar } from "../components/pet/PetAvatar";
import { RarityBadge } from "../components/pet/RarityBadge";
import { ObtainabilityCallout } from "../components/pet/ObtainabilityCallout";

const SLOT_LABEL: Record<CosmeticSlot, string> = {
  head: "Head",
  eyes: "Eyes",
  accessory: "Accessory",
};
const SLOT_HELP: Record<CosmeticSlot, string> = {
  head: "Worn on top — caps, crowns, wreaths.",
  eyes: "Glasses, monocles, eye effects.",
  accessory: "Held or worn beside — books, mugs, trophies.",
};

// Below this balance we surface a non-judgmental "almost there" note
// so low-balance learners see context, not a paywall.
const LOW_BAL_THRESHOLD = 200;

export function ShopPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ShopResponse | null>(null);
  const [skinShop, setSkinShop] = useState<SkinShopResponse | null>(null);
  const [me, setMe] = useState<MyPetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [shop, skins, mine] = await Promise.all([
        api.pet.shop(),
        api.pet.skinShop().catch(() => null),
        api.pet.me().catch(() => null),
      ]);
      setData(shop);
      setSkinShop(skins);
      setMe(mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    if (!user) return;
    void reload();
  }, [user]);

  const buy = async (item: ShopItem) => {
    if (item.owned || !item.affordable) return;
    const cost = item.effectiveCost;
    if (!confirm(`Spend ${cost} XP on ${item.name}?`)) return;
    setBusy(item.slug);
    try {
      const r = await api.pet.buy({ cosmeticSlug: item.slug });
      const saved =
        r.wasFeatured && r.amountSpent != null ? item.xpCost - r.amountSpent : 0;
      toast.success(
        saved > 0
          ? `Got ${item.name}! Saved ${saved} XP — balance: ${r.balance}`
          : `Got ${item.name}! Balance: ${r.balance} XP`,
      );
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Buy failed");
    } finally {
      setBusy(null);
    }
  };

  const buySkin = async (item: SkinShopItem) => {
    if (item.owned || !item.affordable) return;
    if (!confirm(`Spend ${item.xpCost} XP on the ${item.name} skin?`)) return;
    setBusy(`skin:${item.slug}`);
    try {
      await api.pet.buySkin(item.slug);
      toast.success(`Got the ${item.name} skin!`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Buy failed");
    } finally {
      setBusy(null);
    }
  };

  const itemsBySlot = useMemo<Record<CosmeticSlot, ShopItem[]>>(() => {
    const empty: Record<CosmeticSlot, ShopItem[]> = {
      head: [],
      eyes: [],
      accessory: [],
    };
    if (!data) return empty;
    for (const it of data.items) {
      empty[it.slot]?.push(it);
    }
    return empty;
  }, [data]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to spend XP.</p>
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
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  const balance = data.balance;
  const lowBalance = balance < LOW_BAL_THRESHOLD;
  const featuredDiscount = data.featuredDiscountPercent;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div
          className="text-[11px] font-semibold tracking-widest uppercase mb-1"
          style={{ color: "var(--ink-3)" }}
        >
          XP Shop
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">XP Shop</h1>
        <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--ink-3)" }}>
          Cosmetics in exchange for XP. Some items are grant- or
          competition-only — those say so plainly.
        </p>
      </div>

      {/* Balance card — pet preview on the left, balance on the right. */}
      <section
        className="rounded-2xl border mb-6 overflow-hidden"
        style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
      >
        <div
          className="px-6 py-5 grid items-center gap-4"
          style={{ gridTemplateColumns: "auto 1fr auto" }}
        >
          {me?.pet ? (
            <PetAvatar
              species={me.pet.species}
              level={me.pet.level}
              equipped={buildEquippedFromInventory(me.inventory)}
              skin={me.activeSkin?.fx ?? null}
              size={72}
              showCosmetics
            />
          ) : (
            <div
              className="rounded-full"
              style={{ width: 72, height: 72, background: "var(--bg-sunk)" }}
            />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {me?.pet ? `${me.pet.name || me.pet.speciesLabel}'s shop` : "XP Shop"}
            </h2>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              No real-money purchases, ever. Some items are grant- or
              competition-only — those say so plainly.
            </p>
            {featuredDiscount > 0 && data.featuredSlug && (
              <div className="text-xs mt-2 inline-flex items-center gap-1.5">
                <Sparkles
                  className="w-3 h-3"
                  style={{ color: "var(--r-legendary)" }}
                />
                Today's discount: <strong>−{featuredDiscount}%</strong> on the
                featured item.
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className="text-[11px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--ink-3)" }}
            >
              Balance
            </div>
            <div
              className="font-mono tabular-nums text-2xl font-semibold mt-0.5"
              style={{ color: lowBalance ? "var(--warn)" : "var(--ink)" }}
            >
              {balance.toLocaleString()} XP
            </div>
          </div>
        </div>
        {lowBalance && (
          <div
            className="px-6 py-3 text-sm flex items-center gap-2.5"
            style={{
              borderTop: "1px solid var(--line)",
              background: "var(--accent-soft)",
            }}
          >
            <Sparkles className="w-4 h-4 flex-none" />
            <span>
              You're a little short for some items today. A couple
              assignments and a quiz this week would put a few rares in reach
              — items don't expire.
            </span>
          </div>
        )}
      </section>

      {(["head", "eyes", "accessory"] as CosmeticSlot[]).map((slot) => {
        const items = itemsBySlot[slot];
        if (!items || items.length === 0) return null;
        return (
          <section
            key={slot}
            className="rounded-2xl border mb-6 overflow-hidden"
            style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
          >
            <header
              className="px-6 py-4"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <h3 className="text-base font-semibold">
                {SLOT_LABEL[slot]} items
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                {SLOT_HELP[slot]}
              </p>
            </header>
            <div className="px-6 py-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {items.map((item) => (
                <ShopRow
                  key={item.slug}
                  item={item}
                  busy={busy === item.slug}
                  onBuy={() => buy(item)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {skinShop && skinShop.items.length > 0 && (
        <section
          className="rounded-2xl border mb-6 overflow-hidden"
          style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
        >
          <header
            className="px-6 py-4"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <h3 className="text-base font-semibold">Skins</h3>
            <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
              Color, glow, transparency. One equipped at a time. Default is always free.
            </p>
          </header>
          <div className="px-6 py-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {skinShop.items.map((sk) => (
              <ShopSkinRow
                key={sk.slug}
                item={sk}
                pet={me?.pet ?? null}
                busy={busy === `skin:${sk.slug}`}
                onBuy={() => buySkin(sk)}
              />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-center" style={{ color: "var(--ink-4)" }}>
        Looking for a granted or competition-only item?{" "}
        <Link to="/me/inventory" className="underline">
          Open your inventory
        </Link>{" "}
        or visit{" "}
        <Link to="/me/pet" className="underline">
          /me/pet
        </Link>
        .
      </p>
    </div>
  );
}

function ShopRow({
  item,
  busy,
  onBuy,
}: {
  item: ShopItem;
  busy: boolean;
  onBuy: () => void;
}) {
  return (
    <div
      className="grid items-start gap-3 p-3 rounded-xl"
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg-elev)",
        gridTemplateColumns: "auto 1fr auto",
      }}
    >
      <div
        className="grid place-items-center rounded-xl"
        style={{
          width: 56,
          height: 56,
          background: "var(--bg-sunk)",
          border: "1px solid var(--line)",
        }}
      >
        <CosmeticGlyphSVG
          slug={item.slug}
          rarity={item.rarity}
          size={40}
          tone={item.owned ? "muted" : "full"}
        />
      </div>
      <div className="min-w-0">
        <div
          className="font-medium text-sm"
          style={{ color: "var(--ink)" }}
        >
          {item.name}
        </div>
        <div className="flex gap-2 mt-1 flex-wrap">
          <RarityBadge rarity={item.rarity} />
          <ObtainabilityCallout obtain="xp" cost={item.effectiveCost} />
          {item.featured && !item.owned && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: "var(--r-legendary)",
                color: "var(--accent-ink)",
              }}
            >
              Featured
            </span>
          )}
        </div>
        {item.description && (
          <p
            className="text-xs mt-1.5 italic"
            style={{ color: "var(--ink-3)" }}
          >
            {item.description}
          </p>
        )}
      </div>
      {/* Phase 9D — Buy/Owned column lives on its own row centerline so
          it never visually collides with the wrapping metadata flex. */}
      <div style={{ alignSelf: "center" }}>
        {item.owned ? (
          <button
            type="button"
            disabled
            className="pet-btn"
            style={{ minWidth: 84 }}
          >
            <Check className="w-3 h-3" /> Owned
          </button>
        ) : item.affordable ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="pet-btn primary"
          >
            {busy
              ? "Buying…"
              : (
                <>
                  Buy
                  {item.featured && (
                    <span className="ml-1 line-through opacity-70 text-xs">
                      {item.xpCost}
                    </span>
                  )}
                </>
              )}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="pet-btn"
            title={`Need more XP`}
          >
            <Lock className="w-3 h-3" />
            Not enough
          </button>
        )}
      </div>
    </div>
  );
}

function ShopSkinRow({
  item,
  pet,
  busy,
  onBuy,
}: {
  item: SkinShopItem;
  pet: MyPetResponse["pet"];
  busy: boolean;
  onBuy: () => void;
}) {
  return (
    <div
      className="grid items-start gap-3 p-3 rounded-xl"
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg-elev)",
        gridTemplateColumns: "auto 1fr auto",
      }}
    >
      <div
        className="rounded-full grid place-items-center overflow-hidden"
        style={{
          width: 64,
          height: 64,
          background: "var(--bg-sunk)",
          border: "1px solid var(--line)",
        }}
      >
        <PetAvatar
          species={pet?.species ?? "fox"}
          level={pet?.level ?? 1}
          equipped={{}}
          skin={item.fx ?? null}
          size={58}
          showCosmetics={false}
        />
      </div>
      <div className="min-w-0">
        <div
          className="font-medium text-sm"
          style={{ color: "var(--ink)" }}
        >
          {item.name}
        </div>
        <div className="flex gap-2 mt-1 flex-wrap">
          <RarityBadge rarity={item.rarity} />
          <ObtainabilityCallout obtain="xp" cost={item.xpCost} />
        </div>
        {item.description && (
          <p
            className="text-xs mt-1.5 italic"
            style={{ color: "var(--ink-3)" }}
          >
            {item.description}
          </p>
        )}
      </div>
      <div style={{ alignSelf: "center" }}>
        {item.owned ? (
          <button
            type="button"
            disabled
            className="pet-btn"
            style={{ minWidth: 84 }}
          >
            <Check className="w-3 h-3" /> Owned
          </button>
        ) : item.affordable ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="pet-btn primary"
          >
            {busy ? "Buying…" : `Buy · ${item.xpCost} XP`}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="pet-btn"
            title={`Need more XP`}
          >
            <Lock className="w-3 h-3" />
            Not enough
          </button>
        )}
      </div>
    </div>
  );
}

// Helper duplicated from MyPetPage; small enough to inline rather
// than hoisting to a shared util.
function buildEquippedFromInventory(
  inventory: MyPetResponse["inventory"],
) {
  const equipped = inventory.filter((i) => i.equipped);
  return {
    head: equipped.find((i) => i.slot === "head") ?? null,
    eyes: equipped.find((i) => i.slot === "eyes") ?? null,
    acc: equipped.find((i) => i.slot === "accessory") ?? null,
  };
}
