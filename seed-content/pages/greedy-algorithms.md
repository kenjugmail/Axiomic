---
title: Greedy Algorithms
category: algorithms
---
<!-- tier:intro -->
# Greedy Algorithms

A **greedy algorithm** makes the locally optimal choice at each step, hoping for a globally optimal solution. Sometimes works (Dijkstra, MST, Huffman coding); sometimes doesn't (knapsack, traveling salesman).

When it works, greedy is fast (typically $O(n \log n)$) + simple. When it doesn't, the failure is sometimes subtle — looks-correct greedy algorithms can be wrong on cases that don't immediately come to mind.

The right framework: prove correctness via **exchange argument** or **matroid theory** before trusting a greedy approach.

<!-- tier:undergrad -->
# Greedy Algorithms (Undergrad)

## When greedy provably works

**Matroid optimization**: if your problem's solution space is a matroid (independent sets satisfy specific axioms), greedy is optimal. MST is the canonical example — graphs form a matroid where forests are independent.

**Exchange argument**: prove that if a non-greedy solution is optimal, you can swap one of its choices for the greedy choice without making things worse → there's also an optimal solution consistent with greedy. By induction, greedy is optimal.

## Classical successes

- **Huffman coding**: greedily merge two lowest-frequency nodes. Provably optimal prefix code.
- **Activity selection**: pick the meeting that ends earliest, repeat. Optimal for unweighted scheduling.
- **Fractional knapsack**: pick items by descending value/weight ratio. Optimal when items are divisible.
- **Dijkstra** ([[shortest-path]]): always extract the unvisited vertex with smallest distance. Optimal for non-negative weights.
- **Kruskal/Prim** ([[minimum-spanning-tree]]): cheapest edge that doesn't create a cycle / cheapest crossing edge. Optimal MST.

## Classical failures

- **0/1 knapsack**: greedy by value/weight ratio is wrong (item-indivisibility breaks the matroid).
- **Set cover**: greedy gives an $O(\log n)$-approximation, not optimal.
- **Bin packing**: greedy first-fit gives 1.7-approx, not optimal.
- **Traveling salesman**: greedy nearest-neighbor can be arbitrarily bad.

For these, [[dynamic-programming]] or branch-and-bound or approximation algorithms are needed.

## How to know if greedy works

1. Is the problem a matroid? Then yes.
2. Does the exchange argument work? Try to prove.
3. If neither: try greedy on small examples; if it produces optimal answers on adversarial cases, deeper investigation.
4. If it fails on small cases: greedy doesn't work. Use DP or another technique.
