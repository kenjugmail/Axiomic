---
title: Backpropagation
category: training
---
<!-- tier:intro -->
# Backpropagation

Training a neural network means adjusting millions (or billions) of parameters so the network's outputs get closer to what we want. But how does the network know which parameters to change, and by how much? The answer is **backpropagation**, short for "backward propagation of errors."

## The Core Idea

Think of a neural network as a long chain of calculations. Data flows in at one end, gets transformed layer by layer, and produces an output at the other end. We compare that output to the desired answer using a **loss function** -- a single number that measures how wrong the network is. A loss of zero means perfect; higher means worse.

The goal of training is to minimize this loss. To do that, we need to know: if I nudge each parameter a tiny bit, does the loss go up or down? This information is called the **gradient** -- it is the slope of the loss with respect to each parameter.

Backpropagation computes these gradients efficiently using the **chain rule** from calculus (see [calculus foundations](/wiki/calculus-foundations) for the full multivariate setup and reverse-mode differentiation). The chain rule says that if you have a chain of functions (which is exactly what a neural network is), the overall rate of change is the product of the individual rates of change at each step.

## Forward and Backward

Training works in two phases:

1. **Forward pass.** Input data flows through the network layer by layer, producing an output and a loss value. Along the way, we save intermediate results (like the output of each layer) because we will need them in the next phase.

2. **Backward pass.** Starting from the loss, we work backward through the network. At each layer, we compute how much that layer's parameters contributed to the error, using the saved intermediate values and the chain rule. Each layer passes the gradient back to the previous layer, like a chain of dominoes falling in reverse.

## A Simple Example

Suppose a tiny network computes $y = w_2 \cdot \text{ReLU}(w_1 \cdot x)$. The chain of operations is: multiply by $w_1$, apply ReLU, multiply by $w_2$. If the output is too high, backpropagation figures out: was it because $w_2$ is too big? Or because $w_1$ made the intermediate value too large? Or both? It assigns blame proportionally by tracing back through the chain.

## Why It Matters

Before backpropagation became practical (Rumelhart, Hinton & Williams, 1986), there was no efficient way to train networks with more than one or two layers. Backpropagation made deep learning possible by providing a way to compute gradients for every parameter in a network, no matter how many layers it has, in roughly the same time as a single forward pass.

Every modern neural network -- from image classifiers to GPT -- is trained using backpropagation. It is arguably the single most important algorithm in all of deep learning.

## Gradient Descent

Once backpropagation has computed the gradients, the network updates its parameters by taking a small step in the direction that reduces the loss. This process -- compute gradients, take a step, repeat -- is called **gradient descent**. The size of each step is controlled by the **learning rate**, a crucial hyperparameter that must be carefully tuned.

<!-- tier:undergrad -->
# Backpropagation

## Mathematical Foundation

Consider a neural network as a composition of functions $f = f_L \circ f_{L-1} \circ \cdots \circ f_1$, where each $f_l$ is parameterized by weights $W_l$. Given input $\mathbf{x}$ and target $\mathbf{y}$, the loss is:

$$
\mathcal{L} = \ell(\hat{\mathbf{y}}, \mathbf{y}), \quad \hat{\mathbf{y}} = f(\mathbf{x})
$$

Backpropagation computes $\frac{\partial \mathcal{L}}{\partial W_l}$ for all $l$ via the chain rule.

## Forward Pass

Denote the output of layer $l$ as $\mathbf{h}_l$, with $\mathbf{h}_0 = \mathbf{x}$:

$$
\mathbf{a}_l = W_l \mathbf{h}_{l-1} + \mathbf{b}_l \quad \text{(pre-activation)}
$$
$$
\mathbf{h}_l = g_l(\mathbf{a}_l) \quad \text{(activation)}
$$

where $g_l$ is the activation function (ReLU, GELU, etc.).

## Backward Pass

Define $\boldsymbol{\delta}_l = \frac{\partial \mathcal{L}}{\partial \mathbf{a}_l}$ as the error signal at layer $l$. Starting from the output layer:

$$
\boldsymbol{\delta}_L = \frac{\partial \mathcal{L}}{\partial \hat{\mathbf{y}}} \odot g_L'(\mathbf{a}_L)
$$

For each layer $l = L-1, \ldots, 1$, the recursion is:

$$
\boldsymbol{\delta}_l = (W_{l+1}^\top \boldsymbol{\delta}_{l+1}) \odot g_l'(\mathbf{a}_l)
$$

The parameter gradients are:

$$
\frac{\partial \mathcal{L}}{\partial W_l} = \boldsymbol{\delta}_l \mathbf{h}_{l-1}^\top, \quad \frac{\partial \mathcal{L}}{\partial \mathbf{b}_l} = \boldsymbol{\delta}_l
$$

## Computational Complexity

The backward pass requires approximately 2x the FLOPs of the forward pass (one matrix-vector product for the gradient w.r.t. the input, another for the gradient w.r.t. the weights). Total training cost per sample is ~3x forward pass cost. Memory is $O(\sum_l |\mathbf{h}_l|)$ for storing activations.

## Implementation with Autograd

Modern frameworks (PyTorch, JAX) implement backpropagation via **automatic differentiation**. Each operation records itself on a computational graph during the forward pass, and `.backward()` traverses this graph in reverse:

```python
import torch
import torch.nn as nn

# Simple 2-layer network
model = nn.Sequential(
    nn.Linear(784, 256),
    nn.ReLU(),
    nn.Linear(256, 10),
)
criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

# Training step
x = torch.randn(32, 784)       # batch of 32 inputs
y = torch.randint(0, 10, (32,)) # labels

# Forward pass
logits = model(x)
loss = criterion(logits, y)

# Backward pass: computes all gradients
loss.backward()

# Parameter update
optimizer.step()
optimizer.zero_grad()

# Inspect gradients
for name, param in model.named_parameters():
    print(f"{name}: grad norm = {param.grad.norm().item():.4f}")
```

## Vanishing and Exploding Gradients

Because the backward pass multiplies Jacobians across layers, gradients can shrink exponentially (vanish) or grow exponentially (explode) in deep networks.

The gradient at layer $l$ involves:

$$
\frac{\partial \mathcal{L}}{\partial \mathbf{h}_l} = \prod_{k=l+1}^{L} \frac{\partial \mathbf{h}_k}{\partial \mathbf{h}_{k-1}} \cdot \frac{\partial \mathcal{L}}{\partial \mathbf{h}_L}
$$

If the spectral norm of each Jacobian $\frac{\partial \mathbf{h}_k}{\partial \mathbf{h}_{k-1}}$ is consistently $< 1$, gradients vanish; if $> 1$, they explode. Key mitigations:

- **[Residual connections](/wiki/residual-connections):** Add an identity path so the Jacobian includes an identity term
- **[Layer normalization](/wiki/layer-normalization):** Stabilizes activation magnitudes
- **Careful initialization:** Xavier (Glorot & Bengio, 2010) or Kaiming (He et al., 2015) initialization
- **Gradient clipping:** Cap gradient norms during training

## Backpropagation Through Time (BPTT)

For recurrent neural networks, backpropagation is unrolled through time steps. A sequence of length $T$ becomes a depth-$T$ network. This makes RNNs especially vulnerable to vanishing gradients, which motivated the development of LSTMs and eventually [transformers](/wiki/transformer-block), where attention provides direct gradient paths across time.

<!-- tier:grad -->
# Backpropagation

## Automatic Differentiation: Forward vs. Reverse Mode

Backpropagation is a specific instance of **reverse-mode automatic differentiation** (AD). Understanding this generalization is essential for modern ML systems.

Given a computation $f : \mathbb{R}^n \to \mathbb{R}^m$ decomposed into elementary operations, AD comes in two modes:

**Forward mode** propagates derivatives alongside the computation. For each input perturbation $\dot{x}_j$, it computes $\dot{y}_i = \frac{\partial y_i}{\partial x_j}$ via Jacobian-vector products (JVPs). Cost: $O(n)$ forward passes for the full Jacobian.

**Reverse mode** propagates adjoint variables backward. For a scalar loss $\mathcal{L}$, it computes all $\frac{\partial \mathcal{L}}{\partial x_j}$ in a single backward pass via vector-Jacobian products (VJPs). Cost: $O(m)$ backward passes.

Since $m = 1$ (scalar loss) and $n$ is enormous (millions of parameters), reverse mode (backpropagation) is $O(n)$ times cheaper than forward mode. This is why we use reverse mode for neural network training.

## Memory-Compute Tradeoffs

### Gradient Checkpointing

Standard backpropagation stores all intermediate activations, requiring $O(L)$ memory for an $L$-layer network. Chen et al. (2016) proposed **gradient checkpointing** (activation recomputation): save activations only at $\sqrt{L}$ evenly-spaced checkpoints. During the backward pass, recompute missing activations from the nearest checkpoint. This reduces memory to $O(\sqrt{L})$ at the cost of one additional forward pass.

For transformers, this is critical. A 70B-parameter model training with sequence length 4096 and batch size 1 would require ~500GB for activations alone without checkpointing.

### Mixed-Precision Training

Micikevicius et al. (2018) showed that training can use FP16 for most operations while maintaining an FP32 "master copy" of weights. The backward pass is particularly sensitive to precision: small gradients can underflow in FP16. **Loss scaling** multiplies the loss by a large factor before the backward pass, then divides gradients by the same factor after, keeping them in the representable FP16 range:

$$
\nabla_{W} \mathcal{L}_{\text{scaled}} = S \cdot \nabla_{W} \mathcal{L}, \quad \text{update: } W \leftarrow W - \eta \cdot \frac{1}{S} \nabla_{W} \mathcal{L}_{\text{scaled}}
$$

BF16 (Brain Float16) relaxes the need for loss scaling by matching FP32's exponent range, and has become the default for LLM training.

## Second-Order Methods and Their Approximations

The gradient $\nabla_W \mathcal{L}$ is a first-order approximation. The Hessian $H = \nabla^2_W \mathcal{L}$ provides curvature information, enabling Newton-style updates:

$$
\Delta W = -H^{-1} \nabla_W \mathcal{L}
$$

For modern networks, the Hessian is intractable ($O(n^2)$ storage for $n$ parameters). Practical approximations include:

**Hessian-vector products** can be computed via backpropagation without forming $H$ explicitly, using Pearlmutter's (1994) R-operator: one forward + one backward pass through a modified computation graph.

**K-FAC** (Martens & Grosse, 2015) approximates the Fisher information matrix (closely related to the Hessian at convergence) as a Kronecker product:

$$
F_l \approx A_{l-1} \otimes G_l
$$

where $A_{l-1} = \mathbb{E}[\mathbf{h}_{l-1}\mathbf{h}_{l-1}^\top]$ and $G_l = \mathbb{E}[\boldsymbol{\delta}_l \boldsymbol{\delta}_l^\top]$. Each factor is much smaller than the full Fisher, making inversion feasible.

**Shampoo** (Gupta et al., 2018) generalizes this to arbitrary-order tensors and has been shown to accelerate LLM pretraining (Anil et al., 2020).

## Distributed Backpropagation

Training large models across multiple devices requires distributing the backward pass:

**Data parallelism:** Each device computes gradients on different data; gradients are all-reduced. The backward pass is overlapped with communication via bucketing: as soon as gradients for one bucket of parameters are computed, the all-reduce begins while the backward pass continues for earlier layers.

**Pipeline parallelism** (Huang et al., 2019): Different layers live on different devices. Microbatching fills the pipeline, but gradient accumulation introduces a "bubble" where devices are idle. The backward pass of microbatch $i$ can overlap with the forward pass of microbatch $i+1$.

**Tensor parallelism** (Megatron-LM, Shoeybi et al., 2019): Individual layers are split across devices. For a linear layer $Y = XW$, if $W$ is column-split as $[W_1, W_2]$, each device computes $XW_i$ and the backward pass requires an all-reduce of the input gradient.

## Beyond Backpropagation

**Forward-forward algorithm** (Hinton, 2022) replaces the backward pass with two forward passes (one with real data, one with "negative" data), computing a local "goodness" metric at each layer. This eliminates the need to store activations and propagate gradients, but so far does not match backpropagation's performance.

**Equilibrium models** (Bai et al., 2019) compute the fixed point of an implicit layer $\mathbf{z}^* = f(\mathbf{z}^*, \mathbf{x})$ and use implicit differentiation for the backward pass, requiring $O(1)$ memory regardless of the number of "iterations."

## Key References

- Rumelhart, D. E., Hinton, G. E., & Williams, R. J. (1986). Learning representations by back-propagating errors. *Nature*, 323.
- Chen, T., et al. (2016). Training deep nets with sublinear memory cost. *arXiv:1604.06174*.
- Micikevicius, P., et al. (2018). Mixed precision training. *ICLR*.
- Martens, J., & Grosse, R. (2015). Optimizing neural networks with Kronecker-factored approximate curvature. *ICML*.
- Huang, Y., et al. (2019). GPipe: Efficient training of giant neural networks using pipeline parallelism. *NeurIPS*.
- Hinton, G. (2022). The forward-forward algorithm: Some preliminary investigations. *arXiv:2212.13345*.
