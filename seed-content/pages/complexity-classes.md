---
title: Complexity Classes
category: algorithms
---
<!-- tier:intro -->
# Complexity Classes

Complexity classes group problems by the resources (time, space) needed to solve them. The hierarchy:

- **L**: logarithmic space.
- **P**: polynomial time. Tractable.
- **NP**: polynomial verification. See [[p-vs-np]].
- **PSPACE**: polynomial space.
- **EXP**: exponential time.
- **R**: decidable.
- **RE**: recursively enumerable (decidable + halting problem).

Inclusions known: $L \subseteq P \subseteq NP \subseteq PSPACE \subseteq EXP$.

Most "natural" problems we encounter daily are in P. Optimization problems often land in NP-complete or NP-hard. Halting problem is undecidable (not in R).

<!-- tier:undergrad -->
# Complexity Classes (Undergrad)

## Why classes matter

Knowing a problem's complexity class tells you what's possible:
- In P: write the algorithm, ship it.
- NP-complete: use approximation, randomization, or accept exponential.
- PSPACE-complete: even harder; rare in practice.
- Undecidable: no algorithm exists. Period.

## Sample problems

- **In P**: shortest path, max-flow, primality testing (since AKS 2002), linear programming.
- **NP-complete**: SAT, graph coloring, traveling salesman, knapsack, vertex cover.
- **PSPACE-complete**: generalized chess, generalized go (with appropriate rules), regular expression matching with backreferences.
- **EXP-complete**: presburger arithmetic.
- **Undecidable**: halting problem, equivalence of context-free grammars, post correspondence problem.

The boundary between P and NP-complete is what most algorithm-design effort focuses on.

## Hardness and reductions

A problem $A$ is **hard for class C** if every problem in $C$ reduces to $A$ in polynomial time. **Reductions** are the proof technique: to show $A$ is NP-hard, show that some known NP-hard problem reduces to $A$.

The collection of NP-complete problems started with SAT (Cook-Levin 1971) + 21 problems (Karp 1972). Today there are thousands of known NP-complete problems, all interreducible.
