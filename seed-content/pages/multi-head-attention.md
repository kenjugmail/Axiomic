---
title: Multi-Head Attention
category: attention
---
<!-- tier:intro -->
# Multi-Head Attention

Imagine you're reading a sentence and trying to understand a single word. There are many different things you might need to pay attention to:
- **What does it refer to?** (coreference)
- **What role does it play grammatically?** (syntax)
- **What's the overall topic?** (semantics)

With a single [attention](/wiki/attention) mechanism, the model has to cram all these different kinds of relationships into one set of attention weights. That's a lot to ask.

**Multi-head attention** solves this by running multiple attention operations in parallel -- each one called a "head." Each head can learn to focus on a different type of relationship. One head might specialize in tracking what pronouns refer to, another might track subject-verb relationships, and another might capture topical similarity.

## How It Works

1. **Split:** The [embedding](/wiki/embeddings) for each word gets split (via different learned projections) into multiple smaller pieces -- one piece per head.
2. **Attend:** Each head independently runs its own [self-attention](/wiki/self-attention) computation on its piece.
3. **Concatenate:** The outputs from all heads are concatenated back together.
4. **Project:** A final linear transformation combines the multi-head output back to the original dimension.

If the model has an embedding dimension of 768 and uses 12 attention heads, each head works with vectors of dimension 64 (768 / 12). Each head has its own set of query, key, and value weight matrices.

## Why Multiple Heads Help

Think of it like having a committee of analysts, each examining the same data from a different angle. One analyst looks at short-range connections, another at long-range ones. One focuses on syntactic structure, another on semantic meaning. The final output combines all their perspectives.

:::lab[attention-weights-lab]

Research has shown that trained heads do genuinely specialize. In BERT, specific heads have been found that closely track linguistic relationships like dependency parse trees. Some heads consistently attend to the previous word, others to the end of the sentence, and others to syntactically related words far away.

## The Standard Configuration

The original Transformer used 8 heads. Modern large language models typically use many more:
- GPT-2 Small: 12 heads
- GPT-3: 96 heads
- LLaMA-2 70B: 64 heads

Multi-head attention appears in every layer of the transformer and is the primary mechanism for inter-token communication. It's combined with [feed-forward networks](/wiki/feed-forward-networks) (which process each token independently) and [layer normalization](/wiki/layer-normalization) to form the complete transformer block.

<!-- tier:undergrad -->
# Multi-Head Attention

## Formal Definition

Multi-head attention runs $h$ parallel attention functions, each with its own learned projections:

$$\text{MultiHead}(\mathbf{X}) = \text{Concat}(\text{head}_1, \dots, \text{head}_h) \mathbf{W}^O$$

where each head is:

$$\text{head}_i = \text{Attention}(\mathbf{X}\mathbf{W}_i^Q, \mathbf{X}\mathbf{W}_i^K, \mathbf{X}\mathbf{W}_i^V)$$

The projection matrices are:
- $\mathbf{W}_i^Q \in \mathbb{R}^{d_{\text{model}} \times d_k}$
- $\mathbf{W}_i^K \in \mathbb{R}^{d_{\text{model}} \times d_k}$
- $\mathbf{W}_i^V \in \mathbb{R}^{d_{\text{model}} \times d_v}$
- $\mathbf{W}^O \in \mathbb{R}^{hd_v \times d_{\text{model}}}$

Typically $d_k = d_v = d_{\text{model}} / h$, so the total computation is roughly the same as a single-head attention with full dimensionality.

## Parameter Count

For one multi-head attention layer:

- Q projections: $h \times d_{\text{model}} \times d_k = d_{\text{model}}^2$
- K projections: $d_{\text{model}}^2$
- V projections: $d_{\text{model}}^2$
- Output projection: $d_{\text{model}}^2$

**Total: $4 d_{\text{model}}^2$** (ignoring biases). This is the same parameter count regardless of the number of heads, since $h \cdot d_k = d_{\text{model}}$.

## Why Not Just Use a Bigger Single Head?

A single head with dimension $d_{\text{model}}$ would have the same parameter count but performs worse. Why?

Each attention head computes a **rank-$d_v$ attention output** (since values have dimension $d_v$ and the output is a weighted sum of values). With $h$ heads, the concatenated output has rank up to $h \cdot d_v = d_{\text{model}}$. The multi-head architecture can represent a richer set of attention patterns than a single head.

Additionally, different heads learn to attend to different relative positions and linguistic phenomena. A single head must compromise between all these patterns.

## Efficient Implementation

In practice, multi-head attention is implemented as a single large matrix multiplication followed by reshaping, not as separate per-head operations:

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model: int, n_heads: int, causal: bool = False):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        self.causal = causal

        # Single large projections for all heads
        self.W_qkv = nn.Linear(d_model, 3 * d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)

    def forward(self, X: torch.Tensor) -> torch.Tensor:
        """X: (batch, seq_len, d_model)"""
        B, T, C = X.shape

        # Project Q, K, V for all heads at once
        qkv = self.W_qkv(X)  # (B, T, 3 * d_model)
        Q, K, V = qkv.chunk(3, dim=-1)

        # Reshape to (B, n_heads, T, d_k)
        Q = Q.view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        K = K.view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        V = V.view(B, T, self.n_heads, self.d_k).transpose(1, 2)

        # Scaled dot-product attention
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)

        if self.causal:
            mask = torch.triu(torch.ones(T, T, device=X.device), diagonal=1).bool()
            scores.masked_fill_(mask, float('-inf'))

        attn = F.softmax(scores, dim=-1)  # (B, n_heads, T, T)
        out = torch.matmul(attn, V)       # (B, n_heads, T, d_k)

        # Concatenate heads and project
        out = out.transpose(1, 2).contiguous().view(B, T, self.d_model)
        return self.W_o(out)

# Using PyTorch 2.0+ built-in (recommended for production)
# F.scaled_dot_product_attention handles FlashAttention automatically
```

## Attention Patterns by Head

Empirical analysis of trained models reveals characteristic patterns:

| Head Type | Pattern | Example |
|-----------|---------|---------|
| Previous token | Attends to position $i-1$ | Token-level bigram features |
| BOS/delimiter | Attends to first token | Attention sink (baseline) |
| Positional | Fixed relative offset | Syntactic locality |
| Content-based | Semantically similar tokens | Coreference, topic |
| Induction | Copies from matched context | In-context learning |

<!-- tier:grad -->
# Multi-Head Attention

## Head Redundancy and Pruning

Voita et al. (2019) studied which attention heads are important in trained transformers. Using a differentiable relaxation of $L_0$ regularization to prune heads:

$$\mathbf{a}_i = \text{head}_i \cdot g_i, \quad g_i \sim \text{HardConcrete}(\log \alpha_i)$$

where $g_i$ are learned gates. They found that only a small fraction of heads are critical. In a 6-layer encoder, pruning reduced 48 heads to ~8 without significant quality loss. The surviving heads fell into three categories: positional, syntactic, and rare-word heads.

Michel et al. (2019) reached similar conclusions through ablation: removing individual heads rarely affects performance, and even removing entire layers can be tolerated. However, removing all heads within a layer (especially early or late layers) is catastrophic.

## Multi-Query and Grouped-Query Attention

The KV cache in autoregressive inference stores $\mathbf{K}$ and $\mathbf{V}$ tensors for all past tokens across all layers and heads. For a model with $L$ layers, $h$ heads, dimension $d_k$, and sequence length $n$:

$$\text{KV cache size} = 2 \times L \times h \times n \times d_k \times \text{sizeof(dtype)}$$

For LLaMA-2 70B ($L=80$, $h=64$, $d_k=128$, $n=4096$, fp16): $\approx 10$ GB per sequence.

**Multi-Query Attention (MQA)** (Shazeer, 2019) uses $h$ query heads but **one shared** KV head:

$$\text{head}_i = \text{Attention}(\mathbf{X}\mathbf{W}_i^Q, \mathbf{X}\mathbf{W}^K, \mathbf{X}\mathbf{W}^V)$$

This reduces KV cache by $h\times$ with minimal quality degradation. The key insight: during generation, the memory bandwidth bottleneck is loading KV cache, not computing attention.

**Grouped-Query Attention (GQA)** (Ainslie et al., 2023) is the middle ground: $g$ groups, each with $h/g$ query heads sharing one KV head. LLaMA-2 70B uses $g=8$ (8 KV heads for 64 query heads).

Converting a pretrained MHA model to GQA: mean-pool the KV heads within each group, then fine-tune briefly ("uptraining"). Ainslie et al. showed this recovers most quality in just 5% of original training compute.

## Head Importance and the OV/QK Factorization

Elhage et al. (2021, "A Mathematical Framework for Transformer Circuits") decomposed attention heads into two matrices:

- **QK circuit:** $\mathbf{W}_Q^\top \mathbf{W}_K \in \mathbb{R}^{d_{\text{model}} \times d_{\text{model}}}$ determines *which* tokens attend to which (the attention pattern).
- **OV circuit:** $\mathbf{W}_V \mathbf{W}_O \in \mathbb{R}^{d_{\text{model}} \times d_{\text{model}}}$ determines *what* information gets moved (the value transformation).

Each attention head implements a rank-$d_k$ bilinear form for pattern matching (QK) and a rank-$d_v$ linear map for information movement (OV). The full multi-head attention is:

$$\text{MHA}(\mathbf{X}) = \sum_{i=1}^{h} \mathbf{A}_i \mathbf{X} \mathbf{W}_{V_i} \mathbf{W}_{O_i}$$

where $\mathbf{A}_i$ is the attention matrix for head $i$. This sum-of-low-rank-terms decomposition is fundamental to [mechanistic interpretability](/wiki/interpretability).

## Heterogeneous Head Architectures

Recent work explores using different head types within the same layer:

**Mixture of Attention Heads** (Zhang et al., 2022): Route tokens to different subsets of heads using a learned router, similar to mixture-of-experts in [FFN layers](/wiki/feed-forward-networks).

**Multi-Head Latent Attention (MLA)** (DeepSeek-V2, 2024): Compresses KV representations through a shared low-rank latent space before projecting to per-head KV:

$$\mathbf{c}_t = \mathbf{X}_t \mathbf{W}_{DKV} \in \mathbb{R}^{d_c}, \quad d_c \ll h \cdot d_k$$

$$\mathbf{K}_t = \mathbf{c}_t \mathbf{W}_{UK}, \quad \mathbf{V}_t = \mathbf{c}_t \mathbf{W}_{UV}$$

Only the compressed $\mathbf{c}_t$ is cached during inference, reducing KV cache to $d_c$ per token per layer. DeepSeek-V2 achieves KV cache compression exceeding even MQA while maintaining MHA-level quality.

## The Role of Heads Across Layers

Clark et al. (2019) and Tenney et al. (2019) mapped what different heads and layers learn:

- **Early layers (1-3):** Local syntactic patterns, positional attention, basic part-of-speech
- **Middle layers (4-8):** Syntactic relations (dependency parsing), coreference
- **Late layers (9-12):** Semantic relationships, task-specific patterns

This progression from local/syntactic to global/semantic parallels the classical NLP pipeline and mirrors observations in convolutional networks (edges to textures to objects).

### Key References

- Vaswani et al. (2017). "Attention Is All You Need." NeurIPS.
- Voita et al. (2019). "Analyzing Multi-Head Self-Attention: Specialized Heads Do the Heavy Lifting." ACL.
- Michel et al. (2019). "Are Sixteen Heads Really Better than One?" NeurIPS.
- Shazeer (2019). "Fast Transformer Decoding: One Write-Head is All You Need." arXiv:1911.02150.
- Elhage et al. (2021). "A Mathematical Framework for Transformer Circuits." Transformer Circuits Thread.
- Ainslie et al. (2023). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints." EMNLP.
- DeepSeek-AI (2024). "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model." arXiv:2405.04434.
