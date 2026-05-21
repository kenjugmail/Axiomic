import { useEffect, useMemo, useRef, useState } from "react";

// Wright-Fisher genetic drift simulator. Binomial sampling each
// generation: in a population of N diploid (2N alleles), with parent
// allele frequency p, the child p' ~ Binomial(2N, p) / (2N). With
// selection coefficient s, the expected frequency before sampling
// becomes p_sel = p(1+s) / (p(1+s) + (1-p)). With no selection, drift
// alone fixes or loses each allele with probability p₀.

const W = 460;
const H = 320;

interface Props {
  N?: number;
  p0?: number;
}

function sampleBinomial(n: number, p: number): number {
  // Acceptable for our N up to a few hundred
  if (p <= 0) return 0;
  if (p >= 1) return n;
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (Math.random() < p) k++;
  }
  return k;
}

function simulateOne(N: number, p0: number, sel: number, gens: number): number[] {
  const series = [p0];
  let p = p0;
  for (let g = 1; g <= gens; g++) {
    if (p <= 0 || p >= 1) {
      series.push(p);
      continue;
    }
    const pSel = (p * (1 + sel)) / (p * (1 + sel) + (1 - p));
    const k = sampleBinomial(2 * N, pSel);
    p = k / (2 * N);
    series.push(p);
  }
  return series;
}

export function AlleleFrequencyDrift({ N: ctlN, p0: ctlP0 }: Props = {}) {
  const [intN, setIntN] = useState(100);
  const [intP0, setIntP0] = useState(0.5);
  const [sel, setSel] = useState(0);
  const [numRuns, setNumRuns] = useState(20);
  const [tick, setTick] = useState(0); // for re-simulating
  const N = ctlN ?? intN;
  const p0 = ctlP0 ?? intP0;
  const gens = 150;

  const runs = useMemo(() => {
    return Array.from({ length: numRuns }, () => simulateOne(N, p0, sel, gens));
  }, [N, p0, sel, numRuns, tick]);

  const fixed = runs.filter((r) => r[r.length - 1] >= 0.999).length;
  const lost = runs.filter((r) => r[r.length - 1] <= 0.001).length;
  const segregating = runs.length - fixed - lost;

  const baseX = 36;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 80;
  const xOf = (g: number) => baseX + (g / gens) * plotW;
  const yOf = (p: number) => baseY + plotH - p * plotH;

  const colors = ["#4ecdc4", "#fbbf24", "#a78bfa", "#ff6b6b", "#60a5fa", "#f472b6"];

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Wright-Fisher · N = {N} · p₀ = {p0.toFixed(2)} · s = {sel.toFixed(2)} · {numRuns} runs · {fixed} fixed / {lost} lost / {segregating} segregating</div>
        <button onClick={() => setTick((t) => t + 1)} className="px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground">Resim</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Allele frequency drift">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Reference lines at 0, 0.5, 1 */}
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={baseX} y1={yOf(p)} x2={baseX + plotW} y2={yOf(p)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(p) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{p.toFixed(1)}</text>
          </g>
        ))}
        {/* Expected-fixation probability dashed: p_fix = p0 */}
        <line x1={baseX} y1={yOf(p0)} x2={baseX + plotW} y2={yOf(p0)} stroke="#fbbf24" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5} />
        {/* All runs */}
        {runs.map((series, i) => (
          <path
            key={i}
            d={series.map((p, g) => `${g === 0 ? "M" : "L"}${xOf(g).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={0.8}
            strokeOpacity={0.6}
          />
        ))}
        <text x={baseX + plotW / 2} y={H - 28} fill="#cbd1e6" fontSize="10" textAnchor="middle">generations</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>allele frequency p</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <label className="block">population size N: {N}
          <input type="range" min={5} max={500} step={5} value={N} onChange={(e) => setIntN(parseInt(e.target.value))} disabled={ctlN !== undefined} className="w-full mt-0.5" aria-label="N" />
        </label>
        <label className="block">selection s: {sel.toFixed(2)}
          <input type="range" min={-0.1} max={0.1} step={0.005} value={sel} onChange={(e) => setSel(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="s" />
        </label>
        <label className="block">initial p₀: {p0.toFixed(2)}
          <input type="range" min={0.05} max={0.95} step={0.05} value={p0} onChange={(e) => setIntP0(parseFloat(e.target.value))} disabled={ctlP0 !== undefined} className="w-full mt-0.5" aria-label="p0" />
        </label>
        <label className="block">runs: {numRuns}
          <input type="range" min={1} max={50} step={1} value={numRuns} onChange={(e) => setNumRuns(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="runs" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Wright 1931 + Fisher 1922: in a finite population, allele
        frequencies drift even without selection. Each generation
        samples 2N gametes from the parent gene pool (binomial).
        Under neutrality, the probability a new allele eventually
        fixes equals its current frequency (P_fix = p₀); time to
        fixation scales as ~4N generations. Effective population
        size N_e accounts for sex ratios + bottlenecks + variable
        family size (often « census N). Drift dominates when 4Ns « 1;
        selection wins when 4Ns » 1 (Kimura 1962). The neutral theory
        (Kimura 1968, Ohta nearly-neutral 1973) holds that most
        molecular variation is selectively neutral — a foundation
        for the molecular clock and modern coalescent methods
        (Kingman 1982, Hudson, Felsenstein).
      </div>
    </div>
  );
}
