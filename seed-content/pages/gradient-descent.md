---
title: Gradient Descent
category: fundamentals
---
<!-- tier:intro -->
# Gradient Descent

Imagine you're standing on a hilly landscape in thick fog. You can't see the bottom of the valley, but you can feel which direction is downhill under your feet. **Gradient descent** is exactly this strategy: take a step in the steepest downhill direction, and repeat.

## What's Being Optimized?

In machine learning, we have a **loss function** — a number that tells us how wrong our model's predictions are. High loss = bad predictions. Low loss = good predictions. Our goal is to find model parameters (the millions of numbers inside a neural network) that make this loss as small as possible.

## The Algorithm

1. Start with random parameters
2. Compute the loss on some training data
3. Compute the **gradient** — which direction in parameter space makes the loss decrease fastest
4. Take a small step in that direction
5. Repeat from step 2

The "small step" is controlled by the **learning rate** — too large and you overshoot the valley, too small and training takes forever.

## Stochastic Gradient Descent (SGD)

Computing the gradient on the entire dataset is expensive. **Stochastic gradient descent** approximates the gradient using a small random batch of data (typically 32–1024 examples). It's noisier but much faster, and the noise often helps escape bad local minima.

## Modern Optimizers

Plain SGD has largely been replaced by smarter variants:
- **Adam** — adapts the learning rate for each parameter individually and uses momentum
- **AdamW** — Adam with proper weight decay (used by most transformers)

These are the workhorses behind training models like GPT and LLaMA.

## Related Topics

- [Backpropagation](/wiki/backpropagation) — how gradients are actually computed
- [Training Objectives](/wiki/training-objectives) — what loss functions transformers use
- [Scaling Laws](/wiki/scaling-laws) — how much training is needed

<!-- tier:undergrad -->
# Gradient Descent

## Formulation

Given a differentiable loss function $\mathcal{L}(\theta)$ where $\theta \in \mathbb{R}^d$ represents model parameters, gradient descent iteratively updates:

$$\theta_{t+1} = \theta_t - \eta \nabla_\theta \mathcal{L}(\theta_t)$$

where $\eta > 0$ is the learning rate and $\nabla_\theta \mathcal{L}$ is the gradient vector.

## Convergence

For convex $\mathcal{L}$ with $L$-Lipschitz gradients, GD with $\eta = 1/L$ converges at rate $O(1/T)$ where $T$ is the number of iterations. For non-convex problems (like neural networks), we can only guarantee convergence to a stationary point where $\|\nabla \mathcal{L}\| \approx 0$.

## SGD and Mini-batches

Let $B \subset \{1, \ldots, N\}$ be a mini-batch of size $|B|$. The stochastic gradient is:

$$g_t = \frac{1}{|B|} \sum_{i \in B} \nabla_\theta \ell(f_\theta(x_i), y_i)$$

This is an unbiased estimator of the full gradient: $\mathbb{E}[g_t] = \nabla_\theta \mathcal{L}(\theta_t)$.

## Adam Optimizer

Adam (Kingma & Ba, 2015) maintains first and second moment estimates:

$$m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t$$
$$v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2$$

With bias correction $\hat{m}_t = m_t / (1 - \beta_1^t)$, $\hat{v}_t = v_t / (1 - \beta_2^t)$:

$$\theta_{t+1} = \theta_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$$

Default hyperparameters: $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$.

```python
import torch

model = torch.nn.Linear(768, 768)
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)

for batch in dataloader:
    loss = compute_loss(model, batch)
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
```

## Learning Rate Schedules

Constant learning rate rarely works well. Common schedules:
- **Cosine decay**: $\eta_t = \eta_{\min} + \frac{1}{2}(\eta_{\max} - \eta_{\min})(1 + \cos(\pi t / T))$
- **Linear warmup + cosine decay**: warmup for first $W$ steps, then cosine
- **Warmup + inverse sqrt**: common in transformer training

## Related Topics

- [Backpropagation](/wiki/backpropagation) — computing $\nabla_\theta \mathcal{L}$
- [Scaling Laws](/wiki/scaling-laws) — compute-optimal training

<!-- tier:grad -->
# Gradient Descent

## The Loss Landscape of Transformers

The loss landscape of large transformers is qualitatively different from small networks. Key findings:

**Benign non-convexity.** Despite being non-convex, large transformer loss surfaces have few "bad" local minima. Li et al. (2018) showed that loss landscape visualization (via random 2D projections) reveals increasingly smooth surfaces as models grow. This connects to the lottery ticket hypothesis and mode connectivity.

**Edge of stability.** Cohen et al. (2022) discovered that SGD with large learning rates enters a regime where the loss temporarily increases before decreasing — the "edge of stability." The sharpness of the loss (largest eigenvalue of the Hessian) hovers near $2/\eta$, suggesting an implicit regularization effect.

**Gradient flow and feature learning.** The NTK (Neural Tangent Kernel) regime, where the model behaves like a linear model in its parameters, breaks down for large learning rates. In the "rich" or "feature learning" regime, the model's internal representations change substantially during training — this is where transformers learn attention patterns and develop capabilities like in-context learning.

## Optimizer Landscape

**AdamW vs Adam.** Loshchilov & Hutter (2019) showed that $L_2$ regularization in Adam is not equivalent to weight decay. AdamW decouples weight decay from the gradient-based update, giving better generalization.

**muP and hyperparameter transfer.** Yang et al. (2022) introduced maximal update parameterization (muP), which allows learning rates and other hyperparameters to transfer across model sizes. This enables tuning on small models and scaling to large ones — critical for efficiency.

**Sophia optimizer.** Liu et al. (2023) proposed using diagonal Hessian estimates for per-parameter learning rate adaptation, claiming 2× speedup over Adam on LLM training. The key insight is that second-order information helps navigate the highly non-isotropic loss landscape of transformers.

## Distributed Training

Training transformers at scale requires distributing gradient computation:
- **Data parallelism**: replicate model across devices, split batches
- **Model parallelism**: split model layers across devices (pipeline parallelism)
- **Tensor parallelism**: split individual operations across devices
- **ZeRO** (Rajbhandari et al., 2020): partition optimizer states to reduce memory

## Related Topics

- [Backpropagation](/wiki/backpropagation) — gradient computation details
- [Scaling Laws](/wiki/scaling-laws) — how much compute to allocate
