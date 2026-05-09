---
title: p-Values
category: stats
---
<!-- tier:intro -->
# p-Values

The most-misinterpreted statistic in science. A p-value is the probability, *under the null hypothesis*, of observing data at least as extreme as what was actually observed.

`p = P(T(data) ≥ T_observed | H₀ true)`

Small p → data is surprising under H₀ → reject H₀ at the chosen level α.

<!-- tier:undergrad -->
# p-Values (Undergrad)

## What it is

A summary of how unusual your data is, *if* the null hypothesis were true. A frequentist quantity about hypothetical repeated experiments.

Convention: p < 0.05 → reject H₀; p ≥ 0.05 → fail to reject. This is decision-procedure machinery, not a measure of truth.

## What it is NOT

- ❌ The probability that H₀ is true.
- ❌ The probability the result is due to chance.
- ❌ A measure of effect size.
- ❌ Evidence that H₁ is true.
- ❌ Reproducibility — small p doesn't mean replication.
- ❌ A measure of importance.

The American Statistical Association issued a 2016 statement specifically to clarify these misinterpretations.

## How to read p-values correctly

A p < 0.05 result means: the observed data would be unusual (occur < 5% of the time) under the null hypothesis. Therefore we reject the null at the 5% significance level.

The result is *consistent* with H₁ being true. It is *not proof* that H₁ is true.

For ML: 'we found a p < 0.05 difference between method A and method B' means 'the data is inconsistent enough with H₀ (A == B) at the 5% level that we reject H₀'. It says nothing about effect size or practical significance.

<!-- tier:grad -->
# p-Values (Grad)

## Common pitfalls

**1. Confusing P(data | H₀) with P(H₀ | data)**. The p-value gives the first; the second requires Bayesian analysis with priors.

**2. Treating p ≥ 0.05 as 'no effect'**. Failing to reject H₀ ≠ accepting H₀. Maybe the test was underpowered.

**3. Cherry-picking the lowest p-value across tests**. Multiple-testing correction is required.

**4. Stopping when significant** (peeking). Inflates Type I.

**5. Treating p as effect size**. p depends on both effect size and sample size; small p can come from a tiny effect with huge n.

**6. Confusing p with replicability**. A p = 0.04 result has only ~50% chance of replicating at p < 0.05.

## What to report instead

- **Effect size with confidence interval**: more informative than p-value alone.
- **Practical significance**: is the effect big enough to matter?
- **Pre-registered hypotheses + analysis plans**: prevents post-hoc cherry-picking.
- **Multiple testing correction** when running many tests.

For ML evaluation: bootstrap-based confidence intervals are usually more useful than p-values. They directly answer 'how precise is our estimate?'

## Beyond significance testing

Many statisticians + scientists argue against p-values entirely:
- **Estimation > testing**: prefer effect-size estimates with intervals.
- **Bayesian inference**: directly compute P(H | data).
- **Information criteria** (AIC, BIC): for model comparison without p-values.

The pragmatic position: p-values are useful as one piece of a broader evaluation. They're not the answer; they're one number alongside effect sizes, intervals, and (ideally) reproducibility.

The criterion for taking a p-value seriously: pre-registration + appropriate sample size + multiple-testing correction + realistic effect-size considerations + replication.
