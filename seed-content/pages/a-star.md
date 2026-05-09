---
title: A* Search
category: robotics
---
<!-- tier:intro -->
# A* Search

The classical search algorithm for shortest paths in graphs.

`f(n) = g(n) + h(n)`
- `g(n)`: actual cost from start to `n`.
- `h(n)`: heuristic estimate from `n` to goal.

A* expands nodes in order of `f(n)`. Optimal if `h` is **admissible** (never overestimates true cost).

For 2D / 3D navigation: discretize space into a grid; `h` = Euclidean distance. Standard.

For high-DOF planning: A* is intractable (curse of dimensionality). Use sampling-based methods (RRT) instead.

<!-- tier:undergrad -->
# A* Search (Undergrad)

## How it works

1. Initialize open set = {start}; closed set = {}.
2. Loop:
   - Pop node `n` with smallest `f(n)` from open.
   - If `n == goal`, return path.
   - Add `n` to closed.
   - For each neighbor `n'`:
     - Skip if in closed.
     - Compute tentative `g'`.
     - If `n'` not in open OR `g'` < its current `g`:
       - Update `g, parent, f` for `n'`.
       - Add `n'` to open.

3. If open empties: no path exists.

The priority queue keyed by `f(n)` is the heart. Implementations: binary heap, Fibonacci heap.

## Heuristics

**Admissible**: `h(n) ≤ true_cost(n, goal)` for all `n`. Guarantees optimality.

**Consistent (monotone)**: `h(n) ≤ cost(n, n') + h(n')`. Stronger; ensures A* never re-expands nodes.

**Common heuristics**:
- 2D grid + 4-connectivity: Manhattan distance.
- 2D grid + 8-connectivity: Chebyshev distance.
- 3D grid: Euclidean distance.
- Vehicles with kinematic constraints: hand-tuned heuristics or Dubins distance.

**No heuristic** (`h = 0`): A* reduces to Dijkstra's algorithm. Still optimal; slower.

## Where A* works

**Great**:
- 2D / 3D grid-based navigation.
- Game pathfinding (the classic application).
- Discrete planning with small state spaces.

**Bad**:
- High-dimensional configuration spaces (manipulator arms). Sampling-based methods scale better.
- Continuous spaces without natural discretization.
- Dynamic environments where the graph changes (use D* or LPA*).

## Variants

**Dijkstra's**: A* with `h = 0`. Searches uniformly outward.

**Greedy best-first**: pop by `h(n)` only; ignore `g`. Fast but suboptimal.

**Weighted A***: `f = g + ε·h` for `ε > 1`. Faster but suboptimal (`ε`-suboptimal).

**ARA*** (Anytime Repairing A*): start with high `ε`; gradually reduce; provides anytime solutions.

**D*** / **D* Lite**: incremental A* for changing environments. Used in legacy autonomous-vehicle planners.

**LPA*** (Lifelong Planning A*): incremental update when costs change.

## A* in 2D navigation

Classic use case. Robot moves on a grid; obstacles are blocked cells; goal is reaching a target cell.

**Typical performance**: 100x100 grid, A* finds a path in milliseconds.

**Heuristic**: Euclidean distance (8-connectivity) or Manhattan (4-connectivity).

**Production**: ROS `nav_core` / `nav2` use A* (with Dijkstra fallback) for global planning.

<!-- tier:grad -->
# A* Search (Grad)

## Optimality + completeness

**Optimal** if `h` is admissible.
**Complete**: if a solution exists + the search space is finite, A* finds it.
**Time complexity**: `O(b^d)` worst case, where `b` is branching factor + `d` is solution depth. Faster with good heuristics.

For grid search, `b ≤ 8`. With Euclidean heuristic, A* expands roughly the cells in the "ellipsoid of optimal-cost paths" between start + goal.

## Memory usage

A* maintains the open set. Memory `O(b^d)` worst case. For large state spaces:

**IDA*** (Iterative Deepening A*): explores depth-first with iteratively-increasing cost bound. `O(d)` memory.

**SMA*** (Simplified Memory-bounded A*): uses bounded memory; remembers most-promising nodes.

**Memory-bounded variants**: useful for very large state spaces (puzzle-solving, classical planning).

## Continuous A*

For continuous state spaces, A*-style methods:

**Hybrid A***: continuous extensions of grid A* for car-like vehicles. Used in Stanford's DARPA challenge winner.

**State-lattice planners**: pre-compute motion primitives (trajectory snippets); search the resulting graph with A*.

**Hierarchical A***: search at multiple resolutions; refine in promising regions.

## Anytime + real-time

**ARA*** (Likhachev, Gordon, Thrun 2003): start with weighted A* (suboptimal); gradually reduce weight. Provides anytime improvement.

**Real-time A* (RTA*)** (Korf 1990): bounded-time decision; for online robotic planning.

**Anytime D*** (Likhachev et al. 2005): handles changing environments + provides anytime solutions.

## Heuristic design

**Pattern databases**: precompute exact costs for subproblems; sum to get heuristic. Exact but expensive.

**Landmark heuristics** (Hart-Nilsson-Raphael 1968): use distances to landmarks for triangle-inequality heuristics.

**Learned heuristics**: train a neural net to predict distance-to-goal. Learning-augmented planning.

**Composite heuristics**: take maximum of multiple admissible heuristics. Still admissible; tighter.

## Limitations driving alternatives

**Curse of dimensionality**: `O(grid_size^d)` cells. For 7-DOF arm + 10 cells per dim, 10^7 cells. RRT scales much better.

**Continuous time / space**: A* needs discretization. Trajectory optimization handles continuous directly.

**Dynamic environments**: re-running A* is expensive. D* + variants help.

For robotics, A* is the workhorse for low-D problems (2D/3D navigation); sampling-based + optimization-based dominate for higher-D problems.

## Connection to RL + planning

A* + DP are closely related:
- Dijkstra = DP for shortest paths.
- A* = DP with admissible heuristic.
- Value iteration = generalization to MDPs.

In RL, the value function plays the role of the (negative) cost-to-go heuristic. A* with learned heuristic is an early form of model-based RL.

Recent: Reinforcement Learning + A* hybrids (LEAP, NeuralA*) where neural networks predict heuristics + actions.

## References

- Hart, Nilsson, Raphael 1968. A formal basis for the heuristic determination of minimum cost paths.
- LaValle. *Planning Algorithms* (2006), chapter 2. (Free online.)
- Likhachev, Gordon, Thrun 2003. ARA*. *NIPS*.
- Russell & Norvig. *Artificial Intelligence: A Modern Approach* (4th ed). (Standard introduction.)
