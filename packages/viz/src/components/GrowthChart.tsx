import { useMemo, useState } from "react";

// WHO Child Growth Standards percentile chart. Plot a sample child's
// trajectory (weight, height, or BMI vs age) against the 3rd, 15th,
// 50th, 85th, 97th percentile curves; flag stunting + wasting
// thresholds (-2 SD). Pedagogical approximations of WHO 2006 LMS
// tables — not for clinical use.

const W = 460;
const H = 320;

type Metric = "weight-for-age" | "height-for-age" | "bmi-for-age";

interface Props {
  metric?: Metric;
}

// Stylized growth curves (boys 0-5 years). At each month, give the
// median + standard deviation in metric units; percentile = median +
// z * sd for canonical z-scores. Numbers are pedagogical
// approximations of WHO 2006 LMS tables.
const CURVES: Record<Metric, { unit: string; label: string; data: Array<{ month: number; median: number; sd: number }> }> = {
  "weight-for-age": {
    unit: "kg",
    label: "Weight-for-age (boys 0-5 yr)",
    data: [
      { month: 0, median: 3.3, sd: 0.45 },
      { month: 3, median: 6.4, sd: 0.7 },
      { month: 6, median: 7.9, sd: 0.85 },
      { month: 12, median: 9.6, sd: 1.0 },
      { month: 18, median: 10.9, sd: 1.1 },
      { month: 24, median: 12.2, sd: 1.2 },
      { month: 36, median: 14.3, sd: 1.4 },
      { month: 48, median: 16.3, sd: 1.6 },
      { month: 60, median: 18.3, sd: 1.8 },
    ],
  },
  "height-for-age": {
    unit: "cm",
    label: "Height-for-age (boys 0-5 yr)",
    data: [
      { month: 0, median: 49.9, sd: 1.9 },
      { month: 3, median: 61.4, sd: 2.0 },
      { month: 6, median: 67.6, sd: 2.2 },
      { month: 12, median: 75.7, sd: 2.4 },
      { month: 18, median: 82.3, sd: 2.6 },
      { month: 24, median: 87.8, sd: 2.8 },
      { month: 36, median: 96.1, sd: 3.2 },
      { month: 48, median: 103.3, sd: 3.6 },
      { month: 60, median: 110.0, sd: 4.0 },
    ],
  },
  "bmi-for-age": {
    unit: "kg/m²",
    label: "BMI-for-age (boys 2-5 yr)",
    data: [
      { month: 24, median: 16.0, sd: 0.9 },
      { month: 30, median: 15.7, sd: 0.9 },
      { month: 36, median: 15.5, sd: 1.0 },
      { month: 42, median: 15.4, sd: 1.0 },
      { month: 48, median: 15.3, sd: 1.0 },
      { month: 54, median: 15.2, sd: 1.0 },
      { month: 60, median: 15.3, sd: 1.0 },
    ],
  },
};

// Sample child trajectory — close to median, with a dip + recovery
const SAMPLE_CHILD: Record<Metric, Array<{ month: number; value: number }>> = {
  "weight-for-age": [
    { month: 0, value: 3.4 },
    { month: 3, value: 6.0 },
    { month: 6, value: 7.4 },
    { month: 12, value: 8.6 },
    { month: 18, value: 9.7 },
    { month: 24, value: 11.0 },
    { month: 36, value: 13.0 },
    { month: 48, value: 15.5 },
    { month: 60, value: 17.8 },
  ],
  "height-for-age": [
    { month: 0, value: 50.0 },
    { month: 6, value: 66.0 },
    { month: 12, value: 73.5 },
    { month: 18, value: 80.5 },
    { month: 24, value: 86.0 },
    { month: 36, value: 94.5 },
    { month: 48, value: 102.0 },
    { month: 60, value: 108.0 },
  ],
  "bmi-for-age": [
    { month: 24, value: 15.5 },
    { month: 36, value: 14.8 },
    { month: 48, value: 15.0 },
    { month: 60, value: 15.4 },
  ],
};

// Find percentile at age for value, using linear interpolation between curve points
function zScoreAt(curve: { data: Array<{ month: number; median: number; sd: number }> }, month: number, value: number): number | null {
  const d = curve.data;
  let i = 0;
  while (i < d.length - 1 && d[i + 1].month < month) i++;
  if (month < d[0].month || month > d[d.length - 1].month) return null;
  const t = (month - d[i].month) / Math.max(1, d[i + 1].month - d[i].month);
  const med = d[i].median * (1 - t) + d[i + 1].median * t;
  const sd = d[i].sd * (1 - t) + d[i + 1].sd * t;
  return (value - med) / sd;
}

export function GrowthChart({ metric: ctlMetric }: Props = {}) {
  const [intMetric, setIntMetric] = useState<Metric>("weight-for-age");
  const metric = ctlMetric ?? intMetric;
  const curve = CURVES[metric];
  const sample = SAMPLE_CHILD[metric];

  const baseX = 36;
  const baseY = 20;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 90;
  const monthMin = curve.data[0].month;
  const monthMax = curve.data[curve.data.length - 1].month;
  const valMin = Math.min(...curve.data.map((d) => d.median - 3 * d.sd));
  const valMax = Math.max(...curve.data.map((d) => d.median + 3 * d.sd));
  const xOf = (m: number) => baseX + ((m - monthMin) / (monthMax - monthMin)) * plotW;
  const yOf = (v: number) => baseY + plotH - ((v - valMin) / (valMax - valMin)) * plotH;

  // Build percentile curves (3rd, 15th, 50th, 85th, 97th)
  const PERCENTILES = [
    { z: -1.881, label: "3rd", color: "#ff6b6b" },
    { z: -1.036, label: "15th", color: "#fbbf24" },
    { z: 0, label: "50th", color: "#4ecdc4" },
    { z: 1.036, label: "85th", color: "#fbbf24" },
    { z: 1.881, label: "97th", color: "#ff6b6b" },
  ];

  const curves = useMemo(() => PERCENTILES.map((p) => ({
    z: p.z,
    label: p.label,
    color: p.color,
    points: curve.data.map((d) => ({ month: d.month, value: d.median + p.z * d.sd })),
  })), [curve]);

  // Latest sample reading
  const latest = sample[sample.length - 1];
  const latestZ = zScoreAt(curve, latest.month, latest.value);
  const latestStatus = latestZ === null ? "—" : latestZ < -2 ? (metric === "height-for-age" ? "stunted" : "wasted") : latestZ < -1 ? "low" : latestZ > 2 ? "high" : "normal";
  const statusColor = latestZ === null ? "#9aa3b8" : latestZ < -2 || latestZ > 2 ? "#ff6b6b" : latestZ < -1 || latestZ > 1 ? "#fbbf24" : "#4ecdc4";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{curve.label} · latest z = {latestZ?.toFixed(2) ?? "—"} · <span style={{ color: statusColor }}>{latestStatus}</span></div>
        <div className="flex gap-1">
          {(Object.keys(CURVES) as Metric[]).map((m) => (
            <button key={m} onClick={() => setIntMetric(m)} disabled={ctlMetric !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${metric === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m.split("-")[0]}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Growth chart">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Percentile curves */}
        {curves.map((c) => (
          <g key={c.label}>
            <path d={c.points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.month).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ")} fill="none" stroke={c.color} strokeWidth={c.label === "50th" ? 1.5 : 0.8} strokeOpacity={c.label === "50th" ? 0.9 : 0.5} />
            <text x={baseX + plotW + 2} y={yOf(c.points[c.points.length - 1].value) + 3} fill={c.color} fontSize="8">{c.label}</text>
          </g>
        ))}
        {/* Sample child trajectory */}
        <path d={sample.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.month).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ")} fill="none" stroke="#a78bfa" strokeWidth={2.2} />
        {sample.map((p, i) => (
          <circle key={i} cx={xOf(p.month)} cy={yOf(p.value)} r={3} fill="#a78bfa" />
        ))}
        {/* Axis labels */}
        <text x={baseX + plotW / 2} y={H - 64} fill="#cbd1e6" fontSize="9" textAnchor="middle">age (months)</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>{curve.unit}</text>
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        WHO Child Growth Standards (2006) define normal growth for
        healthy breastfed children from six countries (Brazil, Ghana,
        India, Norway, Oman, USA). Percentile curves are derived from
        LMS smoothing of measured anthropometry. Cut-offs:
        weight-for-age &lt; -2 SD = <b>underweight</b>; height-for-age
        &lt; -2 SD = <b>stunted</b> (chronic malnutrition); weight-for-
        height &lt; -2 SD = <b>wasted</b> (acute). BMI-for-age &gt;+2 SD
        = overweight; &gt;+3 = obese. Stunting prevalence remains
        ~22% of under-5s globally (UNICEF/WHO/WB Joint Malnutrition
        2023). CDC charts (2000) are also used in the US but reflect
        a heterogeneous cohort. Tanner staging (1969-70) handles puberty.
      </div>
    </div>
  );
}
