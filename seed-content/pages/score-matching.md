---
title: Score Matching
category: multimodal
---
<!-- tier:intro -->
# Score Matching

A way to learn to sample from `p(x)` by estimating its **score function** `s(x) = ∇_x log p(x)`. Mathematically equivalent to diffusion's noise-prediction objective.

The score points toward higher-probability regions of the data distribution. With the score, you can sample via Langevin dynamics:

```
x_{t+1} = x_t + (η/2) · s(x_t) + sqrt(η) · ε
```

A noisy gradient ascent on log-probability. Run long enough, the chain converges to samples from `p(x)`.

<!-- tier:undergrad -->
# Score Matching (Undergrad)

## The score function

For a probability density `p(x)`, the score is the gradient of the log:

```
s(x) = ∇_x log p(x)
```

It's a vector field over the input space, pointing toward higher density. At the data distribution's modes, the score is zero (you're at a peak). Far from any mode, the score is small (flat regions).

If you can estimate `s(x)`, you can sample from `p(x)` via Langevin dynamics — gradient ascent + noise.

## Equivalence to diffusion

Train a noise predictor `ε_θ(x_t, t)` ≈ ε. Mathematically, this is equivalent to estimating the score of the noisy distribution at noise level σ_t:

```
s_θ(x_t, t) = -ε_θ(x_t, t) / σ_t
```

So 'predict the noise' = 'predict the score (negated, scaled)'. The two formulations are equivalent up to a known constant.

This unifies diffusion training with score-based generative modeling. The same network; the same loss; just two ways to interpret what it's learning.

## The reverse SDE

Continuous-time framing (Song & Ermon 2020): the forward noising process is a stochastic differential equation:

```
dx = -β(t)/2 · x · dt + sqrt(β(t)) · dW         (variance-preserving SDE)
```

The **reverse SDE** samples from the data distribution:

```
dx = [-β(t)/2 · x - β(t) · ∇_x log p_t(x)] dt + sqrt(β(t)) · dW
```

The score `∇log p_t` appears explicitly. Estimate it; integrate the reverse SDE backwards in time; you sample from data.

This is the SDE-based framing that enables fast samplers (DPM-Solver, DEIS) — they're numerical integration schemes for this SDE.

<!-- tier:grad -->
# Score Matching (Grad)

## Vincent's score matching identity

How do you learn the score without knowing `p(x)`? **Denoising score matching** (Vincent 2011):

```
J(θ) = E_x E_{ε ~ N(0, σ²)} [|| s_θ(x + ε) - (-ε / σ²) ||²]
```

The minimizer of `J` (over `θ`) is the score of the noisy distribution. No need to know `p(x)` explicitly — just sample noisy versions and regress.

This is exactly the diffusion training objective (with an appropriate noise schedule). Vincent 2011 came before DDPM by 9 years; DDPM rediscovered it in the multi-noise-level setting.

## Multi-scale score matching (NCSN)

Song & Ermon 2019 introduced **noise conditional score networks (NCSN)**: train a single network conditioned on noise level. At each level σ, the network estimates the score of `p_σ(x) = p(x) ⊛ N(0, σ²)`.

Sample by **annealed Langevin dynamics**: run Langevin at high σ first (to escape the curse of low density between modes), then progressively lower σ to refine.

NCSN is the conceptual ancestor of DDPM. They look different (NCSN samples via Langevin; DDPM samples via the reverse Markov chain) but are doing the same thing — score estimation across multiple noise levels.

## SDE samplers

Once you have the score, the reverse SDE can be integrated by various numerical methods:

- **Euler-Maruyama**: simplest. Equivalent to DDPM ancestral.
- **DPM-Solver**: higher-order solver. Fewer steps needed.
- **DEIS**: alternative high-order solver.
- **Heun's method**: second-order; popular in EDM.

Each balances quality vs steps differently. Modern open-source diffusion typically uses DPM-Solver++ (a higher-order variant) at 20-50 steps for sampling.

The score-matching framing is what makes all these advances possible. Without the unified SDE view, each sampler would need to be re-derived for each noise schedule. With it, they're all instances of one mathematical machinery.
