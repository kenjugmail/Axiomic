// CosmeticGlyphSVG — Phase 8B (prototype parity).
//
// Bespoke 60×60 art ported from the prototype's cosmetics-svg.jsx
// for every cosmetic slug in the catalog. The Lucide-icon fallbacks
// from Phase M are gone — every slug now has a hand-drawn glyph
// matching the prototype hero card.
//
// Lookup order:
//   1. BESPOKE_GLYPH — 60×60 prototype art (the bulk).
//   2. FallbackDisc — rarity-tinted initial disc for unknown slugs.
//
// The 60×60 canvas matches the prototype anchor convention:
//   head:   centered around (30, 22)
//   eyes:   centered around (30, 30)
//   accBR:  centered around (30, 36)
//
// Stroke is `var(--pet-stroke, var(--ink))` so the line work adapts
// to theme; fills are named hex tints from the prototype so the
// glyphs keep their hand-drawn character across themes.

import type { CSSProperties } from "react";

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

const STROKE = "var(--pet-stroke, var(--ink))";
const SW = 2.2;
const sprops = {
  stroke: STROKE,
  strokeWidth: SW,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
};
const fprops = (fill: string) => ({ ...sprops, fill });

// ─────────────────────────────────────────────────────────────
// HEAD glyphs
// ─────────────────────────────────────────────────────────────

const GlyphStudyCap = () => (
  <g>
    <path {...fprops("#3a6ea5")} d="M 10 32 q 0 -16 20 -16 q 20 0 20 16 z" />
    <path {...fprops("#2a5680")} d="M 10 32 q 0 -10 20 -10 q 20 0 20 10 v 4 h -40 z" />
    <path {...sprops} d="M 30 16 v -4" />
    <circle cx="30" cy="11" r="1.8" fill={STROKE} stroke="none" />
    <path {...fprops("#2a5680")} d="M 30 32 h 18 q 4 0 4 4 h -22 z" />
  </g>
);

const GlyphBeanie = () => (
  <g>
    <path {...fprops("#9a5b3a")} d="M 12 36 q 0 -22 18 -22 q 18 0 18 22 z" />
    <path {...sprops} d="M 16 30 q 4 -8 14 -8 q 10 0 14 8" />
    <rect x="10" y="34" width="40" height="6" rx="1" {...fprops("#7a4528")} />
    <path {...sprops} d="M 30 14 q -1 -4 0 -8 q 1 4 0 8" />
    <circle cx="30" cy="6" r="3" {...fprops("#c98850")} />
  </g>
);

const GlyphMortarboard = () => (
  <g>
    <path {...fprops("#2a2a2a")} d="M 14 34 q 0 -2 4 -3 l 12 -2 l 12 2 q 4 1 4 3 v 2 q -6 4 -16 4 q -10 0 -16 -4 z" />
    <path {...fprops("#1a1a1a")} d="M 8 28 l 22 -8 l 22 8 l -22 8 z" />
    <path {...sprops} d="M 44 28 v 6" />
    <circle cx="44" cy="34" r="1.6" fill="#d8a04e" stroke="none" />
    <path {...sprops} stroke="#d8a04e" strokeWidth={1.6} d="M 44 34 q 4 4 8 6" />
  </g>
);

const GlyphCrown = () => (
  <g>
    <path {...fprops("#d8a04e")} d="M 12 38 L 14 22 L 22 30 L 30 18 L 38 30 L 46 22 L 48 38 Z" />
    <path {...sprops} d="M 12 38 h 36" />
    <circle cx="14" cy="22" r="2" fill="#7a3aa8" stroke={STROKE} strokeWidth={1.2} />
    <circle cx="30" cy="18" r="2.4" fill="#a8324a" stroke={STROKE} strokeWidth={1.2} />
    <circle cx="46" cy="22" r="2" fill="#2a6a7a" stroke={STROKE} strokeWidth={1.2} />
  </g>
);

const GlyphPaperCrown = () => (
  // Paper crown — duller, hand-folded variant. Same geometry, paper palette.
  <g>
    <path {...fprops("#e8d4a8")} d="M 12 38 L 14 22 L 22 30 L 30 18 L 38 30 L 46 22 L 48 38 Z" />
    <path {...sprops} d="M 12 38 h 36" />
    <path {...sprops} strokeWidth={1.2} d="M 22 30 v 8 M 38 30 v 8" />
  </g>
);

const GlyphLaurel = () => (
  <g>
    <path {...sprops} stroke="#5a7a3a" strokeWidth={1.8} d="M 14 14 q -2 16 14 26" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const angle = -40 + i * 8;
      const pos =
        i < 4
          ? { cx: 12 + i * 1.5, cy: 14 + i * 4 }
          : { cx: 18 + (i - 4) * 4, cy: 30 + (i - 4) * 3 };
      return (
        <ellipse
          key={`L${i}`}
          cx={pos.cx}
          cy={pos.cy}
          rx={5}
          ry={2.4}
          transform={`rotate(${angle} ${pos.cx} ${pos.cy})`}
          fill="#7a9b5a"
          stroke="#3a5a2a"
          strokeWidth={1.2}
        />
      );
    })}
    <path {...sprops} stroke="#5a7a3a" strokeWidth={1.8} d="M 46 14 q 2 16 -14 26" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const angle = 40 - i * 8;
      const pos =
        i < 4
          ? { cx: 48 - i * 1.5, cy: 14 + i * 4 }
          : { cx: 42 - (i - 4) * 4, cy: 30 + (i - 4) * 3 };
      return (
        <ellipse
          key={`R${i}`}
          cx={pos.cx}
          cy={pos.cy}
          rx={5}
          ry={2.4}
          transform={`rotate(${angle} ${pos.cx} ${pos.cy})`}
          fill="#7a9b5a"
          stroke="#3a5a2a"
          strokeWidth={1.2}
        />
      );
    })}
  </g>
);

const GlyphTopHat = () => (
  <g>
    <rect x="14" y="8" width="32" height="26" rx="1" {...fprops("#1a1a1a")} />
    <rect x="14" y="28" width="32" height="6" {...fprops("#3a3a3a")} />
    <path {...fprops("#1a1a1a")} d="M 6 34 h 48 q 2 0 2 3 q -10 4 -26 4 q -16 0 -26 -4 q 0 -3 2 -3 z" />
    <rect x="14" y="14" width="32" height="3" fill="#a8324a" stroke={STROKE} strokeWidth={1.2} />
  </g>
);

const GlyphHalo = () => (
  <g>
    <ellipse cx="30" cy="14" rx="20" ry="6" fill="none" stroke="#d8a04e" strokeWidth={2.2} />
    <ellipse cx="30" cy="14" rx="20" ry="6" fill="none" stroke="#f0c060" strokeWidth={1} opacity={0.7} />
    <ellipse cx="30" cy="13" rx="16" ry="2" fill="none" stroke="#f0c060" strokeWidth={0.8} opacity={0.5} />
  </g>
);

const GlyphLabHelmet = () => (
  <g>
    <path {...fprops("#e8e8e8")} d="M 12 18 q 0 -10 18 -10 q 18 0 18 10 z" />
    <path {...sprops} d="M 12 18 h 36" />
    <path {...fprops("#3a3a3a")} d="M 8 26 q 0 -2 4 -2 h 36 q 4 0 4 2 v 4 q 0 2 -4 2 h -36 q -4 0 -4 -2 z" />
    <circle cx="20" cy="28" r="6" {...fprops("#7ac1d5")} />
    <circle cx="40" cy="28" r="6" {...fprops("#7ac1d5")} />
    <circle cx="20" cy="28" r="2.6" fill="#fff" opacity={0.6} stroke="none" />
    <circle cx="40" cy="28" r="2.6" fill="#fff" opacity={0.6} stroke="none" />
  </g>
);

const GlyphFlower = () => (
  <g>
    <circle cx="30" cy="14" r="4" fill="#f0c060" stroke={STROKE} strokeWidth={1.4} />
    {[0, 72, 144, 216, 288].map((a) => {
      const x = 30 + Math.cos(((a - 90) * Math.PI) / 180) * 8;
      const y = 14 + Math.sin(((a - 90) * Math.PI) / 180) * 8;
      return (
        <ellipse
          key={a}
          cx={x}
          cy={y}
          rx={5}
          ry={3.5}
          transform={`rotate(${a} ${x} ${y})`}
          fill="#f6e0a8"
          stroke={STROKE}
          strokeWidth={1.4}
        />
      );
    })}
    <circle cx="30" cy="14" r="2.4" fill="#d8a04e" stroke="none" />
    <path {...sprops} stroke="#5a7a3a" strokeWidth={1.6} d="M 30 22 q -2 6 -8 8" />
    <ellipse cx="22" cy="30" rx="3.5" ry="1.8" transform="rotate(-30 22 30)" fill="#7a9b5a" stroke={STROKE} strokeWidth={1} />
  </g>
);

const GlyphHeadphones = () => (
  <g>
    <path {...sprops} strokeWidth={3} d="M 12 30 q 0 -18 18 -18 q 18 0 18 18" />
    <rect x="8" y="26" width="10" height="14" rx="3" {...fprops("#3a3a3a")} />
    <rect x="42" y="26" width="10" height="14" rx="3" {...fprops("#3a3a3a")} />
    <rect x="9" y="30" width="3" height="8" rx="1" fill="#d8a04e" stroke="none" />
    <rect x="48" y="30" width="3" height="8" rx="1" fill="#d8a04e" stroke="none" />
  </g>
);

const GlyphAntlers = () => (
  <g>
    <path {...fprops("#9a6b3a")} d="M 26 30 q -2 -10 -8 -14 q -2 -4 0 -8 q 4 0 6 4 q 4 4 6 12 z" />
    <path {...sprops} strokeWidth={1.6} d="M 22 18 q -4 -2 -6 -8 M 20 24 q -6 -2 -8 -8" />
    <path {...fprops("#9a6b3a")} d="M 34 30 q 2 -10 8 -14 q 2 -4 0 -8 q -4 0 -6 4 q -4 4 -6 12 z" />
    <path {...sprops} strokeWidth={1.6} d="M 38 18 q 4 -2 6 -8 M 40 24 q 6 -2 8 -8" />
  </g>
);

const GlyphBow = () => (
  <g>
    <path {...fprops("#d97c9c")} d="M 14 26 q 0 -6 6 -6 q 6 0 10 4 v 8 q -4 4 -10 4 q -6 0 -6 -6 z" />
    <path {...fprops("#d97c9c")} d="M 46 26 q 0 -6 -6 -6 q -6 0 -10 4 v 8 q 4 4 10 4 q 6 0 6 -6 z" />
    <rect x="27" y="22" width="6" height="14" rx="2" {...fprops("#b85a7c")} />
    <path {...sprops} strokeWidth={1.4} stroke="#b85a7c" d="M 18 24 v 8 M 42 24 v 8" />
  </g>
);

const GlyphBandana = () => (
  <g>
    <path {...fprops("#a8324a")} d="M 10 24 q 0 -4 4 -4 h 32 q 4 0 4 4 v 6 q -10 6 -20 6 q -10 0 -20 -6 z" />
    <circle cx="22" cy="26" r="1.6" fill="#f6e0a8" stroke="none" />
    <circle cx="30" cy="24" r="1.6" fill="#f6e0a8" stroke="none" />
    <circle cx="38" cy="26" r="1.6" fill="#f6e0a8" stroke="none" />
    <circle cx="26" cy="30" r="1.4" fill="#f6e0a8" stroke="none" />
    <circle cx="34" cy="30" r="1.4" fill="#f6e0a8" stroke="none" />
    <path {...fprops("#7a1f30")} d="M 46 22 l 8 -2 l -2 8 z" />
  </g>
);

const GlyphWizard = () => (
  <g>
    <path {...fprops("#3a3a8a")} d="M 30 4 L 18 40 h 24 z" />
    <path {...fprops("#2a2a6a")} d="M 18 40 h 24 v 4 h -24 z" />
    <path fill="#f6e0a8" stroke="none" d="M 30 14 l 1.6 3.4 l 3.6 0.4 l -2.6 2.4 l 0.8 3.6 l -3.4 -1.8 l -3.4 1.8 l 0.8 -3.6 l -2.6 -2.4 l 3.6 -0.4 z" />
    <circle cx="26" cy="28" r="1" fill="#f6e0a8" stroke="none" />
    <circle cx="34" cy="32" r="1" fill="#f6e0a8" stroke="none" />
  </g>
);

const GlyphLeaf = () => (
  <g>
    <path {...fprops("#5a7a3a")} d="M 30 8 q -14 8 -14 22 q 14 -2 14 -22 z" />
    <path {...fprops("#7a9b5a")} d="M 30 8 q 14 8 14 22 q -14 -2 -14 -22 z" />
    <path {...sprops} strokeWidth={1.4} d="M 30 8 v 24" />
    <path {...sprops} strokeWidth={1} d="M 30 16 q -4 1 -6 3 M 30 22 q -5 1 -8 3 M 30 16 q 4 1 6 3 M 30 22 q 5 1 8 3" />
  </g>
);

const GlyphFlame = () => (
  <g>
    <path {...fprops("#d97c3a")} d="M 30 6 q -8 8 -8 18 q 0 10 8 14 q 8 -4 8 -14 q 0 -10 -8 -18 z" />
    <path {...fprops("#e8a85a")} d="M 30 14 q -4 6 -4 12 q 0 6 4 10 q 4 -4 4 -10 q 0 -6 -4 -12 z" />
    <path fill="#fbe39a" stroke="none" d="M 30 22 q -2 4 -2 8 q 0 4 2 6 q 2 -2 2 -6 q 0 -4 -2 -8 z" />
  </g>
);

// ─────────────────────────────────────────────────────────────
// EYES glyphs
// ─────────────────────────────────────────────────────────────

const GlyphRoundGlasses = () => (
  <g>
    <circle cx="20" cy="30" r="9" {...sprops} />
    <circle cx="40" cy="30" r="9" {...sprops} />
    <path {...sprops} d="M 29 30 h 2" />
    <path {...sprops} d="M 11 28 l -4 -2" />
    <path {...sprops} d="M 49 28 l 4 -2" />
  </g>
);

const GlyphSunglasses = () => (
  <g>
    <path {...fprops("#1a1a1a")} d="M 10 26 q 0 -2 2 -2 h 14 q 2 0 2 2 v 6 q 0 4 -4 4 h -10 q -4 0 -4 -4 z" />
    <path {...fprops("#1a1a1a")} d="M 32 26 q 0 -2 2 -2 h 14 q 2 0 2 2 v 6 q 0 4 -4 4 h -10 q -4 0 -4 -4 z" />
    <path {...sprops} d="M 28 27 h 4" />
    <ellipse cx="17" cy="28" rx="3" ry="1.6" fill="#fff" opacity={0.3} stroke="none" />
    <ellipse cx="39" cy="28" rx="3" ry="1.6" fill="#fff" opacity={0.3} stroke="none" />
  </g>
);

const GlyphMonocle = () => (
  <g>
    <circle cx="22" cy="30" r="11" {...sprops} />
    <path {...sprops} d="M 33 33 q 2 6 -2 12" />
    <circle cx="31" cy="46" r="1.8" fill={STROKE} stroke="none" />
    <path {...sprops} stroke="#d8a04e" d="M 13 22 l -4 -2" />
  </g>
);

const GlyphStars = () => (
  <g>
    {[20, 40].map((cx, i) => (
      <path
        key={i}
        {...fprops("#d8a04e")}
        d={`M ${cx} 22 L ${cx + 2} 28 L ${cx + 8} 28 L ${cx + 3} 32 L ${cx + 5} 38 L ${cx} 34 L ${cx - 5} 38 L ${cx - 3} 32 L ${cx - 8} 28 L ${cx - 2} 28 Z`}
      />
    ))}
  </g>
);

const GlyphStarsSingle = () => (
  // Single-eye variant (for `gold-star` slug — a single big star).
  <g>
    <path
      {...fprops("#d8a04e")}
      d="M 30 12 L 33 24 L 46 24 L 36 32 L 40 46 L 30 38 L 20 46 L 24 32 L 14 24 L 27 24 Z"
    />
  </g>
);

const GlyphEyepatch = () => (
  <g>
    <path {...sprops} strokeWidth={1.6} d="M 6 22 q 12 -4 28 0" />
    <path {...sprops} strokeWidth={1.6} d="M 6 22 q 8 14 28 16" />
    <ellipse cx="20" cy="30" rx="10" ry="8" {...fprops("#1a1a1a")} />
    <path {...sprops} stroke="#d8a04e" strokeWidth={1} d="M 12 26 l 16 8" />
    <path {...sprops} stroke="#d8a04e" strokeWidth={1} d="M 28 26 l -16 8" />
    <circle cx="40" cy="30" r="2.4" fill={STROKE} stroke="none" />
  </g>
);

const GlyphThirdEye = () => (
  <g>
    <path {...fprops("#f6e0a8")} d="M 12 30 q 18 -16 36 0 q -18 16 -36 0 z" />
    <circle cx="30" cy="30" r="6" {...fprops("#7a3aa8")} />
    <circle cx="30" cy="30" r="2.6" fill={STROKE} stroke="none" />
    <circle cx="31.5" cy="28.5" r="1" fill="#fff" stroke="none" />
    {[0, 60, 120, 180, 240, 300].map((a) => (
      <line
        key={a}
        x1="30"
        y1="30"
        x2={30 + Math.cos((a * Math.PI) / 180) * 22}
        y2={30 + Math.sin((a * Math.PI) / 180) * 22}
        stroke="#d8a04e"
        strokeWidth={1}
        opacity={0.6}
        strokeDasharray="2 2"
      />
    ))}
  </g>
);

const GlyphGem = () => (
  // Reused palette from G_ThirdEye centerpiece — a faceted gem.
  <g>
    <path {...fprops("#7a3aa8")} d="M 18 22 L 30 12 L 42 22 L 30 46 Z" />
    <path {...fprops("#9a5ad8")} d="M 18 22 L 30 28 L 42 22" />
    <path {...sprops} d="M 30 12 v 16" />
    <path {...sprops} d="M 24 17 L 30 28 L 36 17" />
  </g>
);

const GlyphHeart = () => (
  <g>
    {[20, 40].map((cx, i) => (
      <path
        key={i}
        {...fprops("#d97c7c")}
        d={`M ${cx} 36 q -8 -6 -8 -12 q 0 -5 5 -5 q 3 0 3 4 q 0 -4 3 -4 q 5 0 5 5 q 0 6 -8 12 z`}
      />
    ))}
  </g>
);

const GlyphPixel = () => (
  <g>
    <rect x="10" y="24" width="40" height="12" rx="2" {...fprops("#1a1a1a")} />
    {[16, 22, 28, 36, 42, 48].map((x) => (
      <rect key={x} x={x} y="27" width="3" height="6" fill="#6ee7b7" stroke="none" />
    ))}
    <path {...sprops} d="M 8 26 l -2 -2 M 52 26 l 2 -2" />
  </g>
);

const GlyphReading = () => (
  <g>
    <ellipse cx="20" cy="30" rx="8" ry="6" {...fprops("rgba(255,255,255,.15)")} />
    <ellipse cx="40" cy="30" rx="8" ry="6" {...fprops("rgba(255,255,255,.15)")} />
    <path {...sprops} d="M 28 30 q 2 -2 4 0" />
    <path {...sprops} strokeWidth={1.6} d="M 12 30 l -3 -2 M 48 30 l 3 -2" />
    <rect x="14" y="22" width="12" height="2" {...fprops("#d8a04e")} stroke="none" />
    <rect x="34" y="22" width="12" height="2" {...fprops("#d8a04e")} stroke="none" />
  </g>
);

const GlyphSleepy = () => (
  <g>
    <path {...sprops} strokeWidth={2.4} d="M 14 28 q 6 4 12 0" />
    <path {...sprops} strokeWidth={2.4} d="M 34 28 q 6 4 12 0" />
    <path fill="#a8b2c4" stroke={STROKE} strokeWidth={1.2} d="M 40 12 l 8 0 l -8 8 l 8 0 l 0 2 l -10 0 l 0 -2 l 8 -8 l -6 0 z" />
  </g>
);

const GlyphLaser = () => (
  <g>
    <circle cx="20" cy="30" r="5" {...fprops("#1a1a1a")} />
    <circle cx="40" cy="30" r="5" {...fprops("#1a1a1a")} />
    <circle cx="20" cy="30" r="2" fill="#ff3a3a" stroke="none" />
    <circle cx="40" cy="30" r="2" fill="#ff3a3a" stroke="none" />
    <path stroke="#ff3a3a" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} d="M 20 30 L 8 38 M 40 30 L 52 38" />
  </g>
);

// ─────────────────────────────────────────────────────────────
// ACCESSORY glyphs
// ─────────────────────────────────────────────────────────────

const GlyphNotebook = () => (
  <g>
    <rect x="14" y="10" width="32" height="40" rx="2" {...fprops("#6a4528")} />
    <rect x="18" y="14" width="28" height="32" rx="1" {...fprops("#f6efde")} />
    <path {...sprops} stroke="#9a8a6a" strokeWidth={1} d="M 22 22 h 18 M 22 28 h 18 M 22 34 h 14" />
    <rect x="14" y="10" width="4" height="40" {...fprops("#4a2e1a")} />
    <rect x="14" y="16" width="34" height="2" fill="#a8324a" stroke="none" />
  </g>
);

const GlyphPencil = () => (
  <g transform="rotate(-30 30 30)">
    <rect x="10" y="26" width="36" height="8" {...fprops("#d8a04e")} />
    <path {...fprops("#f0c060")} d="M 10 26 v 8" />
    <rect x="44" y="26" width="6" height="8" {...fprops("#d97c7c")} />
    <rect x="42" y="26" width="2" height="8" {...fprops("#a8a8a8")} />
    <path {...fprops("#f6e0a8")} d="M 10 26 L 4 30 L 10 34 Z" />
    <path {...fprops("#1a1a1a")} d="M 6 28.5 L 4 30 L 6 31.5 Z" />
  </g>
);

const GlyphMug = () => (
  <g>
    <path {...fprops("#e8e0d2")} d="M 14 18 h 24 v 22 q 0 6 -6 6 h -12 q -6 0 -6 -6 z" />
    <path {...sprops} d="M 38 24 q 8 0 8 6 q 0 6 -8 6" />
    <path {...sprops} stroke="#5a4a3a" strokeWidth={1} d="M 18 12 q 2 4 0 6 M 24 12 q 2 4 0 6 M 30 12 q 2 4 0 6" />
    <path {...fprops("#3a2818")} d="M 16 22 h 20 v 4 h -20 z" />
  </g>
);

const GlyphMicroscope = () => (
  <g>
    <path {...fprops("#3a3a3a")} d="M 22 8 h 6 v 12 h -6 z" />
    <rect x="20" y="20" width="10" height="6" {...fprops("#5a5a5a")} />
    <path {...fprops("#5a5a5a")} d="M 30 14 q 10 0 10 10 v 10 h -4 v -8 q 0 -8 -6 -8 z" />
    <rect x="14" y="34" width="32" height="4" {...fprops("#3a3a3a")} />
    <path {...fprops("#5a5a5a")} d="M 12 38 h 36 q 2 0 2 2 v 6 q 0 2 -2 2 h -36 q -2 0 -2 -2 v -6 q 0 -2 2 -2 z" />
    <rect x="22" y="26" width="6" height="6" fill="#d8e8f0" stroke={STROKE} strokeWidth={1.4} />
  </g>
);

const GlyphTrophy = () => (
  <g>
    <path {...fprops("#d8a04e")} d="M 18 12 h 24 v 12 q 0 8 -12 8 q -12 0 -12 -8 z" />
    <path {...sprops} d="M 18 16 h -4 q -2 0 -2 2 v 2 q 0 4 6 4" />
    <path {...sprops} d="M 42 16 h 4 q 2 0 2 2 v 2 q 0 4 -6 4" />
    <rect x="26" y="32" width="8" height="6" {...fprops("#b08038")} />
    <rect x="20" y="38" width="20" height="6" rx="1" {...fprops("#b08038")} />
    <path {...sprops} stroke="#7a5828" strokeWidth={1} d="M 24 18 q 6 4 12 0" />
  </g>
);

const GlyphScroll = () => (
  <g>
    <ellipse cx="30" cy="12" rx="18" ry="3" {...fprops("#c8a878")} />
    <path {...fprops("#f6efde")} d="M 12 12 v 30 q 0 6 18 6 q 18 0 18 -6 v -30" />
    <ellipse cx="30" cy="42" rx="18" ry="3" {...fprops("#c8a878")} />
    <path {...sprops} stroke="#9a8a6a" strokeWidth={1} d="M 18 22 h 24 M 18 28 h 24 M 18 34 h 18" />
    <circle cx="30" cy="12" r="2" {...fprops("#a8324a")} />
  </g>
);

const GlyphQuill = () => (
  <g transform="rotate(-12 30 30)">
    <path {...fprops("#f6efde")} d="M 30 6 q 8 8 10 22 q 0 8 -4 14 q -4 -2 -6 -8 q -1 -16 0 -28 z" />
    <path {...sprops} stroke="#9a8a6a" strokeWidth={1} d="M 30 12 q 4 6 4 14 M 30 18 q 4 6 4 12 M 30 24 q 3 4 3 8" />
    <path {...fprops("#3a2818")} d="M 28 42 l -6 12 l 8 -4 z" />
    <circle cx="20" cy="50" r="3" {...fprops("#1a1a3a")} />
  </g>
);

const GlyphTelescope = () => (
  <g transform="rotate(-20 30 30)">
    <path {...fprops("#b08038")} d="M 8 26 l 6 -2 v 12 l -6 -2 z" />
    <rect x="14" y="24" width="14" height="12" {...fprops("#d8a04e")} />
    <rect x="28" y="22" width="14" height="16" {...fprops("#b08038")} />
    <rect x="42" y="20" width="10" height="20" rx="2" {...fprops("#8a5a28")} />
    <circle cx="47" cy="30" r="3" {...fprops("#1a3a5a")} />
    <path {...fprops("#3a3a3a")} d="M 26 36 v 8 h 4 v -8 z" />
    <rect x="20" y="42" width="16" height="4" rx="1" {...fprops("#3a3a3a")} />
  </g>
);

const GlyphBackpack = () => (
  <g>
    <path {...fprops("#7a9b5a")} d="M 14 18 h 32 v 30 q 0 4 -4 4 h -24 q -4 0 -4 -4 z" />
    <path {...sprops} d="M 20 18 v -6 q 0 -4 10 -4 q 10 0 10 4 v 6" />
    <rect x="22" y="26" width="16" height="14" rx="2" {...fprops("#5a7a3a")} />
    <circle cx="30" cy="33" r="2" fill="#d8a04e" stroke={STROKE} strokeWidth={1} />
    <rect x="18" y="46" width="24" height="2" fill="#3a5a2a" stroke="none" />
  </g>
);

const GlyphGlobe = () => (
  <g>
    <circle cx="30" cy="28" r="14" {...fprops("#7ac1d5")} />
    <path {...sprops} strokeWidth={1.4} d="M 18 28 q 12 -6 24 0 q -12 6 -24 0" />
    <path {...sprops} strokeWidth={1.4} d="M 30 14 q -6 14 0 28 M 30 14 q 6 14 0 28" />
    <path {...fprops("#7a9b5a")} stroke="#3a5a2a" strokeWidth={1.2} d="M 20 24 q 4 -2 6 0 q 2 4 -2 4 q -4 0 -4 -4 z" />
    <path {...fprops("#7a9b5a")} stroke="#3a5a2a" strokeWidth={1.2} d="M 34 30 q 4 -2 6 0 q 2 4 -2 4 q -4 0 -4 -4 z" />
    <rect x="26" y="42" width="8" height="3" {...fprops("#3a3a3a")} />
    <path {...fprops("#3a3a3a")} d="M 22 45 h 16 v 4 h -16 z" />
  </g>
);

const GlyphLantern = () => (
  <g>
    <path {...sprops} d="M 30 6 v 4 M 24 10 h 12" />
    <path {...fprops("#a8324a")} d="M 18 14 h 24 v 4 h -24 z" />
    <path {...fprops("#d8a04e")} d="M 18 18 q 0 22 12 22 q 12 0 12 -22 z" />
    <path {...sprops} stroke="#a8324a" strokeWidth={1.4} d="M 22 18 v 22 M 30 18 v 22 M 38 18 v 22" />
    <path {...fprops("#a8324a")} d="M 18 38 h 24 v 4 h -24 z" />
    <path {...sprops} d="M 22 42 v 6 M 38 42 v 6" />
  </g>
);

const GlyphFlask = () => (
  <g>
    <path {...sprops} strokeWidth={2} d="M 24 12 v 10 l -10 18 q -2 6 4 6 h 24 q 6 0 4 -6 l -10 -18 v -10" />
    <path {...fprops("#7ac1d5")} d="M 16 34 l 28 0 l 4 8 q 2 4 -2 4 h -32 q -4 0 -2 -4 z" />
    <circle cx="22" cy="38" r="1.4" fill="#fff" stroke="none" opacity={0.6} />
    <circle cx="34" cy="40" r="1" fill="#fff" stroke="none" opacity={0.6} />
    <rect x="22" y="8" width="12" height="4" rx="1" {...fprops("#7a4528")} />
  </g>
);

const GlyphCompass = () => (
  <g>
    <circle cx="30" cy="30" r="14" {...fprops("#e8d8a8")} />
    <circle cx="30" cy="30" r="14" {...sprops} strokeWidth={1.6} />
    <path fill="#a8324a" stroke={STROKE} strokeWidth={1} d="M 30 18 L 33 30 L 30 28 L 27 30 z" />
    <path fill="#3a5a8a" stroke={STROKE} strokeWidth={1} d="M 30 42 L 33 30 L 30 32 L 27 30 z" />
    <circle cx="30" cy="30" r="1.6" fill={STROKE} stroke="none" />
    <text x="30" y="22" fontSize={4} textAnchor="middle" fill={STROKE} fontFamily="serif">N</text>
  </g>
);

const GlyphFirefly = () => (
  <g>
    <circle cx="18" cy="20" r="3" fill="#fbe39a" stroke="none" opacity={0.5} />
    <circle cx="18" cy="20" r="1.4" fill="#fff8d8" stroke="none" />
    <circle cx="42" cy="34" r="4" fill="#fbe39a" stroke="none" opacity={0.5} />
    <circle cx="42" cy="34" r="1.8" fill="#fff8d8" stroke="none" />
    <circle cx="30" cy="46" r="3" fill="#fbe39a" stroke="none" opacity={0.5} />
    <circle cx="30" cy="46" r="1.4" fill="#fff8d8" stroke="none" />
    <circle cx="48" cy="14" r="2" fill="#fbe39a" stroke="none" opacity={0.5} />
    <circle cx="48" cy="14" r="0.9" fill="#fff8d8" stroke="none" />
    <path {...sprops} strokeWidth={0.8} opacity={0.5} d="M 18 20 q 8 6 14 14 q 6 8 10 0" />
  </g>
);

const GlyphMedal = () => (
  <g>
    <path {...fprops("#a8324a")} d="M 22 8 l 4 14 h 8 l 4 -14 h -4 l -4 8 l -4 -8 z" />
    <circle cx="30" cy="34" r="12" {...fprops("#d8a04e")} />
    <circle cx="30" cy="34" r="9" {...fprops("#e8b85a")} />
    <path fill="#a8324a" stroke="none" d="M 30 28 l 1.6 3.4 l 3.6 0.4 l -2.6 2.4 l 0.8 3.6 l -3.4 -1.8 l -3.4 1.8 l 0.8 -3.6 l -2.6 -2.4 l 3.6 -0.4 z" />
  </g>
);

const GlyphCardStack = () => (
  <g>
    <rect x="12" y="42" width="36" height="6" rx="1" {...fprops("#a8324a")} />
    <path {...sprops} strokeWidth={0.8} d="M 14 45 h 32" />
    <rect x="14" y="34" width="32" height="6" rx="1" {...fprops("#3a5a8a")} />
    <path {...sprops} strokeWidth={0.8} d="M 16 37 h 28" />
    <rect x="16" y="26" width="28" height="6" rx="1" {...fprops("#5a7a3a")} />
    <path {...sprops} strokeWidth={0.8} d="M 18 29 h 24" />
    <rect x="18" y="18" width="24" height="6" rx="1" {...fprops("#d8a04e")} />
    <path {...sprops} strokeWidth={0.8} d="M 20 21 h 20" />
    <path fill="#a8324a" stroke="none" d="M 28 10 l 4 0 l 0 8 l -2 -2 l -2 2 z" />
  </g>
);

const GlyphRose = () => (
  <g>
    <path {...fprops("#d97c9c")} d="M 30 14 q -6 4 -6 10 q 0 6 6 10 q 6 -4 6 -10 q 0 -6 -6 -10 z" />
    <path {...fprops("#e8a4b8")} d="M 30 18 q -3 3 -3 7 q 0 4 3 6 q 3 -2 3 -6 q 0 -4 -3 -7 z" />
    <path {...sprops} stroke="#5a7a3a" strokeWidth={1.6} d="M 30 34 v 18" />
    <ellipse cx="22" cy="42" rx="5" ry="2.4" transform="rotate(-30 22 42)" fill="#7a9b5a" stroke="#3a5a2a" strokeWidth={1.2} />
    <ellipse cx="38" cy="46" rx="5" ry="2.4" transform="rotate(30 38 46)" fill="#7a9b5a" stroke="#3a5a2a" strokeWidth={1.2} />
  </g>
);

const GlyphBook = () => GlyphNotebook(); // alias — `book` slug uses the notebook art.

const GlyphRocket = () => (
  <g>
    <path {...fprops("#e8e8e8")} d="M 30 6 q 8 8 8 22 v 12 h -16 v -12 q 0 -14 8 -22 z" />
    <circle cx="30" cy="22" r="4" {...fprops("#7ac1d5")} />
    <path {...fprops("#a8324a")} d="M 22 30 l -6 8 l 6 0 z" />
    <path {...fprops("#a8324a")} d="M 38 30 l 6 8 l -6 0 z" />
    <path {...fprops("#d97c3a")} d="M 24 42 q 0 6 6 8 q 6 -2 6 -8 z" />
    <path {...fprops("#fbe39a")} d="M 26 46 q 0 4 4 6 q 4 -2 4 -6 z" />
  </g>
);

// ─────────────────────────────────────────────────────────────
// Slug → glyph component map
// ─────────────────────────────────────────────────────────────

type GlyphFn = () => JSX.Element;

const BESPOKE_GLYPH: Record<string, GlyphFn> = {
  // Head
  "study-cap": GlyphStudyCap,
  "winter-beanie": GlyphBeanie,
  "grad-cap": GlyphMortarboard,
  crown: GlyphCrown,
  "paper-crown": GlyphPaperCrown,
  "laurel-wreath": GlyphLaurel,
  "top-hat": GlyphTopHat,
  "honor-roll-halo": GlyphHalo,
  "lab-cap": GlyphLabHelmet,
  goggles: GlyphLabHelmet, // shares the helmet+goggles silhouette
  wildflower: GlyphFlower,
  "study-headphones": GlyphHeadphones,
  "tiny-antlers": GlyphAntlers,
  ribbon: GlyphBow,
  "study-bandana": GlyphBandana,
  "wizard-hat": GlyphWizard,
  "golden-leaf": GlyphLeaf,
  fire: GlyphFlame,
  "baseball-cap": GlyphStudyCap, // close enough silhouette
  // Eyes
  glasses: GlyphRoundGlasses,
  sunglasses: GlyphSunglasses,
  monocle: GlyphMonocle,
  "starry-eyes": GlyphStars,
  "gold-star": GlyphStarsSingle,
  eyepatch: GlyphEyepatch,
  "third-eye": GlyphThirdEye,
  gem: GlyphGem,
  "heart-lenses": GlyphHeart,
  "pixel-visor": GlyphPixel,
  "reading-specs": GlyphReading,
  "sleepy-eyes": GlyphSleepy,
  "laser-visor": GlyphLaser,
  // Accessory
  book: GlyphBook,
  "sharp-pencil": GlyphPencil,
  "office-hours-mug": GlyphMug,
  microscope: GlyphMicroscope,
  trophy: GlyphTrophy,
  "diploma-scroll": GlyphScroll,
  "quill-inkwell": GlyphQuill,
  "brass-telescope": GlyphTelescope,
  "field-backpack": GlyphBackpack,
  "pocket-globe": GlyphGlobe,
  "study-lantern": GlyphLantern,
  "lab-flask": GlyphFlask,
  "brass-compass": GlyphCompass,
  "firefly-jar": GlyphFirefly,
  "honor-medal": GlyphMedal,
  "card-stack": GlyphCardStack,
  rose: GlyphRose,
  rocket: GlyphRocket,
};

// ─────────────────────────────────────────────────────────────
// Fallback disc
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

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

  const Glyph = BESPOKE_GLYPH[slug];
  if (Glyph) {
    return (
      <span className={className} style={wrapperStyle} title={title}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 60 60"
          style={{ display: "block", overflow: "visible" }}
          role="img"
          aria-label={title ?? slug}
        >
          <Glyph />
        </svg>
      </span>
    );
  }

  return (
    <span className={className} style={wrapperStyle} title={title}>
      <FallbackDisc slug={slug} rarity={rarity} size={size} />
    </span>
  );
}

// Test hook: lets a snapshot test enumerate all slugs we have
// bespoke art for. Not part of the public surface.
export const __BESPOKE_GLYPH_SLUGS = Object.keys(BESPOKE_GLYPH);
