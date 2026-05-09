---
title: The Bootstrap
category: stats
---
<!-- tier:intro -->
# The Bootstrap

A non-parametric method for estimating the sampling distribution of a statistic. Resample your data with replacement; compute the statistic on each resample; the distribution of resampled statistics approximates the sampling distribution.

Introduced by Efron in 1979. Now ubiquitous because it works for almost any statistic without parametric assumptions.

<!-- tier:undergrad -->
# Bootstrap (Undergrad)

## Algorithm

```python
B = 1000  # number of bootstrap replicates
bootstrap_stats = []
for b in range(B):
    sample = random.sample(data, len(data), replace=True)
    bootstrap_stats.append(statistic(sample))
```

`bootstrap_stats` is a sample from the (estimated) sampling distribution.

**What you can compute**:
- **Standard error**: `np.std(bootstrap_stats)`.
- **Confidence interval**: `(np.percentile(bootstrap_stats, 2.5), np.percentile(bootstrap_stats, 97.5))` for 95% CI.
- **Bias**: `np.mean(bootstrap_stats) - statistic(data)`.

## Why this works

The original sample is a draw from the true distribution. The bootstrap resamples from the original sample. Under mild conditions, the bootstrap-resample distribution converges to the true sampling distribution as `n → ∞`.

The intuition: the empirical distribution function (the histogram of the data) is a consistent estimator of the true distribution. Resampling from the empirical distribution mimics resampling from the true one.

## In ML evaluation

```python
# Bootstrap accuracy CI
n = len(test_set)
B = 1000
acc_samples = []
for b in range(B):
    idx = np.random.choice(n, n, replace=True)
    acc_b = (predictions[idx] == labels[idx]).mean()
    acc_samples.append(acc_b)

ci_low, ci_high = np.percentile(acc_samples, [2.5, 97.5])
```

This is the universal recipe. Works for accuracy, F1, any per-example metric. ~1 second of compute for 1000 replicates on a 10K-example test set.

<!-- tier:grad -->
# Bootstrap (Grad)

## Variants

**BCa (bias-corrected and accelerated)**: more accurate than percentile bootstrap for skewed distributions. Available in `scipy.stats.bootstrap`. Use when distribution is skewed.

**Block bootstrap**: for time-series or clustered data, resample blocks of consecutive observations to preserve dependence structure. Critical when iid assumption fails.

**Bayesian bootstrap**: instead of binary resample weights, use Dirichlet-distributed weights. Gives smooth posterior over statistics.

## When bootstrap fails

- **Very small samples** (`n < 20`): bootstrap distribution is too discrete. Use parametric methods if you can.
- **Heavy tails**: bootstrap inherits the tail of the data; estimates of high quantiles are unreliable.
- **Statistics with non-smooth functionals**: max, min — bootstrap CIs are biased. Special-purpose methods exist.
- **Censored / truncated data**: requires censoring-aware bootstrap.

## Computational efficiency

For large datasets, even 1000 replicates is fast — each is just an indexing + simple statistic. Vectorize across replicates when possible:

```python
# Vectorized 1000-replicate bootstrap of accuracy
B = 1000
n = len(test_set)
indices = np.random.randint(0, n, size=(B, n))
acc_samples = (predictions[indices] == labels[indices]).mean(axis=1)
```

This runs 1000 replicates in ~milliseconds for typical sizes. No excuse not to bootstrap.

The bootstrap is one of the most-underused tools in ML evaluation. Always bootstrap your benchmarks; reporting point estimates without intervals is statistical malpractice.
