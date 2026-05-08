---
title: Sampling Distribution
category: stats
---
<!-- tier:intro -->
# Sampling Distribution

The distribution of a statistic across hypothetical repeated experiments. The core frequentist concept.

If you ran your experiment many times, each run would produce a slightly different statistic (sample mean, regression coefficient, accuracy estimate). The distribution of these statistics is the sampling distribution.

Standard deviation of a sampling distribution is the **standard error**.

<!-- tier:undergrad -->
# Sampling Distribution (Undergrad)

## Why we care

We never run our experiment 1000 times. We run it once and get a statistic. The sampling distribution tells us the *uncertainty* — how much would this statistic have differed if we'd happened to sample different data?

For the sample mean of `n` iid observations from a distribution with mean `μ` and variance `σ²`:
- Mean of sampling distribution: `μ`.
- Standard error: `σ / √n`.

Bigger `n` → smaller SE → tighter sampling distribution → more precise estimate.

## Central Limit Theorem

For sample means (and many other statistics), the sampling distribution is approximately Gaussian for large `n`, regardless of the underlying data distribution.

This is the workhorse of frequentist inference. Confidence intervals, hypothesis tests, p-values — all assume the sampling distribution is approximately Gaussian via CLT.

## In ML evaluation

For an accuracy estimate `p̂` on a test set of size `n`:
- True accuracy: `p`.
- Standard error: `√(p(1-p) / n)`.
- 95% CI: `p̂ ± 1.96 · SE`.

For `n = 1000`, `p̂ = 0.85`: SE ≈ 0.011, 95% CI ≈ [0.828, 0.872]. Two reported accuracies of 0.847 vs 0.853 are likely indistinguishable.

<!-- tier:grad -->
# Sampling Distribution (Grad)

## Beyond the mean

Sampling distributions exist for any statistic: median, IQR, regression coefficients, ratios. The CLT covers many but not all (e.g., extreme order statistics).

For exotic statistics: use [[bootstrap]] to numerically estimate the sampling distribution.

## When CLT fails

- **Heavy-tailed distributions**: Cauchy distribution has no finite mean; sample means don't converge to a Gaussian (or anywhere).
- **Small `n`**: CLT is asymptotic; for `n < 30` and skewed underlying data, the Gaussian approximation can be poor.
- **Highly dependent data**: CLT assumes iid. With time-series or clustered data, you need cluster-aware standard errors.

For most ML evaluation: data is iid, sample sizes moderate-to-large, CLT applies. Trust it cautiously; use bootstrap when in doubt.
