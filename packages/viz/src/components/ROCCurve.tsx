import { useMemo, useState } from "react";

// Interactive ROC curve + confusion matrix for binary classification.
// Two overlapping Gaussian populations (positives + negatives) with
// adjustable mean separation + sample size. Drag a threshold slider
// to see sensitivity / specificity / PPV / NPV at that operating
// point + the corresponding point on the full ROC curve. AUC
// computed via trapezoidal integration of the ROC.
//
// Use cases: medical diagnostic test design, ML binary classifier
// evaluation, signal-detection theory, risk-stratification cutoffs.

const N_PER_CLASS = 200;
const SAMPLES = 50; // ROC resolution

type Distribution = number[];

// Reproducible Gaussian: Box-Muller with seeded PRNG.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function gaussianSamples(mean: number, sd: number, n: number, seed: number): Distribution {
  const r = seeded(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(r(), 1e-9);
    const u2 = r();
    const mag = sd * Math.sqrt(-2 * Math.log(u1));
    out.push(mean + mag * Math.cos(2 * Math.PI * u2));
    if (out.length < n) out.push(mean + mag * Math.sin(2 * Math.PI * u2));
  }
  return out.slice(0, n);
}

function rocPoint(neg: Distribution, pos: Distribution, threshold: number) {
  // Predict positive when value >= threshold
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const x of pos) (x >= threshold ? tp++ : fn++);
  for (const x of neg) (x >= threshold ? fp++ : tn++);
  const sens = tp / (tp + fn || 1);
  const spec = tn / (tn + fp || 1);
  const ppv = tp / (tp + fp || 1);
  const npv = tn / (tn + fn || 1);
  const fpr = 1 - spec;
  return { tp, fp, tn, fn, sens, spec, ppv, npv, fpr };
}

const W = 380;
const H = 200;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 28;

interface Props {
  separation?: number;     // distance between class means
  prevalence?: number;     // base rate of positives (0-1)
  threshold?: number;      // initial decision threshold
}

export function ROCCurve({
  separation: ctlSep,
  prevalence: ctlPrev,
  threshold: ctlThresh,
}: Props = {}) {
  const [internalSep, setInternalSep] = useState(1.8);
  const [internalPrev, setInternalPrev] = useState(0.3);
  const [internalThresh, setInternalThresh] = useState(0.5);

  const sep = ctlSep ?? internalSep;
  const prevalence = ctlPrev ?? internalPrev;
  const threshold = ctlThresh ?? internalThresh;

  const nPos = Math.max(20, Math.round(N_PER_CLASS * prevalence * 2));
  const nNeg = Math.max(20, Math.round(N_PER_CLASS * (1 - prevalence) * 2));

  const { neg, pos, histNeg, histPos, xMin, xMax, rocCurve, auc, point } = useMemo(() => {
    const neg = gaussianSamples(0, 1, nNeg, 42);
    const pos = gaussianSamples(sep, 1, nPos, 137);

    const all = [...neg, ...pos];
    const xMin = Math.min(...all) - 0.2;
    const xMax = Math.max(...all) + 0.2;

    // Build ROC curve by sweeping threshold across the value range
    const xRange = xMax - xMin;
    const roc: Array<{ fpr: number; sens: number }> = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = xMin + (xRange * (SAMPLES - i)) / SAMPLES; // descending → ROC walks from (0,0) to (1,1)
      const p = rocPoint(neg, pos, t);
      roc.push({ fpr: p.fpr, sens: p.sens });
    }
    // Ensure monotonic (sort by fpr for trapezoidal AUC)
    roc.sort((a, b) => a.fpr - b.fpr);
    let auc = 0;
    for (let i = 1; i < roc.length; i++) {
      auc += ((roc[i]!.fpr - roc[i - 1]!.fpr) * (roc[i]!.sens + roc[i - 1]!.sens)) / 2;
    }

    // Histogram for distribution display
    const nBins = 28;
    const histNeg: number[] = Array(nBins).fill(0);
    const histPos: number[] = Array(nBins).fill(0);
    for (const x of neg) {
      const b = Math.max(0, Math.min(nBins - 1, Math.floor(((x - xMin) / xRange) * nBins)));
      histNeg[b]!++;
    }
    for (const x of pos) {
      const b = Math.max(0, Math.min(nBins - 1, Math.floor(((x - xMin) / xRange) * nBins)));
      histPos[b]!++;
    }

    // Actual threshold value in same units as samples (slider in 0..1 maps to xMin..xMax)
    const tVal = xMin + threshold * xRange;
    const point = rocPoint(neg, pos, tVal);

    return { neg, pos, histNeg, histPos, xMin, xMax, rocCurve: roc, auc, point };
  }, [sep, prevalence, threshold, nPos, nNeg]);

  // Distribution plot
  const xToPxDist = (x: number) =>
    PAD_L + ((x - xMin) / (xMax - xMin)) * (W - PAD_L - PAD_R);
  const maxBin = Math.max(...histNeg, ...histPos, 1);
  const yToPxDist = (count: number) =>
    H - PAD_B - (count / maxBin) * (H - PAD_T - PAD_B);

  const nBins = histNeg.length;
  const binW = (W - PAD_L - PAD_R) / nBins;
  const tValDist = xMin + threshold * (xMax - xMin);
  const xThreshPx = xToPxDist(tValDist);

  // ROC plot — separate small panel
  const RW = 200;
  const RH = 180;
  const RPAD_L = 30;
  const RPAD_R = 8;
  const RPAD_T = 6;
  const RPAD_B = 22;
  const rsx = (fpr: number) =>
    RPAD_L + fpr * (RW - RPAD_L - RPAD_R);
  const rsy = (sens: number) =>
    RH - RPAD_B - sens * (RH - RPAD_T - RPAD_B);
  const rocPath = rocCurve
    .map((p, i) => `${i === 0 ? "M" : "L"}${rsx(p.fpr).toFixed(1)},${rsy(p.sens).toFixed(1)}`)
    .join(" ");

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">ROC curve + confusion matrix</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag class separation, prevalence, decision threshold. AUC + sens + spec recompute live.
        </p>
      </div>
      <div className="p-4 space-y-3">
        {/* Distribution histogram with movable threshold */}
        <div className="rounded-md border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Score distributions (red = positive, blue = negative)</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
            <text x={W / 2} y={H - 6} fontSize="9" textAnchor="middle" className="fill-muted-foreground">Score</text>
            <text x={10} y={H / 2} fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} className="fill-muted-foreground">Count</text>

            {histNeg.map((c, i) => (
              <rect key={`n${i}`} x={PAD_L + i * binW} y={yToPxDist(c)} width={Math.max(binW - 1, 1)} height={H - PAD_B - yToPxDist(c)} fill="currentColor" className="text-sky-500/40" />
            ))}
            {histPos.map((c, i) => (
              <rect key={`p${i}`} x={PAD_L + i * binW} y={yToPxDist(c)} width={Math.max(binW - 1, 1)} height={H - PAD_B - yToPxDist(c)} fill="currentColor" className="text-rose-500/40" />
            ))}
            {/* threshold line */}
            <line x1={xThreshPx} y1={PAD_T} x2={xThreshPx} y2={H - PAD_B} stroke="currentColor" strokeWidth="1.4" className="text-foreground" />
            <text x={xThreshPx + 4} y={PAD_T + 9} fontSize="9" className="fill-foreground font-medium">τ</text>
          </svg>
        </div>

        {/* ROC + confusion matrix side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">ROC (AUC = {auc.toFixed(3)})</div>
            <svg viewBox={`0 0 ${RW} ${RH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
              {/* axes */}
              <line x1={RPAD_L} y1={RH - RPAD_B} x2={RW - RPAD_R} y2={RH - RPAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              <line x1={RPAD_L} y1={RPAD_T} x2={RPAD_L} y2={RH - RPAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              {/* diagonal */}
              <line x1={rsx(0)} y1={rsy(0)} x2={rsx(1)} y2={rsy(1)} stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-muted-foreground/50" />
              {/* curve */}
              <path d={rocPath} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-primary" />
              {/* operating point */}
              <circle cx={rsx(point.fpr)} cy={rsy(point.sens)} r="3.4" fill="currentColor" className="text-foreground" />
              {/* labels */}
              <text x={RW / 2} y={RH - 6} fontSize="8" textAnchor="middle" className="fill-muted-foreground">FPR</text>
              <text x={10} y={RH / 2} fontSize="8" textAnchor="middle" transform={`rotate(-90 10 ${RH / 2})`} className="fill-muted-foreground">TPR (Sens)</text>
            </svg>
          </div>
          <div className="rounded-md border border-border bg-background p-2 text-[11px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confusion @ τ</div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              <div></div>
              <div className="text-center text-muted-foreground">Pred +</div>
              <div className="text-center text-muted-foreground">Pred −</div>
              <div className="text-muted-foreground">Actual +</div>
              <div className="text-center tabular-nums font-medium bg-emerald-500/15 rounded">{point.tp}</div>
              <div className="text-center tabular-nums bg-rose-500/15 rounded">{point.fn}</div>
              <div className="text-muted-foreground">Actual −</div>
              <div className="text-center tabular-nums bg-rose-500/15 rounded">{point.fp}</div>
              <div className="text-center tabular-nums font-medium bg-emerald-500/15 rounded">{point.tn}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-border">
              <div className="text-muted-foreground">Sensitivity</div>
              <div className="tabular-nums font-medium text-right">{(point.sens * 100).toFixed(1)}%</div>
              <div className="text-muted-foreground">Specificity</div>
              <div className="tabular-nums font-medium text-right">{(point.spec * 100).toFixed(1)}%</div>
              <div className="text-muted-foreground">PPV</div>
              <div className="tabular-nums font-medium text-right">{(point.ppv * 100).toFixed(1)}%</div>
              <div className="text-muted-foreground">NPV</div>
              <div className="tabular-nums font-medium text-right">{(point.npv * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* sliders */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Class separation</span>
              <span className="tabular-nums font-medium">{sep.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={sep}
              onChange={(e) => (ctlSep === undefined) && setInternalSep(parseFloat(e.target.value))}
              disabled={ctlSep !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Prevalence</span>
              <span className="tabular-nums font-medium">{(prevalence * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.01}
              value={prevalence}
              onChange={(e) => (ctlPrev === undefined) && setInternalPrev(parseFloat(e.target.value))}
              disabled={ctlPrev !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Threshold τ</span>
              <span className="tabular-nums font-medium">{threshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.02}
              max={0.98}
              step={0.01}
              value={threshold}
              onChange={(e) => (ctlThresh === undefined) && setInternalThresh(parseFloat(e.target.value))}
              disabled={ctlThresh !== undefined}
              className="w-full accent-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
