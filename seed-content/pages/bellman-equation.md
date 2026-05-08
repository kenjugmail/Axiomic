---
title: Bellman Equation
category: rl
---
<!-- tier:intro -->
# Bellman Equation

The fundamental recursive identity of RL: a state's value equals the immediate reward plus the discounted value of where you end up next.

For a policy `π`:
```
V^π(s) = Σ_a π(a|s) · Σ_{s'} P(s'|s,a) [R(s,a,s') + γ V^π(s')]
```

For the optimal policy:
```
V*(s) = max_a Σ_{s'} P(s'|s,a) [R(s,a,s') + γ V*(s')]
```

Every value-based RL algorithm — value iteration, Q-learning, DQN — solves (or approximates) one of these equations.

<!-- tier:undergrad -->
# Bellman Equation (Undergrad)

## The Bellman operator

Define the **Bellman operator** `T` (for a policy `π`):

```
(TV)(s) = Σ_a π(a|s) · Σ_{s'} P(s'|s,a) [R + γ V(s')]
```

The Bellman equation says `V^π = T V^π` — the value function is a fixed point of `T`.

**Key property**: `T` is a `γ`-contraction in sup norm. That is:
```
‖TV - TV'‖_∞ ≤ γ · ‖V - V'‖_∞
```

By the Banach fixed-point theorem:
1. There's a unique fixed point (which is `V^π`).
2. Iterating from any starting point converges geometrically to `V^π`.

Same property for the optimal Bellman operator `T*` (with `max_a` instead of `Σ_a π`). Iterating `T*` from any starting `V_0` converges to `V*` at rate `γ`.

This is what makes RL algorithms work. Without contraction, no convergence. With it, you can prove that value iteration, Q-learning, and TD learning all reach the right answer.

## TD-error as Bellman residual

For sampled data, the Bellman equation manifests as the **TD error**:

```
δ_t = r_t + γ V(s_{t+1}) - V(s_t)
```

This is `(TV)(s_t) - V(s_t)` evaluated on a single sample. When `V = V^π`, `E[δ_t | s_t] = 0`. Reducing TD error (in expectation) drives `V` toward `V^π`.

The Bellman residual is the universal training signal. Q-learning minimizes it; PPO uses it inside GAE; RLHF's reward model trains on it indirectly. Once you see the Bellman equation, you see it everywhere.

## Convergence rate

To reach `‖V_k - V*‖_∞ ≤ ε`, you need:
```
k ≥ log(1/ε) / log(1/γ) ≈ log(1/ε) · 1/(1-γ)
```

With `γ = 0.99`, that's ~459 iterations for `ε = 0.01`. With `γ = 0.95`, ~90. With `γ = 0.9`, ~44. Higher `γ` (long-horizon problems) needs more iterations.

<!-- tier:grad -->
# Bellman Equation (Grad)

## Connection to dynamic programming

The Bellman equation is the recursive structure of all dynamic programming. The same idea appears in:
- Shortest path on graphs (Dijkstra is a special case).
- Optimal control theory (continuous-time HJB equation is the continuous analog).
- Sequence alignment (Smith-Waterman is a Bellman backup over alignment states).

Every problem with the form 'optimal value of being in state s = best one-step decision + value of resulting state' is amenable to Bellman-equation reasoning.

## Function approximation breaks contraction

When `V_θ` is a neural network rather than a table, the contraction property no longer holds in general. The Bellman backup followed by projection onto the function class can be expansive — leading to divergence (the deadly triad). DQN's target network + experience replay are engineering tricks that empirically restore stability without restoring formal contraction.

This is why deep RL is harder than tabular RL: the theoretical guarantees of tabular Bellman-equation iteration don't transfer cleanly to the function-approximation regime. Modern deep RL is empirical engineering on top of a theoretical framework that strictly speaking only justifies the tabular case.

## Bellman optimality and policy improvement

The Bellman optimality equation has a `max_a`:

```
V*(s) = max_a [R(s,a) + γ E[V*(s')]]
```

The argmax of this is the optimal action. **Policy improvement theorem**: given any policy `π` and its value function `V^π`, the policy `π'(s) = argmax_a Q^π(s, a)` is at least as good as `π` everywhere — and strictly better unless `π` is already optimal.

This is the engine of policy iteration: alternate between evaluating a policy (computing `V^π`) and improving it (greedy w.r.t. `Q^π`). Guaranteed to terminate at the optimal policy in finite MDPs.
