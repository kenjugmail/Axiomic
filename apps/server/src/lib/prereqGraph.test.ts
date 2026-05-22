// CI guard for the curriculum's prerequisite graph. The structural auditor
// scores individual lessons; this validates the *edges between* them. Reads
// every mastery node from the seeded DB (prereqs live in the
// `prerequisite_node_ids` JSON column) and asserts the graph is sane: no
// dangling references, no cross-path edges, and — most importantly — no
// cycles (which would make a path impossible to complete in order).

import { describe, test, expect } from "bun:test";
import { getDb, masteryNodes } from "@axiomic/db";

interface Node {
  id: string;
  slug: string;
  pathId: string;
  prereqs: string[];
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

describe("mastery prereq graph", () => {
  const nodes = loadGraph();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  test("the seed produced a non-trivial graph", () => {
    expect(nodes.length).toBeGreaterThan(100);
  });

  test("no prereq references a missing node (no dangling edges)", () => {
    const dangling: string[] = [];
    for (const n of nodes)
      for (const p of n.prereqs) if (!byId.has(p)) dangling.push(`${n.slug} → ${p}`);
    expect(dangling).toEqual([]);
  });

  test("prereqs stay within the same path", () => {
    const cross: string[] = [];
    for (const n of nodes)
      for (const p of n.prereqs) {
        const pn = byId.get(p);
        if (pn && pn.pathId !== n.pathId) cross.push(`${n.slug} → ${pn.slug}`);
      }
    expect(cross).toEqual([]);
  });

  test("the prereq graph is acyclic", () => {
    const color = new Map<string, number>(); // 0 = unvisited, 1 = on stack, 2 = done
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
    expect(cycle).toBeNull();
  });
});
