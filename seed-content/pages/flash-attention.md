---
title: Flash Attention
category: efficiency
---
<!-- tier:intro -->
# Flash Attention

Standard [attention](/wiki/attention) has a big problem: it creates a huge matrix in memory. For a sequence of $n$ tokens, the attention matrix is $n \times n$. With 128,000 tokens, that's 16 billion entries — too much to fit in GPU memory.

**Flash Attention** is a clever algorithm that computes the exact same result as standard attention, but without ever creating that giant matrix. It works by processing the attention in small tiles that fit in the GPU's fast cache memory (SRAM), rather than the slower main memory (HBM).

## The Key Insight

GPUs have two types of memory:
- **HBM** (High Bandwidth Memory): large (40-80 GB) but relatively slow
- **SRAM** (on-chip cache): tiny (~20 MB) but extremely fast

Standard attention writes the full $n \times n$ matrix to HBM, then reads it back. Flash Attention never writes it at all — it computes attention scores in small blocks within SRAM, accumulates the results, and only writes the final output.

## Why It Matters

Flash Attention provides 2-4x speedup and dramatically reduces memory usage. It enabled models to scale to much longer [context windows](/wiki/context-window) and is now standard in essentially all transformer training and inference.

## Related Topics

- [Attention](/wiki/attention) — the operation being optimized
- [Context Window](/wiki/context-window) — Flash Attention enables longer contexts
- [KV Cache](/wiki/kv-cache) — related memory optimization for inference

<!-- tier:undergrad -->
# Flash Attention

## The Memory Bottleneck

Standard attention computes $\text{softmax}(QK^T/\sqrt{d_k})V$ by materializing the full $N \times N$ attention matrix $S = QK^T/\sqrt{d_k}$. This requires $O(N^2)$ memory and $O(N^2)$ reads/writes to HBM.

The key observation (Dao et al., 2022): the bottleneck is **memory bandwidth**, not compute. Modern GPUs have far more compute than memory bandwidth.

## The Tiling Algorithm

Flash Attention processes Q, K, V in blocks:

1. Load a block of Q (size $B_r \times d$) into SRAM
2. For each block of K, V (size $B_c \times d$):
   a. Compute local attention scores $S_{ij} = Q_i K_j^T / \sqrt{d_k}$
   b. Use the online softmax trick to incrementally compute row-wise softmax
   c. Accumulate the weighted values
3. Write the final output block to HBM

The online softmax (Milakov & Gimelshein, 2018) enables computing softmax without seeing all values first:

$$m_{\text{new}} = \max(m_{\text{old}}, m_{\text{block}})$$
$$\ell_{\text{new}} = e^{m_{\text{old}} - m_{\text{new}}} \ell_{\text{old}} + e^{m_{\text{block}} - m_{\text{new}}} \ell_{\text{block}}$$

## Complexity

| | Standard Attention | Flash Attention |
|---|---|---|
| HBM reads/writes | $O(N^2)$ | $O(N^2 d / M)$ |
| SRAM usage | $O(N^2)$ | $O(B_r B_c)$ |
| FLOPs | $O(N^2 d)$ | $O(N^2 d)$ (same) |

where $M$ is SRAM size. The FLOPs are identical — Flash Attention is an **IO-aware** optimization, not an approximation.

## Related Topics

- [Context Window](/wiki/context-window) — enabled by reduced memory usage
- [Grouped Query Attention](/wiki/grouped-query-attention) — complementary memory optimization

<!-- tier:grad -->
# Flash Attention

## Flash Attention 2 and Beyond

**Flash Attention 2** (Dao, 2023) improved on the original with better work partitioning across GPU thread blocks and warps, achieving ~2x speedup over Flash Attention 1. Key optimizations:
- Reduced non-matmul FLOPs (the softmax computation)
- Better parallelism across the sequence length dimension
- Support for different head dimensions and causal masking patterns

**Flash Attention 3** (Dao et al., 2024) targets Hopper GPUs (H100), exploiting hardware features like asynchronous copy and the Tensor Memory Accelerator (TMA) for further speedups.

## IO Complexity Analysis

The IO complexity of Flash Attention is $\Theta(N^2 d^2 / M)$ where $M$ is SRAM size. For typical values ($d = 128$, $M = 100\text{KB}$), this provides significant savings. Dao et al. proved this is optimal: no algorithm can compute exact attention with fewer HBM accesses.

## Ring Attention

For sequences exceeding single-GPU memory, Ring Attention (Liu et al., 2023) distributes the Flash Attention computation across multiple devices in a ring topology. Each device holds a chunk of K/V and the Q, K blocks are passed around the ring. This enables million-token context windows using standard hardware.

## Related Topics

- [Scaling Laws](/wiki/scaling-laws) — compute-memory trade-offs
- [KV Cache](/wiki/kv-cache) — PagedAttention uses similar tiling ideas
