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

const LESSONS_DIR = resolve(import.meta.dir, "../seed-content/lessons");
const OUTPUT_DIR = resolve(import.meta.dir, "../audit-output");

interface Slide {
  kind?: string;
  title?: string;
  body?: string;
  viz?: string;
  question?: { kind?: string; question?: string };
}

interface Lesson {
  slug?: string;
  meta?: { difficulty?: string; timeMinutes?: number };
  slides?: Slide[];
}

interface Score {
  file: string;
  slideCount: number;
  textSlideCount: number;
  questionSubkindCount: number;
  totalBodyWords: number;
  nameDropCount: number;
  hasViz: boolean;
  composite: number;
  flags: string[];
}

// Rough proper-noun detector: words that start with a capital and
// aren't sentence-initial. Counts unique tokens to avoid inflating
// scores via repetition.
function countNameDrops(text: string): number {
  const tokens = text.match(/(?<![.!?]\s)\b[A-Z][a-zA-Z'\-]{2,}\b/g) ?? [];
  return new Set(tokens).size;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function scoreLesson(file: string, raw: string): Score {
  const flags: string[] = [];
  let lesson: Lesson;
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
  const slides = lesson.slides ?? [];
  const slideCount = slides.length;
  const textSlides = slides.filter((s) => s.kind === "text");
  const textSlideCount = textSlides.length;
  const questionSubkinds = new Set(
    slides
      .filter((s) => s.kind === "question")
      .map((s) => s.question?.kind)
      .filter(Boolean) as string[],
  );
  const questionSubkindCount = questionSubkinds.size;
  const allBodies = textSlides.map((s) => s.body ?? "").join("\n");
  const totalBodyWords = wordCount(allBodies);
  const nameDropCount = countNameDrops(allBodies);
  const hasViz = slides.some((s) => Boolean(s.viz));

  // Flagging — what to surface for manual review
  if (slideCount < 6) flags.push("LOW_SLIDE_COUNT");
  if (textSlideCount < 3) flags.push("LOW_TEXT_SLIDE_COUNT");
  if (questionSubkindCount < 3) flags.push("LOW_QUESTION_VARIETY");
  if (totalBodyWords < 300) flags.push("LOW_BODY_WORDS");
  if (nameDropCount < 8) flags.push("LOW_NAME_DROPS");
  if (!hasViz) flags.push("NO_VIZ");

  // Composite — weighted sum normalized to 0-100
  const slideScore = Math.min(slideCount / 8, 1) * 15;
  const textScore = Math.min(textSlideCount / 3, 1) * 10;
  const questionScore = Math.min(questionSubkindCount / 5, 1) * 15;
  const wordScore = Math.min(totalBodyWords / 800, 1) * 30;
  const nameScore = Math.min(nameDropCount / 20, 1) * 25;
  const vizScore = hasViz ? 5 : 0;
  const composite = Math.round(
    slideScore + textScore + questionScore + wordScore + nameScore + vizScore,
  );

  return {
    file,
    slideCount,
    textSlideCount,
    questionSubkindCount,
    totalBodyWords,
    nameDropCount,
    hasViz,
    composite,
    flags,
  };
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
