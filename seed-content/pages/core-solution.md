---
title: The Core
category: game-theory
---
<!-- tier:intro -->
# The Core

The **core** of a cooperative game is the set of payoff allocations that no coalition can improve on by leaving the grand coalition. An allocation is in the core iff:
1. **Efficiency**: total payoff equals $v(N)$ (the grand coalition's value).
2. **Coalition rationality**: for every subset $S$, $\sum_{i \in S} x_i \geq v(S)$.

If any subset could do better on its own, they would defect. The core captures *stability* — what's left after everyone has the option to walk away.

<!-- tier:undergrad -->
# The Core (Undergrad)

## When is the core non-empty?

Many cooperative games have an **empty core** — no allocation is stable. Example: 3 players, $v(\{i\}) = 0$, $v(\{i, j\}) = 100$, $v(\{1, 2, 3\}) = 100$. Any 2-player coalition can get all 100; the third gets nothing. No allocation makes everyone happy.

The **Bondareva-Shapley theorem** (1963/67) gives a necessary and sufficient condition for non-emptiness: the game must be **balanced**.

## Core vs Shapley value

The core says "what's stable" (a set, possibly empty). The [[shapley-value]] says "what's fair" (a unique point, always exists).

These often disagree:
- The Shapley value can lie outside the core (an unstable but "fair" allocation).
- The core can have many points; choosing among them needs another criterion (like the **nucleolus** — minimize the worst grievance).

## Applications

- **Cost allocation**: when multiple parties share a facility, the core determines which cost-share schemes are stable. If the core is empty, no agreement is sustainable without external enforcement.
- **Matching markets**: the core of a stable-marriage game is the set of stable matchings (Gale-Shapley algorithm finds the man-optimal core element).
- **Auction theory**: the core of a combinatorial auction is the set of allocations no coalition of buyers + auctioneer can improve on.

<!-- tier:grad -->
# The Core (Grad)

## Computational complexity

Checking whether the core is non-empty is generally hard. For special game classes:
- **Convex games** (Shapley 1971): core is non-empty AND the Shapley value lies in the core.
- **Assignment games** (matching): core is non-empty; coincides with the linear-programming-dual.
- **Voting games**: the core characterizes "winning coalitions" stable against deviations.

## Connection to mechanism design

Core-selecting auctions (CCA — Combinatorial Clock Auctions) are designed to produce outcomes in the core of the underlying coalitional game. They're used in spectrum auctions (Australia, UK, Switzerland) where simple mechanism-design ([[mechanism-design]]) results don't apply because of complementarities across items.
