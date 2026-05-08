---
title: Simpson's Paradox
category: causal
---
<!-- tier:intro -->
# Simpson's Paradox

A counterintuitive case where the direction of an association reverses when you condition on a third variable.

**Example**: Berkeley graduate admissions, 1973. Men were admitted at a higher overall rate than women. *Within each department*, women were admitted at slightly higher rates than men. The direction of the gender-admission association reverses when you stratify by department.

Both calculations are correct. The paradox is purely about what statistic answers what question.

The cause is confounding: department is a confounder of the gender-admission relationship. Women applied disproportionately to more selective departments. Aggregate analysis hides this; per-department analysis exposes it.

<!-- tier:undergrad -->
# Simpson's Paradox (Undergrad)

## A clean numerical example

Imagine a drug trial:

- **Drug A**: 81/87 (93%) recovery on small kidney stones; 192/263 (73%) on large kidney stones; **273/350 (78%) overall**.
- **Drug B**: 234/270 (87%) on small kidney stones; 55/80 (69%) on large kidney stones; **289/350 (83%) overall**.

Drug B looks better overall (83% > 78%). But within each subgroup, Drug A is better:

- Small stones: A wins (93% > 87%).
- Large stones: A wins (73% > 69%).

Both calculations are arithmetic facts. The paradox: which drug is better?

**The confound**: stone size. Doctors gave Drug A more often to large-stone (harder) cases; Drug B more to small-stone cases. The aggregate comparison conflates drug effect with case-mix.

**Resolution**: if you'll prescribe a drug to a new patient, you want the conditional effect — Drug A is better. The aggregate misleads.

## When does it happen?

Simpson's paradox emerges when:

1. The outcome variable is associated with both the exposure and a confounder.
2. The confounder is unbalanced across exposure levels.

The reversal happens when the confounder's effect is strong enough to flip the apparent direction.

This is why **Pearl says: the right answer depends on the causal structure**, not the math. If stone size is a confounder of drug-recovery, the per-stratum analysis is correct. If stone size is a mediator (drug-A causes stones to grow before treating), the aggregate could be more relevant.

## Resolving the paradox

You need a causal DAG. Specifically:

- If the third variable (stone size) is a **confounder** (causes both treatment assignment and outcome): condition on it. Per-stratum analysis is correct.
- If it's a **mediator** (treatment causes stone-size, stone-size causes outcome): conditioning on it blocks the path you wanted to measure. Don't condition.
- If it's a **collider** (caused by both treatment and outcome): conditioning on it INTRODUCES bias.

Without the causal model, you can't tell which is which. The math is silent on which analysis is right.

## Real-world cases

- **Berkeley admissions** (1973): department was the confounder.
- **Smoking + birth weight + infant mortality** (Yerushalmy 1971): smoking-lower-birthweight-lower-mortality paradox. The "low-birthweight" stratum is partly a collider.
- **UCB sex bias**: this gave the paradox its modern fame.
- **Florida death penalty data**: aggregated across racial groups looks one way; conditional analysis looks another way.

In all of these, the resolution requires knowing the causal structure.

<!-- tier:grad -->
# Simpson's Paradox (Grad)

## Pearl's resolution

Pearl (1999, 2014) makes the resolution sharp: Simpson's paradox is fully resolved by the causal DAG. Once you specify which variable is treatment, which is outcome, and which is confounder/mediator/collider, the right analysis is determined.

**Algorithmic resolution**:

1. Draw the DAG.
2. Apply the backdoor criterion: which observed variables form an adjustment set for the causal effect of `T` on `Y`?
3. Use the adjustment set's per-stratum or weighted average; ignore variables NOT in the set.

Per-stratum analysis is appropriate if and only if the stratifying variable is in a backdoor adjustment set.

## The "sure thing" failure

Blyth (1972) noted: even if Drug A is better in every subgroup, you might still prefer Drug B for a new patient if you don't know which subgroup they're in and the prior on subgroups is unknown. This isn't a paradox; it's a different decision problem.

The "sure thing principle" — that if A is better than B in every subgroup, A should be preferred unconditionally — fails when the marginal distribution of subgroups in your decision context differs from the data's distribution. This is decision-theoretic, not statistical.

## Lord's paradox

A relative of Simpson's. Two analysts get opposite conclusions about the same data:

- Analyst 1 compares ANCOVA-adjusted means.
- Analyst 2 compares change-scores.

Both methods are valid; they answer different causal questions. The choice depends on the causal DAG (specifically, whether the baseline is a confounder or a mediator of the treatment-outcome path).

Pearl (2016) resolves Lord's paradox the same way: with a causal model.

## When the paradox really matters

Most published studies of Simpson's paradox use stylized examples. In real research:

- Aggregate vs stratum-level effects often differ in magnitude (not direction).
- Strict reversal is rare but real.
- Subgroup analysis with multiple-testing correction is the practical safeguard.

The deeper lesson: aggregate metrics hide subgroup variation. Always evaluate per-segment in production ML for exactly this reason. Simpson's paradox is the worst case; the typical case is "aggregate hides important heterogeneity" without the dramatic reversal.

## References

- Simpson 1951. The interpretation of interaction in contingency tables.
- Yule 1903. Notes on the theory of association of attributes in statistics. (The same paradox, predating Simpson.)
- Bickel, Hammel, O'Connell 1975. Sex bias in graduate admissions: data from Berkeley. *Science*.
- Pearl 2014. Understanding Simpson's paradox. *American Statistician*.
- Hernán, Clayton, Keiding 2011. The Simpson's paradox unraveled.
