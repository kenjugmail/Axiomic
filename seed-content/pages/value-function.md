---
title: Value Function
category: rl
---
<!-- tier:intro -->
# Value Function

A value function answers: *how good is it to be in state s, given a policy π?*

Two flavors:

- **State value `V^π(s)`**: expected discounted return from `s` following `π`.
- **Action value `Q^π(s, a)`**: expected discounted return from `s` taking action `a`, then following `π`.

The two are related: `V^π(s) = Σ_a π(a|s) · Q^π(s, a)`.

A value function is defined relative to a policy. Different policies → different values. The optimal value functions `V*` and `Q*` are the maxima over all policies.

<!-- tier:undergrad -->
# Value Function (Undergrad)

## Formal definition

```
V^π(s) = E_π[Σ_t γ^t r_t | s_0 = s]
Q^π(s, a) = E_π[Σ_t γ^t r_t | s_0 = s, a_0 = a]
```

The expectation is over the randomness in transitions and (if `π` is stochastic) action sampling.

## Why two flavors?

`V` is sufficient when you have the model — given `V*`, you can compute the optimal action by one-step lookahead:

```
π*(s) = argmax_a Σ_{s'} P(s'|s,a) [R + γ V*(s')]
```

`Q` is more useful for **model-free** methods. `Q*(s, a)` directly tells you the value of an action without needing to know `P`. The optimal policy is just `argmax_a Q*(s, a)` — no model required. This is why Q-learning is the foundation of model-free value-based RL.

## The optimal value function

`V*(s) = max_π V^π(s)` and `Q*(s, a) = max_π Q^π(s, a)`. The optimal policy `π*` is greedy w.r.t. `Q*`.

In tabular MDPs, `V*` and `Q*` are unique (across the right space) and reachable via [[value-iteration]] or [[policy-iteration]]. With function approximation, we can only approximate them.

## How value functions are estimated

Two paradigms:

1. **Model-based**: solve the [[bellman-equation]] directly via value iteration / policy iteration. Requires `P` and `R`.

2. **Model-free**: estimate from samples via TD learning ([[td-learning]], [[q-learning]]) or Monte Carlo. Requires only the ability to interact with the environment.

Modern deep RL combines: parameterize `V` (or `Q`) as a neural network; train via TD updates from sampled transitions; deploy at scale.

<!-- tier:grad -->
# Value Function (Grad)

## Advantage function

```
A^π(s, a) = Q^π(s, a) - V^π(s)
```

The **advantage** measures how much better than average it is to take action `a` in `s`. Subtracting `V^π(s)` (the same baseline regardless of action) doesn't change which action is best but shrinks the dynamic range. Used as a variance-reduction technique in policy gradient methods.

GAE (Generalized Advantage Estimation) computes a `λ`-weighted estimator of `A` that interpolates between TD and Monte Carlo. Standard in PPO.

## Beyond V and Q

- **Distributional value functions** (C51, QR-DQN): instead of `Q(s, a)` as a scalar mean, learn the full *distribution* of returns. Captures risk; gives gradient signal even when expected returns are similar.
- **Hindsight value functions**: condition the value on a goal state. Useful for goal-conditioned RL and HER (hindsight experience replay).
- **Successor features** (Dayan 1993, Barreto 2017): decompose the value into a feature representation × reward weights. Enables transfer learning across tasks with the same dynamics but different rewards.

The takeaway: `V` and `Q` are the basic value functions, but the framework generalizes. Most modern RL papers can be understood as some variation on 'how do we learn or represent value'.
