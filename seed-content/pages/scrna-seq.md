---
title: Single-Cell RNA-Seq
category: bio
---
<!-- tier:intro -->
# Single-Cell RNA-Seq (scRNA-seq)

Measure gene expression in individual cells. Output: a matrix of cells × genes × counts. Typically 10,000-1,000,000 cells × ~20,000 genes per experiment.

Reveals heterogeneity that bulk RNA-seq averages out. Used for cell-type discovery, developmental trajectories, perturbation responses, single-cell genomics.

Standard pipeline: QC → normalize → highly variable genes → PCA → UMAP → clustering → cell-type annotation.

<!-- tier:undergrad -->
# scRNA-seq (Undergrad)

## What's measured

For each cell, count the number of mRNA molecules detected per gene. Cells × genes count matrix:

```
cell_1  cell_2  cell_3 ... cell_N
gene_1   3       0       1            ...
gene_2   0       7       0            ...
gene_3   2       2       4            ...
...
gene_M   0       1       0            ...
```

Typical: N = 10K-1M cells; M = ~20K genes. Most entries are zero — both biological (each cell only expresses a subset) and technical (limited capture efficiency, ~1-10% of mRNAs detected).

## Standard pipeline

1. **Quality control**: filter cells by total counts, gene counts, mitochondrial fraction. Remove low-quality cells.

2. **Normalization**: divide each cell's counts by its total; log-transform. `log(1 + count_per_10k)` is standard.

3. **Highly variable genes (HVGs)**: identify ~2000-5000 genes with high variance relative to mean. Reduces dimensionality.

4. **PCA**: 50-100 components. Captures most variance.

5. **UMAP / t-SNE**: 2D embedding for visualization.

6. **Clustering** (Leiden / Louvain on KNN graph in PCA space): partition cells into clusters.

7. **Cell-type annotation**: identify marker genes per cluster; match to known cell-type signatures.

Tools: **Scanpy** (Python), **Seurat** (R). Standard in every scRNA-seq paper.

## Why ML is interesting here

- **Sparsity**: ~80-95% of entries are zero (mix of true zero + dropout). Standard methods (PCA on raw counts) work imperfectly.
- **Batch effects**: technical variation across experiments. Direct combination of datasets fails.
- **High dimensionality**: 20K genes × 100K cells is a 2-billion-entry matrix.
- **Biological structure**: cells form clusters + trajectories; meaningful structure to discover.

ML methods address each.

<!-- tier:grad -->
# scRNA-seq (Grad)

## Specialized methods

**scVI** (single-cell variational inference): a VAE with negative-binomial likelihood (matches the count distribution of scRNA-seq) and explicit batch-correction. The dominant deep-learning method for scRNA-seq embeddings + batch correction.

**Foundation models for scRNA-seq**:
- **Geneformer**: 30M parameter transformer trained on 30M cells. Tokenize cells as gene-rank sequences.
- **scGPT**: GPT-style for cells.
- **scBERT**: BERT-style.
- **UCE**: Universal Cell Embeddings; trained on 36M cells across many species.

These foundation models offer pretrained cell embeddings that fine-tune for downstream tasks (cell-type prediction, perturbation response).

**Trajectory inference**: cells progress through differentiation along trajectories. Methods:
- **Monocle**: classical trajectory + pseudotime.
- **PAGA**: graph abstraction of cluster connectivity.
- **scVelo**: RNA velocity via spliced vs unspliced reads. Predicts cell-state changes.

**Spatial transcriptomics**: scRNA-seq + spatial coordinates. Integrate with methods like **STAGATE**, **GraphST**.

## Cell types vs cell states

A persistent question: are clusters distinct cell types (categorical) or continuous states along a trajectory?

- **Discrete clusters** (mature blood cells): clear types.
- **Continuous trajectories** (developing embryos, immune cell maturation): no clean clusters.

Modern methods (PAGA, RNA velocity) handle both — cluster + connect clusters into a graph capturing transition relationships.

## Scaling up

scRNA-seq atlases are reaching 10M+ cells. Computational challenges:

- **Memory**: a sparse (10M, 20K) matrix is ~10GB compressed.
- **Compute**: PCA / UMAP / clustering all need efficient sparse implementations.
- **Foundation model inference**: even Geneformer's 30M-cell training was a major engineering effort.

Tools: **anndata** (efficient sparse storage), **scvi-tools** (deep-learning models scale to atlases), **rapids-singlecell** (GPU-accelerated standard pipeline).

## What scRNA-seq doesn't capture

- Direct protein levels (mRNA correlates only ~50% with protein).
- Spatial organization (lost in dissociation).
- Single-cell history (stateless snapshot).

Multi-omics + spatial methods address these. The future of single-cell biology is multi-modal: RNA + ATAC + protein + spatial + perturbation in one experiment.
