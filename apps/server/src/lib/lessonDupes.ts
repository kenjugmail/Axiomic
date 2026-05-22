// Near-duplicate lesson detection. The structural auditor can't tell that
// two lessons say nearly the same thing; this embeds every lesson's text
// (reusing the embedding cache + the configured AI provider) and reports
// pairs whose cosine similarity exceeds a threshold. The mock provider's
// TF-IDF embeddings already make lexical near-duplicates stand out, so this
// runs key-free in dev/CI. Invoked by `bun run dupes:lessons`.

import { readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { bulkGetOrEmbed } from "./embeddingCache";

const LESSONS_DIR = resolve(import.meta.dir, "../../../../seed-content/lessons");

export interface DupePair {
  a: string;
  b: string;
  sim: number;
}

// Inlined (rather than importing from searchIndex.ts, which would pull in
// the whole search-index module + its side effects).
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function lessonText(json: { slides?: Array<{ kind?: string; title?: string; body?: string }> }): string {
  const slides = json.slides ?? [];
  return slides
    .filter((s) => s.kind === "text")
    .map((s) => `${s.title ?? ""} ${s.body ?? ""}`)
    .join("\n")
    .slice(0, 8000);
}

export async function findLessonDuplicates(
  threshold = 0.92,
): Promise<{ pairs: DupePair[]; count: number }> {
  const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith(".json"));
  const items: Array<{ kind: "lesson"; id: string; text: string }> = [];
  for (const f of files) {
    let json: ReturnType<typeof JSON.parse>;
    try {
      json = JSON.parse(readFileSync(join(LESSONS_DIR, f), "utf-8"));
    } catch {
      continue;
    }
    const text = lessonText(json);
    if (text.trim().length < 40) continue;
    items.push({ kind: "lesson", id: f.replace(/\.json$/, ""), text });
  }

  const vecs = await bulkGetOrEmbed(items);
  const pairs: DupePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = cosineSimilarity(vecs[i], vecs[j]);
      if (sim >= threshold) pairs.push({ a: items[i].id, b: items[j].id, sim });
    }
  }
  pairs.sort((x, y) => y.sim - x.sim);
  return { pairs, count: items.length };
}
