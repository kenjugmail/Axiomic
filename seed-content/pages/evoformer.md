---
title: Evoformer
category: bio
---
<!-- tier:intro -->
# Evoformer

The core network in AlphaFold. A 48-block stack that processes two representations jointly: an MSA representation (sequences × positions) and a pair representation (positions × positions).

The evoformer's job: extract co-evolution patterns from the MSA and turn them into geometric constraints in the pair representation. The structure module then converts pair representation into 3D coordinates.

<!-- tier:undergrad -->
# Evoformer (Undergrad)

## Two representations

- **MSA representation**: shape `(N_seq, N_res, channels)`. Rows are aligned sequences from the MSA; columns are residue positions.
- **Pair representation**: shape `(N_res, N_res, channels)`. Each `(i, j)` cell encodes features about the pair of residues `i` and `j`.

The two representations talk to each other through the evoformer's blocks.

## A single evoformer block

Each block does (in order):

1. **MSA row-wise attention** (with pair bias): each MSA row attends within itself; the pair representation injects geometric bias into the attention.

2. **MSA column-wise attention**: each MSA column attends within itself; conserved positions strengthen.

3. **MSA transition (FFN)**: standard FFN on MSA.

4. **Outer product mean** (`outer_product_mean(MSA) → pair update`): for each pair `(i, j)`, compute the mean over rows of `MSA_i^T · MSA_j`. **This is where co-evolution flows from MSA into pair representation.**

5. **Triangular updates** on pair representation: for each `(i, j)`, update using all `(i, k) and (k, j)` pairs. Encodes triangle-inequality-like geometric consistency.

6. **Pair attention** (with triangle bias): self-attention over pair tokens, biased by triangular updates.

7. **Pair transition (FFN)**: standard FFN on pair.

48 blocks total. Each block refines both representations.

## Why this works

The key insight: **bidirectional information flow** between MSA and pair. Pure MSA processing wouldn't see geometric relationships; pure pair processing wouldn't have the evolutionary signal.

The outer product mean is the magic step: it lets co-evolving residues (positions that vary together in the MSA) become structurally close (high score in the pair representation between those positions).

The triangular updates enforce geometric consistency: if residue A is close to B and B is close to C, then A and C have a constrained range of distances.

<!-- tier:grad -->
# Evoformer (Grad)

## Triangular update mechanics

For pair representation `Z` of shape `(N_res, N_res, channels)`, the triangular update at `(i, j)` involves:

```
for each k:
    contribution = LayerNorm(Z[i, k]) ⊗ LayerNorm(Z[k, j])
sum over k → update at (i, j)
```

(Where `⊗` is a learned bilinear form.)

This implements: 'the relationship between i and j is a function of i's relationships with all k and k's relationships with j'. Geometric reasoning baked into the architecture.

Two variants:
- **Triangular outgoing**: for `(i, j)`, gather information from `(i, k)` for all `k`.
- **Triangular incoming**: for `(i, j)`, gather from `(k, j)` for all `k`.

Both are used; alternated across blocks.

## Computational cost

The evoformer is the most expensive component of AlphaFold. Per block:
- MSA attention: `O(N_seq · N_res²)` (row-wise + column-wise).
- Outer product mean: `O(N_seq · N_res² · channels)`.
- Triangular updates: `O(N_res³)`.
- Pair attention: `O(N_res^4 / chunk_size)` (chunked to fit memory).

For typical inputs (`N_seq` ~1000, `N_res` ~300): ~20-40 GB GPU memory for inference. Training requires distributed computation.

## What's emerged from probing

- **Specific attention heads detect contact pairs**: residues that are close in 3D have high attention weights.
- **Layer-wise specialization**: early layers integrate MSA; mid layers refine pair representation; late layers refine details.
- **Graceful degradation**: with shallow MSAs (few homologs), accuracy drops gracefully rather than collapsing. The pretrained pair representation carries some structural prior.

## AlphaFold 3's changes

AF3 (2024) replaces parts of the evoformer:
- MSA processing is reduced (less central than in AF2).
- Pair representation is the primary working state.
- Diffusion-based structure module replaces IPA.

The evoformer pattern (joint MSA + pair processing) survives in AF3, just less central. Future architectures may further reduce MSA dependence — ESM-Fold demonstrated MSA-free structure prediction is competitive at modest accuracy cost.
