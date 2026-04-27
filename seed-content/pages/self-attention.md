---
title: Self-Attention
category: attention
---
<!-- tier:intro -->
# Self-Attention

In the [attention mechanism](/wiki/attention), we described how a model can focus on relevant parts of an input when producing an output. But there's a special case that's even more powerful: what if the input pays attention **to itself**?

That's self-attention. Every word in a sentence looks at every other word in the same sentence (including itself) and decides how much each one matters for understanding the current word in context.

## Why Self-Attention Matters

Consider the word "it" in these two sentences:
- "The animal didn't cross the street because **it** was too tired."
- "The animal didn't cross the street because **it** was too wide."

In the first sentence, "it" refers to "the animal." In the second, "it" refers to "the street." Self-attention is how a transformer figures this out: the representation of "it" attends to the other words and picks up context from whichever words are most relevant.

## How It Works

In self-attention, the queries, keys, and values all come from the same sequence. Each word generates:
- A **query**: "What am I looking for?"
- A **key**: "What do I contain?"
- A **value**: "What information do I carry?"

Every word's query gets compared to every word's key. The resulting attention weights determine how much each word's value contributes to the updated representation. After self-attention, each word's representation has been enriched with information from the entire sequence.

## Self-Attention vs. Cross-Attention

The difference is simple:
- **Self-attention:** Queries, keys, and values all come from the **same** sequence. A sentence attends to itself.
- **Cross-attention:** Queries come from one sequence, but keys and values come from a **different** sequence. For instance, in a translation model, the French decoder attends to the English encoder output.

Both use the same [scaled dot-product attention](/wiki/attention) math. The only difference is where Q, K, and V come from.

## The Power of Self-Attention

Self-attention gives transformers a superpower: **every word can directly communicate with every other word**, regardless of distance. In older models (like RNNs), information from word 1 had to pass through every intermediate word to reach word 50. In self-attention, word 1 and word 50 are directly connected -- just one step away.

This is why transformers are so good at capturing long-range dependencies: a pronoun at the end of a paragraph can directly attend to its referent at the beginning. There's no information bottleneck, no forgetting.

Self-attention is the core building block of the transformer. It appears in every layer, often as [multi-head attention](/wiki/multi-head-attention), and is what gives these models their remarkable ability to understand context.

<!-- tier:undergrad -->
# Self-Attention

## Formal Definition

In self-attention, the input sequence $\mathbf{X} \in \mathbb{R}^{n \times d_{\text{model}}}$ provides queries, keys, and values simultaneously:

$$\mathbf{Q} = \mathbf{X}\mathbf{W}^Q, \quad \mathbf{K} = \mathbf{X}\mathbf{W}^K, \quad \mathbf{V} = \mathbf{X}\mathbf{W}^V$$

$$\text{SelfAttention}(\mathbf{X}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)\mathbf{V}$$

Compare to cross-attention where queries come from one sequence $\mathbf{X}$ and keys/values from another $\mathbf{Y}$:

$$\mathbf{Q} = \mathbf{X}\mathbf{W}^Q, \quad \mathbf{K} = \mathbf{Y}\mathbf{W}^K, \quad \mathbf{V} = \mathbf{Y}\mathbf{W}^V$$

## Bidirectional vs. Causal Self-Attention

The attention pattern depends on the task:

**Bidirectional (encoder-style):** Each token attends to all tokens. Used in BERT, encoder blocks. Good for understanding tasks (classification, NER).

$$A_{ij} > 0 \quad \forall \, i, j \in \{1, \dots, n\}$$

**Causal (decoder-style):** Each token attends only to itself and previous tokens. Used in GPT, decoder blocks. Required for autoregressive generation.

$$A_{ij} = 0 \quad \text{if } j > i$$

Implemented by adding a causal mask before [softmax](/wiki/softmax):

$$\text{CausalSelfAttention}(\mathbf{X}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}} + \mathbf{M}\right)\mathbf{V}$$

where $M_{ij} = 0$ if $j \leq i$ and $M_{ij} = -\infty$ if $j > i$.

## Computational Properties

Self-attention has two key computational characteristics:

1. **$O(n^2)$ complexity:** Each token attends to all $n$ tokens, giving $n^2$ attention computations. This limits the practical sequence length.

2. **Permutation equivariance:** Without [positional encoding](/wiki/positional-encoding), self-attention is equivariant to input permutations. For permutation matrix $\mathbf{P}$:

$$\text{SelfAttention}(\mathbf{P}\mathbf{X}) = \mathbf{P} \cdot \text{SelfAttention}(\mathbf{X})$$

This means word order is invisible without explicit position information.

## The Residual Stream View

In a transformer, self-attention operates within a residual connection:

$$\mathbf{X}' = \mathbf{X} + \text{SelfAttention}(\text{LayerNorm}(\mathbf{X}))$$

This creates a **residual stream** interpretation (Elhage et al., 2021): each layer reads from and writes to a shared residual stream. Self-attention layers move information between positions (inter-token communication), while [FFN layers](/wiki/feed-forward-networks) transform information at each position independently (intra-token computation).

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class SelfAttention(nn.Module):
    def __init__(self, d_model: int, d_k: int, causal: bool = False):
        super().__init__()
        self.d_k = d_k
        self.causal = causal
        self.W_Q = nn.Linear(d_model, d_k, bias=False)
        self.W_K = nn.Linear(d_model, d_k, bias=False)
        self.W_V = nn.Linear(d_model, d_k, bias=False)

    def forward(self, X: torch.Tensor) -> torch.Tensor:
        """
        X: (batch, seq_len, d_model)
        Returns: (batch, seq_len, d_k)
        """
        Q = self.W_Q(X)  # (batch, seq, d_k)
        K = self.W_K(X)
        V = self.W_V(X)

        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)

        if self.causal:
            n = X.size(1)
            mask = torch.triu(torch.ones(n, n, device=X.device), diagonal=1).bool()
            scores.masked_fill_(mask, float('-inf'))

        attn = F.softmax(scores, dim=-1)
        return torch.matmul(attn, V)

class CrossAttention(nn.Module):
    """For comparison: cross-attention takes two inputs."""
    def __init__(self, d_model: int, d_k: int):
        super().__init__()
        self.d_k = d_k
        self.W_Q = nn.Linear(d_model, d_k, bias=False)
        self.W_K = nn.Linear(d_model, d_k, bias=False)
        self.W_V = nn.Linear(d_model, d_k, bias=False)

    def forward(self, X: torch.Tensor, Y: torch.Tensor) -> torch.Tensor:
        """
        X: (batch, n, d_model) — source of queries
        Y: (batch, m, d_model) — source of keys and values
        Returns: (batch, n, d_k)
        """
        Q = self.W_Q(X)
        K = self.W_K(Y)  # keys from Y, not X
        V = self.W_V(Y)  # values from Y, not X
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)
        attn = F.softmax(scores, dim=-1)
        return torch.matmul(attn, V)
```

## Self-Attention as a Graph Neural Network

Self-attention can be viewed as message passing on a fully connected graph. Each token is a node, and attention weights define edge weights. This perspective connects transformers to Graph Neural Networks (GNNs) and clarifies why transformers work well on inherently graph-structured data when paired with appropriate positional encodings.

<!-- tier:grad -->
# Self-Attention

## Self-Attention and Expressiveness

Yun et al. (2020) proved that transformers with self-attention are **universal approximators of sequence-to-sequence functions**: for any continuous function $f: \mathbb{R}^{n \times d} \to \mathbb{R}^{n \times d}$ and any $\epsilon > 0$, there exists a transformer that approximates $f$ within $\epsilon$. The proof relies on the ability of self-attention to implement contextual mappings and of [feed-forward layers](/wiki/feed-forward-networks) to implement pointwise mappings.

Crucially, this requires both self-attention and FFN layers -- neither alone is sufficient. Self-attention provides the inter-position communication needed to create arbitrary context-dependent representations.

## Rank Collapse and Signal Propagation

Dong et al. (2021) showed that without residual connections and [layer normalization](/wiki/layer-normalization), self-attention suffers from **rank collapse**: as the number of layers increases, the output converges to a rank-1 matrix (all tokens have the same representation). This occurs because self-attention computes convex combinations of value vectors, which contracts the representation space.

The doubly stochastic attention matrix $\mathbf{A}$ (after softmax) satisfies:

$$\|\mathbf{A}\mathbf{V}\|_F \leq \|\mathbf{V}\|_F$$

Repeated application contracts the representation toward the dominant eigenvector. Residual connections ($\mathbf{X} + \text{Attn}(\mathbf{X})$) mitigate this by preserving the input signal. The skip connection acts as an identity path that prevents exponential signal decay through depth.

## Induction Heads and In-Context Learning

Olsson et al. (2022) identified **induction heads** as a specific self-attention circuit responsible for in-context learning. An induction head consists of two attention heads across two layers:

1. **Layer $l$:** A "previous-token head" copies the token at position $i-1$ into position $i$'s residual stream.
2. **Layer $l+1$:** An "induction head" searches for the current token's previous occurrence, then attends to the token that *followed* it.

This implements the pattern: "if I've seen token A followed by token B before, and I now see token A, predict token B." This is a fundamental mechanism for:
- Few-shot learning (copying patterns from the prompt)
- Repetition detection
- Simple algorithmic reasoning

The formation of induction heads corresponds to a **phase change** during training, occurring suddenly around a specific loss threshold.

## Prefix-LM and Other Self-Attention Variants

Between fully bidirectional and fully causal self-attention, there are intermediate patterns:

**Prefix-LM** (used in T5, PaLM): Bidirectional attention over a prefix, causal attention over the rest. The mask is:

$$M_{ij} = \begin{cases} 0 & \text{if } j \leq p \text{ (prefix region)} \\ 0 & \text{if } j \leq i \text{ (causal region)} \\ -\infty & \text{otherwise} \end{cases}$$

where $p$ is the prefix length. This allows rich bidirectional encoding of the prompt while maintaining autoregressive generation.

**Sliding window attention** (Mistral, Longformer): Each token attends only to the $w$ nearest tokens:

$$M_{ij} = \begin{cases} 0 & \text{if } |i - j| \leq w/2 \\ -\infty & \text{otherwise} \end{cases}$$

With window size $w$ and $L$ layers, the effective receptive field is $L \times w$ -- information propagates through $L$ hops.

## Attention Sink

Xiao et al. (2023) discovered the **attention sink** phenomenon: in autoregressive transformers, the first token (often a BOS token) receives disproportionately high attention weight across all layers, regardless of its semantic relevance. This occurs because softmax requires attention weights to sum to 1, and when no token is particularly relevant, models learn to "dump" excess attention on the first token.

This has practical implications for streaming inference: discarding early KV cache entries (to save memory) causes catastrophic quality loss because the attention sink is removed. StreamingLLM (Xiao et al., 2023) solves this by always retaining the first few tokens' KV entries.

## Differential Attention

Ye et al. (2024) proposed **Differential Attention**, which computes attention as the difference of two softmax attention maps:

$$\text{DiffAttn}(\mathbf{X}) = (\text{softmax}(\mathbf{Q}_1\mathbf{K}_1^\top / \sqrt{d}) - \lambda \cdot \text{softmax}(\mathbf{Q}_2\mathbf{K}_2^\top / \sqrt{d})) \mathbf{V}$$

where $\lambda$ is a learned scalar. The subtraction cancels out attention noise (the baseline attention that even irrelevant tokens receive), amplifying the signal from genuinely relevant tokens. This reduces hallucination and improves robustness across a range of benchmarks.

### Key References

- Vaswani et al. (2017). "Attention Is All You Need." NeurIPS.
- Yun et al. (2020). "Are Transformers Universal Approximators of Sequence-to-Sequence Functions?" ICLR.
- Dong et al. (2021). "Attention is Not All You Need: Pure Attention Loses Rank Doubly Exponentially with Depth." ICML.
- Olsson et al. (2022). "In-context Learning and Induction Heads." Transformer Circuits Thread.
- Xiao et al. (2023). "Efficient Streaming Language Models with Attention Sinks." arXiv:2309.17453.
- Ye et al. (2024). "Differential Transformer." arXiv:2410.05258.
