---
title: Policy Iteration
category: rl
---
<!-- tier:intro -->
# Policy Iteration

A dynamic-programming algorithm for solving MDPs that alternates between two phases:

1. **Policy evaluation**: compute `V^π` for the current policy.
2. **Policy improvement**: update `π` to be greedy with respect to `V^π`.

Repeat until the policy stops changing. Guaranteed to converge to the optimal policy in finite MDPs.

<!-- tier:undergrad -->
# Policy Iteration (Undergrad)

## Algorithm

```
π = arbitrary initial policy
repeat:
    # Policy evaluation: solve V^π = T_π V^π
    V = solve V_new = T_π V         (iterate Bellman operator until convergence)
    
    # Policy improvement
    π_new[s] = argmax_a Σ_{s'} P(s'|s,a) [R + γ V(s')]
    
    if π_new == π: break
    π = π_new
```

## Why it converges

**Policy improvement theorem**: `V^{π_new}(s) ≥ V^π(s)` for all `s`, with equality iff `π` is already optimal.

Each outer iteration produces a strictly better policy unless we've already found `π*`. In a finite MDP, there are only `|A|^|S|` deterministic policies. Policy iteration must terminate at `π*` in at most that many iterations — typically far fewer.

## Trade-off vs value iteration

- **Policy iteration**: few outer iterations (often just a handful), but each requires a full inner policy-evaluation loop.
- **Value iteration**: more outer iterations, but each is just one Bellman update.

For most problems, value iteration is faster wall-clock. Policy iteration is conceptually clean — the explicit separation between evaluation and improvement is pedagogically nice and recurs as the actor-critic split in modern deep RL.

## Generalized policy iteration

The boundary blurs in practice. **Generalized Policy Iteration (GPI)** is the umbrella term for algorithms that interleave evaluation and improvement at any granularity:

- Value iteration: one improvement step per evaluation step.
- Policy iteration: full evaluation, then improvement.
- Modified policy iteration: `k` evaluation steps, then improvement.
- TD methods: continuous evaluation + improvement on every transition.

All are GPI. Sutton & Barto argue this is the unifying frame for almost all of RL.

<!-- tier:grad -->
# Policy Iteration (Grad)

## Connection to actor-critic

Modern actor-critic methods (A2C, PPO) are a stochastic approximation of policy iteration:

- The **critic** does (partial) policy evaluation: estimate `V^π`.
- The **actor** does policy improvement: shift `π_θ` toward higher-value actions via gradient ascent on advantages.

The split is the same; the differences are scale and approximation. Tabular policy iteration uses exact Bellman backups; actor-critic uses sampled, function-approximated, gradient-based updates.

## Convergence in deep RL

Tabular policy iteration provably reaches `π*`. Actor-critic with neural networks doesn't have a clean convergence theorem. Three reasons:

1. **Function approximation** doesn't have the closed-form fixed-point structure of tabular updates.
2. **Sampled updates** introduce variance.
3. **Concurrent updating** of actor and critic creates a moving target.

In practice, careful engineering (target networks, trust region constraints in PPO, experience replay) keeps things stable enough to converge to good policies. The lack of formal guarantees is why deep RL is empirical.

## When to prefer policy iteration

- **Small discrete MDPs** with known dynamics: policy iteration can solve to optimality in 5-10 outer iterations.
- **Educational settings**: the explicit eval-improve split is conceptually clean.
- **Hybrid methods**: model-based RL often uses policy iteration on a learned model (e.g., Dreamer's actor-critic on imagined rollouts).

In modern deep RL practice, you almost never write 'policy iteration' literally — it's hidden inside actor-critic.
