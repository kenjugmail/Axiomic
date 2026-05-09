---
title: Priors, Likelihoods, Posteriors
category: stats
---
<!-- tier:intro -->
# Bayes' Rule

The foundational equation of Bayesian inference:

```
p(θ | data) = p(data | θ) × p(θ) / p(data)
```

In words: **posterior** = **likelihood** × **prior** / **evidence**.

- **Prior `p(θ)`**: belief about θ before seeing data.
- **Likelihood `p(data | θ)`**: how data is generated given θ.
- **Posterior `p(θ | data)`**: belief about θ after seeing data.
- **Evidence `p(data)`**: normalizing constant.

<!-- tier:undergrad -->
# Bayes (Undergrad)

## Conjugate priors

Combinations where prior + likelihood give a posterior in the same family. Closed-form math; useful for textbook examples.

**Beta-Bernoulli**: estimating a probability `p`.
- Prior: `Beta(α, β)`.
- Likelihood: `Bernoulli(p)` for `n` observations with `k` successes.
- Posterior: `Beta(α + k, β + n - k)`.

The prior parameters `α, β` represent 'pseudo-counts' of prior success/failure observations.

**Gaussian-Gaussian**: estimating a mean with known variance.
- Prior: `N(μ_0, σ_0²)`.
- Likelihood: `N(μ, σ²)` for `n` observations with sample mean `x̄`.
- Posterior: `N(μ_post, σ_post²)` with closed-form expressions.

**Gamma-Poisson**: estimating a rate.
- Prior: `Gamma(α, β)`.
- Posterior: `Gamma(α + Σx_i, β + n)`.

These are the textbook examples. Real applications usually require non-conjugate models + numerical inference (MCMC, VI).

## Choosing a prior

**Informative prior**: encodes domain knowledge. 'Heads probability for a typical coin is around 0.5' → Beta(50, 50) is highly concentrated around 0.5.

**Weakly-informative prior**: broad enough to not bias the posterior much; tight enough to regularize. Beta(2, 2) for a probability — slight pull toward 0.5 but very loose.

**Improper / uniform prior**: 'no information'. Sometimes called 'objective Bayesian'. The posterior reverts toward MLE.

For ML applications: weakly-informative priors are usually right. They regularize small data while letting the data dominate when there's plenty.

<!-- tier:grad -->
# Bayes (Grad)

## Why the posterior is a distribution, not a point

MLE gives a point estimate `θ̂`. Bayesian inference gives a *distribution* over `θ`. Why this matters:

- **Uncertainty quantification**: posterior variance tells you how confident to be.
- **Decision-making**: integrate over the posterior to compute expected utilities of decisions.
- **Predictive distribution**: `p(y_new | data) = ∫ p(y_new | θ) p(θ | data) dθ`. Captures uncertainty in θ in the predictions.

The posterior 'mode' (MAP estimate) is just one summary; the full distribution carries more information.

## Computing posteriors

**Closed-form**: only for conjugate cases. Simple but restrictive.

**MCMC**: sample from the posterior via Markov chains. Stan, PyMC, NumPyro implement this. Slow for large models.

**Variational inference**: approximate posterior with a parameterized family. Faster; less accurate.

**Laplace approximation**: Gaussian centered at MAP, with covariance from Hessian. Cheap; only accurate when posterior is approximately Gaussian.

**Approximate Bayesian computation (ABC)**: when you can simulate from `p(data | θ)` but can't compute the likelihood. Sample-based; coarse.

## Bayesian model averaging

When uncertain between multiple models `M_1, M_2, ...`:

```
p(y_new | data) = Σ_M p(y_new | data, M) p(M | data)
```

Rather than picking the 'best' model, average over the posterior over models. Reduces overfitting; provides honest uncertainty.

For ML: deep ensembles approximate this informally; explicit Bayesian model averaging is rare in production.

## When Bayes 'feels right'

- Small datasets where regularization matters.
- Sequential learning where today's posterior is tomorrow's prior.
- Decisions that propagate uncertainty (risk-aware policies).
- Hierarchical models where statistical strength is shared.

For most ML: frequentist methods agree with Bayes at large data. Choose based on what's easier; the philosophy debate is mostly orthogonal to good practice.
