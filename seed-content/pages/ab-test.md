---
title: A/B Testing
category: stats
---
<!-- tier:intro -->
# A/B Testing

Run two variants in parallel against random subsets of production traffic; compare outcomes; decide which is better.

The dominant evaluation method in product ML. Every major tech company runs thousands of A/B tests per quarter.

<!-- tier:undergrad -->
# A/B Testing (Undergrad)

## Standard recipe

1. **Define hypothesis**: 'New ranking model improves CTR by ≥ 1% absolute'.
2. **Pre-register**: hypothesis, primary metric, sample size, analysis plan, decision rule.
3. **Power analysis**: compute required sample size for the smallest meaningful effect. For a CTR test detecting 1% improvement at p=5%, baseline 0.05, power 0.80: ~10K users per arm.
4. **Randomly assign**: hash user ID; stable bucket assignment.
5. **Run for planned duration**: don't peek + stop early without sequential testing protections.
6. **Analyze**: compute effect estimate + CI; check guardrail metrics; check pre-registered subgroups.
7. **Decide**: ship if primary metric improved + guardrails not regressed.

## Metric selection

- **Primary metric**: the one used for the ship/no-ship decision. Pre-register; don't change mid-experiment.
- **Guardrail metrics**: must not regress. Latency, error rate, accessibility scores.
- **Secondary metrics**: monitored but don't drive the decision. Useful for HTE analysis + future hypotheses.
- **OEC (Overall Evaluation Criterion)**: when balancing multiple metrics, define a weighted combination.

## Common pitfalls

**Peeking**: looking at results mid-experiment + stopping when significant. Inflates Type I from 5% to 30%+.

**P-hacking**: running many analyses; reporting only significant ones.

**HARKing**: deciding the hypothesis after seeing the data.

**Underpowered design**: tested at n that can't detect realistic effects.

**SUTVA violations**: 'Stable Unit Treatment Value Assumption' fails. Network effects (treated user affects untreated friend), supply-side spillovers (treated user buys X, depriving control user), capacity constraints. Hard to handle; an active research area.

**Novelty effects**: week-1 results don't reflect long-term. Shipping on week-1 wins is risky.

## Tooling

**Self-built**: hash-bucket assignment + Postgres logs + pandas analysis. Works for simple needs.

**Production platforms** (Optimizely, GrowthBook, LaunchDarkly): full sequential testing, OEC dashboards, segment analysis. Standard at large companies.

**Open-source**: Wasabi, Sixpack, Eppo. Self-hostable; competitive with commercial.

<!-- tier:grad -->
# A/B Testing (Grad)

## CUPED variance reduction

**CUPED (Controlled-experiment Using Pre-Existing Data)**: use pre-experiment data as a covariate to reduce variance in the treatment-effect estimate.

```
Y_adj = Y - β · X_pre
```

where `X_pre` is the user's pre-experiment metric value. Subtracts predictable variation; leaves residual that's the treatment effect.

Reduces variance by 30-60% on metrics with high pre-period correlation. Standard in modern A/B platforms.

## Sequential testing methods

- **Group sequential designs (alpha spending)**: pre-decide N peeks; allocate α per peek. Standard.
- **mSPRT (mixture sequential probability ratio test)**: Bayesian; provides always-valid p-values.
- **Confidence sequences**: like CIs but valid simultaneously across all sample sizes.

These let you peek without breaking the false-positive rate. Naive peeking inflates Type I dramatically; sequential methods don't.

## Heterogeneous treatment effects

ATE = average over the population. But the treatment may help some users and hurt others. The HTE analysis:

1. Identify pre-specified subgroups (mobile/desktop, country, tenure).
2. Estimate effect within each.
3. Apply multiple-testing correction.
4. Look for subgroups with markedly different effects.

If the average is positive but one major segment shows negative effect: ship gated to the segments where it helps. Better than rolling back entirely.

**Causal forests** (Wager 2018): use random forests to estimate per-user treatment effects. Identifies HTE structure automatically.

## Long-term effects

Week-1 effects often differ from year-1 effects. Reasons:
- **Novelty**: users engage with anything new initially.
- **Learning**: users discover how to use the new feature over time.
- **Selection**: dropout rates differ between arms.
- **Reactive systems**: post-deploy changes alter the distribution.

Solutions:
- **Holdout cohorts**: keep some users on the old version permanently; compare years later.
- **Long-running A/B**: run for months; assume short-term + long-term effects converge.
- **Surrogate metrics**: short-term metrics that correlate with long-term outcomes.

This is the hardest open problem in production A/B testing.
