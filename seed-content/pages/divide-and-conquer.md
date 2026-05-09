---
title: Divide and Conquer
category: algorithms
---
<!-- tier:intro -->
# Divide and Conquer

A problem-solving pattern: **divide** the problem into smaller sub-problems, **conquer** each recursively, **combine** sub-solutions into the answer.

Most famous examples: mergesort, quicksort, FFT, Strassen's matrix multiplication, Karatsuba multiplication, closest-pair-of-points.

The complexity is given by the **master theorem**: for $T(n) = aT(n/b) + f(n)$, three cases based on how $f(n)$ compares to $n^{\log_b a}$.

<!-- tier:undergrad -->
# Divide and Conquer (Undergrad)

## Master theorem

For $T(n) = aT(n/b) + f(n)$:

- **Case 1**: if $f(n) = O(n^c)$ where $c < \log_b a$, then $T(n) = \Theta(n^{\log_b a})$.
- **Case 2**: if $f(n) = \Theta(n^{\log_b a} \log^k n)$, then $T(n) = \Theta(n^{\log_b a} \log^{k+1} n)$.
- **Case 3**: if $f(n) = \Omega(n^c)$ where $c > \log_b a$ (with regularity), then $T(n) = \Theta(f(n))$.

Examples:
- Mergesort: $T(n) = 2T(n/2) + O(n)$. Case 2 with $k = 0$. $T(n) = O(n \log n)$.
- Binary search: $T(n) = T(n/2) + O(1)$. Case 2 with $k = 0$. $T(n) = O(\log n)$.
- Strassen's matmul: $T(n) = 7T(n/2) + O(n^2)$. Case 1. $T(n) = O(n^{\log_2 7}) \approx O(n^{2.81})$.
- Karatsuba: $T(n) = 3T(n/2) + O(n)$. Case 1. $T(n) = O(n^{\log_2 3}) \approx O(n^{1.58})$.

## Why it's faster than naive

Standard matrix multiplication is $O(n^3)$. Strassen's clever combination of 7 sub-multiplications instead of 8 turns the recurrence's $a$ from 8 to 7, beating $n^3$ asymptotically.

Multiplication of large integers: schoolbook is $O(n^2)$. Karatsuba's clever combination of 3 sub-multiplications instead of 4 gives $O(n^{1.58})$. Toom-Cook generalizes; FFT-based multiplication achieves $O(n \log n \log \log n)$.

## When divide-and-conquer is the right framing

- Sub-problems are independent (don't share state).
- The combine step is cheap (linear or sub-linear).
- Divisions reduce the problem size by a constant factor (otherwise no recursion benefit).

Doesn't help when the problem has overlapping subproblems — that's [[dynamic-programming]] territory.

## In ML

- **Distributed training**: data-parallel SGD is divide-and-conquer (split batch across workers, combine gradients).
- **Tree algorithms**: random forests build many trees in parallel (divide), aggregate predictions (combine).
- **MCTS**: decompose value at a state into values at children + combine. Recursive divide-and-conquer over the game tree.
