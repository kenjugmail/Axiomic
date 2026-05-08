---
title: Counterfactuals
category: stats
---
<!-- tier:intro -->
# Counterfactuals

The hypothetical 'what would have happened if we'd done X instead of Y?' question.

For each unit, you'd want to know `Y(treated)` and `Y(control)` — the outcomes under both treatments. The **fundamental problem of causal inference**: we never observe both for the same unit. One is observed; the other is the counterfactual.

<!-- tier:undergrad -->
# Counterfactuals (Undergrad)

## The notation

Potential outcomes framework (Rubin 1974):
- `Y_i(1)` = outcome for unit `i` if treated.
- `Y_i(0)` = outcome for unit `i` if not treated.

Individual treatment effect: `Y_i(1) - Y_i(0)`.

We observe `Y_i = T_i · Y_i(1) + (1 - T_i) · Y_i(0)`. Half the potential outcomes are unobserved.

## Average treatment effect (ATE)

`ATE = E[Y(1) - Y(0)] = E[Y(1)] - E[Y(0)]`

Under randomization, both expectations are estimable from observed data:
- `E[Y(1)] ≈ mean(Y | T = 1)` because the treated group's distribution of `Y(1)` matches the population's.
- Same for `E[Y(0)]`.

So ATE = `mean(Y | T = 1) - mean(Y | T = 0)`. Simple difference of means.

Under non-randomization, this fails: the treated group's `Y(1)` distribution might differ from the population's because of confounding.

## In ML

A model's prediction is implicitly a counterfactual: 'given features X, what outcome would we expect?'

But predicting and intervening are different:
- **Predicting**: 'what's the probability this user churns given their features?'
- **Intervening**: 'if we send this user a discount, will they churn less?'

The first is correlational. The second is counterfactual. ML models trained on observational data answer the first, not the second, even when their outputs look like predictions.

For genuine causal claims about interventions: A/B test, or use observational causal inference methods with explicit assumptions.

<!-- tier:grad -->
# Counterfactuals (Grad)

## Conditional ATE (CATE)

`CATE(x) = E[Y(1) - Y(0) | X = x]`

The treatment effect for a specific subgroup defined by features `X`. Useful for:
- Personalization: which users benefit from this intervention?
- Ranking interventions: which subgroup should get the treatment?
- Targeted policies: roll out to high-CATE subgroups.

**Causal forests** (Wager 2018) estimate CATE using random forest variants. **Meta-learners** (T-learner, S-learner, X-learner) decompose the estimation problem differently.

## Counterfactual inference for ML

Modern ML often wants counterfactual predictions:

**Counterfactual fairness**: 'would the model have made the same decision if this protected attribute were different, holding other things equal?' Direct counterfactual question; needs causal model.

**Off-policy evaluation in RL**: 'how would policy `π` perform if it had been run instead of the policy that collected the data?' Counterfactual; importance weighting + doubly robust estimators.

**Recommender systems**: 'how many clicks would I get if I'd shown this user item B instead of item A?' Counterfactual; needs A/B testing or strong assumptions.

## Limitations

Counterfactual reasoning depends on assumptions that can't always be verified:
- **No unmeasured confounders**: hard to verify; often violated in observational data.
- **Stable Unit Treatment Value Assumption (SUTVA)**: no spillover, no interference between units. Often violated in social settings.
- **Positivity**: every unit has a non-zero probability of being in either group. Violated when some treatments are deterministic.

When these assumptions hold (in expectation, via randomization), counterfactual inference is valid. When they don't, conclusions are weaker.

## Computational counterfactuals

In structural causal models (Pearl), you can compute counterfactuals via the **abduction-action-prediction** algorithm:
1. **Abduction**: infer latent variables from observed data + actual treatment.
2. **Action**: change the treatment to the counterfactual value.
3. **Prediction**: forward through the model with the changed treatment + inferred latents.

Requires a structural model + identifiability of latent variables. Strong assumptions; powerful when valid.
