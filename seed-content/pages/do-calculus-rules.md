---
title: Do-Calculus Rules
category: causal
---
<!-- tier:intro -->
# Do-Calculus Rules

Pearl's three rules for symbolically manipulating expressions involving `do(·)`. The rules let you derive identifying expressions for causal effects in terms of observable probabilities.

The rules are based on graph manipulations:

- **Rule 1** lets you ADD or REMOVE conditioning variables when independence holds.
- **Rule 2** lets you EXCHANGE intervention `do(X)` for observation `X` when backdoor paths are blocked.
- **Rule 3** lets you DELETE interventions on variables that don't causally reach the outcome.

Tian & Pearl (2002) proved these rules are **complete**: if `P(Y | do(X))` is identifiable from observational data + DAG, the three rules will derive a formula. Otherwise, no formula exists.

<!-- tier:undergrad -->
# Do-Calculus Rules (Undergrad)

## Rule 1: Insertion / deletion of observations

`P(Y | do(X), Z, W) = P(Y | do(X), W)` if `Y ⊥ Z | X, W` in the modified graph `G_X̄` (the graph with arrows INTO `X` removed).

**Plain English**: you can drop a conditioning variable `Z` if it's d-separated from `Y` given the others, in the post-intervention graph.

**Use case**: simplifying expressions by removing irrelevant conditioning.

## Rule 2: Action / observation exchange

`P(Y | do(X), do(Z), W) = P(Y | do(X), Z, W)` if `Y ⊥ Z | X, W` in the modified graph `G_X̄Z` (the graph with arrows INTO `X` and OUT of `Z` removed).

**Plain English**: an intervention `do(Z)` can be replaced by ordinary observation of `Z`, if backdoor paths from `Z` to `Y` are appropriately blocked.

**Use case**: this is the rule that converts interventional expressions to observational ones. It's the workhorse for backdoor adjustment derivations.

## Rule 3: Insertion / deletion of actions

`P(Y | do(X), do(Z), W) = P(Y | do(X), W)` if `Y ⊥ Z | X, W` in the modified graph `G_X̄Z̄(W)` (the graph with arrows INTO `X` and INTO `Z(W)` removed, where `Z(W)` is the part of `Z` not ancestral to `W`).

**Plain English**: an intervention `do(Z)` can be deleted if it doesn't causally affect `Y` along any unblocked path.

**Use case**: removing irrelevant interventions.

## Worked example: backdoor adjustment via do-calculus

DAG: `Z → T → Y` plus `Z → Y`.

Goal: derive `P(Y | do(T))`.

Step 1: marginalize over `Z`.
`P(Y | do(T)) = ∑_z P(Y | do(T), Z = z) · P(Z = z | do(T))`

Step 2: by Rule 3, `do(T)` doesn't affect `Z` (since there's no `T → Z` arrow), so `P(Z | do(T)) = P(Z)`.
`P(Y | do(T)) = ∑_z P(Y | do(T), Z = z) · P(Z = z)`

Step 3: by Rule 2, `do(T)` can be replaced by conditioning when `Z` blocks all backdoor paths from `T` to `Y`. The path `T ← Z → Y` is blocked by `Z`. So:
`P(Y | do(T = t)) = ∑_z P(Y | T = t, Z = z) · P(Z = z)`

That's the backdoor adjustment formula. We derived it from do-calculus rules.

## When the rules don't suffice

If repeated application of the three rules doesn't reduce all `do(·)` expressions to observational form, the effect isn't identifiable from this DAG and observational data. You need:

- More observable variables (extending the DAG).
- A different DAG (different assumptions).
- Interventional data (intervention experiments).
- Further parametric assumptions.

Pearl's completeness theorem says the three rules are exhaustive: if there's any way to identify the effect, they'll find it.

<!-- tier:grad -->
# Do-Calculus Rules (Grad)

## Why three rules suffice

The completeness proof (Shpitser & Pearl 2006, Huang & Valtorta 2006) constructs an algorithm using only the three rules and shows it's complete.

The algorithm walks the DAG topologically; at each step, applies one of the three rules to simplify; terminates when either (a) the expression is fully observational, or (b) it gets stuck (effect not identifiable).

Polynomial time complexity. Implemented in:

- `causaleffect` R package.
- `DoWhy` Python library (uses ID algorithm).
- Pearl's `eq` software (older).

## Hedges + the obstruction

A **hedge** is a graph structure that's the canonical obstruction to identifiability. Specifically, a pair of C-components in the DAG with a particular structure that prevents do-calculus from eliminating the do-expression.

If a DAG has a hedge involving `T` and `Y`, the effect isn't identifiable. The ID algorithm detects this.

Practically: hedges arise from unobserved confounders that can't be bypassed. The fix is intervention or extra assumptions.

## ID algorithm vs do-calculus

The ID algorithm (Shpitser-Pearl) is a polynomial-time procedure that takes `(P(Y | do(X)), DAG)` as input and either returns an identifying formula or reports unidentifiability.

It's more efficient than naive do-calculus application but mathematically equivalent — by completeness, any DAG that yields an identifying formula via ID can also be solved by hand-applied do-calculus.

For practitioners: use the algorithm via software. Don't apply rules by hand except for understanding.

## Generalizations

**Counterfactual identification** (Shpitser-Pearl 2008): extends to counterfactual queries, which require an SCM (not just a DAG). Strictly harder; many counterfactuals identifiable in interventional case aren't counterfactually identifiable.

**Soft interventions** (Eberhardt 2007): instead of forcing `X = x`, change `P(X | parents(X))` to a different distribution. More realistic for some applications. Generalizes the rules.

**Transportability** (Bareinboim-Pearl 2014): identification across populations. Add "selection" nodes; apply do-calculus on the augmented graph. Determines whether source-population estimates transport.

## Connection to algorithmic information theory

Pearl has argued that the do-calculus is to causal inference what propositional logic is to deductive reasoning: a complete syntactic system for a particular formal-reasoning task.

The Tian-Pearl completeness result is analogous to the completeness of logical proof systems. It says the system has no missing rules — anything provable is provable in this fragment.

## References

- Pearl 1995. Causal diagrams for empirical research. *Biometrika*.
- Tian & Pearl 2002. A general identification condition for causal effects. *AAAI*.
- Shpitser & Pearl 2006. Identification of joint interventional distributions in recursive semi-Markovian causal models. *AAAI*.
- Huang & Valtorta 2006. Pearl's calculus of intervention is complete. *UAI*.
- Bareinboim & Pearl 2014. Transportability from multiple environments with limited experiments. *NIPS*.
