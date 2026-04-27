---
title: Retrieval-Augmented Generation (RAG)
category: applications
---
<!-- tier:intro -->
# Retrieval-Augmented Generation (RAG)

Language models have a fundamental limitation: they can only "know" things that were in their training data. Ask about something that happened after training, or about a private document the model never saw, and it will either refuse to answer or -- worse -- confidently make something up (a phenomenon called **hallucination**).

**Retrieval-Augmented Generation** (RAG) solves this by giving the model the ability to look things up. Instead of relying solely on what it memorized during training, a RAG system first searches a knowledge base, retrieves relevant documents, and then feeds those documents to the language model along with the question. The model generates its answer based on the retrieved evidence.

## How RAG Works

A RAG system has three main components:

1. **A knowledge base.** This is a collection of documents -- it could be Wikipedia, your company's internal docs, a legal database, or any text corpus. Each document is split into chunks (typically a few hundred words each) and converted into a numerical representation (an [embedding](/wiki/embeddings)) that captures its meaning.

2. **A retriever.** When a question comes in, the retriever converts it into an embedding too, then finds the document chunks whose embeddings are most similar. This is essentially a "meaning-based search" -- it finds documents that are semantically related to the question, not just ones that share the same keywords.

3. **A generator.** The retrieved chunks are inserted into the model's prompt (for example: "Based on the following documents: [retrieved text]... Answer this question: [user question]"). The language model reads the documents and generates an answer grounded in that evidence.

## Why RAG Matters

RAG provides several critical benefits:

**Freshness.** The knowledge base can be updated anytime without retraining the model. A model trained in 2024 can answer questions about events in 2026 if the knowledge base contains up-to-date information.

**Grounding.** Because the model is working from specific retrieved documents, its answers are traceable. You can show the user exactly which documents the answer came from, enabling verification and building trust.

**Domain specialization.** A general-purpose model can be made an expert in law, medicine, or your company's products just by pointing it at the right knowledge base. No fine-tuning required.

**Cost efficiency.** Keeping a knowledge base current is dramatically cheaper than retraining a large model, which can cost millions of dollars.

## Limitations

RAG is only as good as its retriever. If the right document is not found, the model cannot use it. And even with the right documents retrieved, the model might misinterpret or ignore them. RAG also adds latency (the retrieval step takes time) and complexity to the system.

<!-- tier:undergrad -->
# Retrieval-Augmented Generation (RAG)

## Architecture

RAG (Lewis et al., 2020) combines a parametric model (the generator) with a non-parametric memory (the retrieval corpus). Formally, given a query $q$, the system:

1. **Retrieves** the top-$k$ documents $\{d_1, \ldots, d_k\}$ using a retriever $p_\eta(d \mid q)$
2. **Generates** the output $y$ conditioned on both $q$ and the retrieved documents

Two variants exist:

**RAG-Sequence:** Generates the entire output conditioned on a single retrieved document, then marginalizes:

$$
P(y \mid q) = \sum_{d \in \text{top-}k} p_\eta(d \mid q) \cdot p_\theta(y \mid q, d)
$$

**RAG-Token:** Marginalizes over documents at each token position, allowing different tokens to attend to different documents:

$$
P(y \mid q) = \prod_{t=1}^{N} \sum_{d \in \text{top-}k} p_\eta(d \mid q) \cdot p_\theta(y_t \mid q, d, y_{<t})
$$

## Dense Retrieval

Modern RAG systems use dense (embedding-based) retrieval rather than sparse (keyword-based) methods. Given an encoder $E$, each document chunk $d$ is encoded offline:

$$
\mathbf{d} = E_{\text{doc}}(d) \in \mathbb{R}^h
$$

At query time, the query is encoded and similarity is computed via dot product or cosine similarity:

$$
\text{score}(q, d) = E_{\text{query}}(q)^\top E_{\text{doc}}(d)
$$

Top-$k$ retrieval over millions of documents is made efficient using approximate nearest neighbor (ANN) indices such as FAISS (Johnson et al., 2019) or ScaNN.

## Chunking Strategies

Documents must be split into chunks that fit within the model's context window. Common approaches:

- **Fixed-size chunking:** Split every $n$ tokens with $m$ tokens of overlap
- **Semantic chunking:** Split at paragraph or section boundaries
- **Recursive splitting:** Hierarchically split at decreasing granularity (document, section, paragraph, sentence)

Chunk size is a fundamental tradeoff: smaller chunks enable precise retrieval but may lack context; larger chunks provide more context but may introduce noise.

## Implementation

```python
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss

class SimpleRAG:
    def __init__(self, embedding_model: str = "BAAI/bge-small-en-v1.5"):
        self.encoder = SentenceTransformer(embedding_model)
        self.chunks = []
        self.index = None

    def index_documents(self, chunks: list[str]):
        """Encode and index document chunks."""
        self.chunks = chunks
        embeddings = self.encoder.encode(chunks, normalize_embeddings=True)
        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dim)  # Inner product = cosine for normalized vecs
        self.index.add(embeddings.astype(np.float32))

    def retrieve(self, query: str, top_k: int = 5) -> list[str]:
        """Retrieve top-k most relevant chunks."""
        q_emb = self.encoder.encode([query], normalize_embeddings=True)
        scores, indices = self.index.search(q_emb.astype(np.float32), top_k)
        return [self.chunks[i] for i in indices[0]]

    def build_prompt(self, query: str, top_k: int = 5) -> str:
        """Build a prompt with retrieved context."""
        docs = self.retrieve(query, top_k)
        context = "\n\n---\n\n".join(docs)
        return (
            f"Answer the question based on the following context.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n"
            f"Answer:"
        )
```

## Evaluation Metrics

RAG systems are evaluated on both retrieval quality and generation quality:

- **Recall@k:** Fraction of relevant documents in the top-$k$ retrieved
- **MRR (Mean Reciprocal Rank):** $\frac{1}{|Q|} \sum_{q} \frac{1}{\text{rank}(q)}$
- **Faithfulness:** Does the generated answer accurately reflect the retrieved documents? (Often evaluated with NLI models)
- **Answer relevance:** Does the generated answer address the query?

<!-- tier:grad -->
# Retrieval-Augmented Generation (RAG)

## Retriever Training

### Contrastive Learning

Dense retrievers are typically trained with contrastive objectives. DPR (Karpukhin et al., 2020) uses a dual-encoder architecture trained with in-batch negatives:

$$
\mathcal{L} = -\log \frac{e^{\text{sim}(q, d^+)}}{e^{\text{sim}(q, d^+)} + \sum_{d^- \in \mathcal{N}} e^{\text{sim}(q, d^-)}}
$$

where $d^+$ is a relevant document and $\mathcal{N}$ contains negative examples. Hard negative mining (selecting negatives that are similar but irrelevant) is critical for performance.

### Late Interaction Models

ColBERT (Khattab & Zaharia, 2020) uses a "late interaction" mechanism that maintains per-token embeddings rather than compressing to a single vector:

$$
\text{score}(q, d) = \sum_{i=1}^{|q|} \max_{j=1}^{|d|} \mathbf{q}_i^\top \mathbf{d}_j
$$

This MaxSim operation captures fine-grained token-level matching while still allowing precomputation of document embeddings. ColBERTv2 (Santhanam et al., 2022) reduces storage costs via residual compression.

## Advanced RAG Architectures

### Self-RAG

Asai et al. (2023) introduced Self-RAG, which trains the language model to decide when retrieval is needed and to critically evaluate retrieved passages. The model generates special reflection tokens:

- **[Retrieve]:** Should I retrieve? (yes/no)
- **[IsRel]:** Is this passage relevant? (relevant/irrelevant)
- **[IsSup]:** Is the response supported by the passage? (fully/partially/no)
- **[IsUse]:** Is the response useful? (score 1-5)

These tokens are trained via supervised learning on critic-annotated data, enabling the model to self-regulate its use of retrieval.

### Corrective RAG (CRAG)

Yan et al. (2024) add a lightweight "retrieval evaluator" that scores retrieved documents and takes corrective actions:
- If confidence is high, refine by extracting key sentences
- If confidence is low, trigger web search as a fallback
- If ambiguous, combine both refined retrieval and web results

### Adaptive Retrieval

Not every query benefits from retrieval. Mallen et al. (2023) showed that for popular entities, LLMs already have accurate parametric knowledge and retrieval can hurt by introducing noise. Adaptive methods route queries to retrieval only when the model's parametric confidence is low, estimated via the entropy of the output distribution without retrieval:

$$
H(Y \mid q) = -\sum_{y} P_\theta(y \mid q) \log P_\theta(y \mid q)
$$

Retrieval is triggered when $H(Y \mid q) > \tau$ for a learned threshold $\tau$.

## Chunk Optimization

### Hypothetical Document Embeddings (HyDE)

Gao et al. (2023) proposed a counterintuitive approach: instead of embedding the query directly, first ask the LLM to generate a hypothetical answer, then embed that. The rationale is that a hypothetical answer is more lexically and semantically similar to actual relevant documents than a short query is:

$$
\hat{d} = \text{LLM}(q), \quad \text{score}(q, d) = E(\hat{d})^\top E(d)
$$

### Parent Document Retrieval

A common production pattern: embed small chunks for precise retrieval, but return the larger parent document for generation. This separates the granularity of retrieval (precise) from the granularity of context (comprehensive).

## Scaling and Production Challenges

**Index freshness.** In production, documents change continuously. Incremental index updates, where new or modified documents are re-embedded and inserted without rebuilding the full index, are essential. FAISS supports this via `add()` and `remove_ids()` operations.

**Latency.** Retrieval adds 50--200ms to generation latency. Techniques include: precomputation (embed the query during the first forward pass of the LLM), caching frequent queries, and using smaller embedding models with quantized indices.

**Multi-hop reasoning.** Complex questions require chaining multiple retrieval steps. IRCoT (Trivedi et al., 2023) interleaves chain-of-thought reasoning with retrieval: the model generates a reasoning step, retrieves based on that step, then continues reasoning with the new evidence.

## Key References

- Lewis, P., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *NeurIPS*.
- Karpukhin, V., et al. (2020). Dense passage retrieval for open-domain question answering. *EMNLP*.
- Khattab, O., & Zaharia, M. (2020). ColBERT: Efficient and effective passage search via contextualized late interaction over BERT. *SIGIR*.
- Asai, A., et al. (2023). Self-RAG: Learning to retrieve, generate, and critique through self-reflection. *ICLR*.
- Gao, L., et al. (2023). Precise zero-shot dense retrieval without relevance labels. *ACL*.
- Trivedi, H., et al. (2023). Interleaving retrieval with chain-of-thought reasoning for knowledge-intensive multi-step questions. *ACL*.
