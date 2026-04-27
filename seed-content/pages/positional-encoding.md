---
title: Positional Encoding
category: fundamentals
---
<!-- tier:intro -->
# Positional Encoding

Here's a puzzle: transformers process all words in a sentence at the same time, not one-by-one like older models. This is great for speed, but it creates a problem -- if you feed in all the words simultaneously, how does the model know their order?

Consider these two sentences:
- "The dog chased the cat."
- "The cat chased the dog."

They have the exact same words but very different meanings. Without some way to encode position, a transformer would treat them identically. **Positional encoding** is the solution: we inject information about each word's position into its representation.

## The Basic Idea

After converting each word to an [embedding vector](/wiki/embeddings), we **add** a position vector to it. The first word gets one pattern added, the second word gets a different pattern, the third gets yet another, and so on. After this addition, each word's vector encodes both *what* the word is and *where* it is in the sentence.

## Sinusoidal Positional Encoding

::viz[positional-encoding]

The original Transformer paper ("Attention Is All You Need," 2017) introduced a clever scheme using sine and cosine waves at different frequencies.

Think of it like giving each position a unique fingerprint made of waves. Position 0 gets one pattern of peaks and valleys, position 1 gets a slightly shifted pattern, position 2 shifts again, and so on. Because each position produces a unique combination of sine and cosine values, the model can always tell positions apart.

Why waves? Because they give us something beautiful for free: **the model can learn to attend to relative positions**. The shift from position 5 to position 8 looks the same as the shift from position 20 to position 23 -- it's always a shift of 3. The wave patterns make this relationship a simple linear transformation, which the model can easily learn.

## Learned Positional Embeddings

An alternative approach is to simply **learn** the position vectors during training, just like we learn word [embeddings](/wiki/embeddings). This is what GPT-2 and BERT use. You create a second lookup table -- one row for position 0, one for position 1, and so on up to some maximum length (512 for BERT, 1024 for GPT-2).

The downside is that the model cannot handle sequences longer than what it saw during training. Sinusoidal encodings can theoretically extrapolate to any length, though in practice this is more nuanced.

## Modern Approaches: RoPE

Recent models like LLaMA use **Rotary Position Embeddings (RoPE)**, which encode position by rotating vectors rather than adding to them. This approach directly encodes *relative* position into the [attention](/wiki/attention) computation, making it especially effective for tasks that depend on the distance between words rather than their absolute position.

<!-- tier:undergrad -->
# Positional Encoding

## Why Position Encoding Is Necessary

The [self-attention](/wiki/self-attention) operation is **permutation equivariant**: if you shuffle the input tokens, the outputs get shuffled in exactly the same way, with the same values. Formally, for any permutation matrix $\mathbf{P}$:

$$\text{Attention}(\mathbf{P}\mathbf{Q}, \mathbf{P}\mathbf{K}, \mathbf{P}\mathbf{V}) = \mathbf{P} \cdot \text{Attention}(\mathbf{Q}, \mathbf{K}, \mathbf{V})$$

This means without positional encoding, the transformer cannot distinguish "dog bites man" from "man bites dog."

## Sinusoidal Positional Encoding

The encoding for position $pos$ and dimension $i$ is:

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)$$

$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)$$

where $d_{\text{model}}$ is the embedding dimension. Each dimension uses a sinusoid with a different frequency, ranging from $2\pi$ (for $i=0$) to $10000 \cdot 2\pi$ (for $i = d_{\text{model}}/2 - 1$) in wavelength.

### Key Property: Linear Relative Position

For any fixed offset $k$, the encoding at position $pos + k$ can be expressed as a linear transformation of the encoding at position $pos$:

$$PE_{pos+k} = \mathbf{T}_k \cdot PE_{pos}$$

where $\mathbf{T}_k$ is a block-diagonal rotation matrix. Each 2D block rotates by angle $k / 10000^{2i/d}$. This means the model can learn to attend to relative positions through linear projections.

## Learned Positional Embeddings

An alternative is a learnable matrix $\mathbf{P} \in \mathbb{R}^{L_{\max} \times d}$:

$$\mathbf{h}_i^{(0)} = \mathbf{E}[x_i] + \mathbf{P}[i]$$

BERT and GPT-2 use this approach. Empirically, Vaswani et al. (2017) found no significant difference between sinusoidal and learned encodings.

## Rotary Position Embeddings (RoPE)

RoPE (Su et al., 2021) applies position-dependent rotation to query and key vectors in the [attention](/wiki/attention) computation. For a 2D subspace $(q_{2i}, q_{2i+1})$:

$$\begin{pmatrix} q_{2i}' \\ q_{2i+1}' \end{pmatrix} = \begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix} \begin{pmatrix} q_{2i} \\ q_{2i+1} \end{pmatrix}$$

where $m$ is the position and $\theta_i = 10000^{-2i/d}$. The attention score between positions $m$ and $n$ then depends only on the relative position $m - n$:

$$\mathbf{q}_m^\top \mathbf{k}_n = (\mathbf{R}_m \mathbf{W}_q \mathbf{x}_m)^\top (\mathbf{R}_n \mathbf{W}_k \mathbf{x}_n) = \mathbf{x}_m^\top \mathbf{W}_q^\top \mathbf{R}_{m-n} \mathbf{W}_k \mathbf{x}_n$$

## PyTorch Implementations

```python
import torch
import torch.nn as nn
import math

# Sinusoidal positional encoding
class SinusoidalPE(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))  # (1, max_len, d_model)

    def forward(self, x):
        # x: (batch, seq_len, d_model)
        return x + self.pe[:, :x.size(1)]

# Learned positional embedding
class LearnedPE(nn.Module):
    def __init__(self, d_model: int, max_len: int = 512):
        super().__init__()
        self.pos_embedding = nn.Embedding(max_len, d_model)

    def forward(self, x):
        positions = torch.arange(x.size(1), device=x.device)
        return x + self.pos_embedding(positions)

# Rotary Position Embedding (RoPE)
def apply_rope(x, freqs_cos, freqs_sin):
    """Apply RoPE to queries or keys. x: (batch, seq, heads, dim)"""
    x_r = x.float().reshape(*x.shape[:-1], -1, 2)  # (..., dim//2, 2)
    x0, x1 = x_r[..., 0], x_r[..., 1]
    out0 = x0 * freqs_cos - x1 * freqs_sin
    out1 = x0 * freqs_sin + x1 * freqs_cos
    return torch.stack([out0, out1], dim=-1).flatten(-2).type_as(x)

def precompute_freqs(dim, max_len, theta=10000.0):
    freqs = 1.0 / (theta ** (torch.arange(0, dim, 2).float() / dim))
    t = torch.arange(max_len)
    angles = torch.outer(t, freqs)
    return torch.cos(angles), torch.sin(angles)
```

<!-- tier:grad -->
# Positional Encoding

## Extrapolation and the Length Generalization Problem

A fundamental limitation of positional encodings is **length generalization**: models trained on sequences of length $L$ often fail catastrophically on sequences of length $L' > L$. This is one of the most active research areas in transformer design.

### Sinusoidal Encoding Extrapolation

Despite the theoretical ability of sinusoidal encodings to represent arbitrary positions, in practice they fail to generalize. Press et al. (2022, "ALiBi") showed that transformers with sinusoidal encodings trained on length 1024 degrade rapidly beyond that length. The issue is not the encoding itself but the attention patterns the model learns -- they overfit to the training distribution of positions.

### ALiBi: Attention with Linear Biases

Press et al. (2022) proposed adding a linear bias to attention scores instead of encoding position in embeddings:

$$\text{softmax}\left(\mathbf{q}_i^\top \mathbf{k}_j - m \cdot |i - j|\right)$$

where $m$ is a head-specific slope set geometrically (e.g., $m = 2^{-8/n}$ for $n$ heads). ALiBi requires no learned parameters for position and extrapolates significantly better than both sinusoidal and learned encodings.

### RoPE Length Extension

RoPE has become the dominant positional encoding in modern LLMs (LLaMA, PaLM, Mistral). Several techniques extend its effective context length:

**Position Interpolation (Chen et al., 2023):** Instead of extrapolating to unseen positions, linearly interpolate positions to fit within the training range:

$$f'(x, m) = f\left(x, \frac{mL}{L'}\right)$$

where $L$ is the training length and $L'$ is the target length. This requires minimal fine-tuning (1000 steps) to adapt.

**NTK-aware Scaling (Reddit/bloc97, 2023):** Adjusts the base frequency $\theta$ rather than scaling positions:

$$\theta' = \theta \cdot \left(\frac{L'}{L}\right)^{d/(d-2)}$$

This preserves high-frequency components better than linear interpolation.

**YaRN (Peng et al., 2023):** Combines NTK-aware scaling with a temperature correction and attention scaling factor, achieving the best length extension results. It partitions RoPE dimensions into three groups with different interpolation strategies based on their wavelength relative to the training context.

## Relative Position Encodings: A Taxonomy

| Method | Type | Params | Extrapolation | Used In |
|--------|------|--------|---------------|---------|
| Sinusoidal | Absolute, additive | 0 | Poor | Original Transformer |
| Learned | Absolute, additive | $L \times d$ | None | BERT, GPT-2 |
| Relative (Shaw et al., 2018) | Relative, additive bias | $O(d)$ | Moderate | Transformer-XL |
| T5 Relative Bias | Relative, attention bias | $O(b)$ buckets | Moderate | T5 |
| RoPE | Relative, multiplicative | 0 | Moderate | LLaMA, PaLM, Mistral |
| ALiBi | Relative, attention bias | 0 | Good | BLOOM, MPT |
| CoPE (Golovneva et al., 2024) | Context-dependent | $O(d)$ | Good | Research |

## Contextual Position Encoding (CoPE)

Golovneva et al. (2024) introduced CoPE, where positions are determined by content, not fixed indices. The position of token $j$ relative to token $i$ is:

$$p_{ij} = \sum_{k=j}^{i} g_{ik}, \quad g_{ik} = \sigma(\mathbf{q}_i^\top \mathbf{k}_k)$$

where gates $g_{ik}$ are computed from attention queries and keys. This allows the model to count positions in terms of semantic units (e.g., "the 3rd sentence") rather than token indices.

## Theoretical Analysis

Kazemnejad et al. (2023) systematically studied position encodings for length generalization on algorithmic tasks. Key finding: **no positional encoding** (NoPE) sometimes outperforms all position encoding schemes on tasks requiring length generalization. This suggests that for certain tasks, the model can infer position from content alone, and explicit position information can be harmful by encouraging overfitting to training-length patterns.

### Key References

- Vaswani et al. (2017). "Attention Is All You Need." NeurIPS.
- Shaw et al. (2018). "Self-Attention with Relative Position Representations." NAACL.
- Su et al. (2021). "RoFormer: Enhanced Transformer with Rotary Position Embedding." arXiv:2104.09864.
- Press et al. (2022). "Train Short, Test Long: Attention with Linear Biases Enables Input Length Extrapolation." ICLR.
- Chen et al. (2023). "Extending Context Window of Large Language Models via Positional Interpolation." arXiv:2306.15595.
- Peng et al. (2023). "YaRN: Efficient Context Window Extension of Large Language Models." arXiv:2309.00071.
- Golovneva et al. (2024). "Contextual Position Encoding: Learning to Count What's Important." arXiv:2405.18719.
- Kazemnejad et al. (2023). "The Impact of Positional Encoding on Length Generalization in Transformers." NeurIPS.
