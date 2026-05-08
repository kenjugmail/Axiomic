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
  capstones,
  capstoneMilestones,
  misconceptionCatalog,
  researchPapers,
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
  await seedForum();

  // Seed news (article-style posts with covers + viz embeds)
  seedNews();

  // Sprint 28 — load capstones from seed-content/capstones/*.json.
  await seedCapstones();

  // Sprint 29 — load misconception catalog.
  seedMisconceptionCatalog();

  // Sprint 49 — load research papers from seed-content/research/*.json.
  seedResearchPapers();

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
    {
      slug: "induction-heads-the-circuit-behind-in-context-learning",
      title: "Induction heads: the circuit behind in-context learning",
      summary:
        "A short paper-style walk-through of the two-attention-head circuit that drives copy-and-complete behavior in transformers.",
      coverEmoji: "🧠",
      accentColor: "indigo",
      authorId: aliceId,
      abstract:
        "**Induction heads** are a small two-layer attention circuit that explains a surprisingly large fraction of in-context learning in transformer language models. We motivate the construction, walk through the canonical (previous-token-head, induction-head) decomposition, and connect the result to the broader mechanistic-interpretability program. The aim is to give a working ML engineer a concrete circuit they can find in their own model with two probe runs.",
      coauthors: ["bob", "carol"],
      references: [
        {
          text: "Olsson et al., In-context Learning and Induction Heads (Anthropic, 2022).",
          url: "https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html",
        },
        {
          text: "Elhage et al., A Mathematical Framework for Transformer Circuits (2021).",
          url: "https://transformer-circuits.pub/2021/framework/index.html",
        },
        {
          text: "Vaswani et al., Attention Is All You Need (2017).",
          url: "https://arxiv.org/abs/1706.03762",
        },
      ],
      body: `## The behavior

Show a transformer the prefix \`A B C ... A\` and it tends to predict \`B\` next [1]. The model isn't fine-tuned on this; the pattern emerges during pretraining and accounts for much of what we call *in-context learning*. The circuit responsible turns out to be small enough to draw on a napkin.

::viz[attention-heatmap]

## The two-head decomposition

The canonical induction circuit lives across two attention heads in two consecutive layers [1, 2]:

1. A **previous-token head** in layer $L$ writes \`(token at position t-1)\` into the residual stream at position $t$. This is just a lookup; you can find these heads by the diagonal-shifted-by-one attention pattern.

2. An **induction head** in layer $L+1$ then attends from the current position to *prior occurrences of the same token* — and crucially, it reads the value from one step *after* that prior occurrence, courtesy of the layer-$L$ head's left-shifted writeback.

Composed: at the second \`A\`, the induction head attends to the first \`A\`, but the value it pulls is *the thing that came after the first* \`A\` — namely \`B\`. The model has, in effect, looked up "what followed the last time I saw this?" and put the answer in the residual stream.

## Why this matters

If the residual stream is the highway and attention heads are the on-ramps, induction heads are the simplest interesting *content-based* on-ramp the model learns. Once you start looking for them, you find them in nearly every reasonably-sized pretrained transformer [1].

The broader bet of the mechanistic-interpretability program [2] is that *most* of what large models do can be similarly decomposed — that there is no fundamental obstruction to reading off the circuits, only an engineering problem of finding them. Induction heads were the first concrete piece of evidence in that direction.

## What to try next

- Probe your favourite small open model (1-3B params is plenty) for previous-token heads in early layers. Look for the off-by-one diagonal.
- Layer above those, look for heads whose attention pattern is roughly diagonal in *content space* (each row attends to the column where the same token last appeared).
- The transformer architecture introduced in [3] is the substrate for all of this; the circuit we're describing is a *learned* program, not a hard-coded operation.

The point is that "in-context learning" stops being a mysterious property of scale once you see the circuit. It's just a specific composition of two lookups.`,
    },
    {
      slug: "why-we-built-the-knowledge-mri",
      title: "Why we built the Knowledge MRI",
      summary:
        "A concept-level diagnostic that tells learners where they're strong, where they're broken, and what to do next — across every mastery path at once.",
      coverEmoji: "🧠",
      accentColor: "violet",
      authorId: carolId,
      body: `Most learning platforms tell you what *percent* of a course you've finished. That's the wrong unit. You don't care about percentages; you care about what you can do, what you can't, and where the next 30 minutes of your time should go.

The [Knowledge MRI](/me/mri) is our answer. It's a single page that aggregates everything we know about your relationship with every concept in the platform: quiz scores, completion state, active misconceptions detected by the [misconception detector](/me/weak-concepts), unresolved mistakes, flashcard retention, prerequisite gaps. One per-path heatmap and a radial summary at the top.

## What the colors mean

- **Green** — you've shown mastery (quiz score ≥ 70%).
- **Amber** — you've started but haven't crossed the bar.
- **Slate** — you haven't touched it yet.
- **Red dot** — there's an active [[misconception]] detected on this concept. Click through to be coached on it.

The drill panel on every cell tells you why that color, and picks one specific next action: coach me on this misconception, bridge from a prereq, review flashcards, start the lesson, or revisit the missed questions. It's never a list of options — it's the single most useful jump given your current state.

## What it doesn't do

The MRI doesn't grade you. It doesn't show a leaderboard. It doesn't gamify the gaps. It's a diagnostic, not a portfolio — that's why it's owner-only and lives at \`/me/mri\` rather than on your public profile.

## How it composes

Every existing surface feeds it: lesson quizzes update the per-node quiz score, the [misconception detector](https://github.com/anthropics/axiomic) writes diagnoses on wrong-answer patterns, [[flashcard]] reviews update retention. The MRI is a thin aggregator on top — there's no new schema, just new ways to look at signal that was already there.

The community-curated [misconception marketplace](/misconceptions) feeds back into the same loop: the more entries get merged, the denser the heatmap and the sharper the diagnostic.`,
    },
    {
      slug: "capstone-transcripts-are-now-signed",
      title: "Capstone transcripts are now cryptographically signed",
      summary:
        "Every capstone artifact page now ships with an ed25519-signed transcript. Anyone with our public key can verify a completion didn't get tampered with — independently of us.",
      coverEmoji: "🛡️",
      accentColor: "emerald",
      authorId: aliceId,
      body: `When a learner ships a capstone here, the artifact page becomes their public proof: who they are, what they built, which milestones they passed, what the AI grader said, what peer reviewers endorsed. As of this week, that proof is also cryptographically signed.

## What's signed

Every capstone artifact at \`/capstones/c/<slug>\` exposes a [signed transcript](/verify) you can download. The bundle contains:

1. A canonical-JSON **manifest** of the completion: capstone slug + version (we [version capstones](/capstones), so external citations can pin to a specific revision), learner username, milestones with status + score, peer-review summary, completion timestamp.
2. An **ed25519 signature** over the canonical bytes.
3. The **issuer's public key**, which is also published at \`/api/v1/keys/signing\`.

You can verify a transcript independently of us. Paste the JSON at [/verify](/verify), or run the verification yourself with any ed25519 library and our published public key. The signature covers the bytes; tampering with the manifest invalidates it.

## Why this matters

Most "verified profile" claims on learning platforms aren't verifiable. They're a database flag the platform sets, and you have to take their word for it. If the platform goes away or wants to change history, the claim doesn't survive.

A signed transcript survives both. The bytes are public; anyone can re-host them; anyone can check the signature. The capstone artifact at \`/capstones/c/<learner>-<capstone>\` becomes a portable credential.

## What's next

[Peer review](/capstones/review-queue) counts already fold into the signed manifest, so the credibility claim covers both AI grading and community endorsement. We're considering DOI-style permalinks for the artifact pages themselves so academic citation flows just work.

If you completed a capstone before this week, your existing artifact page has been retroactively signed under our current key. The signature surface is now part of the platform's contract: we can rotate the key, but old transcripts under the old key keep verifying as long as the public key is preserved.`,
    },
    {
      slug: "five-new-capstones-for-ml-engineers",
      title: "Five new capstones for ML engineers",
      summary:
        "RAG pipelines, fine-tuning, training stability, mechanistic interpretability, inference optimization. The capstone library just expanded for ML engineers ramping up on modern systems.",
      coverEmoji: "🚢",
      accentColor: "indigo",
      authorId: aliceId,
      body: `If you're an ML engineer trying to level up — or hiring one and wondering what they should be able to do — the capstone library just got a lot more useful.

Five new capstones, each ~4-6 weeks, each producing a public artifact page with a signed transcript at the end:

## [RAG pipeline from scratch](/capstones/rag-pipeline-from-scratch) (6 weeks)

Build the entire stack: chunking, embeddings, vector search, cross-encoder reranking, generation with citations, and an end-to-end evaluation harness. Five milestones. By the end, you'll have shipped a real RAG system over a corpus of your choice with a defended decision about which components mattered.

The point isn't to recreate LangChain. It's to make every architectural choice yourself so you understand the failure modes when (not if) your production RAG system breaks.

[[rag]] · [[retrieval-evaluation]] · [[function-calling]]

## [Fine-tuning and LoRA at scale](/capstones/fine-tuning-and-lora) (4 weeks)

Take a 7B-class open model. Fine-tune it three ways: full (or QLoRA), LoRA at one rank, LoRA at three ranks. Compare empirically. Decide what to ship.

The most common mistake in fine-tuning is treating it as a single-knob problem. Different ranks, different layers to adapt, different data quantities all matter. After this capstone you'll have made all those choices once and have an empirical eval table to defend each.

[[fine-tuning]] · [[lora]]

## Three more on the way

- **Training stability at scale** — diagnose and fix real training failures (NaN gradients, dead activations, learning-rate thrashing). Reproduce a small scaling-law experiment.
- **Mechanistic interpretability: induction heads** — reverse-engineer the actual circuit in a small transformer that implements in-context learning.
- **Inference optimization: KV cache + INT8 quantization** — take a small open model and make it fast enough to serve. Measure the quality-vs-speed tradeoff.

Each new capstone is wired into the [Knowledge MRI](/me/mri) — completing one updates your concept-level mastery across the prerequisite topics. And each completed capstone produces a [signed transcript](/verify) anyone can verify with our public key.

## Why these specifically

Pick 1-2 from this list and you'll see real ML engineering judgment land. RAG is the dominant LLM application pattern; fine-tuning is the dominant adaptation pattern; mech-interp is the credibility frontier. The other two are systems-level work that ML engineers running production deployments do every week.

Browse the [full capstone catalog](/capstones) or jump straight into one. Each capstone has a tiered brief — pick the depth that matches where you are.`,
    },
    {
      slug: "the-misconception-catalog-learned-about-rag-and-lora",
      title: "The misconception catalog learned about RAG, LoRA, and KV-cache",
      summary:
        "Six new entries in the misconception catalog, each on a frontier topic where engineer intuitions reliably go wrong.",
      coverEmoji: "🛠️",
      accentColor: "amber",
      authorId: aliceId,
      body: `Most of what makes a good ML engineer isn't knowing a long list of facts — it's knowing which of your intuitions are wrong. The [misconception catalog](/misconceptions) tracks the second category.

Six new entries this week, all on frontier topics:

## LoRA rank → unbounded capacity

The intuition: more rank = better adaptation. The reality: empirically, LoRA's quality curve saturates around r=16-64 for most tasks. Higher rank doesn't proportionally help. The whole point of LoRA is the low-rank assumption — that task-specific weight updates lie in a low-dimensional subspace. If you find yourself reaching for r=256 by default, you've missed the design intent.

## RAG: perfect retrieval → perfect output

The intuition: if you fix retrieval, RAG works. The reality: even with perfect retrieval, the generator can ignore retrieved context, misread it, or hallucinate beyond it. End-to-end RAG quality is the joint of retrieval AND generation. Fixing one without measuring the other is the classic 'I improved retrieval and the system still hallucinates' debugging story.

## KV-cache eliminates quadratic memory

The intuition: KV cache makes attention O(N), so long context is cheap. The reality: KV cache eliminates redundant *computation* (O(N²) → O(N) per generation step), not *memory* (still O(context × layers × heads)). At 32K context the cache can be tens of GB per request. This is why GQA and PagedAttention exist.

## FlashAttention is approximate

The intuition: FlashAttention drops some computation for speed. The reality: it computes *exact* attention. The speedup comes from IO-aware tiling that avoids materializing the full N×N attention matrix in HBM, not from any approximation.

## Chinchilla's 20:1 ratio is universal

The intuition: 20 tokens per parameter is the optimal training data ratio for any model. The reality: the ratio depends on the LR schedule and on whether you're optimizing training-only or inference-amortized cost. LLaMA-3 8B was trained on 15T tokens (~1900:1) — deliberately over-trained because the inference economics favor it.

## Mech-interp circuits are clean subgraphs

The intuition: a circuit is a small, identifiable group of attention heads + MLP neurons. The reality: superposition means individual neurons carry many features. Most circuits are distributed across many heads and layers, with each contributing partially. This is why sparse autoencoders have become the workhorse of modern mech-interp.

## How they got here

Each of these entries followed the same path: someone proposed it in the [marketplace](/misconceptions), it accumulated five upvotes, and it auto-merged into the production catalog. From there, the [misconception detector](/me/weak-concepts) starts firing on quiz mistakes that match the pattern, and the AI tutor's misconception mode probes them when learners hit them.

The catalog grows by community input. If you're confident a misconception trips up engineers and isn't yet in the catalog, [propose it](/misconceptions). Five votes from peers and it's in.`,
    },
    {
      slug: "frontier-topic-wiki-seven-new-pages",
      title: "Frontier-topic wiki: seven new pages, all with labs where they earn one",
      summary:
        "Prompt injection, retrieval evaluation, function calling, preference optimization, speculative decoding, quantization, distillation. The wiki just got the topics ML engineers actually work with daily.",
      coverEmoji: "📚",
      accentColor: "indigo",
      authorId: carolId,
      body: `When you're building production LLM systems, you don't need another transformer-architecture explainer. You need the topics nobody covers cleanly: prompt injection defenses, RAG evaluation methodology, the actual difference between DPO and PPO, what FP8 quantization gets you on H100s.

Seven new wiki pages, all three-tier (intro / undergrad / grad):

## [[prompt-injection]]

Direct vs indirect attacks; defenses (input filtering, output monitoring, sandboxing tool calls, privilege separation); why this is currently unsolvable in the strong sense and what 'defense in depth' looks like in practice. The class of bug that doesn't have a clean fix.

## [[retrieval-evaluation]]

Hit rate, MRR, nDCG, BEIR, MTEB. How to build an evaluation set without leakage. Why LLM-as-judge has biases and how to validate against human ones. The metric layer that bounds [[rag]] system quality.

## [[function-calling]]

Schema design (the description fields are the most important part). Multi-step planning loops. Error recovery. Trained vs prompted function calling. The MCP ecosystem. Where the security perimeter actually lives.

## [[preference-optimization]]

DPO, IPO, KTO, ORPO, SimPO. Why the field has largely migrated off PPO except at frontier scale. The implementation cost difference. When each variant is worth the complexity.

## [[speculative-decoding]]

The trick: small fast model proposes K tokens; big model verifies all K in parallel. The math: produces a sample from the target model's distribution exactly (not approximately). Variants: Medusa, Lookahead, EAGLE, tree-based. 2-3× speedup at zero quality cost.

## [[quantization]]

INT8 weights are nearly free. INT4 with AWQ is the production sweet spot. FP8 on H100 hardware. QLoRA for memory-constrained fine-tuning. Where the quality cost actually lands.

## [[distillation]]

Soft labels, temperature, the Hinton recipe. Modern variants: on-policy distillation, MiniLLM, Distill-Step-by-Step. What distillation transfers and what it doesn't.

## Why these specifically

Each of these is a topic where the median engineer's intuition is wrong about something specific. The wiki pages encode the things that aren't obvious. Pair them with the [misconception marketplace](/misconceptions) — every wiki page now has corresponding misconception catalog entries — and you get the negative-knowledge half of the curriculum.`,
    },
    {
      slug: "ml-engineer-ramp-up-end-to-end",
      title: "ML engineer ramp-up, end-to-end: a 12-week path through Axiomic",
      summary:
        "If you're an engineer learning modern ML systems, here's a curated 12-week path through the platform. Lessons + capstones + wiki pages, ordered. The fastest way from 'I've heard of attention' to 'I can ship a production inference stack.'",
      coverEmoji: "🗺️",
      accentColor: "emerald",
      authorId: carolId,
      body: `The platform now has enough content for a complete ML-engineer ramp-up. This article is the curated map: which lessons in which order, when to drop into a wiki page for depth, when to start which capstone.

Twelve weeks, three phases. Each phase ends with a capstone that turns the conceptual content into a defensible artifact. The whole path produces three signed transcripts at \`/verify\` and a [Knowledge MRI](/me/mri) that shows your concept-level coverage.

## Weeks 1-4: Foundations + the transformer

The goal of phase one is to understand what's actually happening inside a transformer at the math level. Not 'attention attends'; rather 'this matmul produces these gradients which update these weights.'

Lessons (in order):

1. [Tokens & embeddings](/paths/ml-engineer/lessons/tokens-basics) — what the model actually sees
2. [BPE tokenization](/paths/ml-engineer/lessons/bpe-tokenization) — the merge-pair algorithm
3. [Softmax basics](/paths/ml-engineer/lessons/softmax-basics) — the universal classifier head
4. [Self-attention intro](/paths/ml-engineer/lessons/self-attention) and [scaled dot-product](/paths/ml-engineer/lessons/attention-intro)
5. [Multi-head attention](/paths/ml-engineer/lessons/multi-head-attention) and [positional encoding](/paths/ml-engineer/lessons/positional-encoding)
6. [FFN](/paths/ml-engineer/lessons/ffn), [layer norm](/paths/ml-engineer/lessons/layer-norm), [residual connections](/paths/ml-engineer/lessons/residual-connections)
7. [Transformer block](/paths/ml-engineer/lessons/transformer-block) — putting it together

Wiki side trips: [[attention]], [[softmax]], [[layer-normalization]] for depth. Hover the [[concept-cards]] inline for previews.

**Capstone**: [Build a transformer from scratch](/capstones/transformer-from-scratch) (8 weeks if you take it slow; 4 if you focus). Output: a 2-layer transformer in numpy that trains on a copy task. You'll know exactly what each weight does.

## Weeks 5-8: Modern systems + training

Phase two: the modern recipe. RoPE, grouped-query attention, SwiGLU, AdamW, LoRA, RLHF. The lessons cover *what changed since the original transformer paper* and *why*.

Lessons:

1. [Modern architectures](/paths/ml-engineer/lessons/modern-architectures) — RoPE + GQA + SwiGLU
2. [Training objectives](/paths/ml-engineer/lessons/training-objectives) and [sampling-decoding](/paths/ml-engineer/lessons/sampling-decoding)
3. [Scaling laws](/paths/ml-engineer/lessons/scaling-laws) — Kaplan vs Chinchilla; tokens-per-parameter
4. [Fine-tuning + LoRA](/paths/ml-engineer/lessons/fine-tuning-lora) — full vs LoRA vs adapters
5. [RLHF](/paths/ml-engineer/lessons/rlhf) — the 3-stage pipeline; reward hacking; the move to DPO
6. [RAG](/paths/ml-engineer/lessons/rag) — retrieval, generation, evaluation

Wiki side trips: [[lora]], [[rlhf]], [[preference-optimization]], [[retrieval-evaluation]]. The [misconception catalog](/misconceptions) entries on LoRA rank, RAG perfect-retrieval, and Chinchilla universality are worth reading explicitly — these are the gotchas that trip up the median engineer.

**Capstone choice** (pick one): [RAG pipeline from scratch](/capstones/rag-pipeline-from-scratch) (6 weeks) if you're heading into retrieval-system territory; [Fine-tuning + LoRA](/capstones/fine-tuning-and-lora) (4 weeks) if you're heading into model adaptation; [Training stability at scale](/capstones/training-stability-at-scale) (4 weeks) if you're heading into pretraining ops.

## Weeks 9-12: Production inference + frontier topics

Phase three: shipping. The lessons here are about what runs in production — KV-caching, FlashAttention, quantization, serving. Plus the frontier-topic primers (mech interp, alignment) so you can read papers at the level they're written.

Lessons:

1. [KV-cache](/paths/ml-engineer/lessons/kv-cache) and the [flash-attention] wiki
2. [Mechanistic interpretability](/paths/ml-engineer/lessons/mechanistic-interp) — induction heads + superposition + SAEs
3. (For ai-researcher path) [Interpretability](/paths/ai-researcher/lessons/interpretability), [Alignment frontier](/paths/ai-researcher/lessons/alignment-frontier), [Emergent capabilities](/paths/ai-researcher/lessons/emergent-capabilities)

Wiki side trips: [[quantization]], [[speculative-decoding]], [[function-calling]], [[prompt-injection]]. These are the topics most production engineers operate on without ever reading a coherent treatment of.

**Capstone choice**: [Inference optimization: KV-cache + quantization](/capstones/inference-optimization-kvcache-quant) (5 weeks) is the production-systems capstone. End state: a single-GPU inference server with measured tokens-per-second, peak memory, and held-out quality across baseline → KV-cache → INT8 → both. If you're heading into a research direction instead, [Mech-interp induction heads](/capstones/mech-interp-induction-heads) (5 weeks) is the alternative.

## What you'll have at the end

Three signed transcripts. A [portfolio page](/profile) that surfaces all three. A Knowledge MRI heatmap that's emerald across the ML-engineer path. And — assuming you defended a few claim threads on your artifact pages — a public discussion record that prospective employers can read.

The platform's [coach](/me/weak-concepts) will keep flagging misconceptions as they surface. The [argument maps](/forum) will keep showing where your peers are stuck. And the [research papers](/research) keep arriving — same authoring loop, same tier toggle, same runnable cells if the paper has them.

Ship the path, then write a paper about something you noticed along the way. That's the loop.`,
    },
  ];

  for (const a of articles) {
    db.insert(newsArticles).values({
      id: randomUUID(),
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      body: a.body,
      abstract: (a as any).abstract ?? "",
      referencesJson: JSON.stringify(
        ((a as any).references as Array<{ text: string; url?: string }> | undefined)?.map(
          (r, i) => ({ label: String(i + 1), text: r.text, url: r.url }),
        ) ?? [],
      ),
      coauthorsJson: JSON.stringify((a as any).coauthors ?? []),
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

async function seedForum() {
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

// Sprint 28 — load capstones from seed-content/capstones/*.json. Each
// JSON is a self-contained brief + ordered milestones (with rubrics +
// optional runnable tests). Authored by the seeded `system` user;
// upserted on slug.
async function seedCapstones() {
  const capstonesDir = path.join(import.meta.dir, "../../../seed-content/capstones");
  if (!fs.existsSync(capstonesDir)) {
    return;
  }

  // Find or create the `system` author. Reuse if a real user owns the
  // username (rare but possible); the seed deliberately doesn't
  // overwrite a real account.
  let systemUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "system"))
    .get();
  if (!systemUser) {
    const id = randomUUID();
    db.insert(users)
      .values({
        id,
        username: "system",
        email: "system@axiomic.local",
        passwordHash: FORUM_SEED_PASSWORD_HASH,
        displayName: "Axiomic system",
        bio: "Authored capstones + reference content shipped with the platform.",
      })
      .run();
    systemUser = { id };
  }

  const files = fs.readdirSync(capstonesDir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(capstonesDir, file), "utf-8");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn(`  Skipping capstone ${file}: invalid JSON.`);
      continue;
    }

    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, parsed.slug))
      .get();

    let capstoneId: string;
    const values = {
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      estimatedWeeks: parsed.estimatedWeeks ?? 6,
      prerequisiteWikiSlugs: JSON.stringify(parsed.prerequisiteWikiSlugs ?? []),
      prerequisiteNodeIds: JSON.stringify(parsed.prerequisiteNodeIds ?? []),
      tags: JSON.stringify(parsed.tags ?? []),
      coverEmoji: parsed.coverEmoji ?? "🎓",
      accentColor: parsed.accentColor ?? "violet",
      status: parsed.status ?? "published",
      authorId: systemUser.id,
    };
    if (existing) {
      capstoneId = existing.id;
      db.update(capstones)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(capstones.id, existing.id))
        .run();
      // Wipe + rewrite milestones so seed updates reflect cleanly.
      db.delete(capstoneMilestones)
        .where(eq(capstoneMilestones.capstoneId, capstoneId))
        .run();
    } else {
      capstoneId = randomUUID();
      db.insert(capstones).values({ id: capstoneId, ...values }).run();
    }

    const milestones: any[] = Array.isArray(parsed.milestones) ? parsed.milestones : [];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m?.title) continue;
      db.insert(capstoneMilestones).values({
        id: randomUUID(),
        capstoneId,
        order: i,
        title: m.title,
        description: m.description ?? "",
        rubricJson: JSON.stringify(m.rubric ?? { criteria: [], passingScore: 0.6 }),
        requiredArtifactKinds: JSON.stringify(m.requiredArtifactKinds ?? []),
        runnableTests: m.runnableTests ?? null,
        estimatedDays: m.estimatedDays ?? 7,
      }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} capstone(s).`);
}

// Sprint 29 — load misconception_catalog from seed-content/misconceptions/*.json.
function seedMisconceptionCatalog() {
  const dir = path.join(import.meta.dir, "../../../seed-content/misconceptions");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const f of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.conceptSlug || !parsed?.key) continue;

    const existing = db
      .select({ id: misconceptionCatalog.id })
      .from(misconceptionCatalog)
      .where(eq(misconceptionCatalog.key, parsed.key))
      .get();
    const values = {
      conceptSlug: parsed.conceptSlug,
      key: parsed.key,
      label: parsed.label,
      description: parsed.description ?? "",
      probeQuestionsJson: JSON.stringify(parsed.probeQuestions ?? []),
      correctionPromptTemplate: parsed.correctionPromptTemplate ?? "",
    };
    if (existing) {
      db.update(misconceptionCatalog)
        .set(values)
        .where(eq(misconceptionCatalog.id, existing.id))
        .run();
    } else {
      db.insert(misconceptionCatalog)
        .values({ id: randomUUID(), ...values })
        .run();
    }
    count++;
  }
  console.log(`  Seeded ${count} misconception catalog entr${count === 1 ? "y" : "ies"}.`);
}

// Sprint 49 — load research papers from seed-content/research/*.json.
function seedResearchPapers() {
  const dir = path.join(import.meta.dir, "../../../seed-content/research");
  if (!fs.existsSync(dir)) return;

  // Use `system` if it exists; else fall back to `alice`.
  let authorId =
    db.select({ id: users.id }).from(users).where(eq(users.username, "system")).get()?.id ??
    db.select({ id: users.id }).from(users).where(eq(users.username, "alice")).get()?.id;
  if (!authorId) {
    console.log("  No author available for research papers; skipping.");
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const f of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: researchPapers.id })
      .from(researchPapers)
      .where(eq(researchPapers.slug, parsed.slug))
      .get();
    if (existing) continue; // Don't overwrite manually-edited papers.

    db.insert(researchPapers).values({
      id: randomUUID(),
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      format: parsed.format ?? "research",
      abstract: parsed.abstract ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      paperStructureJson: JSON.stringify(parsed.paperStructure ?? {}),
      referencesJson: JSON.stringify(parsed.references ?? []),
      coauthorsJson: JSON.stringify(parsed.coauthors ?? []),
      coverEmoji: parsed.coverEmoji ?? "📄",
      accentColor: parsed.accentColor ?? "violet",
      status: parsed.status ?? "published",
      tags: JSON.stringify(parsed.tags ?? []),
      authorId,
    }).run();
    count++;
  }
  console.log(`  Seeded ${count} research paper${count === 1 ? "" : "s"}.`);
}

seed().catch(console.error);
