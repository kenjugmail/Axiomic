---
title: ATE and ATT
category: causal
---
<!-- tier:intro -->
# ATE and ATT

Two of the most-named causal quantities:

- **ATE** (Average Treatment Effect): the average effect of treatment over the entire population. *"If we treated everyone, what would the average effect be?"*
- **ATT** (Average Treatment effect on the Treated): the average effect among those who actually got treated. *"Among the treated units, what's the average effect they got?"*

`ATE = E[Y(1) - Y(0)]`
`ATT = E[Y(1) - Y(0) | T = 1]`

Under randomization, ATE = ATT. Under observational data with selection on covariates, they differ.

<!-- tier:undergrad -->
# ATE and ATT (Undergrad)

## When the distinction matters

If a job-training program selectively enrolls unemployed people who are highly motivated, the ATE (effect on a randomly drawn person) and the ATT (effect on the actual program participants) likely differ. Motivated participants might benefit more (or less) than the average random person would.

**ATE answers**: "Should we extend this program to the population?"
**ATT answers**: "Did this program help the people who took it?"

These are different policy questions with different answers when treatment effects are heterogeneous.

## Estimation

**Under randomization**: ATE and ATT coincide. Both equal `E[Y | T = 1] - E[Y | T = 0]`. RCTs estimate both directly.

**Under observation (with ignorability)**:

- **ATE estimator**: average over the whole sample of `E[Y | T = 1, X] - E[Y | T = 0, X]`.
- **ATT estimator**: average over the treated sample only, using the same conditional means.

Practically:

- **Regression-based ATE**: fit `Y ~ T + X`; coefficient on `T` (under correct specification) is ATE.
- **Regression-based ATT**: harder; need to average treatment effects over the treated subsample.
- **Matching for ATT**: for each treated unit, find a matched control with similar `X`; average the difference. This is naturally an ATT estimator.
- **IPW for ATE**: weight treated by `1/P(T=1|X)`, controls by `1/P(T=0|X)`.

## ATC, CATE, LATE — siblings of ATE

- **ATC (Average Treatment effect on Controls)**: effect that would have occurred for the control units if they had been treated. `E[Y(1) - Y(0) | T = 0]`.
- **CATE (Conditional ATE)**: effect at a specific covariate value. `E[Y(1) - Y(0) | X = x]`. The function of `x`.
- **LATE (Local ATE)**: effect among compliers (units whose treatment status responds to an instrument). What IV identifies.

These are different estimands. A study might identify one but not others. Saying "the treatment effect" without specifying which is sloppy.

## Practical rule

Pre-specify which estimand you want before running the analysis. Match the estimand to the policy question:

- **Will we extend the policy broadly?** → ATE.
- **Did this specific intervention help its participants?** → ATT.
- **What if we required everyone to take this?** → ATE under different compliance assumption.
- **What does the policy mean for the marginal user we'd target?** → CATE at that user's covariate level, or LATE under a relevant instrument.

<!-- tier:grad -->
# ATE and ATT (Grad)

## When ATE = ATT?

Equality holds when:

- **Treatment is randomized** (no selection on outcomes-related variables).
- **Treatment effects are constant** in the relevant subgroup.

Both fail in real observational data. The gap between ATE and ATT in observational data is informative — it tells you about selection.

## Heckman's critique of ATE

Heckman has long argued that ATE often isn't policy-relevant. His critique:

- Most policy questions are about specific subpopulations (the treated, or the marginal user, or compliers under an instrument).
- ATE averages over a hypothetical "everyone treated" world that's rarely the policy context.
- Marginal Treatment Effect (MTE) — effect at the margin of treatment decision — is often more relevant for policy.

Modern practice: report multiple estimands; let readers see the heterogeneity.

## Identification gap

Even when ignorability holds for ATE estimation, ATT may have weaker requirements. Specifically:

- **ATE identification**: ignorability over the whole sample's `X` distribution.
- **ATT identification**: ignorability over the treated sample's `X` distribution only.

ATT is often easier to identify than ATE, especially when overlap is poor at extreme `X` values (treated and control samples have non-overlapping `X` distributions).

## Estimation under poor overlap

When propensity scores `e(X)` are near 0 or 1 for some `X`, IPW estimates of ATE blow up — the inverse weights become huge.

**Trimming**: drop observations with extreme `e(X)`. Trades coverage of the population for reduced variance.

**ATT instead of ATE**: ATT requires overlap only on the treated sample's `X` distribution. If only one tail has poor overlap, ATT may still be estimable.

**Matching**: nearest-neighbor matching naturally restricts to the overlapping support.

## Connection to A/B testing

Industry A/B testing typically reports ATE (the effect across all users in the experiment). When the treatment effect varies across user segments, the ATE may not generalize to:

- A different mix of segments (deployment population differs from experiment).
- A different decision (rolling out vs running).

Reporting per-segment CATE estimates with proper multiple-testing correction is the practical alternative — gives a richer picture than ATE alone.

## References

- Imbens 2004. Nonparametric estimation of average treatment effects under exogeneity. *Review of Economics and Statistics*.
- Heckman 2005. The scientific model of causality. *Sociological Methodology*.
- Heckman, Vytlacil 2007. Econometric evaluation of social programs, part I + II. *Handbook of Econometrics*.
- Imbens, Wooldridge 2009. Recent developments in the econometrics of program evaluation. *J. Econ. Lit.*
