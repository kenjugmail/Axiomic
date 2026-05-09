---
title: Particle Filter
category: robotics
---
<!-- tier:intro -->
# Particle Filter

A Monte Carlo state estimator. When the state distribution is highly nonlinear, multimodal, or non-Gaussian, the Kalman filter (which maintains a single Gaussian) fails. The particle filter represents the belief as a set of weighted samples (particles).

**Procedure**:
1. Maintain `N` weighted particles `{x_k^{(i)}, w_k^{(i)}}`.
2. **Predict**: propagate each particle through the (possibly nonlinear) dynamics + add noise.
3. **Update**: weight each particle by `p(z_k | x_k^{(i)})` × prior weight.
4. **Resample**: draw `N` particles with replacement proportional to weights. Prevents weight degeneracy.

**Strengths**: handles arbitrary nonlinearity, multimodality, non-Gaussian noise. Used in robotics localization (Monte Carlo Localization), tracking, recursive Bayesian inference.

**Limits**: computational cost scales with particles + state dimension. Curse of dimensionality.

<!-- tier:undergrad -->
# Particle Filter (Undergrad)

## When particle filters win

**Multimodal beliefs**: a robot in a long hallway might genuinely not know which end it's at. PF maintains both hypotheses; later measurements disambiguate. Kalman/EKF would collapse to one mode prematurely.

**Highly nonlinear dynamics or measurements**: linearization fails badly. PF doesn't need linearization.

**Non-Gaussian noise**: heavy-tailed, multimodal, asymmetric noise. PF samples directly from any distribution.

**Initialization without good estimate**: PF can be initialized from a uniform distribution over a known region; gradually concentrates as evidence arrives.

## Robotics-specific use: Monte Carlo Localization (MCL)

Standard for robot localization in known maps:

1. Distribute particles uniformly over the map (initial belief).
2. As robot moves, propagate each particle through motion model.
3. As robot senses (LIDAR, odometry), weight particles by sensor-likelihood given map.
4. Resample.

After a few moves + measurements, particles concentrate around the true location. Even if initial belief is uncertain, the filter localizes.

**Adaptive MCL**: adjusts particle count dynamically. Few particles when uncertainty is low; more when it's high.

**Used in**: ROS `amcl` package, autonomous-vehicle localization stacks (combined with HD maps), service robots in warehouses.

## Particle degeneracy

A central problem: most particles get near-zero weights after a few steps. The estimate effectively uses only a few high-weight particles; variance increases.

**Fixes**:

- **Resampling**: redraw particles by weight. Eliminates low-weight particles + duplicates high-weight ones. Standard.
- **Resampling threshold**: only resample when effective sample size (`N_eff = 1/Σw_i²`) drops below a threshold. Reduces unnecessary resampling.
- **Sequential Importance Sampling with resampling (SIR)**: combines both.
- **Better proposal distributions**: sample from `p(x_k | x_{k-1}, z_k)` instead of just `p(x_k | x_{k-1})`. Uses the measurement to inform proposals; produces fewer low-weight particles.

## Computational cost

PF cost = `N × per-particle cost per step`. Per-particle cost = dynamics propagation + measurement likelihood evaluation.

For navigation in 2D with simple sensors: `N ≈ 1000-10000` particles is typical; runs at 10+ Hz on standard hardware.

For high-dimensional state (3D, complex robots): `N` may need to scale exponentially. Curse of dimensionality.

## Implementation

```python
import numpy as np

def particle_filter_step(particles, weights, motion, observation, motion_model, obs_model):
    # Predict
    particles = motion_model(particles, motion)
    # Update
    weights *= obs_model(observation, particles)
    weights /= weights.sum()
    # Resample if effective N is too small
    N_eff = 1 / (weights**2).sum()
    if N_eff < len(particles) / 2:
        idx = np.random.choice(len(particles), size=len(particles), p=weights)
        particles = particles[idx]
        weights = np.ones(len(particles)) / len(particles)
    return particles, weights
```

Real implementations have careful numerical handling (log-weights to avoid underflow).

<!-- tier:grad -->
# Particle Filter (Grad)

## Sequential Monte Carlo theory

Particle filters are an instance of **Sequential Monte Carlo (SMC)**: approximate a sequence of distributions `p(x_{0:k} | z_{1:k})` by weighted samples.

The recursive Bayesian filtering equations:
- Prediction: `p(x_k | z_{1:k-1}) = ∫ p(x_k | x_{k-1}) p(x_{k-1} | z_{1:k-1}) dx_{k-1}`
- Update: `p(x_k | z_{1:k}) ∝ p(z_k | x_k) p(x_k | z_{1:k-1})`

PF approximates each via importance sampling: draw `x_k^{(i)}` from a proposal `q(x_k | ...)`; weight by `p / q`.

**Asymptotic correctness**: as `N → ∞`, the empirical distribution converges to the true posterior. For finite `N`, error scales as `O(1/√N)`.

## Variants

**Bootstrap PF**: simplest variant. Proposal = motion model. Often suboptimal but cheap.

**Auxiliary PF**: uses a 2-stage proposal that pre-selects promising particles. Better when measurements are very informative.

**Rao-Blackwellized PF**: marginalize analytically over part of the state (the tractable part) and use particles for the rest. Greatly reduces variance.

**Particle MCMC**: combine particle filtering with MCMC for joint parameter + state estimation. Andrieu-Doucet-Holenstein 2010.

## Curse of dimensionality

PF performance degrades exponentially with state dimension. Reasons:
- Volume of state space grows exponentially.
- Likelihood `p(z|x)` becomes concentrated; most particles get zero weight.
- Resampling can't recover diversity that's already lost.

**Practical limit**: ~10-15 dimensions. Beyond that, PF is rarely competitive with EKF/UKF or factor-graph methods.

## Particle smoothing

Forward filter gives `p(x_k | z_{1:k})`. **Smoothing**: gives `p(x_k | z_{1:N})` for all `k ≤ N`.

- **Forward-backward smoother**: backward pass after forward filter.
- **Two-filter smoother**: forward + backward filters.
- **Particle smoothing**: technical; dominant variants are Doucet-Godsill-Andrieu smoother + Briers-Doucet-Maskell two-filter smoother.

Smoothing improves accuracy at the cost of being offline.

## Modern alternatives

For high-dimensional problems, PF is often replaced by:

- **EKF / UKF / IEKF**: when nonlinearity is moderate + unimodal.
- **Variational filters**: Gaussian or mixture-of-Gaussian variational approximations.
- **Differentiable particle filters**: end-to-end trainable; integrate ML for proposal + likelihood. Active research.
- **Diffusion models for state estimation**: use diffusion to model + sample from posterior; emerging.

PF still dominates in classical robotics-localization settings (MCL, SLAM front-end).

## Connection to ML

PF is the OG sequential Monte Carlo. Variants:

- **MCMC + PF (PMCMC)**: parameter estimation in state-space models.
- **Variational SMC**: PF as variational approximation in deep generative models.
- **Particle filters in deep RL**: belief-state-based RL for partially-observed environments uses PF for state representation.

## References

- Doucet, de Freitas, Gordon. *Sequential Monte Carlo Methods in Practice* (2001).
- Thrun, Burgard, Fox. *Probabilistic Robotics* (2005), chapters 4 + 8.
- Arulampalam et al. 2002. A tutorial on particle filters for online nonlinear/non-Gaussian Bayesian tracking. *IEEE Trans. Signal Process.*
- Andrieu, Doucet, Holenstein 2010. Particle Markov chain Monte Carlo. *J. Royal Statistical Society B*.
