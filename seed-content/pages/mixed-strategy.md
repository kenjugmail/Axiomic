---
title: Mixed Strategy
category: game-theory
---
<!-- tier:intro -->
# Mixed Strategy

A **mixed strategy** is a probability distribution over pure strategies. Instead of committing to a single action, the player randomizes.

Mixed strategies become necessary when no pure-strategy [[nash-equilibrium]] exists. In rock-paper-scissors, any pure strategy can be exploited; only the uniform random mix (1/3, 1/3, 1/3) is stable.

**Indifference principle**: in a mixed Nash equilibrium, each player must be indifferent across all actions they play with positive probability. If one action paid strictly more, they'd play it pure.

<!-- tier:undergrad -->
# Mixed Strategy (Undergrad)

## Computing mixed equilibria

For 2-player games, find row's mix $p$ that makes column indifferent across column's actions in the support, and vice versa. Two equations, two unknowns (after normalization).

**Matching pennies** example. Row plays H with probability $p$, T with $1-p$. Column's expected payoff from H: $-p + (1-p) = 1 - 2p$. Column's expected payoff from T: $p - (1-p) = 2p - 1$. For indifference: $1 - 2p = 2p - 1 \Rightarrow p = 1/2$. Symmetric for column.

## Why randomize at all?

Two intuitions:
1. **Defensive**: against an adversary, randomization prevents being exploited. A predictable strategy in poker is a losing strategy.
2. **Indifference**: in equilibrium, *all actions in support pay the same*, so the choice of mix doesn't affect *your* payoff — but it constrains *opponents'* best-response. The mix exists to keep the opponent honest.

## In RL

Stochastic policies $\pi(a|s)$ are mixed strategies in the state-conditional sense. The maximum-entropy framework (SAC, soft Q-learning) explicitly trades off return for randomization. In [[multi-agent-rl]], stochastic policies are necessary for self-play to converge to mixed equilibria.

<!-- tier:grad -->
# Mixed Strategy (Grad)

## Behavioral vs mixed strategies

In sequential games ([[extensive-form]]), there's a distinction:
- **Mixed strategy**: randomize over *complete plans* (one randomization at the start).
- **Behavioral strategy**: randomize *at each information set* independently.

Kuhn's theorem (1953): in games of perfect recall, the two are equivalent — every mixed strategy has an outcome-equivalent behavioral strategy. In games of imperfect recall (rare in practice but important in some AI training settings), they can differ.

## Connection to entropy regularization

In modern RL, entropy regularization keeps the policy "mixed" — penalize deterministic policies. Equivalent to learning a max-entropy policy that mixes over actions. Critical for exploration; also stabilizes training in adversarial settings.
