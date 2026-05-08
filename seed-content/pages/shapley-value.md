---
title: Shapley Value
category: game-theory
---
<!-- tier:intro -->
# Shapley Value

The **Shapley value** is a unique fair-division rule for cooperative games: it answers "given a coalition that produces value $v$, how should the coalition split the gains among its members?"

It's the unique solution satisfying four axioms:
1. **Efficiency**: the values sum to the total surplus.
2. **Symmetry**: equal contributors get equal shares.
3. **Null player**: a player who adds nothing gets nothing.
4. **Additivity**: the value of a sum of games is the sum of values.

In ML, the Shapley value has become the dominant **feature attribution** method (SHAP — Lundberg & Lee 2017).

<!-- tier:undergrad -->
# Shapley Value (Undergrad)

## Formula

For a cooperative game with players $N$ and characteristic function $v$ (mapping subsets of $N$ to real values), player $i$'s Shapley value is:

$$\phi_i(v) = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|! (|N| - |S| - 1)!}{|N|!} [v(S \cup \{i\}) - v(S)]$$

Equivalently: average $i$'s **marginal contribution** $v(S \cup \{i\}) - v(S)$ over all permutations of player ordering. The combinatorial weight is the probability that, in a random permutation, $i$ joins exactly after the players in $S$.

## Why these four axioms?

The axioms are a Schelling-style focal point: they're the minimal "fairness" guarantees that anyone would accept, AND they uniquely determine the value. Drop any one and you get other valid solution concepts (the **core**, the **nucleolus**, the **Banzhaf index**).

## Computational challenge

Computing Shapley values exactly requires evaluating $v$ on all $2^n$ subsets — exponential. For ML feature attribution, **kernelSHAP** approximates via weighted least-squares regression on sampled subsets. **TreeSHAP** exploits tree-ensemble structure for polynomial-time exact computation.

## Examples

**Voting**: a 51% majority threshold; $v(S) = 1$ if $S$ has $\geq 51\%$ of votes, else 0. Shapley value = each player's "swing voter" probability across random orderings. Models legislative power.

**ML feature attribution**: $v(S)$ is the model's expected output when only features in $S$ are observed; $\phi_i$ is feature $i$'s contribution to a particular prediction.

<!-- tier:grad -->
# Shapley Value (Grad)

## Beyond cooperative games

The Shapley value extends beyond cooperative games:
- **Shapley-Shubik power index** for voting systems.
- **Aumann-Shapley pricing** for cost allocation in continuous-quantity goods.
- **Shapley regression** for collinear ML features.

## Limitations of SHAP

The popularity of SHAP in ML interpretability obscures real concerns:
- **Conditional vs. interventional Shapley** behave differently with correlated features. The default in many libraries is "marginal" (interventional), which can produce nonsensical attributions for unrealistic feature combinations.
- **Path-dependence**: the Shapley axioms enforce path-independence (additivity), but actual model behavior often depends on input combinations in non-additive ways.
- **Feature interaction**: classical Shapley doesn't surface interactions; interaction Shapley values (Sundararajan et al.) help but are computationally harder.

The Shapley value is *a* fair allocation rule, not *the* unique correct attribution. Treat its outputs as one signal among several, not ground truth.
