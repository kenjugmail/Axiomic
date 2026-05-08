---
title: REINFORCE
category: rl
---
<!-- tier:intro -->
# REINFORCE

The simplest possible policy-gradient algorithm. Williams 1992. Forms the conceptual ancestor of every modern policy-gradient method (A2C, PPO, RLHF).

The update:
```
θ ← θ + α · Σ_t ∇_θ log π_θ(a_t | s_t) · G_t
```

where `G_t` is the return from time `t`. Roll out an episode, compute returns, multiply by log-probabilities, ascend.

<!-- tier:undergrad -->
# REINFORCE (Undergrad)

## Algorithm

```
for episode in range(N):
    # Roll out
    states, actions, rewards = run_episode(π_θ)
    
    # Compute returns
    G = []
    g = 0
    for r in reversed(rewards):
        g = r + γ * g
        G.insert(0, g)
    
    # Optionally subtract baseline
    G = G - G.mean()  # crude baseline; better: V^π(s_t)
    
    # Update
    log_probs = π_θ.log_prob(actions, states)
    loss = -(log_probs * G).mean()
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
```

This is one page of code. Solves CartPole in a few hundred episodes. Doesn't scale to harder problems without variance-reduction tricks.

## Why it works

Each gradient step pushes `log π_θ(a|s)` up for actions with high return-to-go and down for actions with low return-to-go. Over many episodes, the policy becomes more likely to take high-reward actions in each state.

The expected gradient (over the policy's trajectory distribution) is `∇J(θ)` — the gradient of expected return. With enough samples, the empirical estimate is unbiased.

## High variance is the practical pain

A single episode's return depends on every random transition and every random action. The log-prob × return product is a *very* noisy signal. Two episodes with identical policy can give wildly different gradient estimates.

Without variance reduction, REINFORCE either fails to learn or learns very slowly. Modern policy gradient methods (A2C, PPO) all spend most of their machinery on variance reduction.

## The minimal upgrades to fix REINFORCE

In rough order of importance:

1. **Baseline subtraction**: replace `G_t` with `G_t - V^π(s_t)`. The optimal baseline. Half-orders-of-magnitude variance reduction. This *is* the actor-critic transition.
2. **Reward-to-go**: only sum rewards from `t` onward. (Already in the formula above.)
3. **Multiple parallel environments**: collect many episodes in parallel; average the gradient. Trivial scale-up.
4. **GAE**: a sophisticated multi-step advantage estimator. The standard advantage in PPO.
5. **Trust-region clipping**: PPO's clip on the importance ratio.

Each layer of fixes brings REINFORCE closer to PPO. PPO is REINFORCE + every variance-reduction trick + a clipped surrogate objective.

<!-- tier:grad -->
# REINFORCE (Grad)

## Variance bound

For a fixed policy, the variance of REINFORCE's gradient estimate scales as:

```
Var[∇J] ∝ E[‖∇log π‖² · G²]
```

`G` (return) variance grows with the trajectory length. `‖∇log π‖²` doesn't help. So REINFORCE's variance grows with horizon — long episodes → unworkable variance.

The reward-to-go formulation cuts the variance by reducing the number of irrelevant terms in `G`. Baselines cut it further. GAE's interpolation gives a tunable variance-bias trade-off.

## Connection to maximum-likelihood

REINFORCE's loss `-E[log π · G]` looks like a weighted MLE: examples where `G` is high are amplified; where `G` is negative, suppressed. This is the *intuition* — RL as supervised learning where the labels are weighted by how good they were.

The catch: the labels are produced *by the policy itself*. There's a feedback loop. As the policy improves, it samples better actions, and those weighted-MLE updates concentrate on better behaviors. The whole RL story is this self-improving loop, but the per-update math is just weighted likelihood maximization.

## Generalized REINFORCE (likelihood-ratio methods)

REINFORCE generalizes far beyond MDP RL. Any time you have a sampling distribution `p_θ` and want to maximize an expectation `E[f]`, the log-derivative trick gives `∇E[f] = E[f · ∇log p_θ]`. Applications:

- Variational inference: maximize ELBO via score-function gradients.
- Black-box optimization: optimize expectations of non-differentiable functions.
- Discrete latent variables: train through Bernoulli/categorical layers without reparameterization.

The pattern is the same. REINFORCE is the RL instance of a much broader principle.
