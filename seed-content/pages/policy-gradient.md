---
title: Policy Gradient
category: rl
---
<!-- tier:intro -->
# Policy Gradient

The family of RL algorithms that **directly optimize the policy** via gradient ascent on expected return. The foundation of modern actor-critic, PPO, RLHF.

The policy gradient theorem:

```
∇_θ J(θ) = E_{τ ~ π_θ} [Σ_t ∇_θ log π_θ(a_t | s_t) · A_t]
```

Sample trajectories. Compute `∇log π · A`. Average. Step.

<!-- tier:undergrad -->
# Policy Gradient (Undergrad)

## Why policy gradient

**Compared to value-based RL** (Q-learning): policy gradient methods scale to continuous action spaces (where `argmax Q` is intractable), naturally produce stochastic policies (essential in some games), and have smoother optimization landscapes.

**Compared to model-based RL**: no need to learn dynamics; just collect data and optimize.

**Cost**: high variance estimators. Policy gradient signal depends on full-trajectory returns, which have high variance even for fixed policies.

## The log-derivative trick

The key derivation:

```
∇ E_{τ ~ p_θ}[R(τ)] = ∇ ∫ p_θ(τ) R(τ) dτ
                    = ∫ ∇ p_θ(τ) R(τ) dτ
                    = ∫ p_θ(τ) ∇log p_θ(τ) R(τ) dτ
                    = E[∇log p_θ(τ) · R(τ)]
```

For an MDP, `log p_θ(τ) = log p(s_0) + Σ log π_θ(a_t|s_t) + Σ log P(s_{t+1}|s_t, a_t)`. Only the policy term depends on `θ`. So:

```
∇_θ E[R(τ)] = E[Σ_t ∇log π_θ(a_t|s_t) · R(τ)]
```

The dynamics terms vanish — we never need to differentiate through `P`. This is what makes policy gradient implementable in environments where `P` is unknown.

## Variance reduction tricks

**Reward-to-go**: only sum rewards from time `t` onward, not the full episode return. Reduces variance because earlier rewards are independent of later actions.

**Baseline subtraction**: replace `R(τ)` with `R(τ) - b(s_t)` for any state-dependent baseline `b`. Doesn't change the expected gradient (the baseline term integrates to zero) but reduces variance. Optimal `b` is `V^π(s_t)`.

**Advantage**: combining the above gives the advantage estimator `A_t = Q^π(s_t, a_t) - V^π(s_t)`. Most modern algorithms use this.

**[[gae|Generalized Advantage Estimation (GAE)]]**: a `λ`-weighted sum of n-step TD residuals. The de-facto advantage estimator in PPO and modern actor-critic.

<!-- tier:grad -->
# Policy Gradient (Grad)

## Importance sampling and off-policy variants

Vanilla policy gradient is on-policy: data must come from the current policy. Importance sampling allows reusing data from previous policies:

```
∇J ≈ E_{τ ~ π_old} [(π_θ(a|s) / π_old(a|s)) · ∇log π_θ · A]
```

The ratio `π_θ / π_old` corrects for the distribution shift. PPO and TRPO formalize this with trust-region constraints (so the ratio doesn't blow up) and the clipping trick.

## Natural gradient

Standard gradient ascent uses Euclidean geometry on `θ`. **Natural gradient** uses the Fisher information matrix as a metric, giving updates that are invariant to reparameterization of `π_θ`:

```
θ ← θ + α · F^{-1} ∇J
```

where `F` is the Fisher of `π_θ`. Empirically, natural gradient + policy gradient is more sample-efficient and stable. TRPO uses an approximation (conjugate gradient on `F^{-1} ∇J`); PPO drops it but recovers similar empirical behavior via clipping.

## Determinism in deterministic policy gradient

For continuous-action policies, the **deterministic policy gradient theorem** (Silver 2014) gives:

```
∇_θ J(θ) = E[∇_θ μ_θ(s) · ∇_a Q^μ(s, a) |_{a=μ(s)}]
```

The gradient of `Q` w.r.t. action is computed via backprop through `Q^μ`. This is **DDPG** (Lillicrap 2015): a deterministic actor + a `Q` critic. Off-policy, sample-efficient on continuous control.

DDPG and its successors (TD3, SAC) are the value-flavored cousins of PPO. SAC adds a maximum-entropy objective; TD3 adds twin Q networks for bias reduction. For continuous control, SAC has dominated benchmarks since 2018.

## Connection to RLHF

Modern RLHF (ChatGPT, Claude) is policy gradient + PPO + a learned reward model + KL constraint. The 'environment' is the prompt distribution; the 'reward' is the RM's score; the 'episode' is generating one response. The full PG machinery — log-derivative trick, importance sampling, GAE, clipping — is what runs under the hood when you fine-tune an LLM via RLHF.
