---
title: Cross-Attention
category: attention
---
<!-- tier:intro -->

# Cross-Attention

So far, we've talked about **self-attention**, where tokens in a sequence attend to other tokens in the *same* sequence. But what if you need one sequence to pay attention to a completely *different* sequence? That's what **cross-attention** does.

## When Do You Need Cross-Attention?

Imagine you're translating French to English. Your model has processed the French sentence and built a rich understanding of it (using the encoder). Now the decoder is generating the English translation, one word at a time. As it generates each English word, it needs to "look back" at the French sentence to decide what to say next.

Cross-attention is the bridge between the two sequences. The decoder *queries* the encoder's output to find the relevant information.

## How It Works

Cross-attention works just like regular [attention](/wiki/attention), with one key difference in where the inputs come from:

- **Queries (Q)**: Come from the *decoder* -- "What am I looking for?"
- **Keys (K)** and **Values (V)**: Come from the *encoder* -- "Here's what's available to look at."

So each decoder token asks a question (query), and the encoder tokens provide the answers (values), with the keys determining how relevant each answer is.

For example, when generating the English word "cat," the decoder's query might match strongly with the key for the French word "chat," and the value for "chat" would flow into the decoder's representation.

## Where Cross-Attention Appears

Cross-attention shows up in any model that needs to connect two different sequences:

- **Translation models** (T5, mBART): Decoder attends to encoder's representation of the source language
- **Speech recognition** (Whisper): Decoder attends to encoder's representation of audio features
- **Image captioning**: Text decoder attends to vision encoder's representation of the image
- **Retrieval-augmented models**: Generator attends to retrieved documents

In an [encoder-decoder transformer](/wiki/encoder-decoder), each decoder block has three sub-layers:
1. [Masked self-attention](/wiki/masked-self-attention) (decoder tokens attend to each other)
2. **Cross-attention** (decoder tokens attend to encoder outputs)
3. Feed-forward network

## Cross-Attention vs. Self-Attention

| | Self-Attention | Cross-Attention |
|---|---|---|
| Q, K, V source | All from the same sequence | Q from one sequence, K and V from another |
| Masking | Can be causal or bidirectional | Usually no masking (attend to all encoder positions) |
| Purpose | Build relationships within a sequence | Transfer information between sequences |

## A Simple Analogy

Think of cross-attention like an open-book exam. Self-attention is like thinking and connecting ideas within your own mind. Cross-attention is like looking down at your reference book (the encoder output) to find the specific information you need to answer the current question (the decoder's current token).

## Related Topics

- [Attention](/wiki/attention) -- the base mechanism that cross-attention builds on
- [Encoder-Decoder](/wiki/encoder-decoder) -- the architecture where cross-attention is used
- [Masked Self-Attention](/wiki/masked-self-attention) -- the other type of attention in the decoder

<!-- tier:undergrad -->

# Cross-Attention

Cross-attention (also called encoder-decoder attention) allows one sequence to attend to another. It is the mechanism that connects the encoder and decoder in sequence-to-sequence transformer models.

## Mathematical Formulation

Given decoder hidden states $\mathbf{Y} \in \mathbb{R}^{m \times d}$ and encoder outputs $\mathbf{H}_{\text{enc}} \in \mathbb{R}^{n \times d}$:

$$\mathbf{Q} = \mathbf{Y} W_Q, \quad \mathbf{K} = \mathbf{H}_{\text{enc}} W_K, \quad \mathbf{V} = \mathbf{H}_{\text{enc}} W_V$$

$$\text{CrossAttn}(\mathbf{Y}, \mathbf{H}_{\text{enc}}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^T}{\sqrt{d_k}}\right)\mathbf{V}$$

Note: $\mathbf{Q} \in \mathbb{R}^{m \times d_k}$, $\mathbf{K} \in \mathbb{R}^{n \times d_k}$, $\mathbf{V} \in \mathbb{R}^{n \times d_v}$, so the attention matrix is $\mathbb{R}^{m \times n}$ -- rectangular, not square. Each decoder position produces a weighted sum over all encoder positions.

There is typically **no masking** in cross-attention: every decoder token can attend to every encoder position.

## Cross-Attention in the Decoder Block

In the original transformer, each decoder block has three sub-layers:

$$\mathbf{Y}' = \mathbf{Y} + \text{CausalSelfAttn}(\text{LN}(\mathbf{Y}))$$
$$\mathbf{Y}'' = \mathbf{Y}' + \text{CrossAttn}(\text{LN}(\mathbf{Y}'), \mathbf{H}_{\text{enc}})$$
$$\mathbf{Y}''' = \mathbf{Y}'' + \text{FFN}(\text{LN}(\mathbf{Y}''))$$

The cross-attention sub-layer sits between self-attention and the FFN. This ordering matters: the decoder first contextualizes its own sequence (via causal self-attention), then incorporates information from the encoder (via cross-attention), then processes the combined information (via FFN).

## Multi-Head Cross-Attention

Like self-attention, cross-attention uses multiple heads. Each head can specialize in different types of source-target alignment:

$$\text{head}_i = \text{softmax}\left(\frac{\mathbf{Q}_i \mathbf{K}_i^T}{\sqrt{d_k}}\right) \mathbf{V}_i$$

$$\text{MultiHead}(\mathbf{Y}, \mathbf{H}_{\text{enc}}) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) W_O$$

In translation, different heads often specialize: one might handle word-level alignment, another might track phrase boundaries, and another might capture global sentence structure.

## Efficiency: Caching Encoder Outputs

A key efficiency property of cross-attention: the encoder keys and values are computed once and reused across all decoder time steps. During autoregressive generation:

1. **Encoder forward pass** (once): Compute $\mathbf{K} = \mathbf{H}_{\text{enc}} W_K$ and $\mathbf{V} = \mathbf{H}_{\text{enc}} W_V$
2. **Each decoder step** $t$: Only compute $\mathbf{q}_t = \mathbf{y}_t W_Q$ and attend to the cached $\mathbf{K}$ and $\mathbf{V}$

This is different from the decoder's self-attention KV cache, which grows with each step. The cross-attention KV cache is fixed-size.

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class CrossAttention(nn.Module):
    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_k = d_model // n_heads
        self.n_heads = n_heads

        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        self.W_O = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, decoder_hidden: torch.Tensor,
                encoder_output: torch.Tensor) -> torch.Tensor:
        B, m, _ = decoder_hidden.shape
        _, n, _ = encoder_output.shape

        # Q from decoder, K and V from encoder
        Q = self.W_Q(decoder_hidden).view(B, m, self.n_heads, self.d_k).transpose(1, 2)
        K = self.W_K(encoder_output).view(B, n, self.n_heads, self.d_k).transpose(1, 2)
        V = self.W_V(encoder_output).view(B, n, self.n_heads, self.d_k).transpose(1, 2)

        # Attention: (B, h, m, d_k) x (B, h, d_k, n) -> (B, h, m, n)
        scores = Q @ K.transpose(-2, -1) / (self.d_k ** 0.5)
        attn = self.dropout(F.softmax(scores, dim=-1))

        # (B, h, m, n) x (B, h, n, d_k) -> (B, h, m, d_k)
        out = (attn @ V).transpose(1, 2).contiguous().view(B, m, -1)
        return self.W_O(out)
```

## Related Topics

- [Attention](/wiki/attention) -- the general mechanism
- [Encoder-Decoder](/wiki/encoder-decoder) -- where cross-attention fits in the architecture
- [Multi-Head Attention](/wiki/multi-head-attention) -- the multi-head framework shared by both attention types

<!-- tier:grad -->

# Cross-Attention

Cross-attention is the inter-sequence communication mechanism in encoder-decoder architectures. Its behavior, efficiency properties, and alternatives reveal fundamental questions about how transformers process structured inputs.

## Attention Pattern Analysis

Voita et al. (2019) analyzed cross-attention heads in trained translation models and identified several specialized roles:

1. **Positional heads**: Attend to the source position corresponding to the current target position (diagonal alignment)
2. **Syntactic heads**: Track syntactic correspondences across languages (e.g., subject-verb agreement across reordering)
3. **Rare word heads**: Specialize in attending to rare or content words that need to be translated precisely
4. **Aggregate heads**: Produce a roughly uniform attention distribution, acting as a "bag of words" summary of the source

Pruning experiments showed that only a small fraction of cross-attention heads are essential. Most heads can be removed after training with minimal quality loss, suggesting significant redundancy in the standard multi-head formulation.

## Cross-Attention as Information Bottleneck

The cross-attention mechanism creates an information bottleneck: all information from the encoder must pass through the attention-weighted sum of encoder values. Several works have analyzed this bottleneck:

**Fixed-dimensional bottleneck**: For a decoder hidden state of dimension $d$, the cross-attention output at each position is a $d$-dimensional vector (or $d/h$ per head). This is the same dimensionality regardless of the source sequence length $n$.

**Rank analysis**: The attention matrix for a single head has rank at most $\min(m, d_k)$, where $m$ is the decoder length and $d_k = d/h$ is the head dimension. For long source sequences ($n \gg d_k$), many source positions are necessarily conflated. Multi-head attention mitigates this: $h$ heads can collectively maintain rank up to $\min(m, d)$.

**Perceiver bottleneck** (Jaegle et al., 2021): Makes the bottleneck explicit by introducing a small set of $l \ll n$ learned latent vectors that cross-attend to the input. All subsequent processing operates on these $l$ vectors, decoupling compute from input length:

$$\mathbf{Z} = \text{CrossAttn}(\mathbf{Z}_0, \mathbf{X}) \quad \text{where } \mathbf{Z}_0 \in \mathbb{R}^{l \times d}, \, \mathbf{X} \in \mathbb{R}^{n \times d}$$

## Replacing Cross-Attention

Several architectures explore alternatives to cross-attention:

**Concatenation-based approaches**: Instead of cross-attention, concatenate the encoder output with decoder input and use only self-attention. FiD (Fusion-in-Decoder, Izacard & Grave, 2021) concatenates multiple retrieved passages in the decoder's self-attention, which is computationally expensive but allows fine-grained interaction between passages.

**Decoder-only with input prefixing**: Decoder-only models effectively replace cross-attention with causal self-attention over the concatenated input-output sequence. The "encoder" portion is the prefix of the sequence. This works because causal attention over the prefix is equivalent to bidirectional attention within the prefix and cross-attention from the output to the prefix (modulo parameter sharing between "encoder" and "decoder").

**Cross-attention distillation**: Tay et al. (2021) showed that encoder-decoder models can be distilled into decoder-only models, with the decoder-only model learning to replicate the cross-attention patterns through its self-attention mechanism.

## Cross-Attention in Multimodal Models

Cross-attention is the primary mechanism for connecting different modalities:

**Flamingo** (Alayrac et al., 2022): Interleaves cross-attention layers (called "gated xattn-dense" layers) within a frozen language model. The cross-attention keys and values come from a vision encoder. Gating (initialized to zero) allows gradual integration of visual information:

$$\mathbf{y} = \mathbf{x} + \tanh(\alpha) \cdot \text{CrossAttn}(\text{LN}(\mathbf{x}), \mathbf{v})$$

where $\alpha$ is a learnable scalar initialized to 0.

**LLaVA** (Liu et al., 2024): Takes a simpler approach -- projects visual features into the language model's embedding space and concatenates them with text tokens, using only self-attention. This is cheaper than cross-attention but less flexible.

**Whisper** (Radford et al., 2023): Uses standard cross-attention for speech recognition. The encoder processes log-mel spectrograms, and the decoder cross-attends to generate text transcriptions. The cross-attention patterns clearly show temporal alignment between audio and text.

## Sparse and Efficient Cross-Attention

For long source sequences, full cross-attention ($O(m \times n)$) becomes expensive:

**Top-k sparse attention**: At each decoder position, only attend to the top-$k$ encoder positions. This requires first computing all attention scores (still $O(m \times n)$) or using an approximate nearest-neighbor search over keys.

**Routing-based attention**: Route each decoder query to a subset of encoder positions using a learned or heuristic routing function. This achieves sub-linear complexity but may miss relevant source positions.

**Multi-resolution cross-attention**: Process the encoder output at multiple resolutions (via pooling or strided convolutions) and cross-attend to different resolutions at different decoder layers. Lower layers use fine-grained source representations; higher layers use coarser ones.

## Cross-Attention and Gradient Flow

In encoder-decoder models, cross-attention is the only path for gradients to flow from the decoder loss to the encoder parameters. This has implications:

1. **Encoder gradient quality**: The encoder only receives gradients through the cross-attention weights, which are a function of both encoder and decoder representations. This can lead to slower encoder training compared to the decoder.

2. **Frozen encoder**: Many multimodal models freeze the encoder and only train the cross-attention layers and decoder. This works because the cross-attention projection matrices ($W_K$ and $W_V$ applied to encoder outputs) can learn to extract relevant features from fixed encoder representations.

3. **Adapter layers**: LoRA and similar adapter methods applied to cross-attention $W_Q$, $W_K$, $W_V$ matrices are particularly effective for domain adaptation, as they directly control information flow between modalities.

## Related Topics

- [Encoder-Decoder](/wiki/encoder-decoder) -- the architecture that uses cross-attention
- [Attention](/wiki/attention) -- the general attention mechanism
- [Multi-Head Attention](/wiki/multi-head-attention) -- the multi-head framework
