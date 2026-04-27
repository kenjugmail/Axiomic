---
title: Retrieval-Augmented Generation
category: applications
---
<!-- tier:intro -->

# Retrieval-Augmented Generation (RAG)

Language models are trained on a fixed dataset, which means they have a knowledge cutoff — they don't know about events or information that appeared after their training. They can also hallucinate, confidently stating things that aren't true. **Retrieval-Augmented Generation** (RAG) addresses both problems by giving the model access to an external knowledge source it can consult before answering.

## How It Works

RAG works in two steps:

1. **Retrieve.** When the user asks a question, search a knowledge base (documents, databases, web pages) for relevant information. This is typically done using [embeddings](/wiki/embeddings) — converting both the question and documents into numerical vectors and finding the closest matches.

2. **Generate.** Feed the retrieved information to the language model along with the original question. The model then generates its answer based on both its own knowledge and the retrieved context.

It's like the difference between taking a closed-book exam (standard LLM) and an open-book exam (RAG). The student (model) can look up relevant passages before writing their answer.

## A Simple Example

**User question:** "What was the revenue of Acme Corp in Q3 2025?"

**Without RAG:** The model might hallucinate a number or say it doesn't know (if this is after its training cutoff).

**With RAG:**
1. The system searches Acme Corp's financial documents and retrieves the relevant quarterly report paragraph.
2. The model reads: "In Q3 2025, Acme Corp reported revenue of $4.2 billion..."
3. The model answers accurately based on the retrieved document.

## Why RAG Is Popular

- **Up-to-date knowledge.** New documents can be added to the knowledge base at any time — no model retraining needed.
- **Reduced hallucination.** The model can ground its answers in actual source documents.
- **Verifiability.** You can show users which documents the answer came from, enabling fact-checking.
- **Domain specialization.** Point the retrieval system at your company's internal documents to create a specialized assistant.
- **Cost-effective.** Much cheaper than fine-tuning a model for every knowledge update.

## Limitations

RAG is only as good as its retrieval step. If the relevant document isn't found, the model either won't answer correctly or will fall back on its (possibly wrong) internal knowledge. Writing good queries and building effective search indices are critical engineering challenges.

## Related Topics

- [Embeddings](/wiki/embeddings) — the vector representations used for similarity search
- [Fine-Tuning](/wiki/fine-tuning) — an alternative approach to adding knowledge to models
- [Tokens](/wiki/tokens) — context window limits constrain how much retrieved text the model can process

<!-- tier:undergrad -->

# Retrieval-Augmented Generation (RAG)

RAG (Lewis et al., 2020) combines a parametric language model with a non-parametric retrieval component. This section covers the architecture, retrieval mechanisms, and practical implementation.

## Architecture

A RAG system has three main components:

1. **Query encoder** $E_q$: maps the input query $q$ to a dense vector $\mathbf{q} = E_q(q) \in \mathbb{R}^d$
2. **Document index**: a collection of documents $\{d_1, \ldots, d_N\}$ pre-encoded as vectors $\mathbf{d}_i = E_d(d_i)$ and stored in a vector database
3. **Generator** $G$: a language model that generates output conditioned on both the query and retrieved documents

The retrieval step finds the top-$k$ documents by similarity:

$$\mathcal{R}(q) = \text{top-}k_{d_i} \; \text{sim}(\mathbf{q}, \mathbf{d}_i)$$

where $\text{sim}$ is typically cosine similarity or dot product. The generator then produces:

$$p(y \mid q) = G(y \mid q, \mathcal{R}(q))$$

## Dense Retrieval

Modern RAG systems use **dense retrieval** with learned embeddings rather than sparse keyword matching (BM25). The retrieval model is typically a bi-encoder:

$$\text{score}(q, d) = E_q(q)^\top E_d(d)$$

Popular embedding models include E5 (Wang et al., 2022), BGE (Xiao et al., 2024), and OpenAI's text-embedding models. These are trained with contrastive learning:

$$\mathcal{L} = -\log \frac{\exp(\text{sim}(q, d^+) / \tau)}{\exp(\text{sim}(q, d^+) / \tau) + \sum_{d^-} \exp(\text{sim}(q, d^-) / \tau)}$$

where $d^+$ is a relevant document and $d^-$ are negatives.

## Chunking Strategies

Documents must be split into chunks that fit the retrieval model's context window and the generator's context window. Common approaches:

| Strategy | Chunk Size | Pros | Cons |
|---|---|---|---|
| Fixed-size | 256--512 tokens | Simple, consistent | Breaks mid-sentence |
| Sentence-based | Variable | Preserves meaning | Uneven sizes |
| Recursive splitting | Variable | Respects structure | More complex |
| Semantic chunking | Variable | Meaningful boundaries | Requires embedding model |

Overlap between adjacent chunks (e.g., 50 tokens) helps avoid splitting relevant passages.

## Implementation Example

```python
import numpy as np
from sentence_transformers import SentenceTransformer

# 1. Encode documents
encoder = SentenceTransformer("BAAI/bge-base-en-v1.5")
documents = [
    "Transformers use self-attention to process sequences in parallel.",
    "LoRA reduces fine-tuning cost by using low-rank weight updates.",
    "RLHF aligns language models with human preferences.",
    # ... thousands more chunks
]
doc_embeddings = encoder.encode(documents, normalize_embeddings=True)

# 2. Build index (using FAISS for efficient search)
import faiss
dimension = doc_embeddings.shape[1]
index = faiss.IndexFlatIP(dimension)  # Inner product (cosine sim for normalized vectors)
index.add(doc_embeddings.astype(np.float32))

# 3. Retrieve
query = "How can I fine-tune a model efficiently?"
query_embedding = encoder.encode([query], normalize_embeddings=True)
scores, indices = index.search(query_embedding.astype(np.float32), k=3)
retrieved = [documents[i] for i in indices[0]]

# 4. Generate (using the retrieved context)
context = "\n".join(retrieved)
prompt = f"""Answer the question based on the following context:

Context:
{context}

Question: {query}
Answer:"""
# Pass prompt to language model...
```

## Evaluation

RAG evaluation has two dimensions:

**Retrieval quality:**
- **Recall@k**: fraction of relevant documents in top-$k$ results
- **MRR** (Mean Reciprocal Rank): $\frac{1}{|Q|}\sum_{i=1}^{|Q|}\frac{1}{\text{rank}_i}$
- **NDCG**: normalized discounted cumulative gain

**Generation quality:**
- **Faithfulness**: does the answer accurately reflect the retrieved documents?
- **Answer relevance**: does the answer address the question?
- **Context relevance**: are the retrieved documents relevant?

Frameworks like RAGAS (Es et al., 2023) automate these evaluations using LLM-as-judge.

## Related Topics

- [Embeddings](/wiki/embeddings) — the vector representations powering retrieval
- [Fine-Tuning](/wiki/fine-tuning) — an alternative to RAG for knowledge injection
- [Tokens](/wiki/tokens) — context window constraints on retrieved text
- [LoRA](/wiki/lora) — can be combined with RAG for domain adaptation

<!-- tier:grad -->

# Retrieval-Augmented Generation (RAG)

Since Lewis et al. (2020), RAG has evolved from a research concept to the dominant architecture for knowledge-grounded generation. This section covers advanced architectures, failure modes, and the research frontier.

## RAG Taxonomies

Gao et al. (2024) categorize RAG systems into three paradigms:

1. **Naive RAG**: retrieve-then-generate pipeline. Simple but suffers from retrieval noise and limited reasoning over retrieved content.
2. **Advanced RAG**: adds pre-retrieval (query rewriting, HyDE) and post-retrieval (reranking, compression) stages.
3. **Modular RAG**: flexible architectures that may retrieve iteratively, route queries, or decide whether retrieval is needed at all.

## Advanced Retrieval Techniques

**HyDE** (Gao et al., 2023): Hypothetical Document Embeddings. Instead of embedding the query directly, the LLM first generates a hypothetical answer, which is then embedded for retrieval. This bridges the query-document distribution gap:

$$\mathbf{q}_\text{HyDE} = E_d\!\left(G(q)\right)$$

Since $G(q)$ resembles a document more than a query does, retrieval performance improves significantly.

**Query decomposition.** Complex queries are decomposed into sub-queries, each retrieving different information:

$$q \to \{q_1, q_2, \ldots, q_m\}, \quad \mathcal{R}(q) = \bigcup_{i=1}^m \mathcal{R}(q_i)$$

**Iterative retrieval.** For multi-hop reasoning, retrieve-generate-retrieve cycles allow the model to formulate follow-up queries based on intermediate results. IRCoT (Trivedi et al., 2023) interleaves chain-of-thought reasoning with retrieval.

**Reranking.** A cross-encoder reranker scores (query, document) pairs jointly, capturing fine-grained relevance that bi-encoders miss:

$$\text{score}_\text{rerank}(q, d) = \text{CrossEncoder}([q; d])$$

Cross-encoders are too slow for initial retrieval (they can't pre-compute document embeddings) but effective for re-scoring the top-$k$ candidates.

## Failure Modes

**Lost in the middle.** Liu et al. (2024) showed that language models pay disproportionate attention to information at the beginning and end of the context, often ignoring relevant information in the middle of long retrieved passages.

**Retrieval noise.** Irrelevant retrieved documents can actively harm generation quality — the model may incorporate false information from noisy retrievals. Yoran et al. (2024) showed that training models to be robust to irrelevant context improves RAG reliability.

**Conflicting evidence.** When retrieved documents disagree, models tend to favor information appearing more frequently or earlier in the context, regardless of source reliability. Xie et al. (2024) studied this "knowledge conflict" problem.

**Over-reliance.** RAG-augmented models may ignore their parametric knowledge even when it's correct and the retrieved context is wrong. Calibrating the balance between parametric and retrieved knowledge remains an open problem.

## RAG vs. Long Context

As context windows expand (128K+ tokens), a natural question arises: can we simply stuff all documents into the context, eliminating the retrieval step?

Empirically, RAG with targeted retrieval often outperforms naive long-context approaches because:
- Retrieval acts as a relevance filter, reducing noise
- Vector search scales to millions of documents; context windows cannot
- Cost scales with context length ($O(n^2)$ for attention)

However, for small document collections (<100 pages), long-context approaches can be simpler and more effective (Xu et al., 2024).

## Training RAG Systems End-to-End

**RETRO** (Borgeaud et al., 2022): integrates retrieval into the transformer architecture itself, with chunked cross-attention over retrieved neighbors. The retriever and generator are jointly trained.

**Atlas** (Izacard et al., 2023): jointly trains the retriever and generator, with the retriever receiving gradients through the generation loss via attention distillation:

$$\nabla_{\phi_\text{ret}} \mathcal{L} \approx \sum_{d \in \mathcal{R}(q)} \nabla_{\phi_\text{ret}} \text{score}(q, d) \cdot \left[\text{RAAP}(q, d)\right]$$

where RAAP is the retriever-aware attention probability measuring each document's contribution to the correct answer.

**Self-RAG** (Asai et al., 2024): trains the model to decide *when* to retrieve, *what* to retrieve, and to critique its own use of retrieved information using special reflection tokens.

## Evaluation Challenges

Standard QA benchmarks don't capture RAG-specific failure modes. Open challenges:
1. **Attribution accuracy**: can the model correctly cite which retrieved document supports each claim?
2. **Robustness to adversarial documents**: can the system resist poisoned or misleading documents in the index?
3. **Freshness**: when the knowledge base is updated, does the system correctly prefer new over outdated information?

## Related Topics

- [Embeddings](/wiki/embeddings) — the foundation of dense retrieval
- [Fine-Tuning](/wiki/fine-tuning) — complementary approach to knowledge injection
- [LoRA](/wiki/lora) — often combined with RAG for domain-specific models
- [Attention](/wiki/attention) — the mechanism for incorporating retrieved context
