---
title: Protein Structure
category: bio
---
<!-- tier:intro -->
# Protein Structure

The 3D arrangement of a protein's atoms. Function follows structure: enzymes catalyze reactions because their active site has the right shape; antibodies recognize antigens because their surface complements them; structural proteins support tissues because they fold into rigid arrays.

Four hierarchical levels: primary (sequence), secondary (helix/sheet/coil), tertiary (3D fold), quaternary (multi-chain assemblies).

<!-- tier:undergrad -->
# Protein Structure (Undergrad)

## Levels of structure

**Primary**: the amino acid sequence. A 1D string.

**Secondary**: local 3D motifs.
- α-helix: tight right-handed helix; ~3.6 residues per turn; H-bonds between residues `i` and `i+4`.
- β-sheet: extended residues forming sheets via H-bonds; can be parallel or antiparallel.
- Loop / coil: unstructured connecting regions.

A typical protein: 30-50% α-helix + 20-30% β-sheet + 30-40% loop.

**Tertiary**: the full 3D fold. Stabilized by:
- Hydrophobic core (nonpolar residues cluster inside).
- Hydrogen bonds (within secondary structure + to side chains).
- Disulfide bonds (covalent S-S between cysteines).
- Salt bridges (charge interactions).

**Quaternary**: multi-chain assemblies. Hemoglobin = 4 chains. Antibodies = 4 chains. Many proteins act in oligomeric form.

## Folding

Anfinsen's hypothesis: the native structure is the global minimum of the free energy. Sequence + environment → unique fold.

For most proteins this holds; some require chaperones (helper proteins) to fold correctly. Some proteins are intrinsically disordered (no stable structure; functional anyway).

The folding problem: predict the structure from sequence. Open from 1972 to 2020. AlphaFold solved it.

## Computational representations

- **Atomic coordinates**: per-atom (x, y, z). The most direct representation.
- **Pairwise distances**: rotation-invariant. AlphaFold's working representation.
- **Internal coordinates**: bond lengths, angles, dihedrals. Equivariant to overall transformation.
- **Contact maps**: binary; 'are residues i and j within 8 Å?' Useful as a coarse target.

For ML: the choice matters. Equivariant networks (E(3)-NNs) preserve symmetry directly. Standard transformers need invariant representations (distances) or augmentation.

<!-- tier:grad -->
# Protein Structure (Grad)

## The protein databank (PDB)

~200K experimentally-determined structures. X-ray crystallography (~85%), NMR (~10%), cryo-EM (~5%, fast-growing).

Limitations:
- Mostly bacterial / human proteins. Coverage uneven.
- Crystal structures are crystallized states — sometimes not the biologically-relevant conformation.
- Resolution varies (1-10 Å); higher resolution = more reliable.

The PDB is the training set for AlphaFold and ESM-fold-style methods. With ~170K usable structures + millions of sequences, training data is rich enough for deep learning to crack the folding problem.

## Structure-determination experiments

- **X-ray crystallography**: crystallize the protein, scatter X-rays, infer structure from diffraction pattern. High resolution; limited to crystallizable proteins.
- **NMR**: nuclear magnetic resonance. Solution-state; mostly small proteins.
- **Cryo-EM**: electron microscopy at cryogenic temperatures. Fast-growing; works on large complexes.
- **Mass spectrometry**: indirect; gives info about complexes + interactions.

Each has strengths and biases. Combining them gives a richer view than any one alone.

## Structural classification

Hierarchies of folds:
- **CATH**: Class (α/β topology), Architecture, Topology, Homologous superfamily.
- **SCOP**: Class, Fold, Superfamily, Family.

Both classify ~1000-1500 distinct folds. New folds are still discovered occasionally; the rate has slowed.

## Beyond static structure

- **Conformational ensembles**: many proteins exist in multiple conformations; flexibility is functional. NMR + MD give the ensemble; AlphaFold gives one snapshot.
- **Allostery**: distant binding events affect each other. Captured by MD; emerging in ML models.
- **Intrinsically disordered proteins**: don't have a stable fold. Hard to predict; AlphaFold handles them poorly. ~30% of human proteins have significant disorder.
