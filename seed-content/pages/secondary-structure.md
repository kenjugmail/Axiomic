---
title: Protein Secondary Structure
category: bio
---
<!-- tier:intro -->
# Secondary Structure

Local 3D motifs in a protein. Determined by hydrogen-bonding patterns within the backbone. Three main types: α-helix, β-sheet, and loop / coil.

A protein typically has 30-50% α-helix + 20-30% β-sheet + 30-40% loop. The composition varies by fold class — all-α proteins (like hemoglobin) are mostly helix; all-β (like Ig domains) are mostly sheet.

<!-- tier:undergrad -->
# Secondary Structure (Undergrad)

## α-helix

A tight right-handed helix. ~3.6 residues per turn. The carbonyl O of residue `i` hydrogen-bonds to the amide N of residue `i+4`.

Side chains project outward, perpendicular to the helix axis. The helix is rigid; ~5.4 Å rise per turn.

**Helix-forming residues**: A, L, M, E favor helices. P (proline) breaks them (its rigid ring disrupts the H-bonding pattern). G (glycine) is too flexible.

## β-sheet

Extended residues; multiple strands form sheets via H-bonds between strands. Can be:
- **Parallel**: strands run in the same N-to-C direction.
- **Antiparallel**: strands alternate direction. More stable.

Side chains alternate above + below the sheet plane.

**β-forming residues**: V, I, T, F favor strands. P, G disrupt.

## Loops / coils

Everything not α or β. Connect secondary-structure elements; often functionally important (binding sites, hinges).

Glycine + proline are common in loops (their flexibility / rigidity properties are well-suited).

## Predicting secondary structure

Given a sequence, predict the secondary-structure label per residue (Q3 = 3-class: H/E/C, or Q8 with finer categorization).

Modern accuracy:
- **PSIPRED, JPred** (HMM + neural net hybrids): ~80% Q3.
- **NetSurfP-3.0** (deep learning): ~85% Q3.
- **AlphaFold**: implicit; no need to predict secondary structure separately when you can predict full 3D.

For ML: secondary structure is a useful intermediate target during representation learning. Some pretraining objectives include 'predict secondary structure label per residue' as auxiliary supervision.

<!-- tier:grad -->
# Secondary Structure (Grad)

## DSSP and the 8-class scheme

The **DSSP algorithm** (Kabsch & Sander 1983) assigns secondary structure to each residue from a 3D structure. 8 classes:

- H: α-helix
- G: 3₁₀-helix (tighter than α)
- I: π-helix (rare)
- E: β-strand
- B: isolated β-bridge
- T: turn
- S: bend
- C: coil (none of the above)

Q3 collapses to: H+G+I → helix; E+B → strand; T+S+C → loop.

DSSP is the standard for secondary-structure assignment. Variants (STRIDE, PROSS) give slightly different labels but agree on the bulk.

## Why secondary structure matters

- **Folding nucleation**: secondary structure forms early in folding; tertiary structure follows.
- **Function**: many active sites are loop regions (flexibility for ligand binding); structural cores are helix/sheet bundles.
- **Stability**: more secondary structure → more H-bonds → more stable. Thermophiles have more helix/sheet content than mesophiles on average.

## Predicting from sequence

Pre-AlphaFold: secondary structure prediction was a major sub-field. Methods:

- **PSI-PRED**: PSI-BLAST-derived position-specific scoring matrix → neural net → secondary structure label per residue. ~80% Q3.
- **DeepCNF, SPOT-1D**: deep learning + multi-task (predict secondary structure + disorder + accessibility jointly).

Post-AlphaFold: predicting secondary structure separately is mostly unnecessary; AlphaFold's predicted structure includes it implicitly. Useful as a quick sanity check or for very long proteins where AlphaFold is slow.

For ML training: secondary structure serves as a useful auxiliary supervision signal — easier to predict than full structure, but correlated.
