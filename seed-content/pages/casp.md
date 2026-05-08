---
title: CASP — Critical Assessment of Structure Prediction
category: bio
---
<!-- tier:intro -->
# CASP

The **Critical Assessment of Structure Prediction**. Biennial competition where teams predict 3D structures of proteins whose experimental structures haven't been published. Predictions are submitted blind; experimental structures revealed only afterward.

Held since 1994. CASP14 (2020) was the breakthrough: AlphaFold scored ~92 GDT_TS, dramatically beating the previous SOTA (~60). Effectively solved the protein folding problem.

CASP's strict experimental design — time-based, sequence-similarity-restricted holdouts — is the gold standard for bio-ML evaluation.

<!-- tier:undergrad -->
# CASP (Undergrad)

## How it works

1. Experimentalists determine new protein structures.
2. CASP organizers select a subset; release the sequences (only) to the community.
3. Teams have ~6-8 weeks to predict structures and submit.
4. Predictions submitted to CASP organizers + sealed.
5. After all submissions, experimental structures are released; CASP scores all predictions.

Strictly time-based: target structures don't exist publicly until after submissions. No leakage possible (mostly).

## Scoring

**GDT_TS** (Global Distance Test, Total Score):

```
GDT_TS = (P_1 + P_2 + P_4 + P_8) / 4
```

where `P_X` is the percent of residues within X Å of the true position (after optimal superposition). Range 0-100. Effective ceiling around 90-95 for current experimental methods (above which differences are within experimental noise).

Pre-CASP14 best: ~60. CASP14 AlphaFold: ~92. The leap was decisive.

**lDDT** (local Distance Difference Test): per-residue local accuracy. Doesn't depend on global superposition; useful for fragment-level scoring.

## Categories

CASP has multiple categories:
- **Free modeling (FM)**: targets without good homologs. Hardest.
- **Template-based modeling (TBM)**: targets with known homologs.
- **Quaternary**: protein complexes.
- **Disorder prediction**: identify intrinsically disordered regions.
- **Function prediction**: predict function from sequence.

AlphaFold dominated all structure-prediction categories.

## Why CASP matters

- **Honest benchmark**: time-based holdout prevents leakage. AlphaFold's CASP14 score is genuinely on novel structures.
- **Cross-team comparison**: teams use whatever methods they want; ranking compares actual capability.
- **Drives the field**: every two years, the bar rises. Pre-2020 was hard work; post-2020 is incremental refinement.

Without CASP, AlphaFold's claims would have been dismissed (or accepted on faith). With CASP, the result was unambiguous.

<!-- tier:grad -->
# CASP (Grad)

## CASP15 + post-AlphaFold era

CASP15 (2022): AlphaFold-class methods continued to dominate. The folding problem's main challenges had shifted:
- **Multimers**: protein-protein complexes; harder than single-chain. AlphaFold-Multimer + variants top the leaderboard.
- **Disorder**: intrinsically disordered regions; AlphaFold-style methods give low confidence here.
- **Membrane proteins**: trained on soluble proteins primarily; embedded in lipid bilayers is harder.
- **RNA + ligand complexes**: AlphaFold 3 (2024) extends to these.

CASP16 (2024): AlphaFold 3 sets new state of the art on multimer + ligand prediction.

## Benchmark contamination outside CASP

Other bio-ML benchmarks lack CASP's strict time-based holdout. Common pitfalls:

- **PSI-BLAST homologs in train + test**: a 'held-out' protein has 70%-similar siblings in training. Methods memorize.
- **Database leakage**: a dataset published in 2022 may include sequences only added to UniRef in 2023. Method evaluation is contaminated.

Strict bio-ML benchmarks always use:
1. Sequence-similarity clustering (typically 30% identity cutoff) before splitting.
2. Time-based holdouts when feasible.
3. Held-out test sets never used during method development.

CASP's design is the gold standard. Everything else falls short to some degree.

## Cross-references

CASP-style holdouts apply not just to structure prediction. The principle generalizes:
- **Function prediction**: hold out by sequence-similarity.
- **Variant effect**: hold out by gene family.
- **Drug discovery**: hold out by chemotype.

The pattern: **prevent the model from being trained on data 'too similar' to the test set**, where 'too similar' is biology-specific. Generic ML evaluation often misses this; bio-ML rigorously enforces it.
