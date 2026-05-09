---
title: Causal Discovery
category: causal
---
<!-- tier:intro -->
# Causal Discovery

The problem of learning the causal DAG from data — given observations, recover which variables cause which.

This is the hardest problem in causal inference. Pure observational data identifies the DAG only up to **Markov equivalence** — multiple DAGs imply the same conditional independencies; observational data can't distinguish among them.

For unique direction recovery, you need: interventional data, time-order, or strong parametric assumptions (LiNGAM, additive noise models).

In practice, causal discovery is best treated as **hypothesis generation**: it gives you candidate DAGs to validate via experiments and domain expertise.

<!-- tier:undergrad -->
# Causal Discovery (Undergrad)

## What's identifiable from observational data

**Markov equivalence class**: the set of DAGs that imply the same conditional independencies in the joint distribution. Observational data can identify the equivalence class but not (generally) a unique DAG within it.

**Identifiable**:
- The skeleton (which pairs of variables are connected).
- The v-structures / colliders (`X → Z ← Y`). These have a unique conditional-independence pattern (`X` and `Y` independent unconditionally; conditioning on `Z` opens the path).

**Not identifiable from observation alone**:
- Edge directions for chains (`X → Z → Y` vs `Y → Z → X`) and forks (`X ← Z → Y`). They imply the same conditional independencies.
- The presence of unobserved confounders (without modeling adjustments).

## Three method families

**Constraint-based** (PC, FCI): use conditional-independence tests to remove edges + orient v-structures. Output: CPDAG (PC) or PAG (FCI).

**Score-based** (GES, GIES, NOTEARS): search over DAG space; score each candidate by likelihood + complexity penalty.

**Hybrid** (GFCI): combine constraint-based skeleton learning with score-based orientation.

These output an equivalence class — many edges directed, some not.

## PC algorithm

The classical constraint-based algorithm:

1. Start with complete undirected graph.
2. Test each edge for conditional independence given subsets of remaining adjacent nodes; remove if independent.
3. For each unshielded triple `X — Z — Y` (no direct `X-Y` edge), if `Z` is NOT in the conditioning set that made `X` and `Y` independent, orient as `X → Z ← Y` (collider).
4. Apply Meek's rules to orient additional edges that follow from v-structures + acyclicity.

Output: CPDAG.

**Assumptions**:

- **Causal Markov**: joint distribution factorizes per the DAG.
- **Faithfulness**: no measure-zero conditional independencies.
- **Causal sufficiency**: no unobserved common causes.

When sufficiency fails (almost always in real data), use **FCI** instead.

## FCI for hidden confounders

PC assumes all common causes are observed. FCI drops this assumption.

FCI:

- Starts like PC (skeleton from independence tests).
- Distinguishes edge types in the output: `→` (causal), `↔` (latent confounder), `o→` (uncertain), `o-o` (uncertain).
- Outputs a **PAG (Partial Ancestral Graph)**.

The price of dropping sufficiency: more uncertain edges. The PAG often has many `o-o` edges in real data.

## Score-based: NOTEARS + GES

**GES (Greedy Equivalence Search)** (Chickering 2002): greedy search over CPDAGs scored by BIC + likelihood. Add edges, score; remove edges, score. Local optimum.

**NOTEARS** (Zheng et al. 2018): formulates DAG learning as continuous optimization. Acyclicity constraint is `tr(e^(W ⊙ W)) - d = 0` where `W` is the weighted adjacency matrix. Differentiable; works with any score function.

NOTEARS scales to hundreds of variables; modern variants (NOTEARS-MLP, GraN-DAG) extend to nonlinear relationships and discrete data.

<!-- tier:grad -->
# Causal Discovery (Grad)

## LiNGAM and identifiability under non-Gaussianity

**LiNGAM** (Linear Non-Gaussian Acyclic Model, Shimizu et al. 2006): a parametric assumption that buys uniqueness.

Model: `X = BX + e` where `B` is a strictly lower-triangular matrix (after permutation) and `e` is non-Gaussian noise.

**Why non-Gaussianity helps**: under linearity + Gaussian noise, the joint distribution is symmetric; you can't distinguish `X → Y` from `Y → X`. Non-Gaussian noise breaks the symmetry — residuals of `Y` regressed on `X` look different from residuals of `X` regressed on `Y`. Only one direction is consistent with the assumed structure.

**Algorithms**: ICA-LiNGAM, DirectLiNGAM. Both recover the unique DAG (not just equivalence class).

**Trade-off**: LiNGAM gets uniqueness under a strong parametric assumption. PC/FCI get equivalence class under weaker assumptions.

## Causal additive noise models (ANMs)

Generalize LiNGAM to nonlinear relationships:

`Y = f(X) + e` where `e` is independent of `X`.

Under additive noise + non-Gaussianity, the direction is identifiable (`X → Y` gives independent residuals only when `f` is the true causal mechanism).

**RECI, IGCI, ANM-MML**: methods exploiting this for pairwise direction discovery.

## Discovery from interventional data

When you have interventional data (some experiments where variables were intervened on), identifiability is much stronger.

**Eberhardt 2007**: with `n` variables, ⌈log₂(n)⌉ + 1 interventions suffice to identify the DAG.

**Algorithms**: GIES extends GES to mixed observational + interventional data. Better identifiability than pure observation.

In practice: even a few intervention experiments (e.g., A/B tests on different variables) dramatically improve discovery.

## Time-series causal discovery

When data is time-indexed, time-ordering provides natural direction:

- **Granger causality**: `X` Granger-causes `Y` if past `X` predicts `Y` beyond what past `Y` does. Necessary but not sufficient for true causation (could be confounded).
- **PCMCI** (Runge et al. 2019): conditional-independence-based discovery for time series.
- **Convergent cross-mapping**: detect causality in nonlinear dynamical systems.

These are less restrictive than pure observational discovery — time order kills many Markov-equivalence-class members.

## Fundamental limits

**Impossibility under sufficiency violation**: with arbitrary unobserved confounders and arbitrary non-linearities, no observational discovery method works.

**Faithfulness requirement**: in real data, exact faithfulness can fail (deterministic relationships, perfectly canceling effects). Discovery methods can mis-orient edges in faithfulness violations.

**Sample complexity**: many discovery algorithms have polynomial sample complexity in the number of variables but the constants are unfavorable. With 100 variables, you need many thousands of samples for reliable discovery.

## Modern frontiers

**Differentiable causal discovery**: NOTEARS-style continuous optimization with deep-learning models. Active research; production-quality tooling emerging.

**Foundation-model-assisted discovery**: LLMs propose candidate DAGs from variable descriptions; classical algorithms refine using data.

**Neural causal discovery**: graph neural networks for discovery in high-dimensional data (genomics, neuroscience).

## When discovery is + isn't useful

**Best fits**:
- Hypothesis generation: get a candidate DAG; experiment to refine.
- Detecting independence patterns inconsistent with a hypothesized structure.
- Identifying obvious confounders or mediators that aren't in the working model.

**Worst fits**:
- Replacing domain expertise: discovery output is hypotheses, not conclusions.
- High-dimensional + small-sample regimes: identifiability is theoretical, estimation is unreliable.
- Settings with feedback loops or non-stationarity: most methods assume DAG + stationarity.

## References

- Spirtes, Glymour, Scheines 2000. *Causation, Prediction, and Search*.
- Shimizu et al. 2006. A linear non-Gaussian acyclic model for causal discovery. *J. Mach. Learn. Res.*
- Hoyer et al. 2009. Nonlinear causal discovery with additive noise models. *NIPS*.
- Zheng et al. 2018. DAGs with NO TEARS: continuous optimization for structure learning. *NIPS*.
- Glymour, Zhang, Spirtes 2019. Review of causal discovery methods based on graphical models. *Frontiers in Genetics*.
