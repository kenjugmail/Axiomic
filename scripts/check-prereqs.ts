#!/usr/bin/env bun
// Validate the curriculum prerequisite graph against the current DB.
// Run in CI right after `db:seed` (a clean, unpolluted graph) and locally
// after a fresh seed. Exits non-zero (printing the offending edges/cycle)
// on any dangling reference, cross-path edge, or cycle.
//
// Usage: bun run check:prereqs

import { validatePrereqGraph } from "../apps/server/src/lib/prereqGraph";

const v = validatePrereqGraph();
let bad = false;

if (v.dangling.length) {
  console.error(`Dangling prereq references (${v.dangling.length}):`);
  for (const d of v.dangling.slice(0, 50)) console.error(`  ${d}`);
  bad = true;
}
if (v.crossPath.length) {
  console.error(`Cross-path prereq edges (${v.crossPath.length}):`);
  for (const c of v.crossPath.slice(0, 50)) console.error(`  ${c}`);
  bad = true;
}
if (v.cycle) {
  console.error(`Prereq cycle: ${v.cycle.join(" → ")} → ${v.cycle[0]}`);
  bad = true;
}

if (bad) {
  console.error(`\n✗ prereq graph invalid (${v.nodeCount} nodes checked).`);
  process.exit(1);
}
console.log(
  `✓ prereq graph OK — ${v.nodeCount} nodes, no cycles / dangling / cross-path edges.`,
);
