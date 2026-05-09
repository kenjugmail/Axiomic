---
title: Approximation Algorithms
category: algorithms
---
<!-- tier:intro -->
# Approximation Algorithms

For NP-hard optimization problems, finding the optimal solution is intractable. **Approximation algorithms** trade optimality for tractability, finding solutions provably within a factor of optimal in polynomial time.

A $\rho$-approximation algorithm guarantees $\text{ALG}(I) \leq \rho \cdot \text{OPT}(I)$ for minimization (or $\geq$ for maximization) on every instance.

Examples:
- **Vertex cover**: 2-approximation via maximal matching.
- **Set cover**: $\ln n$-approximation via greedy.
- **Metric TSP**: 1.5-approximation (Christofides 1976).
- **Knapsack**: $(1 + \epsilon)$-approximation in $O(n^3 / \epsilon)$ via PTAS.

<!-- tier:undergrad -->
# Approximation Algorithms (Undergrad)

## What "ratio" means

For a minimization problem, a $\rho$-approximation produces a solution at most $\rho$ times the optimal value. Smaller $\rho$ = better.

For maximization, a $\rho$-approximation produces a solution at least $\rho$ times the optimal. Larger $\rho$ = better (at most 1).

The ratio is **worst-case** — averages can be much better.

## Hardness of approximation

Some problems can't even be approximated well:
- **TSP (without metric assumption)**: cannot be approximated within any constant unless P = NP.
- **Set cover**: cannot be approximated better than $\ln n - O(\ln \ln n)$ unless P = NP. The greedy $\ln n$-approximation is essentially tight.
- **Max independent set**: cannot be approximated within $n^{1-\epsilon}$ for any $\epsilon > 0$ unless P = NP.

The PCP theorem (Probabilistically Checkable Proofs, 1992) underlies most modern hardness-of-approximation results.

## Approximation classes

- **Constant-factor**: $\rho$ is a constant (vertex cover at 2, metric TSP at 1.5).
- **Logarithmic**: $\rho = O(\log n)$ (set cover, group Steiner tree).
- **Polynomial**: $\rho = O(n^c)$ for $c < 1$ (max independent set, max clique).
- **PTAS** (Polynomial-Time Approximation Scheme): $(1 + \epsilon)$-approximation in time polynomial in $n$ for any fixed $\epsilon > 0$. Knapsack, Euclidean TSP.
- **FPTAS** (Fully Polynomial-Time Approximation Scheme): $(1 + \epsilon)$ in time polynomial in $n$ AND $1/\epsilon$. Knapsack has FPTAS.
- **APX**: problems with constant-factor approximation algorithms. Vertex cover, MAX-3SAT.

## In ML

Many ML problems are NP-hard at the optimal-solution level, with approximation algorithms or heuristics giving the practical answers:

- **k-means clustering**: NP-hard to find globally optimal centers; Lloyd's algorithm gives a local optimum.
- **L0-regularized regression**: NP-hard; LASSO (L1) is a convex relaxation.
- **Bayesian network learning**: NP-hard; greedy hill-climbing is the practical default.
- **Decision tree induction**: optimal-tree is NP-hard; ID3 / C4.5 / CART are greedy heuristics.

The boundary between "approximation algorithm with provable bound" and "heuristic with no guarantees" is one of the cleanest in CS.
