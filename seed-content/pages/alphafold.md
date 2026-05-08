---
title: AlphaFold
category: bio
---
<!-- tier:intro -->
# AlphaFold

DeepMind's protein structure prediction system. AlphaFold 2 (Jumper 2020) effectively solved the 50-year-old folding problem; AlphaFold 3 (2024) extends to multi-molecule complexes (proteins, DNA, RNA, ligands).

Pipeline: build MSA → evoformer (attention on MSA + pair representation) → structure module (SE(3)-equivariant) → recycling.

<!-- tier:undergrad -->
# AlphaFold (Undergrad)

## The breakthrough

CASP14 (2020): AlphaFold's median GDT_TS jumped from ~60 (previous SOTA) to ~92. By any meaningful measure, the protein-folding problem was solved. Protein structure prediction is now within experimental error for most proteins.

## Pipeline overview

```
Input: protein sequence

Step 1: Build MSA
  Search UniRef + BFD via JackHMMER + HHblits
  Result: thousands of homologous sequences aligned to query

Step 2: Initial pair features
  Pairwise residue features; relative position embeddings

Step 3: Evoformer (48 blocks)
  Update MSA representation + pair representation jointly
  Co-evolution flows from MSA into pair via outer-product mean
  Triangle-aware updates on pair representation

Step 4: Structure module (8 cycles)
  SE(3)-equivariant Invariant Point Attention (IPA)
  Output: 3D coordinates per residue

Step 5: Recycling (3 iterations)
  Run the whole network 3 times; refine each iteration

Output: 3D structure + per-residue confidence (pLDDT)
```

~93M parameters total. Inference ~minutes per protein on a GPU.

## Confidence (pLDDT)

Per-residue confidence score:
- **pLDDT > 90**: very high confidence; treat as reliable.
- **70-90**: confident; minor structural deviations possible.
- **50-70**: low confidence; rough fold likely correct, details uncertain.
- **< 50**: very low; often disordered or poorly-modeled.

Use pLDDT to know which parts of the structure to trust. Integral to using AlphaFold predictions in downstream applications.

<!-- tier:grad -->
# AlphaFold (Grad)

## Evoformer in detail

The evoformer's two representations:

- **MSA representation**: shape `(N_seq, N_res, channels)`.
- **Pair representation**: shape `(N_res, N_res, channels)`.

Each block does:

1. **MSA row-wise attention** (biased by pair): each MSA row attends within itself; pair representation provides geometric bias.
2. **MSA column-wise attention**: each MSA column attends within itself; conserved positions emerge.
3. **MSA transition (FFN)**.
4. **Outer product mean**: flow MSA features into pair representation. **The core co-evolution mechanism.**
5. **Triangular updates** on pair: enforce geometric consistency (triangle inequality-like).
6. **Pair attention** (biased by triangular updates).
7. **Pair transition (FFN)**.

The bidirectional flow MSA ↔ pair is what makes the evoformer work. Pure MSA processing or pure pair processing wouldn't converge to accurate structure.

## Structure module + IPA

**Invariant Point Attention** (IPA): SE(3)-equivariant attention. Each residue has a 'frame' (position + orientation). IPA respects rotational symmetry: rotating the input rotates the output equivalently.

The structure module iterates 8 times, refining the structure each cycle. Output: 3D coordinates for every atom (backbone + side chains).

## AlphaFold-Multimer + AlphaFold 3

**AlphaFold-Multimer** (2021): extends AF2 to protein-protein complexes. Trains on multimeric assemblies; predicts complexes accurately.

**AlphaFold 3** (2024): extends to any biomolecular complex — protein-protein, protein-ligand, protein-nucleic acid. Architectural changes:
- Dropped MSA-based co-evolution as the primary signal; emphasizes pair representation.
- Diffusion-based structure module (instead of IPA).
- Trains on broader complex data.

AF3 is the current SOTA for predicting biomolecular complexes. AF2 is still standard for single-chain protein structure.

## Failure modes

- **Disordered regions**: low pLDDT; structure not really meaningful.
- **Conformational changes**: AlphaFold gives one snapshot; missing alternative conformations.
- **Multi-domain proteins**: domain orientations sometimes wrong.
- **Novel folds without homologs**: works less well; ESMFold (no MSA) sometimes closer.
- **Membrane proteins**: trained on soluble proteins; membrane-embedded geometry can be off.

For most applications: AlphaFold + pLDDT confidence + visual inspection is sufficient. For high-stakes use, validate against any available experimental data.
