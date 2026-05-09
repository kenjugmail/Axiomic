---
title: Big-O Notation
category: algorithms
---
<!-- tier:intro -->
# Big-O Notation

**Big-O** is the language for talking about how an algorithm's resource usage scales with input size. We say an algorithm is $O(n^2)$ if its runtime grows at most quadratically with $n$.

Three siblings:
- **Big-O** ($O$): upper bound. "At most this fast-growing."
- **Big-Omega** ($\Omega$): lower bound. "At least this fast-growing."
- **Big-Theta** ($\Theta$): tight bound. "Exactly this fast-growing, up to constants."

Most everyday usage conflates these — when people say "binary search is O(log n)," they usually mean $\Theta(\log n)$.

<!-- tier:undergrad -->
# Big-O Notation (Undergrad)

## Formal definition

$f(n) = O(g(n))$ iff $\exists c > 0, n_0$ such that $f(n) \leq c \cdot g(n)$ for all $n \geq n_0$.

Translation: beyond some threshold input size, $f$ is bounded above by a constant multiple of $g$. Constants and lower-order terms are ignored.

So $5n^2 + 100n + 1000 = O(n^2)$. The $5$ doesn't matter; the $100n$ and $1000$ are dwarfed for large $n$.

## Common growth orders

| Class | Name | Example |
|-------|------|---------|
| $O(1)$ | Constant | Hash-table lookup |
| $O(\log n)$ | Logarithmic | Binary search |
| $O(n)$ | Linear | Single-pass scan |
| $O(n \log n)$ | Linearithmic | Mergesort, heapsort |
| $O(n^2)$ | Quadratic | Selection sort, naive matrix-mult |
| $O(n^3)$ | Cubic | Standard matrix-mult |
| $O(2^n)$ | Exponential | Naive recursive Fibonacci |
| $O(n!)$ | Factorial | Brute-force traveling salesman |

## What Big-O hides

**Constants**: $1000n$ and $0.01n$ are both $O(n)$, but the $1000n$ algorithm is 100,000× slower in practice. For small inputs, constants dominate.

**Lower-order terms**: $n^2 + n$ is $O(n^2)$, but for $n = 10$ the $n$ term is 10% of the total.

**Real-world performance**: cache effects, branch prediction, memory bandwidth often matter MORE than asymptotic class for moderate inputs.

The right framing: Big-O tells you what *eventually* matters. For ship-it-tomorrow code, profile first.

<!-- tier:grad -->
# Big-O Notation (Grad)

## Beyond worst-case

Big-O is typically worst-case. **Average-case**, **amortized**, and **expected** complexity tell different stories:

- **Quicksort** has worst-case $O(n^2)$ but expected $O(n \log n)$ on random input. The randomization makes the expected case the typical case.
- **Hash tables** have worst-case $O(n)$ insert/lookup (all items collide), expected $O(1)$ under uniform hashing assumption.
- **Dynamic arrays** have $O(n)$ worst-case insert (when reallocating), $O(1)$ amortized.

For production systems, average case + tail latency (p99) usually matter more than worst-case.

## Lower bounds

Big-Omega lower bounds are powerful but rare. The $\Omega(n \log n)$ lower bound for comparison-based sorting (decision-tree argument) tells us mergesort/heapsort are asymptotically optimal — no comparison-based sort can do better.

Linear-time sorts (radix, counting, bucket) escape this only because they don't compare keys; they exploit the structure of integer keys.

## Practical hierarchy

For typical input sizes:
- $n \leq 10^6$: $O(n)$ is fine; $O(n \log n)$ is fine; $O(n^2)$ is borderline.
- $n \leq 10^8$: only $O(n)$ or $O(n \log n)$ are practical.
- $n \leq 10^{18}$: only $O(\log n)$ or $O(1)$ work.

For $O(2^n)$: $n = 30$ is at the edge; $n = 50$ is intractable.

## Connection to complexity classes

Big-O describes algorithm runtime. Complexity classes describe problem difficulty:
- **P**: solvable in polynomial time on a deterministic machine.
- **NP**: solutions verifiable in polynomial time.
- **NP-complete**: hardest problems in NP; no known polynomial algorithm.

A problem in P has SOME $O(n^k)$ algorithm; an NP-complete problem has none known. See [[p-vs-np]].
