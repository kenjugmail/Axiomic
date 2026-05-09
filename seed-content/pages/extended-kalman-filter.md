---
title: Extended Kalman Filter (EKF)
category: robotics
---
<!-- tier:intro -->
# Extended Kalman Filter (EKF)

The standard Kalman filter assumes linear dynamics + linear measurement. Real systems are nonlinear.

The EKF approximates the nonlinear dynamics + measurement functions by their first-order Taylor expansion (Jacobian) at each time step, then applies the standard Kalman update.

For `x_{k+1} = f(x_k, u_k) + w_k` and `z_k = h(x_k) + v_k`:

- Linearize: `F_k = ∂f/∂x|_{x̂_k}`, `H_k = ∂h/∂x|_{x̂_k}`.
- Apply Kalman predict + update with these Jacobians + the nonlinear functions `f, h` for the mean update.

Workhorse of legacy aerospace + robotics. Cheap; well-understood. Approximation error accumulates; can diverge if nonlinearity is severe.

<!-- tier:undergrad -->
# Extended Kalman Filter (Undergrad)

## How it works

**Predict**:
- `x̂_{k|k-1} = f(x̂_{k-1|k-1}, u_{k-1})` (use the FULL nonlinear `f` for the mean).
- `F_k = ∂f/∂x|_{x̂_{k-1}}` (linearize for the covariance).
- `P_{k|k-1} = F_k P_{k-1|k-1} F_kᵀ + Q`.

**Update**:
- `H_k = ∂h/∂x|_{x̂_{k|k-1}}`.
- `K = P_{k|k-1} H_kᵀ (H_k P_{k|k-1} H_kᵀ + R)⁻¹`.
- `x̂_{k|k} = x̂_{k|k-1} + K(z_k - h(x̂_{k|k-1}))` (use the nonlinear `h` for innovation).
- `P_{k|k} = (I - K H_k) P_{k|k-1}`.

The mean uses the full nonlinear functions; the covariance uses the linearizations. This is the EKF approximation.

## Computing Jacobians

**Analytic**: compute partial derivatives by hand. Most accurate; error-prone for complex models.

**Symbolic** (SymPy, MATLAB Symbolic Toolbox): automate derivative computation; check by hand.

**Automatic differentiation (autodiff)**: JAX, PyTorch's autograd, Casadi. Compute `F_k, H_k` from the function definitions automatically. Modern preferred approach.

**Numerical** (finite differences): `(f(x + ε) - f(x))/ε`. Slow; numerical-error sensitive. Last resort.

For production EKFs in C++ / Rust, autodiff via Casadi or hand-rolled analytic Jacobians dominate.

## Where EKF works well

- **Mildly nonlinear systems**: linearization captures most of the behavior.
- **Frequent measurements**: keeps the linearization point near truth.
- **Good initial estimate**: starts the filter near the true state.

Examples:
- GPS + IMU fusion (drone, vehicle navigation).
- Visual-inertial odometry (modest nonlinearity in camera projection).
- Robot arm joint-state estimation.

## Where EKF fails

- **Highly nonlinear systems**: linearization error compounds; filter diverges.
- **Multimodal beliefs**: EKF maintains a single Gaussian; can't represent "robot is at A or B".
- **Bad initial estimates**: linearization at a far-from-truth point gives wrong updates; filter never converges.

For these, use UKF, particle filter, or factor-graph optimization.

## Numerical issues

EKF is famously fragile:

- **Covariance non-positive-definiteness**: floating-point errors can make `P` lose positive-definiteness; use Joseph form `P_new = (I - KH) P_old (I - KH)ᵀ + K R Kᵀ` for stability.
- **Diverging covariance**: large innovations can push `P` to grow without bound.
- **Innovation gating**: reject measurements with huge innovations (likely outliers); prevents bad updates.
- **Square-root form**: maintain `√P` instead of `P`; better numerical conditioning.

Production EKFs (PX4, ROS robot_localization) implement all these tricks.

<!-- tier:grad -->
# Extended Kalman Filter (Grad)

## Bias from linearization

EKF's linearization introduces bias: the propagated mean isn't actually `E[f(x)]` but `f(E[x])` (Jensen's inequality). For convex-like `f`, this underestimates the mean; for concave-like, overestimates.

**Iterated EKF (IEKF)**: re-linearize at the updated estimate, iterate. Reduces linearization bias.

**Second-order EKF**: include Hessian terms. More accurate; rarely worth the complexity.

## Unscented Kalman Filter (UKF)

UKF (Julier-Uhlmann 1997) sidesteps linearization by propagating "sigma points" — carefully chosen samples — through the nonlinear functions.

- Generate `2n+1` sigma points around the current mean.
- Propagate each through `f` (or `h`).
- Compute the new mean + covariance from the propagated samples.

**Strengths**:
- No Jacobian needed.
- Captures nonlinearity better than EKF (matches Taylor up to 2nd or 3rd order).
- Often more numerically stable.

**Limits**:
- Slightly more computation per step.
- Same single-Gaussian assumption; can't handle multimodality.

UKF often replaces EKF in modern systems where nonlinearity matters.

## Convergence + stability

**Convergence**: EKF converges if the nominal system is stable + observable + the linearization is good enough. Hard to verify in advance.

**Divergence**: in practice, EKF can diverge:
- Strong nonlinearity around current estimate.
- Persistent outliers.
- Model mismatch.

**Diagnostic**: monitor the **innovation sequence** `e_k = z_k - h(x̂_k)`. Should be zero-mean white noise of the appropriate covariance. Persistent biases or growing variance indicate failure.

## Initialization

EKF needs a good initial estimate. Bootstrap strategies:

- **Cold start**: estimate from first few measurements (e.g., GPS for position; gravity for orientation).
- **Two-step**: simple algorithm (e.g., least squares on first window) provides initial state; EKF takes over.
- **Multiple hypotheses**: run several EKFs with different initial conditions; use likelihood-based selection.

For SLAM, the initialization problem is extreme (multiple plausible robot positions); particle filters are typical.

## EKF-SLAM

EKF applied to SLAM: the joint state vector includes robot pose + all landmark positions.

- Dimension grows with landmarks.
- Covariance is dense (every landmark correlated with every other through the joint update).
- `O(N²)` per update; doesn't scale beyond hundreds of landmarks.

Modern SLAM uses sparse factor-graph optimization instead. EKF-SLAM remains the textbook example.

## Connection to optimization-based estimation

Modern estimation (factor graphs, GTSAM) uses optimization (nonlinear least squares) instead of recursive Kalman.

**Connection**: a single EKF step is equivalent to one Gauss-Newton iteration on a small fixed-window MAP problem. So EKF and optimization-based methods are different views of the same underlying Bayesian inference.

**Why optimization-based wins for SLAM**:
- Sparsity exploited efficiently.
- Re-linearization at each iteration.
- Loop closures + multi-rate sensors handled naturally.

EKF is still preferred for very-high-rate, fixed-state-dim filtering (drone IMU, motor estimation).

## References

- Maybeck. *Stochastic Models, Estimation, and Control* (1982).
- Julier & Uhlmann 1997. A new extension of the Kalman filter to nonlinear systems. (UKF.)
- Thrun, Burgard, Fox. *Probabilistic Robotics* (2005).
- Sola. *Quaternion Kinematics for the Error-State Kalman Filter* (2017). Reference for orientation estimation.
