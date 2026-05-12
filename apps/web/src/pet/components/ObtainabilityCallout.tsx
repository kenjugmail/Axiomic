// Phase M — ObtainabilityCallout.
//
// Small pill that surfaces how to obtain an unowned cosmetic / skin.
// Modes:
//   - xp    → "{cost} XP" with --accent dot
//   - grant → "Instructor grant" with --ok dot
//   - comp  → "Competition prize" with --warn dot
//
// Used in CosmeticChip (when unowned) and SkinTile to replace the
// previous string-based hint logic.

export type Obtain = "xp" | "grant" | "comp" | "default";

interface ObtainabilityCalloutProps {
  obtain: Obtain;
  cost?: number | null;
  className?: string;
}

export function ObtainabilityCallout({
  obtain,
  cost,
  className,
}: ObtainabilityCalloutProps): JSX.Element | null {
  if (obtain === "default") {
    // Skins-only — the "Original" skin is permanently owned. No callout
    // needed; render nothing so callers can drop it cleanly.
    return null;
  }
  const label =
    obtain === "xp"
      ? cost != null
        ? `${cost.toLocaleString()} XP`
        : "XP shop"
      : obtain === "grant"
        ? "Instructor grant"
        : "Competition prize";
  return (
    <span
      className={`obtain ${obtain}${className ? ` ${className}` : ""}`}
      aria-label={`Obtainable via ${label}`}
    >
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}
