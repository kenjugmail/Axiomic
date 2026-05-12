// Phase M — CosmeticGlyphSVG.
//
// Renders the SVG glyph for a given cosmetic slug. Three tiers:
//   1. lucide-react icon (preferred — already in our deps, ~30 cosmetics)
//   2. Inline SVG (~13 cosmetics without a clean lucide match)
//   3. Rarity-tinted initial disc (catch-all fallback — keeps unknown
//      slugs visible + on-theme)
//
// `tone="muted"` lowers opacity + grayscales for unowned tiles in
// someone else's gallery. PetAvatar passes through the rarity so the
// fallback disc gets the right tint.

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  Backpack,
  Bandage,
  BookOpen,
  Coffee,
  Compass,
  Crown,
  Eye,
  Flame,
  FlaskConical,
  Flower2,
  Gem,
  Glasses,
  Globe,
  GraduationCap,
  HardHat,
  Headphones,
  Heart,
  Leaf,
  Lightbulb,
  Microscope,
  PenLine,
  Pencil,
  Ribbon,
  Rocket,
  Scroll,
  Sparkles,
  Star,
  Telescope,
  Trophy,
} from "lucide-react";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type GlyphTone = "full" | "muted";

interface CosmeticGlyphSVGProps {
  slug: string;
  rarity?: Rarity;
  size?: number;
  tone?: GlyphTone;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

// ─── Lucide registry ───────────────────────────────────────────

// Each entry maps a slug to a lucide icon component. The component's
// stroke is `currentColor` so it inherits the surrounding CSS color.
const LUCIDE_GLYPH: Record<string, LucideIcon> = {
  // Grandfathered 15 (existing cosmetics):
  "grad-cap": GraduationCap,
  crown: Crown,
  ribbon: Ribbon,
  glasses: Glasses,
  "gold-star": Star,
  gem: Gem,
  trophy: Trophy,
  book: BookOpen,
  rocket: Rocket,
  fire: Flame,
  // New 28:
  "paper-crown": Crown,
  "lab-cap": HardHat,
  wildflower: Flower2,
  "study-headphones": Headphones,
  "starry-eyes": Sparkles,
  "third-eye": Eye,
  "heart-lenses": Heart,
  "sharp-pencil": Pencil,
  "office-hours-mug": Coffee,
  microscope: Microscope,
  "diploma-scroll": Scroll,
  "quill-inkwell": PenLine,
  "brass-telescope": Telescope,
  "field-backpack": Backpack,
  "pocket-globe": Globe,
  "brass-compass": Compass,
  "lab-flask": FlaskConical,
  "study-bandana": Bandage,
  "golden-leaf": Leaf,
  "firefly-jar": Lightbulb,
  "honor-roll-halo": Award,
  // Treat `tiny-antlers` as inline (better silhouette than any lucide match).
};

// ─── Inline SVG registry ──────────────────────────────────────

// All inline SVGs use a 24x24 viewBox + currentColor stroke/fill so they
// behave identically to lucide icons (size prop, color inheritance).
type SVGFn = (size: number) => JSX.Element;

const INLINE_GLYPH: Record<string, SVGFn> = {
  "top-hat": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="13" rx="0.5" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <line x1="4" y1="20" x2="20" y2="20" strokeWidth="1.2" />
      <rect x="6" y="11" width="12" height="2" fill="currentColor" opacity="0.25" stroke="none" />
    </svg>
  ),
  "baseball-cap": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14 Q5 8 12 8 Q19 8 19 14 Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M5 14 Q5 17 2 17 L2 15 Q5 14 5 14" fill="currentColor" fillOpacity="0.25" />
      <line x1="5" y1="14" x2="19" y2="14" />
      <circle cx="12" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  sunglasses: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="7" height="6" rx="2" fill="currentColor" fillOpacity="0.35" />
      <rect x="14" y="9" width="7" height="6" rx="2" fill="currentColor" fillOpacity="0.35" />
      <line x1="10" y1="11" x2="14" y2="11" />
      <line x1="1" y1="10" x2="3" y2="10" />
      <line x1="21" y1="10" x2="23" y2="10" />
    </svg>
  ),
  goggles: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
      <circle cx="17" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
      <line x1="11" y1="12" x2="13" y2="12" />
      <path d="M3 10 Q1 8 2 6" />
      <path d="M21 10 Q23 8 22 6" />
    </svg>
  ),
  rose: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 Q9 7 12 10 Q15 7 12 4 Z" fill="currentColor" fillOpacity="0.4" />
      <path d="M12 10 Q8 12 9 14 Q12 13 12 10 Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M12 10 Q16 12 15 14 Q12 13 12 10 Z" fill="currentColor" fillOpacity="0.3" />
      <line x1="12" y1="13" x2="12" y2="21" />
      <path d="M12 17 Q14 15 16 17" />
    </svg>
  ),
  "study-cap": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14 Q4 7 12 7 Q20 7 20 14 L20 16 L4 16 Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M4 16 L20 16" />
      <path d="M9 7 Q9 4 12 4 Q15 4 15 7" strokeWidth="1.2" />
    </svg>
  ),
  "winter-beanie": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 16 Q5 6 12 6 Q19 6 19 16 Z" fill="currentColor" fillOpacity="0.2" />
      <line x1="5" y1="16" x2="19" y2="16" />
      <line x1="5" y1="18" x2="19" y2="18" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" fillOpacity="0.4" />
      <line x1="9" y1="9" x2="9" y2="15" strokeWidth="0.8" opacity="0.5" />
      <line x1="12" y1="8" x2="12" y2="15" strokeWidth="0.8" opacity="0.5" />
      <line x1="15" y1="9" x2="15" y2="15" strokeWidth="0.8" opacity="0.5" />
    </svg>
  ),
  "laurel-wreath": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12 Q4 6 8 4" />
      <path d="M6 12 Q5 14 4 14" />
      <path d="M7 9 Q5 9 4 11" />
      <path d="M7 6 Q6 6 5 8" />
      <path d="M18 12 Q20 6 16 4" />
      <path d="M18 12 Q19 14 20 14" />
      <path d="M17 9 Q19 9 20 11" />
      <path d="M17 6 Q18 6 19 8" />
      <path d="M6 12 Q12 18 18 12" strokeWidth="1.2" />
    </svg>
  ),
  "tiny-antlers": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 18 L8 10 L5 7" />
      <path d="M8 12 L4 10" />
      <path d="M8 14 L5 13" />
      <path d="M16 18 L16 10 L19 7" />
      <path d="M16 12 L20 10" />
      <path d="M16 14 L19 13" />
    </svg>
  ),
  monocle: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="11" r="5" fill="currentColor" fillOpacity="0.18" />
      <line x1="14" y1="14" x2="18" y2="21" />
      <line x1="14" y1="15" x2="20" y2="15" strokeWidth="0.8" opacity="0.6" />
    </svg>
  ),
  eyepatch: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9 L18 9 L17 16 L7 16 Z" fill="currentColor" fillOpacity="0.55" />
      <path d="M6 9 Q4 7 3 4" />
      <path d="M18 9 Q20 7 21 4" />
    </svg>
  ),
  "pixel-visor": (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.6" strokeLinecap="square" strokeLinejoin="miter">
      <rect x="3" y="9" width="3" height="6" />
      <rect x="6" y="9" width="3" height="6" fillOpacity="0.6" />
      <rect x="9" y="9" width="3" height="6" />
      <rect x="12" y="9" width="3" height="6" fillOpacity="0.6" />
      <rect x="15" y="9" width="3" height="6" />
      <rect x="18" y="9" width="3" height="6" fillOpacity="0.6" />
    </svg>
  ),
  // Tiny antlers + honor-roll-halo could also have inline. Halo is via
  // Award (lucide) — works. Top-hat replaces emoji.
};

// ─── Initial-disc fallback (rarity-tinted) ────────────────────

function FallbackDisc({
  slug,
  rarity,
  size,
}: {
  slug: string;
  rarity: Rarity;
  size: number;
}): JSX.Element {
  const initial = (slug || "?").charAt(0).toUpperCase();
  return (
    <span
      className={`cos-overlay-fallback rar-${rarity}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.55),
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────

export function CosmeticGlyphSVG({
  slug,
  rarity = "common",
  size = 24,
  tone = "full",
  className,
  style,
  title,
}: CosmeticGlyphSVGProps): JSX.Element {
  const toneStyle: CSSProperties =
    tone === "muted"
      ? { opacity: 0.42, filter: "grayscale(1)", ...style }
      : (style ?? {});
  const wrapperStyle: CSSProperties = {
    display: "inline-grid",
    placeItems: "center",
    lineHeight: 1,
    ...toneStyle,
  };

  // Tier 1 — lucide.
  const Lucide = LUCIDE_GLYPH[slug];
  if (Lucide) {
    return (
      <span className={className} style={wrapperStyle} title={title}>
        <Lucide size={size} strokeWidth={1.6} />
      </span>
    );
  }

  // Tier 2 — inline SVG registry.
  const Inline = INLINE_GLYPH[slug];
  if (Inline) {
    return (
      <span className={className} style={wrapperStyle} title={title}>
        {Inline(size)}
      </span>
    );
  }

  // Tier 3 — rarity-tinted initial disc.
  return (
    <span className={className} style={wrapperStyle} title={title}>
      <FallbackDisc slug={slug} rarity={rarity} size={size} />
    </span>
  );
}
