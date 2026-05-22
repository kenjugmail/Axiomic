import { useMemo, useState } from "react";

// DNA STR (short tandem repeat) electropherogram. CODIS uses 13-20
// loci; each locus shows 1 or 2 peaks (homozygous vs heterozygous)
// at integer allele lengths (number of repeats). Drag the loci count;
// compare two profiles; a random-match probability is computed
// assuming allele independence (Hardy-Weinberg) and 0.1 allele
// frequency per peak — extremely simplified pedagogy, not real
// population genetics.

const W = 460;
const H = 320;

interface Props {
  loci?: number;
}

// CODIS 13 core loci (1997 standard; expanded to 20 in 2017)
const CODIS_LOCI = [
  "D3S1358", "vWA", "FGA", "D8S1179", "D21S11", "D18S51",
  "D5S818", "D13S317", "D7S820", "D16S539", "TH01", "TPOX", "CSF1PO",
];

function makeProfile(seed: number, nLoci: number): number[][] {
  const out: number[][] = [];
  const rng = (() => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();
  for (let i = 0; i < nLoci; i++) {
    // Allele lengths 8-30 typically
    const a = Math.floor(8 + rng() * 22);
    const b = rng() > 0.4 ? Math.floor(8 + rng() * 22) : a;
    out.push([a, b].sort((x, y) => x - y));
  }
  return out;
}

function countMatches(a: number[][], b: number[][]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] === b[i][0] && a[i][1] === b[i][1]) m++;
  }
  return m;
}

export function DnaElectropherogram({ loci: ctlLoci }: Props = {}) {
  const [intLoci, setIntLoci] = useState(13);
  const nLoci = Math.min(ctlLoci ?? intLoci, CODIS_LOCI.length);
  const [seed1, setSeed1] = useState(1);
  const [seed2, setSeed2] = useState(2);

  const profileA = useMemo(() => makeProfile(seed1, nLoci), [seed1, nLoci]);
  const profileB = useMemo(() => makeProfile(seed2, nLoci), [seed2, nLoci]);

  const matches = countMatches(profileA, profileB);
  // Random-match probability under HWE + 0.1 allele freq per peak.
  // Two peaks per locus → 2 × 0.1 × 0.1 = 0.02 chance of full match
  // per locus. Across nLoci independent loci: 0.02^n.
  const rmp = Math.pow(0.02, matches);

  const baseX = 30;
  const baseY = 24;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 90;
  const xOf = (i: number) => baseX + ((i + 0.5) / nLoci) * plotW;
  const peakH = plotH / 2 - 4;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">STR profile · {nLoci} loci · {matches}/{nLoci} match · RMP ≈ {rmp.toExponential(1)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="DNA electropherogram">
        {/* Profile A (top half) */}
        <text x={baseX} y={baseY + 10} fill="#4ecdc4" fontSize="9">Profile A</text>
        <line x1={baseX} y1={baseY + plotH / 2} x2={baseX + plotW} y2={baseY + plotH / 2} stroke="#475569" strokeWidth={0.4} />
        {profileA.map((alleles, i) => {
          const x = xOf(i);
          const isMatch = alleles[0] === profileB[i][0] && alleles[1] === profileB[i][1];
          return (
            <g key={`a-${i}`}>
              {alleles.map((a, j) => {
                const h = ((a - 7) / 24) * peakH;
                const px = x + (alleles[0] === alleles[1] ? 0 : (j === 0 ? -5 : 5));
                return (
                  <g key={`a-${i}-${j}`}>
                    <line x1={px} y1={baseY + plotH / 2 - 4} x2={px} y2={baseY + plotH / 2 - 4 - h} stroke={isMatch ? "#4ecdc4" : "#fbbf24"} strokeWidth={2.5} />
                    <text x={px} y={baseY + plotH / 2 - 6 - h} fill="#9aa3b8" fontSize="7" textAnchor="middle">{a}</text>
                  </g>
                );
              })}
              <text x={x} y={baseY + plotH / 2 + 8} fill="#9aa3b8" fontSize="7" textAnchor="middle">{CODIS_LOCI[i]?.slice(0, 6)}</text>
            </g>
          );
        })}
        {/* Profile B (bottom half) */}
        <text x={baseX} y={baseY + plotH / 2 + 22} fill="#a78bfa" fontSize="9">Profile B</text>
        {profileB.map((alleles, i) => {
          const x = xOf(i);
          const isMatch = alleles[0] === profileA[i][0] && alleles[1] === profileA[i][1];
          return (
            <g key={`b-${i}`}>
              {alleles.map((a, j) => {
                const h = ((a - 7) / 24) * peakH;
                const px = x + (alleles[0] === alleles[1] ? 0 : (j === 0 ? -5 : 5));
                return (
                  <line key={`b-${i}-${j}`} x1={px} y1={baseY + plotH / 2 + 26} x2={px} y2={baseY + plotH / 2 + 26 + h} stroke={isMatch ? "#4ecdc4" : "#a78bfa"} strokeWidth={2.5} />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <label className="block">loci: {nLoci}
          <input type="range" min={5} max={13} step={1} value={nLoci} onChange={(e) => setIntLoci(parseInt(e.target.value))} disabled={ctlLoci !== undefined} className="w-full mt-0.5" aria-label="Loci" />
        </label>
        <button onClick={() => setSeed1((s) => s + 1)} className="px-2 py-1 rounded bg-muted hover:bg-accent text-xs">Reroll A</button>
        <button onClick={() => setSeed2((s) => s + 1)} className="px-2 py-1 rounded bg-muted hover:bg-accent text-xs">Reroll B</button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Short Tandem Repeat (STR) profiling counts the number of
        repeats at each of CODIS's 13-20 core loci. Two peaks per
        locus = heterozygous (one allele from each parent);
        co-located = homozygous. A full match across 13 loci has a
        random-match probability of roughly 10⁻²⁰ assuming
        Hardy-Weinberg equilibrium + independence — well below the
        ~10¹⁰ population scale. Jeffreys discovered DNA
        fingerprinting in 1984; FBI launched CODIS in 1994 (full
        operations 1998). Innocence Project DNA exonerations have
        freed 375+ wrongfully-convicted individuals as of 2024.
        Low-template DNA, mixtures, and PCR contamination are the
        main interpretation pitfalls (Brandon Mayfield 2004 Madrid
        bombing fingerprint misidentification illustrates analogous
        cognitive bias risks in pattern evidence).
      </div>
    </div>
  );
}
