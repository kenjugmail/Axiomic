---
title: UMAP and t-SNE
category: bio
---
<!-- tier:intro -->
# UMAP and t-SNE

Two non-linear dimensionality reduction methods used to visualize high-dimensional data in 2D or 3D. Standard in scRNA-seq for cell-type clustering visualizations.

- **t-SNE** (van der Maaten 2008): preserves local neighborhood structure.
- **UMAP** (McInnes 2018): preserves both local + some global structure. Faster than t-SNE; usually preferred for new applications.

<!-- tier:undergrad -->
# UMAP / t-SNE (Undergrad)

## t-SNE

Procedure:
1. Compute pairwise similarities in high-dim using Gaussian kernel.
2. Initialize random low-dim embedding.
3. Compute pairwise similarities in low-dim using Student-t kernel.
4. Minimize KL divergence between high-dim and low-dim distributions via SGD.

Heavy on local structure: nearby points in high-dim stay nearby in low-dim. Less reliable for global structure: clusters' relative positions in 2D don't always reflect their high-dim distances.

Hyperparameter: **perplexity** (~5-50). Higher → wider neighborhood considered → smoother embedding.

## UMAP

Procedure:
1. Build a fuzzy nearest-neighbor graph in high-dim.
2. Initialize low-dim embedding (often via spectral method).
3. Optimize cross-entropy between high-dim graph and low-dim graph via SGD.

Compared to t-SNE:
- **Faster** (~10×).
- **Better global structure** (somewhat).
- **More stable** across runs.

Hyperparameters: **n_neighbors** (15 typical), **min_dist** (0.1 typical, controls cluster compactness).

## In scRNA-seq

Standard recipe:
```
adata = sc.read_h5ad('cells.h5ad')
sc.pp.normalize_total(adata)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata)
sc.tl.pca(adata, n_comps=50)
sc.pp.neighbors(adata, n_neighbors=15)
sc.tl.umap(adata)
sc.pl.umap(adata, color='cell_type')
```

UMAP is the default in scanpy and Seurat. The 2D plot shows cells colored by cluster or by gene expression — the canonical visualization in scRNA-seq papers.

<!-- tier:grad -->
# UMAP / t-SNE (Grad)

## Caveats

UMAP/t-SNE plots are **visualizations**, not analyses. Common misinterpretations:

1. **Cluster size** in UMAP doesn't match high-dim cluster size. Larger blobs aren't 'larger populations' or 'more diverse'.

2. **Distances between clusters** in UMAP don't match high-dim distances. Cluster A being far from cluster B in UMAP doesn't mean they're highly distinct.

3. **Density** in UMAP doesn't match high-dim density.

4. **Run variability**: random initialization → different layouts. Always run with fixed random_state.

5. **Hyperparameter sensitivity**: change n_neighbors or min_dist → different-looking plot. Same data; different visualizations.

For quantitative analysis, use the high-dim representation (PCA components, learned embeddings). UMAP is for showing the structure to humans, not for downstream computation.

## When neither is the right tool

- **Quantitative cluster assignments**: cluster in PCA space directly (Leiden / Louvain). Don't cluster on UMAP coordinates.
- **Trajectory inference**: UMAP can mislead trajectories (artifact connections from layout). Use PAGA / RNA velocity directly on the data.
- **Distance-based downstream**: KNN classifiers, distance-based regression. Use the high-dim representation.

The community sometimes treats UMAP coordinates as 'the data' for downstream analysis. This is wrong. UMAP is lossy + non-linear; reconstruct nothing from its coordinates that requires distance fidelity.

## Modern alternatives

- **PHATE**: better global structure than UMAP for trajectory data.
- **densMAP**: variant of UMAP that preserves density information.
- **TriMap**: better global structure preservation.
- **Embedding from a pretrained model** (Geneformer, scGPT): use the foundation model's representations directly; visualize via UMAP only for inspection.

For most projects: UMAP is fine for visualization. Be aware of its limitations; use the high-dim data for serious analysis.
