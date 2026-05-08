---
title: Feedback Loops
category: robotics
---
<!-- tier:intro -->
# Feedback Loops

The fundamental structure of every control system.

A feedback loop:

1. **Measure** the output `y`.
2. **Compare** to the setpoint `r`. Error: `e = r - y`.
3. **Compute** a control action `u` based on `e`.
4. **Apply** `u` to the system. The system responds; `y` changes.
5. **Repeat**.

The loop's behavior depends on:

- **Plant dynamics**: how the system responds to inputs.
- **Controller**: how it computes `u` from `e`.
- **Measurement**: how `y` is sensed (noise, delay).
- **Actuator**: how `u` is applied (saturation, lag).

Open-loop systems (no measurement) work only when dynamics are perfectly known. Almost everything in robotics is closed-loop.

<!-- tier:undergrad -->
# Feedback Loops (Undergrad)

## Why feedback works

Disturbances + model uncertainty are inevitable. Feedback corrects them by reacting to actual output.

**Without feedback**: output drifts from setpoint with any disturbance. The system has no way to know.

**With feedback**: the controller sees the error and adjusts. The system self-corrects.

This is why a thermostat works (feedback on temperature) but an open-loop heater (just on for X minutes) doesn't track setpoint reliably.

## Block-diagram intuition

```
r (setpoint) ─┬─→ [+] →─→ Controller →─→ Plant ──┬─→ y (output)
              │   ↑                              │
              └───└────── - ←── Sensor ──────────┘
```

The negative-feedback loop is the canonical structure. The signal path: setpoint → error → controller → plant → output → measurement → error.

**Loop transfer function**: `L(s) = C(s) · P(s) · S(s)` where `C` is controller, `P` is plant, `S` is sensor.

**Closed-loop response**: `T(s) = L(s) / (1 + L(s))`.

## Stability + delay

Loop delay reduces stability. A pure integrator with delay can become unstable; the controller "sees" old error and reacts to it.

**Time-delay margin**: how much delay you can tolerate before instability. Important for distributed control, networked systems, sensor latency.

Practical: keep loops fast relative to the plant's time constants. Sample at 10x the closed-loop bandwidth.

## Disturbance rejection

A good feedback loop suppresses disturbances:

- **Output disturbance**: a force pushes the output; feedback corrects.
- **Measurement noise**: noise propagates to control output; high-bandwidth control is more sensitive to it.
- **Input disturbance**: actuator perturbed; feedback compensates.

The transfer function from disturbance to output describes rejection ability. PID + LQR designs trade off setpoint tracking against disturbance rejection.

## Bandwidth

The closed-loop bandwidth: how fast the system responds. Higher bandwidth = faster setpoint tracking + better disturbance rejection.

But: higher bandwidth = more noise sensitivity + need for higher actuator effort + tighter constraints.

Tuning is balancing these.

<!-- tier:grad -->
# Feedback Loops (Grad)

## Sensitivity functions

For feedback loop with controller `C` and plant `P`:

- **Sensitivity** `S = 1 / (1 + PC)`: response to disturbances.
- **Complementary sensitivity** `T = PC / (1 + PC) = 1 - S`: response to setpoint + measurement noise.

Constraint: `S + T = 1`. Improving setpoint tracking (`T → 1`) worsens disturbance rejection (`S → 0`) — at any single frequency. Trade-offs across the frequency spectrum.

## Bode's integral theorem

`∫₀^∞ ln |S(jω)| dω = π · Σ unstable poles`.

If the plant has any right-half-plane (unstable) poles, you can't make `|S|` small everywhere — improvement at one frequency means degradation at another.

This is a fundamental limit, not an engineering shortcoming. "Robust + high-performance + disturbance-rejection at all frequencies" is mathematically impossible for any non-trivial plant.

## Multivariable feedback

For MIMO systems:
- Sensitivity is a matrix.
- Performance limits include the Bode integral generalizations.
- Cross-couplings between channels matter.

Tools: H∞, μ-synthesis, LMI-based design. Industry standard for aerospace + automotive.

## Time-delay systems

Delay in the loop:
- Reduces phase margin.
- Limits achievable bandwidth.
- Smith predictor: model the delay; predict future output; compensate.
- Internal model control (IMC): explicit model in the controller.

For network-controlled systems, delay management is the entire game.

## Adaptive feedback

When plant dynamics change over time, fixed-gain controllers degrade. Adaptive control:

- **Model Reference Adaptive Control (MRAC)**: gains adjust to make the plant respond like a reference model.
- **Self-tuning regulator**: identify the plant online; redesign the controller.
- **Gain scheduling**: pre-compute gains for different operating points; switch.

Production: aerospace flight controllers use gain-scheduling extensively. Robotics increasingly uses learning-based adaptation (RL fine-tuning of PID gains; adaptive impedance control).

## Connection to RL

RL is feedback-control's modern cousin: state → action via a policy. The policy plays the role of the controller; the environment plays the plant.

Differences:
- RL learns the policy from data; control assumes a model.
- RL handles partially-observed environments via belief state; control uses observers.
- RL maximizes long-term reward; control tracks setpoints.

Modern robotics often hybridizes: classical feedback as the inner loop; RL on top.

## References

- Åström & Murray. *Feedback Systems* (2008).
- Skogestad & Postlethwaite. *Multivariable Feedback Control* (2005).
- Doyle, Francis, Tannenbaum. *Feedback Control Theory* (1992).
