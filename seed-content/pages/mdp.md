---
title: Markov Decision Process (MDP)
category: rl
---
<!-- tier:intro -->
# Markov Decision Process

The mathematical substrate of reinforcement learning. An MDP is the formalism every RL algorithm operates on.

An MDP is a tuple `(S, A, P, R, γ)`:
- **S**: state space.
- **A**: action space.
- **P(s' | s, a)**: transition dynamics.
- **R(s, a)**: reward function.
- **γ ∈ [0, 1)**: discount factor.

A policy `π(a | s)` is the agent's strategy. The goal is to find a policy that maximizes the expected discounted return `E[Σ γ^t r_t]`.

<!-- tier:undergrad -->
# MDP (Undergrad)

## Components in detail

**States** are what the agent observes. They can be finite (a 5×5 gridworld has 25 states), countably infinite (positions on an unbounded grid), or continuous (joint angles of a robot). For algorithms to work, the state must satisfy the [[markov-property]] — the next state depends only on the current state and action, not on the history.

**Actions** are what the agent can do. Discrete (move N/S/E/W) or continuous (`R^d`). The action space's structure has algorithmic implications: tabular Q-learning works for small discrete; PPO + Gaussian policy is standard for continuous.

**Transitions** `P(s' | s, a)` are the environment's stochastic dynamics. Sometimes given (gridworld with explicit movement rules), sometimes only sampled (the simulator gives you `s'` after an action but you don't see the underlying probability). When `P` is known, you can do dynamic programming. When only sampled, you do model-free RL or learn `P`.

**Reward** `R(s, a)` is the only feedback signal. Reward design is the dark art of RL — a poorly-designed reward yields reward hacking.

**Discount** `γ` is a modeling choice. Lower `γ` → myopic; higher → patient. Typical 0.99 for game-playing, 0.95-0.99 for control, lower for short-horizon problems.

## Episodic vs continuing

- **Episodic**: trajectories terminate (game over, goal reached, time limit). Returns are finite without discounting.
- **Continuing**: no termination. Discount is mathematically necessary for finite expected return; encodes how much the agent cares about distant future.

## Optimal policy

The goal of every RL algorithm: find `π*` maximizing `E[Σ γ^t r_t]`. In tabular MDPs, the optimal policy is unique among deterministic policies (or a unique distribution among stochastic). Real-world RL approximates `π*` via function approximation.

<!-- tier:grad -->
# MDP (Grad)

## POMDPs

Real environments rarely satisfy the Markov property on raw observations. **Partially Observable MDPs (POMDPs)** generalize: the agent observes `o_t` from a noisy projection of the true `s_t`. The agent must track a belief state — a distribution over `s` given the observation history.

POMDPs are theoretically harder; planning is often intractable. Practical workaround: enrich the observation with sufficient history to make the Markov property approximately hold (RNN policies, transformer policies over the full trajectory). This is what most modern RL does in 'partially observable' settings — pretend it's an MDP with a richer state.

## Bellman equation

The single most important consequence of the MDP framework: every optimal value function `V*` and `Q*` satisfies the [[bellman-equation]]:

```
V*(s) = max_a [R(s,a) + γ · E[V*(s')]]
```

This recursion is what makes RL tractable. Solving the MDP becomes solving (or approximating) this equation.

## Average-reward MDPs

For continuing tasks where `γ → 1` is awkward, the **average-reward** formulation maximizes `lim_T (1/T) Σ r_t`. Used in queue control, ergodic environments. Most algorithms have an average-reward variant; the discounted formulation is more common in deep RL.
