---
title: Layer Normalization
category: architecture
---
<!-- tier:intro -->
# Layer Normalization

Deep neural networks learn by adjusting millions of parameters, layer by layer. But as data flows through dozens or hundreds of layers, the numbers can drift wildly -- growing huge in some dimensions and tiny in others. This makes training unstable and slow. **Layer normalization** (LayerNorm) is a technique that keeps these numbers well-behaved by standardizing them at every layer.

## The Core Idea

Imagine you have a group of students taking different exams. One exam is scored out of 100 and another out of 1000. You cannot meaningfully compare or combine raw scores. The fix is simple: for each exam, subtract the average and divide by the spread (standard deviation). Now both are on the same scale.

Layer normalization does exactly this, but for the activations inside a neural network. At each layer, for each individual input in the batch, it:

1. Computes the mean of all activation values across the features.
2. Computes the standard deviation.
3. Subtracts the mean and divides by the standard deviation.
4. Applies a learned scale and shift, so the network can undo the normalization if that turns out to be useful.

## Why Not Batch Normalization?

An older technique called batch normalization does something similar but computes statistics across the **batch** (all the different inputs being processed simultaneously). This works well for images but poorly for language, where sequences have different lengths and the concept of "batch statistics" is less meaningful. Layer normalization computes statistics independently for each input, making it a natural fit for transformers and sequence models.

## Where It Appears in Transformers

In a [transformer block](/wiki/transformer-block), layer normalization appears in two key positions. In the original "Post-Norm" design (Vaswani et al., 2017), it comes after the [attention](/wiki/attention) and [feed-forward](/wiki/feed-forward-networks) sublayers. Most modern models use "Pre-Norm," where layer normalization comes before each sublayer. Pre-Norm tends to be more stable during training, especially for very deep models.

## The Effect

Without layer normalization, training large transformers is essentially impossible. Gradients either explode (grow exponentially) or vanish (shrink to zero) as they flow backward through many layers. Layer normalization tames this by ensuring that activations stay in a consistent range, which keeps gradients healthy and learning stable.

It is one of those components that is easy to overlook -- it has no attention heads, no learned query-key interactions -- but remove it and the whole system falls apart.

<!-- tier:undergrad -->
# Layer Normalization

## Definition

Layer normalization (Ba, Kiefer & Hinton, 2016) normalizes activations across the feature dimension. Given an input vector $\mathbf{x} \in \mathbb{R}^d$ (a single token's representation), LayerNorm computes:

$$
\text{LayerNorm}(\mathbf{x}) = \boldsymbol{\gamma} \odot \frac{\mathbf{x} - \mu}{\sigma + \epsilon} + \boldsymbol{\beta}
$$

where:
- $\mu = \frac{1}{d} \sum_{i=1}^d x_i$ is the mean over the feature dimension
- $\sigma = \sqrt{\frac{1}{d} \sum_{i=1}^d (x_i - \mu)^2}$ is the standard deviation
- $\boldsymbol{\gamma}, \boldsymbol{\beta} \in \mathbb{R}^d$ are learnable scale and shift parameters
- $\epsilon$ is a small constant (typically $10^{-5}$) for numerical stability
- $\odot$ denotes element-wise multiplication

## Pre-Norm vs. Post-Norm

In the original transformer (Vaswani et al., 2017), LayerNorm is applied **after** the residual addition (Post-Norm):

$$
\mathbf{h} = \text{LayerNorm}(\mathbf{x} + \text{Sublayer}(\mathbf{x}))
$$

Modern architectures (GPT-2 onward) use Pre-Norm, applying LayerNorm **before** the sublayer:

$$
\mathbf{h} = \mathbf{x} + \text{Sublayer}(\text{LayerNorm}(\mathbf{x}))
$$

Pre-Norm provides a clean residual path from input to output: the gradient flows through the addition unimpeded, with LayerNorm only affecting the branch. This significantly improves gradient flow and training stability for deep models.

## Implementation

```python
import torch
import torch.nn as nn

class LayerNorm(nn.Module):
    def __init__(self, d_model: int, eps: float = 1e-5):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(d_model))
        self.beta = nn.Parameter(torch.zeros(d_model))
        self.eps = eps

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, seq_len, d_model)
        mean = x.mean(dim=-1, keepdim=True)
        var = x.var(dim=-1, keepdim=True, unbiased=False)
        x_norm = (x - mean) / torch.sqrt(var + self.eps)
        return self.gamma * x_norm + self.beta

# Equivalent to PyTorch built-in:
layer_norm = nn.LayerNorm(d_model, eps=1e-5)
```

## RMSNorm

RMSNorm (Zhang & Sennrich, 2019) simplifies LayerNorm by removing the mean-centering step and the bias term:

$$
\text{RMSNorm}(\mathbf{x}) = \boldsymbol{\gamma} \odot \frac{\mathbf{x}}{\text{RMS}(\mathbf{x}) + \epsilon}, \quad \text{RMS}(\mathbf{x}) = \sqrt{\frac{1}{d} \sum_{i=1}^d x_i^2}
$$

This is computationally cheaper (no mean computation, no bias parameter) and has been adopted by LLaMA, Mistral, and other modern architectures. Empirically, the mean-centering step contributes little, and the root-mean-square alone provides sufficient normalization.

```python
class RMSNorm(nn.Module):
    def __init__(self, d_model: int, eps: float = 1e-6):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(d_model))
        self.eps = eps

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        rms = torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + self.eps)
        return self.gamma * (x / rms)
```

## Jacobian Analysis

The Jacobian of LayerNorm with respect to input $\mathbf{x}$ is:

$$
\frac{\partial \text{LayerNorm}(\mathbf{x})}{\partial \mathbf{x}} = \frac{\boldsymbol{\gamma}}{\sigma + \epsilon} \left( \mathbf{I} - \frac{1}{d}\mathbf{1}\mathbf{1}^\top - \frac{\hat{\mathbf{x}}\hat{\mathbf{x}}^\top}{d} \right)
$$

where $\hat{\mathbf{x}} = (\mathbf{x} - \mu) / (\sigma + \epsilon)$. This is a projection matrix that removes the mean component and the component along the normalized direction, ensuring the output lives on a $(d-2)$-dimensional manifold within $\mathbb{R}^d$.

<!-- tier:grad -->
# Layer Normalization

## Gradient Flow Analysis

Xiong et al. (2020) provided a theoretical analysis of why Pre-Norm transformers train more stably. In a Post-Norm transformer with $L$ layers, the gradient of the loss with respect to the input of layer $l$ involves a product of $L - l$ Jacobians. Each Jacobian passes through a LayerNorm, which can amplify or attenuate gradient norms. In Pre-Norm, the residual connection provides a direct additive path:

$$
\mathbf{x}_L = \mathbf{x}_0 + \sum_{l=1}^{L} f_l(\text{LN}(\mathbf{x}_{l-1}))
$$

The gradient with respect to $\mathbf{x}_0$ contains an identity term plus correction terms, preventing vanishing gradients even for very deep networks.

However, Takase et al. (2023) observed that Pre-Norm can lead to **representation collapse** in very deep models: the sublayer contributions become negligible relative to the residual, and deeper layers effectively become no-ops. This motivates alternatives like DeepNorm.

## DeepNorm

DeepNorm (Wang et al., 2022) modifies the residual connection with a constant scaling factor $\alpha$:

$$
\mathbf{x}_{l+1} = \alpha \cdot \mathbf{x}_l + \text{Sublayer}(\text{LN}(\mathbf{x}_l))
$$

with Xavier-style initialization scaled by $\beta$ for sublayer weights. Setting $\alpha = (2L)^{1/4}$ and $\beta = (8L)^{-1/4}$ (for $L$ layers), they prove that the expected gradient norm remains $O(1)$ regardless of depth, enabling stable training of 1000+ layer transformers.

## QK-Norm

Dehghani et al. (2023) discovered that in Vision Transformers and large language models, attention logit growth -- where query-key dot products grow in magnitude during training -- causes training instability. They proposed applying LayerNorm to queries and keys independently before computing attention:

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{\text{LN}(Q) \cdot \text{LN}(K)^\top}{\sqrt{d_k}}\right) V
$$

This bounds the attention logits and prevents entropy collapse (where attention weights become nearly one-hot).

## Normalization-Free Approaches

Brock et al. (2021) showed that normalization layers are not strictly necessary if initialization and activation scaling are carefully controlled. Their Normalizer-Free (NF) approach uses Scaled Weight Standardization and adaptive gradient clipping (AGC):

$$
G_i^{\text{clipped}} = \begin{cases} \lambda \frac{\|W_i\|_F}{\|G_i\|_F} G_i & \text{if } \frac{\|G_i\|_F}{\|W_i\|_F} > \lambda \\ G_i & \text{otherwise} \end{cases}
$$

This achieves competitive performance without any normalization, suggesting that the role of LayerNorm is primarily to control gradient and activation magnitudes rather than to provide an inductive bias.

## Normalization Placement Interactions

Recent work by Takase et al. (2023) and Ding et al. (2024) systematically studied how normalization placement interacts with other architectural choices (activation functions, initialization, learning rate schedules). Key findings include:

1. Pre-Norm with standard initialization leads to an effective learning rate that decreases with depth, explaining why deeper layers contribute less.
2. Post-Norm requires careful warm-up but produces more uniform layer utilization.
3. "Sandwich-Norm" (applying LN both before and after the sublayer) combines benefits of both but adds computational cost.

The consensus in recent architectures (LLaMA 2, Mistral, Gemma) is to use Pre-RMSNorm with careful initialization, accepting the slight underutilization of deeper layers as a worthwhile tradeoff for training stability.

## Key References

- Ba, J. L., Kiefer, J. R., & Hinton, G. E. (2016). Layer normalization. *arXiv:1607.06450*.
- Zhang, B., & Sennrich, R. (2019). Root mean square layer normalization. *NeurIPS*.
- Xiong, R., et al. (2020). On layer normalization in the transformer architecture. *ICML*.
- Wang, H., et al. (2022). DeepNet: Scaling transformers to 1,000 layers. *arXiv:2203.00555*.
- Dehghani, M., et al. (2023). Scaling vision transformers to 22 billion parameters. *ICML*.
- Brock, A., et al. (2021). High-performance large-scale image recognition without normalization. *ICML*.
