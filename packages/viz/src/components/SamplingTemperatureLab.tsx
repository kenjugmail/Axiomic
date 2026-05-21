import { useMemo, useState } from "react";

// Language-model sampling lab. A fixed next-token logit distribution
// over ~12 candidate tokens; drag temperature T, top-k, top-p
// (nucleus) sliders and see how the *effective* sampling distribution
// changes. Temperature divides logits before softmax — T → 0 collapses
// to argmax, T → ∞ approaches uniform. top-k truncates to the k most
// probable. top-p (Holtzman 2019 nucleus) keeps the smallest set whose
// cumulative probability ≥ p.

const W = 460;
const H = 320;

const RAW_LOGITS: Array<{ tok: string; logit: number }> = [
  { tok: "the", logit: 4.2 },
  { tok: "a", logit: 3.5 },
  { tok: "this", logit: 2.8 },
  { tok: "an", logit: 2.1 },
  { tok: "my", logit: 1.6 },
  { tok: "your", logit: 1.0 },
  { tok: "one", logit: 0.6 },
  { tok: "some", logit: 0.2 },
  { tok: "every", logit: -0.4 },
  { tok: "no", logit: -0.9 },
  { tok: "their", logit: -1.5 },
  { tok: "few", logit: -2.2 },
];

interface Props {
  temperature?: number;
  topK?: number;
  topP?: number;
}

function softmax(values: number[], T: number): number[] {
  const scaled = values.map((v) => v / Math.max(0.01, T));
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / sum);
}

function entropyBits(p: number[]): number {
  let h = 0;
  for (const pi of p) {
    if (pi > 1e-9) h -= pi * Math.log2(pi);
  }
  return h;
}

export function SamplingTemperatureLab({ temperature: ctlT, topK: ctlK, topP: ctlP }: Props = {}) {
  const [intT, setIntT] = useState(1.0);
  const [intK, setIntK] = useState(12);
  const [intP, setIntP] = useState(1.0);
  const T = ctlT ?? intT;
  const K = ctlK ?? intK;
  const P = ctlP ?? intP;

  const result = useMemo(() => {
    // Temperature first, then top-k, then top-p
    const tempered = softmax(RAW_LOGITS.map((d) => d.logit), T);
    const sortedIdx = tempered
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p - a.p);
    // Apply top-k
    const keepK = sortedIdx.slice(0, K).map((d) => d.i);
    // Apply top-p on the top-k subset
    let cum = 0;
    const keepP: number[] = [];
    for (const d of sortedIdx) {
      if (!keepK.includes(d.i)) continue;
      keepP.push(d.i);
      cum += d.p;
      if (cum >= P) break;
    }
    const keep = new Set(keepP);
    // Renormalize over kept set
    const masked = tempered.map((p, i) => (keep.has(i) ? p : 0));
    const sum = masked.reduce((s, p) => s + p, 0);
    const final = masked.map((p) => (sum > 0 ? p / sum : 0));
    return { tempered, final, keepCount: keep.size, entropyBits: entropyBits(final) };
  }, [T, K, P]);

  const baseX = 30;
  const baseY = 24;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 80;
  const rowH = plotH / RAW_LOGITS.length;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Sampling lab · T={T.toFixed(2)} · top-k={K} · top-p={P.toFixed(2)} · {result.keepCount} kept · H={result.entropyBits.toFixed(2)} bits</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Sampling lab">
        <text x={baseX + 60} y={baseY - 6} fill="#9aa3b8" fontSize="9">probability</text>
        {RAW_LOGITS.map((d, i) => {
          const y = baseY + i * rowH + 2;
          const wTempered = result.tempered[i] * plotW;
          const wFinal = result.final[i] * plotW;
          const isKept = result.final[i] > 0;
          return (
            <g key={d.tok}>
              <text x={baseX - 4} y={y + rowH * 0.65} fill="#cbd1e6" fontSize="10" textAnchor="end">{d.tok}</text>
              <rect x={baseX} y={y} width={wTempered} height={rowH * 0.4} fill="#475569" />
              <rect x={baseX} y={y + rowH * 0.45} width={wFinal} height={rowH * 0.4} fill={isKept ? "#4ecdc4" : "#1f2937"} />
              <text x={baseX + Math.max(wFinal, wTempered) + 4} y={y + rowH * 0.7} fill="#9aa3b8" fontSize="8">{(result.final[i] * 100).toFixed(1)}%</text>
            </g>
          );
        })}
        <g transform={`translate(${baseX}, ${H - 56})`}>
          <rect x={0} y={0} width={10} height={6} fill="#475569" /><text x={14} y={6} fill="#cbd1e6" fontSize="9">temperature-scaled</text>
          <rect x={130} y={0} width={10} height={6} fill="#4ecdc4" /><text x={144} y={6} fill="#cbd1e6" fontSize="9">final (after top-k/p)</text>
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <label className="block">T: {T.toFixed(2)}
          <input type="range" min={0.05} max={3} step={0.05} value={T} onChange={(e) => setIntT(parseFloat(e.target.value))} disabled={ctlT !== undefined} className="w-full mt-0.5" aria-label="Temperature" />
        </label>
        <label className="block">top-k: {K}
          <input type="range" min={1} max={RAW_LOGITS.length} step={1} value={K} onChange={(e) => setIntK(parseInt(e.target.value))} disabled={ctlK !== undefined} className="w-full mt-0.5" aria-label="top-k" />
        </label>
        <label className="block">top-p: {P.toFixed(2)}
          <input type="range" min={0.1} max={1} step={0.05} value={P} onChange={(e) => setIntP(parseFloat(e.target.value))} disabled={ctlP !== undefined} className="w-full mt-0.5" aria-label="top-p" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        LLM decoding: logits → softmax(logits / T) → mask (top-k +
        top-p) → renormalize → sample. T &lt; 1 sharpens (more
        deterministic, repetitive at T→0); T &gt; 1 flattens (more
        creative but incoherent). top-k (Fan-Lewis-Auli 2018) caps
        vocabulary; top-p / nucleus (Holtzman-Buys-Du-Forbes-Choi 2019)
        adapts to the distribution's shape — useful when only a few
        plausible tokens exist (low entropy) vs many (high). Modern
        defaults: T ≈ 0.7, top-p ≈ 0.9. Greedy/beam are used for
        deterministic tasks (code, math); sampling for open-ended
        generation. Min-p (Nguyen 2024) is a newer alternative to top-p.
      </div>
    </div>
  );
}
