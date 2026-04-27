---
title: KV Cache
category: efficiency
---
<!-- tier:intro -->

# KV Cache

Language models generate text one token at a time. Each time the model produces a new token, it needs to "look back" at all the previous tokens through the [attention mechanism](/wiki/attention). Without any optimization, this means redoing a massive amount of computation at every single step. The **KV cache** is the trick that avoids this waste.

## The Redundancy Problem

Here's the issue: when a model has generated "The cat sat on the" and is predicting the next word, it computes attention over all 6 tokens. Then when it generates "mat" and moves on to predict the word after that, it computes attention over all 7 tokens — including recomputing everything for "The cat sat on the" all over again.

Those first 6 tokens haven't changed. The attention calculations for them are identical. We're throwing away work and redoing it.

## What the KV Cache Stores

In the attention mechanism, each token gets transformed into three vectors: a **Query**, a **Key**, and a **Value**. The new token's Query is compared against all Keys to determine attention weights, and those weights are used to combine all Values.

The KV cache simply **stores the Keys and Values** from all previous tokens. When generating a new token:

1. Compute the Query, Key, and Value for just the new token
2. Append the new Key and Value to the cache
3. Compare the new Query against all cached Keys
4. Use the weights to combine all cached Values

Instead of reprocessing the entire sequence, we only run the model on the single new token.

## The Speed Difference

Without KV cache, generating a sequence of length $n$ requires $O(n^2)$ total computation (each of the $n$ steps processes all previous tokens). With KV cache, it's $O(n)$ per step for the attention lookups, but each step only does a single forward pass for one token.

For a 1000-token generation, the KV cache can make inference **hundreds of times faster**.

## The Memory Trade-off

The catch: KV caches take a lot of memory. For a large model with many layers and a long context window, the cache can use tens of gigabytes. This is actually the main bottleneck in serving large language models — not computation, but memory for KV caches across many users.

## Related Topics

- [Attention](/wiki/attention) — the mechanism that KV cache optimizes
- [Grouped Query Attention](/wiki/grouped-query-attention) — reducing KV cache size
- [RoPE](/wiki/rope) — position encoding that works with KV caches

<!-- tier:undergrad -->

# KV Cache

The KV cache is the fundamental optimization for autoregressive transformer inference. It eliminates redundant computation by caching intermediate attention states across generation steps.

## Attention Recap

In a standard transformer attention layer, input $\mathbf{X} \in \mathbb{R}^{n \times d}$ is projected into queries, keys, and values:

$$\mathbf{Q} = \mathbf{X}\mathbf{W}_Q, \quad \mathbf{K} = \mathbf{X}\mathbf{W}_K, \quad \mathbf{V} = \mathbf{X}\mathbf{W}_V$$

Attention output: $\text{Attn}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{softmax}\!\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)\mathbf{V}$

## How KV Cache Works

During autoregressive generation at step $t$, the model only needs to process the new token $x_t$. The KV cache stores $\mathbf{K}_{1:t-1}$ and $\mathbf{V}_{1:t-1}$ from all previous steps.

**Step $t$:**
1. Compute for the new token only: $\mathbf{q}_t = \mathbf{x}_t \mathbf{W}_Q$, $\mathbf{k}_t = \mathbf{x}_t \mathbf{W}_K$, $\mathbf{v}_t = \mathbf{x}_t \mathbf{W}_V$
2. Append to cache: $\mathbf{K}_{1:t} = [\mathbf{K}_{1:t-1}; \mathbf{k}_t]$, $\mathbf{V}_{1:t} = [\mathbf{V}_{1:t-1}; \mathbf{v}_t]$
3. Compute attention: $\mathbf{o}_t = \text{softmax}\!\left(\frac{\mathbf{q}_t \mathbf{K}_{1:t}^\top}{\sqrt{d_k}}\right)\mathbf{V}_{1:t}$

The query is a single vector, so the attention computation is a vector-matrix product rather than a matrix-matrix product.

## Memory Analysis

For a model with $L$ layers, $H$ attention heads, head dimension $d_h$, and sequence length $n$:

$$\text{KV cache size} = 2 \times L \times H \times n \times d_h \times \text{bytes per element}$$

**Example** (Llama 2 70B): $L=80$, $H=8$ (GQA with 8 KV heads), $d_h=128$, $n=4096$, FP16:
$$2 \times 80 \times 8 \times 4096 \times 128 \times 2 = 13.4 \text{ GB}$$

This is per sequence — serving 100 concurrent users requires 1.3 TB of KV cache alone.

## Prefill vs. Decode Phases

Generation has two distinct phases:

**Prefill**: Process the full input prompt in parallel. Compute-bound (matrix-matrix multiplications). Populates the KV cache for all prompt tokens.

**Decode**: Generate tokens one at a time. Memory-bound (reading the KV cache dominates). Each step performs a vector-matrix product.

The prefill phase is fast per token but processes many tokens; the decode phase is slow per token but only processes one.

## Code Example

```python
import torch
import torch.nn.functional as F

class CachedAttention(torch.nn.Module):
    def __init__(self, d_model: int, n_heads: int):
        super().__init__()
        self.n_heads = n_heads
        self.d_head = d_model // n_heads
        self.W_q = torch.nn.Linear(d_model, d_model)
        self.W_k = torch.nn.Linear(d_model, d_model)
        self.W_v = torch.nn.Linear(d_model, d_model)
        self.W_o = torch.nn.Linear(d_model, d_model)
    
    def forward(self, x, kv_cache=None):
        B, T, D = x.shape
        q = self.W_q(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        k = self.W_k(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        v = self.W_v(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        
        if kv_cache is not None:
            k_prev, v_prev = kv_cache
            k = torch.cat([k_prev, k], dim=2)
            v = torch.cat([v_prev, v], dim=2)
        
        new_cache = (k, v)
        
        attn_weights = (q @ k.transpose(-2, -1)) / (self.d_head ** 0.5)
        attn_weights = F.softmax(attn_weights, dim=-1)
        out = attn_weights @ v
        
        out = out.transpose(1, 2).contiguous().view(B, T, D)
        return self.W_o(out), new_cache
```

## Related Topics

- [Grouped Query Attention](/wiki/grouped-query-attention) — reducing KV head count to shrink cache
- [RoPE](/wiki/rope) — position encoding compatible with KV caching
- [Beam Search](/wiki/beam-search) — requires separate KV caches per beam

<!-- tier:grad -->

# KV Cache

The KV cache is the central bottleneck in large-scale transformer serving. Recent research focuses on reducing its memory footprint while maintaining generation quality.

## PagedAttention and vLLM

Kwon et al. (2023, "Efficient Memory Management for Large Language Model Serving with PagedAttention") identified that naive KV cache allocation wastes 60–80% of GPU memory due to internal and external fragmentation. Their solution, **PagedAttention**, borrows from OS virtual memory:

- KV cache is divided into fixed-size **pages** (blocks of token slots)
- A page table maps logical positions to physical GPU memory locations
- Pages are allocated on demand and can be non-contiguous
- Completed sequences release pages immediately

vLLM, the system built on PagedAttention, achieves 2–4x higher throughput than HuggingFace Transformers and has become the de facto standard for LLM serving.

## KV Cache Compression

Several approaches reduce KV cache size without changing the model:

**Quantization**: Hooper et al. (2024, "KVQuant") showed that KV cache values can be quantized to 2–4 bits with minimal quality loss. Key insight: keys and values have different quantization sensitivity — keys are more sensitive because they participate in the softmax, where small errors get amplified.

**Eviction policies**: H2O (Zhang et al., 2023, "Heavy-Hitter Oracle") observes that a small fraction of tokens ("heavy hitters") account for most attention mass. By keeping only the heavy-hitter KVs plus a sliding window of recent tokens, the cache can be reduced by 5–10x with <1% quality degradation.

**StreamingLLM** (Xiao et al., 2024): Showed that attention sinks (the first few tokens receiving disproportionate attention regardless of content) are critical for model stability. StreamingLLM retains the initial "sink" tokens plus a rolling window, enabling infinite-length generation with bounded memory.

## Multi-Query and Grouped-Query Attention

The most impactful architectural change for KV cache efficiency is reducing the number of KV heads. See [Grouped Query Attention](/wiki/grouped-query-attention) for full treatment. In summary:

| Variant | KV heads per query head | KV cache size |
|---|---|---|
| Multi-Head Attention (MHA) | 1:1 | $2LHnd_h$ |
| Grouped-Query (GQA) | 1:$G$ | $2L(H/G)nd_h$ |
| Multi-Query (MQA) | 1:$H$ | $2Lnd_h$ |

Llama 2 70B uses GQA with $G=8$, reducing KV cache by 8x compared to standard MHA.

## Speculative Decoding

Leviathan et al. (2023) and Chen et al. (2023) proposed **speculative decoding** to overcome the memory-boundedness of autoregressive generation:

1. A small **draft model** quickly generates $k$ candidate tokens
2. The large **target model** verifies all $k$ tokens in a single parallel forward pass
3. Accept tokens where $p_{\text{target}}(x) \geq p_{\text{draft}}(x)$; reject and resample from a corrected distribution otherwise

This produces samples from the exact target distribution while achieving 2–3x speedup. The KV cache is shared — the draft model's KV states are discarded, and the target model's verified states are kept.

**Medusa** (Cai et al., 2024) extends this by adding multiple lightweight prediction heads to the target model itself, eliminating the need for a separate draft model.

## Cross-Request KV Cache Sharing

**Prompt caching** (also called "prefix caching"): When multiple requests share a common prefix (e.g., a system prompt), the KV cache for that prefix can be computed once and shared. SGLang (Zheng et al., 2024) implements a radix tree for efficient prefix matching, achieving significant throughput improvements for workloads with shared prefixes.

**Disaggregated serving**: Splitwise (Patel et al., 2024) separates the prefill and decode phases onto different hardware. Prefill runs on compute-optimized nodes; the resulting KV cache is transferred to memory-optimized nodes for decode. This improves both utilization and latency.

## Infinite Context via Cache Strategies

Extending context beyond training length requires careful KV cache management:

- **Ring attention** (Liu et al., 2023): Distributes the KV cache across multiple devices in a ring topology, with each device processing a chunk of the sequence and passing KVs to the next.
- **LongRoPE** (Ding et al., 2024): Extends RoPE to handle very long sequences by identifying and adjusting the rotation frequencies that cause performance degradation at long distances.

## Related Topics

- [Grouped Query Attention](/wiki/grouped-query-attention) — architectural solution to KV cache size
- [RoPE](/wiki/rope) — positional encoding in the KV cache
- [Beam Search](/wiki/beam-search) — KV cache management with multiple beams
- [Scaling Laws](/wiki/scaling-laws) — how inference costs scale with model size
