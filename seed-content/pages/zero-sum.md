---
title: Zero-Sum Games
category: game-theory
---
<!-- tier:intro -->
# Zero-Sum Games

A **zero-sum game** is one where one player's gain is exactly another's loss. Whatever I win, you lose. The total of all payoffs across players is zero (or constant — these are equivalent up to a shift).

**Examples**: chess, poker (heads-up), rock-paper-scissors, matching pennies.

The defining feature: there's no room for cooperation. Strategic interaction reduces to "I want to maximize my payoff; you want to minimize it." This makes zero-sum games the cleanest setting for game theory — the math works out unusually well — but also the least like most real-world interactions, where cooperation is on the table.

The classical solution concept here is **[[minimax]]** — pick the strategy that maximizes your worst-case payoff over what your opponent might do.

<!-- tier:undergrad -->
# Zero-Sum Games (Undergrad)

## Payoff matrices

A two-player zero-sum game is a matrix $A$ where $A_{ij}$ is the row player's payoff when row chooses $i$ and column chooses $j$. Column's payoff is $-A_{ij}$.

| | Stone | Paper | Scissors |
|---|---|---|---|
| **Stone** | 0 | -1 | 1 |
| **Paper** | 1 | 0 | -1 |
| **Scissors** | -1 | 1 | 0 |

## Pure-strategy games

If there's a row $i^*$ and column $j^*$ such that $i^*$ is row's best response to $j^*$ AND $j^*$ is column's best response to $i^*$, then $(i^*, j^*)$ is a **saddle point** — a pure-strategy [[nash-equilibrium]]. Many games (battle-of-the-sexes, prisoner's dilemma) have these. Many don't (rock-paper-scissors).

## Mixed strategies

When no pure saddle point exists, players randomize — see [[mixed-strategy]]. Von Neumann's **minimax theorem** (1928) guarantees every finite two-player zero-sum game has a unique value $v$ such that some mixed strategy of row guarantees expected payoff $\geq v$ regardless of column, and some mixed strategy of column guarantees expected payoff $\leq v$.

## Linear programming connection

Solving a zero-sum game reduces to a linear program. The dual LP solves the column player's problem; strong duality recovers the minimax theorem.

<!-- tier:grad -->
# Zero-Sum Games (Grad)

## Beyond two players

The clean theory of zero-sum games breaks once you have $\geq 3$ players whose payoffs sum to zero. There are coalitions to consider; the value $v$ may not be unique. The **core** and the **Shapley value** ([[shapley-value]]) become the relevant concepts.

## Connection to multi-agent learning

In two-player zero-sum games, **self-play** ([[self-play]]) is provably stable in tabular settings — no-regret learning algorithms (multiplicative weights, exp3) converge in average to the minimax equilibrium. This is why TD-Gammon, AlphaGo's self-play loop, and AlphaZero work cleanly: they're zero-sum.

In general-sum or cooperative games, self-play is much trickier. Self-play in StarCraft (mostly zero-sum 1v1) worked; self-play in Diplomacy (general-sum, alliance-driven) needs structural changes.

## Where the assumption breaks

Most real-world strategic interactions are NOT zero-sum. Markets are mostly positive-sum (gains from trade). Social dilemmas (prisoner's, tragedy of the commons) have positive-sum cooperative outcomes that strategic equilibrium misses. Treating an interaction as zero-sum when it isn't is a common analytic mistake.
