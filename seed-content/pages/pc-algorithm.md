---
title: PC Algorithm
category: causal
---
<!-- tier:intro -->
# PC Algorithm

The classical constraint-based algorithm for causal discovery from observational data.

Named after **Peter Spirtes** and **Clark Glymour** (1991).

The idea: use conditional-independence tests to remove edges from a complete graph, then orient v-structures (colliders) based on independence patterns.

**Output**: a CPDAG (Completed Partially Directed Acyclic Graph) — a graph where some edges are directed (where direction is identifiable from observation) and others are undirected (where direction isn't).

Assumes: causal Markov + faithfulness + causal sufficiency (no unobserved common causes).

<!-- tier:undergrad -->
# PC Algorithm (Undergrad)

## The four-step procedure

**Step 1: Skeleton learning.**
- Start with complete undirected graph.
- For each pair `(X, Y)` and each conditioning set `Z` of size 0, 1, 2, ...:
  - Test if `X ⊥ Y | Z`.
  - If yes, remove the edge `X — Y` from the graph; record `Z` as a "separating set" for the pair.
- Stop when no further edges can be removed.

**Step 2: V-structure identification.**
- For each unshielded triple `X — Z — Y` (no direct `X — Y` edge):
- Check the separating set for `(X, Y)`. If `Z` is NOT in it, then `Z` is a collider (`X → Z ← Y`).
- Orient the v-structure.

**Step 3: Meek's rules.**
- Apply rules that orient additional edges following from v-structures + acyclicity:
  - If `X → Z` and `Z — Y` and there's no `X — Y` edge, orient `Z → Y` (else there'd be a new v-structure).
  - If `X → Z → Y` and `X — Y`, orient `X → Y` (else there'd be a cycle).
  - And similar.

**Step 4: Output.**
- The resulting partially-directed graph is the CPDAG. Some edges directed, others undirected (within Markov equivalence class).

## Conditional-independence tests

The PC algorithm needs a test for `X ⊥ Y | Z`. Choices:

- **Fisher-Z transformation**: for Gaussian linear models. Test `H₀: ρ(X, Y | Z) = 0`.
- **G-square / chi-square**: for discrete categorical data.
- **Mutual information**: nonparametric; works for any distribution.
- **Kernel-based** (HSIC, KCIT): more powerful nonparametric tests.

The choice matters: Fisher-Z is fast but assumes Gaussian linear; kernel-based is general but slower.

## Worked example

DAG (truth): `A → B → C`.

Observed conditional independencies:
- `A` and `B`: associated.
- `B` and `C`: associated.
- `A` and `C` | `B`: independent (`B` blocks the path).

PC algorithm:
1. Skeleton: start with `A — B`, `A — C`, `B — C` (complete graph). Test each pair for independence.
   - `A ⊥ C | B`: yes (in true DAG). Remove edge `A — C`. Separating set: `{B}`.
   - Other pairs: dependent, no removal.
2. V-structure: only triple is `A — B — C`. Separating set for `(A, C)` is `{B}`. Since `B` IS in the set, this is NOT a v-structure.
3. Meek's rules: no new orientations.
4. Output: `A — B — C` (all undirected).

So PC correctly identified the skeleton but couldn't orient. The DAGs `A → B → C`, `A ← B → C`, `A ← B ← C` are all in the equivalence class. Without intervention or extra info, you can't distinguish.

## Implementation

`pcalg` (R): the canonical implementation. Production-quality.

`causal-learn` (Python): port of `pcalg` plus other algorithms.

`causalnex` (Python): commercial-grade, includes PC + LiNGAM + others.

These handle: independence-test selection, skeleton learning, orientation, optional bootstrap for stability.

## Stability concerns

Real data has noise; conditional-independence tests aren't perfect. The PC algorithm's output can be:

- **Sensitive to test order**: different orderings of variables give slightly different graphs.
- **Sensitive to conditioning-set sizes**: false-positive independencies at large conditioning sets remove correct edges; false-negatives keep wrong edges.

**Stable PC** (Colombo-Maathuis 2014) makes the algorithm output order-independent.

**Bootstrap**: re-run PC on bootstrap samples; report edges that appear in most replicates. Improves stability.

<!-- tier:grad -->
# PC Algorithm (Grad)

## Computational complexity

The PC algorithm's complexity:

- **Skeleton phase**: tests are made up to conditioning-set size `d` (the maximal degree of the true graph). Number of tests: `O(n^d · n²)`.
- **Practical limit**: for sparse graphs (`d ≤ 5-10`), PC scales to ~100 variables. For dense graphs, much smaller.

Modern variants (PC-stable, RFCI) reduce constant factors.

## Asymptotic correctness

Under the three assumptions (causal Markov, faithfulness, causal sufficiency), PC is **asymptotically correct**: as `n → ∞`, it outputs the correct CPDAG.

**Catch**: the convergence is slow with high-dimensional graphs. With 100 variables, you may need `n` in the thousands for reliable output.

## When the assumptions fail

**Faithfulness violations**: PC mis-orients edges. Example: in a DAG with two paths `X → Y` (one positive, one negative) that exactly cancel, `X` and `Y` look independent. PC removes the edge.

**Causal sufficiency violations**: hidden confounders create extra dependencies that PC interprets as direct edges. Use **FCI** instead (handles latent confounders at the cost of more uncertainty).

**Selection bias**: non-random sampling creates extra dependencies. PC outputs are biased.

## Conservative-PC (CPC)

A variant that doesn't orient v-structures with ambiguous evidence. More conservative; reports uncertainty.

Useful when reliability matters more than completeness — the PC algorithm's full orientation is sometimes overconfident.

## Algorithm extensions

- **PC-stable** (Colombo-Maathuis 2014): order-independent skeleton.
- **PC-MAX**: more powerful v-structure orientation.
- **GFCI** (Ogarrio-Spirtes-Ramsey 2016): hybrid; constraint-based skeleton + score-based orientation. Better in high-dimensional settings.
- **MMHC** (Tsamardinos-Brown-Aliferis 2006): max-min hill climbing; constraint-based skeleton + score-based search.

## Connection to copulas + nonparametric tests

For nonlinear / non-Gaussian data, the PC algorithm's conditional-independence test is the bottleneck. Modern advances:

- **HSIC** (Gretton et al. 2008): kernel-based independence measure.
- **KCIT** (Zhang et al. 2011): kernel-based conditional-independence test.
- **CCM** (continuous conditional independence): for continuous data with arbitrary distributions.

These give PC much wider applicability at the cost of computation.

## Connection to neural causal discovery

Recent work integrates PC with neural networks:

- **Neural conditional-independence tests**: use neural networks as nonparametric independence testers within the PC framework.
- **Differentiable structure learning** (NOTEARS, GraN-DAG): replace PC's combinatorial search with continuous optimization.

These extend causal discovery to high-dimensional nonlinear settings where classical PC struggles.

## References

- Spirtes & Glymour 1991. An algorithm for fast recovery of sparse causal graphs. *Social Science Computer Review*.
- Spirtes, Glymour, Scheines 2000. *Causation, Prediction, and Search* (chapters 5-6).
- Colombo & Maathuis 2014. Order-independent constraint-based causal structure learning. *J. Mach. Learn. Res.*
- Kalisch & Bühlmann 2007. Estimating high-dimensional directed acyclic graphs with the PC algorithm. *J. Mach. Learn. Res.*
- Glymour, Zhang, Spirtes 2019. Review of causal discovery methods based on graphical models. *Frontiers in Genetics*.
