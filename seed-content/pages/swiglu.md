---
title: SwiGLU Activation
category: architecture
---
<!-- tier:intro -->
# SwiGLU Activation

Inside every [transformer block](/wiki/transformer-block), there is a [feed-forward network](/wiki/feed-forward-networks) (FFN) -- a two-layer neural network that processes each token independently. A critical part of this network is the **activation function**, which introduces nonlinearity. Without it, stacking layers would be no more powerful than a single layer. **SwiGLU** is the activation function used in most modern large language models, including LLaMA, PaLM, Mistral, and Gemma.

## Building Up to SwiGLU

To understand SwiGLU, let's build up from simpler pieces.

**ReLU** (Rectified Linear Unit) is the classic activation: if the input is positive, pass it through unchanged; if negative, output zero. Simple and effective, but it throws away all negative information permanently.

**Swish** (also called SiLU) is a smoother alternative: instead of a hard cutoff at zero, it uses a gentle S-shaped curve. The formula is $x \times \text{sigmoid}(x)$. Small negative values get slightly negative outputs instead of being zeroed out, which helps gradient flow during training.

**GLU** (Gated Linear Unit) is a different idea entirely. Instead of applying a simple function to each value, it splits the input into two halves. One half provides the "content" and the other half acts as a "gate" that controls how much of the content passes through. The gate values are between 0 and 1 (thanks to a sigmoid function), so the network learns to selectively filter information.

**SwiGLU** combines Swish and GLU: it uses Swish as the gating mechanism inside the GLU structure. One projection provides the content, another provides gate values via the Swish function, and they are multiplied together.

## Why It Works Better

SwiGLU consistently outperforms ReLU and plain GELU in language models. The intuition is that the gating mechanism gives the network a richer way to process information. Instead of just "pass or block" (like ReLU), SwiGLU lets the network make nuanced, input-dependent decisions about what information to keep and how much to scale it.

## The Cost

SwiGLU requires three weight matrices in the FFN instead of two (one for content, one for gating, and one for the output projection). To keep the total parameter count similar to a ReLU-based FFN, the hidden dimension is typically reduced by a factor of $2/3$. So you get better quality at roughly the same computational cost.

<!-- tier:undergrad -->
# SwiGLU Activation

## Background: Gated Linear Units

Dauphin et al. (2017) introduced the Gated Linear Unit:

$$
\text{GLU}(\mathbf{x}) = (\mathbf{x} W_1 + b_1) \otimes \sigma(\mathbf{x} W_2 + b_2)
$$

where $W_1, W_2 \in \mathbb{R}^{d \times d_{\text{ff}}}$, $\sigma$ is the sigmoid function, and $\otimes$ denotes element-wise multiplication. The left term provides content and the right term provides gating.

Shazeer (2020) generalized this by replacing sigmoid with other activation functions, yielding a family of GLU variants:

| Name | Gate activation |
|------|----------------|
| GLU | $\sigma(x)$ (sigmoid) |
| ReGLU | $\max(0, x)$ (ReLU) |
| GEGLU | $\text{GELU}(x)$ |
| SwiGLU | $x \cdot \sigma(\beta x)$ (Swish/SiLU) |

## SwiGLU Definition

The Swish activation (Ramachandran et al., 2017) is:

$$
\text{Swish}_\beta(x) = x \cdot \sigma(\beta x)
$$

where $\sigma$ is the sigmoid function and $\beta$ is a learnable or fixed parameter (typically $\beta = 1$, in which case Swish equals SiLU).

SwiGLU applies Swish as the gating function within a GLU:

$$
\text{SwiGLU}(\mathbf{x}) = (\mathbf{x} W_1) \otimes \text{Swish}(\mathbf{x} W_{\text{gate}})
$$

The full FFN with SwiGLU is:

$$
\text{FFN}_{\text{SwiGLU}}(\mathbf{x}) = \left[ (\mathbf{x} W_1) \otimes \text{Swish}(\mathbf{x} W_{\text{gate}}) \right] W_2
$$

where $W_1, W_{\text{gate}} \in \mathbb{R}^{d \times d_{\text{ff}}}$ and $W_2 \in \mathbb{R}^{d_{\text{ff}} \times d}$. Biases are typically omitted in modern architectures.

## Parameter Budget

A standard ReLU FFN has two matrices: $W_1 \in \mathbb{R}^{d \times 4d}$ and $W_2 \in \mathbb{R}^{4d \times d}$, totaling $8d^2$ parameters. SwiGLU has three matrices. To maintain the same parameter count, the hidden dimension is set to $\frac{8}{3}d$, often rounded to a multiple of 256 for hardware efficiency:

$$
d_{\text{ff}} = \left\lfloor \frac{8d/3 + 255}{256} \right\rfloor \times 256
$$

With $d_{\text{ff}} = \frac{8d}{3}$, total parameters are $3 \times d \times \frac{8d}{3} = 8d^2$.

## Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class SwiGLU_FFN(nn.Module):
    def __init__(self, d_model: int, d_ff: int = None):
        super().__init__()
        if d_ff is None:
            # 8/3 * d_model, rounded to nearest multiple of 256
            d_ff = int(((8 * d_model / 3) + 255) // 256 * 256)
        self.w1 = nn.Linear(d_model, d_ff, bias=False)
        self.w_gate = nn.Linear(d_model, d_ff, bias=False)
        self.w2 = nn.Linear(d_ff, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w2(F.silu(self.w_gate(x)) * self.w1(x))
```

Note: `F.silu` is PyTorch's implementation of Swish with $\beta = 1$.

## Empirical Results

Shazeer (2020) evaluated GLU variants on language modeling tasks, finding consistent improvements. On a perplexity-matched basis (same total compute), SwiGLU and GEGLU outperformed ReLU by approximately 1--2 perplexity points across model sizes. This advantage has been consistently reproduced in LLaMA (Touvron et al., 2023), PaLM (Chowdhery et al., 2022), and subsequent models.

<!-- tier:grad -->
# SwiGLU Activation

## Theoretical Analysis

### Expressivity of Gated Activations

GLU-style activations implement a form of second-order interaction. A standard FFN with ReLU computes $\text{ReLU}(\mathbf{x}W_1)W_2$, which is piecewise linear in $\mathbf{x}$. SwiGLU computes $(\mathbf{x}W_1) \otimes \text{Swish}(\mathbf{x}W_{\text{gate}})$, which involves element-wise products of two different linear projections of $\mathbf{x}$. This creates bilinear (second-order) interactions between features:

$$
[\text{SwiGLU}(\mathbf{x})]_j = \left(\sum_i x_i [W_1]_{ij}\right) \cdot \text{Swish}\left(\sum_i x_i [W_{\text{gate}}]_{ij}\right)
$$

This bilinear structure allows the network to learn multiplicative feature interactions that would require multiple ReLU layers to approximate.

### Gradient Properties

The gradient of SwiGLU with respect to the gate input has desirable properties. Let $g = \mathbf{x}W_{\text{gate}}$ and $c = \mathbf{x}W_1$. Then:

$$
\frac{\partial \text{SwiGLU}}{\partial g_j} = c_j \cdot \text{Swish}'(g_j) = c_j \left[\sigma(g_j) + g_j \sigma(g_j)(1 - \sigma(g_j))\right]
$$

Unlike ReLU-gated variants where $\frac{\partial}{\partial g_j} = 0$ for $g_j < 0$, Swish provides non-zero gradients everywhere, allowing recovery from "dead gate" states. The gradient magnitude is also self-regulating: for large $|g_j|$, the derivative asymptotes to 1 (positive side) or 0 (negative side), providing implicit gradient clipping.

## Connection to Mixture of Experts

Csordas et al. (2024) showed that GLU-based FFNs exhibit emergent sparsity: a large fraction of gate values converge to near-zero during training, even without explicit sparsity regularization. In LLaMA-7B, approximately 90% of SwiGLU neurons are effectively inactive (gate value < 0.01) for any given input.

This connects to the Mixture of Experts (MoE) paradigm: the gating mechanism learns to route different inputs to different subsets of neurons. Deja Vu (Liu et al., 2023) exploited this for inference acceleration: by predicting which neurons will be active (gate > threshold) using a small predictor network, they achieved 2x speedup with negligible quality loss.

## Role in Superposition

From the [superposition](/wiki/superposition) perspective (Elhage et al., 2022), the bilinear structure of SwiGLU is particularly relevant. The element-wise multiplication creates interference patterns between the content and gate projections. If we think of the residual stream as encoding features in superposition, the gate can learn to selectively extract specific features based on the presence of other features -- a form of conditional computation that ReLU FFNs cannot implement in a single layer.

Gurnee et al. (2024) found that individual SwiGLU neurons in LLaMA models have more interpretable activation patterns than corresponding ReLU neurons in earlier architectures, suggesting that the gating mechanism facilitates cleaner feature decomposition.

## Alternatives and Recent Developments

**Squared ReLU.** So et al. (2022) found that $\text{ReLU}(x)^2$ achieves comparable performance to SwiGLU on some benchmarks while being simpler. The squaring promotes sparsity (small activations become very small) and introduces a polynomial nonlinearity. However, it can suffer from activation explosion for large inputs.

**JumpReLU.** Erichson et al. (2024) proposed JumpReLU ($\max(0, x - \kappa)$ with a learned threshold $\kappa$) as an alternative that provides exact zeros (true sparsity) while maintaining trainability through straight-through estimators.

**GeGLU vs. SwiGLU.** Despite their similar performance in Shazeer's original experiments, SwiGLU has become the dominant choice. The practical difference is minimal; the choice may have been path-dependent, propagating through the LLaMA architecture's influence on subsequent open models.

## Key References

- Dauphin, Y., et al. (2017). Language modeling with gated convolutional networks. *ICML*.
- Ramachandran, P., Zoph, B., & Le, Q. V. (2017). Searching for activation functions. *arXiv:1710.05941*.
- Shazeer, N. (2020). GLU variants improve transformer. *arXiv:2002.05202*.
- Touvron, H., et al. (2023). LLaMA: Open and efficient foundation language models. *arXiv:2302.13971*.
- Elhage, N., et al. (2022). Toy models of superposition. *Anthropic*.
- Liu, Z., et al. (2023). Deja Vu: Contextual sparsity for efficient LLMs at inference time. *ICML*.
