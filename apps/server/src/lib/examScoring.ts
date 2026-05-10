// Sprint 73 — Exam scoring.
//
// Each exam stores a `scoringJson` blob shaped:
//
//   {
//     sections?: { [sectionSlug]: SectionScoring },
//     overall?: SectionScoring,
//   }
//
// We do raw → scaled with linear interpolation rather than a fitted
// IRT model. v1 is good enough for the per-section breakdown the
// score-report card needs; an IRT-based score is a follow-up if
// users complain that the percentile is off.

export interface SectionScoring {
  scaledTable: Array<{ raw: number; scaled: number }>;
  percentileTable?: Array<{ scaled: number; percentile: number }>;
  min: number;
  max: number;
}

export interface ExamScoringConfig {
  sections?: Record<string, SectionScoring>;
  overall?: SectionScoring;
}

export interface SectionResult {
  raw: number;
  scaled: number;
  percentile: number | null;
}

export interface ExamResult {
  rawTotal: number;
  scaledTotal: number;
  percentileTotal: number | null;
  sections: Record<string, SectionResult>;
}

// Linear interpolation between the two surrounding rows of a sorted
// table. Saturates at the table edges.
function interpolate(
  table: Array<{ x: number; y: number }>,
  x: number,
): number {
  if (table.length === 0) return 0;
  const sorted = [...table].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (x >= a.x && x <= b.x) {
      // Defensive: a malformed scoring config with two anchors at the
      // same x would otherwise divide by zero and persist NaN as the
      // scaled score. Fall through to the lower anchor's y.
      if (b.x === a.x) return a.y;
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return sorted[sorted.length - 1].y;
}

export function rawToScaled(
  raw: number,
  scoring: SectionScoring,
): number {
  const y = interpolate(
    scoring.scaledTable.map((p) => ({ x: p.raw, y: p.scaled })),
    raw,
  );
  return Math.round(Math.min(scoring.max, Math.max(scoring.min, y)));
}

export function scaledToPercentile(
  scaled: number,
  scoring: SectionScoring,
): number | null {
  if (!scoring.percentileTable || scoring.percentileTable.length === 0) {
    return null;
  }
  const y = interpolate(
    scoring.percentileTable.map((p) => ({ x: p.scaled, y: p.percentile })),
    scaled,
  );
  return Math.round(Math.min(99, Math.max(1, y)));
}

export interface SectionRaw {
  sectionSlug: string;
  raw: number;
}

export function scoreExam(
  rawByExamSection: SectionRaw[],
  config: ExamScoringConfig,
): ExamResult {
  const sections: Record<string, SectionResult> = {};
  let scaledTotal = 0;
  let rawTotal = 0;
  for (const r of rawByExamSection) {
    rawTotal += r.raw;
    const cfg = config.sections?.[r.sectionSlug];
    if (!cfg) {
      sections[r.sectionSlug] = {
        raw: r.raw,
        scaled: r.raw,
        percentile: null,
      };
      scaledTotal += r.raw;
      continue;
    }
    const scaled = rawToScaled(r.raw, cfg);
    const percentile = scaledToPercentile(scaled, cfg);
    sections[r.sectionSlug] = { raw: r.raw, scaled, percentile };
    scaledTotal += scaled;
  }

  let scaledForOverall = scaledTotal;
  let percentileTotal: number | null = null;
  if (config.overall) {
    scaledForOverall = Math.round(
      Math.min(
        config.overall.max,
        Math.max(config.overall.min, scaledTotal),
      ),
    );
    percentileTotal = scaledToPercentile(scaledForOverall, config.overall);
  }

  return {
    rawTotal,
    scaledTotal: scaledForOverall,
    percentileTotal,
    sections,
  };
}
