---
title: Activation Functions
category: architecture
---
<!-- tier:intro -->
# Activation Functions

An **activation function** is a mathematical function applied to each neuron's output. Without activation functions, a neural network would just be a giant multiplication — no matter how many layers you stack, the result is still a linear transformation. Activation functions add **nonlinearity**, which is what gives neural networks their power.

## Common Activation Functions

**ReLU** (Rectified Linear Unit) — the simplest: if the input is positive, keep it; if negative, output zero. $\text{ReLU}(x) = \max(0, x)$

**GELU** (Gaussian Error Linear Unit) — a smoother version of ReLU that's become the standard in transformers. Instead of a sharp cutoff at zero, it provides a smooth transition.

**SiLU/Swish** — $x \cdot \sigma(x)$ where $\sigma$ is the sigmoid function. Used in many modern architectures.

**[SwiGLU](/wiki/swiglu)** — the current state of the art for transformers. It combines Swish with a gating mechanism.

## Why They Matter

The choice of activation function affects:
- How fast the model trains
- How well gradients flow through deep networks
- The model's representational capacity
- Computation cost (some are cheaper than others)

## Related Topics

- [Feed-Forward Networks](/wiki/feed-forward-networks) — where activations are used in transformers
- [SwiGLU](/wiki/swiglu) — the dominant transformer activation

<!-- tier:undergrad -->
# Activation Functions

## Mathematical Definitions

| Function | Formula | Derivative |
|---|---|---|
| ReLU | $\max(0, x)$ | $\begin{cases} 1 & x > 0 \\ 0 & x \leq 0 \end{cases}$ |
| GELU | $x \cdot \Phi(x)$ where $\Phi$ is the standard normal CDF | $\Phi(x) + x\phi(x)$ |
| SiLU/Swish | $x \cdot \sigma(x)$ | $\sigma(x)(1 + x(1-\sigma(x)))$ |
| Tanh | $\frac{e^x - e^{-x}}{e^x + e^{-x}}$ | $1 - \tanh^2(x)$ |

GELU is often approximated: $\text{GELU}(x) \approx 0.5x(1 + \tanh[\sqrt{2/\pi}(x + 0.044715x^3)])$

```python
import torch
import torch.nn.functional as F

x = torch.randn(32, 768)

relu_out = F.relu(x)
gelu_out = F.gelu(x)
silu_out = F.silu(x)  # Same as swish
```

## The Dying ReLU Problem

ReLU outputs exactly zero for negative inputs. If a neuron's weights drift to produce consistently negative inputs, it becomes permanently "dead" — it outputs zero and receives zero gradients. This is the **dying ReLU problem**.

GELU and SiLU avoid this by allowing small negative outputs, keeping the gradient alive everywhere.

## Related Topics

- [SwiGLU](/wiki/swiglu) — gated variant used in modern transformers
- [Backpropagation](/wiki/backpropagation) — gradient flow through activations

<!-- tier:grad -->
# Activation Functions

## GELU: The Transformer Default

Hendrycks & Gimpel (2016) introduced GELU as $\text{GELU}(x) = x \cdot \Phi(x)$. The intuition: multiply the input by the probability that a standard normal variable exceeds the input. This provides a smooth, stochastic regularization effect during training.

GELU became the standard in BERT, GPT-2, and many subsequent models. The practical approximation used in most implementations avoids evaluating the CDF explicitly.

## SwiGLU and the Gated Activation Revolution

Shazeer (2020) showed that gated variants significantly outperform non-gated activations. The key insight: factoring the activation into a "value" path and a "gate" path allows the network to learn which features to amplify and which to suppress. This multiplicative interaction provides richer representational capacity.

The SwiGLU advantage grows with model size — larger models benefit more from the additional expressivity, which may explain why it wasn't widely adopted earlier when models were smaller.

## Activation Sparsity

ReLU-based activations naturally produce sparse representations (many zeros), which can be exploited for computational savings. Recent work (Zhang et al., 2024) shows that GELU activations in trained models also exhibit significant sparsity, enabling "contextual sparsity" — skipping neurons whose activation would be near-zero.

This connects to the [superposition hypothesis](/wiki/superposition): models pack more features than dimensions by relying on sparse activation patterns.

## Related Topics

- [SwiGLU](/wiki/swiglu) — the dominant modern choice
- [Superposition](/wiki/superposition) — connection to sparse activations
- [Mixture of Experts](/wiki/mixture-of-experts) — extreme form of conditional computation
