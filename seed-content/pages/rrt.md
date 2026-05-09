---
title: RRT (Rapidly-exploring Random Tree)
category: robotics
---
<!-- tier:intro -->
# RRT — Rapidly-exploring Random Tree

A sampling-based motion planner. Builds a tree from start toward random samples in configuration space.

**Core algorithm**:
1. Initialize tree with start node.
2. Sample random `q_rand` (with bias toward goal, ~5%).
3. Find nearest tree node `q_near`.
4. Extend toward `q_rand` by step `q_new`. If valid (no collision), add to tree.
5. If `q_new` near goal, connect; return path.
6. Repeat.

**Why it works**: random sampling biases the tree toward unexplored regions of C-space. Probabilistic completeness: as samples → ∞, finds a path if one exists.

LaValle 1998. Workhorse for high-DOF manipulation planning.

<!-- tier:undergrad -->
# RRT (Undergrad)

## Variants

**RRT-Connect** (Kuffner-LaValle 2000): grow trees from start AND goal; merge when they meet. Faster than basic RRT.

**RRT*** (Karaman-Frazzoli 2011): rewires nearby tree nodes. Asymptotically optimal — converges to shortest path as samples → ∞.

**Bidirectional RRT***: combines RRT-Connect's bidirectional growth with RRT*'s optimality.

**Kinodynamic RRT**: extends to systems with dynamic constraints. Each tree extension samples a valid action; propagates dynamics.

**Anytime RRT***: provides best-found path; improves with more compute. Useful for real-time settings where you can interrupt.

## Sampling strategies

**Uniform sampling**: simplest; works for many problems.

**Goal biasing**: sample the goal with probability ~5%. Speeds up convergence.

**Gaussian sampling near obstacles**: samples in narrow passages where uniform sampling rarely lands.

**Gaussian sampling around current path**: refines an existing path.

**Bridge sampling**: samples that connect two regions of free space.

For high-DOF problems, sampling strategy matters more than the planner variant.

## Step size

The extension step in step 4 affects performance:

- **Small step**: many steps; expensive but smooth.
- **Large step**: few steps; might fail (extension hits obstacle); jagged paths.
- **Adaptive step**: try large; fall back to smaller if collision.

`OMPL` lets you tune this; defaults are reasonable.

## Collision checking

The bottleneck of RRT. Each extension requires checking if the path between `q_near` and `q_new` is collision-free.

**Discrete checking**: sample points along the path; check each.
- Coarse: fast but can miss thin obstacles.
- Fine: slow but reliable.

**Continuous collision checking**: analytical sweep tests. More accurate but expensive.

**Tools**: FCL (Flexible Collision Library), MoveIt's CollisionEnv, Bullet's collision detection. All used in production.

Production RRT spends 70-90% of time on collision checking. Optimizing this dominates real-world performance.

## Where RRT works

**Best**:
- High-DOF manipulation (7+ DOF arms).
- Complex obstacle fields.
- Find SOMETHING feasible quickly.

**Less good**:
- Optimal paths (use RRT* or trajectory optimization).
- Real-time replanning in fast-changing environments (use lattice-based + faster methods).
- Very narrow passages (use specialized samplers).

## Path post-processing

RRT paths are jagged. Production stacks apply:

**Shortcut smoothing**: try to connect non-adjacent path nodes; if collision-free, replace.

**Interpolation**: insert intermediate points; smooth via splines.

**Trajectory optimization**: take RRT path as initial guess; optimize for smoothness + dynamic feasibility.

The combination is the production formula.

<!-- tier:grad -->
# RRT (Grad)

## Theoretical properties

**Probabilistic completeness** (LaValle-Kuffner 2001): as samples → ∞, RRT finds a feasible path with probability 1, IF one exists. Holds for general nonlinear systems.

**Voronoi bias**: the probability of selecting a tree node is proportional to its Voronoi cell. RRT preferentially extends toward unexplored regions.

**Convergence rate**: depends on the C-space's "expansiveness" (Hsu-Latombe-Motwani 1997). Narrow passages slow convergence exponentially.

## RRT* convergence rate

Karaman-Frazzoli 2011: RRT*'s path cost converges to the optimal as `O(log n / n)` (where n is samples).

Practical implication: for 100 samples, RRT* gives a path that's typically far from optimal; thousands of samples produce paths close to optimal. For real-time use, RRT* is often run for limited time + then trajectory-optimized.

## Connection to optimal control

**RRT* with cost-to-go heuristics** can be viewed as approximate dynamic programming: each tree node is a candidate state with an associated value estimate.

**SST (Stable Sparse-RRT)** (Li-Littlefield-Bekris 2016): tracks the best path to each "neighborhood"; sparser tree; better for high-DOF.

**Informed-RRT* / BIT*** (Gammell et al. 2014, 2015): use heuristics to focus sampling on the elliptical region of states that could improve the current path. Much faster than uninformed RRT*.

## Implementation tricks

**Nearest-neighbor search**: KD-trees + ball-trees for fast O(log n) queries. Critical for large trees.

**Lazy collision checking**: check collisions only when selecting paths; not for every tree node.

**Online replanning**: maintain the tree across time steps; prune invalid branches; extend new ones.

**Sampling in low-D representations**: sometimes plan in a reduced space; lift to full C-space for execution.

## Modern alternatives

**BIT*** (Batch Informed Trees): incremental search with batch sampling; faster convergence than RRT*.

**FMT*** (Fast Marching Trees): sample first, then connect via wavefront propagation. Asymptotically optimal.

**RRT-Connect with shortcut + bidirectional**: production-grade for manipulation.

**Learned planners**: behavior cloning, RL for sample selection, diffusion-based planners. Still research; production deployment limited.

## RRT in deep learning

**Neural Motion Planning**: networks that propose `q_rand` more efficiently than uniform sampling.

**Learned heuristics for RRT***: predict cost-to-go; bias sampling.

**End-to-end planning networks**: take (start, goal, environment) → trajectory directly. Foundation-model-style; mostly research today.

The classical RRT framework remains standard in production. ML augments specific components (sampling, heuristics) without replacing the framework.

## References

- LaValle 1998. *Rapidly-exploring random trees: A new tool for path planning*. (Original.)
- Karaman & Frazzoli 2011. Sampling-based algorithms for optimal motion planning. *IJRR*.
- Kuffner & LaValle 2000. RRT-Connect. *ICRA*.
- Gammell, Srinivasa, Barfoot 2014. Informed RRT*. *IROS*.
- LaValle. *Planning Algorithms* (2006), chapter 5. (Free online.)
