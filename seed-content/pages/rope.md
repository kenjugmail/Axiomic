---
title: Rotary Position Embeddings (RoPE)
category: efficiency
---
<!-- tier:intro -->

# Rotary Position Embeddings (RoPE)

A transformer model processes all tokens in parallel, which means it has no built-in sense of word order. "The cat ate the fish" and "The fish ate the cat" would look identical without some way to encode position. **RoPE** (Rotary Position Embeddings) is the most popular modern method for giving transformers a sense of position.

## Why Position Matters

Without position information, a transformer treats its input as a bag of words — it knows which words are present but not their order. Early transformers used simple strategies like adding a fixed pattern of numbers (sinusoidal encoding) or learning a position embedding for each slot (positions 1, 2, 3, etc.).

These approaches work but have limitations. Fixed position embeddings can't handle sequences longer than they were trained on, and they don't naturally capture the idea that what matters is the **distance between tokens**, not their absolute positions.

## The RoPE Idea

RoPE takes a beautifully simple approach: instead of adding position information to the token representations, it **rotates** them. Each token's representation is rotated in a high-dimensional space by an angle that depends on its position.

Think of it like a clock: token 1 gets rotated a little, token 2 gets rotated a bit more, token 3 even more, and so on. When two tokens interact through attention, the rotation between them depends only on their **relative distance** — token 5 and token 8 always have the same relative rotation, whether they appear at positions (5,8) or (100,103).

## Why Rotation?

Rotation has a special mathematical property: when you compute the dot product between two rotated vectors (which is what attention does), the result naturally depends on the angle **difference** between them. This means:

- The model learns about **relative positions** automatically
- Nearby tokens interact differently from far-apart tokens
- The encoding is smooth and continuous

## Where RoPE Is Used

RoPE has become the default position encoding for modern language models:
- **Llama** (Meta) — all versions
- **Mistral** and **Mixtral**
- **PaLM** (Google)
- **Gemma** (Google)

It largely replaced the absolute position embeddings used in GPT-2/GPT-3 and the sinusoidal encodings from the original transformer.

## Related Topics

- [Attention](/wiki/attention) — the mechanism RoPE modifies
- [KV Cache](/wiki/kv-cache) — how position encoding interacts with caching
- [Positional Encoding](/wiki/positional-encoding) — overview of position encoding methods

<!-- tier:undergrad -->

# Rotary Position Embeddings (RoPE)

RoPE (Su et al., 2021) encodes position information by rotating query and key vectors in attention, producing a relative position encoding through the geometry of dot products.

## Mathematical Formulation

Consider a query vector $\mathbf{q}$ at position $m$ and a key vector $\mathbf{k}$ at position $n$. RoPE applies position-dependent rotations:

$$\tilde{\mathbf{q}}_m = R_m \mathbf{q}, \quad \tilde{\mathbf{k}}_n = R_n \mathbf{k}$$

where $R_m$ is a block-diagonal rotation matrix. For a $d$-dimensional vector, $R_m$ consists of $d/2$ independent 2D rotations:

$$R_m = \begin{pmatrix}
\cos m\theta_1 & -\sin m\theta_1 & & \\
\sin m\theta_1 & \cos m\theta_1 & & \\
& & \ddots & \\
& & & \cos m\theta_{d/2} & -\sin m\theta_{d/2} \\
& & & \sin m\theta_{d/2} & \cos m\theta_{d/2}
\end{pmatrix}$$

The frequencies follow the original transformer's scheme:

$$\theta_i = \text{base}^{-2i/d}, \quad i = 0, 1, \ldots, d/2 - 1$$

where $\text{base} = 10000$ by default.

## Why It Encodes Relative Position

The key property: when computing the attention score between positions $m$ and $n$:

$$\tilde{\mathbf{q}}_m^\top \tilde{\mathbf{k}}_n = \mathbf{q}^\top R_m^\top R_n \mathbf{k} = \mathbf{q}^\top R_{n-m} \mathbf{k}$$

Since $R_m^\top R_n = R_{n-m}$ (rotation matrices compose by addition of angles), the dot product depends only on the **relative distance** $n - m$, not on absolute positions.

## Efficient Implementation

RoPE is typically implemented using complex number arithmetic rather than explicit matrix multiplication. Treating consecutive pairs of dimensions as real and imaginary parts:

$$(\tilde{q}_{2i}, \tilde{q}_{2i+1}) = (q_{2i} + q_{2i+1} i) \cdot e^{im\theta_i}$$

In code, this is simply element-wise complex multiplication:

```python
import torch

def precompute_freqs_cis(dim: int, max_seq_len: int, base: float = 10000.0):
    """Precompute the complex exponentials for RoPE."""
    freqs = 1.0 / (base ** (torch.arange(0, dim, 2).float() / dim))
    t = torch.arange(max_seq_len)
    freqs = torch.outer(t, freqs)  # (seq_len, dim/2)
    return torch.polar(torch.ones_like(freqs), freqs)  # complex exponentials

def apply_rope(x: torch.Tensor, freqs_cis: torch.Tensor) -> torch.Tensor:
    """Apply RoPE to input tensor x of shape (batch, seq_len, n_heads, dim)."""
    # Reshape x to pairs of dimensions and view as complex
    x_complex = torch.view_as_complex(x.float().reshape(*x.shape[:-1], -1, 2))
    # Broadcast freqs_cis to match x shape
    freqs_cis = freqs_cis[:x.shape[1]].unsqueeze(0).unsqueeze(2)
    # Apply rotation via complex multiplication
    x_rotated = x_complex * freqs_cis
    # Convert back to real pairs
    return torch.view_as_real(x_rotated).flatten(-2).type_as(x)

# Example
batch, seq_len, n_heads, dim = 2, 128, 32, 128
x = torch.randn(batch, seq_len, n_heads, dim)
freqs = precompute_freqs_cis(dim, seq_len)
x_with_pos = apply_rope(x, freqs)
```

## Advantages Over Alternatives

| Method | Relative position | Extrapolation | No extra parameters | KV cache compatible |
|---|---|---|---|---|
| Sinusoidal (Vaswani 2017) | No | Limited | Yes | Yes |
| Learned absolute | No | No | No | Yes |
| ALiBi (Press et al. 2022) | Yes | Yes | Yes | Yes |
| RoPE | Yes | Moderate | Yes | Yes |

RoPE's main limitation is extrapolation: performance degrades at sequence lengths significantly beyond training. This is addressed by modifications like NTK-aware scaling and YaRN.

## Related Topics

- [Attention](/wiki/attention) — the mechanism RoPE is applied within
- [KV Cache](/wiki/kv-cache) — RoPE is applied before caching, so positions are baked in
- [Positional Encoding](/wiki/positional-encoding) — the family of methods RoPE belongs to

<!-- tier:grad -->

# Rotary Position Embeddings (RoPE)

RoPE (Su et al., 2021) has become the dominant position encoding for modern transformers. This section examines its theoretical properties, failure modes, and extensions for long-context modeling.

## Spectral Analysis

Each dimension pair in RoPE operates at a different frequency $\theta_i = \text{base}^{-2i/d}$. The lowest-frequency dimensions (large $i$) change slowly across positions and capture long-range positional structure. The highest-frequency dimensions (small $i$) change rapidly and capture local position.

The total number of "wavelengths" that fit in a context of length $L$ for dimension pair $i$:

$$\text{cycles}_i = \frac{L \cdot \theta_i}{2\pi}$$

When this exceeds the number of cycles seen during training, the model encounters unseen rotation angles, causing **extrapolation failure**. This primarily affects the high-frequency dimensions.

## Context Length Extension

Several methods extend RoPE beyond its training context length:

**Position Interpolation** (Chen et al., 2023): Instead of extrapolating, compress positions to fit within the training range:
$$m' = m \cdot \frac{L_{\text{train}}}{L_{\text{target}}}$$

This requires fine-tuning but reliably extends context. The cost: reduced resolution at short distances.

**NTK-aware scaling** (bloc97, 2023): Adjusts the base frequency to spread interpolation across all frequency bands:
$$\text{base}' = \text{base} \cdot \left(\frac{L_{\text{target}}}{L_{\text{train}}}\right)^{d/(d-2)}$$

This avoids fine-tuning for moderate extensions (2–4x) and has a nice theoretical justification: it preserves the information capacity of each frequency band by scaling the Neural Tangent Kernel.

**YaRN** (Peng et al., 2024, "YaRN: Efficient Context Window Extension"): Combines NTK scaling with a per-dimension interpolation strategy. Dimensions are classified into three categories:
1. Low-frequency dimensions that don't need adjustment
2. Medium-frequency dimensions that are interpolated
3. High-frequency dimensions that are extrapolated without change

YaRN also applies a temperature correction to the attention logits to compensate for the reduced dot-product magnitudes at long distances. Achieves reliable 128K+ context with minimal fine-tuning.

**LongRoPE** (Ding et al., 2024): Uses an evolutionary search to find per-dimension rescaling factors, achieving extensions up to 2M tokens. The key insight: different dimensions have vastly different sensitivity to scaling, and a uniform approach leaves performance on the table.

## Theoretical Connection to Fourier Features

RoPE can be understood as a special case of **random Fourier features** (Rahimi & Recht, 2007) for approximating a shift-invariant kernel. The attention score between positions $m$ and $n$ through RoPE is:

$$a(m, n) = \text{Re}\left[\sum_{i=0}^{d/2-1} (q_{2i} + iq_{2i+1})(k_{2i} - ik_{2i+1}) e^{i(m-n)\theta_i}\right]$$

This is a weighted sum of cosines at different frequencies, i.e., a truncated Fourier series in the relative distance $m-n$. The "kernel" being approximated determines what patterns of positional attention the model can learn.

## RoPE vs. ALiBi

ALiBi (Press et al., 2022) takes a completely different approach: instead of encoding position in the representations, it adds a linear bias to attention scores:

$$a_{mn} = \mathbf{q}_m^\top \mathbf{k}_n - r \cdot |m - n|$$

where $r$ is a head-specific slope. ALiBi extrapolates better than vanilla RoPE because the linear bias naturally penalizes long-range attention, but it constrains the positional attention pattern to be monotonically decaying — the model cannot learn to attend more to specific relative positions.

Empirically, RoPE with context extension (YaRN/NTK) matches or exceeds ALiBi at long contexts while being more flexible, which is why RoPE has won in practice.

## RoPE in Vision and Multimodal Models

RoPE has been adapted for non-sequential data:

- **2D RoPE** for vision transformers: Separate rotation frequencies for row and column positions. Used in LLaVA and other vision-language models for encoding spatial position of image patches.
- **3D RoPE** for video: Adds a temporal frequency dimension.
- **RoPE for graphs**: Li et al. (2023) adapted RoPE to encode graph distance in graph transformers.

## Implementation Considerations

- RoPE is applied only to queries and keys, not values. This is important for [KV cache](/wiki/kv-cache) — the values can be cached without position information and reused regardless of absolute position.
- The rotation must be applied **before** caching keys. This means cached keys have their positions baked in and cannot be repositioned without recomputation.
- Half-precision (FP16/BF16) implementations can accumulate errors in the rotation for very long sequences. Some implementations use FP32 for the rotation computation.

## Related Topics

- [KV Cache](/wiki/kv-cache) — interaction between position encoding and caching
- [Grouped Query Attention](/wiki/grouped-query-attention) — architectural complement to RoPE
- [Attention](/wiki/attention) — the mechanism RoPE modifies
- [Scaling Laws](/wiki/scaling-laws) — context length as a scaling dimension
