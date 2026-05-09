---
title: LQR (Linear Quadratic Regulator)
category: robotics
---
<!-- tier:intro -->
# LQR — Linear Quadratic Regulator

The optimal feedback controller for linear systems with quadratic cost.

Given:
- Linear dynamics: `ẋ = Ax + Bu`.
- Quadratic cost: `J = ∫₀^∞ (xᵀQx + uᵀRu) dt`.

The LQR is `u = -Kx` minimizing `J`, where `K = R⁻¹BᵀP` and `P` solves the Algebraic Riccati Equation:

`AᵀP + PA - PBR⁻¹BᵀP + Q = 0`

LQR is the workhorse of aerospace, automotive, and robotics state-space control. Cheap to compute offline; just a matrix multiply at runtime.

<!-- tier:undergrad -->
# LQR (Undergrad)

## What Q and R do

**Q** penalizes state deviations from zero. Larger Q → controller drives state to zero faster (more aggressive).

**R** penalizes control effort. Larger R → controller uses less actuation (gentler, cheaper).

**Q/R ratio** is the main tuning knob.

**Practical**: start with `Q = I` and `R = ρI` for varying ρ. Tune ρ until response is acceptable.

**Bryson's rule**: choose diagonal entries `Q_ii = 1/x_max,i²` and `R_ii = 1/u_max,i²` where `x_max, u_max` are acceptable ranges. Normalizes the cost.

## Why LQR is robust

LQR has built-in stability margins (Anderson-Moore, Kwakernaak):

- **Phase margin** ≥ 60°.
- **Gain margin** ≥ 6 dB (actually `[1/2, ∞)`).

These hold regardless of Q + R choice (under standard assumptions). LQR is harder to make unstable than ad-hoc PID tuning.

## Implementation

```python
from scipy.linalg import solve_continuous_are
import numpy as np

P = solve_continuous_are(A, B, Q, R)
K = np.linalg.inv(R) @ B.T @ P
# Control law: u = -K x
```

The Riccati equation is solved offline (once at design time). At runtime, just compute `u = -K @ x`. Microseconds.

## When LQR is right (and when it isn't)

**LQR is great for**:
- Stabilization around an equilibrium.
- MIMO systems where SISO PID is inadequate.
- Systems where quadratic cost reasonably captures objectives.
- Linear systems (or linearizations of nonlinear systems near operating points).

**LQR is bad for**:
- Hard constraints (`|u| ≤ u_max`). Use MPC.
- Strongly nonlinear systems. Use NMPC, iLQR, or sliding-mode control.
- Time-varying systems. Use LQR-tracking or MPC.
- Discrete-event / hybrid systems. Use specialized hybrid-control methods.

## Discrete-time LQR

For discrete-time systems `x_{k+1} = A_d x_k + B_d u_k`:

`A_dᵀ P A_d - P - A_dᵀ P B_d (R + B_dᵀ P B_d)⁻¹ B_dᵀ P A_d + Q = 0`

`K = (R + B_dᵀ P B_d)⁻¹ B_dᵀ P A_d`

Solver: `scipy.linalg.solve_discrete_are`. Used in any digitally-implemented LQR.

<!-- tier:grad -->
# LQR (Grad)

## Connection to Hamilton-Jacobi-Bellman

LQR is the closed-form solution of the HJB equation for linear-quadratic problems:

Value function: `V(x) = xᵀ P x`.
HJB: `0 = min_u [xᵀQx + uᵀRu + ∇V · (Ax + Bu)]`.

Substituting the quadratic ansatz + minimizing over `u`:
- `u* = -R⁻¹BᵀPx` (the LQR feedback).
- Substituting back yields the Riccati equation.

So LQR is dynamic programming applied to linear-quadratic problems. Generalizes to nonlinear via iLQR (iterative LQR + linearization at each iteration).

## Time-varying LQR

For `ẋ = A(t)x + B(t)u` with cost `J = ∫_0^T (xᵀQ(t)x + uᵀR(t)u) dt + xᵀ(T)F·x(T)`:

Riccati equation becomes a differential equation:
`-Ṗ = AᵀP + PA - PBR⁻¹BᵀP + Q`, `P(T) = F`

Solve backward in time. `K(t) = R⁻¹BᵀP(t)`.

Used in trajectory tracking: linearize the nonlinear system around a reference trajectory; design time-varying LQR to track it.

## LQG — adding the observer

When state isn't directly measured, combine LQR with Kalman filter:
- Kalman filter estimates state from measurements.
- LQR uses the estimated state for feedback.

Separation principle: optimal under linear-Gaussian assumptions. The two designs are decoupled.

LQG dominated aerospace + control for decades. Modern variants: LQG/LTR (loop transfer recovery), H₂/H∞.

## iLQR + nonlinear extensions

**iterative LQR (iLQR)**: for nonlinear `ẋ = f(x, u)`:

1. Linearize around current trajectory: `A_t = ∂f/∂x|_t`, `B_t = ∂f/∂u|_t`.
2. Compute time-varying LQR for the linearization.
3. Apply the resulting policy; get a new trajectory.
4. Re-linearize. Iterate.

Convergence: locally quadratic for smooth systems. The algorithm behind many modern trajectory-optimization tools (Drake, MuJoCo MPC).

**DDP (Differential Dynamic Programming)**: like iLQR but with second-order terms. More accurate but more expensive.

## Robust LQR

Standard LQR assumes the model is exact. Robustness comes for free in nominal LQR but degrades with uncertainty.

**Robust LQR** variants:
- **LQR with multiplicative uncertainty**: design accounting for `Ã = A + ΔA`.
- **H∞ optimal control**: minimize worst-case disturbance amplification.
- **Tube-based MPC + LQR**: nominal LQR + tube around the trajectory bounding uncertainty.

## LQR in modern robotics + RL

LQR shows up everywhere:

- **Inner-loop motor controllers**: LQR is the standard.
- **Drone attitude + position**: cascaded LQR.
- **iLQR for trajectory optimization**: planning module in autonomous-vehicle stacks.
- **Model-based RL**: PILCO, MBPO, others use LQR or iLQR for the planning step.
- **Linear quadratic baselines for RL**: LQR is the optimal solution to LQ problems; RL methods are evaluated against it.

The intersection of LQR + ML is increasingly fruitful: learned dynamics + LQR planning, neural-net-LQR hybrids, end-to-end-trained policies that include LQR-style structure.

## References

- Anderson & Moore. *Optimal Control: Linear Quadratic Methods* (1990).
- Kalman 1960. Contributions to the theory of optimal control.
- Bertsekas. *Dynamic Programming and Optimal Control* (4th ed, 2017).
- Tassa, Erez, Todorov 2012. Synthesis and stabilization of complex behaviors through online trajectory optimization. (iLQR for robotics.)
