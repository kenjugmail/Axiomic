---
title: Graph Traversal
category: algorithms
---
<!-- tier:intro -->
# Graph Traversal

The two foundational graph traversal algorithms:

- **Breadth-first search (BFS)**: explore nodes by distance from source. Uses a queue. Finds shortest paths in unweighted graphs.
- **Depth-first search (DFS)**: explore as far as possible before backtracking. Uses a stack (or recursion). Finds connected components, topological sorts, articulation points.

Both run in $O(V + E)$ time where $V$ is vertices, $E$ is edges. Both visit each node + edge exactly once.

<!-- tier:undergrad -->
# Graph Traversal (Undergrad)

## BFS

```
bfs(graph, source):
  queue = [source]
  visited = {source}
  while queue:
    node = queue.popleft()
    for neighbor in graph[node]:
      if neighbor not in visited:
        visited.add(neighbor)
        queue.append(neighbor)
```

Uses: shortest path in unweighted graphs (each layer is one edge further), checking bipartiteness, finding connected components.

## DFS

```
dfs(graph, source):
  stack = [source]
  visited = {source}
  while stack:
    node = stack.pop()
    for neighbor in graph[node]:
      if neighbor not in visited:
        visited.add(neighbor)
        stack.append(neighbor)
```

Or recursively, which is the more common form. Uses: topological sort (DFS post-order), strongly connected components (Tarjan + Kosaraju), cycle detection, articulation point detection.

## When to use which

- **Shortest path in unweighted graph**: BFS.
- **Topological sort, SCC, cycle detection**: DFS.
- **Memory-constrained**: DFS uses depth-proportional stack; BFS uses width-proportional queue. For deep narrow graphs, BFS is better; for wide shallow graphs, DFS.
- **Maze solving**: BFS finds the shortest path; DFS just finds *any* path.

## Variants

- **Iterative deepening DFS**: combines DFS's space efficiency with BFS's optimal-depth-first guarantee. Used in chess search.
- **Bidirectional BFS**: search from both source + target simultaneously; meet in the middle. $O(b^{d/2})$ instead of $O(b^d)$.
- **Best-first / A***: see [[shortest-path]] for weighted-graph variants.
