---
title: Minimum Spanning Tree
category: algorithms
---
<!-- tier:intro -->
# Minimum Spanning Tree

A **spanning tree** of a graph is a tree containing all vertices. The **minimum spanning tree** (MST) is the spanning tree of minimum total edge weight.

Two classical algorithms:
- **Kruskal's** (1956): sort all edges; add the cheapest non-cycle-creating edge. Uses Union-Find. $O(E \log E)$.
- **Prim's** (1957): grow the tree from a single vertex; repeatedly add the cheapest edge crossing the current tree. Uses a priority queue. $O((V+E) \log V)$.

Both are greedy algorithms whose correctness is guaranteed by the **cut property** (lightest edge across any cut is in the MST) and the **cycle property** (heaviest edge in any cycle is not in any MST).

<!-- tier:undergrad -->
# Minimum Spanning Tree (Undergrad)

## Applications

- **Network design**: minimum-cost connection of all sites.
- **Cluster analysis**: hierarchical clustering single-link variant.
- **Image segmentation**: tree-based segmentation algorithms.
- **Approximation algorithms**: MST is a 2-approximation for metric TSP.

## Why greedy works

The **matroid property**: graphs form a matroid where independent sets are forests. For matroids, greedy algorithms are provably optimal. MST is the canonical matroid-greedy result.

The cut property: take any partition of vertices into two non-empty sets. The cheapest edge crossing the partition is in some MST. (Proof: if not in the MST, swap it with whichever crossing edge is in the MST; you've improved or matched the total weight.)

## Implementation choices

- **Kruskal's**: simpler. Sort + Union-Find. Works well for sparse graphs.
- **Prim's**: better for dense graphs (when $E$ approaches $V^2$, Prim's $O((V+E) \log V)$ beats Kruskal's $O(E \log E)$).
- **Borůvka's** (1926): pre-Kruskal/Prim. Repeatedly add the cheapest edge from each connected component. Parallelizable; useful in distributed settings.

## Distributed MST

In peer-to-peer + sensor network settings, computing MST without a central coordinator: GHS algorithm (Gallager-Humblet-Spira 1983). $O(V \log V)$ messages, near-optimal for distributed MST.
