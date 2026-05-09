---
title: Extensive Form Games
category: game-theory
---
<!-- tier:intro -->
# Extensive Form Games

The **extensive form** is a game tree: nodes are decision points, edges are actions, leaves are payoff vectors. Models games where order of play matters.

**Examples**: chess, poker, negotiation, any game with a clear sequence of moves.

Contrasts with the **normal form** (matrix), which collapses everything to one-shot strategy choices. The extensive form makes timing and information explicit.

**Information sets** group nodes the player can't distinguish — used to model imperfect information (poker: I don't know your hole cards).

<!-- tier:undergrad -->
# Extensive Form Games (Undergrad)

## Backward induction

For finite games of perfect information, solve by **backward induction**:
1. At each leaf, the payoff is given.
2. At each non-leaf node, the player to move chooses the child that maximizes their payoff.
3. Roll the value back up; the equilibrium is the path of choices made at each node.

This produces a **subgame-perfect equilibrium** ([[subgame-perfect]]) — no incredible threats survive.

## Imperfect information

Information sets group nodes a player can't tell apart. Strategies must be measurable with respect to information sets — you can't condition on what you don't know.

The relevant equilibrium concept becomes **sequential equilibrium** or **perfect Bayesian equilibrium** — equilibrium plus consistent beliefs across information sets.

## Zermelo's theorem

In any finite, two-player, perfect-information, zero-sum game with no chance moves, exactly one of three holds:
1. White has a winning strategy.
2. Black has a winning strategy.
3. Both can force a draw.

Chess satisfies the conditions, so the answer to "who wins with optimal play?" exists — but it's beyond computation. ($10^{120}$ game tree.)

<!-- tier:grad -->
# Extensive Form Games (Grad)

## CFR — counterfactual regret minimization

For solving large extensive-form games (poker), CFR (Zinkevich 2007) iteratively updates strategies to minimize "counterfactual regret" at each information set. Converges to a Nash equilibrium in two-player zero-sum games.

CFR+ and Deep-CFR scale to full no-limit Texas hold'em. Pluribus (Brown 2019) used self-play CFR variants to beat top human professionals.

## Computational tractability

Solving extensive-form games is generally hard:
- Two-player zero-sum + perfect information: tractable via backward induction (size of game tree).
- Two-player zero-sum + imperfect information: linear programming over the *sequence form* — polynomial in the size of the game tree but the tree itself can be exponential.
- General-sum or $\geq 3$ players: PPAD-hard or worse.

Modern multi-agent RL ([[multi-agent-rl]]) often gives up on exact solutions and runs scalable approximations: PPO + self-play, population-based training, etc.
