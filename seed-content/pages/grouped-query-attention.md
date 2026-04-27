---
title: Grouped Query Attention
category: efficiency
---
<!-- tier:intro -->

# Grouped Query Attention

In a standard transformer, the [attention mechanism](/wiki/attention) has many "heads" — each head independently computes its own Queries, Keys, and Values and looks at the input from a different angle. **Grouped Query Attention (GQA)** is a simple but powerful optimization: instead of giving every head its own Keys and Values, multiple heads **share** them.

## Why Share Keys and Values?

The main bottleneck in serving large language models isn't computation — it's **memory**. During text generation, the model stores the Keys and Values for every token it has generated so far (the [KV cache](/wiki/kv-cache)). For a model with 32 attention heads and a long conversation, this cache can use tens of gigabytes of memory.

If we reduce the number of Key-Value heads from 32 to, say, 8, the cache shrinks by 4x. That means we can serve 4x more users simultaneously, or handle 4x longer conversations.

## The Spectrum of Sharing

There are three points on the spectrum:

1. **Multi-Head Attention (MHA)**: Every head gets its own Q, K, and V. This is the original transformer design. Maximum expressiveness, maximum memory.

2. **Grouped Query Attention (GQA)**: Heads are divided into groups. Each group shares one set of K and V, but every head still gets its own Q. For example, 32 query heads with 8 KV groups means 4 query heads share each KV pair.

3. **Multi-Query Attention (MQA)**: The extreme case — all heads share a single set of K and V. Only one set of Keys and Values total. Minimum memory, but some quality loss.

## Does Sharing Hurt Quality?

Surprisingly, not much. The original Multi-Query Attention paper (Shazeer, 2019) showed only a small quality degradation. GQA (Ainslie et al., 2023) found the sweet spot: with 8 KV groups for 32 query heads, the quality is nearly identical to full multi-head attention.

The intuition: the Queries are doing most of the "thinking" about what to attend to. The Keys and Values are more like a shared database that the Queries look up against. You don't need 32 separate copies of the database for 32 different lookup patterns.

## Who Uses GQA?

Nearly every modern large language model:
- **Llama 2 & 3** (70B uses GQA with 8 KV heads)
- **Mistral** and **Mixtral**
- **Gemma** (Google)
- **Falcon**

It's become the default choice for any model large enough that KV cache memory matters.

## Related Topics

- [KV Cache](/wiki/kv-cache) — the memory bottleneck GQA addresses
- [Attention](/wiki/attention) — the mechanism being modified
- [RoPE](/wiki/rope) — position encoding applied to the Q and K heads

<!-- tier:undergrad -->

# Grouped Query Attention

Grouped Query Attention (GQA; Ainslie et al., 2023) reduces the memory footprint of the [KV cache](/wiki/kv-cache) by sharing Key and Value projections across groups of query heads, providing a tunable trade-off between quality and efficiency.

## Standard Multi-Head Attention

In multi-head attention with $H$ heads and head dimension $d_h$:

$$\mathbf{Q}_i = \mathbf{X}\mathbf{W}_{Q_i}, \quad \mathbf{K}_i = \mathbf{X}\mathbf{W}_{K_i}, \quad \mathbf{V}_i = \mathbf{X}\mathbf{W}_{V_i} \quad \text{for } i = 1, \ldots, H$$

Each head has its own $\mathbf{W}_{K_i} \in \mathbb{R}^{d \times d_h}$ and $\mathbf{W}_{V_i} \in \mathbb{R}^{d \times d_h}$, giving a total KV parameter count of $2Hd \cdot d_h$ and a KV cache size per token per layer of $2Hd_h$.

## GQA Formulation

GQA divides $H$ query heads into $G$ groups of $H/G$ heads. Each group $g$ shares a single Key and Value head:

$$\mathbf{Q}_i = \mathbf{X}\mathbf{W}_{Q_i} \quad \text{for } i = 1, \ldots, H$$
$$\mathbf{K}_g = \mathbf{X}\mathbf{W}_{K_g}, \quad \mathbf{V}_g = \mathbf{X}\mathbf{W}_{V_g} \quad \text{for } g = 1, \ldots, G$$

The attention for query head $i$ in group $g = \lceil iG/H \rceil$:

$$\text{Attn}_i = \text{softmax}\!\left(\frac{\mathbf{Q}_i \mathbf{K}_g^\top}{\sqrt{d_h}}\right)\mathbf{V}_g$$

## The Three Regimes

| Variant | KV heads ($G$) | KV cache per token per layer | Regime |
|---|---|---|---|
| MHA | $G = H$ | $2Hd_h$ | Full (original) |
| GQA | $1 < G < H$ | $2Gd_h$ | Intermediate |
| MQA | $G = 1$ | $2d_h$ | Minimal |

## Memory Savings

For a model with $L$ layers, $H$ query heads, $G$ KV groups, head dimension $d_h$, sequence length $n$, in FP16:

$$\text{KV cache (MHA)} = 2LHnd_h \times 2 \text{ bytes}$$
$$\text{KV cache (GQA)} = 2LGnd_h \times 2 \text{ bytes}$$

**Reduction factor**: $H/G$

For Llama 2 70B ($L=80$, $H=64$, $G=8$, $d_h=128$, $n=4096$):
- MHA: 160 GB
- GQA (8 groups): 20 GB

## Converting MHA to GQA (Uptrained GQA)

Ainslie et al. showed that existing MHA models can be converted to GQA by:

1. **Mean pooling**: Average the KV weight matrices within each group:
$$\mathbf{W}_{K_g}^{\text{GQA}} = \frac{1}{H/G} \sum_{i \in \text{group}_g} \mathbf{W}_{K_i}^{\text{MHA}}$$

2. **Fine-tuning**: Continue training for a small fraction (~5%) of the original training compute.

This yields a model with nearly the same quality as training GQA from scratch, at a fraction of the cost.

## Code Example

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class GroupedQueryAttention(nn.Module):
    def __init__(self, d_model: int, n_q_heads: int, n_kv_heads: int):
        super().__init__()
        assert n_q_heads % n_kv_heads == 0
        self.n_q_heads = n_q_heads
        self.n_kv_heads = n_kv_heads
        self.n_groups = n_q_heads // n_kv_heads  # queries per KV head
        self.d_head = d_model // n_q_heads
        
        self.W_q = nn.Linear(d_model, n_q_heads * self.d_head, bias=False)
        self.W_k = nn.Linear(d_model, n_kv_heads * self.d_head, bias=False)
        self.W_v = nn.Linear(d_model, n_kv_heads * self.d_head, bias=False)
        self.W_o = nn.Linear(n_q_heads * self.d_head, d_model, bias=False)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, D = x.shape
        
        # Project
        q = self.W_q(x).view(B, T, self.n_q_heads, self.d_head)
        k = self.W_k(x).view(B, T, self.n_kv_heads, self.d_head)
        v = self.W_v(x).view(B, T, self.n_kv_heads, self.d_head)
        
        # Transpose for attention: (B, heads, T, d_head)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        
        # Expand KV heads to match Q heads via repeat
        # (B, n_kv_heads, T, d) -> (B, n_q_heads, T, d)
        k = k.repeat_interleave(self.n_groups, dim=1)
        v = v.repeat_interleave(self.n_groups, dim=1)
        
        # Standard scaled dot-product attention
        attn = (q @ k.transpose(-2, -1)) / (self.d_head ** 0.5)
        attn = F.softmax(attn, dim=-1)
        out = attn @ v
        
        out = out.transpose(1, 2).contiguous().view(B, T, -1)
        return self.W_o(out)

# Example: Llama 2 70B style (64 Q heads, 8 KV heads)
gqa = GroupedQueryAttention(d_model=8192, n_q_heads=64, n_kv_heads=8)
x = torch.randn(1, 128, 8192)
out = gqa(x)  # (1, 128, 8192)
```

## Related Topics

- [KV Cache](/wiki/kv-cache) — the bottleneck GQA addresses
- [RoPE](/wiki/rope) — applied to Q and K after projection
- [SwiGLU](/wiki/swiglu) — another architecture optimization in modern transformers

<!-- tier:grad -->

# Grouped Query Attention

GQA (Ainslie et al., 2023) has become the de facto standard for large-scale transformers. This section examines the theoretical justification, practical considerations, and emerging alternatives.

## Why Sharing KV Heads Works

The effectiveness of GQA can be understood through the lens of **low-rank structure** in attention patterns. Empirical analysis reveals:

1. **KV head similarity**: In trained MHA models, KV heads within natural groups exhibit high cosine similarity (>0.8), suggesting the model is already learning redundant KV representations. GQA formalizes this redundancy.

2. **Query diversity matters more**: The query heads exhibit much more diversity than KV heads. This makes sense — queries encode "what am I looking for?" which varies across heads, while keys and values encode "what information is available here?" which is more shared.

3. **Low-rank approximation**: GQA can be viewed as imposing a block-diagonal low-rank constraint on the KV projection. If the full KV matrix has effective rank $r < H$, then using $G \geq r$ groups loses no representational capacity.

## Multi-Query Attention: Origins and Trade-offs

MQA (Shazeer, 2019) was originally proposed for encoder-decoder models in translation. The paper reported:
- Only 0.1–0.3 BLEU degradation on translation benchmarks
- 7–10x speedup on incremental (autoregressive) decoding

For decoder-only LLMs, MQA shows more quality degradation than GQA, particularly on tasks requiring fine-grained retrieval from context. The failure mode: with only one KV head, the model cannot maintain multiple independent "views" of the context, leading to information bottlenecks in complex reasoning tasks.

## Optimal Number of KV Groups

How many KV groups should you use? The choice depends on the memory bandwidth of your hardware:

The decode step is memory-bandwidth-bound — the bottleneck is reading the KV cache from GPU memory. The compute-to-memory ratio determines the optimal $G$:

$$G_{\text{opt}} \approx \frac{\text{model FLOPs per token}}{\text{memory bandwidth} \times \text{bytes per KV element} \times n}$$

In practice:
- H100 GPUs: $G = 8$ is often optimal for 70B-scale models
- A100 GPUs: $G = 4$–$8$ depending on model size
- For smaller models (7B), GQA is often unnecessary as the KV cache is already small

## Cross-Layer KV Sharing

An extension of the GQA principle: share KV heads not just within a layer but **across layers**:

- **YOCO** (Sun et al., 2024, "You Only Cache Once"): Uses a shared global KV cache for the first half of layers and full self-attention for the second half. Reduces total KV cache by ~50% with minimal quality loss.
- **Layer-wise KV sharing** (Brandon et al., 2024): Adjacent layers use the same KV projections, reducing both parameters and cache size.

This is supported by the observation that KV representations across adjacent layers are highly correlated — each layer makes only incremental updates.

## Differential Attention

Wu et al. (2024, "Differential Transformer") proposed a related but distinct approach: instead of reducing KV heads, split each head into two sub-heads and compute attention as the **difference**:

$$\text{DiffAttn} = \text{softmax}(\mathbf{Q}_1 \mathbf{K}_1^\top) - \lambda \cdot \text{softmax}(\mathbf{Q}_2 \mathbf{K}_2^\top)$$

This cancels out noise in attention patterns (common across sub-heads) while preserving signal (different across sub-heads). DiffAttn achieves better quality than GQA at the same KV cache size, though at higher computational cost.

## Hardware-Aware Attention Design

Modern attention variants are co-designed with hardware:

- **FlashAttention** (Dao et al., 2022; Dao, 2024): Fuses the attention computation into a single kernel that avoids materializing the $O(n^2)$ attention matrix, crucial for making GQA's expanded heads efficient.
- **Ring attention**: For distributed inference, GQA's reduced KV cache means less data to transfer between devices in ring-based parallelism.
- **Tensor parallelism**: GQA naturally maps to tensor parallelism by assigning KV groups to different devices — each device stores a subset of the KV cache.

## MLA: Multi-Head Latent Attention

DeepSeek-V2 (DeepSeek AI, 2024) introduced **Multi-Head Latent Attention (MLA)**, which compresses the KV cache through learned low-rank projections:

$$\mathbf{c}_t = \mathbf{x}_t \mathbf{W}_{\text{compress}} \in \mathbb{R}^{d_c}$$

where $d_c \ll Hd_h$. Keys and values are decoded from this compressed representation on-the-fly:

$$\mathbf{K} = \mathbf{C}\mathbf{W}_{\text{up-K}}, \quad \mathbf{V} = \mathbf{C}\mathbf{W}_{\text{up-V}}$$

MLA achieves the KV cache size of MQA with the quality of MHA, but trades memory for additional computation during decode. This is advantageous when the decode step is memory-bound (which it usually is).

## Related Topics

- [KV Cache](/wiki/kv-cache) — the memory bottleneck driving GQA adoption
- [RoPE](/wiki/rope) — position encoding applied to Q and K heads
- [SwiGLU](/wiki/swiglu) — complementary FFN optimization
- [Scaling Laws](/wiki/scaling-laws) — how efficiency improvements affect compute-optimal training
