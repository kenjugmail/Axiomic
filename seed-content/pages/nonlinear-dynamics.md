---
title: Nonlinear Dynamics
category: physics
---
<!-- tier:intro -->
# Nonlinear Dynamics

A linear system obeys *superposition*: the response to two inputs together is the sum of the responses to each separately. Most of physics 101 lives there because linear math is tractable.

A nonlinear system is anything else. The double pendulum is the canonical small-equipment example:

::viz[double-pendulum]

Drag the slider, hit reset, watch the second bob trace a different path every time. Two starting positions that look indistinguishable at $t = 0$ are visibly different by $t = 5\,$s. That's chaos in your living room with two sticks and a hinge.

## The new vocabulary

Linear systems have one fixed point and exponential decay or growth. Nonlinear systems have a richer zoo:

- **Limit cycles**: closed orbits the system loops onto from a range of initial conditions (the heart's pacemaker).
- **Bifurcations**: smooth parameter changes that produce sudden qualitative shifts (lasers turning on, neurons firing).
- **Multiple basins of attraction**: which final state you end up in depends on where you started.
- **Strange attractors**: chaotic motion bounded to a fractal set.

Linear math does not prepare you for any of this — but a phase-space view does.

<!-- tier:undergrad -->
# Nonlinear Dynamics

## Limit cycles

Some 2D systems possess closed periodic orbits not present in any linear system. The Van der Pol oscillator,

$$\ddot{x} - \mu (1 - x^2) \dot{x} + x = 0,$$

has a stable limit cycle for $\mu > 0$. Trajectories spiral in to it from outside *and* spiral out to it from inside the cycle.

The Poincaré-Bendixson theorem tells you: in 2D continuous flows, bounded trajectories that don't approach a fixed point must approach a closed orbit. So 2D ODEs cannot be chaotic — chaos requires at least three dimensions.

## Bifurcation taxonomy

The four canonical 1D bifurcations:

- **Saddle-node**: two fixed points (one stable, one unstable) collide and annihilate.
- **Transcritical**: two fixed points exchange stability.
- **Pitchfork**: one fixed point splits into three (or vice versa).
- **Hopf** (in 2D): a fixed point loses stability and births a limit cycle.

The genericity result — these are the bifurcations you encounter in one-parameter families — is a statement about codimension and is one of the deeper results in dynamical systems.

## Period-doubling

The logistic map $x_{n+1} = r x_n (1 - x_n)$ has fixed points that go through a cascade of period-doublings as $r$ increases past 3, 3.45, 3.55, ... at parameter values that converge geometrically with **Feigenbaum's constant** $\delta \approx 4.669$. The same $\delta$ appears in *every* smooth, single-humped map — universality.

<!-- tier:grad -->
# Nonlinear Dynamics

## Smale horseshoe and topological chaos

A horseshoe map — stretch in one direction, fold, embed — produces a Cantor-like invariant set on which the dynamics is *topologically conjugate* to a full shift on two symbols. This is a rigorous proof of chaos: the symbolic dynamics has positive entropy, periodic orbits dense, and sensitive dependence everywhere.

When you find a horseshoe-like construction in a physical system (a Poincaré section of the right flow, for example), you have a proof of chaos that's robust to perturbations.

## KAM theorem

For nearly-integrable Hamiltonian systems, most of phase space remains foliated by invariant tori (KAM tori) under small perturbations. Chaos appears in narrow regions between them. As the perturbation grows, KAM tori break and chaotic regions merge. This explains why the solar system is *mostly* stable on geologic timescales — and exactly which initial conditions can lead to runaway instability.

## Pattern formation

Reaction-diffusion systems, fluid convection, and laser physics all exhibit spontaneous spatial patterns — Turing stripes, Bénard cells, optical solitons. The general framework: a homogeneous state loses stability via a Turing or Hopf bifurcation, and the unstable mode with the *right* wavelength wins. This connects nonlinear dynamics to morphogenesis and to the broader question of how complexity arises in dissipative systems.
