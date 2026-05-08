---
title: Protein Sequence
category: bio
---
<!-- tier:intro -->
# Protein Sequence

A protein is a string over the 20-amino-acid alphabet:

```
A R N D C Q E G H I L K M F P S T W Y V
```

(One-letter codes for the 20 standard amino acids.)

Length typically 100-500 residues; some are 30 (small peptides), some 30,000+ (titin, the largest known). The sequence determines the structure; the structure determines the function.

<!-- tier:undergrad -->
# Protein Sequence (Undergrad)

## Amino acid properties

The 20 amino acids cluster by chemical properties:

- **Hydrophobic** (water-avoiding): A, V, L, I, M, F, W, P. Tend to cluster in the protein's interior.
- **Polar**: S, T, N, Q, Y, C. Form hydrogen bonds.
- **Charged positive**: K, R, H.
- **Charged negative**: D, E.
- **Special**: G (smallest, flexible), C (forms disulfide bonds), P (rigid backbone).

These properties drive folding: hydrophobic residues bury inside; polar/charged residues face the water; cysteines form covalent links.

## Sequence representations in ML

**Per-character tokens**: each amino acid is one token. Vocab=20. Standard for protein LMs.

**One-hot encoding**: for downstream models that take vector inputs.

**BLOSUM-derived embeddings**: project each amino acid into a 20-dim vector based on BLOSUM62 substitution scores. Captures biological similarity directly.

**Learned embeddings** (ESM, ProtBERT): train a transformer; use the per-residue embeddings as features. The dominant modern approach.

## Sequence motifs

Short patterns recurring across proteins. Often functional:
- **Signal peptides**: first 20-30 residues; direct the protein to a cellular location.
- **Active sites**: specific residues critical for enzyme function (often well-conserved).
- **Binding motifs**: short sequences that mediate protein-protein interactions.

ML methods: motif scanning (HMMs, PROSITE), attention-based motif learning, contrastive embeddings.

<!-- tier:grad -->
# Protein Sequence (Grad)

## Beyond the standard 20

- **Selenocysteine (U)**: 21st amino acid; encoded by UGA (normally a stop codon) with a special context. Found in some redox enzymes.
- **Pyrrolysine (O)**: 22nd; only in some archaea.
- **Modified residues**: post-translational modifications (PTMs) — phosphorylation, glycosylation, ubiquitination, etc. Add ~2x more 'effective letters' but are usually represented as annotations on the standard sequence.

For most practical bio-ML: stick with the 20 + special tokens for ambiguity ('X' for unknown, '-' for gap). The non-standard amino acids are rare.

## Protein databases

- **UniProt**: ~250M sequences. The canonical resource. Subdivided:
  - **UniRef50**: clustered at 50% identity (~30M cluster representatives).
  - **UniRef90**: clustered at 90% identity (~150M).
  - **UniRef100**: full set, deduplicated (~250M).
- **PDB**: ~200K experimentally-determined 3D structures.
- **AlphaFold DB**: 200M+ predicted structures (covering all UniProt).
- **SCOP / CATH**: structural classification of known folds.

For training large protein LMs: UniRef50 or UniRef90. For structure prediction: PDB + UniRef + AlphaFold DB.

## Long-tail proteins

The 'famous' proteins (hemoglobin, insulin, CRISPR-Cas9) are well-studied. The long tail — millions of computationally-discovered proteins with unknown function — is the bio-ML opportunity. Methods that 'characterize a random protein' from sequence alone (function classification, structure prediction, binding partner identification) accelerate discovery dramatically.
