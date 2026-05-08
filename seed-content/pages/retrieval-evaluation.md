---
title: Retrieval Evaluation
category: applications
---
<!-- tier:intro -->
# Retrieval Evaluation

A retrieval system answers: *given a query, which documents (or chunks) are most relevant?* This is the engine inside [[rag]], search engines, recommendation systems, and any application that finds things in a corpus.

You can't tell whether your retrieval is good without measuring it. Eyeballing 10 queries is fine for a demo; deploying to users requires actual numbers.

This page covers the standard retrieval evaluation toolkit: what to measure, how to build an evaluation set, and which benchmarks (BEIR, MTEB) to lean on.

## What we measure

A retrieval eval scores a ranked list of returned documents against a labeled ground truth ("which documents are actually relevant for this query?"). Three metrics dominate:

- **Hit rate @ k**: did *any* relevant document appear in the top-k results? Yes/no per query, averaged across queries. Simple, intuitive, but coarse.
- **Mean reciprocal rank (MRR)**: 1/rank of the first relevant document, averaged across queries. Rewards finding relevant items early.
- **nDCG (normalized discounted cumulative gain)**: gives partial credit based on graded relevance and the rank position. The most precise of the three but requires graded labels.

For binary "relevant or not" labels, hit rate and MRR are sufficient. For graded labels (highly relevant / somewhat relevant / not relevant), nDCG is the right tool.

<!-- tier:undergrad -->
# Retrieval Evaluation (Undergrad)

## Building an eval set

The hard part is the eval set itself. To measure retrieval quality, you need labeled (query, relevant-document) pairs. Three sources:

**Synthetic queries.** Use an LLM to generate plausible queries from each document. Cheap. Quality varies. Tends to produce queries that are "easy" — the LLM phrases them too closely to the document's wording, making retrieval look better than it really is.

**Human-labeled.** Annotators read documents and write queries, or read queries and label which retrieved documents are relevant. Expensive but high-quality. Inter-annotator agreement is rarely above 0.8 for graded relevance — labels are noisier than they look.

**Existing benchmarks.** BEIR (Benchmarking IR) is a collection of 18+ retrieval datasets across domains: scientific Q&A, financial documents, biomedical, legal. Each has labeled queries and relevant documents. If your domain is close to one of BEIR's datasets, just use it. If not, BEIR's protocol is still a useful template.

For domain-specific deployments, the practical recipe is: use BEIR-style datasets as a starting point, supplement with 50-200 hand-labeled queries from your actual domain.

## The three metrics in practice

**Hit rate @ k** is simple but loses information. Hit rate @ 5 = 0.9 sounds great, but it doesn't tell you whether the relevant document was at rank 1 or rank 5. For a chatbot that shows the user the top result, this matters a lot.

**MRR** weights early ranks heavily. MRR = 1.0 means the relevant document was always at rank 1. MRR = 0.5 means it averaged rank 2. MRR = 0.1 means rank 10. The numerator-of-rank structure makes MRR good for "finding the right thing fast."

**nDCG** generalizes to graded relevance. If your dataset labels documents as "highly relevant" (gain 3), "relevant" (gain 1), "not relevant" (gain 0), nDCG sums discounted gains down the rank list. The discount factor (typically 1/log(rank+1)) means earlier positions count more.

Use hit rate for quick iteration. Use MRR when you care about the position of the *first* relevant result. Use nDCG when you have graded relevance labels and care about the full ranking quality.

## BEIR — the standard sweep

BEIR is the closest thing to a "standard test suite" for retrieval. It includes:

- **MS MARCO** — large-scale web queries
- **TREC-COVID** — biomedical (COVID-era papers)
- **NFCorpus** — health-related Q&A
- **NaturalQuestions** — open-domain questions
- **HotpotQA** — multi-hop questions requiring multiple documents
- **FiQA** — financial Q&A
- **ArguAna** — argument retrieval
- **Touche-2020** — argumentative web search
- ...and others.

When a paper reports "BEIR score," they typically mean nDCG@10 averaged across all BEIR datasets. The averaging is generous — strong models do well on some, poorly on others. Read individual dataset numbers when picking an embedding model for your specific domain.

## MTEB — the embedding-model benchmark

[MTEB](https://huggingface.co/spaces/mteb/leaderboard) (Massive Text Embedding Benchmark) is the evaluation suite for *embedding models* specifically. It covers retrieval (BEIR), classification, clustering, semantic textual similarity, and a dozen other tasks. The MTEB leaderboard is the go-to ranking when picking an open embedding model.

Key things to know:

- The top of the leaderboard is dominated by models specifically optimized for the benchmark. They may not generalize as well to your domain as their score suggests.
- Look at the *retrieval* sub-score (and the dataset-level breakdowns) when you're picking for [[rag]] use cases. Average MTEB score is a marketing number; per-task scores are what matter for production.
- Newer entries (2024+) include cross-language retrieval and longer-context retrieval — relevant if your corpus is multilingual or document-length.

<!-- tier:grad -->
# Retrieval Evaluation (Graduate)

## Pitfalls in retrieval eval

A few subtleties that bite production teams:

**Test-set leakage in benchmarks.** BEIR datasets are well-known; embedding models can be (deliberately or inadvertently) trained on data that overlaps with the BEIR test queries. A model with a great BEIR score may have a much smaller advantage on your custom domain.

**The "good enough" trap.** When hit rate @ 5 climbs above 0.9 on your eval set, you might be tempted to ship. But if your eval set is 100 queries built from synthetic LLM generation, the metric is overfitted to the eval generator, not to real users. Always supplement with human-validated queries before shipping.

**Recall vs precision tradeoffs.** Hit rate @ k goes up as k grows. So does the noise — top-100 retrieved chunks are mostly irrelevant by definition. Optimizing for hit rate without considering precision rewards naive systems that retrieve a lot. Use MRR or nDCG instead, both of which penalize irrelevant chunks at high rank.

**Domain shift.** Embedding models trained on web text underperform on legal contracts, medical records, code, mathematical text. The MTEB leaderboard average misleads here. For domain-specific deployments, fine-tune the embedding model on labeled in-domain data, or accept lower retrieval quality.

## End-to-end RAG eval

Retrieval eval is one half. For a [[rag]] system, you also need:

- **Faithfulness**: does the generator's output stay grounded in retrieved chunks? Or does it hallucinate beyond them?
- **Answer relevance**: does the answer actually address the user's query?
- **Context recall**: of the facts needed to answer correctly, how many appeared in the retrieved chunks?

Tools: **RAGAS** automates these with LLM-as-judge. **TruLens** tracks them across requests in production. **DeepEval** and **Phoenix** are similar.

LLM-as-judge has its own problems (the judge has biases; it's expensive at scale) but it's the practical default for end-to-end RAG eval.

## Beyond benchmarks

Real production retrieval eval often includes signals not captured by BEIR-style metrics:

- **User clicks** (when available) — implicit relevance signal
- **Dwell time** on retrieved results
- **Query reformulations** — if users keep rephrasing, retrieval is failing
- **Negative feedback** — explicit thumbs-down or "this didn't help"

These are noisy individually but, aggregated across many users, they're the most reliable signal that retrieval is or isn't working *for actual people*. Building this feedback loop is often more valuable than a 1-point nDCG improvement on a benchmark.

## Key References

- Thakur et al., "BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models" (2021)
- Muennighoff et al., "MTEB: Massive Text Embedding Benchmark" (2023)
- Ousidhoum et al., "RAGAS: Automated Evaluation of Retrieval Augmented Generation" (2023)
- The MTEB leaderboard at huggingface.co/spaces/mteb/leaderboard
- Lin et al., "Pyserini: A Python Toolkit for Reproducible Information Retrieval Research" (2021)
