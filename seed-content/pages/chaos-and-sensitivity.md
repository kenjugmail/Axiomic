---
title: Chaos & Sensitivity
category: physics
---
<!-- tier:intro -->
# Chaos & Sensitivity

In 1963 Edward Lorenz was running a simplified weather model. He restarted a simulation from a midway state, but truncated the printed values — six decimals instead of full precision. Within a few simulated weeks the new run had diverged completely from the original.

::viz[lorenz-attractor]

That is the defining feature of *chaos*: a tiny difference in initial conditions, no matter how small, eventually grows large. The system is fully deterministic — same input, same output — but you can never know the input precisely enough to predict the long-term output. **Determinism without long-term predictability**.

## What chaos is and isn't

Chaos isn't randomness — it's structured, lawful, repeatable in principle. But the dependence on initial conditions is so steep that for practical purposes, beyond a horizon, you're guessing.

The signature is **exponential separation of trajectories**: two starting points $\delta$ apart end up roughly $\delta \cdot e^{\lambda t}$ apart, where $\lambda$ is the *Lyapunov exponent*. Positive $\lambda$ = chaos.

<!-- tier:undergrad -->
# Chaos & Sensitivity

## The Lorenz system

The original equations Lorenz studied:

$$\dot{x} = \sigma (y - x), \qquad \dot{y} = x(\rho - z) - y, \qquad \dot{z} = xy - \beta z.$$

For the canonical $\sigma = 10, \rho = 28, \beta = 8/3$, trajectories spiral on two roughly-planar "wings" and switch between them aperiodically — the famous butterfly attractor.

The dynamics are dissipative (phase-space volume contracts: $\nabla \cdot \mathbf{v} = -(\sigma + 1 + \beta) < 0$), so trajectories settle onto a low-dimensional attractor — *but* the attractor itself has fractal Hausdorff dimension ≈ 2.06.

## Lyapunov exponents

For a flow $\dot{\mathbf{x}} = \mathbf{f}(\mathbf{x})$ with separation vector $\boldsymbol{\delta}$:

$$\lambda = \lim_{t \to \infty} \frac{1}{t} \log \frac{\lVert \boldsymbol{\delta}(t) \rVert}{\lVert \boldsymbol{\delta}(0) \rVert}.$$

Positive $\lambda$ → chaos. The reciprocal $1/\lambda$ is the *Lyapunov time*, the rough horizon beyond which prediction is hopeless. For weather, $1/\lambda \sim$ a couple of weeks. For the solar system, millions of years. For the double pendulum, about a second.

## Why "butterfly effect"

Lorenz's 1972 talk title — *"Does the flap of a butterfly's wings in Brazil set off a tornado in Texas?"* — captured the public imagination. The honest answer: the flap doesn't *cause* the tornado, but it does change which possible weather *is* the one that actually happens. In a chaotic system, "small cause, big effect" is the rule, not the exception.

<!-- tier:grad -->
# Chaos & Sensitivity

## Routes to chaos

Smooth one-parameter families of dynamical systems can transition into chaos by a few generic routes:

- **Period-doubling cascade** (Feigenbaum): periodic orbits double their period at parameter values that approach a limit geometrically with universal ratio $\delta \approx 4.669$.
- **Quasiperiodicity** → mode locking → chaos.
- **Intermittency**: laminar phases punctuated by chaotic bursts, with a power-law distribution of laminar lengths.

These routes show up in real systems remarkably faithfully — fluid turbulence, semiconductor circuits, lasers — once they're tuned through the right parameter range.

## Fractal attractors and ergodicity

A strange attractor is a closed, bounded, fractal-dimensional set on which the flow is topologically transitive (one trajectory eventually visits every neighborhood). The natural measure on the attractor is invariant under the flow, and time averages of observables along almost every trajectory converge to the same number — *ergodicity*. This is what justifies replacing impossible time averages with computable phase-space averages.

## What chaos tells us about prediction

The Kolmogorov-Sinai entropy $h_{KS}$ measures the rate of information generation by the flow. To predict the state $T$ time units in the future to within precision $\epsilon$, you need to know the initial condition to precision $\sim \epsilon \cdot e^{-h_{KS} T}$ — the precision required scales exponentially in the prediction horizon. This is *not* a measurement-instrument problem; it's a fundamental information-theoretic limit.
