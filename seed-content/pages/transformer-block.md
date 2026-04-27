---
title: Transformer Block
category: architecture
---
<!-- tier:intro -->

# Transformer Block

A transformer model like GPT or BERT isn't one monolithic thing -- it's a stack of identical building blocks, each called a **transformer block** (or transformer layer). Understanding one block means you understand the whole model, because the rest is just repetition.

## What's Inside a Block?

Every transformer block has two main parts, applied in sequence:

1. **Multi-head self-attention** -- This is where tokens "talk to each other." Each token looks at every other token in the sequence and decides what information to gather. A token representing "it" might attend strongly to "the cat" earlier in the sentence to figure out what "it" refers to.

2. **Feed-forward network (FFN)** -- After gathering information from other tokens, each token passes independently through a small neural network. Think of this as the "thinking" step where the model processes the information it just collected. The same FFN is applied to every token position separately.

## The Glue: Residual Connections and Layer Norm

Each of those two parts is wrapped with two critical operations:

- **[Residual connections](/wiki/residual-connections)**: The input to each sub-layer is added back to its output. This creates a "highway" that helps information and gradients flow through the whole network.
- **[Layer normalization](/wiki/layer-normalization)**: Keeps the numbers at a stable scale, preventing them from exploding or collapsing as they pass through layers.

So the full pattern for each sub-layer is:

```
output = LayerNorm(input + SubLayer(input))
```

## How Blocks Stack

::viz[layer-activations]

A complete transformer model stacks many of these identical blocks:

- BERT-base: 12 blocks
- GPT-2: 12 to 48 blocks (depending on size)
- GPT-3: 96 blocks
- LLaMA 70B: 80 blocks

Each block has its own set of learned parameters (weights), but they all follow the same structure. As data flows through the stack, the representation gets progressively refined. Early blocks tend to handle lower-level patterns (syntax, word relationships), while later blocks capture higher-level meaning (semantics, reasoning).

## The Information Flow

Here's the journey of a token through one block:

1. Start with a vector representing the token (from the previous block, or from the [embedding layer](/wiki/embeddings) if this is the first block)
2. All token vectors attend to each other via multi-head attention
3. Add the attention output back to the input (residual connection), then normalize
4. Each token vector passes through the FFN independently
5. Add the FFN output back to its input (residual connection), then normalize
6. Output goes to the next block

That's it. The elegance of the transformer is that this simple block, repeated many times, can learn remarkably complex language patterns.

## Related Topics

- [Attention](/wiki/attention) -- the mechanism inside the first sub-layer
- [Residual Connections](/wiki/residual-connections) -- the skip connections that hold it together
- [Encoder-Decoder](/wiki/encoder-decoder) -- how blocks are arranged in different architectures

<!-- tier:undergrad -->

# Transformer Block

A transformer block implements two sub-layers with residual connections and normalization. This section provides the precise mathematical formulation and implementation details.

## Architecture

Given an input sequence $\mathbf{X} \in \mathbb{R}^{n \times d}$ where $n$ is the sequence length and $d = d_{\text{model}}$, a transformer block computes:

**Sub-layer 1: Multi-Head Self-Attention**

$$\mathbf{X}' = \text{LayerNorm}(\mathbf{X} + \text{MultiHeadAttn}(\mathbf{X}))$$

**Sub-layer 2: Position-wise Feed-Forward Network**

$$\mathbf{X}'' = \text{LayerNorm}(\mathbf{X}' + \text{FFN}(\mathbf{X}'))$$

This is the **Post-Norm** formulation from Vaswani et al. (2017). The **Pre-Norm** variant (used in GPT-2, LLaMA, and most modern models) applies normalization before each sub-layer:

$$\mathbf{X}' = \mathbf{X} + \text{MultiHeadAttn}(\text{LayerNorm}(\mathbf{X}))$$
$$\mathbf{X}'' = \mathbf{X}' + \text{FFN}(\text{LayerNorm}(\mathbf{X}'))$$

## The Feed-Forward Network

The FFN is a two-layer MLP applied independently to each position:

$$\text{FFN}(\mathbf{x}) = W_2 \, \sigma(W_1 \mathbf{x} + \mathbf{b}_1) + \mathbf{b}_2$$

where:
- $W_1 \in \mathbb{R}^{d_{ff} \times d}$, $W_2 \in \mathbb{R}^{d \times d_{ff}}$
- $d_{ff}$ is typically $4d$ (e.g., 3072 for $d=768$)
- $\sigma$ is an activation function: ReLU in the original, GELU in BERT/GPT, SwiGLU in LLaMA

**SwiGLU variant** (used in modern models):

$$\text{FFN}_{\text{SwiGLU}}(\mathbf{x}) = W_2 \left( \text{SiLU}(W_1 \mathbf{x}) \odot W_3 \mathbf{x} \right)$$

This uses three weight matrices instead of two but empirically performs better. When using SwiGLU, $d_{ff}$ is typically set to $\frac{8d}{3}$ to keep the parameter count comparable.

## Parameter Count

For a single transformer block with $d_{\text{model}} = d$ and $h$ attention heads:

| Component | Parameters |
|---|---|
| $W_Q, W_K, W_V$ (attention) | $3 \times d \times d = 3d^2$ |
| $W_O$ (attention output) | $d^2$ |
| $W_1$ (FFN up-projection) | $d \times d_{ff}$ |
| $W_2$ (FFN down-projection) | $d_{ff} \times d$ |
| Layer norms (2) | $4d$ |
| **Total per block** | $\approx 4d^2 + 2d \cdot d_{ff} \approx 12d^2$ |

For an $L$-layer model, the total parameter count is approximately $12Ld^2$ (plus embeddings).

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class TransformerBlock(nn.Module):
    def __init__(self, d_model: int, n_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, n_heads, dropout=dropout, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # Pre-Norm variant
        x_norm = self.norm1(x)
        attn_out, _ = self.attn(x_norm, x_norm, x_norm, attn_mask=mask)
        x = x + self.dropout(attn_out)

        x_norm = self.norm2(x)
        x = x + self.ffn(x_norm)
        return x

# Stack multiple blocks
class Transformer(nn.Module):
    def __init__(self, n_layers: int, d_model: int, n_heads: int, d_ff: int):
        super().__init__()
        self.layers = nn.ModuleList([
            TransformerBlock(d_model, n_heads, d_ff) for _ in range(n_layers)
        ])
        self.final_norm = nn.LayerNorm(d_model)

    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        for layer in self.layers:
            x = layer(x, mask=mask)
        return self.final_norm(x)
```

## Related Topics

- [Multi-Head Attention](/wiki/multi-head-attention) -- the attention mechanism in sub-layer 1
- [Residual Connections](/wiki/residual-connections) -- the skip connections wrapping each sub-layer
- [Encoder-Decoder](/wiki/encoder-decoder) -- how blocks differ in encoder vs. decoder stacks

<!-- tier:grad -->

# Transformer Block

The transformer block's simplicity belies a rich space of architectural variations, efficiency trade-offs, and theoretical questions about why this particular arrangement works so well.

## Architectural Variations

The standard block applies attention then FFN. Several works have explored alternatives:

**Parallel attention + FFN** (PaLM, GPT-J): Instead of sequential sub-layers, compute attention and FFN in parallel:

$$\mathbf{x}_{l+1} = \mathbf{x}_l + \text{Attn}(\text{LN}(\mathbf{x}_l)) + \text{FFN}(\text{LN}(\mathbf{x}_l))$$

This reduces sequential computation (one fewer normalization/residual step per block) and yields ~15% training speedup with minimal quality loss. The insight is that in Pre-Norm architectures, the attention and FFN inputs are identical anyway, so parallelism is a natural simplification.

**Mixture-of-Experts (MoE) FFN**: Replace the dense FFN with a sparse MoE layer. Each token is routed to $k$ of $N$ expert FFNs (typically $k=2$, $N=8$ to $128$). This dramatically increases parameter count without proportionally increasing compute. Switch Transformer (Fedus et al., 2022) and Mixtral (Jiang et al., 2024) use this approach.

$$\text{MoE}(\mathbf{x}) = \sum_{i=1}^{N} g_i(\mathbf{x}) \cdot \text{FFN}_i(\mathbf{x}), \quad \text{where } g(\mathbf{x}) = \text{TopK}(\text{softmax}(W_g \mathbf{x}))$$

**Shared parameters**: ALBERT (Lan et al., 2020) shares parameters across all transformer blocks, reducing model size dramatically. Universal Transformer (Dehghani et al., 2019) takes this further, applying the same block iteratively with a halting mechanism.

## The FFN as Key-Value Memory

Geva et al. (2021) demonstrated that FFN layers function as key-value memories. The first linear layer's rows act as "keys" that match input patterns, and the second layer's columns act as "values" that store associated output distributions. Specifically:

$$\text{FFN}(\mathbf{x}) = \sum_{i=1}^{d_{ff}} \sigma(\mathbf{k}_i^T \mathbf{x}) \cdot \mathbf{v}_i$$

where $\mathbf{k}_i$ is row $i$ of $W_1$ and $\mathbf{v}_i$ is column $i$ of $W_2$. This view connects FFN layers to retrieval-augmented generation and explains why FFNs store factual knowledge that can be edited (Meng et al., 2022, ROME).

## Block Ordering and Depth Allocation

Not all blocks are equal. Empirical studies reveal:

**Layer pruning**: Many layers can be removed with minimal performance impact. Gromov et al. (2024) showed that removing up to 25% of layers from LLaMA-2 70B (pruning from the middle) causes less than 1% degradation on most benchmarks. This suggests significant redundancy.

**Layer-wise learning rates**: Different layers benefit from different learning rates. Early layers (near embeddings) typically prefer smaller learning rates. This observation motivates techniques like LLRD (Layer-wise Learning Rate Decay) for fine-tuning.

**Depth vs. width**: Scaling laws (Kaplan et al., 2020) suggest optimal depth grows as $L \propto N^{0.2}$ where $N$ is total parameters, meaning width should grow faster than depth. Very deep, narrow models are suboptimal.

## Normalization Variants

Beyond Pre-Norm and Post-Norm:

- **RMSNorm** (Zhang & Sennrich, 2019): Simplifies LayerNorm by removing the mean centering, using only root-mean-square normalization. Used in LLaMA, Gemma. Saves ~7% compute vs LayerNorm with no quality loss.

$$\text{RMSNorm}(\mathbf{x}) = \frac{\mathbf{x}}{\sqrt{\frac{1}{d}\sum_{i=1}^d x_i^2 + \epsilon}} \odot \gamma$$

- **QK-Norm** (Dehghani et al., 2023): Applies normalization to query and key vectors before the dot product, preventing attention logit growth in deep models. Critical for training ViTs at scale and adopted in Gemini.

- **DeepNorm** (Wang et al., 2022): Scales the residual connection by $\alpha$ and sub-layer outputs by $\beta$, enabling 1,000-layer transformers. The scale factors are $\alpha = (2L)^{1/4}$ and $\beta = (8L)^{-1/4}$.

## Emerging Block Designs

Recent architectures challenge the standard two-sub-layer design:

- **State space model (SSM) hybrids** (Jamba, Mamba-2): Alternate transformer blocks with SSM blocks. The SSM blocks handle long-range dependencies efficiently while attention blocks handle tasks requiring precise token-to-token interaction.

- **Differential Transformer** (Ye et al., 2024): Modifies the attention sub-layer to compute the difference between two attention patterns, reducing noise in attention distributions.

- **Grouped-query and multi-query attention**: Modify the attention sub-layer to share key/value heads across query heads, reducing KV cache size during inference by 4-8x with minimal quality impact.

## Related Topics

- [Multi-Head Attention](/wiki/multi-head-attention) -- the attention sub-layer in detail
- [Residual Connections](/wiki/residual-connections) -- the skip connections that hold blocks together
- [Efficiency](/wiki/efficiency) -- techniques to make transformer blocks cheaper to compute
