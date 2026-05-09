---
title: Power Analysis
category: stats
---
<!-- tier:intro -->
# Power Analysis

The discipline of planning sample sizes so a hypothesis test has a real chance of detecting the effect you care about.

Power = probability of correctly rejecting H₀ when H₁ is true. Conventionally targeted at 0.80.

Power, α, effect size, and sample size are linked. Specify three; the fourth is determined.

<!-- tier:undergrad -->
# Power Analysis (Undergrad)

## The four-quantity relationship

For a two-sample t-test (equal sized groups, normal data):

```
n ≈ 2 (z_{α/2} + z_β)² σ² / δ²
```

- `n` = sample size per group
- `α` = significance level (typically 0.05) → z_{α/2} ≈ 1.96
- `β` = Type II rate → z_β depends on power. For 80% power: z_β ≈ 0.84
- `σ²` = within-group variance
- `δ` = effect size (mean difference) you want to detect

Pick three; compute the fourth.

## Example

Test for a mean accuracy improvement: baseline `p_0 = 0.85`. Goal: detect `p_1 = 0.86` (1% absolute improvement) at α = 0.05, power = 0.80.

For binomial: variance ≈ p(1-p) = 0.85 × 0.15 = 0.1275.

`n ≈ 2 × (1.96 + 0.84)² × 0.1275 / (0.01)² ≈ 20,000` per group.

So you need ~20K examples in each group to reliably detect a 1% improvement. Usually a wakeup call for ML teams who run benchmarks at n = 1000.

## Tools

- **Python `statsmodels.stats.power`**: closed-form power calculations for many test types.
- **G*Power**: standalone software; full UI for power analysis.
- **R `pwr` package**: similar.

For most ML evaluation: `statsmodels` is fine. Compute required `n` for the smallest effect you'd care about; verify your test set is large enough.

## Why this gets skipped

Most ML papers don't do power analysis. Symptoms:
- 'Method A and method B are not significantly different' → was the test underpowered?
- Inconsistent results across papers using different test sets → power varies; some are detection-limited.
- Field slowly converging on benchmarks of 'reasonable size' (10K+ examples) — implicit power reasoning.

Always at least sketch a power calculation before claiming a non-result.

<!-- tier:grad -->
# Power Analysis (Grad)

## Effect size as the limiting variable

Power formulas all have `δ²` in the denominator. Halving the effect quadruples the required sample size.

For ML, where 'effect' is often a small accuracy improvement (1%), required sample sizes are large.

A 0.5% absolute improvement: n ≈ 80K. A 0.1% improvement: n ≈ 2M. ML benchmarks of 1000-10000 examples can't reliably detect small but real effects.

This is one reason ML papers often report 'no significant improvement' on small benchmarks, only to find genuine improvement when scaled up. The benchmark was underpowered.

## Sequential power analysis

For [[ab-testing]]: power analysis at the start gives planned sample size. But the actual effect size is unknown; could be smaller than expected.

**Sequential power analysis**: as data accumulates, recompute estimated effect size + required `n`. Decide:
- Continue if estimated `n` is achievable.
- Stop early if effect is much larger than expected (group sequential designs handle this).
- Abort if estimated `n` is unrealistically large.

This is what mature A/B platforms do under the hood.

## Bayesian alternatives

Bayesian decision theory: compute posterior over the effect size; decide based on expected utility of decision under that posterior.

For A/B testing: the threshold isn't 'p < 0.05' but 'P(effect > minimum_meaningful | data) > some_threshold'. Different machinery; doesn't require pre-specified power calculations in the same way.

For ML evaluation: most teams stick with frequentist + power analysis because tooling + culture is well-established. Bayesian alternatives are emerging in newer A/B platforms.

## What if you can't power up?

Sometimes the budget can't get you to adequate sample size. Then:
- Be explicit about the effect-size detection limit.
- Report 'we can detect effects of size > X with this test'.
- Avoid claiming 'no effect' when truly underpowered — the data is simply silent.

Underpowered tests aren't *wrong*; they're *uninformative*. Don't overclaim from them.
