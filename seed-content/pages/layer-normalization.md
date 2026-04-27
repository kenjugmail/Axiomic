---
title: Layer Normalization
category: architecture
---
<!-- tier:intro -->
# Layer Normalization

Training deep neural networks is hard. As data flows through dozens or hundreds of layers, the numbers can grow wildly large or shrink to near-zero. This makes learning unstable -- the model oscillates or fails to converge. **Normalization** techniques fix this by keeping the numbers in a reasonable range at every layer.

## What Layer Normalization Does

Layer normalization (LayerNorm) takes the activations at each layer and rescales them so they have a mean of 0 and a standard deviation of 1. Think of it like standardizing test scores: no matter how the raw numbers look, after normalization they're centered and spread out in a consistent way.

After normalizing, LayerNorm applies two learnable parameters -- a scale ($\gamma$) and a shift ($\beta$) -- that let the model adjust the normalization if needed. These are like saying "okay, we'll standardize first, but then the model can decide to shift or stretch the distribution if that helps."

## LayerNorm vs. BatchNorm

You might have heard of **Batch Normalization (BatchNorm)**, which was invented first (2015) and is widely used in image models. The key difference:

- **BatchNorm** normalizes across the **batch dimension** -- it looks at the same feature across all examples in a mini-batch. It computes "how does feature #47 behave across all 64 examples in this batch?"
- **LayerNorm** normalizes across the **feature dimension** -- it looks at all features within a single example. It computes "how do all 768 features behave for this one example?"

For transformers, LayerNorm is the clear winner because:
1. It works identically for single examples (batch size 1), which matters during inference.
2. It doesn't depend on batch size, making it simpler and more stable.
3. It handles variable-length sequences naturally.

## Where LayerNorm Appears in Transformers

LayerNorm appears after (or before) every major sub-layer in the transformer:
- After [multi-head attention](/wiki/multi-head-attention)
- After the [feed-forward network](/wiki/feed-forward-networks)

Combined with residual connections (skip connections that add the input back to the output), this creates the pattern:

**output = LayerNorm(input + SubLayer(input))**

This "normalize after adding" pattern is what keeps transformers stable enough to stack 100+ layers deep.

## Pre-Norm vs. Post-Norm

There are actually two ways to arrange the normalization:
- **Post-norm** (original Transformer): Normalize *after* adding the residual. `output = LayerNorm(x + Attention(x))`
- **Pre-norm** (GPT-2 and most modern models): Normalize *before* the sub-layer. `output = x + Attention(LayerNorm(x))`

Pre-norm is more stable during training and is what almost all modern large language models use. Post-norm can achieve slightly better final quality but is harder to train without careful learning rate warmup.

<!-- tier:undergrad -->
# Layer Normalization

## Definition

Given an input vector $\mathbf{x} \in \mathbb{R}^d$, Layer Normalization (Ba et al., 2016) computes:

$$\text{LayerNorm}(\mathbf{x}) = \gamma \odot \frac{\mathbf{x} - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta$$

where:
- $\mu = \frac{1}{d}\sum_{i=1}^d x_i$ (mean across features)
- $\sigma^2 = \frac{1}{d}\sum_{i=1}^d (x_i - \mu)^2$ (variance across features)
- $\gamma, \beta \in \mathbb{R}^d$ are learnable scale and shift parameters
- $\epsilon$ is a small constant (typically $10^{-5}$) for numerical stability
- $\odot$ is element-wise multiplication

## Comparison with Batch Normalization

| Property | BatchNorm | LayerNorm |
|----------|-----------|-----------|
| Normalizes across | Batch dimension | Feature dimension |
| Statistics | $\mu, \sigma^2$ over batch | $\mu, \sigma^2$ over features |
| Inference | Requires running statistics | Same as training |
| Batch size dependence | Yes | No |
| Learnable params | $\gamma, \beta \in \mathbb{R}^d$ | $\gamma, \beta \in \mathbb{R}^d$ |

For an input tensor of shape (batch, seq_len, d_model):
- BatchNorm normalizes over (batch, seq_len) for each of the d_model features
- LayerNorm normalizes over d_model for each (batch, seq_len) position

## Pre-Norm vs. Post-Norm

**Post-Norm** (Vaswani et al., 2017):
$$\mathbf{x}' = \text{LayerNorm}(\mathbf{x} + \text{Attention}(\mathbf{x}))$$
$$\mathbf{x}'' = \text{LayerNorm}(\mathbf{x}' + \text{FFN}(\mathbf{x}'))$$

**Pre-Norm** (used in GPT-2, LLaMA, most modern LLMs):
$$\mathbf{x}' = \mathbf{x} + \text{Attention}(\text{LayerNorm}(\mathbf{x}))$$
$$\mathbf{x}'' = \mathbf{x}' + \text{FFN}(\text{LayerNorm}(\mathbf{x}'))$$

Pre-norm has the important property that the residual stream flows through an **identity path** without any normalization. This means gradients can flow directly from the output to any layer without attenuation, similar to the benefit of skip connections in ResNets.

## RMSNorm

Zhang and Sennrich (2019) proposed **RMSNorm**, which drops the mean-centering:

$$\text{RMSNorm}(\mathbf{x}) = \gamma \odot \frac{\mathbf{x}}{\text{RMS}(\mathbf{x}) + \epsilon}, \quad \text{RMS}(\mathbf{x}) = \sqrt{\frac{1}{d}\sum_{i=1}^d x_i^2}$$

RMSNorm is simpler (no mean computation, no $\beta$ parameter), ~10-15% faster, and empirically performs equally well. It's used in LLaMA, Mistral, PaLM, and most modern LLMs.

## PyTorch Implementation

```python
import torch
import torch.nn as nn

class LayerNorm(nn.Module):
    """Standard Layer Normalization."""
    def __init__(self, d_model: int, eps: float = 1e-5):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(d_model))
        self.beta = nn.Parameter(torch.zeros(d_model))
        self.eps = eps

    def forward(self, x):
        mean = x.mean(dim=-1, keepdim=True)
        var = x.var(dim=-1, keepdim=True, unbiased=False)
        x_norm = (x - mean) / torch.sqrt(var + self.eps)
        return self.gamma * x_norm + self.beta

class RMSNorm(nn.Module):
    """Root Mean Square Layer Normalization."""
    def __init__(self, d_model: int, eps: float = 1e-6):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(d_model))
        self.eps = eps

    def forward(self, x):
        rms = torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + self.eps)
        return x / rms * self.weight

# Pre-norm transformer block
class PreNormBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super().__init__()
        self.norm1 = RMSNorm(d_model)
        self.norm2 = RMSNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Linear(d_ff, d_model),
        )

    def forward(self, x):
        x = x + self.attn(self.norm1(x), self.norm1(x), self.norm1(x))[0]
        x = x + self.ffn(self.norm2(x))
        return x

# Post-norm transformer block (original Transformer style)
class PostNormBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Linear(d_ff, d_model),
        )

    def forward(self, x):
        x = self.norm1(x + self.attn(x, x, x)[0])
        x = self.norm2(x + self.ffn(x))
        return x
```

<!-- tier:grad -->
# Layer Normalization

## Gradient Analysis: Pre-Norm vs. Post-Norm

The gradient behavior fundamentally differs between the two arrangements. For a pre-norm network with $L$ layers, the gradient of the loss with respect to layer $l$'s input is:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{x}_l} = \frac{\partial \mathcal{L}}{\partial \mathbf{x}_L} \prod_{i=l}^{L-1} \left(\mathbf{I} + \frac{\partial f_i(\text{Norm}(\mathbf{x}_i))}{\partial \mathbf{x}_i}\right)$$

The identity term $\mathbf{I}$ ensures gradient flow even if the other term vanishes -- this is the "gradient highway" that makes pre-norm training stable.

For post-norm, the gradient must pass through the normalization:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{x}_l} = \frac{\partial \mathcal{L}}{\partial \mathbf{x}_L} \prod_{i=l}^{L-1} \frac{\partial \text{Norm}(\mathbf{x}_i + f_i(\mathbf{x}_i))}{\partial \mathbf{x}_i}$$

The normalization Jacobian introduces coupling between all gradient components, potentially causing instability. Xiong et al. (2020) formally showed that post-norm gradient magnitudes grow with depth at initialization, requiring careful warmup.

## The Quality Gap: Post-Norm vs. Pre-Norm

Despite stability challenges, post-norm often achieves slightly better final quality. Liu et al. (2020, "Understanding the Difficulty of Training Transformers") analyzed this and found that post-norm has a beneficial regularization effect: the normalization after addition constrains the output magnitude, acting as an implicit regularizer.

Several approaches attempt to get the best of both:

**Admin** (Liu et al., 2020): Uses a learned interpolation that starts as pre-norm (for stability) and transitions toward post-norm during training.

**DeepNorm** (Wang et al., 2022): Scales the residual connection by a constant $\alpha > 1$:

$$\mathbf{x}_{l+1} = \text{LayerNorm}(\alpha \mathbf{x}_l + f(\mathbf{x}_l))$$

with specific initialization $\beta$ for sub-layer weights. They show this enables stable training of 1000-layer post-norm transformers. For a transformer with $L$ layers:

$$\alpha = (2L)^{1/4}, \quad \beta = (8L)^{-1/4}$$

## Where to Place the Final Norm

In pre-norm architectures, a final normalization is applied after the last layer but before the output projection:

$$\text{logits} = \text{Norm}(\mathbf{x}_L) \mathbf{W}_{\text{out}}$$

This is critical: without it, the final layer's output has unbounded scale, causing training instability. This final norm is sometimes called the "output norm" and is present in GPT-2, LLaMA, and all pre-norm models.

## QK-Norm and Other Targeted Normalizations

Beyond the standard layer norm positions, normalization is applied at other points in modern architectures:

**QK-Norm** (Dehghani et al., 2023): Apply LayerNorm to queries and keys before computing attention scores:

$$\text{Attn} = \text{softmax}\left(\frac{\text{Norm}(\mathbf{Q}) \cdot \text{Norm}(\mathbf{K})^\top}{\sqrt{d_k}}\right) \mathbf{V}$$

This prevents attention logit growth, which Dehghani et al. identified as a primary cause of training instability at large scale. Without QK-norm, attention logits can grow proportionally to model depth, causing [softmax](/wiki/softmax) saturation and gradient vanishing.

**Sub-LayerNorm** (Wang et al., 2022): Additional norms inside the attention computation, normalizing after the projection but before computing scores.

## Normalization and the Residual Stream

From the [mechanistic interpretability](/wiki/interpretability) perspective (Elhage et al., 2021), the residual stream is the central object: layers read from and write to it. Normalization affects this picture:

- **Pre-norm:** Each layer reads a normalized version of the residual stream but writes its unnormalized output. The residual stream itself is never normalized, so its norm grows with depth.
- **Post-norm:** The residual stream is normalized after each write. This constrains the stream's norm but creates complex interactions between layers.

Brody et al. (2023) showed that the growing norm of the residual stream in pre-norm models creates a "length-dependent bias" where later layers have diminishing relative contribution (their writes are small compared to the accumulated stream). This may explain why the last few layers in very deep models often have minimal impact.

## Spectral Properties

LayerNorm projects onto a $(d-1)$-dimensional hyperplane (subtracting the mean removes one degree of freedom) and then scales to the unit hypersphere. This has consequences:

1. The effective dimensionality is $d - 1$, not $d$
2. Two inputs that differ only in scale and bias are mapped to the same output
3. The Jacobian has rank $d - 1$ (the all-ones direction is in the null space)

RMSNorm only normalizes by the scale (no mean subtraction), preserving the full $d$-dimensional space and the direction of the input vector. This may explain its slightly different (sometimes better) training dynamics.

## Normalization-Free Architectures

Several works explore removing normalization entirely:

- **Fixup Init** (Zhang et al., 2019): Careful initialization ($1/\sqrt{L}$ scaling of residual branches) eliminates the need for normalization in ResNets. Adapting this to transformers has had limited success.
- **NF-Nets** (Brock et al., 2021): Normalization-free vision transformers using adaptive gradient clipping. Competitive with normalized models but not widely adopted for language.
- **Signal Propagation** approaches: Initialize weights so that forward signal and backward gradient magnitudes are preserved, reducing normalization's role.

In practice, normalization remains universal in language models, with the trend firmly toward RMSNorm in pre-norm position.

### Key References

- Ba et al. (2016). "Layer Normalization." arXiv:1607.06450.
- Xiong et al. (2020). "On Layer Normalization in the Transformer Architecture." ICML.
- Zhang and Sennrich (2019). "Root Mean Square Layer Normalization." NeurIPS.
- Wang et al. (2022). "DeepNet: Scaling Transformers to 1,000 Layers." arXiv:2203.00555.
- Dehghani et al. (2023). "Scaling Vision Transformers to 22 Billion Parameters." ICML.
- Brody et al. (2023). "On the Expressivity Role of LayerNorm in Transformers' Attention." ACL.
