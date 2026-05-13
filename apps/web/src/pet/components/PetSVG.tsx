// PetSVG — direct port of the prototype's pets-svg.jsx.
//
// One <svg viewBox="0 0 100 100"> per pet. 13 named species + egg
// fallback. Stroke uses var(--pet-stroke, var(--ink)) so the line
// work adapts to theme; fills are the prototype's hand-picked
// warm-paper palette.
//
// Eye replacement: when the pet has an eyes-slot cosmetic equipped,
// the Eye component is replaced by an EYE_STYLES entry instead of
// drawing the default eyeball. The cosmetic slug is mapped from
// Axiomic's descriptive slugs (`glasses`) to the prototype's
// kind keys (`e-glasses`) so this file stays a verbatim port.

import { createContext, memo, useContext } from "react";

const stroke = "var(--pet-stroke, var(--ink))";

const EyeKindContext = createContext<string | null>(null);

// Axiomic-slug → prototype eye-kind. Anything not in this map renders
// the default eyeball.
const EYE_SLUG_TO_KIND: Record<string, string> = {
  glasses: "e-glasses",
  sunglasses: "e-shades",
  monocle: "e-monocle",
  "starry-eyes": "e-stars",
  "gold-star": "e-stars",
  eyepatch: "e-eyepatch",
  "third-eye": "e-thirdeye",
  "heart-lenses": "e-heart",
  "pixel-visor": "e-pixel",
  "reading-specs": "e-reading",
  "sleepy-eyes": "e-sleepy",
  "laser-visor": "e-laser",
};

interface EyeProps {
  cx: number;
  cy: number;
  r?: number;
}

const Eye = ({ cx, cy, r = 2.2 }: EyeProps) => {
  const kind = useContext(EyeKindContext);
  if (kind && EYE_STYLES[kind]) {
    return EYE_STYLES[kind]({ cx, cy, r, cr: 2.3 });
  }
  return (
    <g className="eye" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      <circle cx={cx - r * 0.45} cy={cy + r * 0.35} r={r * 0.2} fill="var(--bg-elev,#fff)" opacity={0.6} />
    </g>
  );
};

interface EyeStyleProps {
  cx: number;
  cy: number;
  r: number;
  cr: number;
}

const EYE_STYLES: Record<string, (p: EyeStyleProps) => JSX.Element> = {
  "e-glasses": ({ cx, cy, r, cr }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      <circle cx={cx} cy={cy} r={cr * 1.9} fill="none" stroke={stroke} strokeWidth={1.2} />
      {cx > 50 && (
        <path d={`M ${cx - cr * 1.9} ${cy} L ${50 - cr * 1.9 + 1} ${cy}`} stroke={stroke} strokeWidth={1.2} />
      )}
    </g>
  ),
  "e-shades": ({ cx, cy, r, cr }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <rect
        x={cx - cr * 2.2}
        y={cy - cr * 1.2}
        width={cr * 4.4}
        height={cr * 2.2}
        rx={cr * 0.6}
        fill="#1a1a1a"
        fillOpacity={0.82}
        stroke={stroke}
        strokeWidth={1.1}
      />
      <rect
        x={cx - cr * 1.6}
        y={cy - cr * 0.9}
        width={cr * 1.2}
        height={cr * 0.6}
        fill="#fff"
        opacity={0.35}
        stroke="none"
      />
    </g>
  ),
  "e-monocle": ({ cx, cy, r, cr }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      {cx > 50 && (
        <>
          <circle cx={cx} cy={cy} r={cr * 2.1} fill="none" stroke="#d8a04e" strokeWidth={1.4} />
          <path
            d={`M ${cx + cr * 1.9} ${cy + cr * 1.2} q 4 8 -2 14`}
            stroke="#d8a04e"
            strokeWidth={1}
            fill="none"
          />
        </>
      )}
    </g>
  ),
  "e-stars": ({ cx, cy, r }) => {
    const sx = cx;
    const sy = cy - r * 1.5;
    const d = `M ${sx} ${sy} L ${sx + r * 0.35} ${sy + r * 0.9} L ${sx + r * 1.2} ${sy + r * 1} L ${sx + r * 0.55} ${sy + r * 1.6} L ${sx + r * 0.75} ${sy + r * 2.5} L ${sx} ${sy + r * 1.9} L ${sx - r * 0.75} ${sy + r * 2.5} L ${sx - r * 0.55} ${sy + r * 1.6} L ${sx - r * 1.2} ${sy + r * 1} L ${sx - r * 0.35} ${sy + r * 0.9} Z`;
    return <path d={d} fill="#f0c060" stroke={stroke} strokeWidth={0.8} />;
  },
  "e-eyepatch": ({ cx, cy, r }) => {
    if (cx < 50) {
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={r * 2.2} ry={r * 1.8} fill="#1a1a1a" stroke={stroke} strokeWidth={1.2} />
          <path d={`M ${cx - r * 2.2} ${cy - r * 1.4} q 10 -8 22 -2`} stroke={stroke} strokeWidth={1} fill="none" />
        </g>
      );
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={stroke} />
        <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      </g>
    );
  },
  "e-thirdeye": ({ cx, cy, r }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      {cx > 50 && (
        <g transform={`translate(50, ${cy - r * 5})`}>
          <ellipse cx={0} cy={0} rx={r * 1.6} ry={r * 1} fill="#fff" stroke={stroke} strokeWidth={1} />
          <circle cx={0} cy={0} r={r * 0.9} fill="#7a3aa8" />
          <circle cx={0} cy={0} r={r * 0.4} fill="#1a1a1a" />
        </g>
      )}
    </g>
  ),
  "e-heart": ({ cx, cy, r }) => (
    <path
      d={`M ${cx} ${cy + r * 1.4} q -${r * 2} -${r * 1.4} -${r * 2} -${r * 2.4} q 0 -${r} ${r} -${r} q ${r * 0.6} 0 ${r} ${r * 0.6} q ${r * 0.4} -${r * 0.6} ${r} -${r * 0.6} q ${r} 0 ${r} ${r} q 0 ${r} -${r * 2} ${r * 2.4} z`}
      fill="#d97c7c"
      stroke={stroke}
      strokeWidth={1}
    />
  ),
  "e-pixel": ({ cx, cy, r }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <rect
        x={cx - r * 2}
        y={cy - r * 1.2}
        width={r * 4}
        height={r * 2.2}
        fill="#1a1a1a"
        fillOpacity={0.88}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <rect x={cx - r * 1.2} y={cy - r * 0.6} width={r * 0.6} height={r * 1} fill="#6ee7b7" stroke="none" />
      <rect x={cx + r * 0.2} y={cy - r * 0.6} width={r * 0.6} height={r * 1} fill="#6ee7b7" stroke="none" />
    </g>
  ),
  "e-reading": ({ cx, cy, r }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={stroke} />
      <circle cx={cx + r * 0.32} cy={cy - r * 0.4} r={r * 0.42} fill="var(--bg-elev,#fff)" />
      <path
        d={`M ${cx - r * 1.9} ${cy} a ${r * 1.9} ${r * 1.5} 0 0 1 ${r * 3.8} 0`}
        fill="rgba(255,255,255,.15)"
        stroke={stroke}
        strokeWidth={1}
      />
      <path d={`M ${cx - r * 1.9} ${cy} h ${r * 3.8}`} stroke="#d8a04e" strokeWidth={1.2} />
    </g>
  ),
  "e-sleepy": ({ cx, cy, r }) => (
    <path
      d={`M ${cx - r * 1.6} ${cy - r * 0.4} q ${r * 1.6} ${r * 1.4} ${r * 3.2} 0`}
      stroke={stroke}
      strokeWidth={1.8}
      fill="none"
      strokeLinecap="round"
    />
  ),
  "e-laser": ({ cx, cy, r }) => (
    <g>
      <circle cx={cx} cy={cy} r={r * 1.1} fill="#1a1a1a" />
      <circle cx={cx} cy={cy} r={r * 0.5} fill="#ff3a3a" />
      <path
        d={`M ${cx} ${cy} L ${cx + (cx > 50 ? r * 4 : -r * 4)} ${cy + r * 2}`}
        stroke="#ff3a3a"
        strokeWidth={1}
        opacity={0.7}
      />
    </g>
  ),
};

// Per-species body components (verbatim port).

interface SpeciesProps {
  level: number;
}

const Cat = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  const cy = level === 1 ? 56 : 52;
  return (
    <g transform={`translate(50 ${cy}) scale(${scale}) translate(-50 -50)`}>
      <path d="M 26 32 L 32 14 L 40 28 Z" fill="#e6b88c" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <path d="M 74 32 L 68 14 L 60 28 Z" fill="#e6b88c" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <path d="M 30 26 L 33.5 18 L 37.5 25 Z" fill="#f5cdb0" />
      <path d="M 70 26 L 66.5 18 L 62.5 25 Z" fill="#f5cdb0" />
      <ellipse cx={50} cy={46} rx={26} ry={24} fill="#f0c9a0" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={36} rx={14} ry={6} fill="#fff" opacity={0.18} />
      <circle cx={34} cy={52} r={3.2} fill="#e09b8a" opacity={0.45} />
      <circle cx={66} cy={52} r={3.2} fill="#e09b8a" opacity={0.45} />
      {level >= 3 && (
        <g stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55}>
          <path d="M 30 34 q 4 -2 8 0" />
          <path d="M 62 34 q 4 -2 8 0" />
          <path d="M 46 28 v 5" />
          <path d="M 54 28 v 5" />
        </g>
      )}
      <Eye cx={42} cy={46} r={2.4} />
      <Eye cx={58} cy={46} r={2.4} />
      <path d="M 48 53 q 2 1.6 4 0 q -2 1.4 -2 2 q 0 -.6 -2 -2 z" fill={stroke} />
      <path d="M 50 55 v 1.8" stroke={stroke} strokeWidth={1.2} />
      <path d="M 45 58 q 5 3.5 10 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <g stroke={stroke} strokeWidth={1.1} opacity={0.8} strokeLinecap="round">
        <path d="M 30 52 q -4 0 -8 -1" />
        <path d="M 30 56 q -4 1 -7 2" />
        <path d="M 70 52 q 4 0 8 -1" />
        <path d="M 70 56 q 4 1 7 2" />
      </g>
    </g>
  );
};

const Dog = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.7 : level === 2 ? 0.86 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path
        d="M 22 34 q -4 18 8 22 L 32 30 Z"
        fill="#c98850"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M 78 34 q 4 18 -8 22 L 68 30 Z"
        fill="#c98850"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <ellipse cx={50} cy={46} rx={25} ry={23} fill="#e6a36a" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={36} rx={12} ry={5} fill="#fff" opacity={0.2} />
      <ellipse cx={50} cy={56} rx={14} ry={9} fill="#f3c694" stroke={stroke} strokeWidth={1.8} />
      {level >= 3 && <ellipse cx={38} cy={40} rx={6} ry={5} fill="#8a5a2c" opacity={0.65} />}
      <Eye cx={42} cy={44} r={2.3} />
      <Eye cx={58} cy={44} r={2.3} />
      <ellipse cx={50} cy={52} rx={3} ry={2.2} fill={stroke} />
      <path d="M 50 54 v 3" stroke={stroke} strokeWidth={1.3} />
      <path d="M 45 60 q 5 3 10 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </g>
  );
};

const Fox = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path d="M 22 36 L 28 12 L 40 30 Z" fill="#d96a3d" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <path d="M 78 36 L 72 12 L 60 30 Z" fill="#d96a3d" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <path d="M 27 30 L 30 18 L 35 28 Z" fill="#1d1b16" opacity={0.35} />
      <path d="M 73 30 L 70 18 L 65 28 Z" fill="#1d1b16" opacity={0.35} />
      <path
        d="M 22 40 q 6 -10 28 -10 q 22 0 28 10 q -2 28 -28 32 q -26 -4 -28 -32 Z"
        fill="#e2774a"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <ellipse cx={44} cy={34} rx={12} ry={5} fill="#fff" opacity={0.2} />
      <path d="M 30 56 q 8 -6 20 -6 q 12 0 20 6 q -10 12 -20 12 q -10 0 -20 -12 Z" fill="#f7e8d8" />
      <path d="M 30 56 q 8 -6 20 -6 q 12 0 20 6" stroke="#d8c7b0" strokeWidth={1} fill="none" opacity={0.6} />
      <Eye cx={41} cy={46} r={2.3} />
      <Eye cx={59} cy={46} r={2.3} />
      <ellipse cx={50} cy={58} rx={2.6} ry={2} fill={stroke} />
      <path d="M 50 60 v 3" stroke={stroke} strokeWidth={1.3} />
      <path d="M 46 64 q 4 3 8 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {level >= 3 && (
        <g stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7}>
          <path d="M 22 58 q 4 2 6 0" />
          <path d="M 78 58 q -4 2 -6 0" />
        </g>
      )}
    </g>
  );
};

const Owl = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.7 : level === 2 ? 0.86 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path d="M 28 28 L 33 16 L 38 26 Z" fill="#9b7b4a" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <path d="M 72 28 L 67 16 L 62 26 Z" fill="#9b7b4a" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <ellipse cx={50} cy={50} rx={28} ry={26} fill="#b89060" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={34} rx={14} ry={5} fill="#fff" opacity={0.18} />
      <ellipse cx={50} cy={58} rx={20} ry={16} fill="#e2c89a" />
      <circle cx={40} cy={46} r={8.5} fill="#d4b384" opacity={0.5} />
      <circle cx={60} cy={46} r={8.5} fill="#d4b384" opacity={0.5} />
      <circle cx={40} cy={46} r={8} fill="var(--bg-elev,#fff)" stroke={stroke} strokeWidth={1.8} />
      <circle cx={60} cy={46} r={8} fill="var(--bg-elev,#fff)" stroke={stroke} strokeWidth={1.8} />
      <Eye cx={40} cy={46} r={3.4} />
      <Eye cx={60} cy={46} r={3.4} />
      <path
        d="M 47 54 L 50 60 L 53 54 Z"
        fill="#c8923a"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {level >= 3 && (
        <g stroke={stroke} strokeWidth={1.2} fill="none" opacity={0.55}>
          <path d="M 38 64 q 3 3 6 0 q 3 3 6 0 q 3 3 6 0" />
          <path d="M 38 70 q 3 3 6 0 q 3 3 6 0 q 3 3 6 0" />
        </g>
      )}
    </g>
  );
};

const Rabbit = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path
        d="M 34 24 q -2 -16 6 -18 q 8 -2 6 18 Z"
        fill="#e9d5c0"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M 66 24 q 2 -16 -6 -18 q -8 -2 -6 18 Z"
        fill="#e9d5c0"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M 38 18 q 0 -10 4 -12" stroke="#c8a386" strokeWidth={2} fill="none" />
      <path d="M 62 18 q 0 -10 -4 -12" stroke="#c8a386" strokeWidth={2} fill="none" />
      <ellipse cx={50} cy={50} rx={24} ry={22} fill="#f1e2cf" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={40} rx={12} ry={5} fill="#fff" opacity={0.25} />
      <Eye cx={42} cy={48} r={2.2} />
      <Eye cx={58} cy={48} r={2.2} />
      <ellipse cx={50} cy={56} rx={2} ry={1.4} fill="#d97c7c" />
      <path d="M 50 58 v 2" stroke={stroke} strokeWidth={1.2} />
      <path d="M 46 62 q 4 3 8 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {level >= 3 && (
        <g fill="#d97c7c" opacity={0.4}>
          <circle cx={34} cy={56} r={3} />
          <circle cx={66} cy={56} r={3} />
        </g>
      )}
    </g>
  );
};

const Turtle = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.74 : level === 2 ? 0.9 : 1;
  return (
    <g transform={`translate(50 54) scale(${scale}) translate(-50 -50)`}>
      <ellipse cx={50} cy={58} rx={32} ry={20} fill="#7a9b5a" stroke={stroke} strokeWidth={2.2} />
      <path d="M 22 58 q 28 -10 56 0" stroke={stroke} strokeWidth={1.6} fill="none" />
      <g stroke={stroke} strokeWidth={1.2} fill="#9bb87a" opacity={0.7}>
        <path d="M 40 56 l 6 -4 l 6 4 l 0 6 l -6 4 l -6 -4 z" />
        <path d="M 54 56 l 6 -4 l 6 4 l 0 6 l -6 4 l -6 -4 z" />
        {level >= 3 && <path d="M 26 58 l 6 -4 l 6 4 l 0 6 l -6 4 l -6 -4 z" />}
        {level >= 3 && <path d="M 68 58 l 6 -4 l 6 4 l 0 6 l -6 4 l -6 -4 z" />}
      </g>
      <ellipse cx={50} cy={34} rx={14} ry={13} fill="#a8c486" stroke={stroke} strokeWidth={2.2} />
      <Eye cx={45} cy={32} r={1.9} />
      <Eye cx={55} cy={32} r={1.9} />
      <path d="M 46 40 q 4 2 8 0" stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </g>
  );
};

const Dragon = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.74 : level === 2 ? 0.9 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path
        d="M 32 26 q -4 -10 -2 -16 q 6 4 8 14 Z"
        fill="#d8c060"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M 68 26 q 4 -10 2 -16 q -6 4 -8 14 Z"
        fill="#d8c060"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M 22 48 q 0 -22 28 -22 q 28 0 28 22 q 0 22 -28 22 q -28 0 -28 -22 z"
        fill="#7a9b6e"
        stroke={stroke}
        strokeWidth={2.2}
      />
      <ellipse cx={44} cy={36} rx={14} ry={5} fill="#fff" opacity={0.18} />
      <ellipse cx={50} cy={60} rx={12} ry={7} fill="#a3c294" stroke={stroke} strokeWidth={1.8} />
      <ellipse cx={46} cy={60} rx={1} ry={0.8} fill={stroke} />
      <ellipse cx={54} cy={60} rx={1} ry={0.8} fill={stroke} />
      <Eye cx={40} cy={44} r={2.4} />
      <Eye cx={60} cy={44} r={2.4} />
      {level >= 3 && (
        <g fill="#d8c060" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round">
          <path d="M 44 26 L 50 18 L 56 26 Z" />
        </g>
      )}
    </g>
  );
};

const Penguin = ({ level: _level }: SpeciesProps) => {
  const level = _level;
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 54) scale(${scale}) translate(-50 -50)`}>
      <ellipse cx={50} cy={58} rx={24} ry={28} fill="#2a3140" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={50} cy={62} rx={16} ry={22} fill="#f1ede2" />
      <Eye cx={43} cy={44} r={2.2} />
      <Eye cx={57} cy={44} r={2.2} />
      <path
        d="M 46 50 L 50 56 L 54 50 Z"
        fill="#e6a347"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <ellipse cx={42} cy={86} rx={4} ry={2} fill="#e6a347" stroke={stroke} strokeWidth={1.2} />
      <ellipse cx={58} cy={86} rx={4} ry={2} fill="#e6a347" stroke={stroke} strokeWidth={1.2} />
    </g>
  );
};

const Bear = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <circle cx={28} cy={30} r={7} fill="#7a5a3a" stroke={stroke} strokeWidth={2} />
      <circle cx={72} cy={30} r={7} fill="#7a5a3a" stroke={stroke} strokeWidth={2} />
      <circle cx={28} cy={30} r={3} fill="#a8825a" stroke="none" />
      <circle cx={72} cy={30} r={3} fill="#a8825a" stroke="none" />
      <ellipse cx={50} cy={50} rx={28} ry={24} fill="#9a6b3a" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={50} cy={58} rx={16} ry={10} fill="#d8b08a" />
      <Eye cx={42} cy={46} r={2.4} />
      <Eye cx={58} cy={46} r={2.4} />
      <ellipse cx={50} cy={58} rx={3} ry={2.2} fill={stroke} />
      <path d="M 50 60 v 3" stroke={stroke} strokeWidth={1.3} />
      <path d="M 46 65 q 4 3 8 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {level >= 3 && (
        <path d="M 40 38 q 4 -2 6 0" stroke={stroke} strokeWidth={1.2} fill="none" opacity={0.5} />
      )}
    </g>
  );
};

const Hedgehog = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <path
        stroke={stroke}
        strokeWidth={2.2}
        fill="#6a4a2a"
        strokeLinejoin="round"
        d="M 20 50 q 0 -28 30 -28 q 30 0 30 28 z"
      />
      {[26, 34, 42, 50, 58, 66, 74].map((x, i) => (
        <path
          key={x}
          fill="#9a6b3a"
          stroke={stroke}
          strokeWidth={1.2}
          strokeLinejoin="round"
          d={`M ${x} 30 L ${x + 4} ${20 - (i === 3 ? 4 : 0)} L ${x + 8} 30 Z`}
        />
      ))}
      <ellipse cx={50} cy={58} rx={22} ry={16} fill="#e6c89a" stroke={stroke} strokeWidth={2.2} />
      <Eye cx={42} cy={56} r={2.2} />
      <Eye cx={58} cy={56} r={2.2} />
      <ellipse cx={50} cy={66} rx={2.4} ry={1.8} fill={stroke} />
      <path d="M 50 68 v 2" stroke={stroke} strokeWidth={1.2} />
      {level >= 3 && (
        <g fill="#d97c7c" opacity={0.5}>
          <circle cx={36} cy={62} r={2.6} />
          <circle cx={64} cy={62} r={2.6} />
        </g>
      )}
    </g>
  );
};

const Axolotl = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <g stroke={stroke} strokeWidth={1.4} strokeLinecap="round" fill="#f0a8c0">
        <path d="M 24 36 q -8 -2 -10 -10" />
        <path d="M 22 42 q -10 0 -12 -6" />
        <path d="M 24 48 q -8 2 -10 8" />
        <path d="M 76 36 q 8 -2 10 -10" />
        <path d="M 78 42 q 10 0 12 -6" />
        <path d="M 76 48 q 8 2 10 8" />
      </g>
      <g fill="#f6c0d8" stroke="none">
        <circle cx={16} cy={28} r={3} />
        <circle cx={12} cy={38} r={3} />
        <circle cx={16} cy={50} r={3} />
        <circle cx={84} cy={28} r={3} />
        <circle cx={88} cy={38} r={3} />
        <circle cx={84} cy={50} r={3} />
      </g>
      <ellipse cx={50} cy={50} rx={26} ry={22} fill="#f6c0d8" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={40} rx={14} ry={5} fill="#fff" opacity={0.3} />
      <Eye cx={42} cy={48} r={2.2} />
      <Eye cx={58} cy={48} r={2.2} />
      <path
        d="M 40 58 q 10 6 20 0"
        stroke={stroke}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={36} cy={56} r={2.2} fill="#e88aa6" opacity={0.55} />
      <circle cx={64} cy={56} r={2.2} fill="#e88aa6" opacity={0.55} />
      {level >= 3 && (
        <g fill="#f6c0d8" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round">
          <path d="M 30 26 q 2 -6 6 -6 q 2 4 -2 8 z" />
          <path d="M 70 26 q -2 -6 -6 -6 q -2 4 2 8 z" />
        </g>
      )}
    </g>
  );
};

const Frog = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 54) scale(${scale}) translate(-50 -50)`}>
      <circle cx={32} cy={28} r={10} fill="#7ab064" stroke={stroke} strokeWidth={2.2} />
      <circle cx={68} cy={28} r={10} fill="#7ab064" stroke={stroke} strokeWidth={2.2} />
      <circle cx={32} cy={30} r={6} fill="var(--bg-elev,#fff)" stroke={stroke} strokeWidth={1.6} />
      <circle cx={68} cy={30} r={6} fill="var(--bg-elev,#fff)" stroke={stroke} strokeWidth={1.6} />
      <Eye cx={32} cy={30} r={3} />
      <Eye cx={68} cy={30} r={3} />
      <ellipse cx={50} cy={58} rx={28} ry={22} fill="#8fc474" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={50} cy={64} rx={20} ry={13} fill="#cfe6b8" />
      <path d="M 30 60 q 20 14 40 0" stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" />
      {level >= 3 && (
        <g fill="#5a8a44" opacity={0.55}>
          <circle cx={28} cy={60} r={2.4} />
          <circle cx={72} cy={60} r={2.4} />
          <circle cx={40} cy={50} r={1.8} />
          <circle cx={60} cy={50} r={1.8} />
        </g>
      )}
    </g>
  );
};

const Panda = ({ level }: SpeciesProps) => {
  const scale = level === 1 ? 0.72 : level === 2 ? 0.88 : 1;
  return (
    <g transform={`translate(50 52) scale(${scale}) translate(-50 -50)`}>
      <circle cx={28} cy={26} r={8} fill="#1a1a1a" stroke={stroke} strokeWidth={1.8} />
      <circle cx={72} cy={26} r={8} fill="#1a1a1a" stroke={stroke} strokeWidth={1.8} />
      <ellipse cx={50} cy={50} rx={28} ry={24} fill="#f6efde" stroke={stroke} strokeWidth={2.2} />
      <ellipse cx={44} cy={38} rx={14} ry={5} fill="#fff" opacity={0.4} />
      <ellipse cx={40} cy={48} rx={6} ry={8} transform="rotate(-18 40 48)" fill="#1a1a1a" />
      <ellipse cx={60} cy={48} rx={6} ry={8} transform="rotate(18 60 48)" fill="#1a1a1a" />
      <Eye cx={40} cy={48} r={2.2} />
      <Eye cx={60} cy={48} r={2.2} />
      <ellipse cx={50} cy={58} rx={3.5} ry={2.6} fill="#1a1a1a" />
      <path d="M 50 60 v 3" stroke={stroke} strokeWidth={1.4} />
      <path d="M 46 64 q 4 3 8 0" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {level >= 3 && (
        <g stroke={stroke} strokeWidth={1.2} fill="none" opacity={0.55}>
          <path d="M 24 60 q 4 2 6 0" />
          <path d="M 76 60 q -4 2 -6 0" />
        </g>
      )}
    </g>
  );
};

const Egg = () => (
  <g>
    <ellipse cx={50} cy={56} rx={22} ry={28} fill="#f1e2cf" stroke={stroke} strokeWidth={2.2} />
    <g fill="#d8c0a0">
      <ellipse cx={44} cy={48} rx={2.6} ry={2} />
      <ellipse cx={56} cy={60} rx={3} ry={2.4} />
      <ellipse cx={42} cy={68} rx={2} ry={1.4} />
      <ellipse cx={58} cy={44} rx={1.6} ry={1.2} />
    </g>
  </g>
);

const SPECIES: Record<string, (p: SpeciesProps) => JSX.Element> = {
  cat: Cat,
  dog: Dog,
  fox: Fox,
  owl: Owl,
  rabbit: Rabbit,
  turtle: Turtle,
  dragon: Dragon,
  penguin: Penguin,
  bear: Bear,
  hedgehog: Hedgehog,
  axolotl: Axolotl,
  frog: Frog,
  panda: Panda,
};

export const PROTOTYPE_SPECIES = new Set(Object.keys(SPECIES));

// Phase 10D — per-species head anchor y (as a fraction of petSize,
// derived from PetSVG's actual head-ellipse cy value in the 100×100
// viewBox). Baseline is 0.46 (cat / fox / owl / bear). Species
// whose heads sit higher or lower in the viewBox get adjusted so
// head cosmetics anchor on the actual head, not the stage top.
//
// CosmeticOverlay reads this map and adds `(anchor - 0.46) * petSize`
// to the head `top` offset. Species not in the map fall back to
// baseline behavior (good for the 4 parametric-fallback species).
export const SPECIES_HEAD_ANCHOR_Y: Record<string, number> = {
  cat: 0.46,
  dog: 0.44,
  fox: 0.46,
  owl: 0.46,
  rabbit: 0.48,
  turtle: 0.32,
  dragon: 0.44,
  penguin: 0.44,
  bear: 0.46,
  hedgehog: 0.56,
  axolotl: 0.48,
  frog: 0.30,
  panda: 0.48,
};

// Per-species accessory bottom-anchor adjustment in % of petSize.
// Tall species (penguin body cy=58 ry=28; turtle shell cy=58 rx=32)
// need the acc lifted off the very bottom of the stage so it reads
// as "held by the pet" rather than "floating on the floor".
export const SPECIES_ACC_DY_BOOST: Record<string, number> = {
  penguin: 12,
  turtle: 8,
};

interface PetSVGProps {
  species: string | undefined;
  level?: number;
  size?: number;
  eyeSlug?: string | null;
}

// Phase 13E — memoized; all props are primitives.
function PetSVGImpl({ species, level = 1, size = 80, eyeSlug = null }: PetSVGProps): JSX.Element {
  const Body = species ? SPECIES[species] : null;
  const eyeKind = eyeSlug ? EYE_SLUG_TO_KIND[eyeSlug] ?? null : null;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={species ? `${species} level ${level}` : "egg"}
      style={{ display: "block", overflow: "visible" }}
    >
      <EyeKindContext.Provider value={eyeKind}>
        {Body ? <Body level={level} /> : <Egg />}
      </EyeKindContext.Provider>
    </svg>
  );
}

export const PetSVG = memo(PetSVGImpl);
