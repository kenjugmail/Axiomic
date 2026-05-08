---
title: Stability
category: robotics
---
<!-- tier:intro -->
# Stability

A system is **stable** if bounded inputs produce bounded outputs.

Unstable systems diverge — outputs grow without bound or oscillate with growing amplitude. Stability is the FIRST property a controller must guarantee. Performance + optimality are secondary.

**For linear systems**: all closed-loop poles in the left-half complex plane → stable.

**For nonlinear systems**: harder. Lyapunov stability theory gives sufficient conditions: find `V(x) > 0` with `V̇(x) < 0` along trajectories.

Real robots have crashed because of poorly-tuned controllers. Drones have flown into walls. Don't ship without stability margins.

<!-- tier:undergrad -->
# Stability (Undergrad)

## Linear stability — the pole story

For a linear time-invariant system `ẋ = Ax + Bu`, closed-loop dynamics with feedback `u = -Kx` are `ẋ = (A - BK)x`.

**Stability** ⟺ all eigenvalues of `A - BK` have negative real parts.

In Laplace-transform form: all poles of the closed-loop transfer function in the open left-half plane.

**Routh-Hurwitz criterion**: a polynomial test for whether all roots have negative real parts. Useful for analytical stability.

**Eigenvalue computation**: numerical; what `numpy.linalg.eig` does. Practical for any plant.

## Frequency-domain stability

**Nyquist criterion**: a graphical test from the Nyquist plot. Counts encirclements of the (-1, 0) point.

**Bode-plot diagnostics**:
- **Phase margin**: how much extra phase lag before instability. >30° preferred; >60° robust.
- **Gain margin**: how much extra gain before instability. >6 dB preferred.

**Why margins matter**: real plants differ from your model. Stability margin is the cushion against model error.

## Lyapunov stability for nonlinear systems

For nonlinear `ẋ = f(x)` at equilibrium `x* = 0`:

**Lyapunov function** `V(x)`:
- `V(0) = 0`, `V(x) > 0` for `x ≠ 0`.
- `V̇(x) = ∇V(x) · f(x) ≤ 0` along trajectories.

If a Lyapunov function exists, the equilibrium is **stable**. If `V̇ < 0` strictly, **asymptotically stable** (converges to equilibrium).

**Common Lyapunov functions**:
- Quadratic: `V(x) = xᵀ P x` for `P > 0`.
- Energy-like for mechanical systems: `V = KE + PE`.

**Limit**: finding a Lyapunov function is hard. Failure to find one doesn't prove instability.

## Practical implications

**Real robots that became unstable**:
- Quadrotor controllers with insufficient damping → oscillation; eventual crash.
- Autonomous vehicle path-trackers with too-high gains → wobble at high speeds.
- Robot arms with poorly-tuned impedance control → unstable contact behavior.

**Diagnostics**:
- Time-domain: oscillation that grows over time.
- Frequency-domain: peak in closed-loop response near a resonance.
- Sensor data: actuator saturation cycling.

**Fixes**:
- Reduce gains.
- Add damping (D term in PID; velocity feedback).
- Filter measurement noise that's amplified by D.
- Improve actuator dynamics or compensate for them.
- Add a low-pass filter on D term in PID.

## Domain of attraction

For nonlinear systems, stability is local. The **region of attraction (RoA)** is the set of initial conditions from which trajectories converge to the equilibrium.

Lyapunov-based estimates of RoA are usually conservative. Real RoA may be larger.

For control design: characterize RoA + ensure operating conditions stay inside.

<!-- tier:grad -->
# Stability (Grad)

## Input-to-state stability (ISS)

Generalizes Lyapunov stability to systems with disturbances:

`ẋ = f(x, w)` is ISS if `||x(t)|| ≤ β(||x(0)||, t) + γ(sup_τ ||w(τ)||)`

for some class-K∞ functions β, γ.

Practical: as disturbance magnitude shrinks, state magnitude shrinks proportionally. Useful for analyzing robust feedback systems.

## Stability under feedback

**Stabilizability**: there exists a feedback `u = Kx` making the system stable.

**Controllability** is sufficient but not necessary for stabilizability. Even uncontrollable modes can be stable (just not steerable).

**Detectability**: there exists an observer that estimates the state asymptotically. Required for output-feedback stabilization (using only measurements, not full state).

## Robustness margins

**Structured singular value (μ)**: robust-stability measure for systems with structured uncertainty. μ-synthesis designs controllers minimizing μ.

**Quadratic stability**: stability under polytopic uncertainty (parameters in a known set). Tractable via LMIs.

**H∞ control**: design controllers minimizing the H∞ norm of the closed-loop transfer function. Robust to worst-case disturbances + model uncertainty.

## Stability for switched systems

When the system switches between modes (e.g., gait changes in legged robots), stability requires:

- Each mode stable individually (necessary, not sufficient).
- Common Lyapunov function across modes (sufficient).
- Multiple Lyapunov functions with bounded jumps at switching times.

## Stability + safety in modern robotics

ML-based controllers don't have classical stability guarantees. Ongoing research:

- **Lyapunov-based RL**: constrain RL to learn policies with provable stability properties.
- **Control barrier functions (CBFs)**: define safe sets; constrain RL output to remain inside.
- **Robust safe RL**: combine safety with worst-case robustness.

Production safety-critical robotics (autonomous vehicles, surgery, aviation) keep classical stable inner loops + safety wrappers around any ML.

## Numerical issues

In practice, stability analysis can be numerically tricky:
- Eigenvalue computation near the imaginary axis is sensitive.
- Lyapunov-equation solutions can be ill-conditioned.
- LMI solvers can miss feasibility for marginally-stable systems.

**Best practice**: combine analytical analysis with extensive simulation + hardware testing. Don't ship on theory alone.

## References

- Khalil. *Nonlinear Systems* (3rd ed, 2002). The Lyapunov-stability standard.
- Doyle, Francis, Tannenbaum. *Feedback Control Theory* (1992).
- Boyd, El Ghaoui, Feron, Balakrishnan. *Linear Matrix Inequalities in System and Control Theory* (1994).
