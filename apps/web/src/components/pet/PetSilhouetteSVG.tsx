// Phase M — PetSilhouetteSVG.
//
// SVG-only pet renderer (replaces emoji-based rendering). One component
// drives all 16 species via a per-species parameter map: body shape +
// color, ear style + length, tail shape, eye anchor + radius, mouth
// shape, and a level-3 "flourish" (extra tufts, halo, etc.).
//
// DOM contract — the pet-tokens.css idle animations target:
//   - `.pet-stage svg .eye` for the blink animation (must hit two
//     `<circle>` elements with class="eye")
//   - `.pet-stage svg > g > path:nth-child(odd/even)` for the ear-twitch
//     animation (ears must be wrapped in a `<g>`, with two `<path>`
//     children at the top of the SVG)
//
// Pre-hatch / unknown species: renders an SVG egg (oval with a soft
// gradient + crack line). No emoji anywhere.

import type { CSSProperties } from "react";

export type PetMood = "calm" | "happy" | "sleepy";

interface SpeciesParams {
  baseColor: string;        // body fill
  bellyColor: string;       // belly accent
  earInnerColor: string;    // ear inside
  earShape: "pointed" | "rounded" | "long" | "tuft" | "round" | "none";
  earLength: number;        // 0..1 multiplier (drawn relative to head)
  tailShape: "curl" | "fluffy" | "long" | "short" | "flipper" | "none";
  tailColor: string;
  // Body proportions (all in viewBox 0..100).
  bodyCx: number;
  bodyCy: number;
  bodyRx: number;
  bodyRy: number;
  headCx: number;
  headCy: number;
  headR: number;
  // Eye anchor — % from center of head, used to place eye circles.
  eyeOffsetX: number;       // distance from headCx (both sides mirrored)
  eyeOffsetY: number;       // signed (negative = above head center)
  eyeRadius: number;        // 1.5..3.4
  eyeFill: string;
  noseDot: boolean;         // simple nose at head bottom
  noseFill: string;
  // Mouth: 'smile' is a small arc below the nose; 'beak' is a triangle;
  // 'wide-smile' is for naturally-smiley species like the otter.
  mouth: "smile" | "beak" | "wide-smile" | "frog";
  level3: "tufts" | "wings" | "horns" | "glow" | "long-tail" | "none";
  level3Color?: string;
}

// 16 species (8 existing + 8 new). Body and ear values tuned by eye so
// each species reads as itself even at 24px byline size.
const SPECIES_PARAMS: Record<string, SpeciesParams> = {
  // ─── existing species ───────────────────────────────────────────
  cat: {
    baseColor: "#c8a96e", bellyColor: "#e3cd9b", earInnerColor: "#a87d4a",
    earShape: "pointed", earLength: 0.55,
    tailShape: "curl", tailColor: "#c8a96e",
    bodyCx: 50, bodyCy: 70, bodyRx: 22, bodyRy: 16,
    headCx: 50, headCy: 44, headR: 19,
    eyeOffsetX: 7, eyeOffsetY: -2, eyeRadius: 2.6, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#5e3d24",
    mouth: "smile",
    level3: "tufts", level3Color: "#e3cd9b",
  },
  dog: {
    baseColor: "#a87a4d", bellyColor: "#d3a875", earInnerColor: "#7a5a35",
    earShape: "long", earLength: 0.75,
    tailShape: "fluffy", tailColor: "#a87a4d",
    bodyCx: 50, bodyCy: 70, bodyRx: 23, bodyRy: 17,
    headCx: 50, headCy: 45, headR: 19,
    eyeOffsetX: 6.5, eyeOffsetY: -1, eyeRadius: 2.4, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "long-tail", level3Color: "#d3a875",
  },
  rabbit: {
    baseColor: "#e8dac4", bellyColor: "#fff5e3", earInnerColor: "#e0b8a8",
    earShape: "long", earLength: 1.0,
    tailShape: "short", tailColor: "#fff5e3",
    bodyCx: 50, bodyCy: 72, bodyRx: 20, bodyRy: 15,
    headCx: 50, headCy: 48, headR: 17,
    eyeOffsetX: 6, eyeOffsetY: 0, eyeRadius: 2.2, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#c97a82",
    mouth: "smile",
    level3: "tufts", level3Color: "#fff5e3",
  },
  fox: {
    baseColor: "#d97a3a", bellyColor: "#f5d8b8", earInnerColor: "#9c4f1d",
    earShape: "pointed", earLength: 0.7,
    tailShape: "fluffy", tailColor: "#d97a3a",
    bodyCx: 50, bodyCy: 70, bodyRx: 22, bodyRy: 16,
    headCx: 50, headCy: 45, headR: 18,
    eyeOffsetX: 6.5, eyeOffsetY: -1, eyeRadius: 2.3, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "long-tail", level3Color: "#f5d8b8",
  },
  turtle: {
    baseColor: "#5a8a4a", bellyColor: "#a8c882", earInnerColor: "#3d6a30",
    earShape: "none", earLength: 0,
    tailShape: "short", tailColor: "#5a8a4a",
    bodyCx: 50, bodyCy: 65, bodyRx: 26, bodyRy: 18,
    headCx: 50, headCy: 42, headR: 14,
    eyeOffsetX: 4.5, eyeOffsetY: -1, eyeRadius: 2.0, eyeFill: "#1d1b16",
    noseDot: false, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "glow", level3Color: "#a8c882",
  },
  dragon: {
    baseColor: "#7a4cc7", bellyColor: "#c4a7ff", earInnerColor: "#4a2b85",
    earShape: "pointed", earLength: 0.85,
    tailShape: "long", tailColor: "#7a4cc7",
    bodyCx: 50, bodyCy: 70, bodyRx: 22, bodyRy: 16,
    headCx: 50, headCy: 44, headR: 18,
    eyeOffsetX: 6.5, eyeOffsetY: -1, eyeRadius: 2.4, eyeFill: "#f0a040",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "wings", level3Color: "#c4a7ff",
  },
  owl: {
    baseColor: "#8a6a4a", bellyColor: "#e3cd9b", earInnerColor: "#5e3d24",
    earShape: "tuft", earLength: 0.6,
    tailShape: "none", tailColor: "#8a6a4a",
    bodyCx: 50, bodyCy: 68, bodyRx: 23, bodyRy: 19,
    headCx: 50, headCy: 42, headR: 21,
    eyeOffsetX: 8, eyeOffsetY: 0, eyeRadius: 3.4, eyeFill: "#f0a040",
    noseDot: false, noseFill: "#1d1b16",
    mouth: "beak",
    level3: "wings", level3Color: "#e3cd9b",
  },
  penguin: {
    baseColor: "#1d2530", bellyColor: "#f5f0e8", earInnerColor: "#1d2530",
    earShape: "none", earLength: 0,
    tailShape: "none", tailColor: "#1d2530",
    bodyCx: 50, bodyCy: 70, bodyRx: 20, bodyRy: 22,
    headCx: 50, headCy: 38, headR: 18,
    eyeOffsetX: 5.5, eyeOffsetY: -1, eyeRadius: 2.6, eyeFill: "#f5f0e8",
    noseDot: false, noseFill: "#1d1b16",
    mouth: "beak",
    level3: "glow", level3Color: "#f5f0e8",
  },
  // ─── new species ────────────────────────────────────────────────
  hedgehog: {
    baseColor: "#a8896e", bellyColor: "#e3cd9b", earInnerColor: "#7a5a35",
    earShape: "rounded", earLength: 0.35,
    tailShape: "none", tailColor: "#a8896e",
    bodyCx: 50, bodyCy: 68, bodyRx: 25, bodyRy: 17,
    headCx: 50, headCy: 48, headR: 16,
    eyeOffsetX: 5.5, eyeOffsetY: -1, eyeRadius: 2.2, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "tufts", level3Color: "#5e3d24",
  },
  capybara: {
    baseColor: "#7a5a35", bellyColor: "#a87a4d", earInnerColor: "#5e3d24",
    earShape: "round", earLength: 0.3,
    tailShape: "none", tailColor: "#7a5a35",
    bodyCx: 50, bodyCy: 72, bodyRx: 26, bodyRy: 17,
    headCx: 50, headCy: 46, headR: 18,
    eyeOffsetX: 6, eyeOffsetY: -1, eyeRadius: 2.1, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "wide-smile",
    level3: "glow", level3Color: "#a87a4d",
  },
  otter: {
    baseColor: "#8a6a4a", bellyColor: "#d3a875", earInnerColor: "#5e3d24",
    earShape: "round", earLength: 0.25,
    tailShape: "long", tailColor: "#8a6a4a",
    bodyCx: 50, bodyCy: 70, bodyRx: 22, bodyRy: 17,
    headCx: 50, headCy: 44, headR: 17,
    eyeOffsetX: 6, eyeOffsetY: -1, eyeRadius: 2.3, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "wide-smile",
    level3: "long-tail", level3Color: "#d3a875",
  },
  axolotl: {
    baseColor: "#e8a8b8", bellyColor: "#f5d3dc", earInnerColor: "#c97a82",
    earShape: "tuft", earLength: 0.7,
    tailShape: "long", tailColor: "#e8a8b8",
    bodyCx: 50, bodyCy: 70, bodyRx: 22, bodyRy: 14,
    headCx: 50, headCy: 46, headR: 17,
    eyeOffsetX: 6, eyeOffsetY: -1, eyeRadius: 1.8, eyeFill: "#1d1b16",
    noseDot: false, noseFill: "#1d1b16",
    mouth: "wide-smile",
    level3: "tufts", level3Color: "#c97a82",
  },
  frog: {
    baseColor: "#5fa84a", bellyColor: "#c4d6a0", earInnerColor: "#3d6a30",
    earShape: "none", earLength: 0,
    tailShape: "none", tailColor: "#5fa84a",
    bodyCx: 50, bodyCy: 70, bodyRx: 24, bodyRy: 15,
    headCx: 50, headCy: 46, headR: 18,
    eyeOffsetX: 7, eyeOffsetY: -6, eyeRadius: 3.0, eyeFill: "#1d1b16",
    noseDot: false, noseFill: "#1d1b16",
    mouth: "frog",
    level3: "glow", level3Color: "#c4d6a0",
  },
  panda: {
    baseColor: "#f5f0e8", bellyColor: "#ffffff", earInnerColor: "#1d1b16",
    earShape: "round", earLength: 0.4,
    tailShape: "short", tailColor: "#1d1b16",
    bodyCx: 50, bodyCy: 70, bodyRx: 24, bodyRy: 17,
    headCx: 50, headCy: 44, headR: 19,
    eyeOffsetX: 7, eyeOffsetY: 0, eyeRadius: 2.5, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "glow", level3Color: "#1d1b16",
  },
  ferret: {
    baseColor: "#e8dac4", bellyColor: "#fff5e3", earInnerColor: "#a87a4d",
    earShape: "rounded", earLength: 0.35,
    tailShape: "long", tailColor: "#7a5a35",
    bodyCx: 50, bodyCy: 71, bodyRx: 23, bodyRy: 14,
    headCx: 50, headCy: 46, headR: 16,
    eyeOffsetX: 5.5, eyeOffsetY: -1, eyeRadius: 2.1, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "long-tail", level3Color: "#7a5a35",
  },
  seal: {
    baseColor: "#8a8a8a", bellyColor: "#c0c0c0", earInnerColor: "#5a5a5a",
    earShape: "none", earLength: 0,
    tailShape: "flipper", tailColor: "#8a8a8a",
    bodyCx: 50, bodyCy: 72, bodyRx: 26, bodyRy: 15,
    headCx: 50, headCy: 48, headR: 16,
    eyeOffsetX: 5.5, eyeOffsetY: -1, eyeRadius: 2.4, eyeFill: "#1d1b16",
    noseDot: true, noseFill: "#1d1b16",
    mouth: "smile",
    level3: "glow", level3Color: "#c0c0c0",
  },
};

function speciesParams(species: string | undefined): SpeciesParams | null {
  if (!species) return null;
  return SPECIES_PARAMS[species] ?? null;
}

// ─── Drawing helpers ─────────────────────────────────────────────

function earPath(p: SpeciesParams, side: "L" | "R"): string {
  // Position the ear at the top of the head, mirrored left/right.
  const sign = side === "L" ? -1 : 1;
  const baseX = p.headCx + sign * (p.headR * 0.6);
  const baseY = p.headCy - p.headR * 0.5;
  const len = p.headR * p.earLength;
  const tipX = baseX + sign * (p.headR * 0.25);
  const tipY = baseY - len;

  switch (p.earShape) {
    case "pointed": {
      // Triangle from base to tip.
      const ax = baseX - sign * 3;
      const cx = baseX + sign * 5;
      return `M ${ax} ${baseY} L ${tipX} ${tipY} L ${cx} ${baseY} Z`;
    }
    case "rounded": {
      // Quadratic curve up + back.
      return `M ${baseX - sign * 3} ${baseY} Q ${tipX} ${tipY} ${baseX + sign * 5} ${baseY} Z`;
    }
    case "long": {
      // Tall narrow oval — rabbit ears.
      const w = p.headR * 0.18;
      return `M ${baseX} ${baseY} q ${-w * sign} ${-len * 0.5} 0 ${-len} q ${w * sign} ${len * 0.5} 0 ${len} Z`;
    }
    case "tuft": {
      // Owl-style — small upright tuft.
      return `M ${baseX - sign * 2} ${baseY} L ${tipX} ${tipY} L ${baseX + sign * 4} ${baseY} Z`;
    }
    case "round": {
      // Panda/capybara — small round ear bump.
      const r = p.headR * 0.18;
      const cy = baseY - r * 0.3;
      return `M ${baseX - r} ${cy} a ${r} ${r} 0 0 1 ${r * 2} 0 a ${r} ${r} 0 0 1 ${-r * 2} 0 Z`;
    }
    case "none":
    default:
      return "";
  }
}

function tailPath(p: SpeciesParams): string {
  if (p.tailShape === "none") return "";
  const startX = p.bodyCx - p.bodyRx * 0.85;
  const startY = p.bodyCy;
  switch (p.tailShape) {
    case "curl":
      return `M ${startX} ${startY} q -6 -4 -2 -10 q 2 -3 -2 -6`;
    case "fluffy":
      return `M ${startX} ${startY} q -8 -6 -10 -14 q -1 -4 4 -6 q 6 4 6 12 q 0 6 -4 8 Z`;
    case "long":
      return `M ${startX} ${startY} q -10 4 -16 -2`;
    case "short":
      return `M ${startX} ${startY - 2} q -3 -1 -6 1 q -1 3 1 4`;
    case "flipper":
      return `M ${startX + 2} ${startY + 2} q -8 4 -10 -2 q 2 -2 10 -1 Z`;
    default:
      return "";
  }
}

function mouthPath(p: SpeciesParams, mood: PetMood): string {
  const cx = p.headCx;
  const cy = p.headCy + p.headR * 0.4;
  switch (p.mouth) {
    case "beak": {
      // Small triangle.
      return `M ${cx - 2.5} ${cy - 1} L ${cx} ${cy + 3} L ${cx + 2.5} ${cy - 1} Z`;
    }
    case "frog": {
      // Wide line — frog grin.
      return `M ${cx - 7} ${cy} q 7 4 14 0`;
    }
    case "wide-smile": {
      const arc = mood === "happy" ? 5 : mood === "sleepy" ? 2 : 3.5;
      return `M ${cx - 5} ${cy - 0.5} q 5 ${arc} 10 0`;
    }
    case "smile":
    default: {
      if (mood === "sleepy") return `M ${cx - 2} ${cy + 1} q 2 -0.5 4 0`;
      const arc = mood === "happy" ? 3.5 : 2;
      return `M ${cx - 3} ${cy - 0.5} q 3 ${arc} 6 0`;
    }
  }
}

function bellyPath(p: SpeciesParams): string {
  // Belly is an inset ellipse, slightly lower than body center.
  const cx = p.bodyCx;
  const cy = p.bodyCy + p.bodyRy * 0.2;
  const rx = p.bodyRx * 0.55;
  const ry = p.bodyRy * 0.55;
  return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
}

// ─── Egg fallback (pre-hatch / unknown species) ─────────────────

function EggSVG(): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="egg-grad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff5e0" />
          <stop offset="60%" stopColor="#f0d8a8" />
          <stop offset="100%" stopColor="#c8a868" />
        </radialGradient>
      </defs>
      <ellipse
        cx="50"
        cy="55"
        rx="26"
        ry="32"
        fill="url(#egg-grad)"
        stroke="#a8895a"
        strokeWidth="1.2"
      />
      {/* Highlight glint */}
      <ellipse cx="42" cy="38" rx="6" ry="10" fill="#fff7e8" opacity="0.55" />
      {/* Faint crack hint */}
      <path
        d="M 42 70 L 46 64 L 52 70 L 56 65"
        fill="none"
        stroke="#a8895a"
        strokeWidth="0.9"
        opacity="0.45"
      />
    </svg>
  );
}

// ─── Level-3 flourish overlays ─────────────────────────────────

function Level3Flourish({ p }: { p: SpeciesParams }): JSX.Element | null {
  const color = p.level3Color ?? p.baseColor;
  switch (p.level3) {
    case "tufts": {
      // Extra fur tufts on the head crown.
      return (
        <g aria-hidden="true">
          <path
            d={`M ${p.headCx - 5} ${p.headCy - p.headR + 1} q 2 -3 4 0 q 2 -3 4 0`}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      );
    }
    case "wings": {
      // Small wings flanking the body.
      const bx = p.bodyCx;
      const by = p.bodyCy - p.bodyRy * 0.2;
      return (
        <g aria-hidden="true" opacity="0.85">
          <path
            d={`M ${bx - p.bodyRx + 2} ${by} q -8 -6 -12 0 q 4 4 12 2 Z`}
            fill={color}
            opacity="0.7"
          />
          <path
            d={`M ${bx + p.bodyRx - 2} ${by} q 8 -6 12 0 q -4 4 -12 2 Z`}
            fill={color}
            opacity="0.7"
          />
        </g>
      );
    }
    case "horns": {
      return (
        <g aria-hidden="true">
          <path
            d={`M ${p.headCx - 5} ${p.headCy - p.headR + 2} l -1 -5 l 3 1 Z`}
            fill={color}
          />
          <path
            d={`M ${p.headCx + 5} ${p.headCy - p.headR + 2} l 1 -5 l -3 1 Z`}
            fill={color}
          />
        </g>
      );
    }
    case "glow": {
      // Soft halo behind the head.
      return (
        <circle
          cx={p.headCx}
          cy={p.headCy}
          r={p.headR + 5}
          fill={color}
          opacity="0.18"
          aria-hidden="true"
        />
      );
    }
    case "long-tail": {
      // Render an extra tail flourish behind the body.
      const startX = p.bodyCx - p.bodyRx * 0.85;
      const startY = p.bodyCy;
      return (
        <path
          d={`M ${startX} ${startY} q -14 -4 -18 -10 q -2 -3 2 -4`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        />
      );
    }
    case "none":
    default:
      return null;
  }
}

// ─── Component ──────────────────────────────────────────────────

export interface PetSilhouetteSVGProps {
  species?: string;
  level?: number;
  mood?: PetMood;
  className?: string;
  style?: CSSProperties;
}

export function PetSilhouetteSVG({
  species,
  level = 1,
  mood = "calm",
  className,
  style,
}: PetSilhouetteSVGProps): JSX.Element {
  const p = speciesParams(species);

  // Pre-hatch / unknown species — render the egg.
  if (!p) {
    return (
      <div className={className} style={style}>
        <EggSVG />
      </div>
    );
  }

  const showFlourish = level >= 3;

  // Ears live in a <g> so the pet-stage CSS ear-twitch rule
  // (`g > path:nth-child(odd/even)`) targets them. Two <path>
  // children at most. None-ear species get an empty <g>.
  const leftEar = earPath(p, "L");
  const rightEar = earPath(p, "R");

  // Eye anchors derived from headCx + offset (mirrored).
  const eyeY = p.headCy + p.eyeOffsetY;

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {/* Level 3 flourish that should render BEHIND the pet (glow, wings, long-tail). */}
      {showFlourish && (p.level3 === "glow" || p.level3 === "wings" || p.level3 === "long-tail") && (
        <Level3Flourish p={p} />
      )}

      {/* Tail (drawn behind body so it tucks into the silhouette). */}
      {tailPath(p) && (
        <path
          d={tailPath(p)}
          fill={p.tailShape === "long" || p.tailShape === "curl" ? "none" : p.tailColor}
          stroke={p.tailColor}
          strokeWidth={p.tailShape === "long" || p.tailShape === "curl" ? 3 : 0.6}
          strokeLinecap="round"
        />
      )}

      {/* Body. */}
      <ellipse
        cx={p.bodyCx}
        cy={p.bodyCy}
        rx={p.bodyRx}
        ry={p.bodyRy}
        fill={p.baseColor}
      />
      {/* Belly. */}
      <path d={bellyPath(p)} fill={p.bellyColor} opacity="0.85" />

      {/* Ears — must be inside a top-level <g> for the ear-twitch CSS. */}
      <g>
        {leftEar && (
          <path d={leftEar} fill={p.baseColor} stroke={p.earInnerColor} strokeWidth="0.6" />
        )}
        {rightEar && (
          <path d={rightEar} fill={p.baseColor} stroke={p.earInnerColor} strokeWidth="0.6" />
        )}
      </g>

      {/* Head. */}
      <circle cx={p.headCx} cy={p.headCy} r={p.headR} fill={p.baseColor} />

      {/* Eye whites — owl + penguin + frog get a paler ring around the iris. */}
      {(p.mouth === "beak" || p.eyeRadius >= 2.8) && (
        <>
          <circle
            cx={p.headCx - p.eyeOffsetX}
            cy={eyeY}
            r={p.eyeRadius * 1.5}
            fill="#f5f0e8"
          />
          <circle
            cx={p.headCx + p.eyeOffsetX}
            cy={eyeY}
            r={p.eyeRadius * 1.5}
            fill="#f5f0e8"
          />
        </>
      )}

      {/* Eyes — class="eye" required for the pet-stage CSS blink animation. */}
      <circle
        className="eye"
        cx={p.headCx - p.eyeOffsetX}
        cy={eyeY}
        r={p.eyeRadius}
        fill={p.eyeFill}
      />
      <circle
        className="eye"
        cx={p.headCx + p.eyeOffsetX}
        cy={eyeY}
        r={p.eyeRadius}
        fill={p.eyeFill}
      />

      {/* Nose. */}
      {p.noseDot && (
        <circle
          cx={p.headCx}
          cy={p.headCy + p.headR * 0.18}
          r={1.4}
          fill={p.noseFill}
        />
      )}

      {/* Mouth. */}
      <path
        d={mouthPath(p, mood)}
        fill="none"
        stroke="#1d1b16"
        strokeWidth="1.1"
        strokeLinecap="round"
      />

      {/* Flourish that should render ON TOP (tufts, horns). */}
      {showFlourish && (p.level3 === "tufts" || p.level3 === "horns") && (
        <Level3Flourish p={p} />
      )}
    </svg>
  );
}
