---
title: Potential Outcomes
category: causal
---
<!-- tier:intro -->
# Potential Outcomes

The **potential-outcomes framework** (Rubin causal model) is one of two main vocabularies in modern causal inference (the other is Pearl's DAG framework). They're largely equivalent.

For each unit `i`, define two **potential outcomes**:

- `Y_i(0)`: the outcome if `i` is NOT treated.
- `Y_i(1)`: the outcome if `i` IS treated.

The **individual treatment effect** is `Y_i(1) - Y_i(0)`. The fundamental problem of causal inference: you only ever observe ONE of the two for each unit. The other is the **counterfactual** — what would have happened.

<!-- tier:undergrad -->
# Potential Outcomes (Undergrad)

## The fundamental problem of causal inference

For each unit `i`, you observe:

`Y_i^obs = T_i · Y_i(1) + (1 - T_i) · Y_i(0)`

Whichever potential outcome corresponds to the actual treatment. The other is missing.

This is Holland's (1986) "fundamental problem of causal inference": individual treatment effects are unobservable. We can only estimate population averages.

## Estimands

Common quantities of interest:

- **ATE** (Average Treatment Effect): `E[Y(1) - Y(0)]`. Average over the whole population.
- **ATT** (Average Treatment effect on Treated): `E[Y(1) - Y(0) | T = 1]`. Average among those treated.
- **ATC** (Average Treatment effect on Controls): `E[Y(1) - Y(0) | T = 0]`. Average among those not treated.
- **CATE** (Conditional ATE): `E[Y(1) - Y(0) | X = x]`. Average for units with covariates `X = x`.
- **LATE** (Local ATE): the ATE among "compliers" — units whose treatment status responds to an instrument.

These coincide under randomization. They differ when treatment assignment depends on covariates that also affect outcomes.

## Identifying assumptions

To identify ATE from observational data, three assumptions:

**1. SUTVA (Stable Unit Treatment Value Assumption)**:
- No interference: unit `i`'s outcome doesn't depend on unit `j`'s treatment.
- No hidden treatment versions: the treatment is well-defined.

Plausible in many settings; broken in network / spillover settings.

**2. Ignorability / Unconfoundedness**:
`(Y(0), Y(1)) ⊥ T | X`

Given observed `X`, treatment is as good as random. The strongest assumption — and most often wrong (we usually don't observe all confounders).

**3. Positivity / Overlap**:
`0 < P(T = 1 | X = x) < 1` for all `x` with positive probability.

Every covariate value has both treated and untreated units. Without overlap, some counterfactuals are unestimable.

When all three hold, ATE is identified by:

`ATE = E_X [E[Y | T = 1, X] - E[Y | T = 0, X]]`

Or via inverse-probability weighting:

`ATE = E[Y · T / e(X)] - E[Y · (1 - T) / (1 - e(X))]`

where `e(X) = P(T = 1 | X)` is the propensity score.

## Potential outcomes vs DAGs

Pearl-style: draw a DAG; identify backdoor adjustment sets; compute interventional probabilities.

Rubin-style: write down potential outcomes; assume ignorability conditional on observed `X`; estimate via regression / matching / propensity scores / IPW.

The two are equivalent for most causal questions. Pearl's framework is more visual + better for complex multi-arrow graphs. Rubin's framework is more amenable to off-the-shelf statistical estimation. Modern practitioners use both.

<!-- tier:grad -->
# Potential Outcomes (Grad)

## Doubly-robust estimators

The classical IPW estimator weights observations by `1 / P(T | X)`. Sensitive to misspecification of the propensity model.

The classical regression estimator fits `E[Y | T, X]` and integrates. Sensitive to misspecification of the outcome model.

**Doubly-robust** (DR) estimators combine both:

`τ̂_DR = E[μ̂(1, X) - μ̂(0, X) + T (Y - μ̂(1, X)) / ê(X) - (1 - T) (Y - μ̂(0, X)) / (1 - ê(X))]`

where `μ̂(t, x)` is the outcome model and `ê(x)` is the propensity model.

**Why "doubly robust"**: consistent if EITHER the outcome model OR the propensity model is correctly specified — not necessarily both. Provides robustness to model misspecification.

Modern variants: **Augmented IPW (AIPW)**, **Targeted Maximum Likelihood Estimation (TMLE)**, **Double Machine Learning (DML)** (Chernozhukov et al. 2018). DML uses ML for nuisance parameters with cross-fitting; gives valid inference under high-dimensional `X`.

## Imai's identification result

Imai (2005) extended the framework to mediation: `Y(t, m)` denotes the potential outcome when treatment is `t` and mediator is `m`. Natural direct effect:

`NDE = E[Y(1, M(0)) - Y(0, M(0))]`

This is identifiable under stronger assumptions than ATE — including no unobserved confounding of `M-Y` and no `T`-induced confounder of `M-Y`.

## Heterogeneous effects + meta-learners

CATE estimation `τ(x) = E[Y(1) - Y(0) | X = x]` is a function-estimation problem. Modern approaches:

- **S-learner**: train one model `μ(t, x)`; CATE = `μ̂(1, x) - μ̂(0, x)`.
- **T-learner**: train separate models for treated and control; subtract.
- **X-learner** (Künzel et al. 2019): hybrid; impute missing potential outcomes; train on imputed effects directly.
- **R-learner** (Nie-Wager 2021): Robinson decomposition; doubly-robust property.
- **Causal forests** (Wager-Athey 2018): random-forest-style estimator with honest splits + valid CIs.

These all live within the potential-outcomes framework, treating CATE as an estimable function.

## Connection to ML evaluation

The potential-outcomes framework explains why ML accuracy is silent on causality. Accuracy measures `E[Y_obs | X]` under the deployment distribution. Causal effects measure `E[Y(1) - Y(0) | X]`. Both involve `X` and `Y`; they're different conditional expectations.

Bridging: counterfactual prediction (predict `Y(t, x)` for both `t` ∈ {0, 1}) is a CATE-estimation problem. Standard ML toolkit (RFs, GBMs, deep nets) plugs in via the meta-learner framework.

## References

- Rubin 1974. Estimating causal effects of treatments in randomized and nonrandomized studies. *J. Educ. Psychol.*
- Holland 1986. Statistics and causal inference. *JASA*.
- Imbens & Rubin 2015. *Causal Inference for Statistics, Social, and Biomedical Sciences*.
- Chernozhukov et al. 2018. Double/debiased machine learning. *Econometrics J.*
- Wager & Athey 2018. Estimation and inference of heterogeneous treatment effects. *JASA*.
