---
title: P vs NP
category: algorithms
---
<!-- tier:intro -->
# P vs NP

The most famous open problem in computer science. **Does P = NP?**

- **P**: problems solvable in polynomial time on a deterministic machine.
- **NP**: problems whose solutions are *verifiable* in polynomial time. Equivalently: solvable in polynomial time on a *nondeterministic* machine.

P ⊆ NP trivially (a deterministic algorithm is a nondeterministic one that doesn't use the nondeterminism). Whether NP ⊆ P is open.

If P = NP, every problem whose solutions are easy to check would also be easy to find — including factoring, theorem proving, drug discovery, optimal scheduling, traveling salesman. Cryptography (currently relying on hardness of factoring) would collapse.

Most computer scientists believe P ≠ NP. No proof either way.

<!-- tier:undergrad -->
# P vs NP (Undergrad)

## What "polynomial time" means

A problem is in P if it has an algorithm running in $O(n^k)$ time for some constant $k$. The constant matters — $O(n^{100})$ is in P but useless practically. P is the *theoretical* tractability class.

Most "natural" P problems are in $O(n^3)$ or better.

## What NP-complete means

A problem is **NP-complete** if:
1. It's in NP.
2. Every problem in NP reduces to it in polynomial time.

If you find a polynomial-time algorithm for ANY NP-complete problem, you've solved P = NP and earned a $1M Clay prize.

Cook + Levin (1971) proved SAT (Boolean satisfiability) is NP-complete. Karp (1972) showed 21 other natural problems are NP-complete via reductions from SAT — including 3-SAT, vertex cover, Hamiltonian path, traveling salesman, and others.

The cookbook: prove a new problem NP-complete by reducing a known NP-complete problem to it.

## Why we believe P ≠ NP

No proof, but:
- 50+ years of intense effort by the smartest minds in CS.
- Many natural problems are NP-complete; if any were in P, all would be.
- All known approaches to proving P = NP (algebraic methods, pseudorandomness, etc.) hit the "natural proofs" barrier (Razborov-Rudich 1994).

If you have a polynomial algorithm for SAT and it's correct, you'll be famous.

## Practical implications

For NP-complete problems, accept that exact solutions are intractable for large inputs. The toolkit:
- **Approximation algorithms** with provable bounds.
- **Heuristics** (no guarantees, often work).
- **Randomized algorithms** (probabilistic guarantees).
- **Fixed-parameter tractable (FPT)** algorithms (polynomial in $n$, exponential in some parameter).
- **Special-case algorithms** (some inputs admit polynomial algorithms).

<!-- tier:grad -->
# P vs NP (Grad)

## Beyond P + NP

The complexity hierarchy is rich:
- **L**: logspace.
- **NL**: nondeterministic logspace.
- **P**: polynomial time.
- **NP**: polynomial verification.
- **PH**: polynomial hierarchy. NP^NP, NP^NP^NP, etc.
- **PSPACE**: polynomial space.
- **EXP**: exponential time.

Open: P ⊊ PSPACE? L ⊊ P? Most are believed strict but unproven.

## NP-hard vs NP-complete

- **NP-complete** = in NP + NP-hard.
- **NP-hard** = at least as hard as the hardest NP problem (every NP problem reduces to it).

Some problems are NP-hard but not NP (e.g., halting problem isn't even decidable, much less in NP). For practical purposes, NP-hard is "no known polynomial algorithm + believed impossible."

## P vs NP and AI

If P = NP:
- Every machine-learning task with verifiable optimal solutions becomes trivially solvable.
- Theorem proving becomes automatic.
- Cryptography (asymmetric, signatures) breaks.

The fact that current AI systems (GPT-class) can do tasks NP-hard at the worst case (theorem proving, planning) tells us NOT that P = NP, but that real-world instances of NP-hard problems often have structure that makes them easier than worst-case. Heuristic approaches + scale exploit this structure.
