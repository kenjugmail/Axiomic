// Curriculum prerequisite-graph validation. Reads every mastery node from
// the DB (prereqs live in the `prerequisite_node_ids` JSON column) and
// reports structural problems: dangling references, cross-path edges, and —
// most importantly — cycles, which would make a path impossible to complete
// in order. Run against a FRESHLY SEEDED database (via `bun run check:prereqs`
// in CI right after seed) rather than the shared, test-mutated unit-test DB.

import { getDb, masteryNodes } from "@axiomic/db";

interface Node {
  id: string;
  slug: string;
  pathId: string;
  prereqs: string[];
}

export interface PrereqViolations {
  nodeCount: number;
  dangling: string[];
  crossPath: string[];
  cycle: string[] | null;
}

function loadGraph(): Node[] {
  const rows = getDb()
    .select({
      id: masteryNodes.id,
      slug: masteryNodes.slug,
      pathId: masteryNodes.pathId,
      pre: masteryNodes.prerequisiteNodeIds,
    })
    .from(masteryNodes)
    .all();
  return rows.map((r) => {
    let prereqs: string[] = [];
    try {
      const p = JSON.parse(r.pre || "[]");
      if (Array.isArray(p)) prereqs = p.filter((x): x is string => typeof x === "string");
    } catch {
      /* leave empty */
    }
    return { id: r.id, slug: r.slug, pathId: r.pathId, prereqs };
  });
}

export function validatePrereqGraph(): PrereqViolations {
  const nodes = loadGraph();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const dangling: string[] = [];
  const crossPath: string[] = [];
  for (const n of nodes) {
    for (const p of n.prereqs) {
      const pn = byId.get(p);
      if (!pn) dangling.push(`${n.slug} → ${p}`);
      else if (pn.pathId !== n.pathId) crossPath.push(`${n.slug} → ${pn.slug}`);
    }
  }

  // Cycle detection (DFS with on-stack coloring).
  const color = new Map<string, number>(); // 0 unvisited, 1 on-stack, 2 done
  const stack: string[] = [];
  let cycle: string[] | null = null;
  const dfs = (u: string) => {
    if (cycle) return;
    color.set(u, 1);
    stack.push(u);
    for (const v of byId.get(u)?.prereqs ?? []) {
      if (!byId.has(v)) continue;
      const c = color.get(v) ?? 0;
      if (c === 1) {
        const i = stack.indexOf(v);
        cycle = stack.slice(i).map((id) => byId.get(id)!.slug);
        return;
      }
      if (c === 0) {
        dfs(v);
        if (cycle) return;
      }
    }
    stack.pop();
    color.set(u, 2);
  };
  for (const n of nodes) {
    if ((color.get(n.id) ?? 0) === 0) {
      dfs(n.id);
      if (cycle) break;
    }
  }

  return { nodeCount: nodes.length, dangling, crossPath, cycle };
}
