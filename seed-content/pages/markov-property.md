---
title: Markov Property
category: rl
---
<!-- tier:intro -->
# Markov Property

A process satisfies the **Markov property** when the next state depends only on the current state and action, not on the history:

`P(s_{t+1} | s_t, a_t, s_{t-1}, a_{t-1}, ...) = P(s_{t+1} | s_t, a_t)`

This is what makes the math of RL tractable. The Bellman equation, value iteration, dynamic programming all assume it. When the assumption holds, RL works cleanly. When it doesn't, you need POMDP-aware methods or you enrich the state until it does.

<!-- tier:undergrad -->
# Markov Property (Undergrad)

## Why the property matters

Without the Markov property, the state `s_t` doesn't summarize everything relevant about the past. The optimal action might depend on what happened 5, 50, or 500 steps ago. There's no compact value function `V(s_t)` because the value depends on the full history.

With the property, value functions are well-defined: `V(s)` is uniquely determined by `s` (and the policy). Tabular algorithms work. Bellman backups converge. Dynamic programming applies.

The property is a **modeling choice**, not a fact about reality. You decide what to call the 'state', and that decision determines whether your formulation is Markov.

## Examples

**Markov by construction**:
- Chess: the current board position (plus castling rights, en passant, halfmove clock) tells you everything you need.
- Gridworld: the current position is enough.

**Not naively Markov**:
- A robot's instantaneous joint angles. To predict the next state, you also need joint velocities — they encode momentum.
- A poker hand: you need the betting history to play optimally.
- A stock-trading agent: instantaneous price isn't enough; recent volatility, trend, news matter.

The pattern: **enrich the state** until the property holds. Include velocity. Include the betting history. Include moving averages and recent news.

## What if it can't be made Markov?

Sometimes you can't pack enough into the state — the agent only observes part of the world (POMDP). Practical fixes:

1. **Stack frames** (Atari): use the last 4 frames as the state instead of just one. Recovers velocity information.
2. **RNN/LSTM policies**: let the agent maintain its own hidden state that integrates history.
3. **Transformer policies over the trajectory**: the entire trajectory is the input.

Each effectively extends what counts as 'state'. Modern deep RL on partially-observable problems just uses these workarounds and pretends the result is Markov.

<!-- tier:grad -->
# Markov Property (Grad)

## Hidden Markov Models and POMDPs

A POMDP `(S, A, O, P, R, Z)` adds an observation function `Z(o | s, a)`. The agent observes `o_t` (a function of `s_t` plus noise). True optimal policies depend on the **belief state** — a posterior over `s` given the observation history.

Belief state algorithms (POMDP value iteration, point-based methods like PBVI, SARSOP) explicitly track and plan over beliefs. Computationally expensive; tractable only for small POMDPs.

For deep RL, recurrent or attention-based policies *implicitly* learn a belief state in their hidden activations. Theory is shakier; empirical results are good. Most "partially observable" deep RL is in this regime.

## When the property silently fails

A common subtle bug: you think your environment is Markov but it isn't. Example: a multi-agent setting where you control one agent and others are also learning. From your agent's perspective, the environment is **non-stationary** (other policies change over time), so the optimal policy depends on what step you're at, not just the current state.

Detection: train, achieve apparent convergence, run on out-of-distribution states or longer episodes than training. If performance degrades dramatically, the Markov assumption likely failed during training and the policy memorized something it shouldn't have.

Fix: explicitly model what's making it non-Markov (the other agents' policies; the time elapsed) and either include it in the state or use a method robust to it (multi-agent RL algorithms, meta-RL).
