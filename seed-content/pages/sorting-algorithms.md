---
title: Sorting Algorithms
category: algorithms
---
<!-- tier:intro -->
# Sorting Algorithms

Sorting is the canonical algorithm-design problem — every introductory course covers it because it surfaces every key idea (divide-and-conquer, comparison-based vs not, in-place vs not, stable vs not, asymptotic analysis).

The headline result: **comparison-based sorting has an $\Omega(n \log n)$ lower bound**. Mergesort + heapsort hit it. Quicksort hits it on average. Linear-time sorts (radix, counting, bucket) escape this only by exploiting input structure (integer keys).

<!-- tier:undergrad -->
# Sorting Algorithms (Undergrad)

## The classics

| Algorithm | Avg | Worst | Space | Stable | Notes |
|-----------|-----|-------|-------|--------|-------|
| Bubble sort | $O(n^2)$ | $O(n^2)$ | $O(1)$ | yes | Pedagogical only |
| Selection sort | $O(n^2)$ | $O(n^2)$ | $O(1)$ | no | Few writes; useful when writes are expensive |
| Insertion sort | $O(n^2)$ | $O(n^2)$ | $O(1)$ | yes | Excellent for small or nearly-sorted input |
| **Mergesort** | $O(n \log n)$ | $O(n \log n)$ | $O(n)$ | yes | The default external-sort choice |
| **Quicksort** | $O(n \log n)$ | $O(n^2)$ | $O(\log n)$ | no | The default in-memory choice |
| **Heapsort** | $O(n \log n)$ | $O(n \log n)$ | $O(1)$ | no | Guaranteed worst-case + in-place |
| Radix sort | $O(nk)$ | $O(nk)$ | $O(n+k)$ | yes | Linear time for fixed-width keys |
| Counting sort | $O(n+k)$ | $O(n+k)$ | $O(k)$ | yes | Only for small key range |
| Tim sort | $O(n \log n)$ | $O(n \log n)$ | $O(n)$ | yes | Hybrid; Python + Java default |

## Stability

A sort is **stable** if equal keys preserve their original relative order. Matters when sorting by multiple criteria sequentially: sort by zip code (stable), then sort by city → results are correctly ordered within city.

## In-place

An **in-place** sort uses O(1) or O(log n) extra memory. Heapsort is in-place; mergesort is not (needs O(n) auxiliary). For huge arrays, this matters.

## Lower bound

**Decision tree argument**: any comparison-based sorting algorithm corresponds to a decision tree where leaves are permutations. With $n!$ leaves, depth ≥ $\log(n!) = \Theta(n \log n)$. So ANY comparison-based sort needs $\Omega(n \log n)$ comparisons in the worst case.

This bound doesn't apply to non-comparison sorts (radix, counting). Those exploit the structure of integer keys.

<!-- tier:grad -->
# Sorting Algorithms (Grad)

## Production reality

- **Python's `sorted()`** uses **Timsort** (Tim Peters 2002): hybrid of mergesort + insertion sort. Detects already-sorted runs.
- **Java's `Arrays.sort()`**: dual-pivot quicksort for primitives, Timsort for objects.
- **C++'s `std::sort`**: introsort (quicksort that switches to heapsort on bad pivots).
- **Postgres B-tree**: external mergesort variant.

The choice of sort algorithm in production rarely matters at the algorithmic level — pick whatever the library gives you. What matters: comparison cost (using long string comparators, Unicode normalization, etc.) and memory access pattern (cache-friendly = practical speedup).

## Parallel + distributed sorts

For huge data: **external mergesort** (writes runs to disk, merges them) and **distributed sort** (Spark, Hadoop, MapReduce). Performance dominated by disk/network bandwidth, not CPU.

For GPU sorting: radix sort dominates because of its bandwidth-friendly access pattern. CUB + Thrust (NVIDIA) implement it.

## Sorting + ML

Sorting underlies many ML operations: top-k selection (softmax + top-k), nearest-neighbor search (FAISS uses sorted distance arrays), beam search (heap of partial sequences), priority sampling. Optimizing these often comes down to picking the right sorting variant for the access pattern.
