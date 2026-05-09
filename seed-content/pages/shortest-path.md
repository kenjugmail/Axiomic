---
title: Shortest Path
category: algorithms
---
<!-- tier:intro -->
# Shortest Path

In a weighted graph, find the lowest-cost path between vertices. The classical algorithms:

- **Dijkstra's** (1956): single-source, non-negative weights. $O((V+E) \log V)$ with binary heap.
- **Bellman-Ford** (1958): single-source, handles negative weights, detects negative cycles. $O(VE)$.
- **Floyd-Warshall** (1962): all-pairs. $O(V^3)$.
- **A***: heuristic-guided; finds shortest path between two specific vertices, faster than Dijkstra when a good heuristic is available.

Used everywhere from GPS routing to network packet routing to game AI pathfinding.

<!-- tier:undergrad -->
# Shortest Path (Undergrad)

## Dijkstra's

The greedy approach: maintain a priority queue of vertices keyed by best-known distance. Repeatedly extract the closest unvisited vertex, relax its edges.

```
dijkstra(graph, source):
  dist[source] = 0; dist[*] = infinity
  pq = [(0, source)]
  while pq:
    d, u = pq.heappop()
    if d > dist[u]: continue
    for v, w in graph[u]:
      if dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
        pq.heappush((dist[v], v))
```

Requires non-negative weights — the greedy "always extract closest" assumption breaks under negative edges.

## Bellman-Ford

For graphs with negative weights: relax every edge $V-1$ times. After $V-1$ iterations, distances stabilize. A $V$-th iteration that changes distances means a negative cycle exists.

Slower ($O(VE)$ vs $O((V+E) \log V)$) but handles negative weights. Used in distance-vector routing protocols (RIP).

## A*

Dijkstra with a heuristic estimate of remaining distance. Priority = $g(\text{node}) + h(\text{node})$ where $g$ = cost so far, $h$ = estimated cost to goal.

If $h$ is **admissible** (never overestimates true remaining cost), A* finds the optimal path. Better $h$ → fewer nodes explored.

For 2D grid pathfinding: Euclidean distance is a perfect heuristic. For complex graphs, $h$ is harder to design well. Used in game AI, route planning, motion planning.

## All-pairs

For dense graphs where you need shortest paths between all vertex pairs: Floyd-Warshall. $O(V^3)$ time, $O(V^2)$ space.

DP recurrence: shortest path from $i$ to $j$ using only intermediate vertices in $\{1, \ldots, k\}$ = min(shortest using only $\{1, \ldots, k-1\}$, shortest from $i$ to $k$ + shortest from $k$ to $j$).
