---
title: MCMC (Markov Chain Monte Carlo)
category: stats
---
<!-- tier:intro -->
# MCMC

Sample from a target distribution (typically a posterior) when you can compute it up to a normalizing constant. Construct a Markov chain whose stationary distribution is the target; run the chain; samples from late steps are samples from the target.

The workhorse of Bayesian inference. Stan + PyMC + NumPyro all implement MCMC under the hood.

<!-- tier:undergrad -->
# MCMC (Undergrad)

## Metropolis-Hastings

The simplest MCMC. To sample from a target `π(θ)`:

```
θ_current = initial
for t in range(T):
    propose θ_new ~ Q(· | θ_current)        # proposal distribution
    α = min(1, π(θ_new) Q(θ_current | θ_new) / [π(θ_current) Q(θ_new | θ_current)])
    if random() < α:
        θ_current = θ_new
    samples.append(θ_current)
```

The acceptance ratio guarantees the chain converges to `π`. Even if you only know `π` up to a constant, the ratio of constants cancels out — that's the genius.

Pros: simple; works for any target.
Cons: slow mixing in high dimensions; choice of proposal is critical.

## Hamiltonian Monte Carlo (HMC)

Uses gradient information. Treats `-log π(θ)` as a potential energy; introduces auxiliary momentum; simulates Hamiltonian dynamics; proposes far-jumping moves.

Far more efficient than Metropolis in high dimensions. The basis of Stan + PyMC + NumPyro.

**NUTS** (No-U-Turn Sampler): adaptive HMC. Tunes step size + path length automatically. The standard in modern Bayesian software.

## Diagnostics

**R-hat**: should be ≤ 1.01 across multiple chains. Otherwise, chains haven't mixed.

**Effective sample size (ESS)**: how many independent samples your chain produces. Lower than `T` due to autocorrelation. ESS > 400 per parameter is typical target.

**Trace plots**: chain of samples vs iteration. Should look like fuzzy caterpillars (no trends, no obvious clumping).

Modern tools (PyMC, NumPyro) report all of these automatically. Run multiple chains; check R-hat; check ESS.

<!-- tier:grad -->
# MCMC (Grad)

## When MCMC fails

- **Multimodal posteriors**: chain can get stuck in one mode. Use multiple chains from different starting points; consider parallel tempering.
- **Highly correlated parameters**: slow mixing. Reparameterize (e.g., centered → non-centered for hierarchical models).
- **Long-tailed distributions**: HMC can struggle. Try Riemannian HMC or different proposal scales.
- **Discrete parameters**: HMC requires gradients; doesn't work with discrete. Specialized methods (Gibbs, reversible-jump) needed.
- **Very high-dim posteriors** (millions of params): MCMC scales poorly; use variational inference.

## Software

**Stan**: the most-mature; HMC + NUTS; great diagnostics. Good for traditional Bayesian models.

**PyMC**: Python; HMC + NUTS; deep PyTorch integration in newer versions.

**NumPyro**: Python; very fast (JAX-based); modern API; production-friendly.

**Pyro**: Python; PyTorch-based; flexible but slower than NumPyro.

For new projects: NumPyro + JAX is hard to beat for performance. For more research-focused work: PyMC or Stan.

## Variational inference as alternative

For huge posteriors or fast iteration, [[bayesian-inference|VI]] is the alternative. Trade-off:
- MCMC: asymptotically exact; slow.
- VI: approximate; fast.

For most production Bayesian ML: VI for fast iteration; MCMC for definitive analysis on small models.

## Convergence isn't guaranteed

MCMC is theoretically guaranteed to converge to the target, but in finite time on hard distributions it may not. Always:
- Run multiple chains.
- Check R-hat.
- Check ESS.
- Inspect trace plots.
- Sanity-check posterior summaries against domain knowledge.

A model with bad MCMC diagnostics shouldn't be trusted, even if individual draws look reasonable.
