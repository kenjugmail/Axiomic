---
title: BLAST
category: bio
---
<!-- tier:intro -->
# BLAST

**Basic Local Alignment Search Tool** (Altschul 1990). The bioinformatics workhorse for 'what's this sequence?' Heuristic + statistical foundation; sub-second searches against multi-million-sequence databases.

Given a query sequence, BLAST finds high-scoring local alignments in a precomputed database. Output: ranked hits with E-values measuring statistical significance.

<!-- tier:undergrad -->
# BLAST (Undergrad)

## The algorithm

1. **Word indexing**: for the query, list all k-mers (k=3 for protein, k=11 for DNA).
2. **Find seeds**: for each query word, find database positions with a high-scoring word match (above a threshold, using the substitution matrix).
3. **Extend**: from each seed, extend the alignment in both directions. Stop when the score drops below a threshold (drop-off score).
4. **Filter and rank**: report extensions above a final threshold; rank by score.
5. **E-value**: compute statistical significance.

Pre-indexed databases make this fast: searching against 10M sequences takes sub-second.

## E-value

The number expected by chance from a random database of the same size:

```
E = K · m · n · e^(-λ S)
```

where `m, n` are query + database sizes, `S` is the alignment score, `K, λ` are scoring-matrix-specific constants.

Interpretation:
- **E < 1e-50**: highly significant; almost certainly homologous.
- **E < 0.001**: significant; likely related.
- **E ~ 1**: borderline.
- **E > 10**: not significant.

E-values depend on database size — searching a smaller database gives lower E-values for the same alignment.

## BLAST programs

- **blastp**: protein query → protein database.
- **blastn**: DNA → DNA.
- **blastx**: DNA query (translated 6 frames) → protein database.
- **tblastn**: protein → translated DNA database.
- **psi-blast**: iterative; build a position-specific score matrix from initial hits, search again. Finds distant homologs better.

## When BLAST fails

- **Low-identity homologs (<25%)**: BLAST's seed-and-extend algorithm misses these. Use HHblits or HMMER (HMM-based) instead.
- **Highly repetitive sequences**: low-complexity regions match many things. BLAST has filters but they sometimes mask important regions.
- **Structural homologs without sequence similarity**: convergent evolution. Use Foldseek (structure-based) instead.

<!-- tier:grad -->
# BLAST (Grad)

## Modern alternatives

- **MMseqs2**: 100-1000× faster than BLAST at similar sensitivity. Default for new pipelines.
- **DIAMOND**: similar speed; specialized for metagenomic + comparative genomics.
- **HHblits**: HMM-based; finds distant homologs BLAST misses (down to ~15-20% identity).
- **Foldseek**: structure-based via AlphaFold structures. Catches structural homologs without sequence similarity.

For modern bioinformatics:
- **Quick lookup**: BLAST or MMseqs2 (faster but BLAST's reputation = sticking power).
- **Distant homology**: HHblits.
- **Structure-based**: Foldseek.
- **Function-based**: ESM-search (protein LM embeddings).

## Statistical theory

Karlin & Altschul 1990 proved that local alignment scores follow an extreme value distribution under random-sequence assumptions. This is what makes E-values rigorous: given the score distribution, the expected number of random hits at score S can be computed exactly.

The theory assumes random independent residues at fixed composition — which isn't quite biology (proteins have correlated structure) — but the assumption is close enough that E-values are practically reliable.

## E-value pitfalls

- **Database size dependence**: same alignment in a 1M database vs 1B database has 1000× different E-value.
- **Composition bias**: sequences with biased amino acid composition (low complexity) get inflated E-values.
- **Multiple testing**: searching with many queries inflates Type I error. Apply Bonferroni correction or FDR control.

E-values are statistical estimates with assumptions. Always interpret with caveats.
