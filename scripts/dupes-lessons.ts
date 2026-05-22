#!/usr/bin/env bun
// Report near-duplicate lessons by embedding similarity. Thin wrapper around
// findLessonDuplicates() (which holds the workspace-package imports).
//
// Usage: bun run dupes:lessons

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { findLessonDuplicates } from "../apps/server/src/lib/lessonDupes";

const THRESHOLD = 0.9;
const OUT_DIR = resolve(import.meta.dir, "../audit-output");

const { pairs, count } = await findLessonDuplicates(THRESHOLD);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const md: string[] = [];
md.push(`# Lesson Near-Duplicate Report\n`);
md.push(`Embedded ${count} lessons; ${pairs.length} pair(s) at cosine ≥ ${THRESHOLD}.\n`);
if (pairs.length === 0) {
  md.push(`No near-duplicate pairs above the threshold. ✓`);
} else {
  md.push(`| similarity | lesson A | lesson B |`);
  md.push(`|---|---|---|`);
  for (const p of pairs.slice(0, 50)) {
    md.push(`| ${p.sim.toFixed(3)} | ${p.a} | ${p.b} |`);
  }
}
writeFileSync(resolve(OUT_DIR, "lesson-dupes.md"), md.join("\n") + "\n");

console.log(`Embedded ${count} lessons. ${pairs.length} pair(s) at cosine ≥ ${THRESHOLD}.`);
for (const p of pairs.slice(0, 10)) {
  console.log(`  ${p.sim.toFixed(3)}  ${p.a}  ~  ${p.b}`);
}
console.log(`\nReport: audit-output/lesson-dupes.md`);
