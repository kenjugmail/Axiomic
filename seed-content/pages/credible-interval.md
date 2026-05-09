---
title: Credible Interval
category: stats
---
<!-- tier:intro -->
# Credible Interval

The Bayesian analog of a frequentist confidence interval. A 95% credible interval contains the parameter with 95% posterior probability.

`P(θ ∈ [a, b] | data) = 0.95`

Direct probabilistic statement about θ. Different interpretation from a frequentist confidence interval (which is about the procedure, not the parameter).

<!-- tier:undergrad -->
# Credible Interval (Undergrad)

## Computing one

Given a posterior `p(θ | data)`:

- **Quantile-based credible interval**: `[Q_{2.5}, Q_{97.5}]` of the posterior. Symmetric tails.
- **Highest posterior density (HPD)**: the smallest interval containing 95% probability mass. Often shorter than quantile-based for skewed posteriors.

For samples from MCMC:
```python
ci_low, ci_high = np.percentile(posterior_samples, [2.5, 97.5])  # quantile
```

For HPD:
```python
import arviz as az
hpd = az.hdi(posterior_samples, hdi_prob=0.95)
```

## Versus confidence interval

|             | Confidence interval | Credible interval |
|-------------|---------------------|-------------------|
| Statement   | About procedure     | About parameter |
| Random | The interval | The parameter |
| Interpretation | "In repeated experiments, ~95% of intervals cover θ" | "Posterior probability θ is in this interval is 95%" |

The interpretive distinction is real but often overstated. For most ML purposes with reasonable priors and moderate data, the two intervals give similar numbers.

## In ML evaluation

Credible interval for a Bayesian A/B test:
- Posterior over the treatment effect → 95% credible interval directly tells you 'effect is between [a, b] with 95% probability'.
- More natural for decision-making than 'frequentist 95% CI of the procedure'.

Bayesian A/B platforms (GrowthBook, etc.) report credible intervals for this reason — they're easier for product managers to interpret correctly.

<!-- tier:grad -->
# Credible Interval (Grad)

## HPD vs equal-tail

For unimodal symmetric posteriors: equivalent.

For skewed posteriors: HPD is shorter; equal-tail is simpler.

For multimodal posteriors: HPD can be a union of disjoint intervals (covering the modes). Equal-tail is contiguous but might exclude posterior mass in one mode and include low-probability tails in another.

For ML: usually unimodal; equal-tail is fine.

## Coverage probability

Frequentist CIs guarantee a coverage probability under the procedure: in 95% of hypothetical experiments, the interval covers the true parameter.

Credible intervals don't have this guarantee. Their coverage depends on the prior.

When prior matches the true distribution of θ: credible intervals have correct coverage. When prior is wrong: coverage can be substantially off.

For weakly-informative priors with moderate data: empirical coverage is usually close to the nominal level. Use both methods (frequentist + Bayesian) and check they agree.

## In Bayesian ML

Credible intervals appear in:
- Bayesian neural network predictions (per-prediction posterior intervals).
- A/B test analysis (posterior over treatment effects).
- Hyperparameter tuning (Bayesian optimization tracks credible intervals over the objective).
- Hierarchical models (per-group parameter intervals).

Always report intervals, not just point estimates. The interval is the actual answer; the point is just the most-likely value.
