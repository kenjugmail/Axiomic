---
title: Sequence Alignment
category: bio
---
<!-- tier:intro -->
# Sequence Alignment

Find the optimal correspondence between two (or more) biological sequences. Output: which positions match, which differ (substitutions), where gaps (insertions/deletions) occur.

Two main flavors:
- **Global** (Needleman-Wunsch 1970): align entire sequences end-to-end.
- **Local** (Smith-Waterman 1981): find the best matching subsequences.

Foundation of comparative genomics, structure prediction (AlphaFold's MSA), evolutionary analysis.

<!-- tier:undergrad -->
# Sequence Alignment (Undergrad)

## Smith-Waterman (local)

Dynamic programming. For sequences A and B, build a matrix `H[i, j]` where each cell holds the optimal score for an alignment ending at `(i, j)`:

```
H[i, j] = max(
    0,                              # start a new alignment here
    H[i-1, j-1] + score(a_i, b_j),  # match/mismatch
    H[i-1, j] + gap,                 # gap in B
    H[i, j-1] + gap                  # gap in A
)
```

Trace back from the highest-scoring cell. Optimal local alignment in `O(|A| · |B|)` time.

## Substitution matrices

For proteins, the score function `score(a, b)` is biology-aware:

- **BLOSUM62**: log-odds of observing each amino-acid pair in evolutionarily-related blocks. Most-used scoring matrix for general protein comparison.
- **PAM250**: similar, derived from accepted point mutations. Older; mostly replaced by BLOSUM.
- For DNA: simpler. +1 for match, -1 for mismatch is standard. Tools sometimes use a transition/transversion-aware matrix.

## Gap penalties

- **Linear gap**: penalty per gap residue. Simple but doesn't reflect biology — gaps tend to come in batches.
- **Affine gap**: open + extend. `gap_penalty = open + extend · gap_length`. Open is large (~-10), extend small (~-1). Models 'gap-opening is a rare event; extending is cheap'.

Affine gaps are standard for serious alignment.

## BLAST

For database search (millions of sequences), Smith-Waterman is too slow. **BLAST** (Altschul 1990):

1. Index database by k-mer (k=3 for protein, k=11 for DNA).
2. For each query k-mer, find database positions with high-scoring k-mer matches.
3. Extend hits in both directions until the score drops too far.
4. Compute E-value (expected number of random hits with this score).

Sub-second searches against multi-million-sequence databases. The bioinformatics workhorse for 30+ years.

<!-- tier:grad -->
# Sequence Alignment (Grad)

## Multiple sequence alignment (MSA)

Beyond pairwise: align N sequences simultaneously. Output: a matrix where rows are sequences, columns are aligned positions.

- **Progressive** (Clustal Omega, MUSCLE): build a guide tree from pairwise alignments; merge sequences progressively. Fast; not always optimal.
- **Iterative refinement** (T-Coffee): refine the alignment after initial progressive build.
- **Profile HMMs** (HMMER): probabilistic models of position-specific substitution patterns. Used for searching for distant homologs (HMM scan beats BLAST for low-identity matches).

The MSA is a critical input to many bio-ML methods (AlphaFold, ESM-MSA, co-evolution-based contact prediction).

## Modern fast aligners

- **MMseqs2** (Steinegger 2017): much faster than BLAST; comparable accuracy. Default for new pipelines.
- **DIAMOND**: similar speed; specialized for large genome-vs-genome comparisons.
- **Foldseek**: structure-based alignment using AlphaFold predictions. Captures distant relationships that sequence alignment misses.
- **ESM-search**: protein LM embeddings + cosine similarity. Can find functionally-similar proteins where sequence identity is too low for BLAST.

For modern pipelines: MMseqs2 for sequence; Foldseek for structure; ESM-based search for functional relatedness. Use the right tool for the question.

## ML-based alignment

Few methods have replaced classical alignment, but several augment it:

- **Learned substitution matrices**: train a neural network to score residue pairs in context (rather than BLOSUM62's context-free scoring).
- **Embedding-based alignment**: align sequences in protein-LM embedding space rather than character space.
- **Differentiable alignment**: replace argmax with softmax for end-to-end gradient flow. Used in some AlphaFold-style models.

Classical Smith-Waterman + BLOSUM62 + affine gaps is still the right tool for most bioinformatics. ML alternatives are emerging for specific use cases.
