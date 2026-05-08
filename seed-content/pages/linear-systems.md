---
title: Linear Systems
category: robotics
---
<!-- tier:intro -->
# Linear Systems

Systems where the input-output relationship satisfies linearity:

- **Superposition**: the response to `(u₁ + u₂)` equals the response to `u₁` plus the response to `u₂`.
- **Scaling**: the response to `α·u` equals `α` times the response to `u`.

For dynamical systems, this means the state-space form is linear:

`ẋ = Ax + Bu`, `y = Cx + Du`

Linear systems are the foundation of classical + modern control. Most analytical results (LQR, Kalman filter, transfer functions) require linearity. Real systems are nonlinear; we linearize them around operating points and use linear-system tools.

<!-- tier:undergrad -->
# Linear Systems (Undergrad)

## Why linearity matters

Linear systems have closed-form solutions for many properties:

- **Stability**: eigenvalues of `A`.
- **Step + impulse response**: matrix exponential `e^{At}`.
- **Transfer function**: `H(s) = C(sI - A)⁻¹B + D`.
- **Optimal control (LQR)**: closed-form via Riccati equation.
- **Kalman filter**: optimal state estimator under Gaussian noise.

None of these have closed-form for nonlinear systems.

## Modes of a linear system

The eigendecomposition `A = V Λ V⁻¹` decomposes the system into **modes**:

`x(t) = V e^{Λt} V⁻¹ x(0) + Vo(t)` (with input)

Each mode evolves as `e^{λ_i t}` independently:
- `Re(λ_i) < 0`: mode decays. Stable.
- `Re(λ_i) > 0`: mode grows. Unstable.
- `Re(λ_i) = 0`: marginally stable (oscillates without decay).

The slowest stable mode dominates long-term behavior.

## Linearization

For nonlinear `ẋ = f(x, u)` at equilibrium `(x*, u*)` (where `f(x*, u*) = 0`):

`A = ∂f/∂x|_{(x*, u*)}`, `B = ∂f/∂u|_{(x*, u*)}`

The linearized system `δẋ = A δx + B δu` describes small deviations from equilibrium.

**Region of validity**: linearization is exact at the equilibrium; error grows quadratically with deviation. Useful for ~10-30% deviations in most physical systems.

**Multiple equilibria**: nonlinear systems often have multiple. Linearize at each separately. Gain-scheduling switches between them.

## Linear system properties

**Time-invariance** (LTI): `A, B, C, D` don't depend on time. The same input applied at different times produces the same response (shifted in time).

**Causality**: output depends only on past inputs. All physically realizable systems are causal.

**Time-varying systems**: `A(t), B(t)` depend on time. Harder to analyze; some LTI tools generalize, others don't.

## Frequency-domain analysis

Laplace transform converts time-domain ODE to frequency-domain algebraic equation:

`X(s) = (sI - A)⁻¹ B U(s) + (sI - A)⁻¹ x(0)`

For zero initial condition:

`Y(s) = H(s) U(s)` where `H(s) = C(sI - A)⁻¹B + D` is the **transfer function**.

`H(jω)` evaluated on the imaginary axis gives the frequency response: how the system attenuates / amplifies + phase-shifts a sinusoidal input at frequency `ω`.

**Bode plots**: log-magnitude + phase vs log-frequency. Standard for SISO design.

<!-- tier:grad -->
# Linear Systems (Grad)

## Canonical forms

Multiple state-space representations of the same input-output behavior. Common canonical forms:

- **Controllable canonical**: useful for pole-placement design.
- **Observable canonical**: useful for observer design.
- **Modal**: `A` diagonal; states correspond to modes.
- **Jordan canonical**: handles repeated eigenvalues.

Similarity transforms `Ã = T⁻¹AT` convert between forms; the transfer function is invariant.

## Discrete + continuous duality

Continuous: `ẋ = Ax + Bu`. Stability iff `Re(λ) < 0` for all eigenvalues.

Discrete: `x_{k+1} = Ax_k + Bu_k`. Stability iff `|λ| < 1` for all eigenvalues.

The transformation `e^{AT}` maps continuous-time eigenvalues to discrete-time ones.

Sampling considerations:
- Sample fast enough (≥ 10x bandwidth).
- Continuous design + discretization (Tustin's method preserves frequency response).
- Direct discrete design (sometimes simpler).

## Multivariable system properties

For MIMO systems:

**Controllability subspace**: span of `[B, AB, A²B, ..., A^{n-1}B]`. Reachable states.

**Stabilizable**: uncontrollable modes are stable. Sufficient for stabilization.

**Detectable**: unobservable modes are stable. Sufficient for output-feedback stabilization.

**Hidden modes**: uncontrollable but observable, or controllable but unobservable. They affect the system but can't be steered or observed. Indicate that state-space realization isn't minimal.

**Minimal realization**: smallest state-space dimension. Equivalent to: controllable + observable. Found by Kalman decomposition.

## Operator-theoretic view

Linear systems = bounded linear operators on signal spaces.

- **L₂-stability**: input in L₂ → output in L₂. Equivalent to `||T||_∞ < ∞` (transfer function bounded on imaginary axis).
- **H∞ norm**: `||H||_∞ = sup_ω σ_max(H(jω))`. Worst-case amplification.

H∞ control: design `K` minimizing `||T_{wz}||_∞` where `w` is disturbance + `z` is performance signal. Robust to worst-case disturbances + uncertainty.

## Linear quadratic Gaussian (LQG)

LQR (state-feedback) + Kalman filter (state estimator) → output-feedback controller.

`K_{LQG} = K_{LQR} · K̂` where `K̂` is the estimated state.

**Separation principle**: for linear-Gaussian problems, optimal observer + optimal feedback can be designed independently. Holds for LQG; doesn't hold for general nonlinear or robust problems.

LQG is the workhorse of aerospace + advanced robotics. Variants like LQG/LTR, H₂/H∞ extend it.

## Connection to ML

Linear models in ML (linear regression, Kalman filter, linear-Gaussian models) are direct applications of linear-systems theory.

Beyond linear: many ML methods (kernel methods, transformers in some regimes) can be analyzed as linearizations or extensions.

State-space models in ML (Mamba, S4, S5) explicitly use the linear-systems formalism for sequence modeling. The continuous-discrete equivalence + efficient computation via the convolution form are central to their design.

## References

- Kailath. *Linear Systems* (1980). The reference.
- Antsaklis & Michel. *Linear Systems* (2007).
- Boyd & Barratt. *Linear Controller Design: Limits of Performance* (1991).
- Skogestad & Postlethwaite. *Multivariable Feedback Control* (2005).
