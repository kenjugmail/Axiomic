import { useState } from "react";

// WCAG contrast ratio. Readability is governed by the luminance contrast
// between text and background, defined by W3C as (L1 + 0.05)/(L2 + 0.05)
// where L is the relative luminance of the lighter/darker color. WCAG 2
// requires ≥ 4.5:1 for normal text (AA) and ≥ 3:1 for large text; the
// stricter AAA level wants 7:1 and 4.5:1. Color alone is never enough —
// contrast is the accessibility floor that lets low-vision users and
// anyone in bright sunlight actually read the page.

const W = 460;
const H = 300;

function relLum(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function ratio(fg: number, bg: number): number {
  const a = relLum(fg);
  const b = relLum(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

type Size = "Normal text" | "Large text";
const THRESH: Record<Size, { aa: number; aaa: number }> = {
  "Normal text": { aa: 4.5, aaa: 7 },
  "Large text": { aa: 3, aaa: 4.5 },
};
const ORDER: Size[] = ["Normal text", "Large text"];

interface Props {
  size?: Size;
}

export function WcagContrast({ size: ctl }: Props = {}) {
  const [intSize, setIntSize] = useState<Size>("Normal text");
  const [fg, setFg] = useState(40);
  const [bg, setBg] = useState(235);
  const size = ctl ?? intSize;
  const r = ratio(fg, bg);
  const t = THRESH[size];
  const passAA = r >= t.aa;
  const passAAA = r >= t.aaa;
  const gray = (v: number) => `rgb(${v},${v},${v})`;

  const Badge = ({ label, ok, x }: { label: string; ok: boolean; x: number }) => (
    <g>
      <rect x={x} y={232} width={88} height={30} rx={5} fill={ok ? "#14321f" : "#3a1414"} stroke={ok ? "#4ade80" : "#f87171"} strokeWidth={1.2} />
      <text x={x + 44} y={246} fill={ok ? "#4ade80" : "#f87171"} fontSize="9" textAnchor="middle" fontWeight="bold">{label}</text>
      <text x={x + 44} y={257} fill={ok ? "#4ade80" : "#f87171"} fontSize="8" textAnchor="middle">{ok ? "PASS" : "FAIL"}</text>
    </g>
  );

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">contrast ratio {r.toFixed(2)}:1</div>
        <div className="flex gap-1">
          {ORDER.map((s) => (
            <button key={s} onClick={() => setIntSize(s)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${size === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="WCAG contrast checker">
        {/* sample swatch */}
        <rect x={30} y={20} width={400} height={120} rx={6} fill={gray(bg)} stroke="#1f2937" strokeWidth={0.8} />
        <text x={230} y={75} fill={gray(fg)} fontSize="30" textAnchor="middle" fontWeight="bold">Aa</text>
        <text x={230} y={110} fill={gray(fg)} fontSize="14" textAnchor="middle">The quick brown fox</text>

        {/* thresholds bar */}
        <text x={30} y={172} fill="#9aa3b8" fontSize="8.5">required for {size}: AA ≥ {t.aa}:1 · AAA ≥ {t.aaa}:1</text>
        <line x1={30} y1={186} x2={430} y2={186} stroke="#1f2937" strokeWidth={0.5} />
        {/* ratio marker on a 1..21 scale */}
        <rect x={30} y={196} width={400} height={10} rx={3} fill="#111a33" />
        <rect x={30} y={196} width={(Math.min(r, 21) / 21) * 400} height={10} rx={3} fill={passAA ? "#4ade80" : "#fbbf24"} />
        <line x1={30 + (t.aa / 21) * 400} y1={192} x2={30 + (t.aa / 21) * 400} y2={210} stroke="#f87171" strokeWidth={1} />
        <text x={30 + (t.aa / 21) * 400} y={220} fill="#f87171" fontSize="7" textAnchor="middle">AA</text>

        <Badge label="AA" ok={passAA} x={120} />
        <Badge label="AAA" ok={passAAA} x={252} />
        <text x={230} y={284} fill="#9aa3b8" fontSize="8" textAnchor="middle">21:1 = black on white (max) · 1:1 = identical (invisible)</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label className="block">text lightness: {fg}
          <input type="range" min={0} max={255} step={1} value={fg} onChange={(e) => setFg(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Text lightness" />
        </label>
        <label className="block">background lightness: {bg}
          <input type="range" min={0} max={255} step={1} value={bg} onChange={(e) => setBg(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Background lightness" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        The <b>contrast ratio</b> = (L₁ + 0.05)/(L₂ + 0.05) on relative
        luminance, ranging 1:1 (identical) to 21:1 (black on white).
        <b> WCAG 2</b> AA requires <b>4.5:1</b> for normal text and
        <b> 3:1</b> for large; AAA tightens these to 7:1 and 4.5:1. Large
        text earns a lower bar because thicker strokes stay legible at less
        contrast. Drag the sliders to find the threshold where "Aa" stops
        passing — that boundary is where real users start struggling.
      </div>
    </div>
  );
}
