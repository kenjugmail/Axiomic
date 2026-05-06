---
title: Statistical Mechanics
category: physics
---
<!-- tier:intro -->
# Statistical Mechanics

You can't actually solve Newton's equations for $10^{23}$ atoms. You also don't *want* to: nobody cares which way each individual atom of air is currently moving. You care about pressure, temperature, density. Statistical mechanics is the bridge — given microscopic dynamics, what does the macroscopic system actually look like?

The trick is to give up on individual trajectories and average over the *ensemble* of microstates compatible with what we know. Three ensembles cover most of the territory:

- **Microcanonical**: total energy is fixed.
- **Canonical**: temperature is fixed (system in contact with a heat bath).
- **Grand canonical**: temperature and chemical potential are fixed (particles can flow in and out).

Each ensemble assigns a probability to every microstate, and macroscopic observables are averages over that probability distribution.

## Why this matters beyond physics

The *form* of the math — log of a sum of exponentials, partition functions, free energies — appears verbatim in machine learning. The softmax distribution is the Boltzmann distribution. Cross-entropy is the negative log-likelihood, which is the free energy. When ML researchers say "energy-based models," they mean it literally.

<!-- tier:undergrad -->
# Statistical Mechanics

## The Boltzmann distribution

For a system with energy levels $E_i$ in contact with a heat bath at temperature $T$, the probability of finding the system in microstate $i$ is

$$p_i = \frac{e^{-E_i / k_B T}}{Z}, \qquad Z = \sum_j e^{-E_j / k_B T}.$$

$Z$ is the **partition function** — the normalizing constant that makes $\sum_i p_i = 1$. Almost every macroscopic observable can be derived from $\ln Z$.

If you've seen [softmax](/wiki/softmax), this is precisely the same formula. Treat the inverse temperature $\beta = 1/k_B T$ as the "inverse softmax temperature" and the energies $E_i$ as the negative logits, and the two are the same distribution.

## Entropy as counting

For an isolated system with $\Omega$ accessible microstates, Boltzmann's entropy is

$$S = k_B \ln \Omega.$$

This is the *number-of-arrangements* definition: the more ways the system can realize a given macrostate, the higher the entropy of that macrostate. The second law (entropy increases) becomes a near-tautology: systems evolve toward macrostates that are realizable in vastly more ways.

## Free energy

The **Helmholtz free energy** $F = U - TS = -k_B T \ln Z$ is what's minimized at fixed temperature. It encodes the trade-off between low energy (small $U$) and high entropy (small $-TS$). At low temperature, energy wins → ordered states. At high temperature, entropy wins → disordered states. Phase transitions live at the parameter values where the balance flips.

<!-- tier:grad -->
# Statistical Mechanics

## Maximum entropy and the principle of insufficient reason

Given some constraints (e.g., known mean energy), the *maximum-entropy* distribution consistent with those constraints is the Boltzmann distribution with appropriate Lagrange multipliers. This isn't physics — it's the right way to assign probabilities given partial information. Jaynes's view: stat mech is just Bayesian inference about unobserved degrees of freedom.

This view also tells you why softmax shows up everywhere: it's the maxent distribution given a constraint on expected log-probability. Whenever you build a probabilistic model with a fixed score function, softmax is what you get.

## Phase transitions and critical phenomena

Near a continuous (second-order) phase transition, correlation length diverges, fluctuations span all scales, and the system becomes scale-invariant. Renormalization-group analysis classifies systems by *universality class* — the critical exponents depend only on dimensionality and symmetry, not on microscopic details. The Ising model and a real ferromagnet share critical exponents because they share a universality class.

## Mean-field, replica, and ML connections

For disordered systems (spin glasses, neural networks at random initialization), the partition function involves averages over disorder. The replica trick — compute $\overline{\ln Z} = \lim_{n \to 0} (\overline{Z^n} - 1)/n$ — turns this into a tractable calculation, at the cost of needing to break replica symmetry to find the true free energy.

The same machinery analyzes large random neural networks: the loss landscape is studied through its replica-symmetric and replica-symmetry-broken phases, and "double descent" / "neural tangent kernel" results are downstream of these methods. Stat mech is the *unreasonably effective* tool for understanding why deep learning works.
