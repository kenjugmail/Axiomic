#!/usr/bin/env bun
// Lesson quality auditor. Walks seed-content/lessons/*.json and grades
// each lesson on a fixed rubric (slide count, body word density,
// name-drop density, question-subkind variety, viz embed). Outputs
// a sorted-by-score markdown punch list + a machine-readable CSV.
//
// Usage: bun run audit:lessons
// Outputs: audit-output/lesson-audit.md + audit-output/lesson-audit.csv

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import {
  scoreLessonContent,
  type LessonScoreMetrics,
  type ScorableLesson,
} from "../apps/server/src/lib/lessonQuality";

const LESSONS_DIR = resolve(import.meta.dir, "../seed-content/lessons");
const OUTPUT_DIR = resolve(import.meta.dir, "../audit-output");

interface Score extends LessonScoreMetrics {
  file: string;
}

// File-walk wrapper around the shared rubric (scoreLessonContent). The
// only file-specific concern here is reporting a parse failure as
// INVALID_JSON; everything else is the shared scorer.
function scoreLesson(file: string, raw: string): Score {
  let lesson: ScorableLesson;
  try {
    lesson = JSON.parse(raw);
  } catch {
    return {
      file,
      slideCount: 0,
      textSlideCount: 0,
      questionSubkindCount: 0,
      totalBodyWords: 0,
      nameDropCount: 0,
      hasViz: false,
      composite: 0,
      flags: ["INVALID_JSON"],
    };
  }
  return { file, ...scoreLessonContent(lesson) };
}

function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith(".json"));
  const scores: Score[] = [];
  for (const f of files) {
    const raw = readFileSync(join(LESSONS_DIR, f), "utf-8");
    scores.push(scoreLesson(f, raw));
  }
  scores.sort((a, b) => a.composite - b.composite);

  // Summary stats
  const n = scores.length;
  const avg = Math.round(scores.reduce((s, x) => s + x.composite, 0) / Math.max(n, 1));
  const median = scores[Math.floor(n / 2)]?.composite ?? 0;
  const broken = scores.filter((s) => s.flags.includes("INVALID_JSON")).length;
  const lowBody = scores.filter((s) => s.flags.includes("LOW_BODY_WORDS")).length;
  const noViz = scores.filter((s) => s.flags.includes("NO_VIZ")).length;

  // Markdown report
  const md: string[] = [];
  md.push(`# Lesson Quality Audit\n`);
  md.push(`Walked ${n} lesson JSONs in seed-content/lessons/.\n`);
  md.push(`## Summary\n`);
  md.push(`- Average composite: **${avg}** / 100`);
  md.push(`- Median composite: **${median}**`);
  md.push(`- INVALID_JSON: ${broken}`);
  md.push(`- LOW_BODY_WORDS (<300 words across text slides): ${lowBody}`);
  md.push(`- NO_VIZ (no interactive embed): ${noViz}\n`);

  md.push(`## Bottom 20 — most-improvable\n`);
  md.push(`| Score | File | Words | Names | Flags |`);
  md.push(`|---|---|---|---|---|`);
  for (const s of scores.slice(0, 20)) {
    md.push(
      `| ${s.composite} | ${s.file} | ${s.totalBodyWords} | ${s.nameDropCount} | ${s.flags.join(", ") || "—"} |`,
    );
  }

  md.push(`\n## Top 20 — strongest\n`);
  md.push(`| Score | File | Words | Names | Subkinds | Viz |`);
  md.push(`|---|---|---|---|---|---|`);
  for (const s of scores.slice(-20).reverse()) {
    md.push(
      `| ${s.composite} | ${s.file} | ${s.totalBodyWords} | ${s.nameDropCount} | ${s.questionSubkindCount} | ${s.hasViz ? "✓" : "—"} |`,
    );
  }

  md.push(`\n## All lessons (alphabetical)\n`);
  md.push(`| File | Score | Slides | Text | Q-subkinds | Words | Names | Viz | Flags |`);
  md.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const s of [...scores].sort((a, b) => a.file.localeCompare(b.file))) {
    md.push(
      `| ${s.file} | ${s.composite} | ${s.slideCount} | ${s.textSlideCount} | ${s.questionSubkindCount} | ${s.totalBodyWords} | ${s.nameDropCount} | ${s.hasViz ? "✓" : "—"} | ${s.flags.join(", ") || "—"} |`,
    );
  }

  writeFileSync(join(OUTPUT_DIR, "lesson-audit.md"), md.join("\n") + "\n");

  // CSV
  const csv: string[] = [];
  csv.push("file,composite,slideCount,textSlideCount,questionSubkindCount,totalBodyWords,nameDropCount,hasViz,flags");
  for (const s of scores) {
    csv.push(
      `${s.file},${s.composite},${s.slideCount},${s.textSlideCount},${s.questionSubkindCount},${s.totalBodyWords},${s.nameDropCount},${s.hasViz ? 1 : 0},${s.flags.join("|")}`,
    );
  }
  writeFileSync(join(OUTPUT_DIR, "lesson-audit.csv"), csv.join("\n") + "\n");

  console.log(`Audited ${n} lessons. Avg ${avg}/100, median ${median}.`);
  console.log(`  Bottom 5 (worst):`);
  for (const s of scores.slice(0, 5)) {
    console.log(`    ${s.composite.toString().padStart(3)} · ${s.file} · flags: ${s.flags.join(", ")}`);
  }
  console.log(`  Top 5 (best):`);
  for (const s of scores.slice(-5).reverse()) {
    console.log(`    ${s.composite.toString().padStart(3)} · ${s.file}`);
  }
  console.log(`\nReport: audit-output/lesson-audit.md`);
  console.log(`CSV: audit-output/lesson-audit.csv`);
}

main();
