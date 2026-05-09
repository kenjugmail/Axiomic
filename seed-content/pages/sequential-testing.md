---
title: Sequential Testing
category: stats
---
<!-- tier:intro -->
# Sequential Testing

Methods that allow continuous monitoring of an experiment without inflating the Type I error rate from peeking.

The naive approach — peek every day, stop when p < α — has Type I rate of ~30%+ rather than the nominal 5%. Sequential testing methods provide valid inference under continuous monitoring.

<!-- tier:undergrad -->
# Sequential Testing (Undergrad)

## The peeking problem

Run an A/B test. Peek at day 1: not significant. Peek at day 2: not significant. Peek at day 3: p < 0.05 — stop and ship.

This procedure has Type I rate much higher than 5%. Each peek is a chance to falsely reject; with infinite peeks the probability of *eventually* crossing 0.05 approaches 1, even with no true effect.

Empirically: 5-10 peeks → ~30-40% Type I rate. Disastrous for any team relying on the nominal 5%.

## Group sequential (alpha spending)

Pre-decide N peeks at fixed times (e.g., daily for 14 days). Allocate the total α budget across the peeks via an 'alpha-spending function'.

**O'Brien-Fleming**: very strict early; relaxes at the end. Conservative for early peeks; full power at the end.

**Pocock**: equal α per peek. Easy interpretation; less powerful than O'Brien-Fleming.

Modern A/B platforms implement these via boundary tables: at each peek, compare to a pre-computed threshold based on the cumulative information.

## Always-valid p-values

Methods that allow continuous (not just at fixed peek times) monitoring with valid inference.

**mSPRT (mixture sequential probability ratio test)**: Bayesian; computes a likelihood ratio with mixture prior. Always-valid p-value at any moment.

**Confidence sequences**: a sequence of confidence intervals, valid simultaneously across all sample sizes. The interval at time `t` covers the true parameter with probability `≥ 1 - α` jointly across all `t`.

**Bayesian posteriors**: monitor `P(effect > 0 | data)` continuously. Stop when it crosses a decision threshold. Naturally handles peeking.

For ML A/B at scale: confidence sequences (e.g., from Howard et al. 2021) are the modern recommendation. Distribution-free; computationally cheap; mathematically clean.

<!-- tier:grad -->
# Sequential Testing (Grad)

## SPRT (sequential probability ratio test)

The original sequential test (Wald 1945). For testing `H₀: θ = θ₀` vs `H₁: θ = θ₁`:

```
Λ_n = ∏_i p(x_i | θ_1) / p(x_i | θ_0)
```

After each new data point:
- If `Λ_n ≥ A`: reject H₀.
- If `Λ_n ≤ B`: accept H₀.
- Otherwise: continue.

`A` and `B` chosen to control Type I + Type II rates.

SPRT is **optimal**: among all tests with given α and β, SPRT requires the smallest expected sample size to make a decision. Beautiful theoretical result.

Limitations: requires a point alternative `θ₁`. Real applications have composite alternatives.

## Always-valid confidence intervals

Confidence sequences extend the SPRT idea to interval estimation. The sequence `{[L_n, U_n]: n ≥ 1}` has the property that `P(θ ∈ [L_n, U_n] for all n ≥ 1) ≥ 1 - α`.

This is much stronger than 'each interval covers θ with probability 1 - α'. The intervals are valid jointly across all sample sizes.

You can stop at any sample size and report the interval as a valid frequentist 95% CI.

Modern formulations: `t-distribution-based confidence sequences` (Howard et al. 2021), `betting-based confidence sequences` (Waudby-Smith & Ramdas 2024). Standard in modern A/B platforms.

## When peeking is OK

- **With sequential-testing protections**: any method above. Designed for continuous monitoring.
- **As a sanity check** (without changing decisions): looking at the data without acting on it doesn't bias inference.
- **For diagnostics**: checking sample-ratio mismatch, randomization quality, instrumentation. These don't test the primary hypothesis.

When peeking is bad: looking at the primary metric + stopping early without sequential-testing methods. The classic naive A/B mistake.

## Practical decision tree

For A/B testing:
1. **Pre-register sample size + analysis** + **don't peek**: simplest; correct; conservative.
2. **Group sequential design**: pre-decide peeks; allocate α. Standard for clinical trials.
3. **Confidence sequences**: continuous monitoring with full validity. Modern best-practice for product A/B.

Modern platforms (GrowthBook, Statsig) implement (3) by default. If rolling your own, use (1) or implement (2)/(3) carefully.
