---
title: Treatment Assignment
category: causal
---
<!-- tier:intro -->
# Treatment Assignment

The **treatment assignment mechanism** is the rule by which units get treated. Causal identification depends critically on this mechanism.

Three regimes, in order of how easy causal inference becomes:

1. **Randomized**: assignment is independent of potential outcomes. ATE estimable directly. RCTs.
2. **Selection on observables**: assignment depends on observed covariates `X`, but conditional on `X`, is as-good-as-random. ATE estimable via adjustment.
3. **Confounded**: assignment depends on unobserved factors. ATE not generally identifiable from observation; need IV, RDD, DiD, or experiment.

Most ML training data is in regime 3. Most ML papers act as if it's regime 1 or 2.

<!-- tier:undergrad -->
# Treatment Assignment (Undergrad)

## The hierarchy of regimes

**Regime 1: randomization**

`T ⊥ (Y(0), Y(1))`

Treatment is independent of all potential outcomes by design. This is the gold standard. RCTs handle:

- Observed confounders (irrelevant; randomization breaks the confounding).
- Unobserved confounders (also irrelevant; randomization handles them too).
- Selection on outcome (irrelevant under proper randomization).

The cost: you have to actually be able to randomize. Many causal questions can't be answered this way.

**Regime 2: ignorability conditional on `X`**

`T ⊥ (Y(0), Y(1)) | X`

Treatment depends on observed `X`, but conditional on `X` is as-good-as-random. This is the "selection on observables" assumption. ATE is identifiable via:

- Regression adjustment for `X`.
- Propensity-score matching.
- Inverse-probability weighting.
- Doubly-robust estimators.

**The catch**: you must observe ALL confounders. Unobserved confounders break the assumption silently.

**Regime 3: confounded assignment**

Treatment depends on unobserved factors. None of the above work. Need:

- **IV (instrumental variable)**: a variable affecting `T` but not `Y` directly.
- **RDD (regression discontinuity)**: a sharp threshold rule for `T`.
- **DiD (difference-in-differences)**: parallel-trends assumption + pre-post data.
- **Experiment**: actually intervene.

## Selection mechanisms in observational data

**User-driven selection**: users choose to use the new feature. If the choice correlates with engagement (heavy users adopt faster), the comparison is confounded by engagement.

**System-driven selection**: a recommender shows different items to different users. The recommender's policy is the assignment mechanism. Even if random, it depends on observed user features.

**Doctor-driven selection**: physicians choose treatment based on patient observed and unobserved characteristics. The unobserved characteristics (clinical judgment, severity not captured in the EHR) are the confounders.

**Time-driven selection**: a policy is rolled out over time. Earlier and later adopters differ in unobserved ways.

## A/B testing as randomization

A clean A/B test creates regime 1: random assignment of users to treatment or control. The simplicity of A/B causal inference comes from this — no DAGs, no propensity scores, just random assignment.

**Failure modes that break the randomization**:

- **Sample-ratio mismatch**: if 60% land in treatment when expected 50%, randomization is broken; investigation needed.
- **Network effects / interference**: my treatment affects your outcome (social network experiments). SUTVA violated.
- **Crossover**: users in control see the treatment by mistake (or learn from treated users).
- **Differential attrition**: treatment causes some users to leave the experiment, biasing the remaining sample.

These convert a clean RCT into a quasi-experiment requiring more careful analysis.

<!-- tier:grad -->
# Treatment Assignment (Grad)

## Strong vs weak ignorability

**Strong ignorability** (Rubin's term): `(Y(0), Y(1)) ⊥ T | X` AND `0 < P(T = 1 | X) < 1`. Both ignorability + overlap.

**Weak ignorability**: `Y(0) ⊥ T | X` AND `Y(1) ⊥ T | X` (separately, not jointly). Slightly weaker; equivalent for ATE under SUTVA.

In practice the distinction rarely matters; "ignorability" without modifier usually means strong.

## Conditional vs marginal randomization

**Marginal randomization**: `T ⊥ (Y(0), Y(1))`. Pure RCT.

**Conditional randomization** (stratified RCT): `T ⊥ (Y(0), Y(1)) | S` where `S` is a stratification variable. Treatment is randomized WITHIN strata, possibly with different probabilities across strata.

Stratified designs improve precision by balancing strata. The analysis must account for the stratification.

## Encouragement designs

A randomized encouragement to take treatment, with non-mandatory compliance. Used when:

- Mandating treatment is unethical or impractical.
- The policy-relevant question is about the effect of *promoting* treatment, not the effect of treatment itself.

The encouragement is exogenous; actual treatment is endogenous. Use the encouragement as an IV for treatment. Estimates LATE (effect on compliers).

## Stepped-wedge designs

Cluster-level treatments rolled out in stages. All clusters end up treated, but in different orders. Useful when:

- A cluster-level intervention can't be withheld permanently.
- Time effects need to be modeled.

Estimation requires careful modeling of time effects + cluster random effects. Recent work (Roth-Sant'Anna 2023) has improved the estimators.

## Instrumental variable as recovered randomization

When no ignorability holds, an instrument `Z` recovers a *partial* randomization. `Z` is randomly assigned (or as-good-as-random); it affects `T`; the random component of `T` is what's exploited for causal estimation.

This is why the strongest IVs are randomization-based (Vietnam draft lottery; A/B-tested encouragement). Random sources of variation in the world are precious — find them and exploit them.

## Production ML implications

For ML systems making decisions:

- **Production logging**: log everything about the assignment mechanism. Future causal analysis of the deployed system requires it.
- **Hold-out groups**: keep a small randomly-assigned hold-out (no treatment) when possible. Allows ongoing causal estimation of the deployed system.
- **Counterfactual logging**: log what the DEFAULT model would have predicted alongside the treatment model. Enables off-policy evaluation later.

These design choices make causal analysis feasible after deployment. Without them, causal questions about the deployed system become intractable.

## References

- Rosenbaum & Rubin 1983. The central role of the propensity score in observational studies for causal effects. *Biometrika*.
- Imbens 2000. The role of the propensity score in estimating dose-response functions. *Biometrika*.
- Athey & Imbens 2017. The state of applied econometrics: causality and policy evaluation. *J. Econ. Perspectives*.
