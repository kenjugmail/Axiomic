---
title: PID Control
category: robotics
---
<!-- tier:intro -->
# PID Control

Proportional-Integral-Derivative — the workhorse of practical control.

`u(t) = K_p · e(t) + K_i · ∫e(τ)dτ + K_d · de/dt`

Three gains tune three behaviors:

- **K_p (Proportional)**: respond proportionally to current error.
- **K_i (Integral)**: accumulate past error; eliminates steady-state offset.
- **K_d (Derivative)**: anticipate future error from rate of change; damps oscillation.

Most industrial control loops are PID or its variants. Tuning is part art, part recipe (Ziegler-Nichols).

<!-- tier:undergrad -->
# PID Control (Undergrad)

## When each term matters

**P-only**: fast response but steady-state error.
**PI**: eliminates steady-state error; can introduce overshoot + slower response.
**PD**: damped response but persistent steady-state error.
**PID**: all three; the standard.

## Tuning recipes

**Ziegler-Nichols (oscillation method)**: increase `K_p` until system oscillates with constant amplitude. `K_u` = critical gain; `T_u` = oscillation period. Then:
- `K_p = 0.6 K_u`, `K_i = 1.2 K_u / T_u`, `K_d = 0.075 K_u T_u`.

**Manual**: increase `K_p` for fast response → add `K_d` to dampen → add `K_i` to eliminate steady-state.

**Cohen-Coon**: open-loop tuning method. Step the input; measure response; compute gains from process gain + time constant + delay.

**Auto-tuning**: relay-based, model-based. Built into most modern PLC controllers.

## Common variants

**PI controller**: drop `K_d` when measurements are noisy (derivative amplifies noise).

**Anti-windup**: integral term shouldn't accumulate when actuator is saturated. Standard fix: clamp the integrator or back-calculate.

**Derivative on measurement**: `K_d` acts on `dy/dt` not `de/dt` to avoid 'derivative kick' when setpoint changes.

**Setpoint weighting**: scale the setpoint differently for `P`, `I`, `D` terms. Reduces overshoot on setpoint changes.

**2-DOF PID**: separates feedback + feedforward; better tracking + disturbance rejection.

## Limits + when to use something else

PID is great for:
- SISO (single-input single-output) systems.
- Linear or nearly-linear plants.
- Slow-to-medium dynamics.

Worse for:
- MIMO systems (use state-space + LQR).
- Strong nonlinearities (use nonlinear control).
- Hard constraints on inputs/outputs (use MPC).
- Time-varying systems (use adaptive control).

<!-- tier:grad -->
# PID Control (Grad)

## Frequency-domain view

PID's transfer function:

`C(s) = K_p + K_i / s + K_d · s`

The integrator adds a pole at origin (eliminates steady-state error). The derivative adds a zero (lead compensation, improves phase margin).

PID + plant `P(s)` gives loop transfer function `L(s) = P(s)C(s)`. Bode plot diagnostics:
- Phase margin > 30° preferred (60° robust).
- Gain margin > 6 dB preferred.
- Crossover frequency determines bandwidth + speed.

## Discrete implementation

Real controllers run at discrete time steps. Discretization choices:

**Forward Euler**: `K_i · e_k · T` for integral.
**Backward Euler**: more stable but slightly different.
**Tustin (bilinear)**: best frequency-domain matching. Standard for accurate digital PID.

Sampling rate: at least 10x the closed-loop bandwidth. Faster is safer.

## Cascade control

Common pattern: outer PID loop sets the reference for an inner PID loop.

Example: motor speed control. Outer loop = position; inner loop = velocity. The inner loop is faster + handles disturbances; the outer loop tracks the position setpoint.

Cascade is the standard for any control system with nested time-scales (motor → joint → arm → end-effector).

## Robustness analysis

Real plants have model uncertainty. Robust-control formulations:

- **Multiplicative uncertainty**: `P̃(s) = P(s)(1 + Δ(s))` where `||Δ|| < W(s)`.
- **Small-gain theorem**: closed-loop stable iff `||T(s)Δ(s)|| < 1` everywhere.
- Designs that satisfy these have provable stability margins.

For most production PID, this analysis is implicit (Ziegler-Nichols gives reasonable margins). For safety-critical systems, explicit robustness analysis is required.

## Modern variants in robotics

- **Computed-torque control**: PID + inverse dynamics. Cancels the nonlinearity; PID handles residuals.
- **Impedance control**: PID acts on a virtual spring-damper between end-effector and target. Standard for compliant manipulation.
- **Admittance control**: opposite of impedance; PID + force feedback.

## References

- Åström & Murray. *Feedback Systems: An Introduction for Scientists and Engineers* (2008).
- Ziegler & Nichols 1942. Optimum settings for automatic controllers.
- Skogestad & Postlethwaite. *Multivariable Feedback Control* (2005).
