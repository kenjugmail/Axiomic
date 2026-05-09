---
title: NP-Completeness
category: algorithms
---
<!-- tier:intro -->
# NP-Completeness

A problem is **NP-complete** if:
1. It's in NP (solutions verifiable in polynomial time).
2. It's NP-hard (every problem in NP reduces to it in polynomial time).

NP-complete problems are the **hardest in NP** — if any has a polynomial algorithm, then P = NP and every NP problem is solvable in polynomial time.

The first NP-complete problem (proven via Cook-Levin theorem 1971) was **SAT**: given a Boolean formula, is there an assignment that makes it true? Karp's 1972 paper showed 21 other natural problems are also NP-complete via reductions.

<!-- tier:undergrad -->
# NP-Completeness (Undergrad)

## Famous NP-complete problems

- **SAT** (Boolean satisfiability): is a CNF formula satisfiable?
- **3-SAT**: SAT restricted to 3-literal clauses. Still NP-complete.
- **Vertex cover**: smallest set of vertices touching every edge.
- **Independent set**: largest set of vertices with no edges between them.
- **Clique**: largest fully-connected sub-graph.
- **3-coloring**: can the graph's vertices be 3-colored such that adjacent vertices differ?
- **Hamiltonian cycle**: is there a cycle visiting every vertex exactly once?
- **Traveling salesman (decision)**: is there a TSP tour of cost $\leq k$?
- **Knapsack (decision)**: can we fit items totaling value $\geq v$ in weight $\leq W$?
- **Subset sum**: does any subset sum to exactly $T$?

## Proving NP-completeness

To show problem $X$ is NP-complete:
1. Show $X$ is in NP: given a solution candidate, verify in polynomial time.
2. Show $X$ is NP-hard: reduce a known NP-hard problem $Y$ to $X$ in polynomial time.

The reduction transforms instances of $Y$ into instances of $X$ such that the answer is preserved. If you could solve $X$ quickly, you could solve $Y$ quickly via the reduction.

The "cookbook" of NP-completeness proofs builds a directed acyclic graph of reductions rooted at SAT.

## What "NP-complete" means in practice

Don't expect a polynomial algorithm. Don't waste time looking for one. Use:

- **Approximation algorithms**: provable bounds (vertex cover has 2-approx, set cover has $\ln n$ approx).
- **Heuristics**: no guarantees but often good enough.
- **Integer linear programming**: solver-driven; works on instances up to ~thousands of variables.
- **Special structure**: many real-world instances of NP-complete problems have structure (sparsity, geometric structure, low treewidth) that makes them tractable.

For the SAT family specifically: modern SAT solvers (CDCL-based, like Glucose, MiniSAT, Lingeling) routinely solve million-variable instances. Worst-case is still exponential, but practical SAT is much easier than the worst case.

## NP-hard vs NP-complete

- **NP-complete** = NP ∩ NP-hard.
- **NP-hard** = at least as hard as the hardest NP problem.

Halting problem is NP-hard (every NP problem trivially reduces to halting) but not NP (it's undecidable, so not in NP).

For practical purposes: NP-hard means "no known polynomial algorithm + believed impossible."
