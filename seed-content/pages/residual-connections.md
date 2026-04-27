---
title: Residual Connections
category: architecture
---
<!-- tier:intro -->

# Residual Connections

Imagine you're whispering a message through a long chain of people. By the time it reaches the end, it's garbled beyond recognition. Deep neural networks face exactly this problem: information gets distorted as it passes through dozens or hundreds of layers. **Residual connections** (also called skip connections) are an elegantly simple fix.

## The Core Idea

Instead of each layer completely transforming its input into something new, a residual connection lets the original input "skip over" the layer and get added back to the output:

```
output = layer(input) + input
```

That's it. The layer only needs to learn what to *change* about the input (the "residual"), not reconstruct the entire representation from scratch. If a layer has nothing useful to contribute, it can simply learn to output zeros, and the input passes through unchanged.

## Why This Matters

Without residual connections, training deep networks is extremely difficult for two reasons:

**1. The vanishing gradient problem.** When training a neural network, we compute how much each layer contributed to the final error (using a process called backpropagation). In a deep network without skip connections, this signal gets multiplied through every layer on its way back. If those multipliers are small (less than 1), the signal shrinks exponentially. By the time it reaches the early layers, it's essentially zero -- those layers stop learning.

Residual connections provide a "gradient highway." Because the input is added directly to the output, gradients can flow straight back through the addition operation, bypassing the layers entirely if needed.

**2. The degradation problem.** You'd expect a deeper network to always perform at least as well as a shallower one (it could just learn identity mappings for the extra layers). But in practice, deeper plain networks often perform *worse*. Residual connections fix this by making identity mappings the default -- layers start by doing nothing and gradually learn useful transformations.

## Residual Connections in Transformers

In a [transformer block](/wiki/transformer-block), residual connections wrap around every major sub-layer:

1. The input goes into multi-head attention, and the attention output is **added back to the input**
2. That sum goes into the feed-forward network, and the FFN output is **added back to its input**

Each addition is followed by [layer normalization](/wiki/layer-normalization), which keeps the numbers at a manageable scale.

Without residual connections, transformers simply would not work at the depths used in modern models (GPT-4 has 120 layers, for example). They are not optional -- they are structurally essential.

## An Analogy

Think of residual connections like a note-taking system. Instead of trying to rewrite your entire understanding of a topic every time you learn something new, you keep your existing notes and just add annotations. Each layer is adding marginal refinements to a representation that accumulates through the network.

## Related Topics

- [Transformer Block](/wiki/transformer-block) -- where residual connections fit in the architecture
- [Layer Normalization](/wiki/layer-normalization) -- the partner operation that stabilizes residual streams
- [Attention](/wiki/attention) -- one of the sub-layers wrapped by residual connections

<!-- tier:undergrad -->

# Residual Connections

Residual connections, introduced by He et al. (2016) in ResNet, are identity shortcut connections that add a layer's input directly to its output. They are a foundational component of transformer architectures.

## Mathematical Formulation

Given a sub-layer function $F(\mathbf{x})$, a residual connection computes:

$$\mathbf{y} = F(\mathbf{x}) + \mathbf{x}$$

where $\mathbf{x}, \mathbf{y} \in \mathbb{R}^d$. Note that $F(\mathbf{x})$ and $\mathbf{x}$ must have the same dimensionality for the addition to work. This is why all sub-layers in a transformer produce outputs of the same dimension $d_{\text{model}}$.

In the original transformer (Vaswani et al., 2017), each sub-layer output is:

$$\mathbf{y} = \text{LayerNorm}(\mathbf{x} + F(\mathbf{x}))$$

This is called **Post-Norm**. An increasingly popular variant is **Pre-Norm**:

$$\mathbf{y} = \mathbf{x} + F(\text{LayerNorm}(\mathbf{x}))$$

## Gradient Flow Analysis

Consider a network with $L$ residual blocks. The output at layer $l$ is:

$$\mathbf{x}_l = \mathbf{x}_{l-1} + F_l(\mathbf{x}_{l-1})$$

By unrolling the recursion from layer $0$ to layer $L$:

$$\mathbf{x}_L = \mathbf{x}_0 + \sum_{l=1}^{L} F_l(\mathbf{x}_{l-1})$$

Taking the gradient of a loss $\mathcal{L}$ with respect to an early layer $\mathbf{x}_k$:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{x}_k} = \frac{\partial \mathcal{L}}{\partial \mathbf{x}_L} \cdot \frac{\partial \mathbf{x}_L}{\partial \mathbf{x}_k} = \frac{\partial \mathcal{L}}{\partial \mathbf{x}_L} \left( \mathbf{I} + \frac{\partial}{\partial \mathbf{x}_k} \sum_{l=k+1}^{L} F_l(\mathbf{x}_{l-1}) \right)$$

The key term is the identity matrix $\mathbf{I}$. Even if the second term vanishes, the gradient $\frac{\partial \mathcal{L}}{\partial \mathbf{x}_L}$ still flows directly to layer $k$ through the identity path. This is the **gradient highway** that prevents vanishing gradients.

## The Residual Stream View

A powerful mental model (popularized by the [interpretability](/wiki/interpretability) community) is the **residual stream**. The sequence of residual additions means each layer *reads from* and *writes to* a shared communication channel:

$$\mathbf{x}_L = \mathbf{x}_0 + \underbrace{F_1(\mathbf{x}_0)}_{\text{layer 1 writes}} + \underbrace{F_2(\mathbf{x}_1)}_{\text{layer 2 writes}} + \cdots + \underbrace{F_L(\mathbf{x}_{L-1})}_{\text{layer } L \text{ writes}}$$

Each attention head and FFN layer reads from the current stream and adds its contribution. This view is central to mechanistic interpretability.

## Pre-Norm vs. Post-Norm

| Variant | Formula | Training Stability | Final Performance |
|---|---|---|---|
| Post-Norm | $\text{LN}(\mathbf{x} + F(\mathbf{x}))$ | Less stable | Slightly better (when it converges) |
| Pre-Norm | $\mathbf{x} + F(\text{LN}(\mathbf{x}))$ | More stable | Slightly worse |

Pre-Norm models are easier to train because the residual path is completely clean (no normalization on the skip path). Post-Norm concentrates the gradient in the residual path, which can cause instability but also acts as an implicit regularizer.

## PyTorch Implementation

```python
import torch
import torch.nn as nn

class ResidualBlock(nn.Module):
    """A single residual sub-layer with Pre-Norm."""
    def __init__(self, d_model: int, sublayer: nn.Module, dropout: float = 0.1):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.sublayer = sublayer
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, **kwargs) -> torch.Tensor:
        # Pre-Norm: normalize before the sub-layer
        return x + self.dropout(self.sublayer(self.norm(x), **kwargs))
```

## Related Topics

- [Transformer Block](/wiki/transformer-block) -- the full block that uses residual connections
- [Layer Normalization](/wiki/layer-normalization) -- normalization applied with residual connections
- [Training Objectives](/wiki/training-objectives) -- loss functions that drive gradient flow through residuals

<!-- tier:grad -->

# Residual Connections

Residual connections are far more than a gradient-flow trick. Recent theoretical and empirical work has revealed deep connections between skip connections, optimization geometry, and emergent model behavior.

## Signal Propagation Theory

Hayou et al. (2021) analyzed residual networks through the lens of mean field theory. At initialization, the covariance of activations between two inputs $\mathbf{x}^1, \mathbf{x}^2$ evolves across layers. Without residual connections, this covariance converges to a fixed point exponentially fast, meaning all inputs become indistinguishable in deep layers -- the **rank collapse** problem.

With residual connections and appropriate initialization, the covariance kernel remains non-degenerate, preserving the ability of deep layers to distinguish different inputs. The condition for healthy signal propagation in a residual network with variance $\sigma^2_w$ for weights is:

$$\sigma^2_w = \frac{2}{d} \cdot \frac{1}{L}$$

where $L$ is the depth. This $1/L$ scaling was later adopted in practice (e.g., GPT-3 scales residual layer outputs by $\frac{1}{\sqrt{2L}}$).

## Initialization and Scaling Strategies

Different scaling strategies for the residual branch have significant effects:

**Fixup initialization** (Zhang et al., 2019): Scale residual branches by $L^{-1/(2m-2)}$ where $m$ is the number of layers per block, allowing training without normalization layers.

**DeepNet** (Wang et al., 2022): Uses a depth-dependent scaling factor $\alpha = (2L)^{1/4}$ on the residual path and $(8L)^{-1/4}$ on sub-layer outputs, enabling stable training of transformers with 1,000+ layers.

**$\mu$P** (Yang & Hu, 2022): Derives the optimal scaling of all model components (including residual branches) from first principles using a maximal update parameterization, enabling hyperparameter transfer across model scales.

## The Residual Stream as a Communication Bus

Elhage et al. (2021) formalized the **residual stream** interpretation in "A Mathematical Framework for Transformer Circuits." Key insights:

1. **Superposition**: The residual stream has fixed dimension $d_{\text{model}}$ but must carry information for all downstream layers. Layers encode information in superposition -- representing more features than dimensions by exploiting approximate orthogonality in high-dimensional spaces.

2. **Virtual attention heads**: Because attention heads read from and write to the residual stream, compositions of heads across layers can implement computations not possible in any single layer. An "induction head" (layers $l_1$ and $l_2$ where $l_1 < l_2$) requires information to flow through the residual stream between the two heads.

3. **Residual stream bandwidth**: The $d_{\text{model}}$ dimension acts as a bottleneck. Scaling laws suggest increasing $d_{\text{model}}$ has higher returns than increasing depth beyond a certain point, consistent with the residual stream being a bandwidth-limited channel.

## Pre-Norm vs. Post-Norm: Deeper Analysis

Xiong et al. (2020) provided a theoretical explanation for Post-Norm instability. At initialization, the expected gradient norm for Post-Norm grows as $O(L \cdot d \cdot \ln d)$ at the output but is $O(d \cdot \ln d)$ at early layers. This $L$-factor gap causes the learning rate that works for final layers to be too large for early layers.

For Pre-Norm, the gradient norm is $O(d \cdot \ln d)$ at all layers, explaining its stability. However, Liu et al. (2020) showed that Pre-Norm effectively reduces the model's representational depth -- the "effective depth" of a Pre-Norm transformer can be much less than its actual depth, as later layers tend to contribute less.

**Admin** (Liu et al., 2020) and **Sandwich normalization** attempt to combine the stability of Pre-Norm with the performance of Post-Norm by using adaptive or mixed normalization strategies.

## Residual Connections and Loss Landscape

Li et al. (2018) visualized the loss landscapes of networks with and without residual connections. Key finding: residual connections dramatically smooth the loss landscape, eliminating sharp local minima and creating wide, flat basins. This smoothness:

- Makes the optimization problem easier (SGD with momentum can find good solutions)
- Correlates with better generalization (flat minima generalize better per Hochreiter & Schmidhuber, 1997)
- Explains why residual networks are less sensitive to learning rate choice

## Sub-Layer Scaling in Practice

Modern large language models use various strategies to manage the residual stream:

| Model | Strategy |
|---|---|
| GPT-3 | Scale residual layer outputs by $1/\sqrt{2L}$ |
| PaLM | Separate scaling for attention and FFN outputs |
| LLaMA | RMSNorm Pre-Norm, no output scaling |
| DeepSeek-V2 | Per-layer learnable scaling factors |

The trend is toward simpler schemes (Pre-Norm + RMSNorm) with careful initialization, as these are more robust across scales.

## Related Topics

- [Transformer Block](/wiki/transformer-block) -- the full architecture using residual connections
- [Scaling Laws](/wiki/scaling-laws) -- how depth/width trade-offs interact with residual stream capacity
- [Interpretability](/wiki/interpretability) -- the residual stream as a lens for understanding model internals
