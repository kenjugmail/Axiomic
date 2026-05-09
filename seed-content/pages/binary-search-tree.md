---
title: Binary Search Tree
category: algorithms
---
<!-- tier:intro -->
# Binary Search Tree (BST)

A **binary search tree** maintains the invariant: for every node, all keys in the left subtree are less, all keys in the right subtree are greater. Average $O(\log n)$ insert, lookup, delete; worst $O(n)$ (degenerate to a linked list with sorted input).

The fix for the worst case: **balanced BSTs** ([[balanced-tree]]) — AVL, red-black, B-tree variants — guarantee $O(\log n)$ regardless of insertion order.

<!-- tier:undergrad -->
# Binary Search Tree (Undergrad)

## Operations

- **Lookup**: walk the tree comparing key. Go left if smaller, right if larger.
- **Insert**: walk to find the right leaf position, attach the new node.
- **Delete**: complex — three cases based on number of children.
- **In-order traversal**: visits keys in sorted order. Useful for range queries.

## Why unbalanced

Insertion order matters. Insert sorted input → degenerate to a list. Insert random input → expected $\log n$ depth. Without rebalancing, adversarial input destroys performance.

## Balanced variants

- **AVL trees**: strictest balance ($\Delta \leq 1$ between subtree heights). Faster lookups, slower insertions.
- **Red-black trees**: looser balance ($\Delta \leq 2 \log n$). Faster insertions. Used by Linux kernel, Java TreeMap, C++ map.
- **B-trees**: each node has $b$ children. Designed for disk-resident data (each node is a disk block). Used by every database.
- **Splay trees**: amortized $O(\log n)$; recently-accessed items move toward root. Good for caches.

## Why use a BST when hashing exists?

Hash tables are O(1) average lookup but:
- **Don't support range queries** (hash buckets are random with respect to key order).
- **Don't support sorted iteration** without a separate sort.
- **Have worst-case O(n) lookup** under adversarial input.

For ordered data + range queries, BSTs are the right tool. Database B-tree indexes are the dominant use case.
