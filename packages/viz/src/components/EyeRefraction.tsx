import { useState } from "react";

// How the eye focuses light, and how lenses correct it. In an emmetropic
// (normal) eye, parallel rays from a distant object focus exactly on the
// retina. In MYOPIA the eye is too powerful/long, so the focus falls SHORT
// (in front of the retina) — corrected by a diverging, negative-diopter
// lens. In HYPEROPIA the focus falls BEHIND the retina — corrected by a
// converging, positive lens. Refractive power is measured in diopters
// (D = 1/focal length in metres); the corrective prescription is simply
// the lens that cancels the eye's error.

const W = 460;
const H = 280;

type Cond = "Emmetropia" | "Myopia" | "Hyperopia";
// excess power (D): positive = too much power (myopic), negative = too little
const ERROR: Record<Cond, number> = { Emmetropia: 0, Myopia: 3, Hyperopia: -3 };
const ORDER: Cond[] = ["Emmetropia", "Myopia", "Hyperopia"];

interface Props {
  condition?: Cond;
}

export function EyeRefraction({ condition: ctl }: Props = {}) {
  const [intCond, setIntCond] = useState<Cond>("Emmetropia");
  const [lens, setLens] = useState(0); // corrective lens power (D)
  const cond = ctl ?? intCond;
  const err = ERROR[cond];
  const net = err + lens; // residual defocus; 0 = on retina
  const focused = Math.abs(net) < 0.3;

  const axisY = 140, corneaX = 240, retinaX = 384, eyeCx = 312, eyeR = 72;
  const focusX = retinaX - net * 9;
  const lensX = 110;
  const rayYs = [axisY - 30, axisY, axisY + 30];

  const status = focused
    ? "focused on the retina — 20/20"
    : net > 0
      ? "focus falls in FRONT of the retina (myopic blur)"
      : "focus falls BEHIND the retina (hyperopic blur)";

  // corrective-lens shape
  const lensShape =
    Math.abs(lens) < 0.3
      ? null
      : lens > 0
        ? `M${lensX},108 Q${lensX + 13},${axisY} ${lensX},172 Q${lensX - 13},${axisY} ${lensX},108 Z`
        : `M${lensX - 10},108 Q${lensX},${axisY} ${lensX - 10},172 L${lensX + 10},172 Q${lensX},${axisY} ${lensX + 10},108 Z`;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold" style={{ color: focused ? "#4ade80" : "#f87171" }}>
          {cond} · lens {lens > 0 ? "+" : ""}{lens} D · {focused ? "✓" : "blurry"}
        </div>
        <div className="flex gap-1">
          {ORDER.map((x) => (
            <button key={x} onClick={() => { setIntCond(x); }} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${cond === x ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{x}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Eye refraction and corrective lenses">
        {/* optical axis */}
        <line x1={20} y1={axisY} x2={retinaX} y2={axisY} stroke="#1f2937" strokeWidth={0.5} strokeDasharray="3,3" />

        {/* eyeball */}
        <circle cx={eyeCx} cy={axisY} r={eyeR} fill="#0e1a3a" stroke="#475569" strokeWidth={1.2} />
        {/* cornea/lens (front) */}
        <ellipse cx={corneaX + 6} cy={axisY} rx={7} ry={26} fill="#1e3a5f" stroke="#38bdf8" strokeWidth={1} />
        <text x={corneaX + 6} y={axisY + 44} fill="#38bdf8" fontSize="7" textAnchor="middle">lens</text>
        {/* retina (back wall) */}
        <path d={`M${eyeCx + eyeR - 4},${axisY - 50} A 52 52 0 0 1 ${eyeCx + eyeR - 4},${axisY + 50}`} fill="none" stroke={focused ? "#4ade80" : "#f87171"} strokeWidth={2.2} />
        <text x={retinaX - 2} y={axisY - 54} fill={focused ? "#4ade80" : "#f87171"} fontSize="7" textAnchor="middle">retina</text>

        {/* corrective lens */}
        {lensShape && <path d={lensShape} fill="#a78bfa" opacity={0.3} stroke="#a78bfa" strokeWidth={1.2} />}
        <text x={lensX} y={196} fill="#a78bfa" fontSize="7.5" textAnchor="middle">{lens > 0 ? "convex +" : lens < 0 ? "concave −" : "no lens"}</text>

        {/* incoming parallel rays → corrective lens */}
        {rayYs.map((y, i) => <line key={`in${i}`} x1={20} y1={y} x2={lensX} y2={y} stroke="#fbbf24" strokeWidth={1} />)}
        {/* lens → cornea (still ~parallel, schematic) */}
        {rayYs.map((y, i) => <line key={`mid${i}`} x1={lensX} y1={y} x2={corneaX} y2={y} stroke="#fbbf24" strokeWidth={1} opacity={0.85} />)}
        {/* cornea → focal point (converging) */}
        {rayYs.map((y, i) => <line key={`f${i}`} x1={corneaX} y1={y} x2={focusX} y2={axisY} stroke="#fbbf24" strokeWidth={1} />)}
        {/* focal point */}
        <circle cx={focusX} cy={axisY} r={4} fill={focused ? "#4ade80" : "#f87171"} />
        {!focused && focusX < retinaX && (
          <>{rayYs.map((y, i) => <line key={`d${i}`} x1={focusX} y1={axisY} x2={retinaX} y2={axisY + (axisY - y) * 0.5} stroke="#f87171" strokeWidth={0.8} opacity={0.6} />)}</>
        )}

        <text x={W / 2} y={H - 14} fill={focused ? "#4ade80" : "#f87171"} fontSize="9" textAnchor="middle">{status}</text>
        {focused && cond !== "Emmetropia" && <text x={W / 2} y={26} fill="#4ade80" fontSize="8.5" textAnchor="middle">Rx: {lens > 0 ? "+" : ""}{lens} D ({lens < 0 ? "concave" : "convex"})</text>}
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">corrective lens power: {lens > 0 ? "+" : ""}{lens} D
          <input type="range" min={-6} max={6} step={1} value={lens} onChange={(e) => setLens(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Corrective lens power in diopters" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        A distant object sends parallel rays into the eye; the cornea + lens
        (~60 D total) should focus them on the <b>retina</b>. <b>Myopia</b>
        focuses short — fix it with a <b>negative (concave)</b> lens that
        diverges the rays first; <b>hyperopia</b> focuses long — fix it with a
        <b> positive (convex)</b> lens. Dial the corrective power until the
        focal point lands exactly on the retina: that value, in <b>diopters</b>,
        is the prescription. (Astigmatism + presbyopia add a cylinder and a
        reading "add" to the same idea.)
      </div>
    </div>
  );
}
