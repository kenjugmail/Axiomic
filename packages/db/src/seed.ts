import {
  getDb,
  wikiPages,
  pageVersions,
  masteryPaths,
  masteryNodes,
  users,
  domains,
  forumTopics,
  forumPosts,
  forumVotes,
  newsArticles,
} from "./index";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const db = getDb();

// bcrypt is provided via Bun.password.hash; this seed-side import keeps the
// dependency local to seeding so we don't pull bun-only APIs into the schema.
const FORUM_SEED_PASSWORD_HASH = Bun.password.hashSync("axiomic-seed");

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
    const existing = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();

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

  // Seed forum (domains, demo users, topics, replies, votes)
  seedForum();

  // Seed news (article-style posts with covers + viz embeds)
  seedNews();

  console.log("Seeding complete.");
}

function seedNews() {
  const anyArticle = db.select().from(newsArticles).get();
  if (anyArticle) {
    console.log("  News already seeded, skipping.");
    return;
  }

  // Reuse the forum demo users so articles have real authors.
  const aliceId = db.select({ id: users.id }).from(users).where(eq(users.username, "alice")).get()?.id;
  const carolId = db.select({ id: users.id }).from(users).where(eq(users.username, "carol")).get()?.id;
  if (!aliceId || !carolId) {
    console.log("  Forum users missing; skipping news seed.");
    return;
  }

  const articles = [
    {
      slug: "transformers-are-not-magic",
      title: "Transformers are not magic",
      summary: "A demystifying tour of attention, told one viz at a time.",
      coverEmoji: "🪄",
      accentColor: "violet",
      authorId: aliceId,
      body: `The first time I saw self-attention written out, I thought it was a hack. *"You take three copies of the input, multiply two of them, softmax the result, and weight the third — and that's it?"*

Years later it still works that way, but I no longer think it's a hack. I think it's the simplest possible content-based router. Here's why.

::viz[attention-heatmap]

## What attention actually computes

For each token, attention asks two questions: *who else in this sequence should I look at?*, and *what should I take from them?* The first is the **score** matrix, the second is the **value** matrix. The split is so clean that you can swap one out and the other still makes sense.

When the model is well-trained, you'll see structure pop out of the heatmap above: an induction head learning to copy the previous occurrence of a token, a positional head pinned to the diagonal, a syntactic head that lights up on subjects when looking at verbs.

## Why it scales

The thing that *isn't* obvious from the formula is that attention is **embarrassingly parallel** along the sequence axis. RNNs forced you to wait for token $t-1$ before computing token $t$. Attention computes them all at once.

That's the whole story. Everything since — multi-head attention, RoPE, GQA, FlashAttention — is a refinement. Read [the attention page](/wiki/attention) for the math, or open the lesson on the ml-engineer path to play with it.`,
    },
    {
      slug: "what-tokenizers-actually-see",
      title: "What tokenizers actually see (and why it matters)",
      summary: "Tokens aren't words, and that bites you in surprising places.",
      coverEmoji: "🔤",
      accentColor: "emerald",
      authorId: carolId,
      body: `Most tutorials hand-wave past tokenization — *"the model splits the text into tokens, you don't really need to think about it"* — and then you spend the next three weeks debugging why your model can't count letters.

::viz[tokenizer-playground]

Try the playground above. Two facts that surprise people:

1. **\`" the"\` and \`"the"\` are usually different tokens.** The leading space is part of the token. This is why models occasionally misalign words at sentence boundaries.

2. **Numbers are split into chunks of 1-3 digits**, often inconsistently. \`"3.14159"\` might tokenize as \`["3", ".", "14", "159"]\` or any number of other splits. This is part of why arithmetic is hard for LLMs.

## Why subword

The naive alternatives — one token per word, or one per character — both lose. Word-level vocabularies blow up combinatorially and can't handle out-of-vocabulary words. Character-level models work but are *much* slower; you spend most of your compute predicting whitespace.

Subword tokenization (BPE, WordPiece, Unigram, SentencePiece) is the compromise: a fixed-size vocabulary where common words get a single token and rare words get split into pieces that the model has seen many times in other contexts.

## The takeaway

If your model is failing on something that involves *characters as a unit* — counting letters, reversing strings, syllable rhyming — your first hypothesis should be **the tokenization is the bug**, not the model.`,
    },
  ];

  for (const a of articles) {
    db.insert(newsArticles).values({
      id: randomUUID(),
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      body: a.body,
      coverEmoji: a.coverEmoji,
      accentColor: a.accentColor,
      authorId: a.authorId,
    }).run();
  }
  console.log(`  Seeded news: ${articles.length} articles.`);
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

interface MasteryNodeSpec {
  slug: string;
  title: string;
  level: "apprentice" | "practitioner" | "specialist" | "expert" | "researcher";
  order: number;
  pages: string[];
  prereqs: string[];
  description?: string;
}

function loadJsonForNode(folder: string, nodeSlug: string): string | null {
  // Walk to repo root if cwd isn't packages/db.
  const candidates = [
    path.join(process.cwd(), `seed-content/${folder}`, `${nodeSlug}.json`),
    path.join(process.cwd(), `../../seed-content/${folder}`, `${nodeSlug}.json`),
    path.join(process.cwd(), `../../../seed-content/${folder}`, `${nodeSlug}.json`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(c, "utf-8"));
        return JSON.stringify(parsed);
      } catch (e) {
        console.error(`  Failed to parse ${folder} file ${c}:`, e);
        return null;
      }
    }
  }
  return null;
}

// Look up hand-authored quiz JSON for a node by slug, if present.
function loadQuizData(nodeSlug: string): string | null {
  return loadJsonForNode("quizzes", nodeSlug);
}

// Look up hand-authored lesson JSON for a node by slug, if present.
function loadLessonData(nodeSlug: string): string | null {
  return loadJsonForNode("lessons", nodeSlug);
}

function seedMasteryPath(spec: {
  slug: string;
  title: string;
  description: string;
  nodes: MasteryNodeSpec[];
}) {
  const existing = db
    .select()
    .from(masteryPaths)
    .where(eq(masteryPaths.slug, spec.slug))
    .get();
  if (existing) {
    // Path already exists, but author may have added quiz data for nodes
    // since the last seed. Update quizData on existing nodes with a
    // matching JSON file; leave everything else untouched.
    let quizUpdated = 0;
    let lessonUpdated = 0;
    const existingNodes = db
      .select({ id: masteryNodes.id, slug: masteryNodes.slug })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, existing.id))
      .all();
    for (const node of existingNodes) {
      const quiz = loadQuizData(node.slug);
      const lesson = loadLessonData(node.slug);
      const set: Record<string, unknown> = {};
      if (quiz) {
        set.quizData = quiz;
        quizUpdated++;
      }
      if (lesson) {
        set.lessonData = lesson;
        lessonUpdated++;
      }
      if (Object.keys(set).length > 0) {
        db.update(masteryNodes)
          .set(set)
          .where(eq(masteryNodes.id, node.id))
          .run();
      }
    }
    console.log(
      `  Mastery path "${spec.slug}" already exists, refreshed quiz on ${quizUpdated} nodes, lessons on ${lessonUpdated}.`,
    );
    return;
  }

  const pathId = randomUUID();
  db.insert(masteryPaths).values({
    id: pathId,
    slug: spec.slug,
    title: spec.title,
    description: spec.description,
  }).run();

  const nodeIdMap = new Map<string, string>();
  for (const node of spec.nodes) nodeIdMap.set(node.slug, randomUUID());

  for (const node of spec.nodes) {
    const nodeId = nodeIdMap.get(node.slug)!;
    const prereqIds = node.prereqs.map((p) => nodeIdMap.get(p)!).filter(Boolean);

    db.insert(masteryNodes).values({
      id: nodeId,
      pathId,
      slug: node.slug,
      title: node.title,
      description: node.description || `Master ${node.title.toLowerCase()} concepts.`,
      order: node.order,
      level: node.level,
      pageIds: JSON.stringify(node.pages),
      prerequisiteNodeIds: JSON.stringify(prereqIds),
      quizData: loadQuizData(node.slug),
      lessonData: loadLessonData(node.slug),
    }).run();
  }

  console.log(`  Seeded "${spec.slug}" mastery path with ${spec.nodes.length} nodes.`);
}

function seedMasteryPaths() {
  seedMasteryPath({
    slug: "ml-engineer",
    title: "ML Engineer",
    description:
      "From fundamentals to modern transformer architectures. Master the theory and practice of machine learning.",
    nodes: [
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
    ],
  });

  seedMasteryPath({
    slug: "ai-researcher",
    title: "AI Researcher",
    description:
      "From mathematical fluency to original research contributions. Builds the foundations and frontier knowledge needed to read papers critically and contribute to ML research.",
    nodes: [
      { slug: "math-foundations", title: "Mathematical Foundations", level: "practitioner", order: 1, pages: ["linear-algebra-foundations", "calculus-foundations", "probability-foundations"], prereqs: [], description: "Linear algebra, calculus, and probability fluency — the language of every ML paper." },
      { slug: "info-theory-basics", title: "Information Theory for ML", level: "practitioner", order: 2, pages: ["information-theory"], prereqs: ["math-foundations"], description: "Entropy, KL, mutual information — the formal vocabulary of ML losses." },
      { slug: "optimization-fundamentals", title: "Optimization Fundamentals", level: "practitioner", order: 3, pages: ["optimization-theory", "gradient-descent", "backpropagation"], prereqs: ["math-foundations"], description: "Gradient descent, convexity, and the geometry of training." },
      { slug: "statistics-for-ml", title: "Statistics for ML", level: "practitioner", order: 4, pages: ["statistics-foundations", "loss-functions"], prereqs: ["math-foundations"], description: "Estimation, MLE, hypothesis testing, and proper evaluation." },
      { slug: "transformer-deep-dive", title: "Transformer Deep Dive", level: "specialist", order: 5, pages: ["attention", "self-attention", "multi-head-attention", "transformer-block"], prereqs: ["optimization-fundamentals", "info-theory-basics"], description: "Read the architecture end-to-end, with mathematical fluency." },
      { slug: "training-dynamics", title: "Training Dynamics & Scaling", level: "specialist", order: 6, pages: ["scaling-laws", "training-objectives"], prereqs: ["optimization-fundamentals", "statistics-for-ml"], description: "How loss curves behave, what scaling laws predict, and where they break." },
      { slug: "evaluation-rigor", title: "Evaluation & Statistical Rigor", level: "specialist", order: 7, pages: ["statistics-foundations", "loss-functions"], prereqs: ["statistics-for-ml"], description: "Calibration, significance testing, the meta-science of benchmarks." },
      { slug: "interpretability", title: "Mechanistic Interpretability", level: "expert", order: 8, pages: ["mechanistic-interpretability", "induction-heads", "superposition"], prereqs: ["transformer-deep-dive"], description: "Reverse-engineer circuits inside trained models." },
      { slug: "alignment-frontier", title: "Alignment Frontier", level: "expert", order: 9, pages: ["rlhf", "fine-tuning", "lora"], prereqs: ["transformer-deep-dive", "training-dynamics"], description: "RLHF, value alignment, and the engineering practice around frontier models." },
      { slug: "emergent-capabilities", title: "Emergent Capabilities & ICL", level: "expert", order: 10, pages: ["in-context-learning", "scaling-laws"], prereqs: ["transformer-deep-dive", "training-dynamics"], description: "What appears with scale, what doesn't, and how to tell the difference." },
      { slug: "research-frontiers", title: "Reading & Critiquing Frontier Work", level: "researcher", order: 11, pages: ["mechanistic-interpretability", "induction-heads", "scaling-laws"], prereqs: ["interpretability", "alignment-frontier", "emergent-capabilities"], description: "Read three major papers per week, identify the load-bearing claim, find the weakest link." },
      { slug: "novel-contributions", title: "Original Research Contributions", level: "researcher", order: 12, pages: ["mechanistic-interpretability"], prereqs: ["research-frontiers"], description: "Pose a question no one has answered. Run an experiment. Write it up." },
    ],
  });

  seedMasteryPath({
    slug: "mathematician",
    title: "Mathematician",
    description:
      "The math behind ML, learned in the order it actually shows up: linear algebra, calculus, probability, statistics, info theory, and optimization.",
    nodes: [
      { slug: "linear-algebra-foundations", title: "Linear Algebra Foundations", level: "apprentice", order: 1, pages: ["linear-algebra-foundations"], prereqs: [], description: "Vectors, matrices, dot products, and the geometry that drives every ML operation." },
      { slug: "calculus-foundations", title: "Calculus Foundations", level: "apprentice", order: 2, pages: ["calculus-foundations"], prereqs: [], description: "Derivatives, gradients, and the chain rule — the language of training." },
      { slug: "probability-foundations", title: "Probability Foundations", level: "apprentice", order: 3, pages: ["probability-foundations"], prereqs: [], description: "Random variables, distributions, expectations, and Bayes' rule." },
      { slug: "statistics-foundations", title: "Statistics Foundations", level: "practitioner", order: 4, pages: ["statistics-foundations"], prereqs: ["probability-foundations"], description: "Estimation, MLE, and hypothesis testing — turning data into claims." },
      { slug: "info-theory-basics", title: "Information Theory", level: "practitioner", order: 5, pages: ["information-theory"], prereqs: ["probability-foundations"], description: "Entropy, KL divergence, and mutual information — the formal vocabulary of ML losses." },
      { slug: "loss-functions", title: "Loss Functions", level: "practitioner", order: 6, pages: ["loss-functions"], prereqs: ["statistics-foundations", "info-theory-basics"], description: "Cross-entropy, MSE, and the rest — and why each one is the right tool for its job." },
      { slug: "gradient-descent", title: "Gradient Descent", level: "practitioner", order: 7, pages: ["gradient-descent", "optimization-theory"], prereqs: ["calculus-foundations"], description: "Vanilla GD, SGD, momentum, and the geometry of loss landscapes." },
      { slug: "backpropagation", title: "Backpropagation", level: "specialist", order: 8, pages: ["backpropagation"], prereqs: ["gradient-descent", "linear-algebra-foundations"], description: "How gradients actually flow through a deep network. The chain rule, vectorized." },
    ],
  });

  seedMasteryPath({
    slug: "physicist",
    title: "Physicist",
    description:
      "From Newton to chaos: the language of dynamical systems, learned with live simulations.",
    nodes: [
      { slug: "mechanics-foundations", title: "Mechanics Foundations", level: "apprentice", order: 1, pages: ["mechanics-foundations"], prereqs: [], description: "Newton's laws, conservation, energy — the spine of classical mechanics." },
      { slug: "oscillations", title: "Oscillations", level: "apprentice", order: 2, pages: ["oscillations"], prereqs: ["mechanics-foundations"], description: "Simple harmonic motion, damped + driven oscillators, resonance." },
      { slug: "phase-space", title: "Phase Space & Fixed Points", level: "practitioner", order: 3, pages: ["phase-space"], prereqs: ["oscillations"], description: "Read a 1D system off its phase portrait. Stability without solving." },
      { slug: "chaos-and-sensitivity", title: "Chaos & Sensitivity", level: "practitioner", order: 4, pages: ["chaos-and-sensitivity"], prereqs: ["phase-space"], description: "The Lorenz system. Why deterministic ≠ predictable in the long run." },
      { slug: "lagrangian-mechanics", title: "Lagrangian Mechanics", level: "practitioner", order: 5, pages: ["lagrangian-mechanics"], prereqs: ["mechanics-foundations"], description: "Least action, generalized coordinates, Euler-Lagrange equations." },
      { slug: "nonlinear-dynamics", title: "Nonlinear Dynamics", level: "specialist", order: 6, pages: ["nonlinear-dynamics"], prereqs: ["chaos-and-sensitivity", "lagrangian-mechanics"], description: "Bifurcations, limit cycles, the double pendulum as a chaos lab." },
      { slug: "statistical-mechanics", title: "Statistical Mechanics", level: "specialist", order: 7, pages: ["statistical-mechanics"], prereqs: ["mechanics-foundations"], description: "Ensembles, the partition function, free energy. Entropy as counting." },
      { slug: "entropy-and-information", title: "Entropy ↔ Information", level: "expert", order: 8, pages: ["information-theory"], prereqs: ["statistical-mechanics"], description: "Boltzmann's H meets Shannon's H — the bridge between the two." },
    ],
  });
}

// --- Forum seeding -------------------------------------------------------

interface ForumTopicFrontmatter {
  title: string;
  postType: string;
  domainSlug: string;
  wikiPageSlug?: string;
  author: string;
  replies: { author: string; body: string }[];
}

const SEED_DOMAINS = [
  {
    slug: "ml",
    title: "Machine Learning",
    description:
      "Modern ML, transformers, training, decoding, alignment, interpretability.",
  },
  {
    slug: "math",
    title: "Mathematics",
    description: "Foundations of the math behind ML and beyond.",
  },
  {
    slug: "physics",
    title: "Physics",
    description: "Statistical mechanics, dynamical systems, and beyond.",
  },
];

const SEED_FORUM_USERS = [
  { username: "alice", displayName: "Alice", bio: "Mech-interp researcher." },
  { username: "bob", displayName: "Bob", bio: "Optimization & math foundations." },
  { username: "carol", displayName: "Carol", bio: "Theoretical ML." },
  { username: "dave", displayName: "Dave", bio: "Systems and inference engineering." },
];

function ensureForumUser(username: string, displayName: string, bio: string): string {
  const existing = db.select().from(users).where(eq(users.username, username)).get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@axiomic.local`,
    passwordHash: FORUM_SEED_PASSWORD_HASH,
    displayName,
    bio,
  }).run();
  return id;
}

function ensureDomain(slug: string, title: string, description: string): string {
  const existing = db.select().from(domains).where(eq(domains.slug, slug)).get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(domains).values({ id, slug, title, description }).run();
  return id;
}

function parseForumTopic(file: string, content: string): ForumTopicFrontmatter | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    console.warn(`Skipping forum topic ${file}: no frontmatter.`);
    return null;
  }
  const fm = m[1];
  const get = (key: string) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
    return fm.match(re)?.[1]?.trim();
  };
  const title = get("title");
  const postType = get("postType");
  const domainSlug = get("domainSlug");
  const author = get("author");
  if (!title || !postType || !domainSlug || !author) {
    console.warn(`Skipping forum topic ${file}: missing required frontmatter.`);
    return null;
  }
  const wikiPageSlug = get("wikiPageSlug");

  // Replies block: parse YAML-ish indented `- author: ...\n    body: |\n      ...`
  const replies: { author: string; body: string }[] = [];
  const repliesMatch = fm.match(/^replies:\n([\s\S]+)$/m);
  if (repliesMatch) {
    const block = repliesMatch[1];
    const lines = block.split("\n");
    let current: { author: string; body: string } | null = null;
    let inBody = false;
    let bodyIndent = 0;
    for (const line of lines) {
      const itemMatch = line.match(/^\s*-\s+author:\s*(.+)$/);
      if (itemMatch) {
        if (current) replies.push(current);
        current = { author: itemMatch[1].trim(), body: "" };
        inBody = false;
        continue;
      }
      const bodyStartMatch = line.match(/^(\s+)body:\s*\|\s*$/);
      if (bodyStartMatch && current) {
        inBody = true;
        bodyIndent = bodyStartMatch[1].length + 2;
        continue;
      }
      if (inBody && current) {
        if (line.trim() === "" || line.startsWith(" ".repeat(bodyIndent))) {
          current.body += line.slice(bodyIndent) + "\n";
        } else if (/^\s*-\s+author:/.test(line)) {
          // Next reply starts; loop will catch it next iteration via itemMatch
          current.body = current.body.trim();
          replies.push(current);
          const next = line.match(/^\s*-\s+author:\s*(.+)$/);
          if (next) current = { author: next[1].trim(), body: "" };
          inBody = false;
        }
      }
    }
    if (current) {
      current.body = current.body.trim();
      replies.push(current);
    }
  }

  // Use body parsed at module level
  return { title, postType, domainSlug, wikiPageSlug, author, replies };
}

function seedForum() {
  // Skip if already seeded.
  const anyTopic = db.select().from(forumTopics).get();
  if (anyTopic) {
    console.log("  Forum already seeded, skipping.");
    return;
  }

  for (const d of SEED_DOMAINS) {
    ensureDomain(d.slug, d.title, d.description);
  }

  const userIds = new Map<string, string>();
  for (const u of SEED_FORUM_USERS) {
    userIds.set(u.username, ensureForumUser(u.username, u.displayName, u.bio));
  }

  const forumDir = path.join(import.meta.dir, "../../../seed-content/forum/topics");
  if (!fs.existsSync(forumDir)) {
    console.log("  No forum seed directory; skipping topics.");
    return;
  }

  const files = fs.readdirSync(forumDir).filter((f) => f.endsWith(".md"));
  let topicCount = 0;
  let postCount = 0;
  let voteCount = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(forumDir, file), "utf-8");
    const fm = parseForumTopic(file, raw);
    if (!fm) continue;

    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = (bodyMatch?.[1] || "").trim();

    const dom = db.select().from(domains).where(eq(domains.slug, fm.domainSlug)).get();
    if (!dom) {
      console.warn(`Skipping ${file}: unknown domain ${fm.domainSlug}`);
      continue;
    }

    let wikiPageId: string | null = null;
    if (fm.wikiPageSlug) {
      const w = db.select().from(wikiPages).where(eq(wikiPages.slug, fm.wikiPageSlug)).get();
      if (w) wikiPageId = w.id;
    }

    const authorId = userIds.get(fm.author);
    if (!authorId) {
      console.warn(`Skipping ${file}: unknown seed author ${fm.author}`);
      continue;
    }

    const topicId = randomUUID();
    const slug = `${file.replace(".md", "")}-${randomUUID().slice(0, 6)}`;
    db.insert(forumTopics).values({
      id: topicId,
      slug,
      title: fm.title,
      body,
      postType: fm.postType,
      domainId: dom.id,
      authorId,
      wikiPageId,
    }).run();
    topicCount++;

    // Insert replies sequentially with tiny clock skew to preserve order.
    const replyIds: string[] = [];
    for (let i = 0; i < fm.replies.length; i++) {
      const r = fm.replies[i];
      const replyAuthorId = userIds.get(r.author) || authorId;
      const id = randomUUID();
      db.insert(forumPosts).values({
        id,
        topicId,
        parentId: i === 0 ? null : replyIds[0], // simple shape: first reply is root, rest reply to it
        authorId: replyAuthorId,
        body: r.body.trim(),
      }).run();
      replyIds.push(id);
      postCount++;
    }

    // Seed some votes so reputation is non-zero. Skip self-votes.
    const allVoters = SEED_FORUM_USERS.map((u) => userIds.get(u.username)!);
    // Topic gets 2 upvotes from non-author voters.
    let voted = 0;
    for (const v of allVoters) {
      if (v === authorId) continue;
      if (voted >= 2) break;
      db.insert(forumVotes).values({
        id: randomUUID(),
        subjectType: "topic",
        subjectId: topicId,
        userId: v,
        value: 1,
      }).run();
      voteCount++;
      voted++;
    }
    // Each reply gets one upvote from a different non-author voter.
    for (const rid of replyIds) {
      const post = db.select().from(forumPosts).where(eq(forumPosts.id, rid)).get();
      if (!post) continue;
      const voter = allVoters.find((v) => v !== post.authorId);
      if (!voter) continue;
      db.insert(forumVotes).values({
        id: randomUUID(),
        subjectType: "post",
        subjectId: rid,
        userId: voter,
        value: 1,
      }).run();
      voteCount++;
    }
  }

  console.log(
    `  Seeded forum: ${topicCount} topics, ${postCount} replies, ${voteCount} votes.`
  );
}

seed().catch(console.error);
