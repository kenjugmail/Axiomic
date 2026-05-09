---
title: VCG Auction
category: game-theory
---
<!-- tier:intro -->
# VCG Auction

The **Vickrey-Clarke-Groves (VCG)** auction is the canonical truthful mechanism for allocating multiple items to bidders with private valuations.

Each agent's payment equals the **externality** they impose on the others — the difference between the total surplus enjoyed by other agents in this allocation versus the surplus they would have enjoyed if this agent didn't exist.

**Truthfulness theorem**: for any payoff structure linear in types, telling the truth is a dominant strategy in VCG. Bidding strategy collapses to "report your true valuation."

<!-- tier:undergrad -->
# VCG Auction (Undergrad)

## Formal definition

For agents $1, ..., n$ with reported types $\hat{t}_i$:
1. Compute the efficient allocation $g(\hat{t}) = \arg\max_g \sum_i v_i(g, \hat{t}_i)$.
2. Each agent $i$'s payment is $\sum_{j \neq i} v_j(g_{-i}^*, \hat{t}_j) - \sum_{j \neq i} v_j(g(\hat{t}), \hat{t}_j)$ where $g_{-i}^*$ is the efficient allocation if $i$ were absent.

In words: pay the harm you cause to others. If you don't change anyone's outcome, you pay zero. If your presence pushes someone out of the allocation, you pay the surplus they'd have gotten.

## Single-item special case

For a single item: VCG = second-price auction. The winner imposes externality on the second-highest bidder (loses the item to winner); pays second-highest bid.

## Multi-item example

Two items, three bidders: A values item 1 at 10, B values item 2 at 8, C values both at 15. Efficient allocation: C gets both (value 15) vs (A+B = 18). Wait — A+B = 18 > 15, so efficient is A gets 1, B gets 2 (total 18). C's payment if they won (they didn't): they'd impose externality of 18 on A+B. C pays nothing because they don't win. A pays externality on others: B+C in A's absence = 8 + 15 = 23 (C wins both); B+C with A = 8 + 0 = 8. A's payment = 23 - 8 = 15. Similarly for B.

## Limitations

- **Empty core**: with strong complementarities, total VCG payments can be lower than competing bids' total. Revenue suffers.
- **Computational**: requires solving the winner-determination problem $n+1$ times (once per agent + once for everyone). NP-hard for combinatorial auctions.
- **Collusion-resistance**: VCG is collusion-vulnerable in some settings (Yokoo et al.).

<!-- tier:grad -->
# VCG Auction (Grad)

## Why VCG is truthful

Each agent's utility: $v_i(g(\hat{t}), \hat{t}_i) - p_i(\hat{t})$. Substituting VCG payment:

$$U_i(\hat{t}_i) = v_i(g(\hat{t}), \hat{t}_i) + \sum_{j \neq i} v_j(g(\hat{t}), \hat{t}_j) - \text{const}_i$$

The agent's utility is exactly the *total surplus* (their term + others' terms) minus a constant they don't control. To maximize their utility, they should report truthfully so the mechanism picks the *true* surplus-maximizing allocation. Lying changes $\hat{t}$, which changes $g(\hat{t})$, which can only decrease *true* total surplus.

This argument generalizes: VCG is truthful for any environment where agents' payoffs are quasi-linear in money + private values.

## Limits revisited

**Revenue is not a VCG property**: VCG is efficient + truthful + individually rational, but NOT revenue-optimal. Myerson's optimal auction distorts allocation to extract more revenue.

**Robust mechanism design** (Bergemann-Morris): VCG remains truthful even when agents have non-Bayesian beliefs about others. This is its main practical advantage over Bayesian-optimal mechanisms.
