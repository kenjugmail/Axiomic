---
title: Self-Play
category: game-theory
---
<!-- tier:intro -->
# Self-Play

**Self-play** trains an agent by having it play against copies of itself. The training distribution evolves with the agent: as the agent improves, opponents (versions of itself) also improve.

In two-player [[zero-sum]] games, self-play with no-regret learning provably converges to the Nash equilibrium in time-average. This is the theoretical foundation of TD-Gammon, AlphaGo, AlphaZero, MuZero, and Pluribus.

In general-sum or cooperative games, self-play has weaker guarantees and often needs structural fixes (population-based training, league play) to avoid collapse.

<!-- tier:undergrad -->
# Self-Play (Undergrad)

## The classical loop

```
initialize agent π₀
for iteration t = 1, ..., T:
    play games of π_{t-1} vs π_{t-1}
    train π_t to maximize win rate against π_{t-1}
    occasionally evaluate against checkpoints
```

The replay buffer fills with self-generated games; the policy and value heads (in actor-critic + MCTS hybrids) train against bootstrapped targets.

## Why it works (when it does)

In two-player zero-sum games:
- No-regret learning algorithms (multiplicative weights, fictitious play) running against each other converge in **time-average** to the Nash equilibrium.
- This convergence is in average, not pointwise — the current policies may oscillate around equilibrium.
- The averaged policy ("Hannan consistent") is what matters for theoretical guarantees.

For policy gradient + neural networks, exact theory is weaker but empirical convergence holds across many domains.

## Why it can fail

- **Cycling**: rock-paper-scissors strategies — A beats B beats C beats A. Pure self-play oscillates.
- **Distributional collapse**: in cooperative settings, the population can collapse to a single "convention" that's hard to leave even when better conventions exist.
- **Brittle to opponent shifts**: the trained agent excels against itself but fails against humans / other agents with different priors. Cicero's Diplomacy work made this explicit.

## League play

To avoid cycling + collapse, modern systems use **league play** — a population of diverse agents, trained against each other in a structured tournament. AlphaStar's three classes (main agents, exploiters, league exploiters) is the canonical example.

<!-- tier:grad -->
# Self-Play (Grad)

## Theoretical foundations

In repeated two-player zero-sum games, **fictitious play** (Robinson 1951) — each player best-responds to the empirical distribution of the opponent's past actions — converges to Nash in time-average. For discrete games, convergence is provable; for continuous games, it's known to converge under appropriate conditions but not always.

**No-regret learning** more broadly: any algorithm with sublinear regret, played against itself in a zero-sum game, has its time-averaged play converge to the Nash. Multiplicative weights, EXP3, online gradient descent all qualify. This is the foundation of CFR variants for poker.

## Beyond zero-sum

In **general-sum** games, no analogous convergence theorem exists. Self-play can:
- Converge to *some* equilibrium (Nash, correlated, or coarse correlated), but which one depends on initial conditions.
- Reach the worst Nash equilibrium (e.g., always-defect in iterated prisoner's dilemma).
- Cycle indefinitely.

Practical fixes: opponent modeling, league play, mixing in human/expert demonstrations, intrinsic rewards for diversity.

## Connection to RLHF

RLHF training has self-play structure embedded: the policy generates responses; the reward model evaluates them; the policy updates against the reward. The reward model is a learned approximation of the equilibrium "judge" in a Bayesian persuasion game between human raters + the model. Many alignment failure modes (sycophancy, reward hacking) are self-play artifacts in disguise.
