---
title: Attention Mechanism
category: attention
---
<!-- tier:intro -->
# The Attention Mechanism

Imagine you're reading a long passage and someone asks you a question about it. You don't re-read the whole thing equally -- you **focus on the relevant parts**. If the question is about a character named Alice, your eyes jump to sentences that mention Alice. That selective focus is exactly what the attention mechanism does for neural networks.

## The Core Idea

Attention lets a model decide, for each piece of output it produces, how much to focus on each piece of input. Instead of cramming an entire input into a single fixed-size summary (which older sequence models had to do), attention creates a direct connection between every output position and every input position, weighted by relevance.

## Queries, Keys, and Values

The attention mechanism uses three concepts borrowed from information retrieval:

- **Query (Q):** What you're looking for. Think of it as your search question.
- **Key (K):** A label for each piece of available information. Think of it as a tag on a file folder.
- **Value (V):** The actual information stored. Think of it as the contents inside the folder.

Here's how it works: You take your query and compare it against every key. The better a key matches your query, the more attention you pay to its corresponding value. The output is a weighted combination of all the values, where the weights come from the query-key comparisons.

## A Concrete Example

Say a translation model is translating "The cat sat on the mat" into French. When generating the French word for "cat" ("chat"), the model's query represents "what French word am I generating?" The keys represent each English word. The attention mechanism computes high similarity between the query for "chat" and the key for "cat," so the value (the representation of "cat") gets a high weight. Other words like "the" and "mat" get lower weights.

## Interactive: Attention Weights

::viz[attention-heatmap]

## Scaled Dot-Product Attention

The specific attention used in transformers compares queries and keys using a **dot product** (a measure of how similar two vectors point). The result is then scaled down (divided by a number) to keep values from getting too extreme, and passed through [softmax](/wiki/softmax) to create proper weights that sum to 1. These weights are multiplied with the values to produce the output.

The "scaled" part is important: without it, when the vectors are high-dimensional, the dot products can become very large, pushing [softmax](/wiki/softmax) into regions where it produces extremely peaked distributions (almost all weight on one item). Scaling keeps the gradients healthy during training.

## Why Attention Was Revolutionary

Before attention (introduced by Bahdanau et al. in 2014 for machine translation), sequence models had to compress an entire input sentence into a single vector before producing any output. This was a brutal bottleneck -- important information would get lost, especially for long sentences. Attention gave models a way to look back at the full input at every step, and performance jumped dramatically.

The Transformer architecture (2017) took this further: it removed the sequential processing entirely and used **only** attention ([self-attention](/wiki/self-attention) and cross-attention) along with [feed-forward networks](/wiki/feed-forward-networks). This is what powers GPT, BERT, and essentially all modern language models.

<!-- tier:undergrad -->
# The Attention Mechanism

## Scaled Dot-Product Attention

Given queries $\mathbf{Q} \in \mathbb{R}^{n \times d_k}$, keys $\mathbf{K} \in \mathbb{R}^{m \times d_k}$, and values $\mathbf{V} \in \mathbb{R}^{m \times d_v}$:

$$\text{Attention}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)\mathbf{V}$$

Step by step:

1. **Compute attention scores:** $\mathbf{S} = \mathbf{Q}\mathbf{K}^\top \in \mathbb{R}^{n \times m}$. Entry $S_{ij}$ measures how much query $i$ matches key $j$.
2. **Scale:** Divide by $\sqrt{d_k}$ to control the variance of the dot products.
3. **Normalize:** Apply [softmax](/wiki/softmax) row-wise to get attention weights $\mathbf{A} = \text{softmax}(\mathbf{S} / \sqrt{d_k})$, where each row sums to 1.
4. **Aggregate:** Multiply weights by values: $\mathbf{O} = \mathbf{A}\mathbf{V}$.

### Why Scale by $\sqrt{d_k}$?

Assume $q_i$ and $k_j$ have components drawn i.i.d. from $\mathcal{N}(0, 1)$. Then:

$$\mathbb{E}[\mathbf{q}_i^\top \mathbf{k}_j] = 0, \quad \text{Var}[\mathbf{q}_i^\top \mathbf{k}_j] = d_k$$

So the dot product has standard deviation $\sqrt{d_k}$. Dividing by $\sqrt{d_k}$ normalizes it to unit variance, keeping softmax in a region with useful gradients.

## Linear Projections

In practice, Q, K, V are obtained by projecting the input through learned weight matrices:

$$\mathbf{Q} = \mathbf{X}\mathbf{W}^Q, \quad \mathbf{K} = \mathbf{X}\mathbf{W}^K, \quad \mathbf{V} = \mathbf{X}\mathbf{W}^V$$

where $\mathbf{W}^Q, \mathbf{W}^K \in \mathbb{R}^{d_{\text{model}} \times d_k}$ and $\mathbf{W}^V \in \mathbb{R}^{d_{\text{model}} \times d_v}$.

For cross-attention (e.g., in encoder-decoder models), queries come from the decoder and keys/values come from the encoder.

## Attention Masking

For autoregressive (left-to-right) generation, we apply a causal mask to prevent attending to future tokens:

$$\text{mask}_{ij} = \begin{cases} 0 & \text{if } j \leq i \\ -\infty & \text{if } j > i \end{cases}$$

$$\text{Attention}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}} + \text{mask}\right)\mathbf{V}$$

The $-\infty$ values become 0 after softmax, effectively zeroing out attention to future positions.

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

def scaled_dot_product_attention(
    Q: torch.Tensor,  # (batch, n_queries, d_k)
    K: torch.Tensor,  # (batch, n_keys, d_k)
    V: torch.Tensor,  # (batch, n_keys, d_v)
    mask: torch.Tensor = None,  # (batch, n_queries, n_keys)
) -> torch.Tensor:
    d_k = Q.size(-1)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)

    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    attn_weights = F.softmax(scores, dim=-1)
    output = torch.matmul(attn_weights, V)
    return output

# Causal mask for autoregressive attention
def causal_mask(seq_len: int, device='cpu'):
    return torch.tril(torch.ones(seq_len, seq_len, device=device)).bool()

# Example usage
batch, seq_len, d_model, d_k = 2, 10, 512, 64
X = torch.randn(batch, seq_len, d_model)
W_Q = nn.Linear(d_model, d_k, bias=False)
W_K = nn.Linear(d_model, d_k, bias=False)
W_V = nn.Linear(d_model, d_k, bias=False)

Q, K, V = W_Q(X), W_K(X), W_V(X)
mask = causal_mask(seq_len)
output = scaled_dot_product_attention(Q, K, V, mask)  # (2, 10, 64)
```

Note: PyTorch 2.0+ provides `torch.nn.functional.scaled_dot_product_attention` with optimized backends (FlashAttention, memory-efficient attention) that should be preferred in production.

<!-- tier:grad -->
# The Attention Mechanism

## Attention as Kernel Smoothing

Attention can be understood as a nonparametric kernel regression. Given query $\mathbf{q}$, the output is:

$$\text{Attn}(\mathbf{q}) = \sum_j \frac{\kappa(\mathbf{q}, \mathbf{k}_j)}{\sum_{j'} \kappa(\mathbf{q}, \mathbf{k}_{j'})} \mathbf{v}_j$$

where the kernel function is $\kappa(\mathbf{q}, \mathbf{k}) = \exp(\mathbf{q}^\top \mathbf{k} / \sqrt{d_k})$, the exponential (softmax) kernel. This connects attention to the extensive literature on kernel methods and Nadaraya-Watson estimators.

Tsai et al. (2019) formalized this connection and showed that different kernel choices lead to different attention variants. The softmax kernel is particularly effective because it is a universal approximator of attention patterns.

## The Quadratic Bottleneck

Standard attention has $O(n^2 d)$ time and $O(n^2)$ memory complexity due to materializing the $n \times n$ attention matrix. This is the fundamental scaling bottleneck for long-context transformers. Approaches to address this fall into several categories:

### Sparse Attention
Restrict the attention pattern to a sparse subset of token pairs:
- **Sliding window** (Beltagy et al., 2020, Longformer): attend to local windows plus global tokens
- **Strided patterns** (Child et al., 2019, Sparse Transformer): attend to fixed stride patterns
- **Learned sparsity** (Kitaev et al., 2020, Reformer): use LSH to find high-attention pairs

### Linear Attention
Replace the softmax kernel with a decomposable kernel $\kappa(\mathbf{q}, \mathbf{k}) = \phi(\mathbf{q})^\top \phi(\mathbf{k})$, enabling computation in $O(nd^2)$:

$$\text{Attn}(\mathbf{Q}) = \frac{\phi(\mathbf{Q})(\phi(\mathbf{K})^\top \mathbf{V})}{\phi(\mathbf{Q})(\phi(\mathbf{K})^\top \mathbf{1})}$$

The key insight (Katharopoulos et al., 2020): by changing the order of matrix multiplication, we avoid materializing the $n \times n$ matrix. The feature map $\phi$ can be:
- $\phi(x) = \text{elu}(x) + 1$ (Katharopoulos et al., 2020)
- Random Fourier features approximating the softmax kernel (Performer, Choromanski et al., 2021)

### FlashAttention
Dao et al. (2022) showed that the quadratic bottleneck is largely a **memory** problem, not a compute problem. By restructuring the computation to use tiling and recomputation (avoiding materialization of the full $n \times n$ matrix in HBM), FlashAttention achieves exact softmax attention in $O(n^2 d)$ time but $O(n)$ memory, with 2-4x wall-clock speedups from improved GPU memory access patterns.

FlashAttention-2 (Dao, 2023) further optimizes by reducing non-matmul FLOPs and improving parallelism across the sequence length dimension. FlashAttention-3 (Shah et al., 2024) exploits asynchronous execution on Hopper GPUs.

## Multi-Query and Grouped-Query Attention

Shazeer (2019) proposed **Multi-Query Attention (MQA)**: use a single key-value head shared across all query heads. This reduces KV cache size by a factor of $h$ (number of heads) during inference, dramatically improving autoregressive decoding throughput.

**Grouped-Query Attention (GQA)** (Ainslie et al., 2023) is the interpolation: $g$ groups of query heads share KV heads. LLaMA 2 70B uses GQA with 8 KV heads for 64 query heads. The authors showed that GQA approaches MHA quality while matching MQA speed.

## Attention as a Hopfield Network

Ramsauer et al. (2021) showed that the attention mechanism is equivalent to the update rule of a modern continuous Hopfield network. The stored patterns are the values, keys define the energy landscape, and the softmax attention computes the energy minimum (memory retrieval). This provides:
- Exponential storage capacity (in dimension $d$) vs. linear for classical Hopfield networks
- A convergence guarantee: iterated attention converges to a fixed point
- Connections to associative memory and energy-based models

## Attention Entropy and Head Specialization

Clark et al. (2019) and Voita et al. (2019) analyzed attention patterns in trained transformers, finding that different heads specialize:
- **Positional heads:** attend to specific relative positions (previous token, beginning of sentence)
- **Syntactic heads:** attend along dependency parse edges
- **Rare word heads:** attend to infrequent tokens

Voita et al. showed that many heads can be pruned without quality loss, suggesting significant redundancy. See [multi-head attention](/wiki/multi-head-attention) for more detail.

### Key References

- Bahdanau et al. (2015). "Neural Machine Translation by Jointly Learning to Align and Translate." ICLR.
- Vaswani et al. (2017). "Attention Is All You Need." NeurIPS.
- Katharopoulos et al. (2020). "Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention." ICML.
- Dao et al. (2022). "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness." NeurIPS.
- Dao (2023). "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning."
- Ainslie et al. (2023). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints." EMNLP.
- Ramsauer et al. (2021). "Hopfield Networks Is All You Need." ICLR.
