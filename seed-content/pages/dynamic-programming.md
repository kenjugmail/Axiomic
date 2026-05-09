---
title: Dynamic Programming
category: algorithms
---
<!-- tier:intro -->
# Dynamic Programming

**Dynamic programming (DP)** is an algorithm-design pattern for problems with two properties:
1. **Optimal substructure**: the optimal solution can be built from optimal solutions to subproblems.
2. **Overlapping subproblems**: the same subproblems are solved multiple times in a naive recursive approach.

DP turns exponential brute-force search into polynomial-time computation by **memoizing** subproblem results — solve each subproblem once, store the answer, reuse it.

Classical applications: shortest paths, sequence alignment (used in BLAST + bioinformatics), knapsack problems, edit distance, optimal substructure parsing, RNN language modeling.

<!-- tier:undergrad -->
# Dynamic Programming (Undergrad)

## The pattern

1. Identify the subproblem: parameterize the solution.
2. Write the recurrence: how does the answer to one subproblem depend on smaller subproblems?
3. Solve in the right order: bottom-up (tabulation) or top-down with memoization.
4. Construct the actual solution from the table (often by tracing pointers backward).

## Fibonacci as the canonical example

Naive recursive Fibonacci: $T(n) = T(n-1) + T(n-2) + O(1)$ → exponential time.

Memoized: store $F(k)$ once computed; second time it's needed, use the cached value. $O(n)$ time, $O(n)$ space.

Tabulated (bottom-up): build up $F(1), F(2), \ldots, F(n)$ in a loop. Same complexity, simpler implementation.

Space-optimized: only $F(k-1)$ and $F(k-2)$ needed to compute $F(k)$. $O(n)$ time, $O(1)$ space.

## Memoization vs tabulation

- **Memoization** (top-down, recursive): natural recursive code with a cache decorator. Easy to write; slight overhead from function-call stack.
- **Tabulation** (bottom-up, iterative): build the table in dependency order. Slightly faster (no recursion overhead); requires figuring out the iteration order.

Both have the same asymptotic complexity. Choose by what's easier to express.

## Common patterns

- **Sequence DP**: state = (position in sequence). Edit distance, LCS, longest increasing subsequence.
- **Interval DP**: state = (left, right). Matrix chain multiplication, optimal BST.
- **Tree DP**: state = (node, sub-tree property). Tree-rooted optimization.
- **Subset DP**: state = bitmask of items chosen. Traveling salesman ($O(n^2 2^n)$, faster than $O(n!)$).
- **Knapsack DP**: state = (item index, weight). 0/1 knapsack and variants.

<!-- tier:grad -->
# Dynamic Programming (Grad)

## DP and ML

Many ML algorithms ARE dynamic programming:
- **Viterbi algorithm** for HMMs: forward + backward via DP.
- **Forward-backward** for HMMs: marginal likelihood via DP.
- **Beam search** for sequence generation: approximate DP over hypothesis space.
- **CYK algorithm** for context-free parsing: $O(n^3)$ DP over parse tables.

The **Bellman equation** in reinforcement learning is a DP: $V(s) = \max_a \mathbb{E}[r + \gamma V(s')]$. Value iteration is bottom-up DP; Q-learning is approximate top-down DP.

## When DP doesn't apply

- **No optimal substructure**: longest *simple* path in a graph isn't DP-able (sub-paths of optimal paths aren't necessarily optimal).
- **Subproblem space too large**: DP only helps if the number of distinct subproblems is polynomial. Some problems have exponential subproblem spaces.

For these, use approximation, randomization, or accept exponential time.

## Pseudo-polynomial complexity

Some "polynomial-time" DP algorithms are actually pseudo-polynomial. **Knapsack DP** is $O(nW)$ — polynomial in $W$, but $W$ is encoded in $\log W$ bits, so the *true* input size is $O(n + \log W)$, making the algorithm exponential in input size.

For practical use, pseudo-polynomial is fine when $W$ is small. For huge $W$, we fall back to approximation algorithms (PTAS for knapsack achieves $1+\epsilon$ in $O(n^2/\epsilon)$).
