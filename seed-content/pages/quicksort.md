---
title: Quicksort
category: algorithms
---
<!-- tier:intro -->
# Quicksort

Quicksort is the workhorse of in-memory sorting. Average $O(n \log n)$, worst $O(n^2)$ (rare with randomized pivot), in-place ($O(\log n)$ recursion stack), generally fastest in practice.

The recipe: pick a **pivot**, partition the array into "less-than-pivot" + "greater-than-pivot," recursively sort each side.

The cleverness: partitioning can be done in-place in linear time (Lomuto + Hoare partitioning schemes).

<!-- tier:undergrad -->
# Quicksort (Undergrad)

## The algorithm

```
quicksort(A, lo, hi):
  if lo < hi:
    p = partition(A, lo, hi)
    quicksort(A, lo, p-1)
    quicksort(A, p+1, hi)
```

The `partition` function: pick pivot value $v$. Walk the array, swap elements so all $\leq v$ are to the left of $v$ and all $> v$ are to the right. Return $v$'s final index.

## Why it's fast in practice

- **Cache-friendly**: sequential access through the array.
- **In-place**: no auxiliary memory.
- **Branch-friendly**: modern CPUs predict the comparison branches well.

## Pivot choice matters

- **Always-first**: $O(n^2)$ on already-sorted input. Bad.
- **Random pivot**: expected $O(n \log n)$ for any input. Good.
- **Median-of-3** (first, middle, last): better cache behavior than random; nearly always $O(n \log n)$.
- **Median-of-medians** (Blum 1973): $O(n \log n)$ worst case. Rarely worth the constant overhead.

Production code (e.g., Java's `Arrays.sort`) uses dual-pivot quicksort + introspective fallback to heapsort if recursion gets too deep.

## Worst case

Quicksort's $O(n^2)$ worst case happens when the pivot is always the smallest or largest element. With random pivots, this has probability $1/2^n$ — astronomically unlikely for large $n$, but a concern for adversarial inputs.

The hardening: introsort (introspective sort) tracks recursion depth; switches to heapsort when depth exceeds $2 \log n$. Guarantees $O(n \log n)$ worst-case while keeping quicksort's typical-case speed.

<!-- tier:grad -->
# Quicksort (Grad)

## Hoare vs Lomuto partition

Two classic partition schemes:
- **Hoare's** (1962): two pointers move toward each other, swap when both find an element on the wrong side. Slightly fewer swaps; trickier to implement correctly.
- **Lomuto's** (Bentley 1986): single pass; simpler, slightly more swaps.

In practice, Hoare's wins by ~10-20% on random input. Lomuto is taught more often because the invariant is easier to state.

## Three-way partitioning

For arrays with many duplicates, classical quicksort spends time recursing on equal-key sub-arrays. **Dutch national flag** partitioning (Dijkstra) splits into THREE regions: $<v$, $=v$, $>v$. Recurses only on the unequal regions. Speedup is significant when keys have many duplicates.

## In-memory vs external

Quicksort is for arrays that fit in memory. For data that doesn't fit (terabytes), use **external mergesort** — sort sub-arrays that fit in memory, then merge from disk. Quicksort's random access pattern is hostile to disk.
