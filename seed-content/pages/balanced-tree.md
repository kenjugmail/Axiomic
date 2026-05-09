---
title: Balanced Trees
category: algorithms
---
<!-- tier:intro -->
# Balanced Trees

A **balanced binary search tree** maintains $O(\log n)$ tree height through structural rebalancing on insert/delete. Without balance, BSTs degenerate to linked lists ([[binary-search-tree]]) on sorted input.

**AVL trees**, **red-black trees**, and **B-trees** are the dominant balanced-tree variants. Each maintains balance via different invariants + rotations.

<!-- tier:undergrad -->
# Balanced Trees (Undergrad)

## AVL tree (Adelson-Velsky-Landis 1962)

Strictest balance: for every node, the heights of its two subtrees differ by at most 1.

- Lookups: faster than red-black (smaller depth).
- Insertions: slower (more frequent rotations to maintain the strict invariant).

Used when reads dominate writes.

## Red-black tree

Looser balance: nodes are colored red or black, with rules ensuring the longest root-to-leaf path is at most 2× the shortest. Translates to height $\leq 2 \log n$.

- Lookups: slightly slower than AVL.
- Insertions: faster (fewer rotations on average).

Used when writes are common. Linux kernel, Java TreeMap, C++ `std::map`, Python `sortedcontainers.SortedDict`.

## B-tree

Multi-way variant: each node has $b$ children (typically 16-256). Designed for disk-resident data — each node fits in a disk block (or page).

For databases: a B-tree of depth 3 indexes billions of rows since fanout is high. Reading 3 disk pages to find a row is the workhorse pattern.

Variants: B+-tree (data only in leaves), B*-tree (higher fill factor). Postgres + MySQL use B+-tree variants for indexes.

## Treaps + skip lists

Probabilistic balance:
- **Treap**: each node has a key + a randomly assigned priority. Heap-ordered by priority + BST-ordered by key. Maintained via rotations. Expected $O(\log n)$ depth.
- **Skip list**: linked-list with random "express lanes" at multiple levels. Expected $O(\log n)$ search. Concurrent-friendly; used in LevelDB, Redis sorted sets.

Both achieve $O(\log n)$ in expectation without complex rotation logic.
