import { useMemo, useState } from "react";

// Interactive reactor comparison: CSTR (continuous stirred-tank) vs
// PFR (plug-flow). For a reaction A → products with rate r_A = k Cₐⁿ
// + the same space-time τ + inlet concentration Cₐ₀, the two reactor
// types give different conversion. Universal teaching tool in
// chemical reaction engineering: for n>0 kinetics, PFR > CSTR
// because PFR maintains higher average concentration along the
// reactor; CSTR operates at outlet (low) concentration throughout.
//
// Closed-form solutions used:
//   n=0:  CSTR: Cₐ = max(0, Cₐ₀ − k τ);  PFR: same.
//   n=1:  CSTR: Cₐ = Cₐ₀ / (1 + k τ);     PFR: Cₐ = Cₐ₀ exp(−k τ).
//   n=2:  CSTR: solve Cₐ + k τ Cₐ² = Cₐ₀ (quadratic root)
//          PFR: Cₐ = Cₐ₀ / (1 + k τ Cₐ₀).

const W = 420;
const H = 220;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

interface Props {
  order?: 0 | 1 | 2;
  k?: number;
  tau?: number;
  ca0?: number;
}

function cstrOutlet(n: number, k: number, tau: number, ca0: number): number {
  if (n === 0) return Math.max(0, ca0 - k * tau);
  if (n === 1) return ca0 / (1 + k * tau);
  // n=2 quadratic: kτ Cₐ² + Cₐ − Cₐ₀ = 0
  const a = k * tau;
  const disc = 1 + 4 * a * ca0;
  return (-1 + Math.sqrt(disc)) / (2 * a);
}

function pfrOutlet(n: number, k: number, tau: number, ca0: number): number {
  if (n === 0) return Math.max(0, ca0 - k * tau);
  if (n === 1) return ca0 * Math.exp(-k * tau);
  // n=2: 1/Cₐ − 1/Cₐ₀ = kτ → Cₐ = Cₐ₀/(1 + kτCₐ₀)
  return ca0 / (1 + k * tau * ca0);
}

// Concentration profile along normalized reactor length 0..1.
// CSTR is uniform (= outlet); PFR varies. We treat residence time
// as linearly accumulating with length, so each "slice" sees τ × λ.
function pfrProfile(n: number, k: number, tau: number, ca0: number, points = 60): number[] {
  const arr: number[] = [];
  for (let i = 0; i <= points; i++) {
    const lam = i / points;
    arr.push(pfrOutlet(n, k, tau * lam, ca0));
  }
  return arr;
}

export function ReactorComparator({
  order: ctlOrder,
  k: ctlK,
  tau: ctlTau,
  ca0: ctlCa0,
}: Props = {}) {
  const [intOrder, setIntOrder] = useState<0 | 1 | 2>(1);
  const [intK, setIntK] = useState(0.5);
  const [intTau, setIntTau] = useState(4);
  const [intCa0, setIntCa0] = useState(1);

  const order = ctlOrder ?? intOrder;
  const k = ctlK ?? intK;
  const tau = ctlTau ?? intTau;
  const ca0 = ctlCa0 ?? intCa0;

  const { caCstr, caPfr, xCstr, xPfr, profilePfr } = useMemo(() => {
    const cCstr = cstrOutlet(order, k, tau, ca0);
    const cPfr = pfrOutlet(order, k, tau, ca0);
    return {
      caCstr: cCstr,
      caPfr: cPfr,
      xCstr: ca0 > 0 ? 1 - cCstr / ca0 : 0,
      xPfr: ca0 > 0 ? 1 - cPfr / ca0 : 0,
      profilePfr: pfrProfile(order, k, tau, ca0),
    };
  }, [order, k, tau, ca0]);

  const xFor = (lam: number) => PAD_L + lam * (W - PAD_L - PAD_R);
  const yFor = (c: number) => PAD_T + (1 - c / Math.max(ca0, 1e-9)) * (H - PAD_T - PAD_B);

  const pfrPath = useMemo(() => {
    let d = "";
    for (let i = 0; i < profilePfr.length; i++) {
      const x = xFor(i / (profilePfr.length - 1));
      const y = yFor(profilePfr[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [profilePfr, ca0]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">CSTR vs PFR: concentration vs reactor length</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Concentration of A along normalized reactor length for CSTR vs PFR"
      >
        {/* Inlet level (Cₐ₀) */}
        <line x1={PAD_L} y1={yFor(ca0)} x2={W - PAD_R} y2={yFor(ca0)} stroke="#444a66" strokeDasharray="3,3" />
        <text x={W - PAD_R - 4} y={yFor(ca0) - 3} fill="#9aa3b8" fontSize="9" textAnchor="end">Cₐ₀</text>

        {/* CSTR: uniform at outlet concentration */}
        <line x1={PAD_L} y1={yFor(caCstr)} x2={W - PAD_R} y2={yFor(caCstr)} stroke="#ff7a7a" strokeWidth={2.5} />
        <text x={xFor(0.55)} y={yFor(caCstr) - 6} fill="#ff7a7a" fontSize="9">CSTR (uniform)</text>

        {/* PFR: profile from Cₐ₀ down */}
        <path d={pfrPath} fill="none" stroke="#7bcbff" strokeWidth={2.5} />
        <text x={xFor(0.05)} y={yFor((ca0 + caPfr) / 2) - 4} fill="#7bcbff" fontSize="9">PFR (profile)</text>

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {/* y-ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L - 4} y1={yFor(f * ca0)} x2={PAD_L} y2={yFor(f * ca0)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(f * ca0) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">
              {(f * ca0).toFixed(2)}
            </text>
          </g>
        ))}

        {/* x-ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={xFor(f)} y1={H - PAD_B} x2={xFor(f)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(f)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{f.toFixed(2)}</text>
          </g>
        ))}

        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">normalized reactor length (or τ fraction)</text>
        <text x={10} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">Cₐ (mol/L)</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block col-span-2">
          Reaction order n: {order}
          <div className="flex gap-1 mt-0.5">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                onClick={() => setIntOrder(n as 0 | 1 | 2)}
                disabled={ctlOrder !== undefined}
                className={`flex-1 px-2 py-1 rounded text-xs ${
                  order === n ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
                } disabled:opacity-50`}
              >
                n = {n}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          k: {k.toFixed(2)} {order === 0 ? "mol/L/s" : order === 1 ? "1/s" : "L/mol/s"}
          <input
            type="range"
            min={0.01}
            max={3}
            step={0.01}
            value={k}
            onChange={(e) => setIntK(parseFloat(e.target.value))}
            disabled={ctlK !== undefined}
            className="w-full mt-0.5"
            aria-label="Rate constant k"
          />
        </label>
        <label className="block">
          Space-time τ: {tau.toFixed(1)} s
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.1}
            value={tau}
            onChange={(e) => setIntTau(parseFloat(e.target.value))}
            disabled={ctlTau !== undefined}
            className="w-full mt-0.5"
            aria-label="Residence time tau"
          />
        </label>
        <label className="block col-span-2">
          Inlet Cₐ₀: {ca0.toFixed(2)} mol/L
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.05}
            value={ca0}
            onChange={(e) => setIntCa0(parseFloat(e.target.value))}
            disabled={ctlCa0 !== undefined}
            className="w-full mt-0.5"
            aria-label="Inlet concentration"
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-[#ff7a7a]/10 border border-[#ff7a7a]/30 p-2">
          <div className="text-muted-foreground">CSTR</div>
          <div className="font-semibold">Cₐ = {caCstr.toFixed(3)} mol/L · X = {(xCstr * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded bg-[#7bcbff]/10 border border-[#7bcbff]/30 p-2">
          <div className="text-muted-foreground">PFR</div>
          <div className="font-semibold">Cₐ = {caPfr.toFixed(3)} mol/L · X = {(xPfr * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        For n &gt; 0 kinetics, PFR achieves higher conversion than CSTR at the same τ because the CSTR operates everywhere at outlet (low) concentration, while the PFR maintains a higher average Cₐ along the reactor length.
      </div>
    </div>
  );
}
