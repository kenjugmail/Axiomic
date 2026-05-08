---
title: Forward Kinematics
category: robotics
---
<!-- tier:intro -->
# Forward Kinematics

Given joint angles `q = [q_1, q_2, ..., q_n]`, compute the end-effector pose `T(q)`.

Use a **kinematic chain**: each joint contributes a transformation; chain them via matrix multiplication.

`T(q) = T_1(q_1) · T_2(q_2) · ... · T_n(q_n)`

Each `T_i` is a 4×4 homogeneous transformation matrix encoding rotation + translation.

**FK is fast + unique**: given `q`, the end-effector pose is uniquely determined. The forward direction has no ambiguity.

The inverse direction (IK) is much harder — covered separately.

<!-- tier:undergrad -->
# Forward Kinematics (Undergrad)

## Homogeneous transformations

A 4×4 matrix combining rotation + translation:

`T = [R t; 0 1]`

where `R` is a 3×3 rotation matrix and `t` is a 3×1 translation.

Properties:
- Composition: `T_1 T_2` chains transformations.
- Inverse: `T⁻¹ = [Rᵀ -Rᵀt; 0 1]`.
- Apply to a 3D point: extend to homogeneous `[x; 1]`; multiply by `T`; first 3 components are transformed point.

## Joint types

**Revolute (R)**: rotates by `q` around an axis.
`T_R(q) = Rotation around axis × Translation along link offset`.

**Prismatic (P)**: translates by `q` along an axis.
`T_P(q) = Translation along axis × Constant transformation`.

Most robot arms have only revolute joints. Linear stages, gantries use prismatic.

## Denavit-Hartenberg parameters

A standardized way to assign coordinate frames + parameterize each link.

Four parameters per joint:
- `θ`: joint angle (revolute) or fixed (prismatic).
- `d`: link offset (prismatic) or fixed (revolute).
- `a`: link length.
- `α`: link twist (rotation around link axis).

`T_i = Rot(z, θ_i) · Trans(z, d_i) · Trans(x, a_i) · Rot(x, α_i)`

Every kinematics textbook has the conventions. Modern alternatives (URDF, MJCF) replace DH with explicit transformations + fewer convention pitfalls.

## URDF — production standard

**Unified Robot Description Format**: XML-based robot description.

Each `<link>`:
- Inertial properties (mass, inertia tensor).
- Visual + collision geometry (mesh files).

Each `<joint>`:
- Type (revolute, prismatic, fixed, continuous).
- Parent + child links.
- Origin (fixed transformation in parent frame).
- Axis of motion.
- Limits (position, velocity, effort).

URDF is the lingua franca of ROS robotics. `xacro` macros enable parametric URDFs.

**Loading**: `pinocchio.buildModelFromUrdf` (Python), `urdf_parser` (C++), `urdfpy`. Computes FK in microseconds.

## Pose representations

End-effector pose is a 6D rigid-body transformation. Multiple representations:

- **Homogeneous matrix (4×4)**: 16 entries (12 free); standard for chained transformations.
- **Position + quaternion**: 7 entries (3 + 4); compact + numerically stable.
- **Position + Euler angles**: 6 entries; intuitive; suffers from gimbal lock.
- **Rotation vector + position**: 6 entries; minimal but discontinuous.
- **Lie algebra (se(3))**: 6 entries; differentiable; used in optimization.

For control + planning, position + quaternion is most common. Lie-algebra representations are standard in modern SLAM + manipulation optimization.

<!-- tier:grad -->
# Forward Kinematics (Grad)

## Lie group framework

The space of rigid-body transformations `SE(3)` is a Lie group. Its Lie algebra `se(3)` has dimension 6 (3 translation + 3 rotation).

**Exponential map**: `T = exp(ξ̂)` where `ξ ∈ se(3)`.

**Logarithm**: `ξ = log(T)`.

These let you:
- Linearize around `T`: `T(t) ≈ T_0 · exp(t·ξ̂)`.
- Optimize on `SE(3)`: gradient descent in `se(3)` then exp-map back.
- Interpolate poses smoothly: `T(s) = T_0 · exp(s·log(T_0⁻¹·T_1))`.

Modern SLAM + control libraries (GTSAM, Sophus, Manif) use this framework.

## Spatial Jacobians

For an `n`-DOF arm, the Jacobian `J(q)` maps joint velocities to end-effector twists:

`v = J(q) q̇`

where `v ∈ R⁶` is the spatial velocity.

`J ∈ R^{6×n}`. Each column is the contribution of one joint to end-effector motion.

**Computation**: chain rule on the kinematic chain. Closed-form for any tree-structured robot.

Key role: IK (inverse Jacobian), control (Jacobian-based control laws), singularity analysis.

## Singular configurations

A configuration `q*` is **singular** if `J(q*)` has reduced rank. At singularities:
- The robot loses a degree of freedom in some direction.
- Joint velocities to achieve a desired end-effector velocity blow up.
- IK becomes ill-conditioned.

**Common singularities**:
- Wrist singularities: 3 wrist axes intersect.
- Elbow singularities: arm fully extended.
- Shoulder singularities: arm folded.

**Avoidance**: damped least-squares IK; manipulability metrics; trajectory planning that stays away from known singularities.

## Multi-body kinematics

Beyond single chains:

- **Tree-structured robots**: humanoids, multi-arm. Chain-rule generalizes.
- **Closed-chain mechanisms**: parallel manipulators (Stewart platforms, delta robots). Closed-form FK can be hard; IK is easier.
- **Hybrid (serial + parallel)**: combine both.

Modern simulators (MuJoCo, Drake, Pinocchio, RBDL) handle all of these efficiently.

## Numerical considerations

**Quaternion drift**: numerical errors push quaternions off the unit sphere. Renormalize periodically.

**Rotation matrix orthogonality**: similar drift. Use SVD or Gram-Schmidt to reorthogonalize.

**Numerical FK**: usually accurate. But for very long chains (humanoids), errors compound. High-precision arithmetic occasionally needed.

## Inertial properties

URDF includes mass + inertia per link. Used for:

- **Inverse dynamics**: compute joint torques given desired motion.
- **Forward dynamics**: simulate motion given torques.
- **Optimal control**: minimize energy; LQR with mechanical models.

The Recursive Newton-Euler algorithm is the standard for fast inverse dynamics. `O(n)` for an `n`-DOF chain.

## Connection to ML

Foundation-model robotics (RT-2, OpenVLA) takes vision + language + outputs end-effector commands. The vision-to-pose pipeline implicitly does FK in reverse.

Differentiable kinematics (`pinocchio.casadi`, JAX-based libraries): compute FK + gradients automatically. Useful for:

- Trajectory optimization.
- Inverse-dynamics learning.
- End-to-end policy training with kinematic constraints.

## References

- Murray, Li, Sastry. *A Mathematical Introduction to Robotic Manipulation* (1994). The reference.
- Lynch & Park. *Modern Robotics: Mechanics, Planning, and Control* (2017). Modern textbook (free online).
- Featherstone. *Rigid Body Dynamics Algorithms* (2008).
- Pinocchio docs. (Modern C++/Python kinematics + dynamics library.)
