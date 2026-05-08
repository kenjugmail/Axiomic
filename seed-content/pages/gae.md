---
title: Generalized Advantage Estimation (GAE)
category: rl
---
<!-- tier:intro -->
# Generalized Advantage Estimation (GAE)

The de-facto advantage estimator for modern policy gradient methods. PPO, A2C, RLHF — all use GAE.

GAE estimates the advantage `A_t = Q^π(s_t, a_t) - V^π(s_t)` as a `λ`-weighted sum of TD residuals:

```
δ_t = r_t + γ V(s_{t+1}) - V(s_t)
A_t^GAE = Σ_{l=0}^∞ (γλ)^l δ_{t+l}
```

The `λ` parameter interpolates between low-bias-high-variance Monte Carlo and high-bias-low-variance TD(0). Typical: `λ = 0.95`.

<!-- tier:undergrad -->
# GAE (Undergrad)

## The intuition

Plain REINFORCE uses `G_t` (the actual return) as the policy-gradient signal. High variance.

TD(0) bootstrapping replaces `G_t` with `r_t + γ V(s_{t+1})`. Lower variance, but biased — the bootstrap value `V(s_{t+1})` is approximate.

`n`-step returns `G_t^{(n)} = r_t + γ r_{t+1} + ... + γ^{n-1} r_{t+n-1} + γ^n V(s_{t+n})` interpolate. Larger `n` → less bias, more variance. Smaller `n` → more bias, less variance.

GAE generalizes: instead of picking one `n`, take a weighted sum across all `n`-step returns with weights `(1-λ) λ^{n-1}`. This gives:

```
A_t^GAE = Σ_l (γλ)^l · δ_{t+l}
```

`λ = 1`: pure Monte Carlo. `λ = 0`: pure TD(0). `λ = 0.95`: a useful middle ground.

## Implementation

```python
def compute_gae(rewards, values, dones, γ=0.99, λ=0.95):
    advantages = torch.zeros_like(rewards)
    gae = 0
    for t in reversed(range(len(rewards))):
        if t == len(rewards) - 1:
            next_value = values[t]  # bootstrap from last value
        else:
            next_value = values[t + 1]
        delta = rewards[t] + γ * next_value * (1 - dones[t]) - values[t]
        gae = delta + γ * λ * (1 - dones[t]) * gae
        advantages[t] = gae
    return advantages
```

Five lines. Plug into PPO; you're done.

## Why λ matters

Tuning `λ`:
- **λ = 1.0** (pure MC): unbiased but variance grows linearly with episode length. Works on short episodes.
- **λ = 0.95-0.97**: standard recipe. Balances variance reduction with bias from bootstrap.
- **λ = 0.5-0.8**: when the value function is well-trained, can lean more on bootstrapping. Lower variance.
- **λ = 0.0** (pure TD(0)): biased but fast. Used in DDPG/SAC where the critic is reliable.

In practice, tune `γ` first (it's the more important hyperparameter), then sweep `λ` if needed. Most published recipes work fine at the defaults.

<!-- tier:grad -->
# GAE (Grad)

## Connection to TD(λ) / eligibility traces

GAE is mathematically the policy-gradient analog of TD(λ) with eligibility traces. The same `λ` parameter, the same exponentially-decaying weights, the same bias-variance trade-off. The only difference is GAE applies it to advantage estimation specifically; TD(λ) applies to value function estimation.

This is why GAE feels like 'PPO does eligibility traces' — it is, just in the gradient signal rather than the value update.

## Why GAE matters more in deep RL than tabular

In tabular settings, the value function `V^π` can be computed exactly (with enough samples). The bias from bootstrapping isn't a major concern; pure TD works fine.

In deep RL, `V_φ` is approximate; bootstrapping introduces both bias (from `V_φ` being wrong) and instability (from the bootstrap target moving). GAE's `λ` lets you tune how much you trust `V_φ` vs how much you fall back to the actual returns.

For an under-trained critic, lean toward `λ = 1` (more MC). For a well-trained critic, lean toward lower `λ` (more bootstrapping). Modern recipes default to `0.95` because it's a reasonable middle ground that usually works.

## Variance comparison

Empirical measurements (Schulman 2015): GAE with `λ = 0.95` reduces gradient variance by 10-100× compared to Monte Carlo on continuous-control tasks. The effect compounds — lower variance means stable training with larger batch sizes, faster convergence per epoch, better final policies.

This isn't a marginal improvement. It's the difference between PPO 'just working' and 'kind of working sometimes'. GAE is one of the most important practical contributions to modern RL.
