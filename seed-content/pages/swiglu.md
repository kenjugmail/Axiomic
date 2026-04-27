---
title: SwiGLU
category: architecture
---
<!-- tier:intro -->

# SwiGLU

Inside a transformer, each layer has two main parts: the [attention mechanism](/wiki/attention) (which lets tokens look at each other) and the **feed-forward network** (which processes each token individually). The feed-forward network is where much of the model's "thinking" happens. **SwiGLU** is a modern upgrade to this feed-forward network that makes transformers more capable.

## The Standard Feed-Forward Network

In the original transformer, the feed-forward network is simple:
1. Take the token's representation (a vector of numbers)
2. Expand it to a wider vector (multiply by 4x)
3. Apply a nonlinear function (ReLU — zero out negative numbers)
4. Shrink it back to the original size

This is like: narrow → wide → activation → narrow.

## What SwiGLU Changes

SwiGLU makes two improvements:

**1. Swish instead of ReLU**: Instead of the harsh ReLU (which completely kills negative values), SwiGLU uses **Swish** (also called SiLU), a smooth curve that allows small negative values through. This helps gradients flow better during training.

**2. A gating mechanism**: This is the clever part. Instead of one wide projection, SwiGLU uses **two** parallel projections. One is the "content" path (what information to process) and the other is the "gate" path (how much of that information to let through). The gate controls the content, element by element.

Think of it like a dimmer switch: the gate can smoothly turn each dimension up or down, letting the model decide what to keep and what to suppress.

## Why Does It Work Better?

The gating mechanism gives the model more control over information flow. Instead of a fixed nonlinearity (like ReLU) that applies the same transformation everywhere, the gate is **learned** and **input-dependent**. The model can learn to selectively amplify or suppress different features based on the specific input.

Empirically, replacing ReLU feed-forward networks with SwiGLU leads to lower training loss — the model learns faster and achieves better performance for the same amount of compute.

## Where Is SwiGLU Used?

Almost every modern large language model:
- **Llama** (all versions)
- **Mistral** and **Mixtral**
- **PaLM** and **Gemma** (Google)
- **Qwen** (Alibaba)

It's one of those improvements that's so universally beneficial that it has essentially replaced the original ReLU feed-forward design.

## Related Topics

- [Attention](/wiki/attention) — the other main component of each transformer layer
- [Residual Connections](/wiki/residual-connections) — how the FFN output connects back to the main path
- [Scaling Laws](/wiki/scaling-laws) — SwiGLU improves the scaling efficiency of transformers

<!-- tier:undergrad -->

# SwiGLU

SwiGLU (Shazeer, 2020) combines the Swish activation function with Gated Linear Units to create a feed-forward network variant that consistently outperforms standard ReLU or GELU alternatives in transformers.

## Background: Gated Linear Units

Dauphin et al. (2017) introduced Gated Linear Units (GLU) as:

$$\text{GLU}(\mathbf{x}) = (\mathbf{x}\mathbf{W}_1 + \mathbf{b}_1) \otimes \sigma(\mathbf{x}\mathbf{W}_2 + \mathbf{b}_2)$$

where $\otimes$ is element-wise multiplication and $\sigma$ is the sigmoid function. The key idea: one linear projection provides the "content" and another provides the "gate" (passed through sigmoid to produce values in $[0, 1]$).

## SwiGLU Definition

SwiGLU replaces the sigmoid gate with the Swish (SiLU) function:

$$\text{Swish}(x) = x \cdot \sigma(x) = \frac{x}{1 + e^{-x}}$$

The full SwiGLU feed-forward block:

$$\text{SwiGLU}(\mathbf{x}) = (\text{Swish}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2) \mathbf{W}_3$$

where:
- $\mathbf{W}_1 \in \mathbb{R}^{d \times d_{\text{ff}}}$ — gate projection
- $\mathbf{W}_2 \in \mathbb{R}^{d \times d_{\text{ff}}}$ — content projection  
- $\mathbf{W}_3 \in \mathbb{R}^{d_{\text{ff}} \times d}$ — output projection

## Parameter Count Comparison

The standard FFN has two matrices: $\mathbf{W}_1 \in \mathbb{R}^{d \times 4d}$ and $\mathbf{W}_2 \in \mathbb{R}^{4d \times d}$, totaling $8d^2$ parameters.

SwiGLU has three matrices. To keep the parameter count roughly equal, $d_{\text{ff}}$ is reduced from $4d$ to $\frac{8d}{3}$ (often rounded to a multiple of 256 for hardware efficiency):

$$\text{SwiGLU params} = d \cdot d_{\text{ff}} + d \cdot d_{\text{ff}} + d_{\text{ff}} \cdot d = 3d \cdot d_{\text{ff}} \approx 3d \cdot \frac{8d}{3} = 8d^2$$

In Llama models, $d_{\text{ff}}$ is set to $\frac{8d}{3}$ rounded up to the nearest multiple of 256.

## Comparing Activation Variants

Shazeer (2020) systematically compared GLU variants by substituting different activations:

| Variant | Gate activation | FFN formula |
|---|---|---|
| GLU | Sigmoid | $(\sigma(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2)\mathbf{W}_3$ |
| ReGLU | ReLU | $(\text{ReLU}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2)\mathbf{W}_3$ |
| GEGLU | GELU | $(\text{GELU}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2)\mathbf{W}_3$ |
| SwiGLU | Swish | $(\text{Swish}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2)\mathbf{W}_3$ |

SwiGLU and GEGLU consistently achieve the lowest perplexity, with SwiGLU having a slight edge.

## Code Example

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class SwiGLUFFN(nn.Module):
    def __init__(self, d_model: int, d_ff: int = None):
        super().__init__()
        # Default: 8/3 * d_model, rounded to multiple of 256
        if d_ff is None:
            d_ff = int(8 * d_model / 3)
            d_ff = 256 * ((d_ff + 255) // 256)  # round up
        
        self.w_gate = nn.Linear(d_model, d_ff, bias=False)  # W1: gate
        self.w_up = nn.Linear(d_model, d_ff, bias=False)    # W2: content
        self.w_down = nn.Linear(d_ff, d_model, bias=False)  # W3: output
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w_down(F.silu(self.w_gate(x)) * self.w_up(x))

class StandardFFN(nn.Module):
    """Standard ReLU FFN for comparison."""
    def __init__(self, d_model: int, d_ff: int = None):
        super().__init__()
        d_ff = d_ff or 4 * d_model
        self.w1 = nn.Linear(d_model, d_ff, bias=False)
        self.w2 = nn.Linear(d_ff, d_model, bias=False)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w2(F.relu(self.w1(x)))

# Compare parameter counts
d = 4096
swiglu = SwiGLUFFN(d)
standard = StandardFFN(d)
print(f"SwiGLU params: {sum(p.numel() for p in swiglu.parameters()):,}")
print(f"Standard FFN params: {sum(p.numel() for p in standard.parameters()):,}")
```

## Why Swish?

The Swish function $f(x) = x \cdot \sigma(x)$ has several desirable properties:

- **Smooth**: Infinitely differentiable, unlike ReLU
- **Non-monotonic**: Has a slight dip below zero near $x \approx -1.28$, allowing small negative values through
- **Self-gated**: Already contains a gating mechanism ($x$ times $\sigma(x)$), which compounds with the explicit GLU gate

## Related Topics

- [Attention](/wiki/attention) — the other half of each transformer layer
- [Grouped Query Attention](/wiki/grouped-query-attention) — another modern transformer optimization
- [Scaling Laws](/wiki/scaling-laws) — SwiGLU shifts the scaling constants

<!-- tier:grad -->

# SwiGLU

SwiGLU (Shazeer, 2020) has become the standard FFN architecture in modern transformers. This section examines why gated activations work, their interaction with training dynamics, and emerging alternatives.

## Theoretical Analysis of Gating

Why does gating help? Several complementary explanations:

**Expressiveness**: GLU variants effectively double the "depth" of the nonlinearity within the FFN. A standard FFN computes $\text{act}(\mathbf{x}\mathbf{W}_1)\mathbf{W}_2$, which is a single nonlinear function. A gated FFN computes $\text{act}(\mathbf{x}\mathbf{W}_1) \otimes (\mathbf{x}\mathbf{W}_2)$, which is a product of two functions — one nonlinear, one linear — giving the overall function higher capacity to approximate complex mappings.

**Gradient flow**: In a standard ReLU FFN, any input that produces a negative pre-activation is completely zeroed out. The gate in GLU variants allows gradients to flow through both the gate and the content paths:

$$\frac{\partial}{\partial \mathbf{x}} [\text{Swish}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2] = \text{Swish}'(\mathbf{x}\mathbf{W}_1)\mathbf{W}_1 \otimes \mathbf{x}\mathbf{W}_2 + \text{Swish}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{W}_2$$

The second term provides a "highway" for gradients even when the gate is partially closed.

**Feature selection**: The gating mechanism enables the FFN to perform input-dependent feature selection. Elhage et al. (2022, "Superposition") showed that gated FFNs exhibit less superposition (overlapping feature representations) than ungated variants, suggesting cleaner internal representations.

## SwiGLU and Mixture of Experts

SwiGLU is the standard FFN within each expert in Mixture-of-Experts models (Mixtral, Switch Transformer). The interaction between gating at two levels — the MoE router gates which expert processes each token, and SwiGLU gates within each expert — creates a hierarchical feature selection mechanism.

Fedus et al. (2022) noted that the expert utilization patterns differ between SwiGLU and ReLU experts: SwiGLU experts tend to specialize more cleanly, with less token overlap between experts. This may be because the intra-expert gating reduces the need for inter-expert redundancy.

## Initialization and Training Dynamics

SwiGLU requires careful initialization due to the multiplicative interaction between the gate and content paths. If both $\mathbf{W}_1$ and $\mathbf{W}_2$ are initialized with the same variance:

$$\text{Var}[\text{Swish}(\mathbf{x}\mathbf{W}_1) \otimes \mathbf{x}\mathbf{W}_2] \approx \text{Var}[\text{Swish}(\mathbf{x}\mathbf{W}_1)] \cdot \text{Var}[\mathbf{x}\mathbf{W}_2]$$

This variance can be too small (product of two sub-unit variances) or exhibit high kurtosis. In practice, implementations follow the approach from PaLM (Chowdhery et al., 2023):
- Initialize $\mathbf{W}_1$ and $\mathbf{W}_2$ with standard Xavier/He initialization
- Scale $\mathbf{W}_3$ by $1/\sqrt{2L}$ where $L$ is the number of layers (depth scaling)

## The $\frac{8}{3}d$ Hidden Dimension

The choice of $d_{\text{ff}} = \frac{8}{3}d$ for parameter-matched SwiGLU is often treated as arbitrary, but it follows from requiring:

$$3 \cdot d \cdot d_{\text{ff}} = 2 \cdot d \cdot 4d$$

i.e., three matrices at size $d \times d_{\text{ff}}$ should match two matrices at size $d \times 4d$. Solving gives $d_{\text{ff}} = \frac{8d}{3}$.

However, recent work suggests this parameter matching may be the wrong target. Touvron et al. (2023) and others have experimented with SwiGLU where $d_{\text{ff}}$ is set independently of the standard FFN size, often choosing values optimized for hardware utilization (multiples of 128 or 256 for tensor core efficiency on NVIDIA GPUs).

## Beyond SwiGLU: Emerging Alternatives

**Squared ReLU** (So et al., 2022): $f(x) = \max(0, x)^2$. Simpler than SwiGLU (no gating), but achieves competitive performance. The squaring amplifies large activations, acting as a soft feature selection mechanism. Used in some PaLM variants.

**JetMoE-style gated FFN** (Shen et al., 2024): Combines SwiGLU with shared experts in an MoE framework, finding that the gating in SwiGLU and MoE routing serve complementary roles.

**KAN (Kolmogorov-Arnold Networks)** (Liu et al., 2024): Replace the fixed activation function entirely with learnable spline-based activations on edges rather than nodes. While not directly replacing SwiGLU in production transformers, KANs represent a fundamentally different approach to nonlinearity in neural networks.

## Sparse Activation in SwiGLU

An underexplored property: SwiGLU naturally produces **sparse activations**. The Swish gate outputs near-zero values for many dimensions, meaning the effective computation in the output projection is sparse. Zhang et al. (2024) showed that ~90% of SwiGLU activations are near-zero for typical inputs, enabling:
- Sparse matrix multiplication for faster inference
- Activation checkpointing strategies that only store non-zero activations
- Pruning of consistently dead dimensions

This natural sparsity contrasts with ReLU, which has exact sparsity (~50% zeros) but less concentration of the non-zero mass.

## Related Topics

- [Grouped Query Attention](/wiki/grouped-query-attention) — complementary architectural optimization
- [Scaling Laws](/wiki/scaling-laws) — how architectural choices affect scaling behavior
- [KV Cache](/wiki/kv-cache) — memory optimization in the attention layer (SwiGLU optimizes the FFN layer)
