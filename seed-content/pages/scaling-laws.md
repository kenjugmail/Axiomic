---
title: Scaling Laws
category: training
---
<!-- tier:intro -->

# Scaling Laws

One of the most remarkable discoveries in modern AI is that language models follow **predictable mathematical patterns** as they get bigger. These patterns — called scaling laws — tell us how model performance improves as we increase three key ingredients: the **size of the model**, the **amount of training data**, and the **amount of computation**.

## The Three Knobs

When training a language model, you can turn three knobs:

1. **Parameters (N)**: How many numbers define the model (millions, billions, or trillions)
2. **Data (D)**: How many tokens of text you train on
3. **Compute (C)**: Total processing power used, measured in FLOPs (floating-point operations)

These three are linked by a budget constraint: with a fixed amount of compute, you must choose how to split it between a bigger model and more data.

## The Key Discovery

Kaplan et al. (2020) at OpenAI found that a model's performance (measured by loss — how surprised it is by text) follows a **power law** in each variable:

- Double the parameters → loss drops by a predictable amount
- Double the data → loss drops by a predictable amount
- The relationship is a smooth curve on a log-log plot

This was revolutionary because it meant you could **predict** how well a model would perform before spending millions of dollars training it.

## Chinchilla: Getting the Balance Right

The original OpenAI scaling laws suggested spending most of your compute budget on making models bigger, even if they don't see that much data. This led to models like GPT-3 (175 billion parameters, 300 billion tokens of data).

In 2022, DeepMind's **Chinchilla paper** (Hoffmann et al.) argued this was wrong. They showed that the optimal balance is roughly:

> **For every doubling of model size, you should also double the training data.**

Their 70-billion-parameter Chinchilla model, trained on 1.4 trillion tokens, outperformed the 280-billion-parameter Gopher trained on only 300 billion tokens. The lesson: many existing models were **undertrained** — they were too big for the amount of data they saw.

## Why This Matters

Scaling laws let organizations:
- **Plan ahead**: estimate the cost and performance of future models
- **Avoid waste**: find the right balance of model size and data
- **Predict capabilities**: understand when models might gain new abilities

## Related Topics

- [Tokens](/wiki/tokens) — the units that training data is measured in
- [Loss Function](/wiki/loss-function) — what scaling laws predict
- [Training](/wiki/training) — the process scaling laws describe

<!-- tier:undergrad -->

# Scaling Laws

Scaling laws describe the empirical relationship between a language model's loss and the resources used to train it. They have become the primary tool for planning large-scale training runs.

## The Power Law Framework

Kaplan et al. (2020) established that the cross-entropy loss $L$ of a transformer language model follows power laws in model parameters $N$, dataset size $D$ (in tokens), and compute budget $C$ (in FLOPs):

$$L(N) = \left(\frac{N_c}{N}\right)^{\alpha_N}, \quad L(D) = \left(\frac{D_c}{D}\right)^{\alpha_D}, \quad L(C) = \left(\frac{C_c}{C}\right)^{\alpha_C}$$

where $\alpha_N \approx 0.076$, $\alpha_D \approx 0.095$, and $\alpha_C \approx 0.050$ (for each variable when the others are not bottlenecking). These exponents indicate that data scaling is more efficient than parameter scaling per unit investment.

## Compute-Optimal Training (Chinchilla)

Hoffmann et al. (2022) reformulated the question: given a fixed compute budget $C$, what is the optimal allocation between $N$ and $D$?

The total compute is approximately:
$$C \approx 6ND$$

(each token requires ~6 FLOPs per parameter in a forward+backward pass).

They proposed a parametric loss model:
$$L(N, D) = \frac{A}{N^\alpha} + \frac{B}{D^\beta} + L_\infty$$

where $L_\infty$ is the irreducible loss (entropy of natural language). Minimizing $L(N, D)$ subject to $C = 6ND$ gives the Chinchilla-optimal allocation:

$$N_{\text{opt}} \propto C^{a}, \quad D_{\text{opt}} \propto C^{b}$$

with $a \approx 0.50$ and $b \approx 0.50$. The key result: **parameters and data should scale equally** with compute. This was a significant revision from Kaplan et al., who had $a \approx 0.73$ (favoring larger models).

## The Chinchilla Ratio

The Chinchilla-optimal ratio is approximately:

$$D_{\text{opt}} \approx 20 \times N_{\text{opt}}$$

A 7B model should be trained on ~140B tokens. A 70B model should see ~1.4T tokens. Many pre-Chinchilla models violated this:

| Model | Parameters | Tokens | Tokens/Params |
|---|---|---|---|
| GPT-3 | 175B | 300B | 1.7 |
| Gopher | 280B | 300B | 1.1 |
| Chinchilla | 70B | 1.4T | 20 |
| Llama 2 | 70B | 2T | 29 |

Note that Llama 2 overtrained relative to Chinchilla-optimal — this is intentional when you want a smaller model to be maximally capable at a fixed inference cost.

## Beyond Loss: Downstream Performance

Scaling laws for loss don't directly tell us about downstream task performance. However, several works have established:

- **Emergent abilities** (Wei et al., 2022): Some capabilities appear to "emerge" suddenly at a critical scale, not following smooth power laws. However, Schaeffer et al. (2023) argued this may be an artifact of discrete evaluation metrics rather than true emergence.
- **Predictable scaling of benchmarks**: When using continuous metrics, most benchmark scores do follow smooth scaling with compute.

## Code: Predicting Loss from Compute

```python
import numpy as np

def chinchilla_optimal(compute_flops: float) -> tuple[float, float]:
    """Estimate Chinchilla-optimal N and D for a given compute budget."""
    # C ≈ 6ND, with N ≈ D/20
    # C = 6 * (D/20) * D = 6D²/20
    D_opt = np.sqrt(compute_flops * 20 / 6)
    N_opt = D_opt / 20
    return N_opt, D_opt

def predicted_loss(N: float, D: float) -> float:
    """Estimate loss using Chinchilla parametric model (approximate)."""
    A, alpha = 406.4, 0.34
    B, beta = 410.7, 0.28
    L_inf = 1.69  # irreducible entropy
    return A / (N ** alpha) + B / (D ** beta) + L_inf

# Example: 10^24 FLOPs budget (roughly Chinchilla-scale)
C = 1e24
N_opt, D_opt = chinchilla_optimal(C)
print(f"Optimal N: {N_opt/1e9:.1f}B params, D: {D_opt/1e12:.2f}T tokens")
print(f"Predicted loss: {predicted_loss(N_opt, D_opt):.3f}")
```

## Related Topics

- [Tokens](/wiki/tokens) — how training data is measured
- [KV Cache](/wiki/kv-cache) — inference costs that motivate overtraining smaller models
- [SwiGLU](/wiki/swiglu) — architectural choices that affect scaling efficiency

<!-- tier:grad -->

# Scaling Laws

Scaling laws have evolved from empirical observations to the primary framework for resource allocation in large-scale AI training. This section covers the latest developments, including challenges to the Chinchilla paradigm.

## The Chinchilla vs. Kaplan Discrepancy

The Kaplan et al. (2020) and Hoffmann et al. (2022) scaling laws disagree significantly on the optimal compute allocation. The key methodological differences:

1. **Learning rate schedule**: Kaplan et al. used a fixed schedule across all runs, while Hoffmann et al. tuned the schedule per run. Under-tuned hyperparameters disproportionately penalize larger models, biasing Kaplan toward over-parameterization.
2. **Last-token vs. all-token loss**: The choice of which tokens to include in the loss calculation affects the estimated exponents.
3. **Model shape**: Whether depth and width scale proportionally matters; Kaplan et al. held shape fixed while varying total parameters.

Muennighoff et al. (2024) reconciled many of these discrepancies and found that the Chinchilla ratio (~20 tokens/parameter) is approximately correct for compute-optimal training but that the exponents are sensitive to the data distribution.

## Overtraining and Inference-Optimal Scaling

The Chinchilla-optimal point minimizes loss for a fixed **training** compute budget. In practice, organizations increasingly prefer **inference-optimal** scaling, which accounts for total lifetime cost:

$$C_{\text{total}} = C_{\text{train}} + C_{\text{inference}} \times \text{expected queries}$$

Since inference cost scales linearly with $N$ but training can be amortized, the optimal strategy often involves training a smaller model on significantly more data than Chinchilla recommends. Llama 3 (8B trained on 15T tokens, ~1875 tokens/parameter) exemplifies this "overtrained" regime.

Sardana & Frankle (2024, "Beyond Chinchilla-Optimal") formalized inference-optimal scaling and showed that the optimal tokens-per-parameter ratio increases as the expected inference demand grows.

## Data Quality and Scaling

Scaling laws implicitly assume data quality is constant. In practice, the web crawl data used for pretraining varies enormously in quality. Sorscher et al. (2022) showed that with data pruning (removing low-quality examples), scaling exponents can **improve** — the power law becomes steeper, meaning each additional FLOP gives more improvement.

This has profound implications: at some point, **data curation** may provide more improvement per dollar than additional compute.

## Scaling Laws for Downstream Tasks

Predicting downstream performance from pretraining loss remains an open challenge:

- **Task-specific scaling**: Different tasks have different scaling exponents. Reasoning tasks scale more slowly than knowledge retrieval tasks (Ye et al., 2024).
- **Broken scaling**: Some tasks show non-monotonic scaling — performance initially improves, then plateaus or even regresses before improving again at larger scale. This "U-shaped" or "inverse scaling" phenomenon (McKenzie et al., 2023) appears particularly for tasks involving sycophancy or distractor resistance.
- **Transfer scaling**: Wei et al. (2023) established that few-shot in-context learning ability scales predictably with model size, but the exponent depends on the complexity of the task pattern.

## Multi-Epoch Training and Data Constraints

As models exhaust available high-quality data, multi-epoch training becomes necessary. Muennighoff et al. (2024, "Scaling Data-Constrained Language Models") found:

- Training for up to 4 epochs on the same data shows no significant degradation
- Beyond 4 epochs, returns diminish and memorization increases
- The effective data size with $R$ epochs on $D$ unique tokens is approximately $D_{\text{eff}} = D \cdot (1 - e^{-R})$ — asymptotically saturating

This data wall motivates synthetic data generation, curriculum learning, and data mixing strategies as active research areas.

## Scaling Laws for Post-Training

RLHF and instruction tuning have their own scaling properties:

- Gao et al. (2023) showed that reward model overoptimization follows a predictable relationship between the KL divergence from the base policy and reward model accuracy.
- The amount of RLHF compute needed scales sublinearly with pretraining compute — larger base models are "easier" to align.
- Scaling laws for the mixture of pretraining and fine-tuning data remain poorly understood.

## The Frontier: Non-Transformer Architectures

Do scaling laws depend on the architecture? Early evidence suggests the power-law form is universal, but exponents differ:

- **State-space models** (Mamba, S4): Comparable scaling exponents to transformers, with better efficiency constants for long sequences (Gu & Dao, 2024).
- **Mixture-of-Experts**: Scaling laws must account for total parameters vs. active parameters. MoE models achieve better loss per FLOP but the advantage narrows at extreme scale (Fedus et al., 2022).

## Related Topics

- [Tokens](/wiki/tokens) — the fundamental unit of data scaling
- [KV Cache](/wiki/kv-cache) — why inference costs motivate overtraining
- [SwiGLU](/wiki/swiglu) — architectural improvements that shift scaling constants
- [Grouped Query Attention](/wiki/grouped-query-attention) — efficiency techniques that change the compute landscape
