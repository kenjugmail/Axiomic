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
  capstoneTracks,
  capstoneTrackCapstones,
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

  // Sprint 52 — load capstone tracks (depend on capstones existing).
  await seedCapstoneTracks();

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
    {
      slug: "systems-engineer-path-launch",
      title: "Systems engineer path: from a single GPU to a serving stack",
      summary:
        "The infrastructure half of ML now has a path. Eight lessons + 16 wiki pages + two capstones covering distributed training, FSDP, vLLM, monitoring, and the production failure modes that bite teams in their first quarter at scale.",
      coverEmoji: "⚙️",
      accentColor: "sky",
      authorId: carolId,
      body: `When we started Axiomic, we wrote about the math of transformers, the architecture of attention, and the dynamics of training. Necessary content; not sufficient. About 80% of production ML practitioners spend the bulk of their time on **systems** — distributed training, GPU memory accounting, serving infrastructure, monitoring, the rollback playbook for the day everything breaks.

That content didn't exist on the platform. As of today it does.

## What landed

The new [systems engineer path](/paths/systems-engineer) covers the production-engineering stack end-to-end:

1. [GPU architecture](/paths/systems-engineer/lessons/gpu-architecture) — tensor cores, HBM, the memory-vs-compute roofline.
2. [Mixed precision](/paths/systems-engineer/lessons/mixed-precision-training) — bf16, fp16, fp8 + when each is the right call.
3. [Data parallelism](/paths/systems-engineer/lessons/data-parallelism) — DDP, NCCL, scaling efficiency.
4. [Model parallelism + FSDP](/paths/systems-engineer/lessons/model-parallelism) — when DDP isn't enough.
5. [MLOps + experiment tracking](/paths/systems-engineer/lessons/mlops-experiment-tracking) — the discipline that turns research-style runs into a reproducible lineage.
6. [Inference serving](/paths/systems-engineer/lessons/inference-serving) — vLLM, PagedAttention, continuous batching.
7. [Monitoring + observability](/paths/systems-engineer/lessons/monitoring-observability) — drift, online eval, SLOs.
8. [Production failure modes](/paths/systems-engineer/lessons/production-failure-modes) — the playbook for when reality hits.

Plus 16 new wiki pages covering each subsystem in three-tier depth, six new misconceptions catching the median engineer's wrong intuitions, a survey paper on the [serving-stack frontier](/research/serving-stack-frontier-2026), and a new [systems forum domain](/forum/systems) for discussion.

## Two capstones

[Build a serving stack](/capstones/build-a-serving-stack) (5 weeks): implement a production-grade LLM inference server with KV cache management + continuous batching + monitoring. Benchmark against vLLM. Output: a public artifact showing where you matched it, where you didn't, and which optimizations account for the gaps.

[Distributed training experiment](/capstones/distributed-training-experiment) (4 weeks): scale the same training run from one GPU through DDP, FSDP, and FSDP+offload on multi-GPU hardware. Measure the throughput-vs-memory Pareto frontier. Recommend a strategy for hypothetical 1B / 7B / 70B models.

Both produce signed transcripts that paint a defensible picture of "this engineer can run a production ML system" — exactly the credential that's hard to demonstrate from a degree alone.

## Why it matters

Hiring managers tell us this is the gap they have the hardest time filling. There's no shortage of candidates who can train a transformer. There's a real shortage of candidates who can keep one running in production: diagnose an OOM at scale, recover from a NaN training spike at step 47000, design a rollback procedure that takes minutes instead of hours.

The systems-engineer path is built around exactly those scenarios. The capstones produce the receipts. The misconceptions surface the wrong intuitions before they bite.

For ML engineers ramping up: pair this path with the existing [ML engineer ramp-up](/news/ml-engineer-ramp-up-end-to-end) content. Foundation + frontier topics + production engineering — the stack that gets you from "I trained a model" to "I shipped one and kept it running."`,
    },
    {
      slug: "rl-foundations-path-launch",
      title: "RL foundations: from MDPs to PPO, then onward to RLHF",
      summary:
        "The missing ladder for understanding modern RL. Ten lessons + 15 wiki pages walk you from MDP fundamentals through value functions, TD learning, policy gradients, actor-critic, PPO, exploration, and model-based RL — ending at RLHF for language model alignment.",
      coverEmoji: "🎯",
      accentColor: "rose",
      authorId: carolId,
      body: `RLHF is famous; the foundations that make it work are not. Most ML engineers can recite "PPO + reward model + KL penalty" without being clear on what the policy gradient theorem says, why GAE matters, or what TRPO solved that PPO simplified. The new [reinforcement-learner path](/paths/reinforcement-learner) supplies that ladder.

## What landed

Ten lessons covering the full RL conceptual stack:

1. [MDP foundations](/paths/reinforcement-learner/lessons/mdp-foundations) — states, actions, rewards, the discount factor.
2. [Value functions](/paths/reinforcement-learner/lessons/value-functions) — V, Q, the Bellman equation.
3. [Dynamic programming](/paths/reinforcement-learner/lessons/dynamic-programming-rl) — value iteration, policy iteration when you know the model.
4. [Temporal difference learning](/paths/reinforcement-learner/lessons/temporal-difference) — Q-learning, SARSA, DQN.
5. [Policy gradients](/paths/reinforcement-learner/lessons/policy-gradients) — REINFORCE and GAE.
6. [Actor-critic](/paths/reinforcement-learner/lessons/actor-critic) — combining the two.
7. [PPO and TRPO](/paths/reinforcement-learner/lessons/ppo-trpo) — the trust-region family.
8. [Exploration vs exploitation](/paths/reinforcement-learner/lessons/exploration-exploitation) — the practical wall.
9. [Model-based RL](/paths/reinforcement-learner/lessons/model-based-rl) — Dreamer, MuZero, sample efficiency.
10. [RLHF and beyond](/paths/reinforcement-learner/lessons/rl-from-human-feedback) — bringing it back to LLMs.

Plus 15 new wiki pages covering each subsystem, 5 new misconceptions, a survey paper on the [policy-optimization frontier in 2026](/research/pg-vs-trust-region-2026), and a new [RL forum domain](/forum/rl).

## The capstone

[Solve CartPole and LunarLander from scratch](/capstones/solve-cartpole-from-scratch) (4 weeks): implement REINFORCE → REINFORCE+baseline → A2C → PPO from numpy + PyTorch. End with a working PPO that solves CartPole in <30k steps and LunarLander in <1M. Compare against \`stable-baselines3\` on the same hyperparameters.

The capstone produces a public artifact showing your PPO matched (or didn't quite match) the reference implementation, with a defensible analysis of which engineering details account for any gap. The signed transcript is the credential — you've built the modern RL workhorse from scratch and understand exactly why each component is there.

## Why it matters now

RLHF training compute is one of the largest deployment classes of RL today. ChatGPT, Claude, Gemini all run modified PPO in their alignment loops. Without the foundations — what's a value function, why does the policy gradient theorem work, what does GAE buy you — RLHF is folklore.

This path supplies the foundations. Combined with the existing ml-engineer path's RLHF lesson, you've got the full ladder from MDPs through frontier-scale alignment.

For learners on the [AI Researcher path](/paths/ai-researcher): this is the missing prereq. Read the RL foundations alongside the alignment-frontier lesson; pair the capstone with the ai-researcher's evaluation-rigor and interpretability lessons.`,
    },
    {
      slug: "multimodal-path-launch",
      title: "Multimodal path: ViTs, CLIP, diffusion, and the modern VLM stack",
      summary:
        "Widening the platform from text-only LLMs to vision, audio, and multimodal. Nine lessons + 13 wiki pages cover ViTs, CLIP, diffusion, classifier-free guidance, audio + Whisper, and the multimodal-fusion design space.",
      coverEmoji: "🖼️",
      accentColor: "violet",
      authorId: carolId,
      body: `Modern ML is no longer text-only. ViTs, CLIP, Stable Diffusion, GPT-4V — the multimodal frontier is where most production AI work happens. The new [multimodal-engineer path](/paths/multimodal-engineer) covers it.

## What landed

Nine lessons covering the full multimodal stack:

1. [Image foundations](/paths/multimodal-engineer/lessons/image-foundations) — pixels, channels, convolutions.
2. [Vision Transformers](/paths/multimodal-engineer/lessons/vision-transformers) — ViT, patch embeddings.
3. [Contrastive learning](/paths/multimodal-engineer/lessons/contrastive-learning) — InfoNCE, SimCLR, MoCo.
4. [CLIP and VLMs](/paths/multimodal-engineer/lessons/clip-and-vlms) — joint embedding spaces, modern VLMs.
5. [Diffusion models](/paths/multimodal-engineer/lessons/diffusion-models) — forward + reverse, score matching.
6. [Text-to-image](/paths/multimodal-engineer/lessons/text-to-image) — Stable Diffusion + classifier-free guidance.
7. [Audio + speech](/paths/multimodal-engineer/lessons/audio-and-speech) — spectrograms, Whisper, modern TTS.
8. [Multimodal fusion](/paths/multimodal-engineer/lessons/multimodal-fusion) — early vs late vs cross-attention.
9. [Multimodal evaluation](/paths/multimodal-engineer/lessons/multimodal-evaluation) — benchmarks + hallucination probes.

Plus 13 new wiki pages, 6 new misconceptions, a survey paper on the [multimodal-fusion frontier in 2026](/research/multimodal-fusion-frontier-2026), and a new [multimodal forum domain](/forum/multimodal).

## Two capstones

[Train a Vision Transformer from scratch](/capstones/train-a-vit-from-scratch) (5 weeks): implement ViT-Tiny on CIFAR-10, compare against CNN, do MAE pretraining, scale to ImageNet-100. Output: an empirical analysis of when each architecture wins.

[Build a CLIP-style image-text retriever](/capstones/clip-style-retriever) (4 weeks): dual-encoder + InfoNCE on COCO Captions. Hard-negative mining, retrieval eval at scale (Recall@K, MRR), working similarity-search demo.

## Why it matters now

Vision and multimodal are no longer optional for the modern ML engineer. Every team eventually has to handle images, screenshots, documents, charts, video frames. Understanding the architecture (ViT + CLIP + VLMs + diffusion) is the foundation for shipping any multimodal application.

For learners on the ml-engineer path: this is the natural extension. Multimodal is built on the transformer + attention foundations you already know; the vision-specific concepts (patches, contrastive pretraining, latent diffusion) layer on top.

For learners on the [Reinforcement Learner path](/paths/reinforcement-learner): VLMs and RLHF combine — modern multimodal alignment uses RLHF with image conditioning. The two paths complement.`,
    },
    {
      slug: "comp-bio-path-launch",
      title: "Computational biology path: from sequence alignment to AlphaFold",
      summary:
        "ML × biology gets its own path. Nine lessons + 13 wiki pages cover DNA/RNA/protein, sequence alignment, AlphaFold, protein language models, single-cell genomics, and molecular dynamics. The most differentiated cross-domain on the platform.",
      coverEmoji: "🧬",
      accentColor: "emerald",
      authorId: carolId,
      body: `The 2020 AlphaFold breakthrough opened a new era for biology. Protein structure prediction — open for 50 years — was effectively solved. Since then, the field has expanded: ESM-3 generates novel functional proteins; single-cell foundation models embed millions of cells; AlphaFold 3 extends to multi-molecule complexes. The new [comp-biologist path](/paths/comp-biologist) covers it.

## What landed

Nine lessons covering the modern bio-ML stack:

1. [DNA, RNA, Protein](/paths/comp-biologist/lessons/dna-rna-protein) — the central dogma + computational representation.
2. [Sequence alignment](/paths/comp-biologist/lessons/sequence-alignment) — Smith-Waterman, BLAST, MSA.
3. [Phylogenetics](/paths/comp-biologist/lessons/phylogenetics) — distance methods, ML phylogenetics, evolutionary trees.
4. [Protein structure](/paths/comp-biologist/lessons/protein-structure) — primary, secondary, tertiary, quaternary.
5. [AlphaFold](/paths/comp-biologist/lessons/alphafold) — Evoformer, structure module, MSA.
6. [Protein language models](/paths/comp-biologist/lessons/protein-language-models) — ESM, masked-residue pretraining.
7. [Single-cell RNA-seq](/paths/comp-biologist/lessons/single-cell-rna-seq) — scRNA-seq, dimensionality reduction, foundation models.
8. [Molecular dynamics](/paths/comp-biologist/lessons/molecular-dynamics) — force fields, ML potentials.
9. [Bio-ML evaluation](/paths/comp-biologist/lessons/bio-ml-evaluation) — CASP, contamination, leakage.

Plus 13 new wiki pages, 6 new misconceptions, a survey paper on the [bio-ML state of the art in 2026](/research/bio-ml-state-of-art-2026), and a new [bio forum domain](/forum/bio).

## The capstone

[Build a protein language model from scratch](/capstones/build-a-protein-language-model) (6 weeks): train a small ESM-style protein LM via masked-residue prediction. Use it for variant effect prediction + functional embedding extraction. Compare against ESM-2.

The output is a public artifact showing your protein LM matched (or didn't quite match) ESM-2 on specific tasks, with engineering analysis of the gaps. Defensible bio-ML credential.

## Why this path is different

Compared to the other six paths (ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer), comp-bio is the most domain-specific. Concepts like sequence alignment, phylogenetics, and protein structure are biology-specific; methods like AlphaFold are bio-ML-specific.

But the ML substrate is the same: transformers, attention, contrastive learning, foundation models, careful evaluation. Bio-ML is what happens when modern ML methods meet biology's specific data structures + biological priors.

For learners interested in cross-domain ML: comp-bio is one of the highest-leverage application areas. Frontier-class progress (AlphaFold, ESM-3, scGPT) happens at the intersection of ML scaling laws + biological data + biology-specific adaptations.

## What this completes

This is the fourth and final new mastery path of the S55-S58 batch. From [systems engineer](/news/systems-engineer-path-launch) through [RL foundations](/news/rl-foundations-path-launch) to [multimodal](/news/multimodal-path-launch) and now comp-bio, the platform has 7 mastery paths covering the modern ML practitioner's toolkit end-to-end.`,
    },
    {
      slug: "applied-stats-path-launch",
      title: "Applied Statistics path: the substrate ML evaluation actually needs",
      summary:
        "A new mastery path covering the production-statistics toolkit: hypothesis testing, A/B experiments, sequential analysis, calibration, fairness. The discipline that separates ML papers that replicate from those that don't.",
      coverEmoji: "📊",
      accentColor: "sky",
      authorId: aliceId,
      body: `Most ML failures in production aren't from bad models. They're from sloppy evaluation. The new [applied-statistician path](/paths/applied-statistician) covers the production-statistics toolkit that makes ML decisions defensible.

## What landed

Eight lessons spanning the frequentist + Bayesian + experiment-design + uncertainty + fairness toolkit:

1. [Frequentist foundations](/paths/applied-statistician/lessons/frequentist-foundations) — sampling distributions, MLE, the bootstrap.
2. [Hypothesis testing](/paths/applied-statistician/lessons/hypothesis-testing) — p-values, Type I / II errors, multiple-testing correction.
3. [Bayesian inference](/paths/applied-statistician/lessons/bayesian-inference) — priors, posteriors, MCMC, when to go Bayesian.
4. [Experiment design](/paths/applied-statistician/lessons/experiment-design) — power analysis, randomization, blocking, stratification.
5. [A/B testing](/paths/applied-statistician/lessons/ab-testing) — sequential testing, peeking bias, HTE, OEC.
6. [Causal inference basics](/paths/applied-statistician/lessons/causal-inference-basics) — counterfactuals, RCTs, observational methods.
7. [Uncertainty quantification](/paths/applied-statistician/lessons/uncertainty-quantification) — calibration, conformal prediction, Bayesian deep learning.
8. [Bias & fairness](/paths/applied-statistician/lessons/bias-and-fairness) — demographic parity, equalized odds, the impossibility theorem.

Plus 22 new wiki pages — [p-value](/wiki/p-value), [bootstrap](/wiki/bootstrap), [MCMC](/wiki/mcmc), [power analysis](/wiki/power-analysis), [sequential testing](/wiki/sequential-testing), [conformal prediction](/wiki/conformal-prediction), [demographic parity](/wiki/demographic-parity), and 15 more — providing the densest reference cluster on the platform. Six new misconceptions cover the high-impact mistakes (p-value as P(null | data), peeking with Bonferroni, calibration ≠ accuracy, …). A new [applied-statistics forum domain](/forum/stats) gives discussion a home.

## The capstone

[Design and Run a Real A/B Test](/capstones/design-and-run-an-ab-test) (5 weeks): one full A/B-test artifact, defensible against a senior statistician's review.

Five milestones — hypothesis + power analysis → randomization design → sequential-testing protocol → analysis with multiple-testing protection → final decision report. By the end you have a single portfolio piece that demonstrates you can frame a hypothesis, choose an MDE, design randomization, run sequential testing without inflating Type I error, interpret confidence intervals correctly, and defend a production decision.

## Why this path is different

Compared to the seven other paths (ml-engineer, ai-researcher, mathematician, physicist, systems-engineer, reinforcement-learner, multimodal-engineer, comp-biologist), applied-statistician is the most universally applicable. Every ML team needs it. Most teams don't have it.

The mathematician path covers theory; this path covers the production-flavored applications: how to run an A/B test that won't reverse when run longer, how to report calibration alongside accuracy, how to audit fairness without falling for the impossibility theorem. It's where applied stats meets ML evaluation in the wild.

## The evaluation rigor frontier

For the broader picture of where the field is heading, see the new survey paper: [The Evaluation Rigor Frontier 2026](/research/evaluation-rigor-frontier-2026). Where sequential testing, calibration, and fairness have converged, where they haven't, and where the next decade probably lands.`,
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

  // Sprint 55 — Systems engineer path. Distributed training, serving,
  // monitoring. Closest sibling to ml-engineer; assumes transformer
  // familiarity (cross-path prereqs link back where relevant in the
  // lesson bodies).
  seedMasteryPath({
    slug: "systems-engineer",
    title: "Systems Engineer",
    description:
      "Distributed training, GPU memory accounting, production serving, monitoring. The infrastructure half of modern ML.",
    nodes: [
      { slug: "gpu-architecture", title: "GPU Architecture", level: "apprentice", order: 1, pages: ["gpu-architecture", "tensor-cores", "hbm-memory"], prereqs: [], description: "Tensor cores, HBM bandwidth, memory hierarchy — the substrate everything else runs on." },
      { slug: "mixed-precision-training", title: "Mixed Precision", level: "apprentice", order: 2, pages: ["mixed-precision", "loss-scaling"], prereqs: ["gpu-architecture"], description: "fp16 vs bf16 vs fp8, loss scaling, gradient stability." },
      { slug: "data-parallelism", title: "Data Parallelism", level: "practitioner", order: 3, pages: ["data-parallelism", "nccl-collective"], prereqs: ["mixed-precision-training"], description: "DDP, gradient sync, NCCL — the workhorse of multi-GPU training." },
      { slug: "model-parallelism", title: "Model Parallelism & FSDP", level: "practitioner", order: 4, pages: ["tensor-parallelism", "pipeline-parallelism", "fsdp"], prereqs: ["data-parallelism"], description: "Tensor + pipeline parallelism, FSDP. When the model doesn't fit on one GPU." },
      { slug: "mlops-experiment-tracking", title: "MLOps & Experiment Tracking", level: "specialist", order: 5, pages: ["mlflow", "experiment-tracking"], prereqs: ["data-parallelism"], description: "Reproducibility, hyperparameter sweeps, the discipline of remembering what you ran." },
      { slug: "inference-serving", title: "Inference Serving", level: "specialist", order: 6, pages: ["vllm", "paged-attention", "dynamic-batching"], prereqs: ["model-parallelism"], description: "vLLM, PagedAttention, dynamic batching — turning a checkpoint into a service." },
      { slug: "monitoring-observability", title: "Monitoring & Observability", level: "expert", order: 7, pages: ["model-monitoring", "drift-detection", "slo-budget"], prereqs: ["inference-serving"], description: "Drift, online evaluation, latency SLOs. What 'shipped' actually means." },
      { slug: "production-failure-modes", title: "Production Failure Modes", level: "expert", order: 8, pages: ["production-failures", "rollback-playbooks"], prereqs: ["monitoring-observability", "mlops-experiment-tracking"], description: "OOM, NaN gradients, silent corruption, rollback playbooks. The list of things that break in production." },
    ],
  });

  // Sprint 56 — Reinforcement Learning path. RLHF in ml-engineer is
  // covered as a depth-jump; this path supplies the missing ladder of
  // foundations from MDPs through PPO.
  seedMasteryPath({
    slug: "reinforcement-learner",
    title: "Reinforcement Learner",
    description:
      "From MDPs to PPO and onward to RLHF. The RL foundations the rest of modern AI assumes you have.",
    nodes: [
      { slug: "mdp-foundations", title: "MDP Foundations", level: "apprentice", order: 1, pages: ["mdp", "markov-property"], prereqs: [], description: "States, actions, rewards, transitions — the formal substrate of every RL algorithm." },
      { slug: "value-functions", title: "Value Functions", level: "apprentice", order: 2, pages: ["value-function", "bellman-equation"], prereqs: ["mdp-foundations"], description: "V(s), Q(s,a), and the Bellman equation that ties them together." },
      { slug: "dynamic-programming-rl", title: "Dynamic Programming", level: "practitioner", order: 3, pages: ["value-iteration", "policy-iteration"], prereqs: ["value-functions"], description: "Value iteration, policy iteration. Solving small MDPs exactly." },
      { slug: "temporal-difference", title: "Temporal Difference Learning", level: "practitioner", order: 4, pages: ["td-learning", "q-learning"], prereqs: ["value-functions"], description: "TD(0), SARSA, Q-learning. Learning value functions from samples." },
      { slug: "policy-gradients", title: "Policy Gradients", level: "practitioner", order: 5, pages: ["policy-gradient", "reinforce", "gae"], prereqs: ["value-functions"], description: "REINFORCE, baselines, GAE — optimizing the policy directly via gradient ascent on expected return." },
      { slug: "actor-critic", title: "Actor-Critic Methods", level: "specialist", order: 6, pages: ["actor-critic"], prereqs: ["policy-gradients", "temporal-difference"], description: "A2C, A3C — combining policy gradients with a learned value baseline." },
      { slug: "ppo-trpo", title: "PPO & TRPO", level: "specialist", order: 7, pages: ["ppo", "trpo"], prereqs: ["actor-critic"], description: "Trust regions, clipped surrogate objectives. The workhorse algorithms of modern RL." },
      { slug: "exploration-exploitation", title: "Exploration vs Exploitation", level: "specialist", order: 8, pages: ["exploration-strategies", "intrinsic-rewards"], prereqs: ["temporal-difference"], description: "ε-greedy, UCB, intrinsic motivation, curiosity. Why pure exploitation gets stuck." },
      { slug: "model-based-rl", title: "Model-Based RL", level: "expert", order: 9, pages: ["model-based-rl", "world-models"], prereqs: ["ppo-trpo"], description: "Learn a world model; plan with it. Dreamer, MuZero, the sample-efficiency frontier." },
      { slug: "rl-from-human-feedback", title: "RLHF & Beyond", level: "expert", order: 10, pages: ["rlhf"], prereqs: ["ppo-trpo"], description: "Bridge to ml-engineer's RLHF lesson. Why it's PPO with a learned reward model, where DPO simplifies, where the alignment problem actually lives." },
    ],
  });

  // Sprint 57 — Multimodal / Vision path. Widens the platform from
  // text-only LLMs to ViTs, CLIP, diffusion, audio, and modern VLMs.
  // Assumes transformer familiarity (cross-path prereqs link to
  // ml-engineer's multi-head-attention lesson).
  seedMasteryPath({
    slug: "multimodal-engineer",
    title: "Multimodal Engineer",
    description:
      "From pixels to vision transformers, CLIP, diffusion, audio, and modern VLMs. The non-text half of the modern ML stack.",
    nodes: [
      { slug: "image-foundations", title: "Image Foundations", level: "apprentice", order: 1, pages: ["convolutions", "image-tensors"], prereqs: [], description: "Pixels, channels, convolutions — the substrate every vision model builds on." },
      { slug: "vision-transformers", title: "Vision Transformers", level: "apprentice", order: 2, pages: ["vit", "patch-embeddings"], prereqs: ["image-foundations"], description: "ViT, patch embeddings, position. The architecture that brought transformers to vision." },
      { slug: "contrastive-learning", title: "Contrastive Learning", level: "practitioner", order: 3, pages: ["contrastive-loss", "infonce"], prereqs: [], description: "InfoNCE, SimCLR, hard negatives — the loss that powers self-supervised representation learning." },
      { slug: "clip-and-vlms", title: "CLIP & Vision-Language Models", level: "practitioner", order: 4, pages: ["clip", "vision-language-models"], prereqs: ["vision-transformers", "contrastive-learning"], description: "Joint embedding spaces, CLIP's contrastive pretraining, modern VLMs (GPT-4V, LLaVA)." },
      { slug: "diffusion-models", title: "Diffusion Models", level: "specialist", order: 5, pages: ["diffusion", "ddpm", "score-matching"], prereqs: ["image-foundations"], description: "Forward and reverse process, DDPM, score matching. The architecture behind Stable Diffusion + DALL-E." },
      { slug: "text-to-image", title: "Text-to-Image", level: "specialist", order: 6, pages: ["stable-diffusion", "classifier-free-guidance"], prereqs: ["diffusion-models", "clip-and-vlms"], description: "Stable Diffusion's latent diffusion + CLIP conditioning + classifier-free guidance." },
      { slug: "audio-and-speech", title: "Audio & Speech", level: "specialist", order: 7, pages: ["mel-spectrogram", "whisper"], prereqs: [], description: "Spectrograms, Whisper, modern TTS. Audio as another modality." },
      { slug: "multimodal-fusion", title: "Multimodal Fusion", level: "expert", order: 8, pages: ["multimodal-fusion"], prereqs: ["clip-and-vlms"], description: "Early vs late vs attention-based fusion. How modern VLMs actually combine modalities." },
      { slug: "multimodal-evaluation", title: "Multimodal Evaluation", level: "expert", order: 9, pages: ["mmlu-multimodal"], prereqs: ["multimodal-fusion"], description: "VQA benchmarks, hallucination detection, eval methodology when there's no single ground truth." },
    ],
  });

  // Sprint 58 — Computational Biology path. The most differentiated
  // cross-domain: ML × biology. AlphaFold, protein language models,
  // sequence modeling. Cross-references ml-engineer's attention work
  // explicitly (AlphaFold's evoformer is attention-based).
  seedMasteryPath({
    slug: "comp-biologist",
    title: "Computational Biologist",
    description:
      "ML × biology: from DNA/RNA/protein to AlphaFold, protein language models, and the bio-ML frontier.",
    nodes: [
      { slug: "dna-rna-protein", title: "DNA, RNA, Protein", level: "apprentice", order: 1, pages: ["central-dogma", "protein-sequence"], prereqs: [], description: "The central dogma, sequence representations, and what 'biological data' actually means computationally." },
      { slug: "sequence-alignment", title: "Sequence Alignment", level: "apprentice", order: 2, pages: ["sequence-alignment", "blast"], prereqs: ["dna-rna-protein"], description: "Smith-Waterman, BLAST, multiple sequence alignment. The classical bioinformatics that ML built on." },
      { slug: "phylogenetics", title: "Phylogenetics", level: "practitioner", order: 3, pages: ["phylogenetic-tree"], prereqs: ["sequence-alignment"], description: "Distance methods, maximum likelihood, evolutionary trees. How relatedness is inferred from sequence." },
      { slug: "protein-structure", title: "Protein Structure", level: "practitioner", order: 4, pages: ["protein-structure", "secondary-structure"], prereqs: ["dna-rna-protein"], description: "Primary → secondary → tertiary → quaternary. The folding problem and why it took until 2020 to crack." },
      { slug: "alphafold", title: "AlphaFold", level: "specialist", order: 5, pages: ["alphafold", "evoformer", "msa-attention"], prereqs: ["protein-structure", "sequence-alignment"], description: "Evoformer, structure module, MSA. Why attention + co-evolution gave us protein structure prediction." },
      { slug: "protein-language-models", title: "Protein Language Models", level: "specialist", order: 6, pages: ["esm", "protein-lms"], prereqs: ["protein-structure"], description: "ESM, masked-residue pretraining. Transformer LMs adapted to protein sequences." },
      { slug: "single-cell-rna-seq", title: "Single-Cell RNA-Seq", level: "specialist", order: 7, pages: ["scrna-seq", "umap-tsne"], prereqs: ["dna-rna-protein"], description: "Sequencing individual cells. Dimensionality reduction, cell-type clustering, the geneticist's microscope." },
      { slug: "molecular-dynamics", title: "Molecular Dynamics", level: "expert", order: 8, pages: ["molecular-dynamics"], prereqs: ["protein-structure"], description: "Force fields, Langevin sampling, simulating biomolecules at the atomic level." },
      { slug: "bio-ml-evaluation", title: "Bio-ML Evaluation", level: "expert", order: 9, pages: ["casp"], prereqs: ["alphafold", "protein-language-models"], description: "CASP, contamination, leakage. How bio-ML benchmarks stay (or fail to stay) honest." },
    ],
  });

  // Sprint 59 — Applied Statistics. Distinct from the mathematician
  // path: production-flavored statistics, A/B testing, evaluation
  // rigor, fairness. The substrate every ML team eventually needs.
  seedMasteryPath({
    slug: "applied-statistician",
    title: "Applied Statistician",
    description:
      "Production-flavored statistics: hypothesis testing, A/B experiments, uncertainty quantification, fairness. The substrate ML evaluation actually needs.",
    nodes: [
      { slug: "frequentist-foundations", title: "Frequentist Foundations", level: "apprentice", order: 1, pages: ["sampling-distribution", "bootstrap", "mle"], prereqs: [], description: "Sampling distributions, MLE, the bootstrap. The frequentist worldview." },
      { slug: "hypothesis-testing", title: "Hypothesis Testing", level: "apprentice", order: 2, pages: ["p-value", "type-i-ii-errors", "multiple-testing"], prereqs: ["frequentist-foundations"], description: "Null hypotheses, p-values, multiple testing correction. The standard inferential toolkit." },
      { slug: "bayesian-inference", title: "Bayesian Inference", level: "practitioner", order: 3, pages: ["prior-likelihood-posterior", "mcmc", "credible-interval"], prereqs: ["frequentist-foundations"], description: "Priors, posteriors, credible intervals, MCMC. When and why to go Bayesian." },
      { slug: "experiment-design", title: "Experiment Design", level: "practitioner", order: 4, pages: ["power-analysis", "randomization", "blocking-stratification"], prereqs: ["hypothesis-testing"], description: "Power analysis, randomization, blocking. Designing experiments that actually answer the question." },
      { slug: "ab-testing", title: "A/B Testing", level: "specialist", order: 5, pages: ["ab-test", "sequential-testing", "peeking-bias"], prereqs: ["experiment-design"], description: "Online experiments, sequential testing, the peeking problem. Production A/B at scale." },
      { slug: "causal-inference-basics", title: "Causal Inference Basics", level: "specialist", order: 6, pages: ["counterfactual", "rct"], prereqs: ["experiment-design"], description: "Counterfactuals, RCTs, the gap between correlation and cause. Bridges to the causality path." },
      { slug: "uncertainty-quantification", title: "Uncertainty Quantification", level: "expert", order: 7, pages: ["calibration", "conformal-prediction", "prediction-interval"], prereqs: ["bayesian-inference"], description: "Calibration, conformal prediction, prediction intervals. ML systems that know what they don't know." },
      { slug: "bias-and-fairness", title: "Bias & Fairness", level: "expert", order: 8, pages: ["demographic-parity", "fairness-accuracy-frontier"], prereqs: ["uncertainty-quantification"], description: "Demographic parity, equalized odds, the fairness-accuracy trade-off. The applied side of ML ethics." },
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
  {
    slug: "systems",
    title: "Systems",
    description:
      "Distributed training, serving, monitoring, the infrastructure half of ML.",
  },
  {
    slug: "rl",
    title: "Reinforcement Learning",
    description:
      "MDPs, value functions, policy gradients, PPO, RLHF, model-based RL.",
  },
  {
    slug: "multimodal",
    title: "Multimodal & Vision",
    description:
      "Vision transformers, CLIP, diffusion, audio, VLMs — non-text ML.",
  },
  {
    slug: "bio",
    title: "Computational Biology",
    description:
      "ML × biology: protein folding, sequence modeling, AlphaFold + ESM.",
  },
  {
    slug: "stats",
    title: "Applied Statistics",
    description:
      "Hypothesis testing, A/B experiments, calibration, fairness — production statistics.",
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

// Sprint 52 — load capstone tracks from seed-content/tracks/*.json.
// Each track JSON has { slug, title, summary, ..., capstones: [{slug,
// optional?}] }. The loader resolves capstone slugs to IDs and
// upserts the (track, capstone) join rows.
async function seedCapstoneTracks() {
  const dir = path.join(import.meta.dir, "../../../seed-content/tracks");
  if (!fs.existsSync(dir)) return;

  let systemUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "system"))
    .get();
  if (!systemUser) return; // capstones loader didn't run; nothing to attach

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let count = 0;
  for (const file of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    } catch {
      continue;
    }
    if (!parsed?.slug || !parsed?.title) continue;

    const existing = db
      .select({ id: capstoneTracks.id })
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, parsed.slug))
      .get();

    let trackId: string;
    const values = {
      slug: parsed.slug,
      title: parsed.title,
      summary: parsed.summary ?? "",
      contentIntro: parsed.contentIntro ?? "",
      contentUndergrad: parsed.contentUndergrad ?? "",
      contentGrad: parsed.contentGrad ?? "",
      canonicalTier: parsed.canonicalTier ?? "undergrad",
      coverEmoji: parsed.coverEmoji ?? "🎯",
      accentColor: parsed.accentColor ?? "violet",
      tags: JSON.stringify(parsed.tags ?? []),
      status: parsed.status ?? "published",
      authorId: systemUser.id,
    };
    if (existing) {
      trackId = existing.id;
      db.update(capstoneTracks)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(capstoneTracks.id, existing.id))
        .run();
      db.delete(capstoneTrackCapstones)
        .where(eq(capstoneTrackCapstones.trackId, trackId))
        .run();
    } else {
      trackId = randomUUID();
      db.insert(capstoneTracks).values({ id: trackId, ...values }).run();
    }

    const items: any[] = Array.isArray(parsed.capstones) ? parsed.capstones : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const slug = typeof it === "string" ? it : it?.slug;
      if (!slug) continue;
      const cap = db
        .select({ id: capstones.id })
        .from(capstones)
        .where(eq(capstones.slug, slug))
        .get();
      if (!cap) {
        console.warn(`  track ${parsed.slug}: capstone "${slug}" not found, skipping.`);
        continue;
      }
      db.insert(capstoneTrackCapstones).values({
        trackId,
        capstoneId: cap.id,
        order: typeof it === "object" && typeof it.order === "number" ? it.order : i,
        optional: typeof it === "object" && it.optional ? 1 : 0,
      }).run();
    }
    count++;
  }
  console.log(`  Seeded ${count} capstone track${count === 1 ? "" : "s"}.`);
}

seed().catch(console.error);
