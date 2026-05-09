---
title: Bellman-Ford Algorithm
category: algorithms
---
<!-- tier:intro -->
# Bellman-Ford Algorithm

Single-source shortest path that handles **negative-weight edges** (Dijkstra cannot). $O(VE)$ time. Detects **negative cycles** (any cycle whose total weight is negative — in such graphs, "shortest path" is undefined since you can keep going around the cycle).

Used in **distance-vector routing protocols** (RIP, BGP path-vector variants) where edges represent network costs that may include penalties.

<!-- tier:undergrad -->
# Bellman-Ford Algorithm (Undergrad)

## The algorithm

```
bellman_ford(graph, source):
  dist[*] = infinity
  dist[source] = 0
  for i = 1 to V-1:
    for each edge (u, v, w):
      if dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
  # Negative cycle detection
  for each edge (u, v, w):
    if dist[u] + w < dist[v]:
      raise "Negative cycle detected"
  return dist
```

After $V-1$ iterations of relaxing every edge, distances are correct (because any shortest path has at most $V-1$ edges in a simple path). A $V$-th iteration that changes anything implies a negative cycle.

## Why $V-1$ iterations

Lemma: after $i$ iterations of relaxing every edge, `dist[v]` is the shortest distance using at most $i$ edges. After $V-1$ iterations, all simple paths are considered.

If a $V$-th iteration changes anything, there's a path with $\geq V$ edges that's still being shortened — implies a cycle that can be reduced indefinitely.

## DP framing

Bellman-Ford is dynamic programming: subproblem = shortest distance using at most $i$ edges. Recurrence: $\text{dist}_i[v] = \min(\text{dist}_{i-1}[v], \min_u (\text{dist}_{i-1}[u] + w(u,v)))$.

The $V-1$ outer iterations build up the DP table. Bellman invented this; the same Bellman as Bellman equation in RL ([[dynamic-programming]]).

## SPFA (Shortest Path Faster Algorithm)

A queue-based optimization: only relax edges from vertices whose distance changed in the last iteration. Same worst-case $O(VE)$ but often much faster in practice. Used in competitive programming + some routing protocols.
