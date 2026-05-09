---
title: d-Separation
category: causal
---
<!-- tier:intro -->
# d-Separation

The graph-theoretic algorithm for reading conditional independencies off a causal DAG.

**Definition**: Two nodes `X` and `Y` are **d-separated** by a set `Z` if every path between them is **blocked** by `Z`.

A path is blocked by `Z` if:

- It contains a **chain or fork** with the middle node IN `Z`, OR
- It contains a **collider** with the middle node NEITHER in `Z` NOR with any descendant in `Z`.

If `X` and `Y` are d-separated by `Z`, then `X ⊥ Y | Z` in any distribution consistent with the DAG (under causal Markov + faithfulness).

This is the algorithm. The rest of causal inference rests on it.

<!-- tier:undergrad -->
# d-Separation (Undergrad)

## The three rules in detail

**Rule 1: Chain `X → Z → Y`**
- Unconditionally: `X` and `Y` ARE associated (information flows through `Z`).
- Conditional on `Z`: blocked. `X ⊥ Y | Z`.

**Rule 2: Fork `X ← Z → Y`**
- Unconditionally: `X` and `Y` ARE associated (through the common cause).
- Conditional on `Z`: blocked. `X ⊥ Y | Z`.

**Rule 3: Collider `X → Z ← Y`**
- Unconditionally: `X` and `Y` are INDEPENDENT.
- Conditional on `Z` (or any descendant of `Z`): UNBLOCKED. `X` and `Y` are conditionally associated.

The rule for colliders is the counterintuitive one. Conditioning on a common effect creates association where there was none.

## The path-walking procedure

To check if `X ⊥ Y | Z`:

1. List all paths between `X` and `Y` (ignoring direction; treat the DAG as a graph for path enumeration).
2. For each path, check each non-endpoint node:
   - If chain or fork: the path is blocked at this node iff it's in `Z`.
   - If collider: the path is blocked at this node iff it's NOT in `Z` and has no descendant in `Z`.
3. The path is **blocked** if blocked at any node.
4. `X` and `Y` are d-separated by `Z` iff every path is blocked.

## A worked example

DAG: `A → B → C ← D ← E`

Question: Is `A ⊥ E | C`?

Path from `A` to `E`: `A → B → C ← D ← E`.

Walk it:
- `B` is a chain node. Is it in `{C}`? No. So `B` doesn't block.
- `C` is a collider. Is it in `{C}`? YES. Conditioning on a collider OPENS the path.
- `D` is a chain node. Is it in `{C}`? No. So `D` doesn't block.

The path is open. So `A` and `E` are CONDITIONALLY DEPENDENT given `C`.

This is the collider-conditioning bias: by conditioning on `C`, we've opened a spurious association between `A` and `E` that didn't exist unconditionally.

## Why d-separation matters

d-separation does the work in:

- **Backdoor criterion**: find an adjustment set that d-separates treatment from outcome through backdoor paths.
- **Conditional-independence-based discovery (PC algorithm)**: read off conditional independencies from data, infer DAG structure.
- **Sensitivity analysis**: identify which conditional independencies must hold under your causal model; check against data.
- **Mediation analysis**: identify which paths are direct vs indirect via d-separation.

Most causal-inference questions reduce to "is `X` d-separated from `Y` by `Z`?" with various choices of `X`, `Y`, `Z`.

<!-- tier:grad -->
# d-Separation (Grad)

## Equivalence to conditional independence

Under causal Markov + faithfulness:

`X` is d-separated from `Y` by `Z` ⟺ `X ⊥ Y | Z` in the joint distribution.

The forward direction (d-separation → conditional independence) follows from the Markov factorization. The reverse direction (conditional independence → d-separation) requires faithfulness; without it, distributions can have measure-zero conditional independencies not implied by the graph.

In real data, faithfulness violations are rare but possible. Diagnostic: if a pre-specified d-separation says `X ⊥ Y | Z` but the data shows strong dependence, suspect either (a) an incorrect DAG, (b) a faithfulness violation, or (c) finite-sample noise.

## Generalizations

**m-separation** (Verma-Pearl): d-separation extended to ancestral graphs (graphs with bidirected edges representing latent confounders).

**c-separation** (Pearl): generalized to chain graphs (graphs with both directed and undirected edges).

**σ-separation**: causal-aware separation for cyclic structural causal models.

These generalizations handle settings where DAGs alone aren't sufficient — latent confounders (FCI uses ancestral graphs), feedback loops, equilibrium reasoning.

## Active vs blocked paths

Some authors (Greenland-Pearl-Robins) use "active" instead of "open" and "blocked" interchangeably. The terminology is different but the concept is the same.

A path is **active** (open) if it transmits association; **blocked** if it doesn't. d-separation says all paths between `X` and `Y` are blocked given `Z`.

## Computational complexity

Checking d-separation for given `(X, Y, Z)` is polynomial in the graph size — a BFS/DFS. The hard problem is FINDING an adjustment set: enumerating all valid sets, finding minimal sets, etc. These are #P-hard in general but tractable for many practical cases.

`dagitty` (browser tool, R package) implements all of this; for any DAG you draw, it'll list valid backdoor adjustment sets, minimal adjustments, testable conditional independencies, etc.

## Connection to ML

In a neural network, the layer-wise structure forms a DAG (no skip connections aside; with them, still a DAG). d-separation tells you when activations are conditionally independent given other activations.

This isn't usually how we think about NNs (we think about weights and gradients), but it's a valid framing. Some recent mech-interp work uses d-separation explicitly to identify causal structure in trained networks (e.g., circuit-finding via interventions corresponds to identifying d-separation patterns in the network's computation graph).

## References

- Pearl 1988. *Probabilistic Reasoning in Intelligent Systems*. (Original d-separation.)
- Verma & Pearl 1990. Causal networks: semantics and expressiveness.
- Geiger, Pearl 1990. On the logic of causal models. *UAI*.
- Lauritzen 1996. *Graphical Models*. (Comprehensive treatment.)
