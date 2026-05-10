// S98 — Profile cosmetic gallery.
//
// Companion to AchievementsGallery. Renders the full catalog as a
// grid; owned items show full-color, unowned items grayed out with
// a hint about how to obtain them. Equipped items get a thin glow
// ring so visitors see what's actually on the user's pet right now.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CosmeticGalleryItem, CosmeticGalleryResponse } from "@axiomic/types";
import { api } from "../../lib/api";
import { Skeleton } from "../ui";

interface CosmeticsGalleryProps {
  username: string;
}

const RARITY_RING: Record<string, string> = {
  common: "ring-border",
  rare: "ring-blue-500/40",
  epic: "ring-purple-500/40",
  legendary: "ring-amber-500/40",
};

export function CosmeticsGallery({ username }: CosmeticsGalleryProps) {
  const [data, setData] = useState<CosmeticGalleryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.pet
      .galleryFor(username)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    return () => { cancelled = true; };
  }, [username]);

  if (error) return null; // silent; not blocking
  if (!data) return <Skeleton variant="card" className="h-32" />;

  return (
    <div>
      <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {data.items.map((item) => (
          <CosmeticCell key={item.slug} item={item} />
        ))}
      </ul>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3">
        Hover for details. Earn missing items by{" "}
        <Link to="/shop" className="text-primary hover:underline">
          spending XP
        </Link>{" "}
        or via instructor grants + competition prizes.
      </p>
    </div>
  );
}

function CosmeticCell({ item }: { item: CosmeticGalleryItem }) {
  const ring = RARITY_RING[item.rarity] ?? "ring-border";
  const tooltip = [
    item.name,
    item.description,
    !item.owned
      ? item.obtainability === "shop"
        ? "Buy in the XP shop"
        : "Earn via grant or competition"
      : item.equipped
        ? "Equipped"
        : "Owned",
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <li
      title={tooltip}
      className={`aspect-square rounded-md border border-border flex items-center justify-center text-2xl ${
        item.owned ? "" : "opacity-30 grayscale"
      } ${item.equipped ? `ring-2 ${ring}` : ""}`}
    >
      {item.emoji ?? "🎁"}
    </li>
  );
}
