---
title: Inverse Kinematics
category: robotics
---
<!-- tier:intro -->
# Inverse Kinematics (IK)

Given a desired end-effector pose `T_target`, find joint angles `q` such that `FK(q) = T_target`.

**Why it's harder than FK**:
- **Multiple solutions**: a 7-DOF arm typically has infinitely many `q` for a given pose.
- **Singularities**: at certain `q`, the Jacobian rank drops; velocities blow up.
- **No closed-form for most arms**: 6-DOF arms with specific geometry have closed-form. 7-DOF needs iteration.
- **Joint limits**: not every `q` is feasible.

**Methods**:
- Closed-form (when geometry permits).
- Newton-Raphson on kinematic equations.
- Damped least squares (handles singularities).
- Optimization-based (TRAC-IK, KDL).

IK is solved at every control step in production. Computation budget: microseconds.

<!-- tier:undergrad -->
# Inverse Kinematics (Undergrad)

## Closed-form IK

For arms with specific geometry (Pieper arms — 3 axes intersect at one point), closed-form solutions exist.

**Pieper arm 6-DOF**:
1. First 3 joints determine wrist position.
2. Wrist orientation is determined by last 3 joints.
3. Solve in two stages.

Examples: original PUMA arm, KUKA KR series.

**Why closed-form is preferred (when available)**:
- Microsecond runtime.
- Returns ALL solutions; pick one based on secondary criteria.
- Numerically robust.

## Iterative IK

For arms without closed-form (most modern 7-DOF arms):

**Newton-Raphson on the kinematic equations**:
- Linearize: `δT ≈ J(q) δq`.
- Solve `δq = J⁻¹ δT`.
- Update `q ← q + δq`.
- Repeat until `||T(q) - T_target|| < tol`.

**Issues**:
- `J` may be singular or near-singular → `J⁻¹` blows up.
- Convergence depends on initial guess.
- Joint limits violated; need projection or constrained methods.

## Damped least squares (DLS)

Standard remedy for singularities:

`δq = (JᵀJ + λ²I)⁻¹ Jᵀ δT`

The damping `λ` regularizes the inverse. At a singularity, the term blows up but is finite.

**Tuning**: smaller `λ` near non-singular configurations; larger `λ` near singularities. Adaptive variants compute `λ` based on the smallest singular value of `J`.

DLS is standard in real-time IK loops.

## Redundancy resolution

7-DOF arms have 1 redundant DOF. Use the redundancy for secondary objectives:

`δq = J⁺ δT + (I - J⁺J) z`

where `J⁺` is the pseudoinverse and `z` is a secondary objective gradient (e.g., maximize manipulability, avoid joint limits, minimize energy).

The first term tracks the end-effector target. The second term moves in the null space (doesn't affect end-effector) toward the secondary goal.

**Common secondary objectives**:
- **Joint-limit avoidance**: stay away from joint limits.
- **Manipulability maximization**: stay away from singularities.
- **Energy minimization**: minimize joint torques.
- **Obstacle avoidance**: keep elbow away from obstacles.

## Optimization-based IK

Formulate as nonlinear constrained optimization:

minimize `||FK(q) - T_target||²` (+ secondary cost)
subject to joint limits, collision constraints, etc.

**TRAC-IK**: combines DLS-style iteration with pseudoinverse SQP. Often more robust than pure DLS.

**Bio_IK**: genetic-algorithm-based; handles hard constraints + multiple objectives.

**KDL (Kinematics and Dynamics Library)**: reference implementation; somewhat dated but still in use.

## Production tooling

Most production stacks use a combination:
- Closed-form for arms that have it.
- TRAC-IK or DLS for general arms.
- Custom IK for niche robots (humanoids, parallel mechanisms).

**ROS MoveIt**: provides multiple IK solvers; configurable per robot.

**pinocchio + casadi**: for IK as part of larger optimization pipelines.

<!-- tier:grad -->
# Inverse Kinematics (Grad)

## Quasi-Newton + line-search

Pure Newton-Raphson can overshoot. **Line search**: compute step direction; scale step size to ensure improvement.

**BFGS**: approximates the Hessian using gradient information. Converges in superlinear time on smooth problems.

**Levenberg-Marquardt**: hybrid Newton + gradient descent. The standard for nonlinear least squares (which IK is).

## Constraint handling

Joint limits as inequality constraints:

**Projection**: after each step, clip `q` to limits. Simple but can stall.

**Active-set methods**: identify which constraints are active; solve constrained QP.

**Augmented Lagrangian + barrier methods**: more sophisticated; handles many constraints.

For collision-free IK, constraints become complex. Specialized methods (CHOMP-IK, TrajOpt) handle this.

## Differentiable IK

Modern: end-to-end-trainable IK as a differentiable layer.

- Inputs: target pose; current `q`.
- Outputs: solution `q`.
- Differentiable: gradient of `q` w.r.t. target pose computable.

Used in:
- End-to-end-trained policies that include IK.
- Imitation learning where the policy learns to map poses to joints.
- Trajectory optimization with differentiable kinematic constraints.

## Multi-target IK

Track multiple targets simultaneously (multi-arm manipulation, hand orientation + position, gaze + reach):

minimize `Σᵢ wᵢ ||FK_i(q) - T_i||²`

Weights `w_i` define priority. High-priority constraints can be enforced as hard constraints; lower priorities as soft.

**Hierarchical IK** (Kanoun et al. 2010): solves with strict priority ordering — higher-priority tasks dominate.

## Whole-body IK for humanoids

For humanoids (20+ DOF), IK extends to:

- **Center-of-mass control**: keep CoM over the support polygon for balance.
- **Multiple end-effectors**: feet, hands, gaze.
- **Self-collision avoidance**: arms not hitting body.
- **Posture preferences**: stay near neutral pose for energy.

This is whole-body inverse kinematics. Implementation in OpenSoT, TSID, MoveIt + extensions.

## Connection to motion planning

For long-horizon tasks, IK is solved at every waypoint of a planned trajectory. Cumulative IK errors require:

- **IK consistency**: smooth IK solutions across waypoints (no large jumps).
- **Configuration-space planning**: plan directly in `q`; no IK needed (but more dimensions).

Modern manipulation often plans in workspace + uses fast IK at each step. The trade-off vs C-space planning depends on specific problem.

## Connection to ML policies

End-to-end vision-to-action policies (RT-2, OpenVLA, π-0) implicitly do IK: predict end-effector pose deltas; map to joint deltas via internal IK or explicit IK layer.

Some policies output joint commands directly (skipping IK). Others output end-effector commands (relying on a downstream IK solver).

The trade-off:
- **Joint commands**: simpler model; needs accurate FK + motor calibration.
- **End-effector commands**: model-agnostic; needs accurate IK at runtime.

## References

- Buss 2009. *Introduction to Inverse Kinematics with Jacobian Transpose, Pseudoinverse and Damped Least Squares Methods*. (Tutorial.)
- Beeson & Ames 2015. TRAC-IK: An open-source library for improved solving of generic inverse kinematics. *Humanoids*.
- Kanoun, Lamiraux, Wieber 2010. Kinematic control of redundant manipulators. *IEEE T. Robot.*
- Murray, Li, Sastry. *A Mathematical Introduction to Robotic Manipulation* (1994).
