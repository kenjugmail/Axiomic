---
title: Oscillations
category: physics
---
<!-- tier:intro -->
# Oscillations

Push a pendulum out of place and it swings back — overshoots — swings back the other way — overshoots — and so on. The same pattern shows up everywhere: a mass on a spring, a guitar string, the voltage in a tuned electrical circuit, atoms in a crystal.

The reason the pattern is everywhere is that *every smooth potential energy curve looks like a parabola near its minimum*. So as long as something is sitting near the bottom of a well, its small motions look like a spring.

## Three flavors

- **Simple harmonic** (no friction, no driving): pure sine waves forever.
- **Damped**: friction siphons energy off; the amplitude decays.
- **Driven**: an outside force pumps energy in. If the driving frequency matches the natural one, you get **resonance** — small inputs build to enormous outputs. This is how a swing works, how lasers work, and why bridges fall down.

<!-- tier:undergrad -->
# Oscillations

## Simple harmonic motion

Newton's second law for $U(x) = \tfrac{1}{2} k x^2$:

$$\ddot{x} + \omega_0^2 x = 0, \qquad \omega_0 = \sqrt{k/m}.$$

The general solution is $x(t) = A \cos(\omega_0 t + \phi)$. The angular frequency $\omega_0$ depends only on the system parameters, not on the amplitude — *isochrony*, the property that made pendulum clocks possible.

## Damping

Adding a velocity-dependent friction $-b \dot{x}$:

$$\ddot{x} + 2\zeta\omega_0 \dot{x} + \omega_0^2 x = 0, \qquad \zeta = \frac{b}{2 \sqrt{km}}.$$

The dimensionless **damping ratio** $\zeta$ classifies the motion:

- $\zeta < 1$: underdamped — oscillates with decaying amplitude.
- $\zeta = 1$: critically damped — fastest return to rest without overshoot.
- $\zeta > 1$: overdamped — slow, monotonic return.

## Driving + resonance

A sinusoidal forcing $F_0 \cos(\omega t)$ on a damped oscillator gives a steady-state amplitude:

$$A(\omega) = \frac{F_0/m}{\sqrt{(\omega_0^2 - \omega^2)^2 + (2 \zeta \omega_0 \omega)^2}}.$$

$A(\omega)$ peaks near $\omega = \omega_0$ — *resonance*. The peak is sharp when damping is small (high *Q*-factor) and broad when damping is large.

<!-- tier:grad -->
# Oscillations

## Coupled oscillators and normal modes

Two masses connected by springs become a $2 \times 2$ eigenvalue problem. Diagonalize the stiffness matrix and the system decouples into independent **normal modes**, each oscillating at its own frequency. Every linear oscillating system in physics — phonons in a crystal, modes in a waveguide, eigenstates of a quantum harmonic oscillator — is built on this.

## Why nonlinearity changes everything

The linear analysis breaks down once the amplitude is large enough that higher-order terms in the potential matter. Then frequency depends on amplitude, two oscillators can synchronize, and chaos becomes possible (see [nonlinear dynamics](/wiki/nonlinear-dynamics)). The driven, damped, *nonlinear* pendulum is one of the simplest systems that exhibits a period-doubling cascade to chaos.

## Quantization

Quantum mechanically, the harmonic oscillator has equally-spaced energy levels $E_n = \hbar \omega_0 (n + 1/2)$. The same machinery — raising and lowering operators — turns into the QFT picture of particles as quantized field excitations. The classical SHM is the small-amplitude limit of nearly every interacting field theory.
