// S89 — XP shop. Spend lifetime XP on cosmetics that ship with a
// non-null xpCost. Owned items appear with a muted "Owned" badge;
// affordability gates the buy button. Lifetime XP stays untouched
// — only the spendable balance moves.
//
// Phase X — migrated to the .pet-shop / .cos-grid / .cos-tile /
// .pet-btn design system. Tiles now share the same warm-paper look
// as /me/pet and /skins; rarity coloring + faded-unowned state are
// handled by pet-tokens.css (.cos-tile.{rarity} + .cos-tile.unowned).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Check } from "lucide-react";
import type { ShopItem, ShopResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";
import { CosmeticGlyphSVG } from "../components/pet/CosmeticGlyphSVG";

export function ShopPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ShopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await api.pet.shop();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    if (!user) return;
    reload();
  }, [user]);

  const buy = async (item: ShopItem) => {
    if (item.owned || !item.affordable) return;
    const cost = item.effectiveCost;
    if (!confirm(`Spend ${cost} XP on ${item.emoji ?? ""} ${item.name}?`)) return;
    setBusy(item.slug);
    try {
      const r = await api.pet.buy({ cosmeticSlug: item.slug });
      // S95 — surface the discount in the toast when it applied.
      const saved = r.wasFeatured && r.amountSpent != null ? item.xpCost - r.amountSpent : 0;
      toast.success(
        saved > 0
          ? `Got ${item.name}! Saved ${saved} XP — balance: ${r.balance}`
          : `Got ${item.name}! Balance: ${r.balance} XP`,
      );
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Buy failed");
    } finally {
      setBusy(null);
    }
  };

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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-20 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  return (
    <div className="pet-shop max-w-3xl mx-auto px-4 py-8">
      <div className="mb-3 text-xs text-muted-foreground">
        <Link to="/me/pet" className="hover:text-foreground">My pet</Link>
        {" / shop"}
      </div>

      <div className="pet-balance mb-6">
        <div>
          <div className="label">Spendable balance</div>
          <div className="amount tabular-nums">
            {data.balance.toLocaleString()}{" "}
            <span style={{ fontSize: 14, color: "var(--ink-3)" }}>XP</span>
          </div>
        </div>
        <div className="note">
          Lifetime XP on the leaderboard never decreases — only spendable balance moves.
        </div>
      </div>

      <h1
        className="mb-3"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        Cosmetic shop
      </h1>

      {data.items.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--ink-3)" }}>
          No cosmetics for sale. Earn the rest via instructor grants or competition prizes.
        </p>
      ) : (
        <ul className="cos-grid">
          {data.items.map((item) => {
            const classes = [
              "cos-tile",
              item.rarity,
              item.owned ? "unowned" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={item.slug} className={classes}>
                {item.featured && !item.owned && (
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "var(--r-legendary)",
                      color: "var(--accent-ink)",
                      boxShadow: "0 1px 2px rgba(0,0,0,.15)",
                    }}
                  >
                    Featured −{data.featuredDiscountPercent}%
                  </span>
                )}
                <span className="corner">{item.rarity}</span>
                <div className="glyph">
                  <CosmeticGlyphSVG
                    slug={item.slug}
                    rarity={item.rarity}
                    size={48}
                    tone={item.owned ? "muted" : "full"}
                  />
                </div>
                <div className="nm">{item.name}</div>
                <span className="obtain xp">
                  <span className="dot" />
                  {item.slot}
                </span>
                <div style={{ marginTop: "auto", paddingTop: 6, width: "100%" }}>
                  {item.owned ? (
                    <button
                      type="button"
                      disabled
                      className="pet-btn"
                      style={{ width: "100%" }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Owned
                    </button>
                  ) : item.affordable ? (
                    <button
                      type="button"
                      onClick={() => buy(item)}
                      disabled={busy === item.slug}
                      className="pet-btn primary"
                      style={{ width: "100%" }}
                    >
                      {busy === item.slug ? (
                        "Buying…"
                      ) : (
                        <>
                          Spend {item.effectiveCost} XP
                          {item.featured && (
                            <span style={{ textDecoration: "line-through", opacity: 0.6, marginLeft: 4 }}>
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
                      title={`Need ${item.effectiveCost - data.balance} more XP`}
                      className="pet-btn"
                      style={{ width: "100%" }}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {item.effectiveCost} XP
                      {item.featured && (
                        <span style={{ textDecoration: "line-through", opacity: 0.6, marginLeft: 4 }}>
                          {item.xpCost}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
