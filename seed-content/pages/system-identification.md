---
title: System Identification
category: robotics
---
<!-- tier:intro -->
# System Identification

The discipline of estimating model parameters from input-output data.

For robots: measure friction, mass, inertia, damping, motor dynamics from controlled experiments. Use the identified parameters in simulation, controllers, and state estimators.

**Why it matters**:
- Accurate models enable accurate control.
- Sim-to-real benefits from calibrated simulators.
- Production hardware has manufacturing variation; per-unit calibration improves consistency.

**Methods**:
- **Direct measurement**: weigh parts, measure dimensions.
- **Excitation experiments**: drive the robot with known inputs; fit parameters to measured outputs.
- **Online identification**: estimate parameters during operation; adapt to drift.

<!-- tier:undergrad -->
# System Identification (Undergrad)

## What gets identified

**Mass + inertia**:
- Direct: weigh the robot, measure CAD geometry.
- Excitation: rotate / accelerate; fit dynamics equations.

**Friction**:
- Static + kinetic friction coefficients.
- Velocity-dependent friction (Stribeck curve).
- Hard to measure directly; usually via excitation.

**Motor dynamics**:
- Time constant, gain, dead-zone.
- Maximum torque + speed.
- Backlash.

**Sensor calibration**:
- Camera intrinsics (focal length, principal point, distortion).
- Camera-robot extrinsics (relative pose).
- IMU bias + scale factors.
- LIDAR mounting + timing offsets.

## Excitation methods

**Step response**: apply a step input; measure transient response. Reveals time constants, damping.

**Sinusoidal sweep (chirp)**: apply sinusoidal input across frequency range; measure output. Bode plot of plant.

**Pseudo-random binary sequence (PRBS)**: rich-spectrum input; identifies many parameters from one experiment.

**Optimal experiment design**: maximize Fisher information about parameters. Theoretical-best inputs.

For robot arms: sinusoidal trajectories that excite each joint at multiple frequencies are standard.

## Parameter estimation

Given input `u(t)`, output `y(t)`, model `y = f(u; θ)`:

minimize `Σ ||y_t - f(u_t; θ)||²` over `θ`.

This is nonlinear least squares. Levenberg-Marquardt or Gauss-Newton.

**Implementation**:
- `scipy.optimize.curve_fit` for simple cases.
- Casadi / Pyomo / IPOPT for constrained problems.
- Custom solvers for robot dynamics (Pinocchio + IDIM-LS).

## Online identification

Real-time parameter estimation during operation:

**Recursive least squares (RLS)**: updates parameter estimate at each sample. Asymptotically equivalent to batch least squares.

**Extended Kalman filter for parameters**: treat parameters as additional state variables. Filter estimates them online.

**Adaptive control**: combines parameter identification with control. The controller adapts as parameters are identified.

Used when:
- Parameters drift (battery degradation, mechanical wear).
- Operating conditions change (temperature, load).
- Hardware varies between units.

## Practical considerations

**Identifiability**: not all parameters are identifiable from typical inputs. Need persistent excitation: input rich enough to excite all parameter directions.

**Robot arms**: typical exciting trajectories cover several minutes of joint sweeps. Pinocchio + IDIM-LS handle this for full 7-DOF dynamics.

**Sensitivity**: some parameters affect behavior more than others. Identify the high-sensitivity ones first; defer low-sensitivity to defaults.

**Repeatability**: real systems aren't perfectly repeatable; multiple runs give variance. Use ensemble fitting + report uncertainty.

## Tools

- **Pinocchio**: Python/C++ rigid-body dynamics; supports parameter ID.
- **Casadi**: symbolic optimization for parameter estimation.
- **System Identification Toolbox** (MATLAB): comprehensive but not free.
- **MOSEK / IPOPT**: NLP solvers for parameter fitting.

<!-- tier:grad -->
# System Identification (Grad)

## Inertial-Parameter Identification (IDIM)

For rigid-body robots, the dynamics:
`τ = M(q) q̈ + C(q, q̇) q̇ + g(q)`

are linear in inertial parameters (mass, mass-times-CoM, inertia tensor):
`τ = Y(q, q̇, q̈) Φ`

where `Y` is the regressor matrix and `Φ` is the parameter vector.

**IDIM-LS**: least-squares estimation of `Φ` from torque measurements.

**Identifiable parameters**: not all inertial parameters affect torques in all motions. Identifiable subset has specific algebraic structure.

**Practical**: 7-DOF arm has 70 inertial parameters; ~40 are identifiable from typical excitation trajectories. The rest are "absorbed" into combinations that affect torques.

Pinocchio + IDIM-LS provides production-quality identification.

## Statistical identification

**Maximum-likelihood estimation**: fit parameters maximizing likelihood under noise model.

**Bayesian identification**: posterior over parameters given prior + data. Provides uncertainty quantification.

**Total least squares**: handles errors in inputs as well as outputs. Useful when inputs are noisy (almost always for sensors).

## Identification under model misspecification

Real dynamics are nonlinear, with friction nonlinearities, joint flexibility, etc. The identified rigid-body model is approximate.

**Robust identification**: design experiments + estimators that handle model misspecification. M-estimators, etc.

**Model-set identification**: estimate parameters consistent with multiple models; report bounds.

## Joint friction identification

Friction is hard:
- Stribeck nonlinearity (velocity-dependent transition between static + kinetic).
- Dahl + LuGre models for hysteresis.
- Direction-dependent (anisotropic friction).

**Identification**:
- Constant-velocity tests at multiple speeds (for Stribeck curve).
- Quasi-static tests for static friction.
- Custom regressors for nonlinear models.

Friction is the most commonly-uncertain parameter; sensitivity to friction explains many sim-to-real failures.

## Dual-state estimation

Sometimes parameters and state must be jointly estimated:

**Dual EKF**: one EKF for state, one for parameters; coupled.

**Joint EKF**: state + parameters in one filter (parameters as constant states).

Used for adaptive cruise control, autonomous-vehicle calibration, drone flight controllers.

## Identification in machine learning

Modern: end-to-end learning of dynamics from data. Replaces explicit identification.

- **Neural ODEs**: differentiable ODE solvers learn dynamics from trajectories.
- **Physics-informed neural networks (PINNs)**: combine known physics with neural net residuals.
- **Differentiable simulation + autodiff**: gradient-based parameter estimation.

These methods scale to high-dimensional + nonlinear systems. Trade-off: less interpretable than parametric models; harder to verify.

## Connection to ML evaluation

In supervised ML, "system identification" is parameter estimation. The same statistical machinery (least squares, Bayesian inference, sensitivity analysis) applies.

Modern dynamics models (Mamba, S4 for sequence dynamics; Neural ODEs; GNN-based simulators) blend ML + system-identification.

## References

- Khalil & Dombre 2002. *Modeling, Identification and Control of Robots*. The reference.
- Featherstone 2008. *Rigid Body Dynamics Algorithms*. Comprehensive on robot dynamics.
- Ljung 1999. *System Identification: Theory for the User*. The control textbook.
- Pinocchio docs. Modern open-source dynamics + identification.
