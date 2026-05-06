---
title: Mechanics Foundations
category: physics
---
<!-- tier:intro -->
# Mechanics Foundations

Classical mechanics is the physics of how things move. Drop a ball, swing a pendulum, push a cart — three centuries of intuition collapses into a small handful of laws that you can write on a napkin.

## Newton's three laws

1. **An object in motion stays in motion** unless something pushes on it. ("Inertia.")
2. **Push harder, accelerate harder.** Mathematically, $F = m a$ — force equals mass times acceleration.
3. **Every push has an equal and opposite push back.** When you walk, the ground pushes your feet forward exactly as hard as you push it back.

The whole subject of mechanics is built on top of these three lines.

## Conservation laws are the workhorse

Newton's laws tell you how things change moment by moment. Conservation laws tell you what *can't* change. Three matter most for everyday physics:

- **Energy** can change form (kinetic ↔ potential) but the total stays put.
- **Momentum** ($p = mv$) is conserved when nothing external pushes on the system.
- **Angular momentum** is conserved when no external torque acts.

Once you spot a conservation law, the answer to a dynamics problem often reduces to plugging into one equation.

## Why this matters for the rest of the path

Everything we'll do — oscillations, phase space, Lagrangians, even the Lorenz attractor — is *just* Newton with the right framing. Get comfortable here and the rest unfolds without surprise.

<!-- tier:undergrad -->
# Mechanics Foundations

## Newton's laws as differential equations

Newton's second law is a second-order ODE in disguise:

$$m \ddot{\mathbf{x}} = \mathbf{F}(\mathbf{x}, \dot{\mathbf{x}}, t).$$

Once you have the force as a function of position, velocity, and time, the dynamics are uniquely determined by the initial position $\mathbf{x}(0)$ and velocity $\dot{\mathbf{x}}(0)$.

For position-only forces (no friction, no external time-dependent driving), there's almost always a *potential energy* $U(\mathbf{x})$ such that $\mathbf{F} = -\nabla U$. The total energy

$$E = \tfrac{1}{2} m \dot{\mathbf{x}}^2 + U(\mathbf{x})$$

is conserved along trajectories, which gives us a one-equation invariant we can use to constrain solutions without integrating.

## The harmonic oscillator (foreshadowing)

Take $U(x) = \tfrac{1}{2} k x^2$ — a quadratic potential. Newton becomes $m \ddot{x} = -kx$, the simple harmonic oscillator. Every smooth potential, near a minimum, *looks quadratic* (Taylor expansion). That's why SHM is the universal first approximation to bound dynamics.

## Phase-space preview

A second-order ODE in $\mathbf{x}$ becomes a first-order system in $(\mathbf{x}, \dot{\mathbf{x}})$. That double space is *phase space*, and it's where mechanics gets visualized as flows. We'll lean on this hard in [phase space](/wiki/phase-space).

<!-- tier:grad -->
# Mechanics Foundations

## Hamiltonian formulation

Define generalized coordinates $q_i$ and conjugate momenta $p_i = \partial L / \partial \dot{q}_i$ (where $L$ is the Lagrangian — see [Lagrangian mechanics](/wiki/lagrangian-mechanics)). The Hamiltonian is

$$H(q, p, t) = \sum_i p_i \dot{q}_i - L,$$

and the dynamics become

$$\dot{q}_i = \frac{\partial H}{\partial p_i}, \qquad \dot{p}_i = -\frac{\partial H}{\partial q_i}.$$

This first-order form is the natural one for phase space and the bridge to statistical mechanics, where the partition function is constructed from $H$.

## Symmetries → conservation (Noether)

Every continuous symmetry of the action corresponds to a conserved quantity:

- Time-translation symmetry → energy.
- Spatial translation → momentum.
- Rotation → angular momentum.

Noether's theorem unifies the three conservation laws above and is the right way to understand *why* they exist instead of just *that* they do.

## What chaos doesn't break

Even in chaotic Hamiltonian systems, Liouville's theorem holds: phase-space volume is preserved by the flow. The trajectory may stretch and fold unpredictably, but its enveloping volume doesn't shrink. This is the technical reason chaos is "deterministic but unpredictable" — information is preserved, but it scrambles into modes you can't measure.
