---
title: Softmax Function
category: fundamentals
---
<!-- tier:intro -->
# The Softmax Function

The softmax function is one of the most important building blocks in machine learning. It does something deceptively simple: it takes a list of numbers and turns them into a probability distribution -- a set of positive numbers that sum to 1.

## What It Does

Say you have three numbers: [2.0, 1.0, 0.1]. These could represent how "confident" a model is about three different choices. Softmax converts these raw scores into probabilities:

- 2.0 becomes 0.659 (65.9%)
- 1.0 becomes 0.242 (24.2%)
- 0.1 becomes 0.099 (9.9%)

The highest score gets the highest probability, but the others still get some share. And crucially, they all sum to 1.0 (100%).

## Why Not Just Normalize?

You might wonder: why not just divide each number by the sum? Because some of our input numbers could be negative, and we need probabilities to be positive. Softmax handles this by first exponentiating each number ($e^x$), which makes everything positive, and then normalizing.

## Where Softmax Appears

Softmax shows up everywhere in transformers:

1. **[Attention](/wiki/attention) weights:** After computing how much each word should attend to every other word (the query-key dot products), softmax converts these scores into weights that sum to 1. This is how the model decides "70% of my attention goes to this word, 20% to that one, and 10% to the other."

2. **Output predictions:** When a language model predicts the next word, it produces a score for every word in its vocabulary (often 50,000+ words). Softmax converts these into a probability distribution: "there's a 15% chance the next word is 'the,' a 3% chance it's 'cat,'" etc.

## Temperature

There's a useful knob called **temperature** that controls how "sharp" or "smooth" the distribution is. Before applying softmax, you divide all the scores by a temperature value $T$:

- **Low temperature (T < 1):** Makes the distribution sharper. The highest score dominates even more. At $T \to 0$, it becomes "winner takes all."
- **High temperature (T > 1):** Makes the distribution smoother, more uniform. At $T \to \infty$, all options become equally likely.
- **T = 1:** Standard softmax, no modification.

This is used in text generation: low temperature produces more predictable, focused text; high temperature produces more creative, diverse text.

<!-- tier:undergrad -->
# The Softmax Function

## Definition

Given a vector $\mathbf{z} \in \mathbb{R}^n$, the softmax function $\sigma: \mathbb{R}^n \to \mathbb{R}^n$ is:

$$\sigma(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{n} e^{z_j}}, \quad i = 1, \dots, n$$

Properties:
- $\sigma(\mathbf{z})_i > 0$ for all $i$ (positivity)
- $\sum_i \sigma(\mathbf{z})_i = 1$ (normalization)
- $\sigma(\mathbf{z} + c\mathbf{1}) = \sigma(\mathbf{z})$ for any scalar $c$ (shift invariance)

## Temperature Scaling

The temperature-scaled softmax is:

$$\sigma(\mathbf{z}; T)_i = \frac{e^{z_i / T}}{\sum_{j=1}^{n} e^{z_j / T}}$$

As $T \to 0^+$: $\sigma(\mathbf{z}; T) \to \text{one-hot}(\arg\max_i z_i)$ (hard argmax).
As $T \to \infty$: $\sigma(\mathbf{z}; T) \to \frac{1}{n}\mathbf{1}$ (uniform distribution).

Temperature is widely used in [decoding](/wiki/decoding) strategies for language models.

## Numerical Stability

Naive computation of $e^{z_i}$ overflows for large $z_i$ (e.g., $e^{1000} = \infty$ in float32). The standard trick uses shift invariance:

$$\sigma(\mathbf{z})_i = \frac{e^{z_i - z_{\max}}}{\sum_j e^{z_j - z_{\max}}}, \quad z_{\max} = \max_j z_j$$

After subtracting $z_{\max}$, the largest exponent is $e^0 = 1$, preventing overflow. All other exponents are $\leq 1$.

For log-softmax (used in cross-entropy loss), the log-sum-exp trick provides additional stability:

$$\log \sigma(\mathbf{z})_i = z_i - \log\sum_j e^{z_j} = z_i - z_{\max} - \log\sum_j e^{z_j - z_{\max}}$$

## Gradient

The Jacobian of softmax is:

$$\frac{\partial \sigma_i}{\partial z_j} = \sigma_i (\delta_{ij} - \sigma_j)$$

where $\delta_{ij}$ is the Kronecker delta. In matrix form:

$$\mathbf{J} = \text{diag}(\boldsymbol{\sigma}) - \boldsymbol{\sigma}\boldsymbol{\sigma}^\top$$

This shows that softmax gradients depend on the output values themselves. When the distribution is very peaked (one $\sigma_i \approx 1$), gradients nearly vanish -- the model becomes too confident to update. This is related to the **vanishing gradient problem** in deep softmax-based attention.

## Softmax in Attention

In [scaled dot-product attention](/wiki/attention):

$$\mathbf{A} = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)$$

The $\sqrt{d_k}$ scaling prevents the dot products from having large variance ($\text{Var} = d_k$ for unit-variance inputs), which would push softmax into saturated regions with vanishing gradients.

## PyTorch Implementation

```python
import torch
import torch.nn.functional as F

def softmax_naive(z):
    """Numerically unstable -- for illustration only."""
    exp_z = torch.exp(z)
    return exp_z / exp_z.sum(dim=-1, keepdim=True)

def softmax_stable(z):
    """Numerically stable softmax."""
    z_max = z.max(dim=-1, keepdim=True).values
    exp_z = torch.exp(z - z_max)
    return exp_z / exp_z.sum(dim=-1, keepdim=True)

def softmax_with_temperature(z, temperature=1.0):
    """Temperature-scaled softmax."""
    return F.softmax(z / temperature, dim=-1)

# Demonstrating temperature effects
logits = torch.tensor([2.0, 1.0, 0.1])
print(f"T=0.1: {softmax_with_temperature(logits, 0.1)}")  # very peaked
print(f"T=1.0: {softmax_with_temperature(logits, 1.0)}")  # standard
print(f"T=5.0: {softmax_with_temperature(logits, 5.0)}")  # smooth

# In practice, always use PyTorch built-ins:
output = F.softmax(logits, dim=-1)       # stable softmax
log_output = F.log_softmax(logits, dim=-1)  # for cross-entropy

# Cross-entropy loss combines log_softmax + NLL in one numerically stable op
loss_fn = torch.nn.CrossEntropyLoss()
# Takes raw logits, NOT softmax output
loss = loss_fn(logits.unsqueeze(0), torch.tensor([0]))
```

## Softmax as Continuous Argmax

Softmax is a smooth, differentiable approximation of the argmax function. This perspective is useful for understanding temperature:

$$\lim_{T \to 0^+} T \cdot \log \sigma(\mathbf{z}/T)_i = z_i - \max_j z_j$$

This connects softmax to convex optimization: softmax is the gradient of the log-sum-exp function, which is a smooth approximation to the max function.

<!-- tier:grad -->
# The Softmax Function

## Softmax as an Exponential Family

Softmax defines the categorical distribution as an exponential family. The sufficient statistics are indicator functions, and the log-partition function is log-sum-exp:

$$A(\mathbf{z}) = \log \sum_i e^{z_i}$$

with $\sigma(\mathbf{z}) = \nabla A(\mathbf{z})$. The convexity of $A$ guarantees that softmax maps to the interior of the probability simplex and is a diffeomorphism between $\mathbb{R}^n / \text{span}(\mathbf{1})$ (equivalence classes under translation) and the open simplex.

## The Softmax Bottleneck

Yang et al. (2018) identified the **softmax bottleneck**: if a language model computes logits as $\mathbf{h}^\top \mathbf{W}$ followed by softmax, the resulting log-probability matrix has rank bounded by the hidden dimension $d$. If the true data distribution has a log-probability matrix with rank $r > d$, the model **cannot** express it regardless of capacity.

Formally, for true distribution $P^*$ and model distribution $P_\theta$:

$$\text{rank}(\log P_\theta) \leq d + 1$$

If $\text{rank}(\log P^*) > d + 1$, there exists a nonzero gap:

$$\min_\theta D_{KL}(P^* \| P_\theta) > 0$$

This motivated **Mixture of Softmaxes (MoS):**

$$P(w | h) = \sum_{k=1}^{K} \pi_k \cdot \text{softmax}(\mathbf{h}^\top \mathbf{W}_k)$$

which has rank up to $K(d+1)$.

## Online Softmax and FlashAttention

Computing softmax over a sequence requires two passes: one to find the max (for stability) and compute the sum, another to normalize. This is problematic for [FlashAttention](/wiki/attention), which processes the sequence in tiles.

Milakov and Gimelshein (2018) proposed **online softmax** that computes the result in a single pass using running statistics:

```
m_0 = -inf, d_0 = 0
for j = 1 to n:
    m_j = max(m_{j-1}, x_j)
    d_j = d_{j-1} * exp(m_{j-1} - m_j) + exp(x_j - m_j)
softmax_j = exp(x_j - m_n) / d_n
```

FlashAttention extends this to compute attention output in a single fused pass, maintaining running max and sum-of-exp statistics as it processes KV blocks.

## Alternatives to Softmax Attention

Several replacements for the softmax kernel in attention have been proposed:

**ReLU Attention** (Wortsman et al., 2023): Replace softmax with ReLU:

$$\text{Attn}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{ReLU}(\mathbf{Q}\mathbf{K}^\top / \sqrt{d_k}) \mathbf{V}$$

No normalization. Simpler and faster but requires careful initialization (dividing by sequence length). Competitive with softmax at scale.

**Sigmoid Attention** (Ramapuram et al., 2024): Replace softmax with element-wise sigmoid:

$$A_{ij} = \sigma(q_i^\top k_j / \sqrt{d_k} + b)$$

where $b$ is a learnable bias. Attention weights no longer sum to 1 and are independent per entry. This eliminates the quadratic coupling between positions in the backward pass and simplifies parallelism.

**Gated Linear Attention** (Yang et al., 2024): Reformulate attention as a gated RNN that can be computed in parallel via a chunked parallel scan:

$$\mathbf{S}_t = \mathbf{G}_t \odot \mathbf{S}_{t-1} + \mathbf{k}_t \mathbf{v}_t^\top, \quad \mathbf{o}_t = \mathbf{q}_t^\top \mathbf{S}_t$$

where $\mathbf{G}_t$ is a data-dependent gating matrix. This achieves linear complexity in sequence length while maintaining the expressiveness of softmax attention.

## Sparse Softmax Variants

Standard softmax always produces dense outputs (all entries > 0). Sparse alternatives assign exactly zero weight to irrelevant entries:

**Sparsemax** (Martins and Astudillo, 2016): Projects onto the probability simplex via Euclidean projection:

$$\text{sparsemax}(\mathbf{z}) = \arg\min_{\mathbf{p} \in \Delta^n} \|\mathbf{p} - \mathbf{z}\|_2^2$$

This produces exact zeros for low scores. Has a closed-form solution involving sorting and thresholding.

**$\alpha$-entmax** (Peters et al., 2019): Generalizes both softmax ($\alpha = 1$) and sparsemax ($\alpha = 2$) via the Tsallis entropy:

$$\alpha\text{-entmax}(\mathbf{z}) = \arg\max_{\mathbf{p} \in \Delta^n} \mathbf{p}^\top \mathbf{z} + H_\alpha^T(\mathbf{p})$$

where $H_\alpha^T$ is the Tsallis entropy. With $\alpha = 1.5$ (a learned or fixed value), the model learns genuinely sparse attention patterns without approximation.

## Softmax and the Entropy of Attention

The entropy of attention weights $H(\mathbf{a}) = -\sum_j a_j \log a_j$ is a useful diagnostic:

- **Low entropy:** Peaked attention, model is "certain" about which tokens matter
- **High entropy:** Diffuse attention, model spreads attention broadly

Zhai et al. (2023) showed that attention entropy increases in deeper layers and that **entropy collapse** (all heads converging to low entropy) correlates with training instability. They proposed an entropy regularizer to maintain diverse attention patterns.

### Key References

- Martins and Astudillo (2016). "From Softmax to Sparsemax: A Sparse Model of Attention and Multi-Label Classification." ICML.
- Yang et al. (2018). "Breaking the Softmax Bottleneck: A High-Rank RNN Language Model." ICLR.
- Milakov and Gimelshein (2018). "Online Normalizer Calculation for Softmax." arXiv:1805.02867.
- Peters et al. (2019). "Sparse Sequence-to-Sequence Models." ACL.
- Ramapuram et al. (2024). "Theory, Analysis, and Best Practices for Sigmoid Self-Attention." arXiv:2409.04431.
