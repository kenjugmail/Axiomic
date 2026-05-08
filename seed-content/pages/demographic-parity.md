---
title: Demographic Parity
category: stats
---
<!-- tier:intro -->
# Demographic Parity

A fairness criterion: prediction rate is equal across demographic groups.

`P(Ŷ = 1 | A = 0) = P(Ŷ = 1 | A = 1)`

The classifier predicts 'positive' at the same rate regardless of protected attribute `A`.

Used in fair lending compliance + some hiring tools. Has real costs against accuracy.

<!-- tier:undergrad -->
# Demographic Parity (Undergrad)

## What it means

A loan-approval model satisfies demographic parity if it approves the same fraction of applicants in each demographic group, regardless of underlying differences in true creditworthiness.

This is a strong constraint. If true creditworthiness differs across groups (for whatever reason — historical wealth differences, data biases), demographic parity forces the model to ignore that signal.

## When demographic parity is the right criterion

**Fair lending laws** (US ECOA): in some jurisdictions, the relevant compliance metric is approval-rate parity. The model must approve at similar rates regardless of protected status.

**Hiring tools**: surface candidates at the same rate per protected group. Reduces overt disparate impact.

**Allocation fairness**: when a fixed number of slots must be allocated, demographic parity ensures each group gets a fair share regardless of underlying differences.

## When it isn't

Many situations where demographic parity is the wrong target:

**Medical diagnosis**: if disease prevalence differs across groups, demographic parity forces mis-diagnosis somewhere. The right criterion is per-group calibration (correct probability of disease per group) and equal access to treatment.

**Recommendation**: showing equal-rate ads across groups doesn't account for genuinely different preferences. The right target is satisfaction.

**Criminal-justice risk scores**: demographic parity in 'high risk' classifications would force ignoring real risk differences, which arguably harms public safety.

The right criterion depends on the deployment context.

## Achieving DP

**Pre-processing**: transform features so they're independent of `A`. Loses information.

**In-processing**: add a fairness penalty to the loss. Optimizer learns to satisfy DP.

**Post-processing**: adjust per-group decision thresholds. Cheap; doesn't require retraining; sacrifices accuracy.

The cheapest is post-processing: pick per-group thresholds so prediction rates are equal. Standard tooling (Fairlearn) implements this.

<!-- tier:grad -->
# Demographic Parity (Grad)

## The fairness-accuracy frontier

Forcing demographic parity reduces accuracy when the protected attribute is correlated with the true label. The trade-off is fundamental:

- Maximum accuracy: ignore fairness; predict the conditional probabilities.
- Maximum demographic parity: equalize prediction rates; lose accuracy.
- Pareto frontier: the trade-off between the two.

You can't have both unless the protected attribute is uncorrelated with the true label.

## Counterfactual fairness as alternative

**Counterfactual fairness**: 'would the prediction be the same if `A` had been different, holding causally-relevant other variables equal?' Direct counterfactual question.

Stronger than demographic parity in some ways, weaker in others. Requires a causal model to define the counterfactual; harder to implement.

## Group definitions matter

DP requires defining 'groups'. Decisions:
- **Race**: which racial categorization scheme? Census categories? Self-identified?
- **Gender**: binary or non-binary? Self-identified or assigned?
- **Intersectionality**: 'Black women' is a group with potentially different patterns than either 'Black' or 'women'. Multiple-group DP gets combinatorial.

The 80% rule (US EEOC): the lowest-rate group should have at least 80% of the highest-rate group's selection rate. A practical threshold; doesn't require exact equality.

## Composition issues

Multiple models acting in series can compound fairness gaps. Even if each model satisfies DP individually, the cascade may not.

Fairness analysis often must be done end-to-end, not per-model. This is a known hard problem in fairness research.

## Real-world failures

- Amazon hiring tool (2018): trained on historical resumes; learned to penalize 'women's' marker in resume text. Pre-deployment audit caught it; never shipped.
- COMPAS (2016): recidivism prediction; ProPublica found per-group error-rate disparities (different definition of fairness).
- Mortgage models (recurring): disparate impact lawsuits over decades.

The lesson: don't treat fairness as solved by an algorithm. Audit; understand the trade-offs; document choices.
