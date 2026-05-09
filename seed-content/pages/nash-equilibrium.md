---
title: Nash Equilibrium
category: game-theory
---
<!-- tier:intro -->
# Nash Equilibrium

A **Nash equilibrium** is a profile of strategies — one for each player — where no player can improve their payoff by unilaterally changing strategy.

It's the central solution concept in game theory. When economists, ML researchers, or political scientists ask "what's the equilibrium?", they almost always mean a Nash equilibrium.

The key word is *unilateral*: each player asks "given what everyone else is doing, can I do better?" If no one can, you're at equilibrium.

**Nash's theorem** (1950): every finite game with mixed strategies has at least one Nash equilibrium. This existence result is what makes the concept usable.

<!-- tier:undergrad -->
# Nash Equilibrium (Undergrad)

## Formal definition

A profile $(s_1^*, ..., s_n^*)$ is a Nash equilibrium iff for every player $i$ and every alternative strategy $s_i$:

$$u_i(s_i^*, s_{-i}^*) \geq u_i(s_i, s_{-i}^*)$$

where $s_{-i}$ denotes "everyone other than $i$." No unilateral deviation pays off.

## Pure vs mixed equilibria

**Pure** Nash: each player commits to a single strategy.

**Mixed** Nash: each player randomizes — see [[mixed-strategy]]. Required when no pure equilibrium exists (rock-paper-scissors).

A mixed equilibrium has a curious property: each player must be **indifferent** between all strategies in their support. If Player 1 strictly preferred Heads to Tails given Player 2's strategy, they'd play pure Heads — not mix.

## Examples

**Prisoner's dilemma**:
| | Cooperate | Defect |
|---|---|---|
| **Cooperate** | (3, 3) | (0, 5) |
| **Defect** | (5, 0) | (1, 1) |

Defect, Defect is the unique Nash. Both players prefer the (3,3) outcome but neither can unilaterally enforce it. The classic illustration of why "rational individuals" can produce collectively bad outcomes.

**Battle of the sexes**:
| | Opera | Football |
|---|---|---|
| **Opera** | (3, 2) | (0, 0) |
| **Football** | (0, 0) | (2, 3) |

Two pure Nash equilibria (both go to opera, both go to football), plus a mixed equilibrium where each randomizes. *Equilibrium selection* is itself a hard problem.

## Equilibrium ≠ optimal

Nash equilibrium is a **stability** concept, not an **optimality** concept. The prisoner's dilemma equilibrium is Pareto-dominated by mutual cooperation. The "tragedy of the commons" equilibrium overgrazes. Pure-strategy equilibria can be welfare-poor.

This is the core insight of [[mechanism-design]]: if you don't like what equilibrium produces, change the rules.

<!-- tier:grad -->
# Nash Equilibrium (Grad)

## Computational complexity

Computing a Nash equilibrium is **PPAD-complete** — believed to be hard but not NP-complete. Even for two-player non-zero-sum games, no polynomial-time algorithm is known. This is foundational: the equilibrium concept is *defined* but not always *findable* in practice.

Two-player **zero-sum** games are an important exception — equilibria reduce to linear programming, polynomial-time.

For general games, practitioners use:
- **Best-response dynamics** — converges in some classes (potential games), cycles in others.
- **Fictitious play** — each player best-responds to the empirical history of opponents. Converges for two-player zero-sum, can cycle elsewhere.
- **Multiplicative weights / no-regret learning** — converges in time-average to a *coarse correlated equilibrium*, which is weaker than Nash but tractable.

## Refinements

Nash equilibrium is too permissive — many games have multiple equilibria, some implausible. Refinements rule some out:
- **Subgame-perfect** ([[subgame-perfect]]): no incredible threats. Backward induction in [[extensive-form]] games.
- **Trembling-hand perfect** (Selten 1975): robust to small probabilities of mistakes.
- **Bayesian Nash** ([[bayesian-game]]): equilibrium given each type's beliefs.

## Beyond Nash

In multi-agent learning ([[multi-agent-rl]]), Nash equilibrium is often the *wrong* target — too hard to compute, too sensitive to exact opponent modeling. Modern alternatives:
- **Coarse correlated equilibrium** (CCE): no-regret learning converges to it; tractable.
- **α-rank** (Omidshafiei 2019): a Markov-chain-based ranking of strategies.
- **PSRO (Policy Space Response Oracles)**: iteratively expand a strategy population.

The shift from "find the Nash" to "find a stable population of strategies" mirrors the shift in deep RL from solving MDPs exactly to running policy optimization on rich, non-stationary environments.
