---
title: FCI Algorithm
category: causal
---
<!-- tier:intro -->
# FCI Algorithm

**Fast Causal Inference** — a causal discovery algorithm that handles **latent confounders**.

The PC algorithm assumes causal sufficiency (no unobserved common causes). FCI drops this assumption.

**Output**: a **PAG (Partial Ancestral Graph)** with edge types:

- `A → B`: `A` causes `B`.
- `A ↔ B`: a latent confounder of `A` and `B`.
- `A o→ B`: uncertain — might be causal or might be confounded.
- `A o-o B`: highly uncertain.

The price of allowing hidden confounders: more uncertain edges. The PAG often has many `o-o` edges in real data.

<!-- tier:undergrad -->
# FCI Algorithm (Undergrad)

## Why FCI matters

In real data, you almost always have unobserved confounders. The PC algorithm doesn't handle them — it assumes you observe every common cause.

Concretely: imagine a DAG `A → C, B → C, A ← U → B` where `U` is unobserved. PC sees `A` and `B` correlated; without seeing `U`, it might infer a direct `A — B` edge. Wrong.

FCI handles this. It allows for latent confounders and outputs a graph that's correct under the assumption of latent confounding, but with appropriate uncertainty.

## The procedure (high level)

1. **Start with skeleton learning** like PC. Test conditional independencies; remove edges.
2. **Identify v-structures**: same logic as PC.
3. **Apply additional rules**: FCI has more orientation rules than PC because it must distinguish:
   - Direct causal edges (`→`).
   - Latent-confounded edges (`↔`).
   - Uncertain edges (`o→`, `o-o`).
4. **Output**: PAG.

The skeleton phase is similar to PC; the orientation phase has more cases.

## PAG edge types

`A → B`: `A` is an ancestor of `B`; no latent confounder of `A` and `B`. Strong claim.

`A ↔ B`: There's a latent variable `L` such that `L` is an ancestor of both `A` and `B`. No direct causal edge between observed `A` and `B`.

`A o→ B`: One end is uncertain. Either `A → B` or `A ↔ B`, but the data can't distinguish.

`A o-o B`: Both ends uncertain. `A → B`, `A ← B`, or `A ↔ B`, all consistent.

## RFCI: the practical variant

FCI is computationally expensive; for high-dimensional data it can be slow.

**RFCI (Really Fast Causal Inference)**: skip some tests at the cost of slightly weaker output. Scales to many more variables.

**GFCI (Greedy FCI)**: hybrid — constraint-based skeleton + score-based orientation. Often best in practice.

In real-world high-dimensional data, GFCI tends to outperform pure FCI.

## Implementation

`pcalg` (R): includes FCI, RFCI, and GFCI variants.

`causal-learn` (Python): includes FCI and variants.

`tigramite` (Python): time-series-aware variants.

## When to use FCI

**Good fit**:

- You suspect latent confounders.
- Variables aren't randomly sampled (selection might be present).
- You want honest uncertainty about which edges are confounded vs causal.

**Less good fit**:

- Very high dimensions (FCI scales worse than PC).
- You have strong prior on causal sufficiency (PC is more powerful in this case).

In a real research setting where you can't be sure all confounders are observed (almost always), FCI is the safer choice.

<!-- tier:grad -->
# FCI Algorithm (Grad)

## Maximal Ancestral Graphs (MAGs)

The mathematical object FCI works with: **MAGs** (Richardson-Spirtes 2002). Generalizations of DAGs allowing bidirected edges (representing latent confounders).

A MAG is "ancestral" — no node is its own ancestor — and "maximal" — every non-edge corresponds to a conditional independence.

**PAG = equivalence class of MAGs**. Two MAGs are equivalent if they imply the same conditional independencies. The PAG represents the equivalence class.

## Soundness + completeness

**Soundness**: every edge orientation FCI outputs is correct in the underlying MAG.

**Completeness** (Zhang 2008): FCI's orientation rules are complete. Any orientation derivable from the conditional independencies is derived by the algorithm.

This is parallel to PC's completeness for DAGs but stronger — handles latent confounders properly.

## Selection bias

FCI handles selection bias by introducing **selection nodes**: variables conditioning on which the sample is selected. Adds another edge type.

In epidemiology + observational studies, selection bias is omnipresent. FCI is the principled way to handle it.

## RFCI vs FCI

FCI's cost: tests are made for v-structures conditional on Sepset, possibly-d-sep sets. Many tests; large conditioning sets.

RFCI skips some of the more expensive tests. Cost: some edges have weaker orientation. In practice, the loss is small for most data.

## GFCI (hybrid)

GFCI uses GES (greedy equivalence search) for skeleton + orientation, then applies FCI's rules for latent confounder handling.

Performance: typically better than RFCI in high-dimensional settings; comparable in low-dimensional. The score-based component handles weak conditional-independence signals better than pure constraint-based.

## Connection to instrumental variables

FCI's edge types echo the IV structure:

- `Z → T → Y`: `Z` is on the causal path; not an IV.
- `Z → T, Z ↛ Y`: `Z` is a candidate IV (relevance + exogeneity could hold).
- `Z ↔ Y`: `Z` is confounded with `Y`; not a valid IV.

FCI doesn't tell you you have an IV — but its output is consistent with IV-style reasoning. If FCI infers `Z → T` and `Z ↛ Y`, then `Z` is a candidate IV.

## Limits

**Faithfulness violations** propagate as for PC.

**High-dimensional issues**: even RFCI struggles with thousands of variables. The PAG is still well-defined but estimation is unreliable.

**Strong assumptions**: even with latent confounders, FCI assumes the underlying SCM is acyclic and that the joint distribution factorizes per the MAG. Cyclic causal models or non-stationarity break the framework.

## Modern frontiers

- **Time-series PAGs**: PCMCI+ extends to time-series with latent confounders.
- **Differentiable FCI-style**: continuous optimization with bidirected-edge support. Active research.
- **Foundation-model-assisted PAG estimation**: LLMs propose candidate latent structures.

## References

- Spirtes, Glymour, Scheines 2000. *Causation, Prediction, and Search* (chapter 6).
- Richardson & Spirtes 2002. Ancestral graph Markov models. *Annals of Statistics*.
- Zhang 2008. On the completeness of orientation rules for causal discovery in the presence of latent confounders and selection bias. *Artificial Intelligence*.
- Colombo et al. 2012. Learning high-dimensional directed acyclic graphs with latent and selection variables. *Annals of Statistics*.
- Ogarrio, Spirtes, Ramsey 2016. A hybrid causal search algorithm for latent variable models. *Probabilistic Graphical Models*.
