---
title: Minimax
category: game-theory
---
<!-- tier:intro -->
# Minimax

The **minimax** decision rule: pick the strategy that maximizes your worst-case payoff, assuming an adversarial opponent.

For a two-player [[zero-sum]] game, your row player's optimal strategy is the one that, against an adversary's best response, leaves you with the highest possible payoff. Equivalently: minimize the maximum harm an opponent can cause.

The flip side: the column player picks the strategy that minimizes the maximum payoff the row player can achieve. By the **minimax theorem**, in finite two-player zero-sum games these two values coincide — there's a unique game value $v$.

<!-- tier:undergrad -->
# Minimax (Undergrad)

## Pure-strategy minimax

Given payoff matrix $A_{ij}$ (row's payoff):
- Row's minimax value: $\underline{v} = \max_i \min_j A_{ij}$ — best guaranteed payoff playing pure $i$.
- Column's minimax value: $\overline{v} = \min_j \max_i A_{ij}$ — worst payoff column can be forced into.

Always $\underline{v} \leq \overline{v}$. When they're equal, there's a pure-strategy saddle point — the entry $(i^*, j^*)$ achieving both.

## Mixed-strategy minimax

When pure saddle points don't exist, players randomize. Row chooses mixed strategy $p \in \Delta^m$, column chooses $q \in \Delta^n$. Expected payoff: $p^T A q$.

The minimax theorem (von Neumann 1928): $\max_p \min_q p^T A q = \min_q \max_p p^T A q = v$. Both players can guarantee the same expected value.

## Computing minimax

For zero-sum games, minimax reduces to a linear program:

$$\max_{p, v} v \text{ subject to } p^T A_j \geq v \text{ for all } j, \quad p \in \Delta^m$$

Standard LP solvers (simplex, interior-point) find the equilibrium in polynomial time.

For game trees (chess, etc.), exact minimax requires evaluating every leaf — exponential. **Alpha-beta pruning** prunes branches that can't affect the result. Modern engines combine alpha-beta with neural-network evaluation (Stockfish-NNUE, Leela).

## Why it works

Minimax is the right concept when:
1. The opponent is *adversarial* (zero-sum captures this).
2. You can't predict the opponent's randomization.
3. You want to lock in a guaranteed worst-case.

It's NOT the right concept when:
- The game is general-sum (cooperation possible) — use [[nash-equilibrium]] instead.
- The opponent is exploitable — use **best-response** or population-based methods.
- You have prior beliefs about the opponent — use Bayesian decision theory.

<!-- tier:grad -->
# Minimax (Grad)

## Connection to no-regret learning

Online learning algorithms (multiplicative weights, follow-the-regularized-leader) running against each other in self-play converge in **time-average** to the minimax equilibrium of the underlying zero-sum game. This is the foundation of CFR (counterfactual regret minimization) — the algorithm that solved heads-up limit poker.

The convergence is **only on average**: at any single round, both players may be far from equilibrium. The empirical distribution of plays converges, not the strategies themselves.

## When minimax misleads

In **iterated prisoner's dilemma**, minimax says "always defect" — that's the worst-case-secure pure strategy. But the actual best strategy (Tit-for-Tat, etc.) involves cooperation. The minimax framing destroys the cooperative structure.

In **coordination games** (driving on the right vs. left), minimax says any of the equilibria is fine — but the actual problem is *which* equilibrium gets selected, not avoiding adversarial harm. Schelling-style focal points are the right concept.

## In RL

Minimax-Q (Littman 1994) extends Q-learning to zero-sum stochastic games:

$$Q(s, a, b) \leftarrow (1-\alpha) Q(s, a, b) + \alpha [r + \gamma V(s')]$$

where $V(s) = \max_p \min_b \sum_a p(a) Q(s, a, b)$ — solving a linear program at each state.

Computationally expensive but theoretically clean. Practical multi-agent RL ([[multi-agent-rl]]) usually approximates with self-play instead.
