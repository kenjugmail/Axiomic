---
title: Motion Planning
category: robotics
---
<!-- tier:intro -->
# Motion Planning

Given a start state, a goal state, and constraints (obstacles, dynamics, joint limits), compute a trajectory from start to goal.

**Two flavors**:
- **Configuration space (C-space) planning**: plan in the joint-space of the robot. Standard for manipulation.
- **Workspace / SE(3) planning**: plan in the world frame. Standard for navigation.

**Three method families**:
1. **Search-based**: A*, D*, Dijkstra. Optimal in finite discretizations.
2. **Sampling-based**: RRT, RRT*, PRM. Scale to high dimensions.
3. **Trajectory optimization**: iLQR, CHOMP, TrajOpt. Smooth + dynamically feasible.

Production stacks combine multiple: sampling-based for global path → trajectory optimization for smoothing.

<!-- tier:undergrad -->
# Motion Planning (Undergrad)

## Configuration space

Each degree of freedom of the robot is a dimension. A 7-DOF arm lives in 7-D configuration space.

**Obstacles in C-space**: each workspace obstacle becomes a forbidden region in C-space. Computing the C-space obstacle directly is complex; collision-checking-based planners avoid it.

**Why C-space**: collision is a geometric property of joint configurations. Planning in C-space directly addresses what matters: which configurations are feasible.

## A* search

Discretize space into a grid. Each cell is a node. Edges connect adjacent cells.

A* searches for shortest path from start to goal.

`f(n) = g(n) + h(n)`
- `g`: cost from start.
- `h`: heuristic estimate of cost from `n` to goal.

Expand nodes in order of `f`. Optimal if `h` is admissible.

**Use case**: 2D / 3D navigation. `h` = Euclidean distance.

**Limit**: grid-based discretization is exponential in dimension. 7-DOF arm: even 10 cells per dim = 10^7. Intractable.

## RRT — Rapidly-exploring Random Tree

Sampling-based. Builds a tree from start toward random samples in C-space.

**Algorithm**:
1. Initialize tree with start node.
2. Sample random `q_rand` (with bias toward goal, ~5%).
3. Find nearest tree node `q_near`.
4. Extend toward `q_rand` by step `q_new`. If valid (no collision), add to tree.
5. If `q_new` near goal, connect; return path.
6. Repeat.

**Strengths**:
- Scales to high dimensions (7, 12, 24-DOF).
- Probabilistically complete: as samples → ∞, finds path if one exists.
- Simple to implement.

**Limits**:
- Not optimal — paths are often jagged, suboptimal.
- Performance depends on sampling distribution.

## RRT* — asymptotically optimal

Variant of RRT. After adding a new node, REWIRE nearby tree nodes if going through the new node gives a shorter path.

As samples → ∞, RRT* converges to the optimal path. Not just feasible — optimal.

**Cost**: more computation per sample. Real-time use limited; offline planning + RRT* is common.

## PRM — Probabilistic Roadmap

Pre-compute a roadmap of valid configurations (the "training" phase); query for paths between start + goal (the "query" phase).

**Strengths**: handles many queries efficiently after roadmap construction.
**Limits**: roadmap construction is expensive; doesn't adapt to dynamic obstacles.

## Trajectory optimization

Search-based + sampling-based produce paths. Production robots need **trajectories** (time-parameterized + dynamically feasible).

Formulate as constrained optimization:
- Minimize: cost (smoothness, energy, time).
- Subject to: dynamics, obstacle avoidance, joint limits, start + goal.

**Methods**:
- **CHOMP**: gradient descent on smoothness + obstacle cost.
- **STOMP**: stochastic; less prone to local minima.
- **TrajOpt** (Sequential Convex Optimization): handles constraints natively.
- **iLQR**: when system is differentiable; locally optimal.

**Hybrid stack**: sampling-based produces a coarse path → trajectory optimizer smooths + makes dynamically feasible. Production standard.

## Real-time planning

Robots in dynamic environments need to re-plan as the world changes:

- **Continuous replanning**: re-solve at high frequency (10+ Hz). MPC-style.
- **Trigger-based**: re-plan only on world changes.
- **Anytime planners** (ARA*, AnyTime RRT*): improve incrementally; can be interrupted.

<!-- tier:grad -->
# Motion Planning (Grad)

## Sampling-based theory

**Probabilistic completeness**: as samples → ∞, finds a feasible path with probability 1 if one exists.

**Asymptotic optimality**: as samples → ∞, converges to optimal cost.

Karaman-Frazzoli 2011: RRT* + PRM* are asymptotically optimal; basic RRT + PRM are not.

**Visibility theorem** (Hsu-Latombe-Motwani 1997): the runtime depends on the **visibility** of the C-space — how easily samples can connect to the rest of the free space. Narrow corridors (low visibility) make planning slow.

## Kinodynamic planning

Planning that respects dynamics, not just kinematics:

- **Differential constraints**: the robot can't move sideways (cars), or accelerate instantly.
- **Trajectory optimization**: handles these natively.
- **Kinodynamic RRT**: extend RRT with dynamic propagation; sample valid `(state, action)` pairs.

For differential-drive vehicles, cars, drones — kinodynamic is essential.

## Trajectory optimization details

**Direct collocation**: discretize trajectory into knot points; impose dynamics as constraints between consecutive points. Solve with NLP solver (IPOPT, SNOPT).

**Direct shooting**: parameterize trajectory by initial state + actions; integrate; constrain final state.

**Differential dynamic programming (DDP) / iLQR**: dynamic programming with linearization. Recursive backward Riccati + forward simulation. Locally optimal trajectories quickly.

**Tools**:
- IPOPT, SNOPT: general-purpose NLP solvers.
- Drake: trajectory optimization for robots; uses MathOpt + various NLP backends.
- Casadi: symbolic optimization framework.
- MuJoCo MPC, Crocoddyl: physics-based optimization for robots.

## Sampling-based vs optimization-based

**Sampling-based**:
- Pros: scales to high dimensions; finds paths through complex obstacle fields.
- Cons: jagged paths; no constraints handling natively; not always optimal.

**Optimization-based**:
- Pros: smooth + dynamically feasible paths; handles constraints natively.
- Cons: local minima (without good initialization); doesn't always find paths through complex obstacles.

**Hybrid stacks**:
- Sampling-based gets a feasible (rough) path.
- Optimization-based polishes it.

This is the production approach for autonomous vehicles, manipulators, drones.

## Modern frontiers

**Learning to plan**:
- Behavior cloning of expert demonstrations.
- Self-supervised cost learning.
- Diffusion-based planners (sample plan distributions).

**Neural motion planners**: end-to-end neural networks that take (start, goal, obstacles) → trajectory. Active research; mostly research-quality.

**Cross-embodiment planning**: a planner trained on one robot working on a different one. Open challenge.

**Multi-agent planning**: many robots / agents simultaneously. Hard combinatorial problem; centralized + decentralized variants.

## Tooling overview

- **OMPL** (Open Motion Planning Library): C++/Python; standard sampling-based planners.
- **MoveIt!** (ROS): manipulation-focused; integrates OMPL with collision checking + trajectory smoothing.
- **Drake**: more modern; trajectory optimization + sampling-based + dynamics simulation.
- **Crocoddyl**: trajectory optimization library for legged robots.

Most production stacks built on these (often with custom integration).

## References

- LaValle. *Planning Algorithms* (2006). The textbook (free online).
- Karaman & Frazzoli 2011. Sampling-based algorithms for optimal motion planning. *IJRR*.
- Kavraki et al. 1996. Probabilistic roadmaps. *IEEE T. Robot. Auto.*
- Tassa, Erez, Todorov 2012. Synthesis and stabilization of complex behaviors. (iLQR.)
- Schulman et al. 2014. Motion planning with sequential convex optimization. *IJRR*. (TrajOpt.)
