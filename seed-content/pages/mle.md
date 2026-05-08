---
title: Maximum Likelihood Estimation (MLE)
category: stats
---
<!-- tier:intro -->
# Maximum Likelihood Estimation

Given a parameterized model `p(x | θ)` and data `x_1, ..., x_n`, find the `θ` that makes the data most probable:

```
θ̂_MLE = argmax_θ ∏_i p(x_i | θ) = argmax_θ Σ_i log p(x_i | θ)
```

The basis of most ML loss functions: cross-entropy, MSE, logistic regression. Statistical foundations of modern deep learning.

<!-- tier:undergrad -->
# MLE (Undergrad)

## Examples

**Bernoulli (binary outcomes)**: parameter `p` (success probability).
```
log L = Σ y_i log p + (1 - y_i) log (1 - p)
∂(log L)/∂p = 0 → p̂ = mean(y)
```

The MLE for a binomial proportion is just the empirical proportion. Familiar.

**Gaussian (normal)**: parameters `μ, σ²`.
```
log L = -n/2 log(2πσ²) - (1/2σ²) Σ (x_i - μ)²
```
Setting derivatives to zero: `μ̂ = mean(x)`, `σ̂² = mean((x_i - μ̂)²)`.

The MLE for a normal mean is the sample mean. Variance MLE is biased low; the unbiased estimator divides by `n - 1` instead of `n`.

## In ML

Cross-entropy classification:
```
L = -Σ y_i log p(y_i | x_i, θ)
```

This is the negative log-likelihood under a categorical model. Minimizing cross-entropy = MLE under Bernoulli/categorical assumptions.

MSE regression:
```
L = Σ (y_i - f(x_i, θ))²
```

Negative log-likelihood (up to constants) under Gaussian-noise assumption. Minimizing MSE = MLE for the mean function.

Most modern ML loss functions are MLE in disguise. Understanding the statistical framing helps when designing custom objectives.

## Properties

**Consistency**: as `n → ∞`, `θ̂_MLE → θ_true` (under regularity conditions).

**Asymptotic normality**: `√n (θ̂_MLE - θ) → N(0, I^{-1}(θ))` where `I` is the Fisher information.

**Asymptotic efficiency**: achieves the Cramér-Rao lower bound on variance.

These are large-sample guarantees. Small-sample MLE can be biased; corrections like REML or jackknife exist.

<!-- tier:grad -->
# MLE (Grad)

## Fisher information

The Fisher information `I(θ)` measures how much information observations carry about `θ`:

```
I(θ) = -E[∂²log p(X | θ) / ∂θ²]
```

(Or equivalently, the variance of the score function `∂log p / ∂θ`.)

The MLE's asymptotic variance is `I^{-1}(θ) / n`. More information per observation → more precise estimates.

For Gaussians with known variance: `I(μ) = 1/σ²`. Estimator variance = `σ²/n`. Confirms what we know.

## When MLE fails

- **Local maxima**: log-likelihood may not be concave (especially in deep models). Optimization gets stuck. Multiple restarts; SGD's stochasticity helps.
- **Boundary problems**: MLE on the boundary (e.g., `p̂ = 0` for a Bernoulli) has degenerate behavior; standard error estimates break.
- **Identifiability**: if multiple `θ` give the same likelihood, MLE is ambiguous. Common in mixture models.
- **Small samples**: bias is `O(1/n)`; small `n` → meaningful bias.

For small samples or complex models: regularized MLE (L1/L2 penalties) or fully Bayesian methods are often better.

## Bayesian connection

Bayesian inference: `p(θ | data) ∝ p(data | θ) · p(θ)`.

If the prior is uniform: posterior mode = MLE. If prior is informative: posterior mode = MAP estimate (≠ MLE).

MLE is 'Bayesian inference with uniform priors + only the mode'. It throws away uncertainty information that Bayesian methods preserve.
