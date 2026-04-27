import { getDb, wikiPages, pageVersions, masteryPaths, masteryNodes } from "./index";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const db = getDb();

async function seed() {
  console.log("Seeding database...");

  const seedDir = path.join(import.meta.dir, "../../../seed-content/pages");
  if (!fs.existsSync(seedDir)) {
    console.log("No seed content directory found. Skipping wiki page seeding.");
    return;
  }

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} seed pages.`);

  for (const file of files) {
    const slug = file.replace(".md", "");
    const content = fs.readFileSync(path.join(seedDir, file), "utf-8");

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`Skipping ${file}: no frontmatter found.`);
      continue;
    }

    const frontmatter = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    const title = frontmatter.match(/title:\s*(.+)/)?.[1]?.trim() || slug;
    const category = frontmatter.match(/category:\s*(.+)/)?.[1]?.trim() || "uncategorized";

    // Split body into tiers by markers
    const tiers = parseTiers(body);

    const pageId = randomUUID();
    const versionId = randomUUID();

    // Check if page already exists
    const existing = db.select().from(wikiPages).where(
      // @ts-ignore
      (row: any) => row.slug === slug
    ).get();

    if (existing) {
      console.log(`  Page "${slug}" already exists, skipping.`);
      continue;
    }

    db.insert(wikiPages).values({
      id: pageId,
      slug,
      title,
      category,
      currentVersion: 1,
    }).run();

    db.insert(pageVersions).values({
      id: versionId,
      pageId,
      version: 1,
      contentIntro: tiers.intro,
      contentUndergrad: tiers.undergrad,
      contentGrad: tiers.grad,
      editMessage: "Initial seed content",
    }).run();

    console.log(`  Seeded: ${title}`);
  }

  // Seed mastery paths
  seedMasteryPaths();

  console.log("Seeding complete.");
}

function parseTiers(body: string): { intro: string; undergrad: string; grad: string } {
  const introMarker = "<!-- tier:intro -->";
  const undergradMarker = "<!-- tier:undergrad -->";
  const gradMarker = "<!-- tier:grad -->";

  const introStart = body.indexOf(introMarker);
  const undergradStart = body.indexOf(undergradMarker);
  const gradStart = body.indexOf(gradMarker);

  if (introStart === -1 || undergradStart === -1 || gradStart === -1) {
    // If no tier markers, use the whole body for all tiers
    return { intro: body.trim(), undergrad: body.trim(), grad: body.trim() };
  }

  return {
    intro: body.slice(introStart + introMarker.length, undergradStart).trim(),
    undergrad: body.slice(undergradStart + undergradMarker.length, gradStart).trim(),
    grad: body.slice(gradStart + gradMarker.length).trim(),
  };
}

function seedMasteryPaths() {
  const pathId = randomUUID();

  const existing = db.select().from(masteryPaths).all();
  if (existing.length > 0) {
    console.log("  Mastery paths already exist, skipping.");
    return;
  }

  db.insert(masteryPaths).values({
    id: pathId,
    slug: "ml-engineer",
    title: "ML Engineer",
    description: "From fundamentals to modern transformer architectures. Master the theory and practice of machine learning.",
  }).run();

  const nodes = [
    { slug: "tokens-basics", title: "Tokens & Text Representation", level: "apprentice", order: 1, pages: ["tokens"], prereqs: [] },
    { slug: "embeddings-basics", title: "Word Embeddings", level: "apprentice", order: 2, pages: ["embeddings"], prereqs: ["tokens-basics"] },
    { slug: "bpe-tokenization", title: "BPE Tokenization", level: "apprentice", order: 3, pages: ["bpe-tokenization"], prereqs: ["tokens-basics"] },
    { slug: "positional-encoding", title: "Positional Encoding", level: "apprentice", order: 4, pages: ["positional-encoding"], prereqs: ["embeddings-basics"] },
    { slug: "softmax-basics", title: "Softmax Function", level: "apprentice", order: 5, pages: ["softmax"], prereqs: [] },
    { slug: "attention-intro", title: "Attention Mechanism", level: "practitioner", order: 6, pages: ["attention"], prereqs: ["embeddings-basics", "softmax-basics"] },
    { slug: "self-attention", title: "Self-Attention", level: "practitioner", order: 7, pages: ["self-attention"], prereqs: ["attention-intro"] },
    { slug: "multi-head-attention", title: "Multi-Head Attention", level: "practitioner", order: 8, pages: ["multi-head-attention"], prereqs: ["self-attention"] },
    { slug: "ffn", title: "Feed-Forward Networks", level: "practitioner", order: 9, pages: ["feed-forward-networks"], prereqs: ["multi-head-attention"] },
    { slug: "layer-norm", title: "Layer Normalization", level: "practitioner", order: 10, pages: ["layer-normalization"], prereqs: [] },
    { slug: "residual-connections", title: "Residual Connections", level: "practitioner", order: 11, pages: ["residual-connections"], prereqs: ["layer-norm"] },
    { slug: "transformer-block", title: "The Transformer Block", level: "practitioner", order: 12, pages: ["transformer-block"], prereqs: ["multi-head-attention", "ffn", "residual-connections"] },
    { slug: "encoder-decoder", title: "Encoder-Decoder Architecture", level: "specialist", order: 13, pages: ["encoder-decoder"], prereqs: ["transformer-block"] },
    { slug: "masked-attention", title: "Masked Self-Attention", level: "specialist", order: 14, pages: ["masked-self-attention"], prereqs: ["self-attention", "encoder-decoder"] },
    { slug: "cross-attention", title: "Cross-Attention", level: "specialist", order: 15, pages: ["cross-attention"], prereqs: ["masked-attention"] },
    { slug: "training-objectives", title: "Training Objectives", level: "specialist", order: 16, pages: ["training-objectives"], prereqs: ["encoder-decoder"] },
    { slug: "sampling-decoding", title: "Sampling & Decoding", level: "specialist", order: 17, pages: ["sampling-strategies", "temperature", "top-k-top-p", "beam-search"], prereqs: ["training-objectives"] },
    { slug: "kv-cache", title: "KV Cache Optimization", level: "expert", order: 18, pages: ["kv-cache"], prereqs: ["self-attention", "sampling-decoding"] },
    { slug: "scaling-laws", title: "Scaling Laws", level: "expert", order: 19, pages: ["scaling-laws"], prereqs: ["training-objectives"] },
    { slug: "modern-architectures", title: "Modern Architecture Innovations", level: "expert", order: 20, pages: ["rope", "grouped-query-attention", "swiglu"], prereqs: ["kv-cache", "scaling-laws"] },
    { slug: "fine-tuning-lora", title: "Fine-Tuning & LoRA", level: "expert", order: 21, pages: ["fine-tuning", "lora"], prereqs: ["training-objectives"] },
    { slug: "rlhf", title: "RLHF", level: "expert", order: 22, pages: ["rlhf"], prereqs: ["fine-tuning-lora"] },
    { slug: "rag", title: "Retrieval-Augmented Generation", level: "expert", order: 23, pages: ["rag"], prereqs: ["fine-tuning-lora"] },
    { slug: "mechanistic-interp", title: "Mechanistic Interpretability", level: "researcher", order: 24, pages: ["mechanistic-interpretability", "induction-heads", "superposition"], prereqs: ["modern-architectures"] },
  ];

  const nodeIdMap = new Map<string, string>();
  for (const node of nodes) {
    nodeIdMap.set(node.slug, randomUUID());
  }

  for (const node of nodes) {
    const nodeId = nodeIdMap.get(node.slug)!;
    const prereqIds = node.prereqs.map((p) => nodeIdMap.get(p)!);

    db.insert(masteryNodes).values({
      id: nodeId,
      pathId,
      slug: node.slug,
      title: node.title,
      description: `Master ${node.title.toLowerCase()} concepts.`,
      order: node.order,
      level: node.level,
      pageIds: JSON.stringify(node.pages),
      prerequisiteNodeIds: JSON.stringify(prereqIds),
    }).run();
  }

  console.log(`  Seeded ML Engineer mastery path with ${nodes.length} nodes.`);
}

seed().catch(console.error);
