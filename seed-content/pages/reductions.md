---
title: Polynomial-Time Reductions
category: algorithms
---
<!-- tier:intro -->
# Polynomial-Time Reductions

A **reduction** from problem $A$ to problem $B$ is a transformation that converts instances of $A$ into instances of $B$ such that the answer to the original $A$ instance can be recovered from the answer to the transformed $B$ instance.

If the reduction runs in polynomial time, we write $A \leq_P B$. Read: "$A$ reduces to $B$." Read deeper: "If $B$ is easy, then $A$ is also easy."

The contrapositive (and main use): **if $A$ is hard, then $B$ is also hard.**

This is how complexity theorists prove NP-hardness — start with a known NP-hard problem, reduce it to a new problem, and the new problem is at least as hard.

<!-- tier:undergrad -->
# Polynomial-Time Reductions (Undergrad)

## Karp reductions vs Cook reductions

- **Karp reduction** (many-one): a polynomial-time function that maps yes-instances to yes-instances and no-instances to no-instances. Single use of the $B$-solver.
- **Cook reduction** (Turing reduction): polynomial-time algorithm that may call the $B$-solver multiple times as a subroutine.

For NP-completeness, Karp reductions are the standard. Cook reductions are more flexible but harder to use as a structural complexity tool.

## How to construct a reduction

To prove $A \leq_P B$:
1. Given an instance $\alpha$ of $A$, describe how to construct an instance $\beta$ of $B$.
2. Show the construction runs in polynomial time.
3. Show $\alpha$ is a yes-instance of $A$ iff $\beta$ is a yes-instance of $B$.

Both directions of the iff matter. Forgetting "yes-instances map to yes-instances" or "no-instances map to no-instances" produces an incorrect reduction.

## Classical examples

**3-SAT ≤ Vertex Cover**: given a 3-SAT formula with $m$ clauses, construct a graph with $3m + 2n$ vertices ($n$ variables, $m$ clauses) such that the formula is satisfiable iff the graph has a vertex cover of size $\leq n + 2m$.

**Hamiltonian cycle ≤ Traveling salesman**: given a graph $G$, construct a complete graph with edge weight 1 for original edges, 2 for non-edges. $G$ has a Hamiltonian cycle iff the TSP tour has cost $\leq n$.

**SAT ≤ 3-SAT**: convert each clause of arbitrary length into 3-clauses by introducing auxiliary variables.

The chain of reductions builds a graph rooted at SAT. New problems join by reducing from any node.

## Reduction in algorithm design

Reductions aren't just for hardness proofs. They're constructive too:
- Solve $A$ by reducing to $B$ + using a solver for $B$. Practical when an off-the-shelf $B$-solver exists.
- The fastest currently-known algorithms for many problems are via reductions to SAT (using modern SAT solvers).

In ML: many problems reduce to ILP (integer linear programming), MIP (mixed-integer programming), or constraint-satisfaction. Modern solvers (Gurobi, CPLEX, OR-Tools) handle real-world instances even when worst-case is NP-hard.
