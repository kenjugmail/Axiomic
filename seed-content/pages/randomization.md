---
title: Randomization
category: stats
---
<!-- tier:intro -->
# Randomization

The foundation of causal inference. By randomly assigning units to treatment vs control, you ensure (in expectation) the two groups are balanced on all confounders — measured and unmeasured.

Without randomization, observed differences between groups can be due to confounding rather than treatment.

<!-- tier:undergrad -->
# Randomization (Undergrad)

## Why it works

Random assignment makes the treated and control groups exchangeable in expectation. The two groups have the same distribution of every variable, including ones you didn't measure.

Therefore, any observed difference in outcomes is due to the treatment (in expectation). The simple difference of group means is the unbiased causal effect.

This is the genius of RCTs. Confounding is solved by design, not analysis.

## Implementation in ML

**A/B testing**: hash users via stable identifier (user ID); assign to treatment based on hash bucket. Sticky: same user always gets same arm.

```python
def assign_user(user_id, p_treated=0.5):
    hash_value = hashlib.md5(user_id.encode()).hexdigest()
    bucket = int(hash_value[-4:], 16) / 16**4  # 0 to 1
    return 'treatment' if bucket < p_treated else 'control'
```

**Train/test splits**: random shuffle before splitting.

**Cross-validation**: random fold assignment.

## Stratified randomization

When the population is heterogeneous, plain random assignment can produce unbalanced groups by chance.

**Stratification**: divide the population into strata; randomize within each stratum. Ensures balance on the stratification variables.

For ML: stratify by class (especially for imbalanced datasets) so train + test have similar class distributions.

For A/B: stratify by user segment (mobile/desktop, country, tenure bucket) so treatment + control are similar in known important variables.

<!-- tier:grad -->
# Randomization (Grad)

## Cluster randomization

When units within a cluster are correlated (households, schools, network communities), randomize at the cluster level — not the individual level.

Why: individuals within the same cluster aren't independent. Treating them as independent inflates effective sample size; biases standard errors.

For social-network A/B testing: 'network effects' — treatment in one user spills over to friends. Random user-level assignment is biased; cluster-randomize at the connected component level. Hard in practice; an active research area.

## Imperfect randomization

Real-world A/B sometimes can't perfectly randomize:
- **Compliance issues**: assigned to treatment but didn't actually take it.
- **Spillovers**: treated user's behavior affects untreated user's outcome.
- **Drop-out**: differential loss from each arm.
- **Implementation bugs**: hash collision, sticky assignment failure.

Solutions:
- **Intent-to-treat (ITT) analysis**: analyze by *assigned* group regardless of compliance. Unbiased for the causal effect of being assigned.
- **Treatment-on-treated (TOT)**: analyze only those who complied. Biased; tells you the effect 'on those who would comply'.
- **Instrumental variables**: assignment as instrument for actual treatment.

For ML A/B: validate the randomization implementation. Check that group sizes are roughly equal (within Poisson noise), that stratification worked, that stickiness is intact.

## When you can't randomize

Some treatments can't be randomized (gender, country, smoking status). Causal claims require:
- Natural experiments (regression discontinuity, instrumental variables).
- Observational methods with strong assumptions (propensity score, difference-in-differences).
- Or accepting that you have correlation, not causation.

The [[causal-inference-basics]] lesson covers these.

## Randomization is the *cheapest* causal-inference tool

When you can randomize, do it. The math is simpler, the assumptions are weaker, the conclusions are stronger. Most ML A/B testing has this option; not all bio/medical/social-science research does.

If you find yourself reaching for sophisticated observational methods (matching, propensity scoring, IV) — first check whether you could just run a randomized experiment instead. Often you can, and the analysis becomes trivial.
