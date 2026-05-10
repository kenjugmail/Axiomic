// S86 — PetView.
//
// Renders a pet emoji + cosmetics in slot-relative positions on top.
// One emoji per slot (head/eyes/accessory). Pure presentational —
// no data fetching. Used everywhere a pet is shown (the user's own
// pet page, leaderboard rows, class roster, profile, etc.).
//
// The data model is designed so a future SVG renderer can drop in
// without touching callers — all consumers pass `species` +
// `equipped[]` and let this component decide how to render.

interface EquippedItem {
  slot: string;
  emoji: string | null;
  slug: string;
}

interface PetViewProps {
  speciesEmoji: string;
  equipped: EquippedItem[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const SIZE_PX: Record<NonNullable<PetViewProps["size"]>, number> = {
  xs: 24,
  sm: 36,
  md: 56,
  lg: 80,
  xl: 128,
};

// Position each cosmetic slot relative to the pet emoji's bounding
// box. Tuned by eye against system-emoji dimensions; small offsets
// keep the cosmetic "on" the pet rather than floating around it.
const SLOT_STYLE: Record<string, React.CSSProperties> = {
  head: {
    top: "-22%",
    left: "50%",
    transform: "translateX(-50%) rotate(-8deg)",
  },
  eyes: {
    top: "12%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  accessory: {
    bottom: "-8%",
    right: "-10%",
  },
};

// Cosmetic emoji is sized at ~50% of the base pet emoji so it reads
// clearly without dominating.
const COSMETIC_SCALE = 0.55;

export function PetView({ speciesEmoji, equipped, size = "md" }: PetViewProps) {
  const px = SIZE_PX[size];
  const cosmeticSize = Math.round(px * COSMETIC_SCALE);

  // De-dupe by slot. If the same slot has multiple equipped entries
  // (shouldn't happen — server enforces — but defensive), use the
  // last one.
  const bySlot = new Map<string, EquippedItem>();
  for (const e of equipped) bySlot.set(e.slot, e);

  return (
    <div
      style={{
        position: "relative",
        width: px,
        height: px,
        fontSize: px,
        lineHeight: 1,
        display: "inline-block",
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {speciesEmoji}
      </span>
      {[...bySlot.values()].map((c) => {
        if (!c.emoji) return null;
        const slotStyle = SLOT_STYLE[c.slot] ?? SLOT_STYLE.accessory;
        return (
          <span
            key={c.slug}
            title={c.slug}
            style={{
              position: "absolute",
              fontSize: cosmeticSize,
              lineHeight: 1,
              pointerEvents: "none",
              ...slotStyle,
            }}
          >
            {c.emoji}
          </span>
        );
      })}
    </div>
  );
}
