---
title: Randomized Controlled Trial (RCT)
category: stats
---
<!-- tier:intro -->
# RCT

The gold standard for causal inference. Randomly assign units to treatment vs control; compare outcomes.

Random assignment ensures (in expectation) the two groups are exchangeable on all confounders. The simple difference of group means is the unbiased causal effect.

A/B tests in software are RCTs.

<!-- tier:undergrad -->
# RCT (Undergrad)

## Why RCTs are special

Without randomization, observed differences between treated and untreated groups can be due to:
- The treatment itself.
- Confounding (treated and untreated groups differ on a third variable that affects the outcome).
- Selection effects (different kinds of people choose treatment).
- Reverse causation (the outcome affected the treatment, not vice versa).

Random assignment makes treated and control groups exchangeable in expectation. All confounders, measured and unmeasured, are balanced. Differences in outcomes are due to the treatment.

This is the magic. No other research design provides this guarantee.

## RCT analysis

Simple difference of means:
```
ATE_hat = mean(Y | T = 1) - mean(Y | T = 0)
SE = sqrt(Var(Y | T=1)/n_treated + Var(Y | T=0)/n_control)
95% CI = ATE_hat ± 1.96 · SE
```

That's it. No covariate adjustment needed (though it can reduce variance — see [[blocking-stratification]]).

## Limitations

**1. Ethical / practical constraints**: can't randomize cancer, gender, country, etc.

**2. External validity**: RCT participants may not represent the broader population. Effects in a research-context cohort may not transfer.

**3. Compliance**: people might not take the treatment they're assigned. Affects interpretation.

**4. Cost**: large RCTs are expensive. Sample sizes for small effects are big.

**5. Sequential dependencies**: in real-world rollouts, today's treatment might affect tomorrow's data distribution. Standard RCT analysis assumes static populations.

For ML A/B: most of these limitations are minor. Programmatic random assignment is cheap. Sample sizes are big. Compliance is high (the system applies the treatment automatically).

<!-- tier:grad -->
# RCT (Grad)

## Beyond simple A/B

**Multi-arm trials**: more than two arms. Increases multiple-testing concerns; usually requires correction.

**Adaptive trials**: rules for adjusting treatment allocation mid-experiment based on observed data. Multi-armed bandit logic. Faster convergence at the cost of complexity.

**Cluster RCTs**: randomize at the cluster level (households, schools, network communities). Necessary when units within clusters aren't independent.

**Stepped-wedge designs**: cluster sites get the treatment in a staggered sequence. Hybrid randomization + observational; useful when you want to roll out to everyone eventually.

## Compliance issues

In real RCTs, some assigned-to-treatment don't actually take it; some assigned-to-control take it from elsewhere.

**Intention-to-Treat (ITT)**: analyze by *assigned* group. Unbiased for the policy effect of being offered the treatment.

**As-Treated**: analyze by *actual* treatment. Biased; correlated with compliance which itself isn't randomized.

**Instrumental Variables (IV)**: assignment as instrument for actual treatment. Estimates the 'local average treatment effect' (LATE) — the effect on compliers.

ITT is conservative + standard. The other analyses give different effects with different interpretations.

## CUPED + variance reduction

Pre-experiment data on each user can reduce the variance of the ATE estimate. CUPED (Microsoft 2013):

```
Y_adj = Y - β · X_pre
```

Subtracts predictable pre-period variation. ATE estimate's SE drops by 30-60% on metrics with high pre-period correlation.

For ML A/B at scale: CUPED is standard. Mature platforms implement it; rolling your own is straightforward.

## Externally valid RCTs

Even a successful RCT in a controlled setting may not transfer to deployment. Reasons:
- **Population differences**: lab participants vs production users.
- **Hawthorne effects**: behavior changes when monitored.
- **Implementation drift**: the production system is different from the test system.
- **Long-term effects**: short-term lab studies don't capture year-1 outcomes.

Mitigations: replicate the RCT in production traffic; check for novelty effects; measure both short- and long-term outcomes.
