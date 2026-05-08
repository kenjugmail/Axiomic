---
title: Fairness-Accuracy Frontier
category: stats
---
<!-- tier:intro -->
# Fairness-Accuracy Frontier

Most fairness constraints cost accuracy. The frontier is the trade-off curve.

- Maximum accuracy: ignore fairness; predict the conditional probabilities.
- Maximum fairness (under your chosen criterion): equalize across groups; lose accuracy.
- Pareto frontier: the curve of "best accuracy at this fairness level".

The trade-off is fundamental whenever the protected attribute is correlated with the true label. You can't have both maximum accuracy AND demographic parity (or equalized odds, etc.) unless `A` is independent of `Y` — which is rarely true in real data.

<!-- tier:undergrad -->
# Fairness-Accuracy Frontier (Undergrad)

## The trade-off shape

Plot accuracy on the y-axis, fairness violation on the x-axis. The frontier is a curve. Each point is a model. Below the curve is feasible; above is not.

The shape depends on:
- How correlated `A` is with `Y` (more correlation → bigger trade-off)
- Which fairness criterion (demographic parity is usually most restrictive)
- The quality of features (some accuracy is "free" if features predict well from protected-attribute-independent signal)

## Mitigation methods

**Pre-processing**: modify training data so it's less biased.
- Reweight examples: upweight underrepresented groups.
- Transform features: project to a subspace where `A` is uncorrelated.
- Synthetic data augmentation per minority group.

Pros: model-agnostic. Cons: loses information; doesn't always work.

**In-processing**: add a fairness penalty to the training objective.
- Adversarial fairness: train a discriminator that tries to predict `A` from features; train the main model to fool it.
- Constrained optimization: Lagrangian penalty on the fairness violation.
- Fair representation learning.

Pros: model can learn the trade-off explicitly. Cons: harder to optimize; may not converge.

**Post-processing**: adjust predictions after training.
- Per-group decision thresholds: pick threshold per group so the chosen criterion holds.
- Reject-option classification: abstain in the contested zone.
- Calibration adjustment per group.

Pros: cheap; doesn't require retraining; transparent. Cons: sacrifices some accuracy; may violate other fairness criteria.

## Picking a method

**Default**: post-processing with per-group thresholds. Cheapest, easiest to audit, transparent.

**When post-processing isn't enough**: in-processing with adversarial fairness or constrained optimization.

**When data itself is biased**: pre-processing won't fully fix it; algorithmic mitigation masks the problem. Sometimes the right answer is to collect better data.

## Audit even without explicit constraints

Always evaluate per-group accuracy. The aggregate often hides important variation:
- Overall accuracy 92%
- Group A: 95%, Group B: 80%

Without per-group evaluation, you'd ship without knowing about the gap.

<!-- tier:grad -->
# Fairness-Accuracy Frontier (Grad)

## The impossibility theorem

When base rates differ across groups (`P(Y = 1 | A = 0) ≠ P(Y = 1 | A = 1)`), you cannot simultaneously satisfy:
- Calibration by group: `P(Y = 1 | Ŝ = s, A = a)` independent of `a`
- Equalized odds: equal TPR + FPR across groups

This is a mathematical theorem (Chouldechova 2017, Kleinberg 2017), not an engineering limitation.

The COMPAS controversy was rooted in this: Northpointe argued the system was calibrated by group; ProPublica argued it had unequal error rates. Both were right; neither was achievable simultaneously.

## Constrained optimization framing

A fairness-constrained learning problem:

```
min_θ Loss(θ)
s.t. FairnessViolation(θ) ≤ ε
```

Lagrangian dual: `min_θ max_λ Loss(θ) + λ · FairnessViolation(θ)`. Adversarial training is one realization (λ adjusts implicitly via the discriminator).

Convergence guarantees depend on the convexity of `FairnessViolation`. Demographic parity is convex in linear models; equalized odds isn't (it's a per-conditional constraint).

## The Pareto frontier characterization

For demographic parity in binary classification, the optimal trade-off has a closed-form per-group threshold structure. For each group, pick a threshold; the resulting (accuracy, DP-violation) point traces the frontier.

**Tooling**: Fairlearn implements `ThresholdOptimizer` that finds the best per-group thresholds for a chosen criterion. Aequitas computes audit metrics across criteria.

## Composition + cascade effects

Multi-stage pipelines compound fairness violations even if each stage individually satisfies a criterion. Fairness analysis must be end-to-end, not per-stage.

Example: a hiring pipeline of `(resume_screen) → (interview_eval) → (offer_decision)`. Each stage might satisfy DP individually; the cascade may not. Known hard problem.

## Counterfactual fairness as escape hatch

Counterfactual fairness: "would the prediction change if `A` had been different, holding causally-relevant variables equal?" Direct counterfactual question; requires a causal model.

Stronger than DP in some ways (causal vs statistical), weaker in others (relies on correctness of the causal model). Recent work formalizes this; tooling immature.

## Real-world frontier shifts

Better features sometimes shift the frontier favorably — more predictive features per group reduce the cost of equalizing. Worse features (e.g., relying on proxies for `A`) make the frontier steeper.

The lesson: fairness mitigation isn't only an algorithm problem. Better data + better features + better domain modeling can move the frontier; pure algorithmic mitigation just picks a point on the existing frontier.
