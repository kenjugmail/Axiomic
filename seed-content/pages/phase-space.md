---
title: Phase Space
category: physics
---
<!-- tier:intro -->
# Phase Space

A pendulum's full state isn't *just* its position — it's also its velocity. Together those two numbers tell you everything about the future trajectory. Plot one against the other and you get **phase space**. Trajectories there are curves, and the *shape* of those curves tells you what kind of dynamics you have without ever solving an equation.

::viz[phase-portrait-1d]

The picture above is a 1D phase portrait for $\dot{x} = rx - x^3$. Drag the slider:

- For $r < 0$: a single stable fixed point at the origin. Anything in the system flows to zero.
- At $r = 0$: a **bifurcation** — the structure of solutions changes.
- For $r > 0$: the origin destabilizes; two new stable fixed points appear at $\pm\sqrt{r}$. This is a **pitchfork bifurcation**.

You can read the long-term behavior off this picture without integrating the equation. That's the power of the phase-space view.

<!-- tier:undergrad -->
# Phase Space

## State variables and dimension

For a system of $n$ second-order ODEs in coordinates $q_1, \dots, q_n$, the phase space is $2n$-dimensional with axes $(q_i, \dot{q}_i)$ — or, in the Hamiltonian formulation, $(q_i, p_i)$. A point in phase space encodes a complete instantaneous state; the dynamics determine a unique flow through every point.

## Fixed points and stability

A **fixed point** is where the velocity field vanishes. Linearize the dynamics around it:

$$\dot{\mathbf{x}} \approx J \cdot (\mathbf{x} - \mathbf{x}_*),$$

where $J$ is the Jacobian of the velocity field at $\mathbf{x}_*$. The eigenvalues of $J$ classify the local behavior:

- All eigenvalues with negative real part → **stable node / spiral**.
- Any positive real part → **unstable**.
- Pure imaginary → **center** (linear analysis is inconclusive; need higher-order terms).

In 1D this collapses to: stable iff $f'(x_*) < 0$, the slope of the right-hand side at the fixed point.

## Why bifurcations matter

Smooth changes in a control parameter $r$ can produce sudden qualitative changes in the dynamics: a fixed point can disappear (saddle-node), split (pitchfork), or lose stability and birth a limit cycle (Hopf). These transitions are *generic* — small perturbations of the equation don't make them go away — and they're how a continuous tunable system gives rise to discrete behavioral regimes.

<!-- tier:grad -->
# Phase Space

## Liouville's theorem

For Hamiltonian flow, the phase-space volume of any region is preserved by the dynamics. Trajectories cannot converge: a small "ball" of initial conditions can stretch into a thin ribbon, but its volume stays constant. This is what makes Hamiltonian chaos *area-preserving* and what underwrites the statistical-mechanics measure on phase space.

## Poincaré sections

For a $n$-dimensional flow, intersecting trajectories with a transverse $(n-1)$-dimensional surface produces a discrete map — the **Poincaré map** — that captures the essential structure. Periodic orbits become fixed points of the map; chaotic trajectories produce strange attractors with fractal cross-sections.

## Strange attractors

In dissipative systems (volume contracts), trajectories collapse onto an attractor. For some 3D systems — most famously the [Lorenz system](/wiki/chaos-and-sensitivity) — that attractor is fractal-dimensional and trajectories on it are aperiodic and exponentially sensitive to initial conditions. Phase space lets us *see* this clearly: the Lorenz butterfly is the attractor.
