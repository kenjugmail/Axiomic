---
title: Kalman Filter
category: robotics
---
<!-- tier:intro -->
# Kalman Filter

The optimal recursive state estimator for linear-Gaussian systems (Kalman 1960).

Given:
- Linear dynamics: `x_{k+1} = F x_k + B u_k + w_k`, `w_k ∼ N(0, Q)`.
- Linear measurement: `z_k = H x_k + v_k`, `v_k ∼ N(0, R)`.

The Kalman filter recursively computes `(x̂_k, P_k)` — the posterior mean + covariance of the state given measurements — without needing to keep history.

Two steps per cycle:

**Predict**:
- `x̂_{k|k-1} = F x̂_{k-1|k-1} + B u_{k-1}`
- `P_{k|k-1} = F P_{k-1|k-1} Fᵀ + Q`

**Update**:
- Kalman gain: `K = P_{k|k-1} Hᵀ (H P_{k|k-1} Hᵀ + R)⁻¹`
- `x̂_{k|k} = x̂_{k|k-1} + K (z_k - H x̂_{k|k-1})`
- `P_{k|k} = (I - KH) P_{k|k-1}`

Workhorse of every modern aerospace + robotics + signal-processing system.

<!-- tier:undergrad -->
# Kalman Filter (Undergrad)

## What the Kalman gain does

The gain `K` is the optimal weighting of measurement vs prediction:

- **Small R (accurate measurement)** → K large → trust measurement.
- **Large R (noisy measurement)** → K small → trust prediction.
- **Small P (accurate prediction)** → K small → don't update much.
- **Large P (uncertain prediction)** → K large → update aggressively.

The math automatically balances both. This is why the filter is "optimal": it's the maximum-likelihood update under linear-Gaussian assumptions.

## Sensor fusion

Multiple sensors with different noise levels: just stack them in `H`.

`z_k = H x_k + v_k` where `H` and `v_k`'s covariance encode all sensors.

The filter weights each sensor automatically by reliability. No manual tuning needed beyond specifying noise covariances.

Examples:
- Drone with GPS + IMU + barometer: 3 sensors → 1 fused state estimate.
- Self-driving car with cameras + LIDAR + radar + GPS + IMU: 5+ sensors → unified estimate.

## Implementation

```python
import numpy as np

def kalman_step(x, P, F, B, Q, H, R, u, z):
    # Predict
    x_pred = F @ x + B @ u
    P_pred = F @ P @ F.T + Q
    # Update
    y = z - H @ x_pred  # innovation
    S = H @ P_pred @ H.T + R
    K = P_pred @ H.T @ np.linalg.inv(S)
    x_new = x_pred + K @ y
    P_new = (np.eye(len(x)) - K @ H) @ P_pred
    return x_new, P_new
```

Real implementations (FilterPy, control-toolbox) handle numerical issues like Joseph form for `P` updates (numerically stable).

## Tuning

The two key matrices:

**Q (process noise)**: how much you trust the dynamics model. Larger Q = filter relies more on measurements. Often hand-tuned.

**R (measurement noise)**: how much you trust the sensors. Often determined from sensor specs + Allan-variance analysis.

**Initial P_0**: how uncertain you are about the initial state. Set large enough that the filter rapidly converges.

Tuning is part art, part empirical. The Allan-variance technique characterizes IMU noise; manufacturer specs characterize GPS, LIDAR, cameras.

## Properties

**Optimal**: minimizes mean-squared error among unbiased estimators (under linear-Gaussian assumptions).

**Recursive**: `O(n²)` per step where `n` is state dimension. Doesn't grow with time history.

**Bayesian**: the filter implements Bayesian inference exactly for linear-Gaussian models.

**Unbiased**: `E[x̂_k - x_k] = 0` if model is correct.

<!-- tier:grad -->
# Kalman Filter (Grad)

## Information form

Alternative parametrization using information matrix `Ω = P⁻¹` and information vector `η = Ω · x̂`:

**Update step is simpler**:
- `η_{k|k} = η_{k|k-1} + Hᵀ R⁻¹ z_k`
- `Ω_{k|k} = Ω_{k|k-1} + Hᵀ R⁻¹ H`

**Predict step is more complex**:
- Inverts `Ω`, applies `F`, re-computes `Ω`.

Information form is preferred when measurements arrive often relative to dynamics (sensor fusion-heavy problems). Sparsity in `Ω` enables efficient implementations (graph SLAM uses this).

## Steady-state Kalman filter

For LTI systems, the gain `K` converges to a steady-state value `K_∞`. After convergence:
- `K_k = K_∞` (constant gain).
- `P_k = P_∞` (constant covariance).

Use `solve_discrete_are` (Riccati) to compute `P_∞`, `K_∞` offline. Implementation: just `x̂_k = (F - K_∞ H F) x̂_{k-1} + K_∞ z_k + ...`

Saves runtime computation. Used in many embedded systems.

## Stability + convergence

**Convergence**: under controllability + observability, `P_k → P_∞`. The filter "forgets" initial conditions exponentially.

**Stability**: the filter equations form a linear system whose stability is guaranteed under standard assumptions.

**Divergence**: real filters can diverge if:
- Model is wrong (mismatched `F, H, Q, R`).
- Numerical issues (Joseph form helps).
- Initial covariance too small + measurement updates too aggressive.

## Smoothing

Kalman filter gives `x̂_k|k` (filtered estimate using measurements up to time `k`).

**Smoothing**: gives `x̂_k|N` (estimate using ALL measurements, including future). More accurate.

- **Rauch-Tung-Striebel (RTS) smoother**: backward pass after the forward Kalman filter. Standard.
- **Forward-backward smoothing**: same idea; common nomenclature.

Smoothing is offline-only (needs future measurements). Used in post-processing applications (GPS post-processing, mapping).

## Limitations driving generalizations

The Kalman filter assumes:
- Linear dynamics + measurements.
- Gaussian noise.
- Known model + noise statistics.

When these fail:
- **Nonlinear**: Extended KF (linearize), Unscented KF (sigma points), Particle Filter (Monte Carlo).
- **Non-Gaussian**: Particle Filter, Bayesian methods.
- **Unknown noise**: adaptive filters, dual-state estimation.

Each relaxes one assumption at a cost.

## Connection to ML

The Kalman filter is exactly Bayesian inference for linear-Gaussian sequential models:

- **Hidden Markov Models**: discrete-state analog of Kalman.
- **Linear Gaussian Sequence Models**: continuous-state analog; equivalent to Kalman.
- **State-Space Models in deep learning** (Mamba, S4): generalize Kalman to nonlinear / data-driven settings.

The Kalman filter is the OG sequence model. Modern ML state-space models inherit its structure.

## References

- Kalman 1960. A new approach to linear filtering and prediction problems. *J. Basic Eng.*
- Anderson & Moore. *Optimal Filtering* (1979). Reference textbook.
- Maybeck. *Stochastic Models, Estimation, and Control* (1979). Comprehensive.
- Thrun, Burgard, Fox. *Probabilistic Robotics* (2005). Robotics-focused.
- Bishop, *Pattern Recognition and Machine Learning* §13.3 (2006). ML perspective.
