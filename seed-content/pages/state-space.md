---
title: State-Space Representation
category: robotics
---
<!-- tier:intro -->
# State-Space Representation

The modern formalism for control. A system represented as a vector ODE:

`ẋ(t) = f(x(t), u(t))`, `y(t) = h(x(t), u(t))`

where `x` is the state vector, `u` is the input, `y` is the output.

For linear time-invariant systems:

`ẋ = Ax + Bu`, `y = Cx + Du`

The matrices `(A, B, C, D)` fully specify a linear system.

State-space generalizes classical (transfer-function) control to MIMO, time-varying, optimal-control, and nonlinear formulations.

<!-- tier:undergrad -->
# State-Space Representation (Undergrad)

## Choosing state variables

The state must contain enough information to predict future behavior given inputs.

- **Pendulum**: angle + angular velocity (2 states).
- **Quadrotor**: position (3) + velocity (3) + orientation (3) + angular velocity (3) = 12 states.
- **Robot arm with N joints**: 2N states (position + velocity per joint).

The choice isn't unique; equivalent state representations exist via similarity transforms.

**Minimal state**: smallest dimension capturing all relevant dynamics. Don't include redundant variables.

**Physical meaning**: states usually correspond to physical quantities (position, velocity, charge, temperature). Sometimes abstract (modal coordinates).

## Continuous + discrete time

**Continuous-time**: `ẋ = Ax + Bu`. The system evolves in continuous time. Used in classical control, robotics, aerospace.

**Discrete-time**: `x_{k+1} = A_d x_k + B_d u_k`. The system evolves at discrete time steps. Used in digital controllers, ML-trained policies.

**Discretization**: convert continuous to discrete. Methods:
- Forward Euler: `A_d = I + A·T`.
- Backward Euler: `A_d = (I - A·T)^{-1}`.
- Zero-order hold: `A_d = e^{AT}`. Most accurate.

## Controllability + observability

**Controllability**: can the input `u` steer the state to any desired value? Equivalent to: rank of the controllability matrix `[B, AB, A²B, ..., A^{n-1}B]` = `n`.

**Observability**: can the state be reconstructed from output measurements? Rank of the observability matrix `[C; CA; CA²; ...; CA^{n-1}]` = `n`.

**Why they matter**:
- Controllable + observable systems can be stabilized via state-feedback + observer.
- Uncontrollable modes can't be steered; they must already be stable.
- Unobservable modes can't be estimated; they must not affect performance.

## Linearization

Most real systems are nonlinear. Linearize around an operating point `(x₀, u₀)`:

`A = ∂f/∂x|_{(x₀, u₀)}`, `B = ∂f/∂u|_{(x₀, u₀)}`

The linearized model is valid for small deviations `δx, δu`. Nonlinear effects appear at large deviations.

**Practical**: design a linear controller for the linearization; verify in simulation that it works for the nonlinear system.

For widely-varying operating points: gain scheduling. Linearize at multiple points; switch controllers.

## State-space vs transfer function

Equivalent representations for linear systems. Each has uses:

**State-space wins for**:
- MIMO systems.
- Time-varying systems.
- Optimal control formulations (LQR, MPC).
- Numerical computation.

**Transfer function wins for**:
- Classical analysis (Bode, Nyquist).
- SISO frequency-domain design.
- Communication of properties (DC gain, bandwidth).

Modern engineers use both. State-space is the design framework; transfer functions are the analysis lens.

<!-- tier:grad -->
# State-Space Representation (Grad)

## Canonical forms

Many state-space representations of the same system exist. Canonical forms simplify analysis:

- **Controllable canonical form**: companion-matrix structure on `A`. Useful for pole placement.
- **Observable canonical form**: dual to controllable. Useful for observer design.
- **Modal form**: `A` diagonal (or block-diagonal). Each state corresponds to a mode of the system.
- **Balanced realization** (Moore 1981): controllability + observability Gramians equal + diagonal. Used for model reduction.

## Lyapunov equations

For linear systems, stability is checked via Lyapunov equations:

`AᵀP + PA = -Q`

For any positive-definite `Q`, if `A` is stable then a unique positive-definite `P` solves this. The function `V(x) = xᵀPx` is a Lyapunov function.

**Discrete-time analog**: `AᵀPA - P = -Q`.

Implementations: `scipy.linalg.solve_lyapunov`, `solve_discrete_lyapunov`.

## Riccati equations + LQR

LQR's optimal feedback gain comes from solving the **Algebraic Riccati Equation**:

`AᵀP + PA - PBR⁻¹BᵀP + Q = 0`

Then `K = R⁻¹BᵀP`, and `u = -Kx` is optimal.

**Solvers**: `scipy.linalg.solve_continuous_are`. Numerically stable for well-conditioned problems.

**Connections**: optimal control, dynamic programming, value iteration, Hamilton-Jacobi-Bellman PDE — all the same family.

## State-space MPC

MPC predicts future states using the model:

`x_{k+1|k} = A x_{k|k} + B u_k, x_{k+2|k} = A² x_{k|k} + AB u_k + B u_{k+1}, ...`

Optimization variables: `(u_0, u_1, ..., u_{N-1})`. Cost: `Σ x^TQx + u^TRu + x_N^T P x_N` (terminal cost).

Constraints: `u_min ≤ u ≤ u_max`, `x_min ≤ x ≤ x_max`.

Solve via QP at each time step. Apply `u_0`. Re-plan.

**Tools**: OSQP, CVXPY, do-mpc. Real-time MPC at kHz rates is achievable for moderate-size problems.

## Nonlinear state-space

For `ẋ = f(x, u)`:

- **Feedback linearization**: change of coordinates that makes the system linear in new coordinates.
- **Backstepping**: recursive Lyapunov-based design.
- **Sliding-mode control**: drive the system onto a sliding manifold; stay there robustly.
- **MPC with nonlinear models (NMPC)**: solve nonlinear optimization at each step. Slower but handles nonlinearity directly.

## State-space + RL

In RL, the MDP framework is essentially state-space:
- `x` = state.
- `u` = action.
- `f(x, u)` = transition dynamics (often unknown to the agent).
- Reward replaces tracking error.

Modern model-based RL learns `f̂(x, u)` from data + uses MPC or planning. Bridges classical control + RL.

## References

- Antsaklis & Michel. *Linear Systems* (2nd ed, 2007).
- Kailath. *Linear Systems* (1980). Canonical reference.
- Bertsekas. *Dynamic Programming and Optimal Control* (4th ed, 2017).
- Boyd, El Ghaoui, Feron, Balakrishnan. *Linear Matrix Inequalities in System and Control Theory* (1994).
