---
title: MSA Attention
category: bio
---
<!-- tier:intro -->
# MSA Attention

A specialized attention mechanism in AlphaFold's evoformer that operates on the multiple sequence alignment (MSA) representation. The MSA is a 2D matrix (sequences × positions); attention runs in two directions:

- **Row-wise**: each MSA row attends within itself across positions.
- **Column-wise**: each MSA column attends within itself across sequences.

The combination extracts both within-sequence patterns (one row's residues + their positions) and cross-sequence patterns (which positions are conserved or co-vary across the alignment).

<!-- tier:undergrad -->
# MSA Attention (Undergrad)

## Row-wise attention

For each MSA row (one sequence in the alignment):

```
Q, K, V = linear(MSA[row, :, :])
attn = softmax(Q · K^T + bias_from_pair) · V
```

Each row's residues attend to other residues in the same row. The bias from pair representation injects geometric information — pairs of residues that the pair representation thinks are close in 3D get higher attention weight.

This is essentially standard self-attention over a single sequence, with the twist that it's biased by the global geometric reasoning happening in the pair representation.

## Column-wise attention

For each MSA column (one position across all sequences):

```
Q, K, V = linear(MSA[:, col, :])
attn = softmax(Q · K^T) · V
```

Each column's entries attend to other entries in the same column. Conserved positions emerge: if all sequences have similar residues at this column, attention becomes self-reinforcing.

## Why two directions

- **Row attention**: 'within this sequence, what other positions matter for understanding this residue?' Captures structural patterns.
- **Column attention**: 'across sequences, what does this position look like? Is it conserved? Variable?' Captures evolutionary patterns.

The two together: the model knows both the structural context within a sequence AND the evolutionary context across sequences. Co-evolution emerges from both: positions that co-vary across sequences (column-wise) and that are physically close within a sequence (row-wise) become structurally constrained.

## Pair bias

Row-wise attention's pair bias is critical. It's:

```
bias[i, j] = linear(pair[i, j])
```

The pair representation encodes 'how close are residues i and j in 3D?' Adding it as an attention bias means the model attends more between pairs the pair representation thinks are close. As pair representation refines, attention focuses on geometrically-relevant pairs.

<!-- tier:grad -->
# MSA Attention (Grad)

## Memory complexity

For an MSA with N_seq sequences and N_res residues:

- **Row-wise attention**: `O(N_seq · N_res² · channels)` — each row's attention over its own positions.
- **Column-wise attention**: `O(N_res · N_seq² · channels)` — each column's attention over its own sequences.

For typical AlphaFold inputs (N_seq ~1000-10000, N_res ~300): both terms can be GB-scale. Chunking + checkpointing mitigate.

For long proteins (N_res > 1000), AlphaFold uses cropping during training (random 256-residue subsets) and inference chunking to keep memory tractable.

## Connection to traditional MSA analysis

Classical bioinformatics extracts information from MSAs via:
- **Conservation scores**: per-column variance or entropy.
- **Co-evolution analysis** (DCA, PSICOV): direct coupling analysis identifies position pairs whose joint distribution differs from independent.

MSA attention learns these patterns implicitly:
- Column attention captures conservation.
- Row attention + outer product mean captures co-evolution.

The advantage of attention over hand-crafted DCA: end-to-end training. Errors in the conservation/coupling signal propagate to structure predictions; the model can correct them.

## When MSA attention is suboptimal

For shallow MSAs (few homologs), there's not enough cross-sequence signal. Performance degrades.

ESM-Fold's alternative: skip the MSA entirely. Use a protein LM's per-residue features instead. The protein LM was pretrained on 30M+ sequences, so it has implicit co-evolution-like patterns baked in. Works well for orphan proteins; slightly worse for well-aligned ones than full AlphaFold.

The trend: future bio-ML may reduce MSA dependence further, replacing MSA attention with protein-LM features. AF3 already shifts emphasis away from MSA toward direct pair representation.
