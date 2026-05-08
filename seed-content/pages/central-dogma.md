---
title: The Central Dogma
category: bio
---
<!-- tier:intro -->
# The Central Dogma

DNA → RNA → Protein. The flow of biological information.

- DNA stores the heritable instructions.
- RNA copies them.
- Protein executes them.

For computational biology: each is a sequence over a defined alphabet. ML methods process them as sequences with biology-specific tokenization + structural priors.

<!-- tier:undergrad -->
# Central Dogma (Undergrad)

## DNA

A 4-letter alphabet `{A, T, G, C}`. Double-stranded; the two strands are complementary (A pairs with T, G with C).

The human genome: ~3 billion base pairs in 23 chromosome pairs. ~2% of it codes for proteins (genes); the rest is regulatory + non-coding.

## RNA

Similar to DNA but with `U` (uracil) replacing `T`. Single-stranded.

Three main types:
- **mRNA (messenger RNA)**: carries instructions from DNA to the ribosome. Encodes one protein.
- **tRNA (transfer RNA)**: matches mRNA codons to amino acids during translation.
- **rRNA (ribosomal RNA)**: structural component of the ribosome.

## Protein

A 20-letter alphabet (the 20 standard amino acids). Synthesized at ribosomes by reading mRNA 3 bases at a time (codons).

The genetic code: 64 codons → 20 amino acids + 3 stop codons. Many codons code for the same amino acid (degeneracy).

Length: typically 100-500 amino acids; up to ~30,000 in extreme cases.

## The flow

```
DNA  →  (transcription)  →  mRNA  →  (translation)  →  Protein
```

Plus reverse-transcribed DNA (retroviruses), DNA replication, RNA editing — the dogma is the central pattern with edge cases.

<!-- tier:grad -->
# Central Dogma (Grad)

## Computational implications

- **Sequence representation**: per-character tokenization (4 for DNA/RNA, 20 for protein) is the standard.
- **Codon-level analysis**: predict translation efficiency from codon usage patterns. Some species prefer certain codons over synonymous alternatives.
- **Reading frames**: a DNA sequence has 6 possible reading frames (3 on each strand). Identifying the correct one is part of gene prediction.
- **Non-coding RNA**: miRNA, lncRNA, etc. Don't code for proteins but have regulatory functions. Active research area.

## Information storage

Information density:
- DNA: 2 bits per base.
- Protein: ~4.3 bits per residue (log₂ 20).

3 DNA bases (6 bits) → 1 amino acid (4.3 bits): redundancy. Allows mutation tolerance.

Information transfer:
- DNA → DNA: replication (high fidelity, ~10^-9 errors per base per generation in humans).
- DNA → RNA: transcription (errors ~10^-5).
- RNA → Protein: translation (errors ~10^-3).

The 'errors get worse downstream' pattern is itself biologically meaningful — protein-level errors can be tolerated; DNA-level errors propagate.

## Beyond the dogma

The central dogma is the *information flow* picture. Real biology has many more layers: epigenetics (DNA methylation, histone modifications), post-translational modifications (proteins modified after synthesis), alternative splicing (one gene → many proteins). Modern bio-ML increasingly incorporates these.
