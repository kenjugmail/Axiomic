// S89 — XP shop. Spend lifetime XP on cosmetics that ship with a
// non-null xpCost. Owned items appear with a muted "Owned" badge;
// affordability gates the buy button. Lifetime XP stays untouched
// — only the spendable balance moves.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Lock, Check } from "lucide-react";
import type { ShopItem, ShopResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

const RARITY_BORDER: Record<string, string> = {
  common: "border-border",
  rare: "border-blue-500/40",
  epic: "border-purple-500/40",
  legendary: "border-amber-500/40",
};

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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-3 text-xs text-muted-foreground">
        <Link to="/me/pet" className="hover:text-foreground">My pet</Link>
        {" / shop"}
      </div>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 mb-6 flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Spendable balance</div>
          <div className="text-2xl font-semibold tabular-nums">
            {data.balance} <span className="text-base font-normal text-muted-foreground">XP</span>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-right max-w-[12rem]">
          Lifetime XP on the leaderboard never decreases — only spendable balance moves.
        </div>
      </div>

      <h1 className="font-display text-xl font-semibold tracking-tight mb-3">Cosmetic shop</h1>

      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No cosmetics for sale. Earn the rest via instructor grants or competition prizes.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.items.map((item) => {
            const rarityBorder = RARITY_BORDER[item.rarity] ?? "border-border";
            // S95 — featured cards get a colored ring + a corner
            // badge so the discount is unmissable.
            const featuredBorder = item.featured ? "ring-2 ring-amber-500/60 border-amber-500/40" : rarityBorder;
            return (
              <li
                key={item.slug}
                className={`relative p-4 rounded-md border ${featuredBorder} flex flex-col items-center text-center gap-2 ${
                  item.owned ? "opacity-60" : ""
                }`}
              >
                {item.featured && !item.owned && (
                  <span className="absolute -top-2 -right-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm">
                    Featured −{data.featuredDiscountPercent}%
                  </span>
                )}
                <div className="text-4xl py-2">{item.emoji ?? "🎁"}</div>
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {item.slot} · {item.rarity}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <div className="mt-auto pt-2 w-full">
                  {item.owned ? (
                    <button
                      type="button"
                      disabled
                      className="w-full text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground inline-flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Owned
                    </button>
                  ) : item.affordable ? (
                    <button
                      type="button"
                      onClick={() => buy(item)}
                      disabled={busy === item.slug}
                      className="w-full text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                    >
                      {busy === item.slug ? "Buying…" : (
                        <>
                          Spend {item.effectiveCost} XP
                          {item.featured && (
                            <span className="line-through opacity-60 ml-1">{item.xpCost}</span>
                          )}
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={`Need ${item.effectiveCost - data.balance} more XP`}
                      className="w-full text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground inline-flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {item.effectiveCost} XP
                      {item.featured && (
                        <span className="line-through opacity-60 ml-1">{item.xpCost}</span>
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
