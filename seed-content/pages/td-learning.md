---
title: Temporal Difference Learning
category: rl
---
<!-- tier:intro -->
# Temporal Difference (TD) Learning

The model-free engine of reinforcement learning. TD methods estimate value functions from samples without knowing transition dynamics or rewards.

The TD(0) update for state value:
```
V(s) ← V(s) + α · [r + γ V(s') - V(s)]
```

The bracketed term is the **TD error** — the Bellman residual evaluated on a single sample. Reducing it (in expectation) drives `V` toward `V^π`.

<!-- tier:undergrad -->
# TD Learning (Undergrad)

## TD vs Monte Carlo

Two ways to estimate `V^π(s)`:

**Monte Carlo (MC)**: roll out an episode, observe the actual return `G_t`. Update `V(s) ← V(s) + α(G_t - V(s))`. Unbiased but high variance; needs episodes to terminate; slow updates.

**TD(0)**: use a one-step bootstrap: `V(s) ← V(s) + α(r + γ V(s') - V(s))`. Biased (uses current possibly-wrong `V(s')`) but lower variance; works in non-terminating environments; updates after every step.

The bias-variance trade-off here is the central tension in RL. TD is the practical winner.

## TD(λ) — interpolation

`TD(λ)` blends the two with eligibility traces. For `λ=0`, pure TD(0). For `λ=1`, equivalent to MC. For intermediate, a useful middle ground.

The n-step return:
```
G_t^{(n)} = r_t + γ r_{t+1} + ... + γ^{n-1} r_{t+n-1} + γ^n V(s_{t+n})
```

`TD(λ)` is a `λ`-weighted sum over all `n`-step returns. Empirically, `λ ≈ 0.9-0.95` often outperforms both extremes. GAE in policy gradient methods is the modern incarnation of this idea.

## SARSA vs Q-learning

For action values:

**SARSA** (on-policy):
```
Q(s,a) ← Q(s,a) + α [r + γ Q(s', a') - Q(s, a)]
```
where `a'` is the action actually taken by the behavior policy.

**Q-learning** (off-policy):
```
Q(s,a) ← Q(s,a) + α [r + γ max_{a'} Q(s', a') - Q(s, a)]
```
The `max` makes it bootstrap off the *optimal* next action, regardless of what the behavior policy does. This makes Q-learning learn about `π*` while exploring with any (sufficiently exploratory) behavior policy.

## Convergence

In tabular settings, both SARSA and Q-learning provably converge to `Q^π` (SARSA) or `Q*` (Q-learning) under standard conditions:
- All state-action pairs visited infinitely often.
- Learning rate `α_t` satisfies the Robbins-Monro conditions: `Σ α_t = ∞`, `Σ α_t² < ∞`.

In practice: decay `α` slowly to zero, ensure `ε`-greedy exploration with `ε > 0`, and the algorithms converge.

<!-- tier:grad -->
# TD Learning (Grad)

## DQN — TD with neural networks

[[q-learning]] with function approximation is unstable. DQN's three tricks (experience replay, target network, mini-batch updates) restore practical stability:

```
L(θ) = E[(r + γ max_{a'} Q_{θ⁻}(s', a') - Q_θ(s, a))²]
```

The target uses `θ⁻`, a slow-updating copy of `θ`. The expectation is over uniform samples from a replay buffer, not the latest trajectory. Stochastic gradient descent on this loss is approximately a sampled, projected Bellman backup.

Without these tricks, DQN famously diverges. With them, it solves Atari from raw pixels — the result that launched modern deep RL.

## Maximization bias

`max_{a'} Q(s', a')` is upward-biased when `Q` is noisy: `E[max] ≥ max E`. The bias compounds over long horizons.

**Double Q-learning** (van Hasselt 2010): keep two `Q` networks. Use one to *select* the next action, the other to *evaluate* it:

```
target = r + γ · Q_{B}(s', argmax_{a'} Q_A(s', a'))
```

Decoupling selection from evaluation removes the maximization bias. Standard in modern DQN variants (Double DQN, Rainbow).

## Eligibility traces

`TD(λ)` with eligibility traces propagates credit backward more efficiently:

```
e_t(s) = γ λ e_{t-1}(s) + 1[s_t = s]    # eligibility trace
V(s) ← V(s) + α · δ_t · e_t(s)            # update all states with non-zero trace
```

Each TD error updates not just the current state but all recently-visited states, weighted by their eligibility. Mathematically equivalent to TD(λ) under certain conditions; computationally cheaper than computing `n`-step returns explicitly.

Modern deep RL with replay buffers usually uses `n`-step returns directly rather than eligibility traces — simpler implementation, similar effect.
