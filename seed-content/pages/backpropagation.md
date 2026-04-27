---
title: Backpropagation
category: fundamentals
---
<!-- tier:intro -->

# Backpropagation

Every time a language model learns — whether during initial training or fine-tuning — it needs a way to figure out how to adjust its billions of parameters to make better predictions. **Backpropagation** (short for "backward propagation of errors") is the algorithm that does exactly this.

## The Learning Loop

Training works in a repeating cycle:

1. **Forward pass.** The model processes an input and makes a prediction.
2. **Compute the loss.** Compare the prediction to the correct answer using a mathematical formula (the "loss function"). A bigger loss means a worse prediction.
3. **Backward pass (backpropagation).** Trace backward through every computation the model performed, calculating how much each parameter contributed to the error.
4. **Update.** Adjust each parameter a tiny bit in the direction that reduces the error.

Backpropagation is step 3 — the part where the model figures out *which* parameters to change and *by how much*.

## The Chain Rule: The Key Insight

Backpropagation relies on a mathematical principle called the **chain rule**. Here's the intuition:

Suppose changing Parameter A by a little bit changes Intermediate Value B by some amount, and changing B changes the Final Error by some amount. Then we can figure out how Parameter A affects the Final Error by multiplying these two effects together.

A neural network is just a long chain of such steps — input flows through many layers, each transforming the data. The chain rule lets us efficiently propagate the error signal backward through this entire chain.

## Why "Backward"?

The key word is **efficiency**. To compute how every parameter affects the output, you could change each one individually and re-run the model — but with billions of parameters, that would take billions of forward passes. Backpropagation does it in just *one* backward pass, by reusing intermediate computations as it moves from the output back toward the input.

## What Gets Computed: Gradients

The result of backpropagation is a **gradient** for each parameter — a number that says "if you increase this parameter slightly, the loss will increase/decrease by this much." The optimizer then nudges parameters in the opposite direction of the gradient (to decrease the loss).

## Backpropagation in Transformers

In a transformer, backpropagation flows backward through:
- The output layer (where predictions are made)
- Layer normalization
- Feed-forward networks (MLP blocks)
- Attention mechanisms (through the softmax and the Q, K, V projections)
- The embedding layer

Every one of these components receives gradients, enabling the whole model to learn together.

## Related Topics

- [Attention](/wiki/attention) — one of the key operations that backpropagation flows through
- [Tokens](/wiki/tokens) — the inputs that start the forward pass
- [Fine-Tuning](/wiki/fine-tuning) — applies backpropagation to a pretrained model
- [LoRA](/wiki/lora) — limits which parameters receive gradient updates

<!-- tier:undergrad -->

# Backpropagation

Backpropagation computes the gradient of a scalar loss function with respect to all model parameters via recursive application of the chain rule on a computational graph. This section formalizes the algorithm and applies it to transformer components.

## The Computational Graph

A neural network defines a directed acyclic graph (DAG) where:
- Leaf nodes are inputs and parameters
- Internal nodes are operations (matrix multiply, softmax, ReLU, etc.)
- The root node is the scalar loss $\mathcal{L}$

For any parameter $\theta$ and loss $\mathcal{L}$, the gradient $\frac{\partial \mathcal{L}}{\partial \theta}$ can be computed by accumulating gradients along all paths from $\theta$ to $\mathcal{L}$ in the graph.

## The Chain Rule in Vector Calculus

For a composition $\mathcal{L} = f(g(\theta))$ where $g: \mathbb{R}^n \to \mathbb{R}^m$ and $f: \mathbb{R}^m \to \mathbb{R}$:

$$\frac{\partial \mathcal{L}}{\partial \theta} = \frac{\partial f}{\partial g} \cdot \frac{\partial g}{\partial \theta} = \mathbf{J}_g^\top \nabla_g f$$

where $\mathbf{J}_g \in \mathbb{R}^{m \times n}$ is the Jacobian of $g$. Backpropagation computes **vector-Jacobian products** (VJPs) from output to input, which is efficient because the output is scalar (loss) and we want gradients for all inputs.

## Gradients Through Transformer Components

### Linear Layer

For $\mathbf{Y} = \mathbf{X}\mathbf{W}^\top + \mathbf{b}$ where $\mathbf{X} \in \mathbb{R}^{n \times d_\text{in}}$, $\mathbf{W} \in \mathbb{R}^{d_\text{out} \times d_\text{in}}$:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{W}} = \left(\frac{\partial \mathcal{L}}{\partial \mathbf{Y}}\right)^\top \mathbf{X}, \quad \frac{\partial \mathcal{L}}{\partial \mathbf{X}} = \frac{\partial \mathcal{L}}{\partial \mathbf{Y}} \mathbf{W}$$

### Softmax

For $\mathbf{p} = \text{softmax}(\mathbf{z})$, the Jacobian is:

$$\frac{\partial p_i}{\partial z_j} = p_i(\delta_{ij} - p_j)$$

The VJP is: $\frac{\partial \mathcal{L}}{\partial z_i} = p_i\left(\frac{\partial \mathcal{L}}{\partial p_i} - \sum_k p_k \frac{\partial \mathcal{L}}{\partial p_k}\right)$

### Attention

For single-head attention $\mathbf{O} = \text{softmax}\!\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)\mathbf{V}$, let $\mathbf{A} = \text{softmax}\!\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)$. Then:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{V}} = \mathbf{A}^\top \frac{\partial \mathcal{L}}{\partial \mathbf{O}}$$

$$\frac{\partial \mathcal{L}}{\partial \mathbf{A}} = \frac{\partial \mathcal{L}}{\partial \mathbf{O}} \mathbf{V}^\top$$

The gradient through the softmax and scaled dot product then gives $\frac{\partial \mathcal{L}}{\partial \mathbf{Q}}$ and $\frac{\partial \mathcal{L}}{\partial \mathbf{K}}$.

### Layer Normalization

For $\text{LayerNorm}(\mathbf{x}) = \gamma \odot \frac{\mathbf{x} - \mu}{\sigma} + \beta$ where $\mu = \frac{1}{d}\sum_i x_i$ and $\sigma = \sqrt{\frac{1}{d}\sum_i(x_i-\mu)^2 + \epsilon}$:

$$\frac{\partial \mathcal{L}}{\partial x_i} = \frac{\gamma_i}{\sigma}\left(\frac{\partial \mathcal{L}}{\partial \hat{x}_i} - \frac{1}{d}\sum_j \frac{\partial \mathcal{L}}{\partial \hat{x}_j} - \frac{\hat{x}_i}{d}\sum_j \frac{\partial \mathcal{L}}{\partial \hat{x}_j}\hat{x}_j\right)$$

## PyTorch Autograd

```python
import torch
import torch.nn as nn

# PyTorch builds the computational graph automatically
d_model = 512
seq_len = 128
batch = 4
vocab_size = 32000

# Simple transformer-like forward pass
x = torch.randn(batch, seq_len, d_model, requires_grad=True)
W_q = torch.randn(d_model, d_model, requires_grad=True)
W_k = torch.randn(d_model, d_model, requires_grad=True)
W_v = torch.randn(d_model, d_model, requires_grad=True)

Q = x @ W_q
K = x @ W_k
V = x @ W_v
attn_scores = (Q @ K.transpose(-2, -1)) / (d_model ** 0.5)
attn_weights = torch.softmax(attn_scores, dim=-1)
output = attn_weights @ V

# Backward pass: compute all gradients
loss = output.sum()  # dummy loss
loss.backward()

# Gradients are now available
print(W_q.grad.shape)  # (512, 512) — gradient of loss w.r.t. W_q
print(x.grad.shape)    # (4, 128, 512) — gradient of loss w.r.t. input
```

## Memory Considerations

During backpropagation, all intermediate activations from the forward pass must be stored (or recomputed). For a transformer with $L$ layers, sequence length $n$, and hidden dimension $d$:

- **Activation memory**: $O(L \cdot n \cdot d)$ for residual stream states, plus $O(L \cdot n^2)$ for attention matrices
- **Gradient checkpointing**: trade compute for memory by recomputing forward activations during the backward pass rather than storing them. Reduces memory from $O(L)$ to $O(\sqrt{L})$ with checkpointing every $\sqrt{L}$ layers.

## Related Topics

- [Attention](/wiki/attention) — attention gradients are the most expensive component
- [Fine-Tuning](/wiki/fine-tuning) — applies backpropagation to update pretrained models
- [LoRA](/wiki/lora) — reduces gradient computation by limiting trainable parameters
- [Tokens](/wiki/tokens) — sequence length affects backpropagation memory

<!-- tier:grad -->

# Backpropagation

Backpropagation through transformers involves several non-obvious computational and numerical challenges. This section covers memory optimization, gradient pathology, and connections to recent training advances.

## Gradient Flow in Deep Transformers

The residual connection structure of transformers is critical for gradient flow. For a transformer with $L$ layers and residual connections:

$$\mathbf{x}^{(L)} = \mathbf{x}^{(0)} + \sum_{l=1}^{L} f^{(l)}(\mathbf{x}^{(l-1)})$$

The gradient of the loss with respect to early layers is:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{x}^{(0)}} = \frac{\partial \mathcal{L}}{\partial \mathbf{x}^{(L)}} \cdot \prod_{l=1}^{L}\left(\mathbf{I} + \frac{\partial f^{(l)}}{\partial \mathbf{x}^{(l-1)}}\right)$$

The identity matrix $\mathbf{I}$ in each factor ensures that gradients can flow directly from the loss to any layer without vanishing — this is the fundamental reason residual connections enable training of very deep networks. Without them, the product of many matrices typically either vanishes or explodes.

## FlashAttention and the Backward Pass

Standard attention backpropagation stores the $n \times n$ attention matrix $\mathbf{A}$, requiring $O(n^2)$ memory per head per layer. FlashAttention (Dao et al., 2022) avoids this by recomputing attention during the backward pass using tiling:

**Forward:** Compute attention in tiles, storing only the output $\mathbf{O}$ and the log-sum-exp statistics $\ell$ (per row).

**Backward:** Recompute attention weights from $\mathbf{Q}, \mathbf{K}$ on-the-fly within each tile:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{Q}} = \frac{1}{\sqrt{d_k}} \cdot \text{diag}(\mathbf{D}) \cdot \left(\frac{\partial \mathcal{L}}{\partial \mathbf{O}} \mathbf{V}^\top - \mathbf{P}\right) \cdot \mathbf{K}$$

where $\mathbf{D}_i = \sum_j A_{ij} \frac{\partial \mathcal{L}}{\partial O_{ij}}$ are the row-wise dot products. This reduces memory from $O(n^2)$ to $O(n)$ while being faster in practice due to better GPU memory access patterns.

FlashAttention-2 and FlashAttention-3 further optimize the backward pass with better work partitioning across GPU thread blocks and asynchronous computation.

## Gradient Checkpointing Strategies

**Uniform checkpointing.** Save activations every $k$ layers; recompute intermediate layers during backward. For $L$ layers with checkpoints every $\sqrt{L}$ layers: memory $O(\sqrt{L} \cdot nd)$, compute overhead ~33%.

**Selective checkpointing.** Selectively checkpoint expensive-to-store but cheap-to-recompute operations. Attention weight matrices ($O(n^2)$ memory each) are ideal candidates because they can be recomputed from $\mathbf{Q}, \mathbf{K}$ ($O(nd)$ storage).

**Sequence parallelism.** For very long sequences, the activation memory bottleneck is the sequence dimension. Korthikanti et al. (2022) proposed splitting the sequence across GPUs for operations that don't require cross-sequence communication (layer norm, MLP), synchronizing only for attention.

## Mixed Precision Training

Modern transformer training uses mixed precision (Micikevicius et al., 2018):

- **Forward pass**: FP16 or BF16 for speed and memory
- **Backward pass**: FP16/BF16 for gradient computation
- **Weight update**: FP32 master weights to avoid precision loss

The critical insight: gradients can have very large dynamic range. BF16 (8 exponent bits, 7 mantissa bits) is preferred over FP16 (5 exponent bits, 10 mantissa bits) for gradients because the larger exponent range avoids overflow/underflow, even though individual values are less precise.

**Loss scaling.** With FP16, small gradients underflow to zero. Loss scaling multiplies the loss by a large factor before backpropagation (so gradients are larger), then divides the resulting gradients before the weight update. Dynamic loss scaling adjusts this factor during training.

## Second-Order Methods and Beyond

Standard backpropagation computes first-order gradients. Second-order information (the Hessian $\mathbf{H} = \nabla^2 \mathcal{L}$) is too expensive to compute and store ($O(p^2)$ for $p$ parameters), but approximations are useful:

**AdaFactor and Adam.** These optimizers implicitly approximate diagonal elements of the Hessian via running averages of squared gradients. Adam's update $\Delta\theta_i \propto m_i / \sqrt{v_i}$ can be seen as a diagonal Newton step.

**K-FAC** (Martens & Grosse, 2015): approximates the Fisher information matrix (related to the Hessian) as a Kronecker product of smaller matrices, one per layer. For a linear layer with weight $\mathbf{W}$:

$$\mathbf{F}_\mathbf{W} \approx \mathbb{E}[\mathbf{a}\mathbf{a}^\top] \otimes \mathbb{E}[\mathbf{g}\mathbf{g}^\top]$$

where $\mathbf{a}$ is the input activation and $\mathbf{g}$ is the output gradient. This factorization reduces the inversion from $O(d_\text{in}^2 d_\text{out}^2)$ to $O(d_\text{in}^3 + d_\text{out}^3)$.

**Sophia** (Liu et al., 2024): a lightweight second-order optimizer for language model pretraining that uses a diagonal Hessian estimate via Hutchinson's method: $\hat{H}_{ii} = \mathbb{E}_{\mathbf{u}}[u_i (\mathbf{H}\mathbf{u})_i]$ where $\mathbf{u}$ is a random vector. This provides per-parameter adaptive learning rates with minimal overhead.

## Gradient Pathology in Practice

**Gradient norm spikes.** During transformer training, gradient norms occasionally spike by orders of magnitude, destabilizing training. Gradient clipping (capping $\|\nabla\mathcal{L}\|$ at a threshold, typically 1.0) is essential. Wortsman et al. (2024) linked these spikes to specific data patterns and attention entropy collapse.

**Attention sink gradients.** Xiao et al. (2024) observed that the first token often receives disproportionate attention across all heads ("attention sinks"). During backpropagation, this concentrates gradient signal on the first position's embeddings, which can dominate parameter updates.

## Distributed Backpropagation

Training large transformers across multiple GPUs introduces communication overhead:

- **Data parallelism**: each GPU computes gradients on different data; gradients are all-reduced (averaged) before update. Communication: $O(p)$ per step, where $p$ is parameter count.
- **Tensor parallelism** (Megatron-LM): split individual layers across GPUs. Requires two all-reduce operations per layer during both forward and backward passes.
- **Pipeline parallelism**: split layers across GPUs. The backward pass must wait for the forward pass to complete, creating "pipeline bubbles." Interleaved scheduling (1F1B) minimizes idle time.

## Related Topics

- [Attention](/wiki/attention) — the computational bottleneck of transformer backpropagation
- [Fine-Tuning](/wiki/fine-tuning) — applying backpropagation to adapt pretrained models
- [LoRA](/wiki/lora) — reduces the dimension of gradient computation
- [Tokens](/wiki/tokens) — sequence length directly impacts backpropagation cost
