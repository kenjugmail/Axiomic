---
title: Mergesort
category: algorithms
---
<!-- tier:intro -->
# Mergesort

Mergesort is the canonical $O(n \log n)$ comparison-based sort: divide the array in half, sort each half recursively, merge the sorted halves.

Stable, deterministic worst-case $O(n \log n)$, but requires $O(n)$ auxiliary memory for the merge step (so not in-place). The default choice when stability + worst-case bounds matter; the underlying algorithm for **external sort** (data too big for memory).

<!-- tier:undergrad -->
# Mergesort (Undergrad)

## The algorithm

```
mergesort(A, lo, hi):
  if lo < hi:
    mid = (lo + hi) / 2
    mergesort(A, lo, mid)
    mergesort(A, mid+1, hi)
    merge(A, lo, mid, hi)
```

The `merge` function: take two sorted sub-arrays, walk both with pointers, copy the smaller front element to output. $O(n)$ time, $O(n)$ aux space.

## Recurrence

$T(n) = 2T(n/2) + O(n)$, which solves to $T(n) = O(n \log n)$ via the master theorem.

The depth of recursion is $\log n$; each level does $O(n)$ work merging. Total: $O(n \log n)$. Worst-case = average-case = best-case.

## Why it's stable

When merging, ties go to the left sub-array first (preserve original order). Since left = first in the original input, equal keys preserve relative order.

## External sort

For data too big to fit in memory:
1. Read chunks that fit into RAM, sort each in-memory (using e.g. quicksort).
2. Write sorted chunks to disk.
3. Multi-way merge: simultaneously read fronts of all chunks; emit smallest; refill from that chunk.

This is mergesort scaled: the merge operation works equally well on disk-backed sorted runs. Used by every database engine for sort-based query operations.

## In ML

Used implicitly anywhere big-data sorting matters — Spark + Hadoop sort phases, distributed-data preprocessing, dataset shuffling for training.
