import { useMemo, useState } from "react";

// GWAS Manhattan plot: -log₁₀(p) per SNP across chromosomes. We generate a
// simulated signal where most SNPs are null (~uniform p) with a handful
// of true associations spiking above the genome-wide threshold 5×10⁻⁸
// (drawn as horizontal red dashed line). Drag phenotype + study size;
// see how power scales (more SNPs cross the line for bigger studies).

const W = 460;
const H = 280;

interface Props {
  phenotype?: "height" | "BMI" | "schizophrenia" | "T2D";
  studySize?: number;
}

const PHENOTYPES = {
  height:         { trueSNPs: 12000,  effectScale: 1.0 },
  BMI:            { trueSNPs: 1000,   effectScale: 0.6 },
  schizophrenia:  { trueSNPs: 270,    effectScale: 0.5 },
  T2D:            { trueSNPs: 400,    effectScale: 0.7 },
};

export function ManhattanPlot({ phenotype: ctlP, studySize: ctlN }: Props = {}) {
  const [intP, setIntP] = useState<keyof typeof PHENOTYPES>("height");
  const [intN, setIntN] = useState(1000000);
  const pheno = ctlP ?? intP;
  const N = ctlN ?? intN;
  const info = PHENOTYPES[pheno];

  // Generate per-chromosome SNP "hits"
  const data = useMemo(() => {
    // Chromosome lengths (rough relative)
    const chromLengths = [248, 242, 198, 190, 181, 170, 159, 145, 138, 133, 135, 133, 114, 107, 101, 90, 83, 80, 58, 64, 46, 50];
    const totalSNPs = 800;
    const totalLen = chromLengths.reduce((s, l) => s + l, 0);
    const hits: Array<{ chrom: number; x: number; nlp: number }> = [];
    let rng = 4242;
    const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
    let offset = 0;
    chromLengths.forEach((len, c) => {
      const snpCount = Math.round((len / totalLen) * totalSNPs);
      for (let i = 0; i < snpCount; i++) {
        // Background null p-values
        let nlp = -Math.log10(rand() * 0.99 + 0.01);
        // Random true hits proportional to trueSNPs and study power
        const trueProb = (info.trueSNPs / totalSNPs / chromLengths.length) * Math.min(1, N / 100000);
        if (rand() < trueProb) {
          // Beta * sqrt(N) ~ effect z-score; high power → high -log p
          const z = info.effectScale * Math.sqrt(N / 100000) * (1 + rand() * 2);
          nlp = Math.min(40, z * z * 0.4 + 6);
        }
        hits.push({ chrom: c, x: offset + (i / snpCount) * len, nlp });
      }
      offset += len;
    });
    return { hits, totalLen };
  }, [pheno, N]);

  const baseX = 40;
  const baseY = 20;
  const plotW = W - 50;
  const plotH = H - 70;
  const yMax = 30;
  const xOf = (x: number) => baseX + (x / data.totalLen) * plotW;
  const yOf = (y: number) => baseY + ((yMax - y) / yMax) * plotH;
  const threshold = -Math.log10(5e-8); // ~7.3
  const sigCount = data.hits.filter((h) => h.nlp >= threshold).length;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Manhattan · {pheno} · N = {N.toLocaleString()} · {sigCount} loci pass 5×10⁻⁸</div>
        <div className="flex gap-1">
          {(Object.keys(PHENOTYPES) as Array<keyof typeof PHENOTYPES>).map((p) => (
            <button key={p} onClick={() => setIntP(p)} disabled={ctlP !== undefined} className={`px-2 py-0.5 rounded text-[9px] ${pheno === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Manhattan plot">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* y ticks */}
        {[0, 5, 10, 15, 20, 25, 30].map((y) => (
          <g key={`y-${y}`}>
            <line x1={baseX} y1={yOf(y)} x2={baseX + plotW} y2={yOf(y)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(y) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{y}</text>
          </g>
        ))}
        {/* Genome-wide threshold */}
        <line x1={baseX} y1={yOf(threshold)} x2={baseX + plotW} y2={yOf(threshold)} stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="4,3" />
        <text x={baseX + plotW - 4} y={yOf(threshold) - 4} fill="#ff6b6b" fontSize="7" textAnchor="end">5×10⁻⁸</text>
        {/* SNP points */}
        {data.hits.map((h, i) => (
          <circle key={i} cx={xOf(h.x)} cy={yOf(Math.min(yMax, h.nlp))} r={1.2} fill={h.chrom % 2 === 0 ? "#4ecdc4" : "#a78bfa"} opacity={h.nlp > threshold ? 1 : 0.6} />
        ))}
        <text x={baseX + plotW / 2} y={baseY + plotH + 18} fill="#cbd1e6" fontSize="9" textAnchor="middle">chromosome (1-22)</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>-log₁₀(p)</text>
      </svg>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 text-xs">
        <label className="block">Study size N: {N.toLocaleString()}
          <input type="range" min={1000} max={5000000} step={1000} value={N} onChange={(e) => setIntN(parseInt(e.target.value))} disabled={ctlN !== undefined} className="w-full mt-0.5" aria-label="Study size" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Manhattan plot — each dot is a SNP × phenotype p-value, plotted
        as -log₁₀(p) along the genome. Genome-wide significance is
        usually 5×10⁻⁸ (Bonferroni for ~1M independent tests). Heritable
        traits show a "skyscraper" pattern; small N + small effects →
        underpowered (most signal sub-threshold). Real GWAS hits since
        Klein-Hartl 2005 (AMD CFH) → UK Biobank 500k + FinnGen 500k +
        Million Veterans 800k. Polygenic risk scores integrate genome-
        wide effects. Major caveat: most variants are common-frequency
        small-effect; missing heritability persists; ancestry-transfer
        problems for non-European PRS remain unsolved.
      </div>
    </div>
  );
}
