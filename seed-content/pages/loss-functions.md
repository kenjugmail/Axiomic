---
title: Loss Functions
category: training
---
<!-- tier:intro -->
# Loss Functions

A **loss function** (also called a cost function or objective function) measures how wrong a model's predictions are. Think of it as a report card — the lower the score, the better the model is doing.

## Cross-Entropy Loss

The most common loss function for language models is **cross-entropy loss**. Here's the intuition: if the model thinks the next word should be "cat" with 90% probability and it actually was "cat," the loss is low. If the model only gave "cat" a 1% chance, the loss is high.

Mathematically, for a single prediction, the loss is $-\log(p)$ where $p$ is the probability the model assigned to the correct answer. This has nice properties:
- When $p = 1$ (perfect prediction), the loss is $0$
- When $p \to 0$ (terrible prediction), the loss approaches infinity

## Mean Squared Error

For regression tasks (predicting continuous numbers), **mean squared error** $\text{MSE} = \frac{1}{n}\sum(y_i - \hat{y}_i)^2$ is standard. It penalizes large errors more heavily due to the squaring.

## Why Loss Functions Matter

The entire training process is about minimizing the loss. The choice of loss function determines what the model learns to optimize. Different loss functions lead to models with different behaviors.

## Related Topics

- [Training Objectives](/wiki/training-objectives) — how loss functions are used in transformer training
- [Gradient Descent](/wiki/gradient-descent) — how the loss is minimized
- [Softmax](/wiki/softmax) — produces the probabilities used in cross-entropy

<!-- tier:undergrad -->
# Loss Functions

## Cross-Entropy Loss

For a classification problem with $C$ classes, the cross-entropy loss is:

$$\mathcal{L}_{CE} = -\sum_{c=1}^{C} y_c \log(\hat{y}_c)$$

where $y$ is the one-hot target and $\hat{y}$ is the predicted probability distribution (output of [softmax](/wiki/softmax)).

For language modeling, this reduces to $\mathcal{L} = -\log p_\theta(x_t | x_{<t})$ — the negative log probability of the correct next token.

**Perplexity** is the exponential of the average cross-entropy: $\text{PPL} = \exp\left(-\frac{1}{T}\sum_{t=1}^{T} \log p_\theta(x_t | x_{<t})\right)$. Lower perplexity = better model.

## Gradient of Cross-Entropy

The gradient through softmax + cross-entropy has the elegant form:

$$\frac{\partial \mathcal{L}}{\partial z_i} = \hat{y}_i - y_i$$

This is numerically stable and simple to implement, which is one reason cross-entropy is so popular.

```python
import torch
import torch.nn.functional as F

logits = torch.randn(32, 50000)  # batch of 32, vocab of 50K
targets = torch.randint(0, 50000, (32,))
loss = F.cross_entropy(logits, targets)
```

## Related Topics

- [Backpropagation](/wiki/backpropagation) — computing gradients through the loss
- [RLHF](/wiki/rlhf) — alignment loss functions beyond cross-entropy

<!-- tier:grad -->
# Loss Functions

## Beyond Maximum Likelihood

Standard cross-entropy corresponds to maximum likelihood estimation (MLE). Recent work explores alternatives:

**Direct Preference Optimization (DPO)** (Rafailov et al., 2023) reformulates RLHF as a loss function over preference pairs, avoiding separate reward modeling. The loss is:

$$\mathcal{L}_{DPO} = -\log \sigma\left(\beta \log \frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}\right)$$

**Contrastive loss** (InfoNCE, used in CLIP): $\mathcal{L} = -\log \frac{\exp(\text{sim}(z_i, z_j)/\tau)}{\sum_k \exp(\text{sim}(z_i, z_k)/\tau)}$

**Multi-token prediction** (Gloeckle et al., 2024) predicts multiple future tokens simultaneously, providing richer training signal.

## The Calibration Problem

MLE-trained models tend to be **overconfident** — they assign too-high probabilities to their predictions. Label smoothing (mixing the target with a uniform distribution) helps: $y'_c = (1-\epsilon)y_c + \epsilon/C$.

## Related Topics

- [RLHF](/wiki/rlhf) — alignment beyond cross-entropy
- [Training Objectives](/wiki/training-objectives) — the full landscape
