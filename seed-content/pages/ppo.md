---
title: Proximal Policy Optimization (PPO)
category: rl
---
<!-- tier:intro -->
# PPO

The most-deployed RL algorithm of the 2020s. Used in OpenAI Five (Dota), AlphaStar, RLHF for ChatGPT/Claude, robotic locomotion, and most academic deep RL benchmarks.

PPO's core innovation: a **clipped surrogate objective** that bounds how much the policy can change per update without requiring an explicit KL constraint or natural gradient.

```
L^CLIP(θ) = E[min(r_t(θ) · A_t, clip(r_t(θ), 1-ε, 1+ε) · A_t)]
```

where `r_t(θ) = π_θ(a_t|s_t) / π_old(a_t|s_t)` is the importance ratio.

<!-- tier:undergrad -->
# PPO (Undergrad)

## The clipped surrogate, in detail

For a fixed `(s_t, a_t, A_t)`, the PPO loss as a function of `r = π_θ / π_old`:

- If `A > 0` (good action): we want `r > 1` (more probability on this action). The surrogate `r · A` would keep growing, but `clip(r, 1-ε, 1+ε) · A` caps at `(1+ε) · A`. The `min` picks the smaller — so we benefit from `r > 1` only up to `(1+ε)`.
- If `A < 0` (bad action): we want `r < 1` (less probability). The clip caps at `(1-ε)·A`. The `min` picks the smaller — so we benefit from `r < 1` only down to `(1-ε)`.

Net effect: the policy can't move further than `±ε` away from the previous policy in importance ratio space, regardless of how large the gradient signal is. This is a soft trust region.

## Full PPO objective

```
L_PPO = L_CLIP - c1 · L_value + c2 · L_entropy
```

Components:
- `L_CLIP`: the clipped policy loss above.
- `L_value`: regression loss for the critic. `((V_φ - returns)²).mean()`.
- `L_entropy`: encourages policy stochasticity. `-H(π_θ)`.

Default hyperparameters (PPO paper):
- `ε = 0.2` (clip range)
- `c1 = 0.5` (value loss weight)
- `c2 = 0.01` (entropy bonus weight)
- `γ = 0.99`, `λ = 0.95` for GAE
- 4-10 epochs per data batch
- Mini-batch size 64-256
- Learning rate 3e-4
- Gradient clipping at norm 0.5

## Why PPO works

Three properties:

1. **Trust region without natural gradient**: TRPO's KL constraint required conjugate gradient + line search. PPO's clip achieves similar behavior with first-order optimization. Much simpler implementation.

2. **Multiple epochs per data batch**: the clip prevents the policy from drifting too far from the data distribution within an epoch, making 4-10 gradient steps per rollout safe. This is several-fold sample efficiency gain over single-step methods.

3. **Robust to hyperparameter choice**: ε = 0.2 works across continuous control, Atari, and RLHF without tuning. TRPO's KL target requires per-task tuning; SAC's temperature requires per-task tuning. PPO largely doesn't.

## CartPole in 100 lines

A fully-functional PPO is implementable in ~100 lines of PyTorch (CleanRL's `ppo.py` is the reference). Most of the difficulty is in hyperparameter tuning and the implementation details that vary across forks.

<!-- tier:grad -->
# PPO (Grad)

## Implementation details that matter

PPO is notorious for performance-sensitive engineering details. The 'PPO37' work (Engstrom 2020) catalogs them:

1. **Advantage normalization** per minibatch: critical. Without it, large advantage magnitudes blow up gradients.
2. **Value loss clipping**: optional but stabilizing. Clip the value-function update similarly to the policy update.
3. **Orthogonal initialization**: weights initialized as orthogonal matrices. Improves stability.
4. **Linear LR annealing**: linearly decay learning rate over training. Improves final performance.
5. **Action squashing for continuous**: use `tanh(N(μ, σ))` for bounded action spaces. Apply Jacobian correction to log-probability.
6. **Reward standardization**: standardize rewards online to keep the value scale stable. Sometimes clip extreme rewards.
7. **Gradient clipping at norm 0.5**: prevents extreme gradient updates from rare high-advantage states.

Different reference implementations make different choices on each. Performance can vary 10-30% between implementations. The 'CleanRL' or 'Stable-Baselines3' implementations are good starting points.

## PPO vs TRPO

TRPO has provable monotonic improvement under exact computation. PPO is empirical. In practice:

- TRPO's KL constraint requires natural gradient (Fisher × vector products) → conjugate gradient solver.
- PPO's clip is a stochastic gradient ascent on the surrogate objective. Standard optimizers (Adam) work directly.
- TRPO has roughly 5× more code, more hyperparameters (KL target, line-search backtracking ratio), and is harder to debug.

Empirically, PPO matches TRPO across RL benchmarks. The simplicity won.

## PPO in RLHF

Modern RLHF pipelines (ChatGPT, Claude) use PPO as the policy optimizer. The full setup:

```
Reward = RM(response) - β · KL(π_θ || π_SFT)
PPO updates π_θ to maximize reward.
```

The KL term keeps the policy close to a reference (the SFT model) — a second trust region on top of PPO's own clipping. RLHF is one of PPO's largest current applications, with billions of dollars of training compute.

## Failure modes

- **Mode collapse**: policy converges to a single high-reward action; entropy goes to zero. Increase entropy coefficient.
- **Value-function divergence**: value loss oscillates wildly. Lower learning rate or use value-loss clipping.
- **Reward hacking** (in RLHF): policy finds RM blind spots. Mitigate with KL penalty, ensembles, iterative RLHF.
- **Slow convergence on hard exploration**: PPO with default entropy doesn't explore enough on Montezuma. Add intrinsic rewards.

Each failure mode has known fixes; tracking which one is biting requires reading the loss curves.
