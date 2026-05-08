---
title: Phylogenetic Trees
category: bio
---
<!-- tier:intro -->
# Phylogenetic Trees

A tree representing the evolutionary relationships among a set of species, genes, or proteins. Internal nodes = ancestors; leaves = present-day taxa; branch lengths = evolutionary distance.

Built from sequence data via distance methods (NJ), maximum likelihood (RAxML, IQ-TREE), or Bayesian inference (MrBayes).

<!-- tier:undergrad -->
# Phylogenetic Trees (Undergrad)

## Structure

A rooted tree:
- **Root**: the most-recent common ancestor of all leaves.
- **Internal nodes**: hypothetical ancestors.
- **Leaves**: observed taxa.
- **Branch lengths**: typically expected substitutions per site (longer branch = more divergence).

An unrooted tree omits the root — biologically equivalent up to root placement.

## Inference methods

**Distance-based**:
- Compute pairwise distances (typically corrected sequence identity).
- Build tree from the distance matrix via UPGMA or Neighbor-Joining.
- Fast (`O(N³)`); reasonable accuracy.

**Maximum likelihood (ML)**:
- Score each candidate tree by the likelihood of observing the alignment given the tree, branch lengths, and substitution model.
- Search for the highest-likelihood tree (heuristic; NP-hard in general).
- Slower but more accurate, especially for closely-related sequences.

**Bayesian**:
- Compute posterior over trees via MCMC.
- Slower; quantifies tree uncertainty.

For most projects: NJ for quick exploration; ML (RAxML or IQ-TREE) for serious analysis; Bayesian when uncertainty matters.

## Substitution models

Models the rate at which one residue mutates to another:

- **JC69 (Jukes-Cantor)**: simplest; equal rates.
- **K80 (Kimura 2-parameter)**: distinguishes transitions vs transversions.
- **HKY85, GTR**: progressively more flexible. GTR is the most-used for serious analysis.
- **For protein**: WAG, LG, JTT — protein-specific substitution models, derived from large alignments.

## Interpreting trees

- **Sister taxa**: leaves with the same most-recent common ancestor. Closely related.
- **Clade / monophyletic group**: an ancestor + all its descendants. The natural taxonomic unit.
- **Polyphyletic**: a group not forming a single clade. Often a sign of incorrect classification (or convergent evolution).
- **Bootstrap support**: percent of bootstrap-resampled trees that contain a given clade. > 70% is typically considered well-supported.

<!-- tier:grad -->
# Phylogenetic Trees (Grad)

## Tree topology search

For an N-taxon tree, the number of topologies is `(2N-3)! / (2^(N-2) · (N-2)!)` — astronomical even for moderate N. Exhaustive search is infeasible.

**Heuristics**:
- Nearest neighbor interchange (NNI).
- Subtree pruning and regrafting (SPR).
- Tree bisection and reconnection (TBR).

Modern tools (RAxML, IQ-TREE) combine these with parallel search + good initial trees from distance methods.

## Branch-length estimation

Given a topology, branch lengths are estimated by ML (or moment matching for distance methods). The output: a tree with quantitative branch lengths in expected substitutions per site.

For molecular-clock applications (estimating divergence times), additional calibration is needed: fossil constraints + clock models. **Relaxed clock** (rates vary across the tree) typically beats strict clock.

## ML phylogenetics

Recent work uses ML methods for phylogenetic problems:

- **Phylogeny-aware embeddings**: train sequence embeddings such that distance in embedding space matches phylogenetic distance.
- **Differentiable trees**: relaxations of tree topology that allow gradient-based optimization. Active research.
- **GNN-based phylogenetics**: graph neural networks operating on tree structures.

Classical tools (RAxML, IQ-TREE) still dominate for serious phylogenetics. ML methods are useful for downstream tasks (sequence representation, phylogeny-aware function prediction).

## Big trees

The largest published trees: ~100K taxa (microbial diversity), ~1M sequences (specific gene families). Inferring trees at this scale is its own engineering challenge — most ML methods don't scale; specialized tools (USHER for SARS-CoV-2 phylogenetics, FastTree for bacterial taxonomy) fill the gap.
