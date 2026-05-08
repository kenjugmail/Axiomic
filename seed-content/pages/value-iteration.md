---
title: Value Iteration
category: rl
---
<!-- tier:intro -->
# Value Iteration

The simplest dynamic-programming algorithm for solving an MDP. Initialize `V_0` arbitrarily, then iterate:

```
V_{k+1}(s) = max_a Σ_{s'} P(s'|s,a) [R(s,a,s') + γ V_k(s')]
```

This is just applying the optimal Bellman operator `T*` repeatedly. Each iteration brings `V_k` a factor `γ` closer to `V*`. After ~`log(1/ε)/log(1/γ)` iterations, you have an `ε`-accurate `V*`.

<!-- tier:undergrad -->
# Value Iteration (Undergrad)

## Algorithm

```
V[s] = 0 for all s ∈ S
repeat:
    V_new[s] = max_a Σ_{s'} P(s'|s,a) [R(s,a,s') + γ V[s']]   for all s
    if max_s |V_new[s] - V[s]| < tolerance: break
    V = V_new

# Extract policy
π[s] = argmax_a Σ_{s'} P(s'|s,a) [R + γ V[s']]
```

## Cost analysis

Per iteration: for each state, for each action, sum over next states. `O(|S|² · |A|)`. Tractable for small `|S|`; impossible for image-based observations.

## Stopping criterion

The Bellman contraction lets you bound distance to `V*`:

```
‖V_k - V*‖_∞ ≤ γ · ‖V_k - V_{k-1}‖_∞ / (1 - γ)
```

So if consecutive iterates differ by `δ`, you're within `γ · δ / (1-γ)` of `V*`. With `γ=0.95` and `δ=1e-4`, that's a ~2e-3 bound. Stop when this is small enough.

## Asynchronous value iteration

Standard ('synchronous') value iteration updates all states in lockstep — uses `V_k` to compute `V_{k+1}`. **Asynchronous** updates one state at a time, using the latest values for others (Gauss-Seidel style). Often converges faster in practice. Modern dynamic programming libraries default to async.

<!-- tier:grad -->
# Value Iteration (Grad)

## Connection to deep RL

DQN is **value iteration with a neural network** approximating `Q`. The update is:

```
Q_θ(s, a) ← Q_θ(s, a) + α · [r + γ max_a' Q_{θ⁻}(s', a') - Q_θ(s, a)]
```

The target `r + γ max_a' Q_{θ⁻}(s', a')` is the Bellman backup; the gradient step takes `Q_θ(s, a)` toward it. Same mathematical structure as tabular value iteration; different optimization machinery.

DQN's stabilization tricks — target network, experience replay — exist because applying value iteration with neural-net function approximation breaks the contraction guarantee. They mitigate the failure modes empirically without restoring formal convergence.

## Modified policy iteration

A hybrid: do `k` Bellman backups for the current policy (partial policy evaluation), then improve the policy, repeat. With `k=1`, this is equivalent to value iteration; with `k=∞`, equivalent to policy iteration. Modern dynamic programming libraries often use intermediate `k` for the best of both — fewer outer iterations than value iteration, less inner work than full policy iteration.

## When value iteration fails to converge

In theory it always converges (γ-contraction). In practice, with sampled (model-free) Bellman backups + function approximation, three failure modes:

- **The deadly triad**: function approximation + bootstrapping + off-policy data → divergence.
- **Maximization bias**: `max` over noisy `Q` estimates is positively biased. Double Q-learning addresses this.
- **Distribution shift**: as policy improves, the data distribution it samples changes. Stale samples in a replay buffer can lead to poor updates.

These all require engineering fixes (target network, double-Q, prioritized replay) that have no clean theoretical analog in tabular value iteration.
