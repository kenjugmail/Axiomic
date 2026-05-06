---
title: Lagrangian Mechanics
category: physics
---
<!-- tier:intro -->
# Lagrangian Mechanics

Newton's laws ask: *what forces act on each part of the system?* That works well for one ball on one string. For a roller coaster cart on a curved track, a double pendulum, or a robot arm with seven joints, accounting for every constraint force becomes a nightmare.

The Lagrangian formulation skips the forces entirely. You write down two energies — kinetic and potential — and one principle does the rest:

> **The actual trajectory of the system is the one that makes the *action* stationary.**

That's it. No free-body diagrams, no constraint forces, no choice of coordinate system that's *the right one*. Pick whatever variables describe the system most cleanly, and the Lagrangian framework just works.

<!-- tier:undergrad -->
# Lagrangian Mechanics

## The action principle

Define the **Lagrangian** $L = T - U$ (kinetic minus potential energy). For a path $q(t)$ from $q(t_1)$ to $q(t_2)$, define the **action**

$$S[q] = \int_{t_1}^{t_2} L(q, \dot q, t) \, dt.$$

The principle of stationary action says the physical path is the one for which $S$ is stationary under small variations $q \to q + \delta q$ that vanish at the endpoints. Setting $\delta S = 0$ and integrating by parts gives the **Euler-Lagrange equations**:

$$\frac{d}{dt}\!\left(\frac{\partial L}{\partial \dot q_i}\right) - \frac{\partial L}{\partial q_i} = 0.$$

Solve these and you have the equations of motion — even in coordinates Newton's laws would have made you sweat to express.

## Generalized coordinates

The big practical win: $q_i$ can be *anything* that uniquely specifies the state. For a pendulum, use the angle. For a particle on a sphere, use $(\theta, \phi)$. For a double pendulum, the two angles. Constraint forces (the rigid rod's tension, the sphere's normal force) never appear because they do no work along legal motions.

## Conserved quantities, easily

If $L$ doesn't depend on $q_i$ (only on $\dot q_i$), then the Euler-Lagrange equation says

$$\frac{d}{dt}\!\left(\frac{\partial L}{\partial \dot q_i}\right) = 0.$$

The quantity $\partial L / \partial \dot q_i$ is *conserved*. This generalizes momentum conservation and is the sharp form of "every continuous symmetry implies a conservation law" — Noether's theorem.

<!-- tier:grad -->
# Lagrangian Mechanics

## Field theory and beyond

For continuum systems — strings, fluids, fields — replace the discrete coordinates $q_i(t)$ with a field $\phi(\mathbf{x}, t)$ and the Lagrangian with a Lagrangian density $\mathcal{L}$. The action becomes a spacetime integral, and the Euler-Lagrange equations become PDEs.

This generalization is the gateway to classical field theory and, with the substitution $S \to \hbar \cdot$ (something dimensionless), to Feynman's path integral formulation of quantum mechanics. The principle of stationary action is replaced by a sum over all paths weighted by $e^{i S/\hbar}$ — and stationary-phase makes the classical path the dominant contribution in the $\hbar \to 0$ limit.

## Constraints and Lagrange multipliers

For systems with holonomic constraints $g_k(q, t) = 0$, augment $L$ with multipliers:

$$L' = L + \sum_k \lambda_k g_k.$$

The Euler-Lagrange equations for $L'$ now include $\lambda_k$, which are precisely the constraint forces. So when you *do* want the constraint force (e.g., is the rope going to break?), the Lagrangian framework still gives it to you — just as a side calculation.

## Why physicists love it

The Lagrangian framework is *coordinate-invariant*: switch to a new set of generalized coordinates and the structure of the equations is unchanged. This is the right way to understand gauge symmetry, general covariance, and why every modern theory of physics — Standard Model, GR, lattice QCD — is *defined* by writing down a Lagrangian.
